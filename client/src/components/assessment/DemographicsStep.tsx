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
  /**
   * True when the viewer holds an organization_members row with role 'student'
   * — the same test PATCH /api/assessments/:id uses to decide which fields the
   * school owns (14459a4). Authoritative, and served by /api/auth/user; the
   * `!!predefinedGrade` inference below is only a fallback for a caller that
   * does not pass it.
   */
  isOrgStudent?: boolean;
}

export function DemographicsStep({ data, onUpdate, onNext, predefinedGrade, predefinedName, predefinedAge, predefinedGender, isOrgStudent: isOrgStudentProp }: DemographicsStepProps) {
  const { t } = useTranslation('assessment');

  // Convert grade codes to localized labels using i18n keys
  const getGradeLabel = (gradeCode: string): string => {
    const gradeKeyMap: Record<string, string> = {
      'grade8': 'demographics.grade8',
      'grade9': 'demographics.grade9',
      'grade10': 'demographics.grade10',
      'grade11': 'demographics.grade11',
      'grade12': 'demographics.grade12',
      'graduated': 'demographics.graduated',
    };
    const key = gradeKeyMap[gradeCode];
    return key ? t(key) : gradeCode;
  };
  const [isMobile, setIsMobile] = useState(false);
  
  // Whether the school owns this student's demographics. Prefer the server's
  // flag; fall back to inferring from a pre-filled grade only so an older caller
  // keeps working. Inference is the weaker test — it asks "is a value present"
  // rather than "is this a school student".
  const isOrgStudent = isOrgStudentProp ?? !!predefinedGrade;

  // The three the school states on the student's behalf, and which the server
  // overwrites with the school's values on every save (assessment.routes.ts,
  // SCHOOL_OWNED_ASSESSMENT_FIELDS). Shown rather than hidden: this screen is
  // the only place anyone sees what the school recorded, so it is the only
  // chance to notice a wrong name, grade or gender.
  const schoolOwnsDemographics = isOrgStudent;
  
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

      {/* Locked fields are shown, not hidden, so this line has to say why they
          cannot be edited and who can change them. A disabled input with no
          explanation reads as a broken form, and this screen is the only place
          a student ever sees what their school recorded about them. */}
      {schoolOwnsDemographics && (
        <p
          className="text-sm text-muted-foreground text-center max-w-2xl mx-auto -mt-4"
          data-testid="note-demographics-school-owned"
        >
          {t('demographics.schoolOwnedNote')}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <StickyNote color="yellow" rotation="-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <Label htmlFor="name" className="text-lg font-semibold">
                {t('demographics.name')} {predefinedName && <span className="text-xs text-muted-foreground font-normal ms-2">({t('demographics.setBySchool')})</span>}
              </Label>
            </div>
          </div>
          <Input
            id="name"
            type="text"
            placeholder={t('demographics.namePlaceholder')}
            value={data.name}
            onChange={(e) => onUpdate("name", e.target.value)}
            disabled={schoolOwnsDemographics}
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
                {/* No "set by school" marker: age is the one demographic the
                    student still owns, so labelling it as the school's would be
                    a lie the field itself contradicts. */}
                {t('demographics.age')}
              </Label>
            </div>
          </div>
          {/* Age is NOT locked, unlike the three fields around it. The server
              does not own it: organization_members.student_age is nullable,
              excluded from the demographics CHECK and NULL on every row, so
              there is no school value to hold the student to (migration
              014:29-38). It was disabled on `!!predefinedAge` — never true
              today, but that would have silently locked a field the server
              still lets the student edit the moment an age appeared. */}
          <Input
            id="age"
            type="number"
            min="13"
            max="25"
            placeholder={t('demographics.agePlaceholder')}
            value={data.age || ""}
            onChange={(e) => onUpdate("age", parseInt(e.target.value) || null)}
            disabled={false}
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
                {t('demographics.grade')} {predefinedGrade && <span className="text-xs text-muted-foreground font-normal ms-2">({t('demographics.setBySchoolGrade', { grade: getGradeLabel(predefinedGrade) })})</span>}
              </Label>
            </div>
          </div>
          {isMobile ? (
            <select
              id="grade"
              value={data.grade || ""}
              onChange={(e) => onUpdate("grade", e.target.value)}
              disabled={schoolOwnsDemographics}
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
            <Select value={data.grade} onValueChange={(value) => onUpdate("grade", value)} disabled={schoolOwnsDemographics}>
              <SelectTrigger className="bg-background/50 border-foreground/20" disabled={schoolOwnsDemographics} data-testid="select-grade">
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
                {t('demographics.gender')} {predefinedGender && <span className="text-xs text-muted-foreground font-normal ms-2">({t('demographics.setBySchool')})</span>}
              </Label>
            </div>
          </div>
          {isMobile ? (
            <select
              id="gender"
              value={data.gender || ""}
              onChange={(e) => onUpdate("gender", e.target.value)}
              disabled={schoolOwnsDemographics}
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background/50 border-foreground/20 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="select-gender"
            >
              <option value="">{t('demographics.selectGender')}</option>
              <option value="male">{t('demographics.male')}</option>
              <option value="female">{t('demographics.female')}</option>
            </select>
          ) : (
            <Select value={data.gender} onValueChange={(value) => onUpdate("gender", value)} disabled={schoolOwnsDemographics}>
              <SelectTrigger className="bg-background/50 border-foreground/20" disabled={schoolOwnsDemographics} data-testid="select-gender">
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
              <p className="text-xs text-muted-foreground font-body mt-2 ms-7">
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
