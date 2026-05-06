import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { StickyNote } from "@/components/StickyNote";
import { 
  Heart, 
  Target, 
  Globe, 
  Sparkles, 
  Shield, 
  Crown,
  Smile,
  ArrowRight,
  ArrowLeft,
  Clock
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";

/**
 * Personal Values Assessment
 * Integrated into Future Pathways sticky notes design
 * 21 questions across 7 value domains
 */

export type CVQDomain = "achievement" | "benevolence" | "universalism" | "self_direction" | "security" | "power" | "hedonism";
export type Likert = 1 | 2 | 3 | 4 | 5;

export type CVQItem = {
  id: string;
  domain: CVQDomain;
  text: string;
  isReverseScored: boolean;
  position: number;
};

interface CVQStepProps {
  assessmentId: string;
  responses: Record<string, number>;
  onUpdate: (responses: Record<string, number>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function CVQStep({ assessmentId, responses, onUpdate, onNext, onBack }: CVQStepProps) {
  const { t } = useTranslation('assessment');

  const DOMAIN_INFO: Record<CVQDomain, { name: string; icon: any; color: string; description: string }> = {
    achievement: { name: t('cvq.domainAchievement'), icon: Target, color: "yellow", description: t('cvq.domainAchievementDesc') },
    benevolence: { name: t('cvq.domainBenevolence'), icon: Heart, color: "pink", description: t('cvq.domainBenevolenceDesc') },
    universalism: { name: t('cvq.domainUniversalism'), icon: Globe, color: "green", description: t('cvq.domainUniversalismDesc') },
    self_direction: { name: t('cvq.domainSelfDirection'), icon: Sparkles, color: "purple", description: t('cvq.domainSelfDirectionDesc') },
    security: { name: t('cvq.domainSecurity'), icon: Shield, color: "blue", description: t('cvq.domainSecurityDesc') },
    power: { name: t('cvq.domainPower'), icon: Crown, color: "amber", description: t('cvq.domainPowerDesc') },
    hedonism: { name: t('cvq.domainHedonism'), icon: Smile, color: "orange", description: t('cvq.domainHedonismDesc') },
  };

  const LIKERT_OPTIONS = [
    { value: 1, label: t('cvq.likert1') },
    { value: 2, label: t('cvq.likert2') },
    { value: 3, label: t('cvq.likert3') },
    { value: 4, label: t('cvq.likert4') },
    { value: 5, label: t('cvq.likert5') },
  ];
  const [localResponses, setLocalResponses] = useState<Record<string, Likert>>(responses as Record<string, Likert>);
  const [currentPage, setCurrentPage] = useState(0);
  const [startTime] = useState(Date.now());
  
  const itemsPerPage = 3;

  // Fetch CVQ items from API
  const { data: cvqItems = [], isLoading } = useQuery<CVQItem[]>({
    queryKey: ['/api/cvq/items'],
    select: (data: any) => {
      const items = data.items || [];
      const lang = localStorage.getItem('fp_language') || 'en';
      // Map snake_case API response to camelCase for frontend
      return items.map((item: any) => ({
        id: item.id,
        domain: item.domain as CVQDomain,
        text: lang === 'ar' && item.textAr ? item.textAr : item.text,
        isReverseScored: item.is_reverse_scored || false,
        position: item.position,
      }));
    },
  });

  const totalPages = Math.ceil(cvqItems.length / itemsPerPage);
  const currentItems = useMemo(() => {
    const start = currentPage * itemsPerPage;
    return cvqItems.slice(start, start + itemsPerPage);
  }, [cvqItems, currentPage]);

  const progress = (Object.keys(localResponses).length / cvqItems.length) * 100;
  const allAnswered = cvqItems.length > 0 && Object.keys(localResponses).length === cvqItems.length;

  // Save draft to sessionStorage on change (cleared on tab close for shared/school computers)
  useEffect(() => {
    if (Object.keys(localResponses).length > 0) {
      sessionStorage.setItem("cvq_draft", JSON.stringify(localResponses));
    }
  }, [localResponses]);

  const handleResponseChange = (itemId: string, value: Likert) => {
    setLocalResponses(prev => ({ ...prev, [itemId]: value }));
  };

  const handleNext = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevious = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const submitMutation = useMutation({
    mutationFn: async (data: { assessmentId: string; responses: Record<string, number>; durationSeconds: number }) => {
      const response = await apiRequest("POST", "/api/cvq/submit", data);
      return response.json();
    },
    onSuccess: (result) => {
      // Clear draft
      sessionStorage.removeItem("cvq_draft");
      // Pass normalized scores back to parent
      onUpdate(localResponses);
      onNext();
    },
  });

  const handleSubmit = () => {
    if (!allAnswered) return;
    
    const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
    submitMutation.mutate({
      assessmentId,
      responses: localResponses,
      durationSeconds,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Clock className="w-12 h-12 text-primary animate-pulse" />
        <p className="text-lg text-muted-foreground">{t('cvq.loading')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold">{t('cvq.title')}</h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          {t('cvq.subtitle')}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{t('cvq.progress', { answered: Object.keys(localResponses).length, total: cvqItems.length })}</span>
          <span>{t('nav.pageOf', { page: currentPage + 1, total: totalPages })}</span>
        </div>
        <Progress value={progress} className="h-2" data-testid="progress-cvq" />
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
            const domainInfo = DOMAIN_INFO[item.domain];
            const Icon = domainInfo.icon;
            const answered = item.id in localResponses;
            
            return (
              <StickyNote
                key={item.id}
                color={domainInfo.color as any}
                data-testid={`cvq-question-${index}`}
              >
                <div className="space-y-4">
                  {/* Question Header */}
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-${domainInfo.color}-100 dark:bg-${domainInfo.color}-900/20`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                          {domainInfo.name}
                        </span>
                        {answered && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            {t('cvq.answered')}
                          </span>
                        )}
                      </div>
                      <p className="text-base font-medium leading-relaxed">
                        {item.text}
                      </p>
                    </div>
                  </div>

                  {/* Likert Scale */}
                  <RadioGroup
                    value={localResponses[item.id]?.toString() || ""}
                    onValueChange={(value) => handleResponseChange(item.id, parseInt(value) as Likert)}
                    className="flex flex-wrap gap-2"
                    data-testid={`radio-group-${index}`}
                  >
                    {LIKERT_OPTIONS.map((option) => (
                      <div key={option.value} className="flex-1 min-w-[100px]">
                        <RadioGroupItem
                          value={option.value.toString()}
                          id={`${item.id}-${option.value}`}
                          className="peer sr-only"
                          data-testid={`radio-option-${index}-${option.value}`}
                        />
                        <Label
                          htmlFor={`${item.id}-${option.value}`}
                          className="flex flex-col items-center justify-center rounded-lg border-2 border-border bg-background p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all"
                        >
                          <span className="text-2xl font-bold mb-1">{option.value}</span>
                          <span className="text-xs text-center leading-tight">{option.label}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </StickyNote>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-4">
        <Button
          variant="outline"
          onClick={currentPage === 0 ? onBack : handlePrevious}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 me-2" />
          {currentPage === 0 ? t('nav.back') : t('nav.previous')}
        </Button>

        <div className="text-sm text-muted-foreground">
          {!allAnswered && (
            <span>{t('cvq.answerAll')}</span>
          )}
        </div>

        {currentPage < totalPages - 1 ? (
          <Button
            onClick={handleNext}
            data-testid="button-next-page"
          >
            {t('nav.next')}
            <ArrowRight className="w-4 h-4 ms-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!allAnswered || submitMutation.isPending}
            data-testid="button-submit-cvq"
          >
            {submitMutation.isPending ? t('cvq.submitting') : t('cvq.complete')}
            <ArrowRight className="w-4 h-4 ms-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
