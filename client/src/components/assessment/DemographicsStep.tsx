import { useState, useEffect } from "react";
import { Link } from "wouter";
import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Cake, GraduationCap, Users2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DemographicsStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
  predefinedGrade?: string | null;
  predefinedName?: string | null;
  predefinedAge?: number | null;
  predefinedGender?: string | null;
}

// Helper function to convert grade codes to readable labels
const getGradeLabel = (gradeCode: string): string => {
  const gradeMap: Record<string, string> = {
    'grade8': 'Grade 8',
    'grade9': 'Grade 9',
    'grade10': 'Grade 10',
    'grade11': 'Grade 11',
    'grade12': 'Grade 12',
    'graduated': 'Recently Graduated'
  };
  return gradeMap[gradeCode] || gradeCode;
};

export function DemographicsStep({ data, onUpdate, onNext, predefinedGrade, predefinedName, predefinedAge, predefinedGender }: DemographicsStepProps) {
  const { t } = useTranslation('assessment');
  const [isMobile, setIsMobile] = useState(false);
  
  // Detect if user is an organization student (has predefinedGrade)
  const isOrgStudent = !!predefinedGrade;
  
  // Pre-fill all fields if predefined and not already set (only depend on predefined values to avoid redundant re-runs)
  useEffect(() => {
    if (predefinedGrade && !data.grade) {
      onUpdate("grade", predefinedGrade);
    }
    if (predefinedName && !data.name) {
      onUpdate("name", predefinedName);
    }
    if ((predefinedAge !== null && predefinedAge !== undefined) && !data.age) {
      onUpdate("age", predefinedAge);
    }
    if (predefinedGender && !data.gender) {
      onUpdate("gender", predefinedGender);
    }
    // Auto-check consent for organization students (institutional consent)
    if (isOrgStudent && !data.consentGiven) {
      onUpdate("consentGiven", true);
    }
    // Only run when predefined values change (not data values) to prevent re-render loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predefinedGrade, predefinedName, predefinedAge, predefinedGender]);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /iphone|ipad|ipod|android|webos|blackberry|windows phone/i.test(userAgent);
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(isMobileDevice || isTouchDevice);
    };
    
    checkMobile();
  }, []);

  const canProceed = data.name && data.age && data.grade && data.gender && data.consentGiven;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">{t('demographics.title')}</h2>
        <p className="text-lg text-muted-foreground font-body">
          {t('demographics.subtitle')}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <StickyNote color="yellow" rotation="-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <Label htmlFor="name" className="text-lg font-semibold">
                {t('demographics.name')} {predefinedName && <span className="text-xs text-muted-foreground font-normal ml-2">({t('demographics.setBySchool')})</span>}
              </Label>
            </div>
          </div>
          <Input
            id="name"
            type="text"
            placeholder={t('demographics.namePlaceholder')}
            value={data.name}
            onChange={(e) => onUpdate("name", e.target.value)}
            disabled={!!predefinedName}
            className="bg-background/50 border-foreground/20"
            data-testid="input-name"
          />
        </StickyNote>

        <StickyNote color="pink" rotation="1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Cake className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <Label htmlFor="age" className="text-lg font-semibold">
                {t('demographics.age')} {predefinedAge && <span className="text-xs text-muted-foreground font-normal ml-2">({t('demographics.setBySchool')})</span>}
              </Label>
            </div>
          </div>
          <Input
            id="age"
            type="number"
            min="13"
            max="25"
            placeholder={t('demographics.agePlaceholder')}
            value={data.age || ""}
            onChange={(e) => onUpdate("age", parseInt(e.target.value) || null)}
            disabled={!!predefinedAge}
            className="bg-background/50 border-foreground/20"
            data-testid="input-age"
          />
        </StickyNote>

        <StickyNote color="blue" rotation="2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <Label htmlFor="grade" className="text-lg font-semibold">
                {t('demographics.grade')} {predefinedGrade && <span className="text-xs text-muted-foreground font-normal ml-2">({t('demographics.setBySchoolGrade', { grade: getGradeLabel(predefinedGrade) })})</span>}
              </Label>
            </div>
          </div>
          {isMobile ? (
            <select
              id="grade"
              value={data.grade || ""}
              onChange={(e) => onUpdate("grade", e.target.value)}
              disabled={!!predefinedGrade}
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background/50 border-foreground/20 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="select-grade"
            >
              <option value="">{t('demographics.selectGrade')}</option>
              <option value="grade8">{t('demographics.grade8')}</option>
              <option value="grade9">{t('demographics.grade9')}</option>
              <option value="grade10">{t('demographics.grade10')}</option>
              <option value="grade11">{t('demographics.grade11')}</option>
              <option value="grade12">{t('demographics.grade12')}</option>
              <option value="graduated">{t('demographics.graduated')}</option>
            </select>
          ) : (
            <Select value={data.grade} onValueChange={(value) => onUpdate("grade", value)} disabled={!!predefinedGrade}>
              <SelectTrigger className="bg-background/50 border-foreground/20" disabled={!!predefinedGrade} data-testid="select-grade">
                <SelectValue placeholder={t('demographics.selectGrade')} />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[9999]">
                <SelectItem value="grade8">{t('demographics.grade8')}</SelectItem>
                <SelectItem value="grade9">{t('demographics.grade9')}</SelectItem>
                <SelectItem value="grade10">{t('demographics.grade10')}</SelectItem>
                <SelectItem value="grade11">{t('demographics.grade11')}</SelectItem>
                <SelectItem value="grade12">{t('demographics.grade12')}</SelectItem>
                <SelectItem value="graduated">{t('demographics.graduated')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </StickyNote>

        <StickyNote color="green" rotation="-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <Label htmlFor="gender" className="text-lg font-semibold">
                {t('demographics.gender')} {predefinedGender && <span className="text-xs text-muted-foreground font-normal ml-2">({t('demographics.setBySchool')})</span>}
              </Label>
            </div>
          </div>
          {isMobile ? (
            <select
              id="gender"
              value={data.gender || ""}
              onChange={(e) => onUpdate("gender", e.target.value)}
              disabled={!!predefinedGender}
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background/50 border-foreground/20 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="select-gender"
            >
              <option value="">{t('demographics.selectGender')}</option>
              <option value="male">{t('demographics.male')}</option>
              <option value="female">{t('demographics.female')}</option>
            </select>
          ) : (
            <Select value={data.gender} onValueChange={(value) => onUpdate("gender", value)} disabled={!!predefinedGender}>
              <SelectTrigger className="bg-background/50 border-foreground/20" disabled={!!predefinedGender} data-testid="select-gender">
                <SelectValue placeholder={t('demographics.selectGender')} />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[9999]">
                <SelectItem value="male">{t('demographics.male')}</SelectItem>
                <SelectItem value="female">{t('demographics.female')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </StickyNote>
      </div>

      {/* Consent Section */}
      <div className="max-w-3xl mx-auto mt-8">
        <StickyNote color="purple" rotation="0">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-3">{t('demographics.beforeContinue')}</h3>
            
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent"
                checked={data.consentGiven || false}
                onCheckedChange={(checked) => onUpdate("consentGiven", checked)}
                disabled={isOrgStudent}
                className="mt-1"
                data-testid="checkbox-consent"
              />
              <div className="flex-1">
                {isOrgStudent ? (
                  <Label htmlFor="consent" className="text-sm font-body leading-relaxed">
                    {t('demographics.consentOrg')}{" "}
                    <Link href="/terms" className="text-primary hover:underline font-semibold" data-testid="link-consent-terms">
                      {t('demographics.termsOfUse')}
                    </Link>
                    {" "}{t('demographics.and')}{" "}
                    <Link href="/privacy" className="text-primary hover:underline font-semibold" data-testid="link-consent-privacy">
                      {t('demographics.privacyPolicy')}
                    </Link>
                    .
                  </Label>
                ) : (
                  <Label htmlFor="consent" className="text-sm font-body leading-relaxed cursor-pointer">
                    {t('demographics.consentAgree')}{" "}
                    <Link href="/terms" className="text-primary hover:underline font-semibold" data-testid="link-consent-terms">
                      {t('demographics.termsOfUse')}
                    </Link>
                    {" "}{t('demographics.and')}{" "}
                    <Link href="/privacy" className="text-primary hover:underline font-semibold" data-testid="link-consent-privacy">
                      {t('demographics.privacyPolicy')}
                    </Link>
                    . {t('demographics.consentDisclaimer')}{" "}
                    <Link href="/disclaimer" className="text-primary hover:underline font-semibold" data-testid="link-consent-disclaimer">
                      {t('demographics.disclaimer')}
                    </Link>
                    .
                  </Label>
                )}
              </div>
            </div>
            
            {!isOrgStudent && data.age && data.age < 18 && (
              <p className="text-xs text-muted-foreground font-body mt-2 ml-7">
                {t('demographics.under18Note')}
              </p>
            )}
          </div>
        </StickyNote>
      </div>

      <div className="flex justify-center pt-8">
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-demographics"
        >
          {t('nav.continue')}
        </Button>
      </div>
    </div>
  );
}
