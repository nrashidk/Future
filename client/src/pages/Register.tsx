import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, ArrowLeft } from "lucide-react";

// INTERSTITIAL, NOT A FORM AND NOT A REDIRECT. /register used to create a
// plain free account; the free tier is retired
// (docs/free-tier-retirement-recon.md §2) and POST /api/register refuses
// unconditionally now (server/auth.ts). A bare 404 here would treat a stale
// bookmark or an old emailed link as the visitor's fault, and a silent
// redirect to /register/parent — a form that asks for a child's details and
// leads to payment — would be a bait-and-switch even though unintentional.
// This says plainly what changed and links forward instead.
export default function Register() {
  const { t } = useTranslation("auth");
  const { language, setLanguage } = useLanguage();

  useEffect(() => { document.title = `${t("register.pageTitle")} | ${t("appName")}`; }, [t]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="absolute top-4 end-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          data-testid="button-language-toggle-register"
          aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}
        >
          {language === "en" ? "العربية" : "English"}
        </Button>
      </div>
      <Card className="w-full max-w-md" data-testid="card-register">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <GraduationCap className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t("register.retiredTitle")}</CardTitle>
          <CardDescription>{t("register.retiredBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full min-h-[44px]" data-testid="button-register-parent">
            <Link href="/register/parent">{t("register.retiredCta")}</Link>
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t("register.alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
              {t("register.signIn")}
            </Link>
          </p>
          <Button variant="ghost" asChild data-testid="link-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 me-2" />
              {t("register.backHome")}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
