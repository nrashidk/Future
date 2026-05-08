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
import { Loader2 } from "lucide-react";
import { CredentialsModal } from "@/components/CredentialsModal";
import { useTranslation } from "react-i18next";
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

function CheckoutForm({ amount, studentCount }: { amount: number | null; studentCount: number }) {
  const { t } = useTranslation("pricing");
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organizationName, setOrganizationName] = useState("");

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">{t("checkout.yourInfoTitle")}</h3>
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
            <span className="text-purple-600">${amount.toFixed(2)}</span>
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
          t("checkout.pay", { amount: amount.toFixed(2) })
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

  const params = new URLSearchParams(window.location.search);
  const studentCount = parseInt(params.get("students") || "1");

  useEffect(() => {
    if (!getStripe()) {
      console.error("Stripe not configured");
      setLoading(false);
      setLocation("/tier-selection");
      return;
    }

    const createPaymentIntent = async () => {
      try {
        const res = await apiRequest("POST", "/api/create-payment-intent", {
          studentCount: studentCount
        });
        const data = await res.json();

        if (!data.clientSecret) {
          console.error("No clientSecret returned from server");
          setLocation("/tier-selection");
          return;
        }

        setClientSecret(data.clientSecret);
        setServerAmount(data.amount);
      } catch (error) {
        console.error("Error creating payment intent:", error);
        setLocation("/tier-selection");
      } finally {
        setLoading(false);
      }
    };

    createPaymentIntent();
  }, [studentCount, setLocation]);

  if (loading || !clientSecret) {
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
                  <CheckoutForm amount={serverAmount} studentCount={studentCount} />
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
