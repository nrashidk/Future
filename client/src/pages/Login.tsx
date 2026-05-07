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

  useEffect(() => { document.title = `${t("login.pageTitle")} | Future Pathways`; }, [t]);

  const { data: authConfig, isLoading: isAuthConfigLoading, isError: isAuthConfigError } = useQuery<AuthConfig>({
    queryKey: ["/api/auth/config"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      if (errorParam === "google_failed") {
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
