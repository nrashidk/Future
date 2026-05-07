import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { GraduationCap, Eye, EyeOff } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function StudentLogin() {
  const { t } = useTranslation("auth");
  useEffect(() => { document.title = `${t("studentLogin.pageTitle")} | Future Pathways`; }, [t]);

  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginSchema = z.object({
    username: z.string().min(1, t("studentLogin.validation.usernameRequired")),
    password: z.string().min(1, t("studentLogin.validation.passwordRequired")),
  });

  type LoginFormData = z.infer<typeof loginSchema>;

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/login/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        queryClient.clear();
        const userResponse = await fetch("/api/auth/user", { credentials: "include" });
        const userData = await userResponse.json();
        
        toast({
          title: t("studentLogin.successTitle"),
          description: t("studentLogin.successDesc"),
        });
        
        if (userData.role === 'superadmin') {
          navigate("/superadmin");
        } else if (userData.role === 'admin' || userData.accountType === 'org_admin') {
          navigate("/admin/organizations");
        } else {
          navigate("/assessment");
        }
      } else {
        const error = await response.json();
        toast({
          title: t("studentLogin.errorTitle"),
          description: error.message || t("studentLogin.errorDesc"),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t("studentLogin.errorTitle"),
        description: t("studentLogin.errorGeneric"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <Card className="w-full max-w-md" data-testid="card-student-login">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <GraduationCap className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t("studentLogin.title")}</CardTitle>
          <CardDescription>{t("studentLogin.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("studentLogin.usernameLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("studentLogin.usernamePlaceholder")}
                        data-testid="input-username"
                        disabled={isLoading}
                        autoComplete="username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("studentLogin.passwordLabel")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder={t("studentLogin.passwordPlaceholder")}
                          className="pe-10"
                          data-testid="input-password"
                          disabled={isLoading}
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 end-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? t("studentLogin.hidePassword") : t("studentLogin.showPassword")}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full min-h-[44px]"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? t("studentLogin.loggingIn") : t("studentLogin.loginButton")}
              </Button>
              
              <div className="text-center">
                <Link href="/forgot-password">
                  <Button variant="ghost" className="text-sm" data-testid="link-forgot-password">
                    {t("studentLogin.forgotPassword")}
                  </Button>
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
          <p>{t("studentLogin.noAccount")}</p>
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            data-testid="link-home"
          >
            {t("studentLogin.backHome")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
