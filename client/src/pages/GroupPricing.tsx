import { useState } from "react";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Users, ArrowLeft } from "lucide-react";

export default function GroupPricing() {
  const [, setLocation] = useLocation();
  const [studentCount, setStudentCount] = useState<number>(100);

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

  const handleContinue = () => {
    setLocation(`/checkout?students=${studentCount}&total=${pricing.total}&group=true`);
  };

  const handleBack = () => {
    setLocation('/tier-selection');
  };

  return (
    <PageLayout variant="gradient">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Group Assessment Pricing
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Configure your group assessment and see your bulk pricing discount
          </p>
        </div>

        {/* Pricing Calculator Card */}
        <Card className="max-w-2xl mx-auto" data-testid="card-group-pricing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Configure Your Group Assessment
            </CardTitle>
            <CardDescription>
              Enter the number of students to calculate your total cost
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
                className="text-lg"
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
          <CardFooter className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="outline"
              className="w-full sm:w-auto" 
              onClick={handleBack}
              data-testid="button-back-to-plans"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Plan Selection
            </Button>
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 flex-1" 
              onClick={handleContinue}
              data-testid="button-continue-checkout"
            >
              Continue to Checkout - ${pricing.total.toFixed(2)}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PageLayout>
  );
}
