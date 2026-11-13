/**
 * /confirm-email/:token — where the link in the confirmation mail lands.
 *
 * The page POSTS the token when it loads; the link itself changes nothing
 * (a GET that confirmed would let a mail scanner confirm an address its
 * owner never saw). No sign-in is needed: the parent may open the mail on a
 * different device from the one they registered on.
 */
import { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

type State = "working" | "confirmed" | "expired" | "invalid" | "error";

export default function ConfirmEmail() {
  const { t } = useTranslation("auth");
  const [, params] = useRoute("/confirm-email/:token");
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<State>("working");
  const started = useRef(false);

  useEffect(() => { document.title = t("confirmEmail.page.title"); }, [t]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        // A browser that has never been here has no CSRF cookie yet, and the
        // POST below would be refused before the token was even read.
        await fetch("/api/auth/user", { credentials: "include" }).catch(() => undefined);
        await apiRequest("POST", "/api/email-confirmation/confirm", { token: params?.token ?? "" });
        setState("confirmed");
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      } catch (error) {
        const status = Number(String((error as Error)?.message ?? "").slice(0, 3));
        setState(status === 410 ? "expired" : status === 404 ? "invalid" : "error");
      }
    })();
  }, [params?.token]);

  const ok = state === "confirmed";
  return (
    <PageLayout variant="gradient">
      <div className="container mx-auto flex justify-center px-4 py-16">
        <Card className="w-full max-w-md text-center" data-testid={`card-confirm-email-${state}`}>
          <CardHeader>
            <div className="mb-2 flex justify-center">
              {state === "working" ? (
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              ) : ok ? (
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              ) : (
                <XCircle className="h-12 w-12 text-destructive" />
              )}
            </div>
            <CardTitle className="text-2xl">{t(`confirmEmail.page.${state}Title`)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">{t(`confirmEmail.page.${state}Body`)}</p>
            {state !== "working" && (
              <Button asChild className="w-full" data-testid="button-confirm-email-continue">
                <Link href={isAuthenticated ? "/profile" : "/login"}>
                  {isAuthenticated ? t("confirmEmail.page.toProfile") : t("confirmEmail.page.toSignIn")}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
