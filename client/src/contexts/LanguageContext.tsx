import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

export type Language = "en" | "ar";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  isRTL: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const { user } = useAuth();

  const getInitialLanguage = (): Language => {
    if (user?.preferredLanguage === "ar" || user?.preferredLanguage === "en") {
      return user.preferredLanguage as Language;
    }
    const stored = localStorage.getItem("fp_language");
    if (stored === "ar" || stored === "en") return stored;
    return "en";
  };

  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const applyLanguage = useCallback((lang: Language) => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    i18n.changeLanguage(lang);
  }, [i18n]);

  useEffect(() => {
    applyLanguage(language);
  }, [language, applyLanguage]);

  useEffect(() => {
    if (user?.preferredLanguage && (user.preferredLanguage === "ar" || user.preferredLanguage === "en")) {
      const serverLang = user.preferredLanguage as Language;
      if (serverLang !== language) {
        setLanguageState(serverLang);
        localStorage.setItem("fp_language", serverLang);
      }
    }
  }, [user?.preferredLanguage]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("fp_language", lang);
    applyLanguage(lang);

    if (user) {
      apiRequest("PATCH", "/api/users/me/language", { language: lang }).catch(() => {});
    }
  }, [user, applyLanguage]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isRTL: language === "ar" }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
