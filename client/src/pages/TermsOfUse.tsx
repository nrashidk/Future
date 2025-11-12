import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsOfUse() {
  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button variant="ghost" asChild className="mb-6" data-testid="button-back">
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </Button>

        <div className="space-y-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-2">Terms of Use</h1>
            <p className="text-muted-foreground font-body">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground font-body">
              By accessing or using Future Pathways, you agree to these Terms of Use. If you do not agree, you should not use the platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">2. Eligibility</h2>
            <p className="text-muted-foreground font-body">
              Users must be 10 years or older. Students under 18 must have parental or institutional consent.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">3. Permitted Use</h2>
            <p className="text-muted-foreground font-body">
              Users agree to use the platform only for educational, non-commercial purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">4. Intellectual Property</h2>
            <p className="text-muted-foreground font-body">
              All platform content—including assessments, algorithms, user interfaces, and design elements—is the intellectual property of Future Pathways and protected by copyright law. Reproduction, redistribution, or reverse engineering is prohibited.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">5. User Accounts</h2>
            <p className="text-muted-foreground font-body">
              Users are responsible for maintaining the confidentiality of their login credentials and any activity under their account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">6. Suspension or Termination</h2>
            <p className="text-muted-foreground font-body">
              Future Pathways reserves the right to suspend or terminate access for violations of these terms or misuse of the system.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">7. Governing Law</h2>
            <p className="text-muted-foreground font-body">
              These Terms are governed by the laws of the United Arab Emirates.
            </p>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
