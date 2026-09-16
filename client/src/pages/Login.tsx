import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, Mail } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { BsMicrosoft } from "react-icons/bs";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "react-i18next";

interface AuthConfig {
  google: boolean;
  microsoft: boolean;
  local: boolean;
}

export default function Login() {
  const { t } = useTranslation("auth");
  const { language, setLanguage } = useLanguage();
  const [location] = useLocation();
  const [error, setError] = useState<string | null>(null);
  // SEPARATE FROM `error` DELIBERATELY. "No account exists yet" is not a
  // failure — the OAuth round-trip itself worked — so it gets its own state
  // and its own block below rather than sharing the destructive-styled error
  // banner, and it needs a real link (not prose), which that banner has no
  // slot for. See server/auth.ts's upsertOAuthUser for the source of this
  // code (docs/free-tier-retirement-recon.md §2 OAuth sign-up retirement).
  const [noAccountProvider, setNoAccountProvider] = useState<"google" | "microsoft" | null>(null);

  useEffect(() => { document.title = `${t("login.pageTitle")} | ${t("appName")}`; }, [t]);

  const { data: authConfig, isLoading: isAuthConfigLoading, isError: isAuthConfigError } = useQuery<AuthConfig>({
    queryKey: ["/api/auth/config"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      // Checked before the generic failure branches below: a distinct code,
      // not the shared "_failed" one, so it can never be caught by the
      // generic fallback and mislabeled as something breaking. Not live yet
      // — server/auth.ts does not emit these codes until the next commit.
      // Left inert here first on purpose, not landed together with the
      // server change: if the server shipped first, a real user could hit an
      // unrecognized code in the window before the client understood it and
      // fall through to login.errorGeneric ("Login failed"), which is
      // exactly the false claim this two-step order exists to avoid.
      if (errorParam === "google_no_account") {
        setNoAccountProvider("google");
      } else if (errorParam === "microsoft_no_account") {
        setNoAccountProvider("microsoft");
      } else if (errorParam === "google_failed") {
        setError(t("login.errorGoogle"));
      } else if (errorParam === "microsoft_failed") {
        setError(t("login.errorMicrosoft"));
      } else {
        setError(t("login.errorGeneric"));
      }
    }
  }, [t]);

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  const handleMicrosoftLogin = () => {
    window.location.href = "/api/auth/microsoft";
  };

  const hasOAuthOptions = authConfig?.google || authConfig?.microsoft;

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="absolute top-4 end-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          data-testid="button-language-toggle-login"
          aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}
        >
          {language === "en" ? "العربية" : "English"}
        </Button>
      </div>
      <Card className="w-full max-w-md" data-testid="card-login">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <GraduationCap className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center" data-testid="text-error">
              {error}
            </div>
          )}

          {noAccountProvider && (
            <div className="p-3 rounded-md bg-accent text-accent-foreground text-sm text-center space-y-1" data-testid="text-no-account">
              <p>
                {noAccountProvider === "google" ? t("login.noAccountGoogle") : t("login.noAccountMicrosoft")}
              </p>
              <Link href="/register/parent" className="text-primary hover:underline font-medium" data-testid="link-register-parent-from-login">
                {t("login.registerCta")}
              </Link>
            </div>
          )}

          {isAuthConfigLoading && (
            <>
              <Skeleton className="w-full h-12 rounded-md" data-testid="skeleton-oauth" />
              <Skeleton className="w-full h-12 rounded-md" />
            </>
          )}

          {isAuthConfigError && (
            <p className="text-sm text-muted-foreground text-center" data-testid="text-oauth-unavailable">
              {t("login.oauthUnavailable")}
            </p>
          )}

          {authConfig?.google && (
            <Button
              variant="outline"
              className="w-full h-12 text-base gap-3"
              onClick={handleGoogleLogin}
              data-testid="button-google-login"
            >
              <SiGoogle className="h-5 w-5" />
              {t("login.withGoogle")}
            </Button>
          )}
          
          {authConfig?.microsoft && (
            <Button
              variant="outline"
              className="w-full h-12 text-base gap-3"
              onClick={handleMicrosoftLogin}
              data-testid="button-microsoft-login"
            >
              <BsMicrosoft className="h-5 w-5" />
              {t("login.withMicrosoft")}
            </Button>
          )}

          {hasOAuthOptions && (
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">{t("login.or")}</span>
              </div>
            </div>
          )}

          <Button
            variant="secondary"
            className="w-full h-12 text-base gap-3"
            asChild
            data-testid="button-email-login"
          >
            <Link href="/login/student">
              <Mail className="h-5 w-5" />
              {t("login.withEmail")}
            </Link>
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t("login.noAccount")}{" "}
            <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
              {t("login.createOne")}
            </Link>
          </p>
          <p className="text-sm text-muted-foreground">
            {t("login.haveCredentials")}
          </p>
          <Button variant="ghost" asChild data-testid="link-home">
            <Link href="/">{t("login.backHome")}</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
