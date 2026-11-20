import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * The one language button. Pages with their own header put it LAST in the
 * right-hand group, as the shared Header does, so it is in the same place on
 * every screen. Pages with no header (sign-in, password reset) put it in the
 * top corner with `floating`. The assessment form deliberately has none
 * (owner, 2026-11-16: the language is chosen before starting).
 */
export function LanguageToggle({ floating = false, testId = "button-language-toggle" }: { floating?: boolean; testId?: string }) {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation("common");
  const button = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setLanguage(language === "en" ? "ar" : "en")}
      data-testid={testId}
      aria-label={language === "en" ? t("language.switchToArabic") : t("language.switchToEnglish")}
      className="font-medium min-w-[3rem]"
    >
      {t("language.toggle")}
    </Button>
  );
  return floating ? <div className="absolute top-4 end-4 z-50">{button}</div> : button;
}
