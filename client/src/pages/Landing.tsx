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
  Lightbulb
} from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleGuestStart = () => {
    window.location.href = "/assessment?guest=true";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      {/* Hero Section */}
      <div className="relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden">
        {/* Decorative background sticky notes */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-10 left-10 opacity-30">
            <StickyNote color="yellow" rotation="-2" className="w-32 h-32" />
          </div>
          <div className="absolute top-32 right-20 opacity-30">
            <StickyNote color="pink" rotation="1" className="w-40 h-32" />
          </div>
          <div className="absolute bottom-20 left-20 opacity-30">
            <StickyNote color="blue" rotation="2" className="w-36 h-36" />
          </div>
          <div className="absolute bottom-40 right-32 opacity-30">
            <StickyNote color="green" rotation="-1" className="w-28 h-28" />
          </div>
          <div className="absolute top-1/2 left-1/4 opacity-20">
            <StickyNote color="purple" rotation="1" className="w-24 h-24" />
          </div>
        </div>

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
            <span className="text-sm font-medium">Trusted by 10,000+ students</span>
          </div>
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

      {/* Footer */}
      <footer className="py-12 px-4 text-center text-muted-foreground">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-4">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-foreground">Future Pathways</span>
          </div>
          <p className="text-sm font-body">
            Empowering students to build meaningful careers that shape the future
          </p>
        </div>
      </footer>
    </div>
  );
}
