import { useState, useEffect } from "react";
import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Globe2, Target, Eye, ChevronDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";

interface CountryStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
  onBack?: () => void;
  /**
   * True when the viewer holds an organization_members row with role 'student'
   * — the same test PATCH /api/assessments/:id uses to decide which fields the
   * school owns (14459a4). Country and curriculum are two of the five: the
   * school picks them once for everyone it enrols, and the server overwrites
   * whatever the student sends.
   */
  isOrgStudent?: boolean;
}

export function CountryStep({ data, onUpdate, onNext, onBack, isOrgStudent }: CountryStepProps) {
  const { t } = useTranslation('assessment');
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const [selectedCountryId, setSelectedCountryId] = useState(data.countryId || "");
  const [selectedCurriculum, setSelectedCurriculum] = useState(data.curriculum || "");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  const isMobile = typeof window !== 'undefined' && (
    /iphone|ipad|ipod|android|webos|blackberry|windows phone/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 1024)
  );

  const { data: countries = [], isLoading: countriesLoading, error: countriesError } = useQuery<any[]>({
    queryKey: ["/api/countries"],
  });

  useEffect(() => {
    if (countriesError) {
      console.error("Countries loading error:", countriesError);
    }
    if (countries) {
      // countries loaded
    }
  }, [countries, countriesError]);

  // Adopt a country/curriculum that arrives from the parent AFTER mount.
  // The two useState calls above seed from `data` once, so an org student whose
  // `user` record resolves after this step mounted would see an empty <Select>
  // while the parent already held their school's country — and `canProceed`
  // would block them until they re-picked it by hand. Country is now step 2,
  // reached directly by the demographics smart-skip, so that window is small
  // but real.
  //
  // Only fills a BLANK local value: a student's own selection is never
  // overwritten, and clearing the country deliberately (handleCountryChange
  // resets curriculum to "") is not undone, because the parent is cleared too.
  useEffect(() => {
    if (data.countryId && !selectedCountryId) {
      setSelectedCountryId(data.countryId);
    }
  }, [data.countryId, selectedCountryId]);

  useEffect(() => {
    if (data.curriculum && !selectedCurriculum) {
      setSelectedCurriculum(data.curriculum);
    }
  }, [data.curriculum, selectedCurriculum]);

  const { data: countryDetails } = useQuery<any>({
    queryKey: ["/api/countries", selectedCountryId],
    enabled: !!selectedCountryId,
  });

  const availableCurricula = countryDetails?.curricula || [];

  const handleCountryChange = (countryId: string) => {
    setSelectedCountryId(countryId);
    setSelectedCurriculum(""); // Reset curriculum when country changes
    onUpdate("countryId", countryId);
    onUpdate("curriculum", "");
    setIsDetailsOpen(false);
  };

  const handleCurriculumChange = (curriculum: string) => {
    setSelectedCurriculum(curriculum);
    onUpdate("curriculum", curriculum);
  };

  // Can proceed if country is selected AND (either no curricula available OR curriculum is selected)
  //
  // For an org student the values come from the school, not from these controls,
  // so availableCurricula must not gate them: that list is fetched from the
  // country and can legitimately fail to contain the school's curriculum (see
  // the rename-cascade note below). Gating on it would strand the student on a
  // step with nothing to interact with. The school-side values are guaranteed
  // present by the enrolment guard (549cd43), and the server 400s if they are
  // not, so there is nothing left for this step to validate.
  const canProceed = isOrgStudent
    ? !!selectedCountryId && !!selectedCurriculum
    : !!selectedCountryId && (availableCurricula.length === 0 || !!selectedCurriculum);

  if (countriesLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">{t('country.title')}</h2>
          <p className="text-lg text-muted-foreground font-body">
            {t('country.loading')}
          </p>
        </div>
      </div>
    );
  }

  if (countriesError) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">{t('country.title')}</h2>
          <p className="text-lg text-destructive font-body">
            {t('country.error')}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {countriesError instanceof Error ? countriesError.message : t('country.unknownError')}
          </p>
        </div>
      </div>
    );
  }

  if (!countries || countries.length === 0) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">{t('country.title')}</h2>
          <p className="text-lg text-muted-foreground font-body">
            {t('country.noCountries')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">{t('country.title')}</h2>
        <p className="text-lg text-muted-foreground font-body">
          {t('country.subtitle')}
        </p>
      </div>

      {/* The step is NOT skipped for org students and the step count does not
          change — everyone sees the same "Step N of 8". What changes is that the
          two fields are shown as confirmation rather than as a choice.

          Rendered as read-only VALUES, not as disabled <Select>s, unlike the
          Basic Info step. A disabled Select can only display a value that is in
          its option list, and the school's curriculum can legitimately be absent
          from countries.curricula: the superadmin rename cascade rewrites
          countries, subjects and quiz_questions but not organizations.curriculum
          (FOLLOWUP.md, aa1d13c), leaving schools holding a string the list no
          longer contains. A disabled Select would then show an empty box for a
          value the server is about to write. Text shows what is actually stored. */}
      {isOrgStudent ? (
        <StickyNote color="blue" rotation="1" className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Globe2 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold">{t('country.setBySchoolTitle')}</h3>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-foreground/70 font-body mb-1">{t('country.selectCountry')}</p>
              <p className="text-lg font-semibold" data-testid="text-school-country">
                {(() => {
                  const own = countries.find((c: any) => c.id === selectedCountryId);
                  if (!own) return selectedCountryId || t('country.notSetBySchool');
                  return own.flag ? `${own.flag} ${own.name}` : own.name;
                })()}
              </p>
            </div>

            <div>
              <p className="text-sm text-foreground/70 font-body mb-1">{t('country.selectCurriculum')}</p>
              <p className="text-lg font-semibold" data-testid="text-school-curriculum">
                {selectedCurriculum || t('country.notSetBySchool')}
              </p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mt-4" data-testid="note-country-school-owned">
            {t('country.schoolOwnedNote')}
          </p>
        </StickyNote>
      ) : (
      <StickyNote color="blue" rotation="1" className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Globe2 className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">{t('country.selectCountry')}</h3>
        </div>
        {isMobile ? (
          <select
            value={selectedCountryId}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background/50 border-foreground/20 px-3 py-2 text-lg ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="select-country"
          >
            <option value="">{t('country.chooseCountry')}</option>
            {countries.map((country: any) => (
              <option key={country.id} value={country.id}>
                {country.flag ? `${country.flag} ${country.name}` : country.name}
              </option>
            ))}
          </select>
        ) : (
          <Select value={selectedCountryId} onValueChange={handleCountryChange}>
            <SelectTrigger className="bg-background/50 border-foreground/20 text-lg" data-testid="select-country">
              <SelectValue placeholder={t('country.chooseCountry')} />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[9999] max-h-[300px]">
              {countries.map((country: any) => (
                <SelectItem key={country.id} value={country.id}>
                  <span className="flex items-center gap-2">
                    {country.flag && <span aria-hidden="true">{country.flag}</span>}
                    <span>{country.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </StickyNote>
      )}

      {!isOrgStudent && selectedCountryId && availableCurricula.length > 0 && (
        <StickyNote color="green" rotation="-1" className="max-w-2xl mx-auto animate-in fade-in duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Target className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">{t('country.selectCurriculum')}</h3>
              <p className="text-sm text-foreground/70 font-body">
                {t('country.curriculumHint')}
              </p>
            </div>
          </div>
          {isMobile ? (
            <select
              value={selectedCurriculum}
              onChange={(e) => handleCurriculumChange(e.target.value)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background/50 border-foreground/20 px-3 py-2 text-lg ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="select-curriculum"
            >
              <option value="">{t('country.chooseCurriculum')}</option>
              {availableCurricula.map((curriculum: string) => (
                <option key={curriculum} value={curriculum}>
                  {curriculum}
                </option>
              ))}
            </select>
          ) : (
            <Select value={selectedCurriculum} onValueChange={handleCurriculumChange}>
              <SelectTrigger className="bg-background/50 border-foreground/20 text-lg" data-testid="select-curriculum">
                <SelectValue placeholder={t('country.chooseCurriculum')} />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[9999] max-h-[300px]">
                {availableCurricula.map((curriculum: string) => (
                  <SelectItem key={curriculum} value={curriculum}>
                    {curriculum}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </StickyNote>
      )}

      {countryDetails && (
        <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-500">
          <StickyNote color="yellow" rotation="-1">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-bold">{t('country.mission', { name: isArabic && countryDetails.nameAr ? countryDetails.nameAr : countryDetails.name })}</h4>
                {countryDetails.visionPlan && (
                  <span className="inline-block mt-1 px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-medium">
                    {countryDetails.visionPlan}
                  </span>
                )}
              </div>
            </div>
            <p className="font-body text-foreground/90 leading-relaxed">
              {isArabic && countryDetails.missionAr ? countryDetails.missionAr : countryDetails.mission}
            </p>
          </StickyNote>

          <StickyNote color="pink" rotation="2">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <h4 className="text-lg font-bold">{t('country.vision', { name: isArabic && countryDetails.nameAr ? countryDetails.nameAr : countryDetails.name })}</h4>
            </div>
            <p className="font-body text-foreground/90 leading-relaxed">
              {isArabic && countryDetails.visionAr ? countryDetails.visionAr : countryDetails.vision}
            </p>
          </StickyNote>

          {((countryDetails.prioritySectors && countryDetails.prioritySectors.length > 0) || (countryDetails.prioritySectorsAr && countryDetails.prioritySectorsAr.length > 0)) && (
            <StickyNote color="green" rotation="-2">
              <h4 className="text-lg font-bold mb-3">{t('country.prioritySectors', { name: isArabic && countryDetails.nameAr ? countryDetails.nameAr : countryDetails.name })}</h4>
              <div className="flex flex-wrap gap-2">
                {(isArabic && countryDetails.prioritySectorsAr?.length
                  ? countryDetails.prioritySectorsAr
                  : countryDetails.prioritySectors
                ).map((sector: string, index: number) => (
                  <span
                    key={index}
                    className="bg-primary/10 px-3 py-1 rounded-full text-sm font-medium font-body"
                  >
                    {sector}
                  </span>
                ))}
              </div>
            </StickyNote>
          )}

          {countryDetails.targets && typeof countryDetails.targets === 'object' && Object.keys(countryDetails.targets).length > 0 && (
            <StickyNote color="purple" rotation="1">
              <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-bold">{t('country.devGoals')}</h4>
                    <p className="text-sm text-foreground/70 font-body mt-1">
                      {t('country.devGoalsHint')}
                    </p>
                  </div>
                </div>

                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 hover-elevate active-elevate-2"
                    data-testid="button-read-more-vision"
                  >
                    {isDetailsOpen ? t('country.showLess') : t('country.readMore')}
                    <ChevronDown className={`ms-2 w-4 h-4 transition-transform ${isDetailsOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-4 space-y-4">
                  {Object.entries(countryDetails.targets || {}).map(([category, targets]: [string, any]) => (
                    <div key={category} className="border-s-2 border-primary/30 ps-4">
                      <h5 className="font-bold capitalize mb-2 text-primary">
                        {category === "tech" ? t('country.categoryTech') : category === "climate" ? t('country.categoryClimate') : category === "economic" ? t('country.categoryEconomic') : category}
                      </h5>
                      <div className="space-y-2">
                        {Array.isArray(targets) && targets.map((target, idx) => (
                          <div key={idx} className="text-sm font-body">
                            <span className="font-semibold">{target.metric}:</span>{" "}
                            <span className="text-foreground/90">{target.value}</span>
                            <span className="text-xs text-foreground/60 ms-2">
                              ({target.year}) • {target.focusArea}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  {((countryDetails.nationalGoals && countryDetails.nationalGoals.length > 0) || (countryDetails.nationalGoalsAr && countryDetails.nationalGoalsAr.length > 0)) && (
                    <div className="border-t border-foreground/10 pt-4 mt-4">
                      <h5 className="font-bold mb-2">{t('country.nationalGoals')}</h5>
                      <ul className="space-y-1">
                        {(isArabic && countryDetails.nationalGoalsAr?.length
                          ? countryDetails.nationalGoalsAr
                          : countryDetails.nationalGoals
                        ).map((goal: string, index: number) => (
                          <li key={index} className="text-sm font-body text-foreground/90 flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{goal}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </StickyNote>
          )}
        </div>
      )}

      <div className="flex justify-center gap-4 pt-8">
        {onBack && (
          <Button
            size="lg"
            variant="outline"
            onClick={onBack}
            className="px-8 py-6 text-lg rounded-full"
            data-testid="button-back-country"
          >
            {t('nav.back')}
          </Button>
        )}
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-country"
        >
          {t('nav.continue')}
        </Button>
      </div>
    </div>
  );
}
