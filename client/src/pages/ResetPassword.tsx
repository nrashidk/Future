import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, KeyRound, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";

interface TokenVerifyResponse {
  valid: boolean;
  email?: string;
}

export default function ResetPassword() {
  const { t } = useTranslation("auth");
  useEffect(() => { document.title = `${t("resetPassword.pageTitle")} | Future Pathways`; }, [t]);

  const resetPasswordSchema = z.object({
    newPassword: z.string()
      .min(8, t("resetPassword.validation.passwordMin"))
      .regex(/[A-Z]/, t("resetPassword.validation.uppercase"))
      .regex(/[a-z]/, t("resetPassword.validation.lowercase"))
      .regex(/[0-9]/, t("resetPassword.validation.number")),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: t("resetPassword.validation.mismatch"),
    path: ["confirmPassword"],
  });

  type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  const { data: tokenStatus, isLoading: isVerifying, error: verifyError } = useQuery<TokenVerifyResponse>({
    queryKey: [`/api/password-reset/verify?token=${token}`],
    enabled: !!token,
    retry: false,
  });

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: ResetPasswordForm) => {
      const response = await apiRequest("POST", "/api/password-reset/reset", {
        token,
        newPassword: data.newPassword,
      });
      return response.json();
    },
    onSuccess: () => {
      setResetSuccess(true);
      toast({
        title: t("resetPassword.successToastTitle"),
        description: t("resetPassword.successToastDesc"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("resetPassword.errorTitle"),
        description: error.message || t("resetPassword.errorDesc"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ResetPasswordForm) => {
    resetMutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle data-testid="text-invalid-link">{t("resetPassword.invalidTitle")}</CardTitle>
            <CardDescription>{t("resetPassword.invalidDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button className="w-full" data-testid="button-request-new-link">
                {t("resetPassword.requestNewLink")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">{t("resetPassword.verifying")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (verifyError || !tokenStatus?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle data-testid="text-expired-link">{t("resetPassword.expiredTitle")}</CardTitle>
            <CardDescription>{t("resetPassword.expiredDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/forgot-password">
              <Button className="w-full" data-testid="button-request-new-reset">
                {t("resetPassword.requestNewLink")}
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" className="w-full" data-testid="link-back-to-login-expired">
                <ArrowLeft className="w-4 h-4 me-2" />
                {t("resetPassword.backToLogin")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (resetSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle data-testid="text-password-reset-success">{t("resetPassword.successTitle")}</CardTitle>
            <CardDescription>{t("resetPassword.successDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full" data-testid="button-go-to-login">
                {t("resetPassword.goToLogin")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle data-testid="text-reset-password-title">{t("resetPassword.title")}</CardTitle>
          <CardDescription>{t("resetPassword.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("resetPassword.newPasswordLabel")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder={t("resetPassword.newPasswordPlaceholder")}
                          className="pe-10"
                          {...field}
                          data-testid="input-new-password"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 end-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? t("resetPassword.hidePassword") : t("resetPassword.showPassword")}
                          data-testid="button-toggle-new-password"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("resetPassword.confirmPasswordLabel")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder={t("resetPassword.confirmPasswordPlaceholder")}
                          className="pe-10"
                          {...field}
                          data-testid="input-confirm-password"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 end-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          aria-label={showConfirmPassword ? t("resetPassword.hidePassword") : t("resetPassword.showPassword")}
                          data-testid="button-toggle-confirm-password"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="text-xs text-muted-foreground space-y-1">
                <p>{t("resetPassword.requirements")}</p>
                <ul className="list-disc list-inside">
                  <li>{t("resetPassword.req1")}</li>
                  <li>{t("resetPassword.req2")}</li>
                  <li>{t("resetPassword.req3")}</li>
                  <li>{t("resetPassword.req4")}</li>
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={resetMutation.isPending}
                data-testid="button-reset-password"
              >
                {resetMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {t("resetPassword.resetting")}
                  </>
                ) : (
                  t("resetPassword.resetButton")
                )}
              </Button>

              <div className="text-center">
                <Link href="/login">
                  <Button variant="ghost" className="text-sm" data-testid="link-back-to-login-form">
                    <ArrowLeft className="w-4 h-4 me-1" />
                    {t("resetPassword.backToLogin")}
                  </Button>
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
