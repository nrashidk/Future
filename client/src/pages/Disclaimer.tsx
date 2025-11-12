import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export default function Disclaimer() {
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
              <AlertTriangle className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-2">Disclaimer</h1>
            <p className="text-muted-foreground font-body">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">1. Educational Purpose Only</h2>
            <p className="text-muted-foreground font-body">
              Future Pathways is an educational tool designed for career exploration and self-awareness. It does not provide psychological, clinical, or diagnostic services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">2. No Liability</h2>
            <p className="text-muted-foreground font-body">
              While Future Pathways strives for accuracy, results are based on user input and established research models. The platform and its partners are not liable for any academic, career, or personal decisions made based on assessment outcomes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">3. Institutional Responsibility</h2>
            <p className="text-muted-foreground font-body">
              Schools and educators using Future Pathways remain responsible for interpretation, counseling, and decision-making support.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">4. External Links</h2>
            <p className="text-muted-foreground font-body">
              Our website may include links to third-party resources. Future Pathways is not responsible for their content or data practices.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold">5. Research-Based Guidance</h2>
            <p className="text-muted-foreground font-body">
              Our assessments are based on validated research models including Holland's RIASEC Career Typology, Kolb's Experiential Learning Theory, and the Children's Values Questionnaire (CVQ). Results should be interpreted as guidance, not definitive career predictions.
            </p>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
