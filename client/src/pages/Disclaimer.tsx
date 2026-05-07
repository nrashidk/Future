import { useEffect } from "react";
import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Disclaimer() {
  const { t } = useTranslation("legal");
  useEffect(() => { document.title = `${t("disclaimer.pageTitle")} | Future Pathways`; }, [t]);

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
              <AlertTriangle className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-2">{t("disclaimer.title")}</h1>
            <p className="text-muted-foreground font-body">{t("lastUpdated")}</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("disclaimer.s1Title")}</h2>
            <p className="text-muted-foreground font-body">{t("disclaimer.s1Body")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("disclaimer.s2Title")}</h2>
            <p className="text-muted-foreground font-body">{t("disclaimer.s2Body")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("disclaimer.s3Title")}</h2>
            <p className="text-muted-foreground font-body">{t("disclaimer.s3Body")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("disclaimer.s4Title")}</h2>
            <p className="text-muted-foreground font-body">{t("disclaimer.s4Body")}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">{t("disclaimer.s5Title")}</h2>
            <p className="text-muted-foreground font-body">{t("disclaimer.s5Body")}</p>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
