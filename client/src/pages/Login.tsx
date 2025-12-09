import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GraduationCap, Mail } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { BsMicrosoft } from "react-icons/bs";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";

export default function Login() {
  const [location] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      if (errorParam === "google_failed") {
        setError("Google login failed. Please try again.");
      } else if (errorParam === "microsoft_failed") {
        setError("Microsoft login failed. Please try again.");
      } else {
        setError("Login failed. Please try again.");
      }
    }
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  const handleMicrosoftLogin = () => {
    window.location.href = "/api/auth/microsoft";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <Card className="w-full max-w-md" data-testid="card-login">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <GraduationCap className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <CardDescription>
            Sign in to save your progress and access your career results
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center" data-testid="text-error">
              {error}
            </div>
          )}
          
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-3"
            onClick={handleGoogleLogin}
            data-testid="button-google-login"
          >
            <SiGoogle className="h-5 w-5" />
            Continue with Google
          </Button>
          
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-3"
            onClick={handleMicrosoftLogin}
            data-testid="button-microsoft-login"
          >
            <BsMicrosoft className="h-5 w-5" />
            Continue with Microsoft
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            variant="secondary"
            className="w-full h-12 text-base gap-3"
            asChild
            data-testid="button-email-login"
          >
            <Link href="/login/student">
              <Mail className="h-5 w-5" />
              Sign in with Email
            </Link>
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
              Create one
            </Link>
          </p>
          <p className="text-sm text-muted-foreground">
            School student? Use the username and password provided by your school.
          </p>
          <Button
            variant="ghost"
            asChild
            data-testid="link-home"
          >
            <Link href="/">Back to Home</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
