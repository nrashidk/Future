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
import { SchoolConsentNotice } from "./SchoolConsentNotice";

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
   * school owns (14459a4). Served by /api/auth/user.
   *
   * THREE-STATE, and the caller must keep it that way: true, false, or undefined
   * for "not known yet". Do not coerce it on the way in — `!!value` turns an
   * unresolved auth query into "not a school student" and unlocks five fields
   * the server is about to overwrite.
   */
  isOrgStudent?: boolean;
  /** The school's name, for the consent notice. Undefined until auth resolves. */
  organizationName?: string | null;
}

export function DemographicsStep({ data, onUpdate, onNext, predefinedGrade, predefinedName, predefinedAge, predefinedGender, isOrgStudent: isOrgStudentProp, organizationName }: DemographicsStepProps) {
  const { t } = useTranslation('assessment');

  const [isMobile, setIsMobile] = useState(false);
  
  // The three fields the school states on the student's behalf, and which the
  // server overwrites with the school's values on every save
  // (assessment.routes.ts, SCHOOL_OWNED_ASSESSMENT_FIELDS). Shown rather than
  // hidden: this screen is the only place anyone sees what the school recorded,
  // so it is the only chance to notice a wrong name, grade or gender.
  //
  // UNKNOWN LOCKS. `!== false` rather than a truthiness test: only a positive
  // "not a school student" unlocks. undefined means the caller does not yet know
  // — the auth request is in flight — and unlocking on that would offer an edit
  // the server is about to discard. Same rule as 7aabc13. The old
  // `?? !!predefinedGrade` fallback is gone with it: inferring membership from
  // whether a value happens to be present is what this prop replaced.
  const schoolOwnsDemographics = isOrgStudentProp !== false;

  // Consent goes the OTHER way on the same unknown, and it still must.
  //
  // The org branch no longer collects anything — the school consented, so the
  // student is shown a statement rather than a control (SchoolConsentNotice).
  // But the FREE branch still has a real self-tick, and `undefined` here means
  // the auth request is in flight. Resolving unknown to "school student" would
  // swap that student's live consent checkbox for a notice claiming a school
  // consented for them, and drop consentGiven out of canProceed while it did so.
  // Locking a field we may not own costs a moment of a disabled input; telling
  // someone their school agreed on their behalf when no school did is not
  // recoverable by re-rendering.
  //
  // So: `=== true`, never `!== false`, and never schoolOwnsDemographics — that
  // one unlocks on unknown, which is right for locking fields and wrong here.
  const isOrgStudent = isOrgStudentProp === true;
  
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
    // The org auto-tick that used to live here is gone with the checkbox it fed.
    // It set consentGiven=true so a disabled, pre-ticked box would satisfy
    // canProceed; both the box and that dependence are removed below, and
    // consentGiven was never persisted anywhere, so nothing else read it.
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

  /**
   * WHAT GATES PROGRESSION, AND FOR WHOM.
   *
   * Free: unchanged — the four demographics plus the student's own tick, which
   * is a real choice they make.
   *
   * School: the four demographics only. There is no tick to wait for, because
   * the school consented and the student is not being asked. All four are
   * pre-filled from the organization and locked, so Continue is enabled on
   * arrival — which is what it already did, except that it previously depended
   * on an auto-ticked checkbox to get there.
   *
   * Nothing strands a school student here: a student whose school has no date of
   * birth on record is stopped earlier, at the assessment entry point with an
   * explanation (Assessment.tsx), rather than at a locked empty field with a
   * dead Next button.
   */
  const canProceed = isOrgStudent
    ? Boolean(data.name && data.age && data.grade && data.gender)
    : Boolean(data.name && data.age && data.grade && data.gender && data.consentGiven);

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
                {t('demographics.name')} {schoolOwnsDemographics && <span className="text-xs text-muted-foreground font-normal ms-2">({t('demographics.setBySchool')})</span>}
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
                {/* The marker now applies, where it previously did not. It used
                    to read "age is the one demographic the student still owns,
                    so labelling it as the school's would be a lie the field
                    itself contradicts" — true while there was no school-side
                    source for it. There is one now: the school records a date of
                    birth and the server derives this age from it, so the field
                    IS the school's and saying so is the honest label. */}
                {t('demographics.age')} {schoolOwnsDemographics && <span className="text-xs text-muted-foreground font-normal ms-2">({t('demographics.setBySchool')})</span>}
              </Label>
            </div>
          </div>
          {/* Age IS locked for school students now, like the three fields
              around it. This block used to say the opposite, and the reason it
              gave was accurate at the time: organization_members.student_age was
              nullable, excluded from the demographics CHECK and NULL on every
              row, so there was no school value to hold the student to (migration
              014:29-38). Migration 015 added date_of_birth, the school records
              it at student-create, and the server derives this age from it — so
              a school value exists and the student is held to it, exactly as
              they are for name, grade and gender.

              GATED ON schoolOwnsDemographics, NOT ON !!predefinedAge. The old
              block closed with a warning aimed squarely at this change: the
              field had once been disabled on `!!predefinedAge`, which "would
              have silently locked a field the server still lets the student
              edit the moment an age appeared". Keying on whether a value
              happens to have arrived conflates "this student's school owns this
              field" with "a value turned up", the same category error as
              deriving isOrgStudent from `!!predefinedGrade`. The gate has to be
              about WHO THE STUDENT IS.

              A school student never sees this empty. One whose school has no
              date of birth on record is stopped at the assessment entry point
              with an explanation (Assessment.tsx), because the server's
              fail-closed guard is at assessment create — three steps after this
              screen — and a locked, empty, required field with a dead Next
              button is a dead end a 13-year-old cannot get out of.

              SELF-PAID PATH UNCHANGED: editable, min 13 / max 25, no marker.
              min/max are left on the element for both, though they constrain
              only the path that can still type into it. */}
          <Input
            id="age"
            type="number"
            min="13"
            max="25"
            placeholder={t('demographics.agePlaceholder')}
            value={data.age || ""}
            onChange={(e) => onUpdate("age", parseInt(e.target.value) || null)}
            disabled={schoolOwnsDemographics}
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
                {t('demographics.grade')} {schoolOwnsDemographics && <span className="text-xs text-muted-foreground font-normal ms-2">({t('demographics.setBySchool')})</span>}
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
                {t('demographics.gender')} {schoolOwnsDemographics && <span className="text-xs text-muted-foreground font-normal ms-2">({t('demographics.setBySchool')})</span>}
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

      {/* CONSENT SECTION — two different things, not two labels for one thing.
          School: a statement. The school consented; the student is told, and
          there is no control because they are not being asked.
          Free: a real self-tick, unchanged. */}
      {isOrgStudent ? (
        <div className="max-w-3xl mx-auto mt-8">
          <SchoolConsentNotice schoolName={organizationName} />
        </div>
      ) : (
        <div className="max-w-3xl mx-auto mt-8">
          <StickyNote color="purple" rotation="0">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-3">{t('demographics.beforeContinue')}</h3>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent"
                  checked={data.consentGiven || false}
                  onCheckedChange={(checked) => onUpdate("consentGiven", checked)}
                  className="mt-1"
                  data-testid="checkbox-consent"
                />
                <div className="flex-1">
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
                </div>
              </div>

              {/* UNCHANGED, AND STILL UNBACKED. This note promises parental or
                  institutional consent for an under-18 self-paid student, and no
                  parental mechanism exists behind it. The school attestation
                  covers the institutional half for school students, who never
                  see this branch. Tracked in FOLLOWUP.md as its own item; not
                  fixed here, because what a 13-year-old self-consenting should
                  actually require is undecided. */}
              {data.age && data.age < 18 && (
                <p className="text-xs text-muted-foreground font-body mt-2 ms-7">
                  {t('demographics.under18Note')}
                </p>
              )}
            </div>
          </StickyNote>
        </div>
      )}

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
