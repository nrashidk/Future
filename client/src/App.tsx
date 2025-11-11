import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/Landing";
import TierSelection from "@/pages/TierSelection";
import GroupPricing from "@/pages/GroupPricing";
import Checkout from "@/pages/Checkout";
import Assessment from "@/pages/Assessment";
import Results from "@/pages/Results";
import ResultsPrint from "@/pages/ResultsPrint";
import Analytics from "@/pages/Analytics";
import Admin from "@/pages/Admin";
import AdminOrganizations from "@/pages/AdminOrganizations";
import StudentLogin from "@/pages/StudentLogin";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/tier-selection" component={TierSelection} />
      <Route path="/group-pricing" component={GroupPricing} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/assessment" component={Assessment} />
      <Route path="/results" component={Results} />
      <Route path="/print/results" component={ResultsPrint} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/organizations" component={AdminOrganizations} />
      <Route path="/login/student" component={StudentLogin} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
