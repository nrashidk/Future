import { Switch, Route } from "wouter";
import { Suspense, Component, ReactNode, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { lazyPage } from "./lib/lazyPage";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "react-i18next";

const Landing = lazyPage(() => import("@/pages/Landing"));
const TierSelection = lazyPage(() => import("@/pages/TierSelection"));
const GroupPricing = lazyPage(() => import("@/pages/GroupPricing"));
const Checkout = lazyPage(() => import("@/pages/Checkout"));
const RegisterParent = lazyPage(() => import("@/pages/RegisterParent"));
const ConfirmEmail = lazyPage(() => import("@/pages/ConfirmEmail"));
const Assessment = lazyPage(() => import("@/pages/Assessment"));
const Results = lazyPage(() => import("@/pages/Results"));
const ResultsPrint = lazyPage(() => import("@/pages/ResultsPrint"));
const Analytics = lazyPage(() => import("@/pages/Analytics"));
const Admin = lazyPage(() => import("@/pages/Admin"));
const AdminOrganizations = lazyPage(() => import("@/pages/AdminOrganizations"));
const SuperadminDashboard = lazyPage(() => import("@/pages/SuperadminDashboard"));
const StudentLogin = lazyPage(() => import("@/pages/StudentLogin"));
const Login = lazyPage(() => import("@/pages/Login"));
const Register = lazyPage(() => import("@/pages/Register"));
const ForgotPassword = lazyPage(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazyPage(() => import("@/pages/ResetPassword"));
const SchoolSetup = lazyPage(() => import("@/pages/SchoolSetup"));
const AuthCallback = lazyPage(() => import("@/pages/AuthCallback"));
const PrivacyPolicy = lazyPage(() => import("@/pages/PrivacyPolicy"));
const TermsOfUse = lazyPage(() => import("@/pages/TermsOfUse"));
const Disclaimer = lazyPage(() => import("@/pages/Disclaimer"));
const Profile = lazyPage(() => import("@/pages/Profile"));
const DeleteAccount = lazyPage(() => import("@/pages/DeleteAccount"));
const StudentProgress = lazyPage(() => import("@/pages/StudentProgress"));
const NotFound = lazyPage(() => import("@/pages/not-found"));

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

/**
 * ONE skip link, in the reader's language. There were two: this one, written
 * in English whatever the language, and a translated one in Header — so a
 * screen reader on an Arabic page heard an English "Skip to main content"
 * first, and on an English page heard it twice. The assessment form has its
 * own header and so relied on this one alone, in English.
 */
function SkipLink() {
  const { t } = useTranslation("common");
  return (
    <a
      href="#main-content"
      data-testid="link-skip-to-main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:font-medium focus:text-sm focus:shadow-lg"
    >
      {t("common.skipToMain")}
    </a>
  );
}

function OgLocaleSync() {
  const { language } = useLanguage();
  useEffect(() => {
    const locale = language === "ar" ? "ar_AE" : "en_US";
    const inLanguage = language === "ar" ? "ar" : "en";

    // Update og:locale meta tag
    let ogTag = document.querySelector<HTMLMetaElement>('meta[property="og:locale"]');
    if (ogTag) {
      ogTag.setAttribute("content", locale);
    } else {
      ogTag = document.createElement("meta");
      ogTag.setAttribute("property", "og:locale");
      ogTag.setAttribute("content", locale);
      document.head.appendChild(ogTag);
    }

    // Update JSON-LD inLanguage field
    const ldScript = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (ldScript) {
      try {
        const data = JSON.parse(ldScript.textContent || "{}");
        data.inLanguage = inLanguage;
        ldScript.textContent = JSON.stringify(data);
      } catch {
        // ignore parse errors in structured data
      }
    }
  }, [language]);
  return null;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/tier-selection" component={TierSelection} />
        <Route path="/group-pricing" component={GroupPricing} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/register/parent" component={RegisterParent} />
        <Route path="/confirm-email/:token" component={ConfirmEmail} />
        <Route path="/assessment" component={Assessment} />
        <Route path="/results" component={Results} />
        <Route path="/print/results" component={ResultsPrint} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/profile" component={Profile} />
        <Route path="/profile/delete-account" component={DeleteAccount} />
        <Route path="/progress" component={StudentProgress} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/organizations" component={AdminOrganizations} />
        <Route path="/superadmin" component={SuperadminDashboard} />
        <Route path="/login" component={Login} />
        <Route path="/login/student" component={StudentLogin} />
        <Route path="/register" component={Register} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/school/setup/:token" component={SchoolSetup} />
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
          <LanguageProvider>
            <OgLocaleSync />
            <SkipLink />
            <Toaster />
            <Router />
          </LanguageProvider>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
