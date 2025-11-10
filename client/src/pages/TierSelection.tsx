import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Check, User, Users, BarChart3, TrendingUp, Settings, Clock } from "lucide-react";

export default function TierSelection() {
  const [, setLocation] = useLocation();
  const [studentCount, setStudentCount] = useState<number>(1);

  // Calculate bulk discount for Group Assessment
  const calculatePrice = (count: number): { total: number; perStudent: number; discount: number } => {
    const basePrice = 10;
    let discount = 0;

    if (count >= 1000) {
      discount = 0.20; // 20% off
    } else if (count >= 500) {
      discount = 0.15; // 15% off
    } else if (count >= 100) {
      discount = 0.10; // 10% off
    }

    const perStudent = basePrice * (1 - discount);
    const total = perStudent * count;

    return { total, perStudent, discount: discount * 100 };
  };

  const pricing = calculatePrice(studentCount);

  const handleIndividualTier = () => {
    // Navigate to checkout for single student
    setLocation(`/checkout?students=1&total=10`);
  };

  const handleGroupTier = () => {
    // Navigate to checkout with pricing info
    setLocation(`/checkout?students=${studentCount}&total=${pricing.total}&group=true`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-gray-900">
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
          <Card className="relative border-2 border-purple-500 shadow-lg" data-testid="card-tier-individual">
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
            <CardContent className="space-y-4">
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
          <Card className="relative border-2 border-blue-500 shadow-lg" data-testid="card-tier-group">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-6 h-6 text-blue-600" />
                <CardTitle className="text-2xl">Group Assessment</CardTitle>
              </div>
              <CardDescription>For schools and institutions</CardDescription>
              <div className="text-3xl font-bold mt-4">
                ${pricing.perStudent.toFixed(2)}
                <span className="text-sm font-normal text-gray-500">/student</span>
              </div>
              {pricing.discount > 0 && (
                <div className="text-sm text-green-600 font-semibold">
                  {pricing.discount}% bulk discount applied!
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm font-semibold text-blue-600 mb-2">Everything in Individual, plus:</div>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm font-semibold">Bulk pricing discounts (10-20% off)</span>
                </div>
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
                Get Group Assessment - ${pricing.total.toFixed(2)}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Group Pricing Calculator */}
        <Card className="max-w-2xl mx-auto" data-testid="card-bulk-pricing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Group Assessment Pricing
            </CardTitle>
            <CardDescription>
              Calculate pricing for your school or institution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="student-count">Number of Students</Label>
              <Input
                id="student-count"
                type="number"
                min="1"
                value={studentCount}
                onChange={(e) => setStudentCount(Math.max(1, parseInt(e.target.value) || 1))}
                data-testid="input-student-count"
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Base Price</span>
                <span className="font-semibold">$10.00 per student</span>
              </div>
              
              {pricing.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Bulk Discount</span>
                  <span className="text-green-600 font-semibold">-{pricing.discount}%</span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Price per Student</span>
                <span className="font-semibold">${pricing.perStudent.toFixed(2)}</span>
              </div>

              <Separator />

              <div className="flex justify-between text-lg font-bold">
                <span>Total for {studentCount} {studentCount === 1 ? 'student' : 'students'}</span>
                <span className="text-blue-600">${pricing.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Discount Tiers */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <div className="text-sm font-semibold mb-2">Bulk Discount Tiers:</div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">100-499 students</span>
                  <span className="font-semibold text-green-600">10% off</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">500-999 students</span>
                  <span className="font-semibold text-green-600">15% off</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">1000+ students</span>
                  <span className="font-semibold text-green-600">20% off</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
