import { Button } from "@/components/ui/button";
import { StickyNote } from "@/components/StickyNote";
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
  Building2,
  User,
  LogIn
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";

interface Organization {
  id: string;
  name: string;
  logoUrl: string | null;
}

export default function Landing() {
  const { user } = useAuth();
  const { data: analytics, isLoading } = useQuery<{ totalStudents: number }>({
    queryKey: ['/api/public/student-count'],
  });
  
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ['/api/public/organizations'],
  });

  const studentCount = analytics?.totalStudents ?? 0;
  const displayCount = isLoading ? "..." : studentCount.toLocaleString();
  const isPlural = studentCount !== 1;

  const handleLogin = () => {
    // Redirect to assessment after login
    window.location.href = "/api/login?returnTo=/assessment";
  };

  const handleGuestStart = () => {
    window.location.href = "/assessment";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Future Pathways</span>
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild data-testid="button-nav-login">
              <Link href="/login/student">
                <LogIn className="w-4 h-4 mr-2" />
                Login
              </Link>
            </Button>
            {user && (
              <Button variant="outline" size="sm" asChild data-testid="button-nav-profile">
                <Link href="/profile">
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden">
        {/* Main content */}
        <div className="relative z-10 max-w-6xl mx-auto text-center">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <GraduationCap className="w-20 h-20 text-primary" />
              <Sparkles className="absolute -top-2 -right-2 w-8 h-8 text-accent animate-pulse" />
            </div>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6">
            Discover Your
            <span className="block text-primary mt-2">Future Path</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto font-body">
            Find the perfect career that matches your interests, aligns with your country's vision, and prepares you for tomorrow's opportunities
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button
              size="lg"
              className="text-lg px-8 py-6 rounded-full shadow-xl"
              onClick={handleLogin}
              data-testid="button-signup"
            >
              <Rocket className="mr-2 w-5 h-5" />
              Get Started
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6 rounded-full shadow-lg backdrop-blur-sm bg-background/80"
              onClick={handleGuestStart}
              data-testid="button-guest"
            >
              Explore as Guest →
            </Button>
          </div>

          <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full">
            <Users className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium" data-testid="text-student-count">
              Trusted by {displayCount} student{isPlural ? 's' : ''}
            </span>
          </div>

          {/* School Logos Section - Auto-scrolling */}
          {organizations.length > 0 && (
            <div className="mt-12 w-full">
              <p className="text-sm text-muted-foreground mb-6 text-center">Trusted by schools across UAE</p>
              <div className="overflow-hidden">
                <div className="flex items-center gap-12 animate-scroll">
                  {/* Duplicate organizations twice for seamless loop */}
                  {[...organizations, ...organizations].map((org, index) => (
                    <div key={`${org.id}-${index}`} className="flex flex-col items-center gap-2 opacity-70 hover:opacity-100 transition-opacity flex-shrink-0">
                      {org.logoUrl ? (
                        <img
                          src={org.logoUrl}
                          alt={`${org.name} logo`}
                          className="h-12 w-auto object-contain grayscale hover:grayscale-0 transition-all"
                          data-testid={`img-school-logo-${org.id}-${index}`}
                        />
                      ) : (
                        <div className="h-12 w-24 flex items-center justify-center bg-muted/30 rounded border border-border">
                          <Building2 className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground text-center w-[120px] truncate" data-testid={`text-school-name-${org.id}-${index}`}>
                        {org.name}
                      </span>
                    </div>
                  ))}
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
            How It Works
          </h2>
          <p className="text-center text-muted-foreground mb-16 text-lg font-body">
            Your journey to the perfect career in three simple steps
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <StickyNote color="yellow" rotation="-1" className="text-center">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-3">1. Share Your Profile</h3>
                <p className="text-muted-foreground font-body">
                  Tell us about your favorite subjects, interests, and dreams
                </p>
              </div>
            </StickyNote>

            <StickyNote color="pink" rotation="1" className="text-center">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Target className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-3">2. Find Alignment</h3>
                <p className="text-muted-foreground font-body">
                  See how your passions match your country's vision and future needs
                </p>
              </div>
            </StickyNote>

            <StickyNote color="blue" rotation="-2" className="text-center">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <TrendingUp className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-3">3. Get Your Path</h3>
                <p className="text-muted-foreground font-body">
                  Receive personalized career recommendations with action steps
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
            Why Choose Future Pathways?
          </h2>
          <p className="text-center text-muted-foreground mb-16 text-lg font-body">
            Everything you need to plan your future career
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StickyNote color="purple" rotation="1">
              <Target className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">Country Vision Alignment</h4>
              <p className="text-muted-foreground text-sm font-body">
                Discover careers that contribute to your nation's development goals
              </p>
            </StickyNote>

            <StickyNote color="green" rotation="-1">
              <Sparkles className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">Future Skills Mapping</h4>
              <p className="text-muted-foreground text-sm font-body">
                Learn what skills will be in demand in tomorrow's job market
              </p>
            </StickyNote>

            <StickyNote color="yellow" rotation="2">
              <TrendingUp className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">Job Market Insights</h4>
              <p className="text-muted-foreground text-sm font-body">
                Get real data on career growth and opportunities in your country
              </p>
            </StickyNote>

            <StickyNote color="pink" rotation="-2">
              <Heart className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">Personalized Match</h4>
              <p className="text-muted-foreground text-sm font-body">
                Recommendations based on your unique interests and strengths
              </p>
            </StickyNote>

            <StickyNote color="blue" rotation="1">
              <Lightbulb className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">Progress Tracking</h4>
              <p className="text-muted-foreground text-sm font-body">
                Monitor your journey with visual progress indicators and badges
              </p>
            </StickyNote>

            <StickyNote color="purple" rotation="-1">
              <BookOpen className="w-8 h-8 mb-3 text-primary" />
              <h4 className="text-xl font-bold mb-2">Detailed Reports</h4>
              <p className="text-muted-foreground text-sm font-body">
                Download comprehensive PDF reports with your career roadmap
              </p>
            </StickyNote>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20 px-4 bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <StickyNote color="yellow" rotation="-1" className="p-8">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">👩‍🎓</span>
                </div>
                <div>
                  <p className="font-body italic text-foreground/80">
                    "Future Pathways helped me discover careers I never knew existed. 
                    Now I'm excited about my future!"
                  </p>
                  <p className="mt-2 font-semibold text-sm">- Sarah, Grade 11</p>
                </div>
              </div>
            </StickyNote>

            <div>
              <h3 className="text-3xl md:text-4xl font-bold mb-6">
                Ready to Find Your Path?
              </h3>
              <p className="text-muted-foreground mb-6 font-body text-lg">
                Join thousands of students who have discovered their perfect career match. 
                Start your journey today!
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  size="lg"
                  className="rounded-full shadow-lg"
                  onClick={handleLogin}
                  data-testid="button-cta-signup"
                >
                  Create Account
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full shadow-lg backdrop-blur-sm bg-background/80"
                  onClick={handleGuestStart}
                  data-testid="button-cta-guest"
                >
                  Continue as Guest
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
            Research-Backed Methodology
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-lg font-body max-w-3xl mx-auto">
            Our career guidance system integrates cutting-edge frameworks and scientifically-validated assessments
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            <StickyNote color="blue" rotation="1" className="p-6">
              <h4 className="text-lg font-bold mb-2">WEF Future Skills Framework</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                World Economic Forum's 16 essential future-ready skills across Foundational Literacies and Core Competencies
              </p>
              <p className="text-xs text-muted-foreground italic">
                Source: Future of Jobs Report 2025
              </p>
            </StickyNote>

            <StickyNote color="green" rotation="-1" className="p-6">
              <h4 className="text-lg font-bold mb-2">Career Personality Assessment</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                Scientifically-validated personality assessment matching six career themes to individual interests
              </p>
            </StickyNote>

            <StickyNote color="yellow" rotation="2" className="p-6">
              <h4 className="text-lg font-bold mb-2">Learning Style Assessment</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                Experiential learning theory identifying four distinct learning approaches for personalized study strategies
              </p>
            </StickyNote>

            <StickyNote color="pink" rotation="-2" className="p-6">
              <h4 className="text-lg font-bold mb-2">Personal Values Assessment</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                Cross-culturally validated assessment measuring 10 basic human values for value-based career alignment
              </p>
            </StickyNote>

            <StickyNote color="purple" rotation="1" className="p-6">
              <h4 className="text-lg font-bold mb-2">National Vision Integration</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                Aligns career paths with country-specific development goals including UAE Centennial 2071
              </p>
              <p className="text-xs text-muted-foreground italic">
                Source: UAE Centennial 2071 (2017)
              </p>
            </StickyNote>

            <StickyNote color="yellow" rotation="-1" className="p-6">
              <h4 className="text-lg font-bold mb-2">Curriculum-Aligned Assessments</h4>
              <p className="text-sm text-muted-foreground font-body mb-2">
                240 grade-differentiated questions covering core subjects aligned with UAE national curriculum standards
              </p>
              <p className="text-xs text-muted-foreground italic">
                Source: UAE National Curriculum Framework (2023)
              </p>
            </StickyNote>
          </div>

          <div className="bg-accent/5 border border-accent/20 rounded-lg p-6 max-w-4xl mx-auto">
            <h4 className="font-bold text-lg mb-3 text-center">Our Approach</h4>
            <p className="text-sm text-muted-foreground font-body text-center leading-relaxed">
              We map existing, research-validated assessments to the World Economic Forum's 16 future-ready skills framework, 
              providing students with comprehensive insights into their career readiness. By integrating personality, learning styles, 
              values, and competencies, we deliver personalized career recommendations that align with both individual strengths 
              and national development priorities.
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
            Empowering students to build meaningful careers that shape the future
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs mb-4">
            <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">
              Terms of Use
            </Link>
            <span>•</span>
            <Link href="/disclaimer" className="hover:text-foreground transition-colors" data-testid="link-footer-disclaimer">
              Disclaimer
            </Link>
          </div>
          
          <p className="text-xs">
            © {new Date().getFullYear()} Future Pathways. All Rights Reserved.
          </p>
          <p className="text-xs mt-2">
            Research-based Career & Learning Platform | Powered by WEF and other validated frameworks
          </p>
        </div>
      </footer>
    </div>
  );
}
