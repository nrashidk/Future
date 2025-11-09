import { useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap } from "lucide-react";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const migrateAndRedirect = async () => {
      try {
        // Check if there are guest assessments to migrate
        const guestAssessmentIds = JSON.parse(localStorage.getItem("guestAssessments") || "[]");
        const guestSessionId = localStorage.getItem("guestSessionId");
        
        if (guestAssessmentIds.length > 0 && guestSessionId) {
          const result = await apiRequest("/api/assessments/migrate", {
            method: "POST",
            body: JSON.stringify({ guestAssessmentIds, guestSessionId }),
            headers: { "Content-Type": "application/json" },
          });

          if (result) {
            toast({
              title: "Welcome!",
              description: "Your assessment has been saved to your account.",
            });
            localStorage.removeItem("guestAssessments");
            localStorage.removeItem("guestSessionId");
          }
        }
        
        // Redirect to results if there were assessments, otherwise to home
        if (guestAssessmentIds.length > 0) {
          setLocation("/results");
        } else {
          setLocation("/");
        }
      } catch (error) {
        console.error("Migration error:", error);
        setLocation("/");
      }
    };

    // Small delay to ensure auth is complete
    setTimeout(migrateAndRedirect, 500);
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
