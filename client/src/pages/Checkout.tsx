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
function CheckoutForm({ amount, studentCount, isAuthenticated }: { amount: number | null; studentCount: number; isAuthenticated: boolean }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Account creation fields (only for guest users)
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    // Validate account fields for guest users
    if (!isAuthenticated) {
      if (!email || !fullName || !password) {
        toast({
          title: "Missing Information",
          description: "Please fill in all account details",
          variant: "destructive",
        });
        return;
      }

      if (password.length < 6) {
        toast({
          title: "Invalid Password",
          description: "Password must be at least 6 characters",
          variant: "destructive",
        });
        return;
      }

      if (!email.includes("@")) {
        toast({
          title: "Invalid Email",
          description: "Please enter a valid email address",
          variant: "destructive",
        });
        return;
      }
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
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        // Payment successful!
        
        // If guest user, create account first
        if (!isAuthenticated) {
          try {
            // Create account with Replit Auth
            const signupResponse = await fetch("/api/register-and-upgrade", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email,
                fullName,
                password,
                paymentIntentId: paymentIntent.id
              }),
            });

            if (!signupResponse.ok) {
              const errorData = await signupResponse.json();
              throw new Error(errorData.message || "Failed to create account");
            }

            // Invalidate auth cache to get new user data
            await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

            toast({
              title: "Account Created & Payment Successful!",
              description: "Welcome! You can now start your premium assessment.",
            });

            setLocation("/assessment");
          } catch (err: any) {
            toast({
              title: "Payment Successful, Account Error",
              description: err.message || "Payment succeeded but account creation failed. Please contact support.",
              variant: "destructive",
            });
          }
        } else {
          // Already logged in, just upgrade to premium
          try {
            await apiRequest("POST", "/api/upgrade-to-premium", {
              paymentIntentId: paymentIntent.id
            });

            toast({
              title: "Payment Successful!",
              description: "You now have access to the premium assessment.",
            });

            setLocation("/assessment");
          } catch (err) {
            toast({
              title: "Payment Successful",
              description: "Please refresh and start your premium assessment.",
            });
            setLocation("/assessment");
          }
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
      {/* Account creation fields for guest users */}
      {!isAuthenticated && (
        <div className="space-y-4 pb-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold mb-4">Create Your Account</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Fill in your details to create an account and access your premium assessment
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name *</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="John Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              data-testid="input-fullname"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              data-testid="input-password"
            />
          </div>
        </div>
      )}

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
  const { isAuthenticated } = useAuth();
  
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
                  <CheckoutForm amount={serverAmount} studentCount={studentCount} isAuthenticated={isAuthenticated} />
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
