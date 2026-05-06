import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: localStorage.getItem("fp_language") || "en",
    fallbackLng: "en",
    supportedLngs: ["en", "ar"],
    defaultNS: "common",
    ns: ["common", "landing", "assessment", "results", "auth", "admin", "riasec"],
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
