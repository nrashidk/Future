import { Switch, Route } from "wouter";
import { lazy, Suspense, Component, ReactNode } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

const Landing = lazy(() => import("@/pages/Landing"));
const TierSelection = lazy(() => import("@/pages/TierSelection"));
const GroupPricing = lazy(() => import("@/pages/GroupPricing"));
const Checkout = lazy(() => import("@/pages/Checkout"));
const Assessment = lazy(() => import("@/pages/Assessment"));
const Results = lazy(() => import("@/pages/Results"));
const ResultsPrint = lazy(() => import("@/pages/ResultsPrint"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminOrganizations = lazy(() => import("@/pages/AdminOrganizations"));
const SuperadminDashboard = lazy(() => import("@/pages/SuperadminDashboard"));
const StudentLogin = lazy(() => import("@/pages/StudentLogin"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfUse = lazy(() => import("@/pages/TermsOfUse"));
const Disclaimer = lazy(() => import("@/pages/Disclaimer"));
const Profile = lazy(() => import("@/pages/Profile"));
const StudentProgress = lazy(() => import("@/pages/StudentProgress"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div role="status" aria-label="Loading page" className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("Application error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground max-w-md">
            An unexpected error occurred. Please refresh the page or return to the homepage.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Refresh page
            </button>
            <button
              type="button"
              onClick={() => { this.setState({ hasError: false }); window.location.href = '/'; }}
              className="px-4 py-2 rounded-md border text-sm font-medium"
            >
              Go to homepage
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/tier-selection" component={TierSelection} />
        <Route path="/group-pricing" component={GroupPricing} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/assessment" component={Assessment} />
        <Route path="/results" component={Results} />
        <Route path="/print/results" component={ResultsPrint} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/profile" component={Profile} />
        <Route path="/progress" component={StudentProgress} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/organizations" component={AdminOrganizations} />
        <Route path="/superadmin" component={SuperadminDashboard} />
        <Route path="/login" component={Login} />
        <Route path="/login/student" component={StudentLogin} />
        <Route path="/register" component={Register} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfUse} />
        <Route path="/disclaimer" component={Disclaimer} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:font-medium focus:text-sm"
          >
            Skip to main content
          </a>
          <Toaster />
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
