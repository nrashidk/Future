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

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "react-i18next";
import { readReturnTo, withReturnTo } from "@/lib/returnTo";
import { PageLayout } from "@/components/layout/PageLayout";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, serverErrorMessage } from "@/lib/queryClient";
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
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  // Where the visitor entered the funnel from, usually their own report. Read
  // once at mount: wouter's location does not include the query string, and
  // the value must survive the re-renders this form does on every keystroke.
  const [returnTo] = useState(() => readReturnTo(window.location.search));
  // Set only by the two buy buttons that send an unregistered visitor here.
  const [wantsCheckout] = useState(
    () => new URLSearchParams(window.location.search).get("next") === "checkout",
  );
  const { toast } = useToast();

  // SOMEONE ALREADY SIGNED IN HAS NOTHING TO REGISTER. The form would only
  // end in "An account with this email already exists", which is where a
  // signed-in free account pressing Upgrade used to be sent. Decided ONCE,
  // from how they arrived: registering here signs the visitor in too, and
  // that must not trigger this redirect on top of onSuccess's own.
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const arrivedSignedIn = useRef<boolean | null>(null);
  useEffect(() => {
    if (authLoading || arrivedSignedIn.current !== null) return;
    arrivedSignedIn.current = isAuthenticated;
    if (isAuthenticated) {
      setLocation(wantsCheckout ? withReturnTo("/checkout?students=1&total=10", returnTo) : (returnTo ?? "/profile"));
    }
  }, [authLoading, isAuthenticated, wantsCheckout, returnTo, setLocation]);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [guardian, setGuardian] = useState(false);

  const { data: countries = [] } = useQuery<any[]>({ queryKey: ["/api/countries"] });

  const registerParentSchema = z.object({
    email: z.string().email(t("registerParent.validation.emailInvalid")),
    password: z.string()
      .min(8, t("registerParent.validation.passwordMin"))
      .regex(/[A-Z]/, t("resetPassword.validation.uppercase"))
      .regex(/[a-z]/, t("resetPassword.validation.lowercase"))
      .regex(/[0-9]/, t("resetPassword.validation.number")),
    confirmPassword: z.string(),
    firstName: z.string().min(1, t("registerParent.validation.firstNameRequired")),
    lastName: z.string().min(1, t("registerParent.validation.lastNameRequired")),
    child: z.object({
      // EVERY FIELD CARRIES ITS OWN SENTENCE. With none, the validator's
      // built-in English text is what a parent reads -- "String must contain
      // at least 1 character(s)", and on zod 4 the date pattern itself,
      // printed as a regular expression -- in both languages.
      name: z.string().min(1, t("registerParent.validation.childNameRequired")),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("registerParent.validation.childDobRequired")),
      gender: z.string().min(1, t("registerParent.validation.childGenderRequired")),
      grade: z.string().min(1, t("registerParent.validation.childGradeRequired")),
      countryId: z.string().min(1, t("registerParent.validation.childCountryRequired")),
      curriculum: z.string().min(1, t("registerParent.validation.childCurriculumRequired")),
    }),
  }).refine(data => data.password === data.confirmPassword, {
    message: t("registerParent.validation.passwordsMismatch"),
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

  // Placeholder for the consent sentences before a child's name is typed. It
  // must be a phrase that reads correctly in a first-person attestation ("I am
  // my child's parent"), not a field label: the previous fallback was
  // t("registerParent.firstName"), the label of the PARENT's own first-name input,
  // which rendered "I am First Name's parent or legal guardian." The form
  // cannot submit with an empty child name (zod: z.string().min(1)), so this
  // text is never what gets hashed — but it is what a parent reads while
  // deciding whether to tick the box.
  const childName = form.watch("child.name") || t("registerParent.childFallback");
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
    onSuccess: async (result: { confirmationEmailSent?: boolean }) => {
      // The parent just set their own password and is already signed in
      // (req.logIn in the endpoint).
      //
      // THE CLAIM COMES FIRST. A guest who took the assessment and then
      // registered must not lose it to the 72-hour sweep. claimGuestAssessments
      // (client/src/lib) is the one copy of that call.
      const { migratedCount } = await claimGuestAssessments();
      if (migratedCount > 0) {
        toast({
          title: t("callback.migratedTitle"),
          description: t("callback.migratedDesc"),
        });
      }
      toast({
        title: t("registerParent.createdTitle"),
        description: result?.confirmationEmailSent === false
          ? t("registerParent.createdMailFailed")
          : t("registerParent.createdDesc"),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      // REGISTERING NO LONGER LEADS TO PAYMENT (owner, 2026-11-13). Until then
      // this line was an unconditional redirect to Checkout, and an unpaid
      // account could start nothing. An account is free now, and paying is a
      // choice made from the report or the profile. Only a visitor who came
      // here BECAUSE they pressed a buy button (`next=checkout`, set by
      // TierSelection and Checkout) goes on to pay.
      if (wantsCheckout) {
        setLocation(withReturnTo("/checkout?students=1&total=10", returnTo));
        return;
      }
      if (returnTo) {
        setLocation(returnTo);
        return;
      }
      // No stated origin: go to whatever this account now has. An assessment
      // in progress resumes on /assessment; a finished report opens; with
      // neither, /assessment starts the first one.
      try {
        const mine: Array<{ id: string; isCompleted: boolean }> =
          await (await apiRequest("GET", "/api/assessments/my")).json();
        const inProgress = mine.some((a) => !a.isCompleted);
        const finished = mine.find((a) => a.isCompleted);
        if (!inProgress && finished) {
          setLocation(`/results?assessmentId=${finished.id}`);
          return;
        }
      } catch {
        // Fall through to /assessment, which reads the same list itself.
      }
      setLocation("/assessment");
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
    <PageLayout variant="gradient">
      <div className="container mx-auto px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-lg">
          <Button variant="ghost" asChild className="mb-4" data-testid="link-back">
            <Link href={returnTo ?? "/"}>
              <ArrowLeft className="w-4 h-4 me-2" />
              {returnTo ? t("registerParent.backToReport") : t("registerParent.backHome")}
            </Link>
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
                      <FormLabel>{t("registerParent.firstName")}</FormLabel>
                      <FormControl><Input {...field} data-testid="input-first-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("registerParent.lastName")}</FormLabel>
                      <FormControl><Input {...field} data-testid="input-last-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("registerParent.email")}</FormLabel>
                    <FormControl><Input type="email" {...field} data-testid="input-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("registerParent.password")}</FormLabel>
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
                          aria-label={showPassword ? t("registerParent.hidePassword") : t("registerParent.showPassword")}
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
                    <FormLabel>{t("registerParent.confirmPassword")}</FormLabel>
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
                          aria-label={showConfirmPassword ? t("registerParent.hidePassword") : t("registerParent.showPassword")}
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
                  wantsCheckout ? t("registerParent.submitToPayment") : t("registerParent.submit")
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
        </CardFooter>
        </Card>
      </div>
    </PageLayout>
  );
}
