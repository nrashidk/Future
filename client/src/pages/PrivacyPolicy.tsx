import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicy() {
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
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
            <p className="text-muted-foreground font-body">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">1. Purpose</h2>
            <p className="text-muted-foreground font-body">
              This Privacy Policy explains how Future Pathways collects, uses, and protects personal data in compliance with the UAE Personal Data Protection Law (PDPL), EU General Data Protection Regulation (GDPR), and COPPA for minors.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">2. Data We Collect</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground font-body">
              <li>Basic user information: name, age, school, and country.</li>
              <li>Assessment data: responses to career, learning, and values questionnaires.</li>
              <li>Non-identifiable usage data: browser type, device, and session analytics.</li>
            </ul>
            <p className="text-muted-foreground font-body">
              We do not collect or store sensitive personal data (e.g., financial, medical, or biometric information).
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">3. Purpose of Data Collection</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground font-body">
              <li>To generate personalized career and learning guidance.</li>
              <li>To enhance user experience and system performance.</li>
              <li>To provide anonymized insights for institutional reporting.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">4. Data Retention & Deletion</h2>
            <p className="text-muted-foreground font-body">
              User data is securely stored and retained only as long as needed for educational purposes. Users or institutions may request deletion of data by contacting privacy@futurepathways.replit.app.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">5. Children's Privacy</h2>
            <p className="text-muted-foreground font-body">
              Future Pathways is designed for students aged 10+. Parental or institutional consent is required for minors under 18, in compliance with COPPA and UAE PDPL.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">6. Data Security</h2>
            <p className="text-muted-foreground font-body">
              All data transmissions are encrypted using SSL/TLS protocols and stored in secure, access-controlled environments.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">7. Data Sharing</h2>
            <p className="text-muted-foreground font-body">
              Future Pathways does not sell, trade, or rent personal data. Limited data may be shared with authorized educational institutions strictly for career guidance purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">8. Your Rights</h2>
            <p className="text-muted-foreground font-body">Users have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground font-body">
              <li>Access their stored information.</li>
              <li>Request correction or deletion.</li>
              <li>Withdraw consent at any time.</li>
            </ul>
            <p className="text-muted-foreground font-body mt-4">
              Contact: privacy@futurepathways.replit.app
            </p>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
