import { useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { GraduationCap } from "lucide-react";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation("auth");

  useEffect(() => { document.title = `${t("callback.pageTitle")} | ${t("appName")}`; }, [t]);

  useEffect(() => {
    const migrateAndRedirect = async () => {
      try {
        let user: any = null;
        const delays = [100, 300, 700, 1500];
        for (const delay of delays) {
          await new Promise(resolve => setTimeout(resolve, delay));
          try {
            const userRes = await apiRequest("GET", "/api/auth/user");
            if (userRes.ok) {
              user = await userRes.json();
              break;
            }
          } catch {
            // continue retrying
          }
        }

        if (!user) {
          setLocation("/");
          return;
        }

        // THE CLAIM. This is the only thing that binds a guest's completed
        // assessment to the account they just made, and until now it had never
        // run: the condition here also required
        // `localStorage.getItem("guestSessionId")`, a key that NO code in this
        // app has ever written. It was read here, tested here and removed here,
        // and set nowhere — so the guard was permanently false, the POST was
        // never sent, and the user was redirected to their report as though it
        // had worked. The report still rendered, because the guest cookie was
        // still in the browser and still authorized the read, so nothing looked
        // wrong until the cookie expired seven days later and took the report
        // with it.
        //
        // The session id is gone from this request entirely. The server reads
        // the guest_token cookie, which the browser sends on its own and which
        // this page could never have read — it is httpOnly by design.
        const guestAssessmentIds = JSON.parse(localStorage.getItem("guestAssessments") || "[]");

        // ITS OWN try/catch, and it is load-bearing now that the request is
        // actually sent. apiRequest throws on any non-2xx, and this call CAN
        // legitimately fail: a browser holding ids in localStorage but no
        // guest_token cookie — the cookie lasts 7 days, localStorage does not
        // expire — gets a 400. Without this, that throw would escape to the
        // outer catch and redirect the user to "/" instead of their report,
        // turning a failed claim into a lost report. The claim is best-effort;
        // the redirect below is not.
        if (guestAssessmentIds.length > 0) {
          try {
            const resultRes = await apiRequest("POST", "/api/assessments/migrate", {
              guestAssessmentIds,
            });
            const result = await resultRes.json();

            // Only clear the local id list when the server confirms a claim.
            // Clearing it on any response would discard the ids after a failure,
            // and they are the only record this browser keeps of what the guest
            // did — losing them makes a retry impossible.
            if (result?.migratedCount > 0) {
              toast({
                title: t("callback.migratedTitle"),
                description: t("callback.migratedDesc"),
              });
              localStorage.removeItem("guestAssessments");
            }
          } catch (migrateError) {
            // Deliberately silent to the user. They have just created an account
            // and are on their way to their report; a failed claim does not stop
            // either, and the ids are kept so a later attempt can still work.
            console.error("Guest assessment claim failed:", migrateError);
          }
        }

        if (user?.role === "superadmin") {
          setLocation("/admin");
        } else if (guestAssessmentIds.length > 0) {
          setLocation("/results");
        } else {
          setLocation("/");
        }
      } catch (error) {
        console.error("Migration error:", error);
        setLocation("/");
      }
    };

    migrateAndRedirect();
  }, [setLocation, toast, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="text-center">
        <GraduationCap className="w-16 h-16 text-primary mx-auto mb-4 animate-pulse" />
        <p className="text-lg text-muted-foreground">{t("callback.completing")}</p>
      </div>
    </div>
  );
}
