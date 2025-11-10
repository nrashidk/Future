import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Check, Sparkles, Users } from "lucide-react";

export default function TierSelection() {
  const [, setLocation] = useLocation();
  const [studentCount, setStudentCount] = useState<number>(1);

  // Calculate bulk discount
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

  const handleFreeTier = () => {
    setLocation("/assessment");
  };

  const handlePremiumTier = () => {
    // Navigate to checkout with pricing info
    setLocation(`/checkout?students=${studentCount}&total=${pricing.total}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-gray-900">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Choose Your Path to Career Discovery
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Start with our free assessment or unlock advanced insights with Kolb's scientifically-validated learning style analysis
          </p>
        </div>

        {/* Tier Comparison */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-12">
          {/* Free Tier */}
          <Card className="relative" data-testid="card-tier-free">
            <CardHeader>
              <CardTitle className="text-2xl">Free Assessment</CardTitle>
              <CardDescription>Perfect for exploring career options</CardDescription>
              <div className="text-3xl font-bold mt-4">$0</div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Complete 6-step career assessment</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Basic personality profile</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Subject competency quiz</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Top 5 career matches</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Country vision alignment</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">View results online</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                variant="outline" 
                onClick={handleFreeTier}
                data-testid="button-select-free"
              >
                Start Free Assessment
              </Button>
            </CardFooter>
          </Card>

          {/* Premium Tier */}
          <Card className="relative border-2 border-purple-500 shadow-lg" data-testid="card-tier-premium">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
              <Sparkles className="w-4 h-4" />
              Most Popular
            </div>
            <CardHeader>
              <CardTitle className="text-2xl">Premium Assessment</CardTitle>
              <CardDescription>Unlock your full learning potential</CardDescription>
              <div className="text-3xl font-bold mt-4">
                ${pricing.perStudent}
                <span className="text-sm font-normal text-gray-500">/student</span>
              </div>
              {pricing.discount > 0 && (
                <div className="text-sm text-green-600 font-semibold">
                  {pricing.discount}% bulk discount applied!
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm font-semibold text-purple-600 mb-2">Everything in Free, plus:</div>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm font-semibold">Kolb's Experiential Learning Theory assessment</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Detailed learning style analysis (Diverging, Assimilating, Converging, Accommodating)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Personalized study tips & strategies</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Learning style-matched career recommendations</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Downloadable PDF report</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Science-backed insights</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700" 
                onClick={handlePremiumTier}
                data-testid="button-select-premium"
              >
                Unlock Premium - ${pricing.total.toFixed(2)}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Bulk Pricing Calculator */}
        <Card className="max-w-2xl mx-auto" data-testid="card-bulk-pricing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              School & Institution Pricing
            </CardTitle>
            <CardDescription>
              Save more with bulk licenses for multiple students
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
                <span className="text-purple-600">${pricing.total.toFixed(2)}</span>
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
