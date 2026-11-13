import { useEffect, useState } from "react";
import { validateEmail, validatePhone, sanitizePhone } from "@/lib/utils";
import { useLocation } from "wouter";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, MailCheck } from "lucide-react";
import { CredentialsModal } from "@/components/CredentialsModal";
import { useTranslation } from "react-i18next";
import { formatMoney } from "@shared/pricing";
import { useLanguage } from "@/contexts/LanguageContext";

// Initialize Stripe (lazy loaded)
let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
    if (!key) {
      console.error('Missing VITE_STRIPE_PUBLIC_KEY');
      return null;
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

function CheckoutForm({
  amount,
  amountMinor,
  currency,
  studentCount,
  clientSecret,
  authenticatedUser,
}: {
  amount: number | null;
  /**
   * MINOR UNITS AND THE CURRENCY, both from the server.
   *
   * `amount` alone was rendered as `${amount.toFixed(2)}` — a hardcoded dollar
   * sign on a platform that charges UAE schools. The major-unit `amount` is
   * kept for compatibility; these two are what the display uses.
   */
  amountMinor: number | null;
  currency: string | null;
  studentCount: number;
  clientSecret: string;
  /**
   * Set only for studentCount === 1 when the caller is already authenticated
   * — a parent who just came through /register/parent, or an existing
   * account topping up. Their name/email were already collected; asking
   * again here would be the redundant re-entry the parent-registers
   * decision was partly meant to remove. Undefined for a guest checkout
   * (should not normally be reachable for studentCount === 1 any more, see
   * Checkout's own redirect) and for every group purchase, which keeps
   * collecting buyer info here exactly as before.
   */
  authenticatedUser?: { firstName?: string | null; lastName?: string | null; email?: string | null };
}) {
  const { t, i18n } = useTranslation("pricing");
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  const [firstName, setFirstName] = useState(authenticatedUser?.firstName || "");
  const [lastName, setLastName] = useState(authenticatedUser?.lastName || "");
  const [email, setEmail] = useState(authenticatedUser?.email || "");
  const [phone, setPhone] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  // Set when the purchase succeeded but this browser has nothing to show a
  // password with: the webhook finished the purchase first, so the account
  // already existed when /api/checkout/complete arrived. Found on a real
  // purchase (production, 2026-11-14): the buyer paid AED 3,600 and was
  // dropped on the STUDENT login page, which asks for "the username and
  // password provided by your school".
  const [emailNotice, setEmailNotice] = useState<{ email: string; school: string | null } | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentials, setCredentials] = useState<{
    username: string;
    password: string;
    email: string;
  } | null>(null);
  const [createdOrgName, setCreatedOrgName] = useState<string | undefined>();

  const handleCredentialsModalClose = () => {
    setShowCredentialsModal(false);
    if (studentCount > 1) {
      setLocation("/admin/organizations");
    } else {
      setLocation("/assessment");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    if (!firstName || !lastName || !email || !phone) {
      toast({
        title: t("checkout.missingInfoTitle"),
        description: t("checkout.missingInfoDesc"),
        variant: "destructive",
      });
      return;
    }

    const emailErr = validateEmail(email);
    if (emailErr) {
      toast({ title: t("checkout.invalidEmailTitle"), description: t("checkout.invalidEmailDesc"), variant: "destructive" });
      return;
    }
    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      toast({ title: t("checkout.invalidPhoneTitle"), description: t("checkout.invalidPhoneDesc"), variant: "destructive" });
      return;
    }

    if (studentCount > 1 && !organizationName) {
      toast({
        title: t("checkout.missingOrgTitle"),
        description: t("checkout.missingOrgDesc"),
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      /**
       * ASK WHETHER THIS PURCHASE CAN COMPLETE, BEFORE CHARGING THE CARD.
       *
       * /api/checkout/complete refuses an SSO-registered email and a buyer who
       * already owns a school — but only after Stripe has taken the money, so
       * the buyer was charged and then told to log in. This asks the same
       * question first.
       *
       * FAILS OPEN. Only an explicit { ok: false } stops the payment. A
       * network error or a 503 falls through to confirmPayment, which is
       * exactly today's behaviour: this exists to spare an honest buyer a
       * useless charge, so it must never become a new way for checkout to
       * break.
       */
      try {
        const preflightRes = await apiRequest("POST", "/api/checkout/preflight", {
          email,
          studentCount,
        });
        const preflight = await preflightRes.json();
        if (preflight && preflight.ok === false) {
          toast({
            title: t("checkout.cannotCompleteTitle"),
            description:
              preflight.code === "ORG_EXISTS"
                ? t("checkout.orgExistsDesc")
                : t("checkout.loginRequiredDesc"),
            variant: "destructive",
          });
          return;
        }
      } catch (preflightErr) {
        console.error("Checkout preflight unavailable, continuing:", preflightErr);
      }

      // Stamp buyer identity onto the PaymentIntent before confirming, so a
      // backstop can complete the grant from metadata alone if
      // /api/checkout/complete never runs. Best-effort: never block payment.
      try {
        const paymentIntentId = clientSecret.split("_secret_")[0];
        if (paymentIntentId) {
          await apiRequest("POST", "/api/checkout/stamp-buyer", {
            paymentIntentId,
            buyerEmail: email,
            buyerName: `${firstName} ${lastName}`.trim(),
            buyerPhone: phone,
            // Same condition /api/checkout/complete uses below, so the stamped
            // value and the one the grant runs on can never disagree. Omitted
            // entirely for individual purchases.
            ...(studentCount > 1 && organizationName ? { organizationName } : {}),
          });
        }
      } catch (stampErr) {
        console.error("Failed to stamp buyer identity on payment intent:", stampErr);
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + "/payment-success",
        },
        redirect: "if_required",
      });

      if (error) {
        toast({
          title: t("checkout.paymentFailedTitle"),
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        const res = await apiRequest("POST", "/api/checkout/complete", {
          paymentIntentId: paymentIntent.id,
          firstName,
          lastName,
          email,
          phone,
          organizationName: studentCount > 1 ? organizationName : null,
          studentCount
        });
        const data = await res.json();

        await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });

        if (data.isNewUser && data.credentials) {
          setCredentials(data.credentials);
          setCreatedOrgName(data.organization?.name);
          setShowCredentialsModal(true);
        } else if (data.requiresPasswordSetup) {
          setEmailNotice({ email, school: data.organization?.name ?? (studentCount > 1 ? organizationName : null) });
        } else if (data.wasLoggedIn) {
          toast({
            title: t("checkout.paymentSuccessTitle"),
            description: t("checkout.paymentSuccessDesc"),
          });
          if (data.organization) {
            setLocation("/school-admin");
          } else {
            setLocation("/");
          }
        } else if (data.requiresLogin) {
          toast({
            title: t("checkout.paymentSuccessTitle"),
            description: t("checkout.paymentSuccessDesc"),
          });
          setLocation("/login/student");
        } else {
          toast({
            title: t("checkout.paymentSuccessTitle"),
            description: t("checkout.paymentSuccessDesc"),
          });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("checkout.errorDesc");
      toast({
        title: t("checkout.errorTitle"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (emailNotice) {
    return (
      <div className="space-y-4 text-center py-6" data-testid="screen-checkout-check-email">
        <MailCheck className="h-12 w-12 mx-auto text-green-600" aria-hidden="true" />
        <h3 className="text-xl font-semibold">{t("checkout.paymentSuccessTitle")}</h3>
        <p className="text-muted-foreground" data-testid="text-checkout-check-email">
          {emailNotice.school
            ? t("checkout.checkEmailSchool", { school: emailNotice.school, email: emailNotice.email })
            : t("checkout.checkEmailIndividual", { email: emailNotice.email })}
        </p>
        {!emailNotice.school && (
          <Button onClick={() => setLocation("/forgot-password")} data-testid="button-checkout-forgot-password">
            {t("checkout.checkEmailForgotButton")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">{t("checkout.yourInfoTitle")}</h3>
        {/* HIDDEN, NOT JUST PREFILLED, when authenticatedUser is set — this
            is the registration screen's information, already collected and
            already sent (state above is seeded from it). Re-showing an
            editable copy here would let the payment step silently diverge
            from the account it is charging. Phone is the one field
            registration never asks for, so it stays visible either way. */}
        {authenticatedUser ? (
          <p className="text-sm text-muted-foreground mb-4" data-testid="text-checkout-signed-in-as">
            {t("checkout.signedInAs", { name: `${authenticatedUser.firstName ?? ""} ${authenticatedUser.lastName ?? ""}`.trim() || authenticatedUser.email, email: authenticatedUser.email })}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">{t("checkout.firstNameLabel")}</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  data-testid="input-first-name"
                />
              </div>
              <div>
                <Label htmlFor="lastName">{t("checkout.lastNameLabel")}</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label htmlFor="email">{t("checkout.emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("checkout.emailPlaceholder")}
                required
                data-testid="input-email"
              />
              {validateEmail(email) && (
                <p className="text-xs text-destructive mt-1">{t("checkout.invalidEmailDesc")}</p>
              )}
            </div>
          </>
        )}
        <div className="mt-4">
          <Label htmlFor="phone">{t("checkout.phoneLabel")}</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(sanitizePhone(e.target.value))}
            placeholder={t("checkout.phonePlaceholder")}
            maxLength={10}
            required
            data-testid="input-phone"
          />
          {validatePhone(phone) && (
            <p className="text-xs text-destructive mt-1">{t("checkout.invalidPhoneDesc")}</p>
          )}
        </div>
        {studentCount > 1 && (
          <div className="mt-4">
            <Label htmlFor="organizationName">{t("checkout.orgNameLabel")}</Label>
            <Input
              id="organizationName"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              required
              data-testid="input-organization-name"
            />
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t("checkout.paymentTitle")}</h3>
        <PaymentElement />
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">{t("checkout.students")}</span>
          <span className="font-semibold">{studentCount}</span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>{t("checkout.total")}</span>
          {amount !== null ? (
            <span className="text-purple-600" data-testid="text-checkout-total">
              {formatMoney(amountMinor ?? Math.round(amount * 100), currency ?? "USD", i18n.language)}
            </span>
          ) : (
            <span className="text-gray-400">{t("checkout.calculating")}</span>
          )}
        </div>
      </div>

      <Button
        type="submit"
        className="w-full bg-purple-600 hover:bg-purple-700"
        disabled={!stripe || isProcessing || amount === null}
        data-testid="button-complete-payment"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 me-2 animate-spin" />
            {t("checkout.processing")}
          </>
        ) : amount !== null ? (
          t("checkout.pay", {
            amount: formatMoney(amountMinor ?? Math.round(amount * 100), currency ?? "USD", i18n.language),
          })
        ) : (
          <>
            <Loader2 className="w-4 h-4 me-2 animate-spin" />
            {t("checkout.calculating")}
          </>
        )}
      </Button>

      <p className="text-xs text-center text-gray-500">
        {t("checkout.secureNotice")}
      </p>

      {credentials && (
        <CredentialsModal
          open={showCredentialsModal}
          onClose={handleCredentialsModalClose}
          credentials={credentials}
          organizationName={createdOrgName}
        />
      )}
    </form>
  );
}

export default function Checkout() {
  const { t } = useTranslation("pricing");
  const { language } = useLanguage();
  useEffect(() => { document.title = `${t("checkout.pageTitle")} | ${t("appName")}`; }, [t]);

  const [, setLocation] = useLocation();
  const [clientSecret, setClientSecret] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [serverAmount, setServerAmount] = useState<number | null>(null);
  // Minor units and the currency, both decided by the server. The client never
  // computes what it displays here: it shows what it is about to be charged.
  const [serverAmountMinor, setServerAmountMinor] = useState<number | null>(null);
  const [serverCurrency, setServerCurrency] = useState<string | null>(null);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const studentCount = parseInt(params.get("students") || "1");
  /**
   * The country chosen on the pricing page, carried through so the amount
   * charged is the amount quoted. Absent is legitimate — a saved bookmark, or
   * a platform with one country — and the server falls back to its default
   * rather than refusing.
   */
  const countryId = params.get("country") || "";

  // THE INDIVIDUAL SELF-PAY ROUTE IS PARENT-REGISTERS-ONLY NOW
  // (docs/parent-registers-scoping.md). Reaching /checkout?students=1
  // without an account — TierSelection no longer links here directly, but a
  // saved bookmark or a typed URL still can — sends the visitor to register
  // first, before this component ever calls /api/create-payment-intent.
  //
  // THIS IS UX, NOT THE SECURITY BOUNDARY. A direct API call bypasses this
  // entirely; the actual enforcement is server-side, in
  // /api/create-payment-intent refusing to create an intent for the same
  // (studentCount === 1, unauthenticated) case, which runs before any Stripe
  // charge exists — see payment.routes.ts.
  //
  // studentCount > 1 IS UNTOUCHED. That is the institutional/group-purchase
  // path (GroupPricing.tsx), unauthenticated by design, and was never part
  // of the parent-registers decision's scope.
  useEffect(() => {
    if (authLoading) return;
    if (studentCount === 1 && !isAuthenticated) {
      // next=checkout: registering is free now and would otherwise end on the
      // assessment, not back here where this visitor was trying to pay.
      setLocation("/register/parent?next=checkout");
    }
  }, [authLoading, isAuthenticated, studentCount, setLocation]);

  // A school order with no country in the address goes back to the pricing
  // page, which chooses one. The server refuses it too (COUNTRY_REQUIRED);
  // this only spares the visitor an error screen.
  const groupWithoutCountry = studentCount > 1 && !countryId;
  useEffect(() => {
    if (groupWithoutCountry) setLocation("/group-pricing");
  }, [groupWithoutCountry, setLocation]);

  useEffect(() => {
    if (authLoading) return;
    if (studentCount === 1 && !isAuthenticated) return; // redirecting above
    if (groupWithoutCountry) return; // redirecting above

    if (!getStripe()) {
      console.error("Stripe not configured");
      setLoading(false);
      setLocation("/tier-selection");
      return;
    }

    const createPaymentIntent = async () => {
      try {
        const res = await apiRequest("POST", "/api/create-payment-intent", {
          studentCount: studentCount,
          // Selects the country's row server-side. The price itself is never
          // sent from here — the server reads it.
          ...(countryId ? { countryId } : {}),
        });
        const data = await res.json();

        if (!data.clientSecret) {
          console.error("No clientSecret returned from server");
          setLocation("/tier-selection");
          return;
        }

        setClientSecret(data.clientSecret);
        setServerAmount(data.amount);
        setServerAmountMinor(data.amountMinor ?? null);
        setServerCurrency(data.currency ?? null);
      } catch (error) {
        console.error("Error creating payment intent:", error);
        setLocation("/tier-selection");
      } finally {
        setLoading(false);
      }
    };

    createPaymentIntent();
  }, [authLoading, isAuthenticated, studentCount, setLocation]);

  if (authLoading || loading || !clientSecret) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          <p className="text-gray-600 dark:text-gray-300">{t("checkout.settingUp")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {t("checkout.heading")}
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              {studentCount === 1
                ? t("checkout.subheadingOne", { count: studentCount })
                : t("checkout.subheadingMany", { count: studentCount })}
            </p>
          </div>

          <Card data-testid="card-checkout">
            <CardHeader>
              <CardTitle>{t("checkout.paymentDetailsTitle")}</CardTitle>
              <CardDescription>
                {t("checkout.paymentDetailsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getStripe() ? (
                <Elements
                  stripe={getStripe()}
                  options={{
                    clientSecret,
                    appearance: { theme: 'stripe' },
                    locale: language === "ar" ? "ar" : "en",
                  }}
                >
                  <CheckoutForm amount={serverAmount} amountMinor={serverAmountMinor} currency={serverCurrency} studentCount={studentCount} clientSecret={clientSecret} authenticatedUser={studentCount === 1 ? user : undefined} />
                </Elements>
              ) : (
                <div className="text-center py-8 text-red-600">
                  {t("checkout.paymentNotConfigured")}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-center mt-6">
            <Button
              variant="ghost"
              onClick={() => setLocation("/tier-selection")}
              data-testid="button-back"
            >
              {t("checkout.backToTiers")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
