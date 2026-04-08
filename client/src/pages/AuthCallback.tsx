import { useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap } from "lucide-react";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => { document.title = "Signing In | Future Pathways"; }, []);

  useEffect(() => {
    const migrateAndRedirect = async () => {
      try {
        // Retry fetching current user with exponential backoff to handle session race conditions
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

        // Check if there are guest assessments to migrate
        const guestAssessmentIds = JSON.parse(localStorage.getItem("guestAssessments") || "[]");
        const guestSessionId = localStorage.getItem("guestSessionId");

        if (guestAssessmentIds.length > 0 && guestSessionId) {
          const resultRes = await apiRequest("POST", "/api/assessments/migrate", {
            guestAssessmentIds,
            guestSessionId
          });
          const result = await resultRes.json();

          if (result) {
            toast({
              title: "Welcome!",
              description: "Your assessment has been saved to your account.",
            });
            localStorage.removeItem("guestAssessments");
            localStorage.removeItem("guestSessionId");
          }
        }

        // Redirect based on user role
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
  }, [setLocation, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="text-center">
        <GraduationCap className="w-16 h-16 text-primary mx-auto mb-4 animate-pulse" />
        <p className="text-lg text-muted-foreground">Completing sign-in...</p>
      </div>
    </div>
  );
}
