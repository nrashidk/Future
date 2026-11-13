import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, serverErrorMessage } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertTriangle, GraduationCap, Users, FileSpreadsheet, Eye, EyeOff } from "lucide-react";
import { OrganizationConsentCard, useOrganizationConsent } from "@/components/admin/OrganizationConsentCard";

/**
 * FIRST SIGN-IN AND ONBOARDING for a school bought through group checkout.
 *
 * Reached from the one email the buyer gets. Before this page existed the
 * generated credentials were rendered once on the checkout success screen and
 * sent nowhere, so the only route back in was "Forgot password" — and even
 * then the school had no curriculum, so `schoolSetupGate` refused every
 * enrolment with a 409 the buyer had no way to interpret.
 *
 * THE THREE STEPS ARE NOT COSMETIC. Country and curriculum are exactly what
 * that gate blocks on, so collecting them here PREVENTS the dead end rather
 * than explaining it afterwards. Students are step three and skippable,
 * because a school is operational without them; country and curriculum are
 * not skippable for the same reason.
 *
 * One component, one `step` in state, rather than four routes: the token is
 * spent at step one, so a browser refresh on step two cannot re-fetch it. The
 * flow therefore recovers by reading the signed-in session instead — see
 * `resumeFromSession`.
 */

interface SetupLink {
  username: string;
  firstName: string | null;
  organizationName: string | null;
  totalLicenses: number | null;
  needsCountry: boolean;
  needsCurriculum: boolean;
}

interface ReferenceCountry {
  id: string;
  name: string;
  nameAr?: string | null;
  curricula?: Array<{ name: string }>;
}

/**
 * FOUR STEPS, NOT THREE. The approved mockups had password → country →
 * curriculum → students, which still left the school unable to enrol: there
 * are TWO gates on every enrolment route, not one. `schoolSetupGate` wants
 * country and curriculum; `consentGate` wants the school's recorded
 * attestation that it holds guardian consent for students aged 13-18.
 *
 * Consent cannot be moved elsewhere or supplied for them: it is the school
 * admin's own act, and `POST /api/my-organization/consent` is org_admin-only
 * with NO superadmin path, deliberately — a superadmin asserting that a school
 * holds guardian consent is the fiction that record exists to remove. So an
 * onboarding that omits it hands the buyer a 409 they cannot interpret, which
 * is the exact dead end this flow exists to close.
 *
 * The existing OrganizationConsentCard is reused rather than reimplemented:
 * it posts the rendered wording back verbatim and the record stores its hash,
 * so a second copy of that text here would record consent to wording nobody
 * read.
 */
type Step = "password" | "country" | "curriculum" | "consent" | "people" | "done";

export default function SchoolSetup() {
  const { t } = useTranslation("auth");
  const [, params] = useRoute("/school/setup/:token");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = params?.token ?? "";

  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [countryId, setCountryId] = useState("");
  const [curriculum, setCurriculum] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t("schoolSetup.pageTitle")} | ${t("appName")}`;
  }, [t]);

  const { data: link, isLoading, error } = useQuery<SetupLink>({
    queryKey: [`/api/school/setup/${token}`],
    enabled: !!token,
    retry: false,
  });

  const { data: reference } = useQuery<{ countries: ReferenceCountry[] }>({
    queryKey: ["/api/reference"],
    enabled: step !== "password",
  });

  // Read from the server, never a local boolean: the Continue button must be
  // gated on the RECORD existing, which is what consentGate actually checks.
  const { data: consentRecord } = useOrganizationConsent(step === "consent");
  // The route answers `{ consent: {...} | null, ... }`. This read the two
  // flags off the ENVELOPE, behind an `as any` that hid it from the compiler,
  // so it was false for ever and Continue never enabled: no buyer could get
  // past step three on this screen. Found by the owner pressing it on the
  // first live purchase (2026-11-14); the harness walks this step by API.
  const hasConsent = !!consentRecord?.consent?.consentsToProcessing
    && !!consentRecord?.consent?.attestsGuardianConsent;

  const countries = reference?.countries ?? [];
  const selectedCountry = countries.find((c) => c.id === countryId);
  // The curricula a country actually offers. Read from the reference
  // vocabulary rather than hardcoded here: a school with a curriculum its
  // country does not offer is accepted silently and dead at the first step,
  // which is a bug family this codebase keeps producing.
  const curricula = selectedCountry?.curricula?.map((c) => c.name) ?? [];

  /**
   * After the password is set the user is signed in, so the organisation —
   * and anything already filled in — comes from the session rather than from
   * the spent token.
   */
  const resumeFromSession = async () => {
    const res = await apiRequest("GET", "/api/my-organization");
    const org = await res.json();
    setOrgId(org.id);
    if (org.countryId) setCountryId(org.countryId);
    if (org.curriculum) setCurriculum(org.curriculum);
    return org;
  };

  const setPasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/school/setup/${token}/password`, { password });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      try {
        const org = await resumeFromSession();
        setStep(org.countryId ? (org.curriculum ? "people" : "curriculum") : "country");
      } catch {
        // Signed in but the organisation could not be read. Send them to the
        // dashboard rather than stranding them mid-flow: the account works.
        setLocation("/admin/organizations");
      }
    },
    onError: (err: unknown) => {
      toast({
        title: t("schoolSetup.couldNotSetTitle"),
        description: serverErrorMessage(err) ?? t("schoolSetup.couldNotSetDesc"),
        variant: "destructive",
      });
    },
  });

  const saveOrgMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!orgId) throw new Error("no organization");
      const res = await apiRequest("PATCH", `/api/admin/organizations/${orgId}`, patch);
      return res.json();
    },
    onError: (err: unknown) => {
      toast({
        title: t("schoolSetup.couldNotSaveTitle"),
        description: serverErrorMessage(err) ?? t("schoolSetup.couldNotSaveDesc"),
        variant: "destructive",
      });
    },
  });

  if (!token) return <DeadLink t={t} />;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t("schoolSetup.loading")} />
      </div>
    );
  }

  // A dead link is the expected end state of an old email, not an error: it is
  // rendered as a page with a way forward, never as a toast over a blank form.
  if (error || !link) return <DeadLink t={t} />;

  const schoolName = link.organizationName ?? t("schoolSetup.yourSchool");
  const passwordsMatch = password.length > 0 && password === confirm;
  const longEnough = password.length >= 12;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="font-semibold text-lg">{t("appName")}</span>
          </div>
          <span className="text-sm text-muted-foreground" data-testid="text-setup-school">
            {schoolName}
            {link.firstName ? ` · ${link.firstName}` : ""}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {step !== "password" && step !== "done" && (
          <StepHeader step={step} t={t} />
        )}

        {step === "password" && (
          <Card>
            <CardContent className="pt-8 space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">{t("schoolSetup.choosePasswordTitle")}</h1>
                <p className="text-muted-foreground">
                  {t("schoolSetup.choosePasswordDesc", { school: schoolName, username: link.username })}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setup-password">{t("schoolSetup.newPassword")}</Label>
                <div className="relative">
                  <Input
                    id="setup-password"
                    type={showPassword ? "text" : "password"}
                    className="pe-10"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="input-setup-password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 end-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t("resetPassword.hidePassword") : t("resetPassword.showPassword")}
                    data-testid="button-toggle-setup-password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setup-confirm">{t("schoolSetup.confirmPassword")}</Label>
                <div className="relative">
                  <Input
                    id="setup-confirm"
                    type={showPassword ? "text" : "password"}
                    className="pe-10"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    data-testid="input-setup-confirm"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 end-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t("resetPassword.hidePassword") : t("resetPassword.showPassword")}
                    data-testid="button-toggle-setup-confirm"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <ul className="space-y-2 text-sm text-muted-foreground">
                <Rule met={longEnough} label={t("schoolSetup.ruleLength")} />
                <Rule met={passwordsMatch} label={t("schoolSetup.ruleMatch")} />
              </ul>

              <Button
                className="w-full"
                size="lg"
                disabled={!longEnough || !passwordsMatch || setPasswordMutation.isPending}
                onClick={() => setPasswordMutation.mutate()}
                data-testid="button-setup-password"
              >
                {setPasswordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t("schoolSetup.saveAndContinue")}
              </Button>

              <p className="text-sm text-muted-foreground text-center">
                {t("schoolSetup.confirmsEmail")}
              </p>
            </CardContent>
          </Card>
        )}

        {step === "country" && (
          <Card>
            <CardContent className="pt-8 space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">{t("schoolSetup.countryTitle")}</h1>
                <p className="text-muted-foreground">{t("schoolSetup.countryDesc")}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setup-country">{t("schoolSetup.countryLabel")}</Label>
                <Select value={countryId} onValueChange={(v) => { setCountryId(v); setCurriculum(""); }}>
                  <SelectTrigger id="setup-country" data-testid="select-setup-country">
                    <SelectValue placeholder={t("schoolSetup.countryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Notice icon="info" text={t("schoolSetup.countryNotice")} />

              <div className="flex justify-end">
                <Button
                  size="lg"
                  disabled={!countryId || saveOrgMutation.isPending}
                  onClick={async () => {
                    await saveOrgMutation.mutateAsync({ countryId });
                    setStep("curriculum");
                  }}
                  data-testid="button-setup-country"
                >
                  {saveOrgMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("schoolSetup.continue")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "curriculum" && (
          <Card>
            <CardContent className="pt-8 space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">{t("schoolSetup.curriculumTitle")}</h1>
                <p className="text-muted-foreground">{t("schoolSetup.curriculumDesc")}</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {curricula.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setCurriculum(name)}
                    aria-pressed={curriculum === name}
                    className={`text-start rounded-lg border p-4 min-h-[44px] ${
                      curriculum === name ? "border-primary border-2" : "border-border"
                    }`}
                    data-testid={`button-curriculum-${name.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <span className="font-semibold">{name}</span>
                  </button>
                ))}
              </div>

              <Notice icon="warn" text={t("schoolSetup.curriculumNotice")} />

              <div className="flex justify-between gap-3 flex-wrap">
                <Button variant="outline" size="lg" onClick={() => setStep("country")}>
                  {t("schoolSetup.back")}
                </Button>
                <Button
                  size="lg"
                  disabled={!curriculum || saveOrgMutation.isPending}
                  onClick={async () => {
                    await saveOrgMutation.mutateAsync({ curriculum });
                    setStep("consent");
                  }}
                  data-testid="button-setup-curriculum"
                >
                  {saveOrgMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("schoolSetup.continue")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "consent" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">{t("schoolSetup.consentTitle")}</h1>
              <p className="text-muted-foreground">{t("schoolSetup.consentDesc")}</p>
            </div>

            {/* The product's own consent card: it posts the rendered wording
                back verbatim and the record stores its hash, so the text must
                not be duplicated here. */}
            <OrganizationConsentCard schoolName={schoolName} />

            <div className="flex justify-between gap-3 flex-wrap">
              <Button variant="outline" size="lg" onClick={() => setStep("curriculum")}>
                {t("schoolSetup.back")}
              </Button>
              <Button
                size="lg"
                disabled={!hasConsent}
                onClick={() => setStep("people")}
                data-testid="button-setup-consent"
              >
                {t("schoolSetup.continue")}
              </Button>
            </div>
            {!hasConsent && (
              <p className="text-sm text-muted-foreground">{t("schoolSetup.consentRequired")}</p>
            )}
          </div>
        )}

        {step === "people" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">{t("schoolSetup.peopleTitle")}</h1>
              <p className="text-muted-foreground">{t("schoolSetup.peopleDesc")}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <FileSpreadsheet className="h-6 w-6 text-primary" aria-hidden="true" />
                  <h2 className="font-semibold">{t("schoolSetup.uploadTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{t("schoolSetup.uploadDesc")}</p>
                  <Button className="w-full" onClick={() => setLocation("/admin/organizations")}>
                    {t("schoolSetup.goToStudents")}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-3">
                  <Users className="h-6 w-6 text-primary" aria-hidden="true" />
                  <h2 className="font-semibold">{t("schoolSetup.oneByOneTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{t("schoolSetup.oneByOneDesc")}</p>
                  <Button variant="outline" className="w-full" onClick={() => setLocation("/admin/organizations")}>
                    {t("schoolSetup.addPerson")}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="py-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-semibold">{t("schoolSetup.licencesAvailable")}</div>
                  <div className="text-sm text-muted-foreground">{t("schoolSetup.licencesNote")}</div>
                </div>
                <div className="text-2xl font-semibold text-primary" data-testid="text-setup-licences">
                  {link.totalLicenses ?? "—"}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between gap-3 flex-wrap">
              <Button variant="outline" size="lg" onClick={() => setStep("consent")}>
                {t("schoolSetup.back")}
              </Button>
              <Button variant="outline" size="lg" onClick={() => setStep("done")} data-testid="button-setup-later">
                {t("schoolSetup.later")}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <Card>
            <CardContent className="pt-8 space-y-6">
              <div className="flex gap-4 items-start">
                <CheckCircle2 className="h-8 w-8 text-primary shrink-0" aria-hidden="true" />
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold">{t("schoolSetup.readyTitle", { school: schoolName })}</h1>
                  <p className="text-muted-foreground">{t("schoolSetup.readyDesc")}</p>
                </div>
              </div>
              <Button size="lg" className="w-full" onClick={() => setLocation("/admin/organizations")}>
                {t("schoolSetup.goToSchool")}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function Rule({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <CheckCircle2 className={`h-4 w-4 ${met ? "text-primary" : "text-muted-foreground/40"}`} aria-hidden="true" />
      <span>{label}</span>
    </li>
  );
}

function Notice({ icon, text }: { icon: "info" | "warn"; text: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4 flex gap-3 items-start">
      <AlertTriangle
        className={`h-4 w-4 shrink-0 mt-0.5 ${icon === "warn" ? "text-primary" : "text-muted-foreground"}`}
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function StepHeader({ step, t }: { step: Step; t: (k: string, o?: any) => string }) {
  const order: Step[] = ["country", "curriculum", "consent", "people"];
  const index = order.indexOf(step);
  return (
    <div className="mb-8 flex items-center gap-3 flex-wrap">
      <span className="text-sm font-semibold text-primary bg-primary/10 rounded-full px-3 py-1">
        {t("schoolSetup.stepOf", { current: index + 1, total: order.length })}
      </span>
      <div className="flex gap-1.5 flex-grow min-w-[160px]" aria-hidden="true">
        {order.map((s, i) => (
          <span key={s} className={`h-1.5 flex-grow rounded-full ${i <= index ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * The expected end state of an old email, not an error. Shown as a page with
 * a way forward: the buyer's account exists and works, so the honest next step
 * is to sign in or ask for a new link — never a bare "invalid token".
 */
function DeadLink({ t }: { t: (k: string) => string }) {
  const [, setLocation] = useLocation();
  // ALREADY SIGNED IN is the common way to arrive here: the link is spent at
  // step one and the wizard lives in memory, so a reload or a Back into this
  // page mid-setup lands on a dead link while holding a working session. Send
  // that person on to their school, where curriculum and consent can be
  // finished, not to a sign-in form they do not need (found on the first live
  // purchase, 2026-11-14).
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 space-y-5 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" aria-hidden="true" />
            <h1 className="text-xl font-semibold">{t("schoolSetup.signedInTitle")}</h1>
            <p className="text-muted-foreground">{t("schoolSetup.signedInDesc")}</p>
            <Button className="w-full" onClick={() => setLocation("/admin/organizations")} data-testid="button-dead-link-continue">
              {t("schoolSetup.signedInContinue")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 space-y-5 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{t("schoolSetup.deadLinkTitle")}</h1>
          <p className="text-muted-foreground">{t("schoolSetup.deadLinkDesc")}</p>
          <Button className="w-full" onClick={() => setLocation("/login")} data-testid="button-dead-link-login">
            {t("schoolSetup.goToLogin")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
