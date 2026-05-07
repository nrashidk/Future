import { useEffect } from "react";
import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PrivacyPolicy() {
  const { t } = useTranslation("legal");
  useEffect(() => { document.title = `${t("privacy.pageTitle")} | Future Pathways`; }, [t]);

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button variant="ghost" asChild className="mb-6" data-testid="button-back">
          <Link href="/">
            <ArrowLeft className="w-4 h-4 me-2" />
            {t("backHome")}
          </Link>
        </Button>

        <div className="space-y-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-2">{t("privacy.title")}</h1>
            <p className="text-muted-foreground font-body">{t("lastUpdated")}</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("privacy.s1Title")}</h2>
            <p className="text-muted-foreground font-body">{t("privacy.s1Body")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("privacy.s2Title")}</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground font-body">
              <li>{t("privacy.s2li1")}</li>
              <li>{t("privacy.s2li2")}</li>
              <li>{t("privacy.s2li3")}</li>
            </ul>
            <p className="text-muted-foreground font-body">{t("privacy.s2note")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("privacy.s3Title")}</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground font-body">
              <li>{t("privacy.s3li1")}</li>
              <li>{t("privacy.s3li2")}</li>
              <li>{t("privacy.s3li3")}</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("privacy.s4Title")}</h2>
            <p className="text-muted-foreground font-body">{t("privacy.s4Body")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("privacy.s5Title")}</h2>
            <p className="text-muted-foreground font-body">{t("privacy.s5Body")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("privacy.s6Title")}</h2>
            <p className="text-muted-foreground font-body">{t("privacy.s6Body")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("privacy.s7Title")}</h2>
            <p className="text-muted-foreground font-body">{t("privacy.s7Body")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("privacy.s8Title")}</h2>
            <p className="text-muted-foreground font-body">{t("privacy.s8Intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground font-body">
              <li>{t("privacy.s8li1")}</li>
              <li>{t("privacy.s8li2")}</li>
              <li>{t("privacy.s8li3")}</li>
            </ul>
            <p className="text-muted-foreground font-body mt-4">{t("privacy.s8Contact")}</p>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
