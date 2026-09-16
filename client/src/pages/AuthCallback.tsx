import { useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { claimGuestAssessments } from "@/lib/claimGuestAssessments";
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
        // assessment to the account they just made. It used to live inline
        // here, and until a fix landed it had never actually run: the guard
        // also required `localStorage.getItem("guestSessionId")`, a key no
        // code in this app has ever written, so it was permanently false, the
        // POST was never sent, and the user was redirected to their report as
        // though it had worked — the report still rendered because the guest
        // cookie was still in the browser and still authorized the read, so
        // nothing looked wrong until the cookie expired seven days later and
        // took the report with it.
        //
        // Extracted to claimGuestAssessments (client/src/lib) once a second
        // call site (RegisterParent.tsx) needed the identical behavior — see
        // that file for why copying this inline a second time was the risk
        // being avoided, not tidiness.
        const { hadCandidates, migratedCount } = await claimGuestAssessments();
        if (migratedCount > 0) {
          toast({
            title: t("callback.migratedTitle"),
            description: t("callback.migratedDesc"),
          });
        }

        if (user?.role === "superadmin") {
          setLocation("/admin");
        } else if (hadCandidates) {
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
