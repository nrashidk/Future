import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { verifyPassword, hashPassword } from "./utils/passwordHash";
import { logger } from "./utils/logger";
import { z } from "zod";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

export function getSession() {
  const sessionTtl = 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
    pruneSessionInterval: 60 * 15, // Prune expired sessions every 15 minutes
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: 'fp_session',
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTtl,
      path: '/',
    },
  });
}

async function upsertOAuthUser(
  provider: string,
  providerId: string,
  email: string,
  firstName: string | undefined,
  lastName: string | undefined,
  profileImageUrl: string | undefined
) {
  const normalizedEmail = email ? email.toLowerCase() : '';
  
  let user = await storage.getUserByOAuthProvider(provider, providerId);
  
  if (!user) {
    const emailUser = normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : null;
    if (emailUser) {
      await storage.updateUser(emailUser.id, {
        oauthProvider: provider,
        oauthProviderId: providerId,
        profileImageUrl: profileImageUrl,
      });
      user = await storage.getUser(emailUser.id);
    } else {
      const superadminEmails = (process.env.SUPERADMIN_EMAILS || "")
        .split(",")
        .map(e => e.trim().toLowerCase())
        .filter(e => e.length > 0);
      
      const role = normalizedEmail && superadminEmails.includes(normalizedEmail) ? "superadmin" : "user";
      
      const newUser = await storage.upsertUser({
        email: normalizedEmail || undefined,
        firstName: firstName,
        lastName: lastName,
        profileImageUrl: profileImageUrl,
        role: role,
        oauthProvider: provider,
        oauthProviderId: providerId,
      });
      
      user = newUser;
    }
  }
  
  if (user) {
    await storage.updateUser(user.id, { lastLoginAt: new Date() });
  }
  
  return user;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const baseUrl = process.env.BASE_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${baseUrl}/api/auth/google/callback`,
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await upsertOAuthUser(
          'google',
          profile.id,
          profile.emails?.[0]?.value || '',
          profile.name?.givenName,
          profile.name?.familyName,
          profile.photos?.[0]?.value
        );
        return done(null, { userId: user?.id, provider: 'google' });
      } catch (error) {
        return done(error as Error);
      }
    }));
  }

  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    passport.use(new MicrosoftStrategy({
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: `${baseUrl}/api/auth/microsoft/callback`,
      scope: ['user.read'],
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const user = await upsertOAuthUser(
          'microsoft',
          profile.id,
          profile.emails?.[0]?.value || '',
          profile.name?.givenName,
          profile.name?.familyName,
          profile.photos?.[0]?.value
        );
        return done(null, { userId: user?.id, provider: 'microsoft' });
      } catch (error) {
        return done(error as Error);
      }
    }));
  }

  passport.use(new LocalStrategy(
    async (username, password, done) => {
      try {
        // Accept email OR username in the username field
        let user = await storage.getUserByUsername(username);
        if (!user) {
          user = await storage.getUserByEmail(username.toLowerCase());
        }
        if (!user || !user.passwordHash) {
          logger.auth("Login failure: user not found", undefined, { username, action: "local_login" });
          return done(null, false, { message: 'Invalid username or password' });
        }

        // OWASP #41: Check if account is temporarily locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          logger.security("Login attempt on locked account", {
            userId: user.id,
            action: "local_login",
            lockedUntil: user.lockedUntil.toISOString(),
          });
          return done(null, false, { message: 'Account temporarily locked due to too many failed login attempts. Please try again later.' });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          // Increment failed attempt counter and lock if threshold reached
          const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
          const lockedUntil = newAttempts >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : null;
          await storage.updateUser(user.id, {
            failedLoginAttempts: newAttempts,
            ...(lockedUntil ? { lockedUntil } : {}),
          });
          logger.auth("Login failure: invalid password", user.id, {
            action: "local_login",
            failedAttempts: newAttempts,
            locked: !!lockedUntil,
          });
          return done(null, false, { message: 'Invalid username or password' });
        }

        // Successful login: reset lockout counters
        await storage.updateUser(user.id, {
          lastLoginAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        });
        logger.auth("Login success", user.id, { action: "local_login" });

        return done(null, {
          userId: user.id,
          username: user.username,
          isLocal: true,
        });
      } catch (error) {
        return done(error);
      }
    }
  ));

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  if (process.env.GOOGLE_CLIENT_ID) {
    app.get("/api/auth/google",
      passport.authenticate("google", { scope: ["profile", "email"] })
    );

    app.get("/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=google_failed" }),
      (req, res) => {
        res.redirect("/auth/callback");
      }
    );
  }

  if (process.env.MICROSOFT_CLIENT_ID) {
    app.get("/api/auth/microsoft",
      passport.authenticate("microsoft", { scope: ["user.read"] })
    );

    app.get("/api/auth/microsoft/callback",
      passport.authenticate("microsoft", { failureRedirect: "/login?error=microsoft_failed" }),
      (req, res) => {
        res.redirect("/auth/callback");
      }
    );
  }

  // Endpoint to check which auth methods are available
  app.get("/api/auth/config", (req, res) => {
    res.json({
      google: !!process.env.GOOGLE_CLIENT_ID,
      microsoft: !!process.env.MICROSOFT_CLIENT_ID,
      local: true
    });
  });

  app.get("/api/login", (req, res) => {
    res.redirect("/login");
  });

  app.get("/api/callback", (req, res) => {
    res.redirect("/auth/callback");
  });

  app.post("/api/login/username", authLimiter, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Internal server error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error("Session regeneration failed:", regenerateErr);
          return res.status(500).json({ message: "Login failed" });
        }
        
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            return res.status(500).json({ message: "Login failed" });
          }
          return res.json({ success: true, user: { username: user.username } });
        });
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });

  // OWASP #38-39: Enforce password complexity and length requirements
  const registerSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
  });

  app.post("/api/register", authLimiter, async (req, res) => {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: result.error.errors[0]?.message || "Invalid input" 
        });
      }

      const { email, password, firstName, lastName } = result.data;
      
      const normalizedEmail = email.toLowerCase();

      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const passwordHash = await hashPassword(password);
      
      const superadminEmails = (process.env.SUPERADMIN_EMAILS || "")
        .split(",")
        .map(e => e.trim().toLowerCase())
        .filter(e => e.length > 0);
      
      const role = superadminEmails.includes(normalizedEmail) ? "superadmin" : "user";

      const user = await storage.upsertUser({
        email: normalizedEmail,
        firstName,
        lastName,
        passwordHash,
        role,
        accountType: "public",
      });

      if (!user) {
        return res.status(500).json({ message: "Failed to create account" });
      }

      req.logIn({ userId: user.id, isLocal: true }, (err) => {
        if (err) {
          return res.status(500).json({ message: "Account created but login failed" });
        }
        logger.auth("Registration success", user.id, { action: "register" });
        return res.json({ success: true, user: { id: user.id, email: user.email } });
      });
    } catch (error) {
      logger.error("Registration error", error instanceof Error ? error : undefined);
      return res.status(500).json({ message: "Registration failed" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};
