import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation("legal");
  useEffect(() => { document.title = `${t("notFound.pageTitle")} | Future Pathways`; }, [t]);

  return (
    <main id="main-content" className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center">
          <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-bold mb-2">{t("notFound.title")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("notFound.subtitle")}
          </p>
          <Button asChild data-testid="button-go-home">
            <Link href="/">{t("notFound.goHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
