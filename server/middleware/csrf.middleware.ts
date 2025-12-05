import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

declare global {
  namespace Express {
    interface Request {
      csrfToken?: string;
    }
  }
}

function generateToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  
  if (!cookieToken) {
    const newToken = generateToken();
    res.cookie(CSRF_COOKIE_NAME, newToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    });
    req.csrfToken = newToken;
  } else {
    req.csrfToken = cookieToken;
  }
  
  next();
}

export function validateCsrf(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  
  if (safeMethods.includes(req.method)) {
    return next();
  }
  
  // Exempt authentication and webhooks from CSRF
  // Webhooks are exempt because they use their own signature verification
  // Login endpoints exempt as they establish the session (no prior CSRF token)
  const exemptPaths = [
    "/api/callback",
    "/api/webhook", // Stripe webhooks use signature verification instead
    "/api/login",
    "/api/login/username",
  ];
  
  if (exemptPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string;
  
  if (!cookieToken || !headerToken) {
    return res.status(403).json({ 
      message: "CSRF token missing",
      code: "CSRF_MISSING"
    });
  }
  
  if (cookieToken !== headerToken) {
    return res.status(403).json({ 
      message: "CSRF token mismatch",
      code: "CSRF_MISMATCH"
    });
  }
  
  next();
}

export function csrfTokenEndpoint(req: Request, res: Response) {
  res.json({ csrfToken: req.csrfToken });
}
