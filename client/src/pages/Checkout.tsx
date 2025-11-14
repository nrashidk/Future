import { useEffect, useState } from "react";
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

// Checkout Form Component  
function CheckoutForm({ amount, studentCount }: { amount: number | null; studentCount: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  // Registration form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    // Validate registration fields
    if (!firstName || !lastName || !email || !phone) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Validate organization name for group purchases
    if (studentCount > 1 && !organizationName) {
      toast({
        title: "Missing Organization Name",
        description: "Please enter your school or organization name",
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
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        // Payment successful! Create account and allocate licenses
        const response = await apiRequest("/api/checkout/complete", {
          method: "POST",
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
            firstName,
            lastName,
            email,
            phone,
            organizationName: studentCount > 1 ? organizationName : null,
            studentCount
          }),
        });

        const data = await response.json();

        // Invalidate auth cache
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

        toast({
          title: "Payment Successful!",
          description: data.message || "Your account has been created successfully.",
        });

        // Route based on purchase type
        if (studentCount > 1) {
          // Group purchase -> Organization dashboard
          setLocation("/admin/organizations");
        } else {
          // Individual purchase -> Assessment
          setLocation("/assessment");
        }
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "An error occurred during payment",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Registration section */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Your Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="firstName">First Name *</Label>
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
            <Label htmlFor="lastName">Last Name *</Label>
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
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="input-email"
          />
        </div>
        <div className="mt-4">
          <Label htmlFor="phone">Phone Number *</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            data-testid="input-phone"
          />
        </div>
        {studentCount > 1 && (
          <div className="mt-4">
            <Label htmlFor="organizationName">School/Organization Name *</Label>
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

      {/* Payment section */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Payment Information</h3>
        <PaymentElement />
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Students</span>
          <span className="font-semibold">{studentCount}</span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          {amount !== null ? (
            <span className="text-purple-600">${amount.toFixed(2)}</span>
          ) : (
            <span className="text-gray-400">Calculating...</span>
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
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : amount !== null ? (
          `Pay $${amount.toFixed(2)}`
        ) : (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Calculating...
          </>
        )}
      </Button>

      <p className="text-xs text-center text-gray-500">
        Secure payment powered by Stripe. Your payment information is encrypted and secure.
      </p>
    </form>
  );
}

// Main Checkout Page
export default function Checkout() {
  const [, setLocation] = useLocation();
  const [clientSecret, setClientSecret] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [serverAmount, setServerAmount] = useState<number | null>(null);
  
  // Parse URL parameters (only studentCount, ignore client-provided total)
  const params = new URLSearchParams(window.location.search);
  const studentCount = parseInt(params.get("students") || "1");

  useEffect(() => {
    // Check if Stripe is configured
    if (!getStripe()) {
      console.error("Stripe not configured");
      setLocation("/tier-selection");
      return;
    }

    // Create PaymentIntent as soon as the page loads
    const createPaymentIntent = async () => {
      try {
        // SECURITY FIX: Only send studentCount, server calculates amount
        const response = await apiRequest("POST", "/api/create-payment-intent", {
          studentCount: studentCount
        });

        const data = await response.json();
        setClientSecret(data.clientSecret);
        setServerAmount(data.amount); // Use server-calculated amount for display
      } catch (error) {
        console.error("Error creating payment intent:", error);
        setLocation("/tier-selection");
      } finally {
        setLoading(false);
      }
    };

    createPaymentIntent();
  }, [studentCount, setLocation]); // Removed total from dependencies

  if (loading || !clientSecret) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          <p className="text-gray-600 dark:text-gray-300">Setting up secure payment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Complete Your Purchase
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Unlock Kolb's Premium Assessment for {studentCount} {studentCount === 1 ? 'student' : 'students'}
            </p>
          </div>

          {/* Payment Card */}
          <Card data-testid="card-checkout">
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
              <CardDescription>
                Enter your payment information to access premium features
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getStripe() ? (
                <Elements
                  stripe={getStripe()}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: 'stripe',
                    },
                  }}
                >
                  <CheckoutForm amount={serverAmount} studentCount={studentCount} />
                </Elements>
              ) : (
                <div className="text-center py-8 text-red-600">
                  Payment system not configured. Please contact support.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Back Button */}
          <div className="text-center mt-6">
            <Button
              variant="ghost"
              onClick={() => setLocation("/tier-selection")}
              data-testid="button-back"
            >
              ← Back to Tier Selection
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
