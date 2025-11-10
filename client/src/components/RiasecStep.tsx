import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { StickyNote } from "@/components/StickyNote";
import { 
  Compass, 
  Lightbulb, 
  Palette, 
  Heart, 
  TrendingUp, 
  Briefcase,
  ArrowRight,
  ArrowLeft
} from "lucide-react";

/**
 * RIASEC (Holland Code) Career Personality Assessment
 * Integrated into Future Pathways sticky notes design
 * 30 questions across 6 vocational themes: R-I-A-S-E-C
 */

export type Theme = "R" | "I" | "A" | "S" | "E" | "C";
export type Likert = 1 | 2 | 3 | 4 | 5;

export type RiasecItem = {
  id: string;
  theme: Theme;
  text: string;
};

export type RiasecScores = {
  R: number; // Realistic (0-100)
  I: number; // Investigative (0-100)
  A: number; // Artistic (0-100)
  S: number; // Social (0-100)
  E: number; // Enterprising (0-100)
  C: number; // Conventional (0-100)
  top3: Theme[];
  ranking: Theme[];
};

interface RiasecStepProps {
  onComplete: (scores: RiasecScores) => void;
  onBack: () => void;
}

// 30 original items (5 per theme)
const ITEMS: RiasecItem[] = [
  // R — Realistic (hands-on, tools, outdoors)
  { id: "R1", theme: "R", text: "I enjoy building, fixing, or operating physical things" },
  { id: "R2", theme: "R", text: "I prefer tasks with clear, practical steps" },
  { id: "R3", theme: "R", text: "I like working with tools, machines, or equipment" },
  { id: "R4", theme: "R", text: "I would rather be active and hands-on than sitting at a desk all day" },
  { id: "R5", theme: "R", text: "I enjoy outdoor or physical work when possible" },

  // I — Investigative (ideas, analysis, science)
  { id: "I1", theme: "I", text: "I'm drawn to figuring out how things work" },
  { id: "I2", theme: "I", text: "I like searching for patterns, causes, or mechanisms" },
  { id: "I3", theme: "I", text: "I prefer problems that require research or analysis" },
  { id: "I4", theme: "I", text: "I enjoy experimenting to test a hypothesis" },
  { id: "I5", theme: "I", text: "I like reading technical or scientific material" },

  // A — Artistic (create/express, design)
  { id: "A1", theme: "A", text: "I enjoy creating things (art, writing, music, design)" },
  { id: "A2", theme: "A", text: "I value freedom to try unconventional ideas" },
  { id: "A3", theme: "A", text: "I'm energized by work that uses style, aesthetics, or storytelling" },
  { id: "A4", theme: "A", text: "I prefer tasks without rigid rules" },
  { id: "A5", theme: "A", text: "I like to express my viewpoint through what I make" },

  // S — Social (help/teach, service)
  { id: "S1", theme: "S", text: "I enjoy helping people learn, grow, or solve problems" },
  { id: "S2", theme: "S", text: "I'm good at listening and understanding others' needs" },
  { id: "S3", theme: "S", text: "I prefer collaborative work with lots of interaction" },
  { id: "S4", theme: "S", text: "I'm fulfilled by roles that serve a community or cause" },
  { id: "S5", theme: "S", text: "People often come to me for guidance or support" },

  // E — Enterprising (lead/sell, influence)
  { id: "E1", theme: "E", text: "I like persuading or motivating people toward a goal" },
  { id: "E2", theme: "E", text: "I'm comfortable taking the lead and making decisions" },
  { id: "E3", theme: "E", text: "I enjoy spotting opportunities and taking initiative" },
  { id: "E4", theme: "E", text: "I'm drawn to competitive or results-driven environments" },
  { id: "E5", theme: "E", text: "I like influencing outcomes and making things happen" },

  // C — Conventional (organization, data, procedures)
  { id: "C1", theme: "C", text: "I enjoy organizing information or materials systematically" },
  { id: "C2", theme: "C", text: "I prefer working with clear rules and procedures" },
  { id: "C3", theme: "C", text: "I'm good at managing details and keeping things in order" },
  { id: "C4", theme: "C", text: "I like tasks that require accuracy and precision" },
  { id: "C5", theme: "C", text: "I feel satisfied when everything is properly documented" },
];

const THEME_INFO = {
  R: { name: "Realistic", icon: Compass, color: "green", description: "Hands-on, practical, tools & outdoors" },
  I: { name: "Investigative", icon: Lightbulb, color: "blue", description: "Research, analysis, problem-solving" },
  A: { name: "Artistic", icon: Palette, color: "purple", description: "Creative, expressive, design" },
  S: { name: "Social", icon: Heart, color: "pink", description: "Helping, teaching, service" },
  E: { name: "Enterprising", icon: TrendingUp, color: "yellow", description: "Leadership, influence, business" },
  C: { name: "Conventional", icon: Briefcase, color: "blue", description: "Organization, data, procedures" },
};

const LIKERT_OPTIONS = [
  { value: 1, label: "Strongly Disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly Agree" },
];

export default function RiasecStep({ onComplete, onBack }: RiasecStepProps) {
  const [responses, setResponses] = useState<Record<string, Likert>>(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem("riasec_draft");
    return saved ? JSON.parse(saved) : {};
  });
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(ITEMS.length / itemsPerPage);
  
  const currentItems = useMemo(() => {
    const start = currentPage * itemsPerPage;
    return ITEMS.slice(start, start + itemsPerPage);
  }, [currentPage]);

  const progress = (Object.keys(responses).length / ITEMS.length) * 100;
  const isPageComplete = currentItems.every(item => responses[item.id]);
  const isComplete = Object.keys(responses).length === ITEMS.length;

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem("riasec_draft", JSON.stringify(responses));
  }, [responses]);

  const handleResponse = (itemId: string, value: Likert) => {
    setResponses(prev => ({ ...prev, [itemId]: value }));
  };

  const calculateScores = (): RiasecScores => {
    // Calculate raw scores per theme (5-25)
    const rawScores: Record<Theme, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    
    ITEMS.forEach(item => {
      const response = responses[item.id] || 1;
      rawScores[item.theme] += response;
    });

    // Normalize to 0-100
    const normalized: Record<Theme, number> = Object.entries(rawScores).reduce((acc, [theme, raw]) => ({
      ...acc,
      [theme]: ((raw - 5) / 20) * 100
    }), {} as Record<Theme, number>);

    // Rank themes by score
    const ranking = (Object.keys(normalized) as Theme[]).sort((a, b) => normalized[b] - normalized[a]);
    const top3 = ranking.slice(0, 3);

    return {
      R: Math.round(normalized.R),
      I: Math.round(normalized.I),
      A: Math.round(normalized.A),
      S: Math.round(normalized.S),
      E: Math.round(normalized.E),
      C: Math.round(normalized.C),
      top3,
      ranking,
    };
  };

  const handleComplete = () => {
    if (!isComplete) return;
    const scores = calculateScores();
    localStorage.removeItem("riasec_draft");
    onComplete(scores);
  };

  const handleNext = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(prev => prev + 1);
    } else if (isComplete) {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    } else {
      onBack();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">Career Personality Assessment</h2>
          <p className="text-lg text-muted-foreground mb-4">
            Discover your Holland Code (RIASEC) profile
          </p>
          <Progress value={progress} className="h-3 mb-2" data-testid="progress-riasec" />
          <p className="text-sm text-muted-foreground">
            {Object.keys(responses).length} of {ITEMS.length} questions answered
          </p>
        </div>

        {/* Questions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {currentItems.map((item, index) => {
              const themeInfo = THEME_INFO[item.theme];
              const Icon = themeInfo.icon;
              const globalIndex = currentPage * itemsPerPage + index;

              return (
                <StickyNote
                  key={item.id}
                  color={themeInfo.color as any}
                  rotation={index % 2 === 0 ? "-1" : "1"}
                  className="p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-semibold text-primary">
                          Question {globalIndex + 1}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({themeInfo.name})
                        </span>
                      </div>
                      <p className="text-lg font-medium mb-4">{item.text}</p>
                      
                      <RadioGroup
                        value={responses[item.id]?.toString()}
                        onValueChange={(value) => handleResponse(item.id, parseInt(value) as Likert)}
                        data-testid={`riasec-question-${item.id}`}
                      >
                        <div className="grid grid-cols-5 gap-2">
                          {LIKERT_OPTIONS.map((option) => (
                            <div key={option.value} className="flex flex-col items-center">
                              <RadioGroupItem
                                value={option.value.toString()}
                                id={`${item.id}-${option.value}`}
                                className="mb-2"
                                data-testid={`riasec-option-${item.id}-${option.value}`}
                              />
                              <Label
                                htmlFor={`${item.id}-${option.value}`}
                                className="text-xs text-center cursor-pointer"
                              >
                                {option.label}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                </StickyNote>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            data-testid="button-riasec-previous"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {currentPage === 0 ? "Back" : "Previous"}
          </Button>

          <div className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </div>

          <Button
            onClick={handleNext}
            disabled={!isPageComplete && currentPage < totalPages - 1}
            data-testid="button-riasec-next"
          >
            {currentPage === totalPages - 1 ? "Complete Assessment" : "Next"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Help Text */}
        <Card className="mt-8 p-6 bg-accent/10">
          <h3 className="font-semibold mb-3">About This Assessment</h3>
          <p className="text-sm text-muted-foreground mb-3">
            The Holland Code (RIASEC) helps identify your career personality across six themes:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {(Object.keys(THEME_INFO) as Theme[]).map(theme => {
              const info = THEME_INFO[theme];
              const Icon = info.icon;
              return (
                <div key={theme} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <div>
                    <span className="font-semibold">{info.name}</span>
                    <p className="text-xs text-muted-foreground">{info.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
