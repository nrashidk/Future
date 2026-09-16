/**
 * PARENT-REGISTERS-FOR-CHILD — the individual self-pay route's new front
 * door. docs/parent-registers-scoping.md: the parent creates the account,
 * consents for their named child, and only then pays. This page is what
 * TierSelection's individual button now points at, replacing a direct link
 * to /checkout?students=1 (Checkout.tsx used to create the account itself,
 * as a side effect of a successful charge, with no child identity or
 * consent captured anywhere).
 *
 * ATTESTATION TEXT IS COMPOSED HERE AND POSTED VERBATIM, the same discipline
 * as OrganizationConsentCard.tsx: attestationTextHash on the record pins
 * what this parent actually saw, so it must be assembled from the exact
 * rendered strings, not reconstructed server-side from the same keys.
 */

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, serverErrorMessage } from "@/lib/queryClient";
import { claimGuestAssessments } from "@/lib/claimGuestAssessments";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";

const GRADES = ["grade8", "grade9", "grade10", "grade11", "grade12", "graduated"] as const;

export default function RegisterParent() {
  const { t } = useTranslation("auth");
  const { language, setLanguage } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [guardian, setGuardian] = useState(false);

  const { data: countries = [] } = useQuery<any[]>({ queryKey: ["/api/countries"] });

  const registerParentSchema = z.object({
    email: z.string().email(t("register.validation.emailInvalid")),
    password: z.string()
      .min(8, t("register.validation.passwordMin"))
      .regex(/[A-Z]/, t("resetPassword.validation.uppercase"))
      .regex(/[a-z]/, t("resetPassword.validation.lowercase"))
      .regex(/[0-9]/, t("resetPassword.validation.number")),
    confirmPassword: z.string(),
    firstName: z.string().min(1, t("register.validation.firstNameRequired")),
    lastName: z.string().min(1, t("register.validation.lastNameRequired")),
    child: z.object({
      name: z.string().min(1),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      gender: z.string().min(1),
      grade: z.string().min(1),
      countryId: z.string().min(1),
      curriculum: z.string().min(1),
    }),
  }).refine(data => data.password === data.confirmPassword, {
    message: t("register.validation.passwordsMismatch"),
    path: ["confirmPassword"],
  });

  type RegisterParentForm = z.infer<typeof registerParentSchema>;

  const form = useForm<RegisterParentForm>({
    resolver: zodResolver(registerParentSchema),
    defaultValues: {
      email: "", password: "", confirmPassword: "", firstName: "", lastName: "",
      child: { name: "", dateOfBirth: "", gender: "", grade: "", countryId: "", curriculum: "" },
    },
  });

  const childName = form.watch("child.name") || t("register.firstName");
  const selectedCountryId = form.watch("child.countryId");

  const { data: countryDetails } = useQuery<any>({
    queryKey: ["/api/countries", selectedCountryId],
    enabled: !!selectedCountryId,
  });
  const availableCurricula: string[] = countryDetails?.curricula || [];

  // Composed here and posted verbatim — see the note on attestationTextHash
  // (server/routes/parentRegistration.routes.ts). {{child}} is the name as
  // typed so far, so the exact sentence a parent reads names their own child.
  const attestationText = [
    t("registerParent.consentGuardian", { child: childName }),
    t("registerParent.consentProcessing", { child: childName }),
  ].join("\n");

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterParentForm) => {
      const response = await apiRequest("POST", "/api/register/parent", {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        child: data.child,
        consentsToProcessing: true,
        attestsGuardianRelationship: true,
        attestationText,
        locale: language,
      });
      return response.json();
    },
    onSuccess: async () => {
      // No credentials modal, unlike the old checkout-creates-account path:
      // the parent just set their own password and is already logged in
      // (req.logIn in the endpoint).
      //
      // THE CLAIM, BEFORE PAYMENT. A guest who completed the assessment,
      // then registered here, must not lose that assessment to the 72-hour
      // sweep just because this page used to navigate straight to Checkout
      // without ever running AuthCallback.tsx's claim step — the only other
      // place that call was made. See claimGuestAssessments
      // (client/src/lib) for why this is a shared function and not a second
      // copy of that logic: this is the first of at least two more call
      // sites (Results.tsx's "Create Free Account", Assessment.tsx's guest
      // banner) that will need the identical call once they are repointed at
      // this page as part of retiring the free tier
      // (docs/free-tier-retirement-recon.md §2) — call the helper there too,
      // not localStorage/`/api/assessments/migrate` directly.
      //
      // Run before navigating to Checkout, not after payment: the account
      // and consent already exist before payment (docs/
      // parent-registers-scoping.md), so an abandoned checkout still leaves
      // the guest's report claimed onto the new account rather than losing
      // it a second way.
      const { migratedCount } = await claimGuestAssessments();
      if (migratedCount > 0) {
        toast({
          title: t("callback.migratedTitle"),
          description: t("callback.migratedDesc"),
        });
      }
      setLocation("/checkout?students=1&total=10");
    },
    onError: (error: unknown) => {
      toast({
        title: t("registerParent.errorTitle"),
        description: serverErrorMessage(error) ?? t("registerParent.errorDesc"),
        variant: "destructive",
      });
    },
  });

  const bothAffirmed = processing && guardian;

  const onSubmit = (data: RegisterParentForm) => {
    if (!bothAffirmed) return;
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="absolute top-4 end-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          data-testid="button-language-toggle-register-parent"
          aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}
        >
          {language === "en" ? "العربية" : "English"}
        </Button>
      </div>
      <Card className="w-full max-w-lg" data-testid="card-register-parent">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <GraduationCap className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t("registerParent.title")}</CardTitle>
          <CardDescription>{t("registerParent.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground">{t("registerParent.parentSectionTitle")}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("register.firstName")}</FormLabel>
                      <FormControl><Input {...field} data-testid="input-first-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("register.lastName")}</FormLabel>
                      <FormControl><Input {...field} data-testid="input-last-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("register.email")}</FormLabel>
                    <FormControl><Input type="email" {...field} data-testid="input-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("register.password")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          className="pe-10"
                          {...field}
                          data-testid="input-password"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 end-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? t("register.hidePassword") : t("register.showPassword")}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("register.confirmPassword")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          className="pe-10"
                          {...field}
                          data-testid="input-confirm-password"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 end-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          aria-label={showConfirmPassword ? t("register.hidePassword") : t("register.showPassword")}
                          data-testid="button-toggle-confirm-password"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-4 pt-2 border-t">
                <h3 className="text-sm font-semibold text-muted-foreground pt-4">{t("registerParent.childSectionTitle")}</h3>
                <FormField control={form.control} name="child.name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("registerParent.childName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("registerParent.childNamePlaceholder")} {...field} data-testid="input-child-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="child.dateOfBirth" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("registerParent.childDateOfBirth")}</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-child-dob" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="child.gender" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("registerParent.childGender")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-child-gender">
                            <SelectValue placeholder={t("registerParent.selectGender")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">{t("registerParent.male")}</SelectItem>
                          <SelectItem value="female">{t("registerParent.female")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="child.grade" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("registerParent.childGrade")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-child-grade">
                            <SelectValue placeholder={t("registerParent.selectGrade")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GRADES.map((g) => (
                            <SelectItem key={g} value={g}>{t(`registerParent.${g}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="child.countryId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("registerParent.childCountry")}</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("child.curriculum", "");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-child-country">
                            <SelectValue placeholder={t("registerParent.chooseCountry")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {countries.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.flag ? `${c.flag} ${c.name}` : c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="child.curriculum" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("registerParent.childCurriculum")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCountryId}>
                        <FormControl>
                          <SelectTrigger data-testid="select-child-curriculum">
                            <SelectValue placeholder={t("registerParent.chooseCurriculum")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableCurricula.map((curriculum) => (
                            <SelectItem key={curriculum} value={curriculum}>{curriculum}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <h3 className="text-sm font-semibold text-muted-foreground pt-4">{t("registerParent.consentSectionTitle")}</h3>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent-guardian"
                    checked={guardian}
                    onCheckedChange={(v) => setGuardian(v === true)}
                    className="mt-1"
                    data-testid="checkbox-consent-guardian"
                  />
                  <label htmlFor="consent-guardian" className="text-sm font-body leading-relaxed cursor-pointer">
                    {t("registerParent.consentGuardian", { child: childName })}
                  </label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent-processing"
                    checked={processing}
                    onCheckedChange={(v) => setProcessing(v === true)}
                    className="mt-1"
                    data-testid="checkbox-consent-processing"
                  />
                  <label htmlFor="consent-processing" className="text-sm font-body leading-relaxed cursor-pointer">
                    {t("registerParent.consentProcessing", { child: childName })}{" "}
                    <Link href="/terms" className="text-primary hover:underline font-semibold" data-testid="link-register-parent-terms">
                      {t("registerParent.termsOfUse")}
                    </Link>
                    {" "}
                    <Link href="/privacy" className="text-primary hover:underline font-semibold" data-testid="link-register-parent-privacy">
                      {t("registerParent.privacyPolicy")}
                    </Link>
                  </label>
                </div>
                {!bothAffirmed && (
                  <p className="text-xs text-muted-foreground">{t("registerParent.consentBothRequired")}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full min-h-[44px]"
                disabled={registerMutation.isPending || !bothAffirmed}
                data-testid="button-register-parent"
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {t("registerParent.submitting")}
                  </>
                ) : (
                  t("registerParent.submit")
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t("registerParent.alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("registerParent.signIn")}
            </Link>
          </p>
          <Button variant="ghost" asChild data-testid="link-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 me-2" />
              {t("registerParent.backHome")}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
