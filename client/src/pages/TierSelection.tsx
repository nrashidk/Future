import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, User, Users, BarChart3, TrendingUp, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function TierSelection() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const handleIndividualTier = () => {
    setLocation(`/checkout?students=1&total=10`);
  };

  const handleGroupTier = () => {
    setLocation('/group-pricing');
  };

  return (
    <PageLayout variant="gradient">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Choose Your Assessment Path
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Unlock advanced learning style analysis with personalized insights tailored for individuals or entire schools
          </p>
        </div>

        {/* Tier Comparison */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-12">
          {/* Individual Assessment */}
          <Card className="relative border-2 border-purple-500 shadow-lg flex flex-col" data-testid="card-tier-individual">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <User className="w-6 h-6 text-purple-600" />
                <CardTitle className="text-2xl">Individual Assessment</CardTitle>
              </div>
              <CardDescription>Perfect for single students</CardDescription>
              <div className="text-3xl font-bold mt-4">
                $10
                <span className="text-sm font-normal text-gray-500">/student</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Complete 7-step advanced assessment</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm font-semibold">24-question learning style analysis</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Subject competency validation</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Detailed learning style profile (Diverging, Assimilating, Converging, Accommodating)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Personalized study tips & strategies</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Enhanced career matching (includes learning style)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Top 5 career matches with insights</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Downloadable PDF report</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700" 
                onClick={handleIndividualTier}
                data-testid="button-select-individual"
              >
                Get Individual Assessment - $10.00
              </Button>
            </CardFooter>
          </Card>

          {/* Group Assessment */}
          <Card className="relative border-2 border-blue-500 shadow-lg flex flex-col" data-testid="card-tier-group">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-6 h-6 text-blue-600" />
                <CardTitle className="text-2xl">Group Assessment</CardTitle>
              </div>
              <CardDescription>For schools and institutions</CardDescription>
              <div className="mt-4">
                <div className="text-3xl font-bold">
                  <span className="text-sm font-normal text-gray-500 line-through">$10.00</span>
                  {" "}
                  $8.00-$9.00
                  <span className="text-sm font-normal text-gray-500">/student 10%-20% off</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              <div className="text-sm font-semibold text-blue-600 mb-2">Everything in Individual, plus:</div>
              <div className="space-y-3">
                {/* TODO: Group Assessment analytics features - implementation pending */}
                <div className="flex items-start gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold">School-wide analytics dashboard</span>
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Coming Soon</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold">Student trend analysis</span>
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Coming Soon</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold">Group students by learning styles</span>
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Coming Soon</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Settings className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold">Administrative reporting tools</span>
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Coming Soon</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm">Export aggregated data for insights</span>
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Coming Soon</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm">Career pathway trends across cohorts</span>
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Coming Soon</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Priority support for administrators</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700" 
                onClick={handleGroupTier}
                data-testid="button-select-group"
              >
                Get Group Assessment
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
