import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { StickyNote } from "@/components/StickyNote";
import { Header } from "@/components/layout/Header";
import { 
  GraduationCap, 
  Target, 
  Sparkles, 
  TrendingUp, 
  Users, 
  BookOpen,
  Rocket,
  Heart,
  Lightbulb,
  Building2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";

interface Organization {
  id: string;
  name: string;
  logoUrl: string | null;
}

export default function Landing() {
  const { t, i18n } = useTranslation("landing");
  const isAr = i18n.language === "ar";
  const [, setLocation] = useLocation();
  const { data: analytics, isLoading } = useQuery<{ totalStudents: number }>({
    queryKey: ['/api/public/student-count'],
  });
  
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ['/api/public/organizations'],
  });

  const studentCount = analytics?.totalStudents ?? 0;
  const displayCount = isLoading ? "..." : studentCount.toLocaleString();
  const isPlural = studentCount !== 1;

  useEffect(() => { document.title = t("pageTitle"); }, [t]);

  const handleLogin = () => setLocation("/login");
  const handleGuestStart = () => setLocation("/assessment");

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">

      {/* Hero Section */}
      <div className="relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden">
        <div className="relative z-10 max-w-6xl mx-auto text-center">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <GraduationCap className="w-20 h-20 text-primary" />
              <Sparkles className="absolute -top-2 -right-2 w-8 h-8 text-accent animate-pulse" />
            </div>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6">
            {t("hero.title1")}
            <span className="block text-primary mt-2">{t("hero.title2")}</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto font-body">
            {t("hero.subtitle")}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button
              size="lg"
              className="text-lg px-8 py-6 rounded-full shadow-xl"
              onClick={handleLogin}
              data-testid="button-signup"
            >
              <Rocket className={`w-5 h-5 ${isAr ? "ms-2" : "me-2"}`} />
              {t("hero.getStarted")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6 rounded-full shadow-lg backdrop-blur-sm bg-background/80"
              onClick={handleGuestStart}
              data-testid="button-guest"
            >
              {t("hero.exploreGuest")}
            </Button>
          </div>

          <StickyNote color="pink" rotation="1" className="inline-block px-6 py-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium" data-testid="text-student-count">
                {isPlural
                  ? t("hero.trustedByPlural", { count: displayCount })
                  : t("hero.trustedBy", { count: displayCount })}
              </span>
            </div>
          </StickyNote>

          {organizations.length > 0 && (
            <div className="mt-12 w-full">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-center">{t("hero.partnerSchools")}</h3>
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-6 animate-scroll">
                  {[...organizations, ...organizations].map((org, index) => {
                    const colors: Array<"yellow" | "pink" | "blue" | "green"> = ["yellow", "pink", "blue", "green"];
                    const rotations: Array<"0" | "1" | "-1" | "2" | "-2"> = ["-1", "1", "-2", "2"];
                    return (
                      <StickyNote 
                        key={`${org.id}-${index}`}
                        color={colors[index % colors.length]} 
                        rotation={rotations[index % rotations.length]}
                        className="flex-shrink-0 p-4 hover:scale-105 transition-transform"
                      >
                        <div className="flex flex-col items-center gap-2 w-[100px]">
                          {org.logoUrl ? (
                            <img
                              src={org.logoUrl}
                              alt={`${org.name} logo`}
                              loading="lazy"
                              decoding="async"
                              className="h-10 w-auto object-contain"
                              data-testid={`img-school-logo-${org.id}-${index}`}
                            />
                          ) : (
                            <div className="h-10 w-16 flex items-center justify-center">
                              <Building2 className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground text-center w-full truncate" data-testid={`text-school-name-${org.id}-${index}`}>
                            {org.name}
                          </span>
                        </div>
                      </StickyNote>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-20 px-4 bg-background/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
            {t("howItWorks.title")}
          </h2>
          <p className="text-center text-muted-foreground mb-16 text-lg font-body">
            {t("howItWorks.subtitle")}
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <StickyNote color="yellow" rotation="-1" className="text-center">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-3">{t("howItWorks.step1Title")}</h3>
                <p className="text-muted-foreground font-body">
                  {t("howItWorks.step1Desc")}
                </p>
              </div>
            </StickyNote>

            <StickyNote color="pink" rotation="1" className="text-center">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Target className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-3">{t("howItWorks.step2Title")}</h3>
                <p className="text-muted-foreground font-body">
                  {t("howItWorks.step2Desc")}
                </p>
              </div>
            </StickyNote>

            <StickyNote color="blue" rotation="-2" className="text-center">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <TrendingUp className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-3">{t("howItWorks.step3Title")}</h3>
                <p className="text-muted-foreground font-body">
                  {t("howItWorks.step3Desc")}
                </p>
              </div>
            </StickyNote>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
            {t("features.title")}
          </h2>
          <p className="text-center text-muted-foreground mb-16 text-lg font-body">
            {t("features.subtitle")}
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StickyNote color="purple" rotation="1">
              <Target className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">{t("features.visionTitle")}</h4>
              <p className="text-muted-foreground text-sm font-body">
                {t("features.visionDesc")}
              </p>
            </StickyNote>

            <StickyNote color="green" rotation="-1">
              <Sparkles className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">{t("features.skillsTitle")}</h4>
              <p className="text-muted-foreground text-sm font-body">
                {t("features.skillsDesc")}
              </p>
            </StickyNote>

            <StickyNote color="yellow" rotation="2">
              <TrendingUp className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">{t("features.marketTitle")}</h4>
              <p className="text-muted-foreground text-sm font-body">
                {t("features.marketDesc")}
              </p>
            </StickyNote>

            <StickyNote color="pink" rotation="-2">
              <Heart className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">{t("features.matchTitle")}</h4>
              <p className="text-muted-foreground text-sm font-body">
                {t("features.matchDesc")}
              </p>
            </StickyNote>

            <StickyNote color="blue" rotation="1">
              <Lightbulb className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">{t("features.progressTitle")}</h4>
              <p className="text-muted-foreground text-sm font-body">
                {t("features.progressDesc")}
              </p>
            </StickyNote>

            <StickyNote color="purple" rotation="-1">
              <BookOpen className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">{t("features.reportsTitle")}</h4>
              <p className="text-muted-foreground text-sm font-body">
                {t("features.reportsDesc")}
              </p>
            </StickyNote>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20 px-4 bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="max-w-4xl mx-auto">
          <div className={`flex flex-col md:flex-row gap-8 items-center ${isAr ? "md:flex-row-reverse" : ""}`}>
            <StickyNote color="yellow" rotation="-1" className="p-8 md:flex-1">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-7 h-7 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-body italic text-foreground/80">
                    {t("cta.testimonial")}
                  </p>
                  <p className="mt-2 font-semibold text-sm">{t("cta.testimonialAuthor")}</p>
                </div>
              </div>
            </StickyNote>

            <div className="md:flex-1">
              <h3 className="text-3xl md:text-4xl font-bold mb-6">
                {t("cta.title")}
              </h3>
              <p className="text-muted-foreground mb-6 font-body text-lg">
                {t("cta.subtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  size="lg"
                  className="rounded-full shadow-lg"
                  onClick={handleLogin}
                  data-testid="button-cta-signup"
                >
                  {t("cta.createAccount")}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full shadow-lg backdrop-blur-sm bg-background/80"
                  onClick={handleGuestStart}
                  data-testid="button-cta-guest"
                >
                  {t("cta.continueGuest")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Research & Methodology Section */}
      <div className="py-20 px-4 bg-background/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
            {t("research.title")}
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-lg font-body max-w-3xl mx-auto">
            {t("research.subtitle")}
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            <StickyNote color="green" rotation="-1" className="p-6">
              <h4 className="text-lg font-bold mb-2">{t("research.personalityTitle")}</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                {t("research.personalityDesc")}
              </p>
            </StickyNote>

            <StickyNote color="yellow" rotation="2" className="p-6">
              <h4 className="text-lg font-bold mb-2">{t("research.valuesTitle")}</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                {t("research.valuesDesc")}
              </p>
            </StickyNote>

            <StickyNote color="pink" rotation="-2" className="p-6">
              <h4 className="text-lg font-bold mb-2">{t("research.quizTitle")}</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                {t("research.quizDesc")}
              </p>
            </StickyNote>

            <StickyNote color="blue" rotation="1" className="p-6">
              <h4 className="text-lg font-bold mb-2">{t("research.wefTitle")}</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                {t("research.wefDesc")}
              </p>
              <p className="text-xs text-muted-foreground italic">
                {t("research.wefSource")}
              </p>
            </StickyNote>

            <StickyNote color="purple" rotation="1" className="p-6">
              <h4 className="text-lg font-bold mb-2">{t("research.visionTitle")}</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                {t("research.visionDesc")}
              </p>
              <p className="text-xs text-muted-foreground italic">
                {t("research.visionSource")}
              </p>
            </StickyNote>

            <StickyNote color="orange" rotation="-1" className="p-6">
              <h4 className="text-lg font-bold mb-2">{t("research.curriculumTitle")}</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                {t("research.curriculumDesc")}
              </p>
              <p className="text-xs text-muted-foreground italic">
                {t("research.curriculumSource")}
              </p>
            </StickyNote>
          </div>

          <div className="bg-accent/5 border border-accent/20 rounded-lg p-6 max-w-4xl mx-auto">
            <h4 className="font-bold text-lg mb-3 text-center">{t("research.approachTitle")}</h4>
            <p className="text-sm text-muted-foreground font-body text-center leading-relaxed">
              {t("research.approachDesc")}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-12 px-4 text-center text-muted-foreground">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-4">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-foreground">Future Pathways</span>
          </div>
          <p className="text-sm font-body mb-4">
            {t("footer.tagline")}
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs mb-4">
            <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">
              {t("footer.privacy")}
            </Link>
            <span aria-hidden="true">•</span>
            <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">
              {t("footer.terms")}
            </Link>
            <span aria-hidden="true">•</span>
            <Link href="/disclaimer" className="hover:text-foreground transition-colors" data-testid="link-footer-disclaimer">
              {t("footer.disclaimer")}
            </Link>
          </div>
          
          <p className="text-xs">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
          <p className="text-xs mt-2">
            {t("footer.poweredBy")}
          </p>
        </div>
      </footer>
    </main>
    </>
  );
}
