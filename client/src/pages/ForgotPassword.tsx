import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
  const { t } = useTranslation("auth");
  useEffect(() => { document.title = `${t("forgotPassword.pageTitle")} | Future Pathways`; }, [t]);

  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);

  const forgotPasswordSchema = z.object({
    identifier: z.string().min(1, t("forgotPassword.validation.identifierRequired")),
  });

  type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identifier: "" },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: ForgotPasswordForm) => {
      const isEmail = data.identifier.includes("@");
      const payload = isEmail 
        ? { email: data.identifier }
        : { username: data.identifier };
      const response = await apiRequest("POST", "/api/password-reset/request", payload);
      return response.json();
    },
    onSuccess: () => {
      setEmailSent(true);
    },
    onError: (error: any) => {
      toast({
        title: t("forgotPassword.errorTitle"),
        description: error.message || t("forgotPassword.errorDesc"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ForgotPasswordForm) => {
    resetMutation.mutate(data);
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle data-testid="text-email-sent-title">{t("forgotPassword.checkEmailTitle")}</CardTitle>
            <CardDescription>{t("forgotPassword.checkEmailDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              {t("forgotPassword.expiry")}
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => setEmailSent(false)}
                data-testid="button-try-again"
              >
                {t("forgotPassword.tryAnother")}
              </Button>
              <Link href="/login">
                <Button variant="ghost" className="w-full" data-testid="link-back-to-login">
                  <ArrowLeft className="w-4 h-4 me-2" />
                  {t("forgotPassword.backToLogin")}
                </Button>
              </Link>
            </div>
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
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <CardTitle data-testid="text-forgot-password-title">{t("forgotPassword.title")}</CardTitle>
          <CardDescription>{t("forgotPassword.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("forgotPassword.identifierLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("forgotPassword.identifierPlaceholder")}
                        {...field}
                        data-testid="input-identifier"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full min-h-[44px]"
                disabled={resetMutation.isPending}
                data-testid="button-submit-reset"
              >
                {resetMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {t("forgotPassword.sending")}
                  </>
                ) : (
                  t("forgotPassword.sendLink")
                )}
              </Button>

              <div className="text-center">
                <Link href="/login">
                  <Button variant="ghost" className="text-sm" data-testid="link-back-to-login-form">
                    <ArrowLeft className="w-4 h-4 me-1" />
                    {t("forgotPassword.backToLogin")}
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
