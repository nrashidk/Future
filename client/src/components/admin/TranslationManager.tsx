import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CheckCircle, AlertCircle, Search, Globe, Edit, Save, X, Check, AlertTriangle, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

interface CoverageEntry {
  namespace: string;
  totalKeys: number;
  translatedKeys: number;
  coveragePercent: number;
}

interface CoverageData {
  namespaces: CoverageEntry[];
  overallCoverage: number;
}

interface TranslationEntry {
  key: string;
  en: string;
  ar: string;
  isMissing: boolean;
}

interface TranslationsData {
  namespace: string;
  translations: TranslationEntry[];
}

interface Career {
  id: string;
  title: string;
  description: string;
  titleAr?: string | null;
  descriptionAr?: string | null;
  requiredSkillsAr?: string[] | null;
  educationLevelAr?: string | null;
  category: string;
}

interface CvqItem {
  id: string;
  domain: string;
  text: string;
  textAr?: string | null;
  version: number;
  isActive: boolean;
}

interface QuizQuestion {
  id: string;
  question: string;
  questionAr?: string | null;
  subject: string;
  grade: number;
}

interface QuizQuestionsData {
  questions: QuizQuestion[];
  total: number;
  missing: number;
}

interface Country {
  id: string;
  name: string;
  nameAr?: string | null;
  code: string;
  isActive: boolean;
}

const NAMESPACES = ["common", "landing", "assessment", "results", "auth", "admin", "riasec", "profile", "legal", "pricing"];

const extractVars = (str: string): Set<string> => {
  const matches = str.match(/\{\{[^}]+\}\}/g) || [];
  return new Set(matches);
};

export default function TranslationManager() {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [, navigate] = useLocation();
  const [selectedNs, setSelectedNs] = useState("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<{ en: string; ar: string }>({ en: "", ar: "" });
  const [varWarning, setVarWarning] = useState<string | null>(null);

  // DB content state
  const [editingCareerId, setEditingCareerId] = useState<string | null>(null);
  const [careerArValues, setCareerArValues] = useState<{ titleAr: string; descriptionAr: string; requiredSkillsAr: string; educationLevelAr: string }>({ titleAr: "", descriptionAr: "", requiredSkillsAr: "", educationLevelAr: "" });

  // CVQ state
  const [editingCvqId, setEditingCvqId] = useState<string | null>(null);
  const [cvqArValue, setCvqArValue] = useState("");

  // Country nameAr state
  const [editingCountryId, setEditingCountryId] = useState<string | null>(null);
  const [countryArValue, setCountryArValue] = useState("");

  // Quiz questions state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionArValue, setQuestionArValue] = useState("");
  const [showQMissingOnly, setShowQMissingOnly] = useState(false);
  const [questionPage, setQuestionPage] = useState(0);
  const PAGE_SIZE = 30;

  const { data: coverage, isLoading: coverageLoading } = useQuery<CoverageData>({
    queryKey: ['/api/superadmin/translations/coverage'],
  });

  const { data: translations, isLoading: translationsLoading } = useQuery<TranslationsData>({
    queryKey: ['/api/superadmin/translations', selectedNs],
    queryFn: async () => {
      const res = await fetch(`/api/superadmin/translations/${selectedNs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch translations');
      return res.json();
    },
  });

  const { data: careers = [], isLoading: careersLoading } = useQuery<Career[]>({
    queryKey: ['/api/superadmin/careers'],
  });

  const { data: cvqItems = [], isLoading: cvqLoading } = useQuery<CvqItem[]>({
    queryKey: ['/api/cvq/items'],
    // The endpoint returns { items: [...] }; tolerate both a bare array and the
    // wrapped shape so an endpoint change can't reintroduce the render crash.
    select: (data: any): CvqItem[] => Array.isArray(data) ? data : (data?.items ?? []),
  });

  const { data: quizQuestionsData, isLoading: quizQuestionsLoading } = useQuery<QuizQuestionsData>({
    queryKey: ['/api/superadmin/quiz-questions', showQMissingOnly, questionPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(questionPage * PAGE_SIZE),
        ...(showQMissingOnly ? { missingOnly: "true" } : {}),
      });
      const res = await fetch(`/api/superadmin/quiz-questions?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch quiz questions');
      return res.json();
    },
  });

  const { data: countriesList = [], isLoading: countriesListLoading } = useQuery<Country[]>({
    queryKey: ['/api/admin/countries'],
  });

  const updateCountryArMutation = useMutation({
    mutationFn: async ({ id, nameAr }: { id: string; nameAr: string }) => {
      return apiRequest('PATCH', `/api/superadmin/countries/${id}/name-ar`, { nameAr });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/countries'] });
      setEditingCountryId(null);
      toast({ title: t('translation.countrySaved'), description: t('translation.countrySavedDesc') });
    },
    onError: () => {
      toast({ title: t('translation.saveError'), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ lang, key, value }: { lang: string; key: string; value: string }) => {
      return apiRequest('PATCH', `/api/superadmin/translations/${selectedNs}`, { lang, key, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/translations', selectedNs] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/translations/coverage'] });
      toast({ title: t('translation.saved'), description: t('translation.savedDesc') });
    },
    onError: () => {
      toast({ title: t('translation.saveError'), variant: "destructive" });
    },
  });

  const updateCareerArMutation = useMutation({
    mutationFn: async ({ id, titleAr, descriptionAr, requiredSkillsAr, educationLevelAr }: { id: string; titleAr: string; descriptionAr: string; requiredSkillsAr: string; educationLevelAr: string }) => {
      return apiRequest('PATCH', `/api/superadmin/careers/${id}`, {
        titleAr,
        descriptionAr,
        requiredSkillsAr: requiredSkillsAr ? requiredSkillsAr.split(',').map(s => s.trim()).filter(Boolean) : null,
        educationLevelAr: educationLevelAr || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/careers'] });
      setEditingCareerId(null);
      toast({ title: t('translation.saved'), description: t('translation.savedDesc') });
    },
    onError: () => {
      toast({ title: t('translation.saveError'), variant: "destructive" });
    },
  });

  const updateCvqArMutation = useMutation({
    mutationFn: async ({ id, textAr }: { id: string; textAr: string }) => {
      return apiRequest('PATCH', `/api/superadmin/cvq-items/${id}`, { textAr });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cvq/items'] });
      setEditingCvqId(null);
      setCvqArValue("");
      toast({ title: t('translation.cvqSaved') });
    },
    onError: () => {
      toast({ title: t('translation.saveError'), variant: "destructive" });
    },
  });

  const updateQuestionArMutation = useMutation({
    mutationFn: async ({ id, questionAr }: { id: string; questionAr: string }) => {
      return apiRequest('PATCH', `/api/superadmin/quiz-questions/${id}`, { questionAr });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/quiz-questions'] });
      setEditingQuestionId(null);
      setQuestionArValue("");
      toast({ title: t('translation.questionSaved') });
    },
    onError: () => {
      toast({ title: t('translation.saveError'), variant: "destructive" });
    },
  });

  const handleStartEdit = (entry: TranslationEntry) => {
    setEditingKey(entry.key);
    setEditingValues({ en: entry.en, ar: entry.ar });
    setVarWarning(null);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditingValues({ en: "", ar: "" });
    setVarWarning(null);
  };

  const handleSave = async () => {
    if (!editingKey) return;
    const original = translations?.translations.find(t => t.key === editingKey);
    if (!original) return;

    if (editingValues.ar) {
      const enVars = extractVars(editingValues.en);
      const arVars = extractVars(editingValues.ar);
      const missing = Array.from(enVars).filter(v => !arVars.has(v));
      if (missing.length > 0) {
        setVarWarning(missing.join(', '));
        toast({
          title: t('translation.variableWarning', { vars: missing.join(', ') }),
          variant: "destructive",
        });
        return;
      }
    }
    setVarWarning(null);

    const promises: Promise<any>[] = [];
    if (editingValues.ar !== original.ar) {
      promises.push(updateMutation.mutateAsync({ lang: "ar", key: editingKey, value: editingValues.ar }));
    }
    if (promises.length === 0) {
      setEditingKey(null);
      return;
    }
    try {
      await Promise.all(promises);
      setEditingKey(null);
    } catch {
      // error handled in mutation
    }
  };

  const filteredTranslations = useMemo(() => {
    if (!Array.isArray(translations?.translations)) return [];
    return translations.translations.filter(entry => {
      if (showMissingOnly && !entry.isMissing) return false;
      if (!searchQuery) return true;
      return entry.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.ar.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [translations, searchQuery, showMissingOnly]);

  const currentCoverage = coverage?.namespaces.find(n => n.namespace === selectedNs);

  const careersWithMissingAr = useMemo(() => {
    if (!Array.isArray(careers)) return [];
    return careers.filter(c => !c.titleAr || !c.descriptionAr || !c.requiredSkillsAr?.length);
  }, [careers]);

  const cvqWithMissingAr = useMemo(() => {
    if (!Array.isArray(cvqItems)) return [];
    return cvqItems.filter(c => !c.textAr);
  }, [cvqItems]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Globe className="w-7 h-7 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">{t('translation.title')}</h2>
          <p className="text-muted-foreground text-sm">{t('translation.subtitle')}</p>
        </div>
      </div>

      {/* Overall coverage */}
      {!coverageLoading && coverage && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">{t('translation.overallCoverage')}</CardTitle>
              <Badge variant={coverage.overallCoverage >= 80 ? "default" : "destructive"} className="text-sm">
                {coverage.overallCoverage}%
              </Badge>
            </div>
            <Progress value={coverage.overallCoverage} className="h-2" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {coverage.namespaces.map(ns => (
                <button
                  key={ns.namespace}
                  onClick={() => setSelectedNs(ns.namespace)}
                  className={`rounded-md p-2 text-start border transition-colors hover-elevate ${selectedNs === ns.namespace ? "border-primary bg-primary/5" : "border-border"}`}
                  data-testid={`ns-select-${ns.namespace}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold">{ns.namespace}</span>
                    {ns.coveragePercent === 100
                      ? <CheckCircle className="w-3 h-3 text-green-500" />
                      : <AlertCircle className="w-3 h-3 text-amber-500" />
                    }
                  </div>
                  <Progress value={ns.coveragePercent} className="h-1 mb-1" />
                  <p className="text-xs text-muted-foreground">{ns.translatedKeys}/{ns.totalKeys}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="ui">
        <TabsList>
          <TabsTrigger value="ui" data-testid="tab-ui-strings">{t('translation.tabUiStrings')}</TabsTrigger>
          <TabsTrigger value="db" data-testid="tab-db-content">
            {t('translation.tabDbContent')}
            {(careersWithMissingAr.length + cvqWithMissingAr.length) > 0 && (
              <Badge variant="destructive" className="ms-2 text-xs">
                {careersWithMissingAr.length + cvqWithMissingAr.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* UI Strings Tab */}
        <TabsContent value="ui" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base capitalize">{selectedNs} {t('translation.namespace')}</CardTitle>
                  {currentCoverage && (
                    <CardDescription>
                      {currentCoverage.translatedKeys}/{currentCoverage.totalKeys} {t('translation.keysTranslated')} ({currentCoverage.coveragePercent}%)
                    </CardDescription>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={selectedNs} onValueChange={setSelectedNs}>
                    <SelectTrigger className="w-44" data-testid="select-namespace">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NAMESPACES.map(ns => (
                        <SelectItem key={ns} value={ns}>{ns}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant={showMissingOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowMissingOnly(v => !v)}
                    data-testid="button-show-missing"
                  >
                    <AlertCircle className="w-3.5 h-3.5 me-1.5" />
                    {t('translation.missingOnly')}
                  </Button>
                </div>
              </div>
              <div className="relative mt-2">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="ps-9"
                  placeholder={t('translation.searchKeys')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  data-testid="input-search-translations"
                />
              </div>
            </CardHeader>
            <CardContent>
              {translationsLoading ? (
                <div className="text-center text-muted-foreground py-12">{t('translation.loading')}</div>
              ) : filteredTranslations.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">{t('translation.noKeys')}</div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-semibold text-muted-foreground px-2 pb-1 border-b">
                    <span>{t('translation.colKey')}</span>
                    <span>{t('translation.englishTitle')}</span>
                    <span>{t('translation.arabicTitle')}</span>
                    <span></span>
                  </div>
                  {filteredTranslations.map(entry => (
                    <div
                      key={entry.key}
                      className={`grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start rounded-md px-2 py-2 text-sm ${entry.isMissing ? "bg-amber-50 dark:bg-amber-900/10" : "hover:bg-muted/50"}`}
                      data-testid={`translation-row-${entry.key}`}
                    >
                      {editingKey === entry.key ? (
                        <>
                          <div className="space-y-1">
                            <div className="font-mono text-xs text-muted-foreground break-all">{entry.key}</div>
                            {varWarning && (
                              <div className="flex items-center gap-1 text-xs text-destructive">
                                <AlertTriangle className="w-3 h-3" />
                                {t('translation.variableWarning', { vars: varWarning })}
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground bg-muted/40 rounded-md px-2 py-1.5 line-clamp-3" data-testid={`display-en-${entry.key}`}>
                            {editingValues.en || <span className="italic">{t('translation.empty')}</span>}
                          </div>
                          <Textarea
                            value={editingValues.ar}
                            onChange={e => { setEditingValues(v => ({ ...v, ar: e.target.value })); setVarWarning(null); }}
                            rows={2}
                            className="text-xs"
                            dir="rtl"
                            data-testid={`edit-ar-${entry.key}`}
                          />
                          <div className="flex gap-1 self-start">
                            <Button size="icon" variant="default" onClick={handleSave} disabled={updateMutation.isPending} data-testid={`save-${entry.key}`}>
                              <Save className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="outline" onClick={handleCancelEdit} data-testid={`cancel-${entry.key}`}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-mono text-xs text-muted-foreground break-all">{entry.key}</div>
                          <div className="text-sm line-clamp-2">{entry.en || <span className="text-muted-foreground italic">{t('translation.empty')}</span>}</div>
                          <div className={`text-sm line-clamp-2 ${entry.isMissing ? "text-amber-600 dark:text-amber-400 italic" : ""}`} dir="rtl">
                            {entry.ar || <span className="text-muted-foreground italic">{t('translation.missing')}</span>}
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => handleStartEdit(entry)} data-testid={`edit-${entry.key}`}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Database Content Tab */}
        <TabsContent value="db" className="mt-4">
          <Tabs defaultValue="careers">
            <TabsList className="mb-4">
              <TabsTrigger value="careers" data-testid="tab-db-careers">
                {t('translation.dbCareers')}
                {careersWithMissingAr.length > 0 && (
                  <Badge variant="destructive" className="ms-2 text-xs">{careersWithMissingAr.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="cvq" data-testid="tab-db-cvq">
                {t('translation.dbCvq')}
                {cvqWithMissingAr.length > 0 && (
                  <Badge variant="destructive" className="ms-2 text-xs">{cvqWithMissingAr.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="countries" data-testid="tab-db-countries">{t('translation.dbCountries')}</TabsTrigger>
              <TabsTrigger value="questions" data-testid="tab-db-questions">{t('translation.dbQuestions')}</TabsTrigger>
            </TabsList>

            {/* Careers sub-tab */}
            <TabsContent value="careers">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('translation.dbCareers')}</CardTitle>
                  <CardDescription>
                    {careersWithMissingAr.length > 0
                      ? t('translation.dbCareersMissing', { n: careersWithMissingAr.length })
                      : t('translation.dbCareersAllDone')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {careersLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{t('translation.loading')}</div>
                  ) : careers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{t('translation.noDbContent')}</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 text-xs font-semibold text-muted-foreground px-2 pb-1 border-b">
                        <span className="w-8"></span>
                        <span>{t('translation.englishTitle')}</span>
                        <span>{t('translation.arabicTitle')}</span>
                        <span></span>
                      </div>
                      {careers.map(career => (
                        <div key={career.id} className="rounded-md border" data-testid={`career-row-${career.id}`}>
                          {editingCareerId === career.id ? (
                            <div className="p-3 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">{t('translation.englishTitle')}</Label>
                                  <p className="text-sm font-medium">{career.title}</p>
                                  <p className="text-xs text-muted-foreground line-clamp-2">{career.description}</p>
                                </div>
                                <div className="space-y-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs" htmlFor={`title-ar-${career.id}`}>{t('translation.arabicTitleLabel')}</Label>
                                    <Input
                                      id={`title-ar-${career.id}`}
                                      value={careerArValues.titleAr}
                                      onChange={e => setCareerArValues(v => ({ ...v, titleAr: e.target.value }))}
                                      dir="rtl"
                                      className="text-sm"
                                      data-testid={`input-career-title-ar-${career.id}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs" htmlFor={`desc-ar-${career.id}`}>{t('translation.arabicDescLabel')}</Label>
                                    <Textarea
                                      id={`desc-ar-${career.id}`}
                                      value={careerArValues.descriptionAr}
                                      onChange={e => setCareerArValues(v => ({ ...v, descriptionAr: e.target.value }))}
                                      dir="rtl"
                                      rows={3}
                                      className="text-sm"
                                      data-testid={`input-career-desc-ar-${career.id}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs" htmlFor={`skills-ar-${career.id}`}>{t('translation.arabicSkillsLabel')}</Label>
                                    <Input
                                      id={`skills-ar-${career.id}`}
                                      value={careerArValues.requiredSkillsAr}
                                      onChange={e => setCareerArValues(v => ({ ...v, requiredSkillsAr: e.target.value }))}
                                      dir="rtl"
                                      className="text-sm"
                                      data-testid={`input-career-skills-ar-${career.id}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs" htmlFor={`education-ar-${career.id}`}>{t('translation.arabicEducationLabel')}</Label>
                                    <Input
                                      id={`education-ar-${career.id}`}
                                      value={careerArValues.educationLevelAr}
                                      onChange={e => setCareerArValues(v => ({ ...v, educationLevelAr: e.target.value }))}
                                      dir="rtl"
                                      className="text-sm"
                                      data-testid={`input-career-education-ar-${career.id}`}
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => setEditingCareerId(null)} data-testid={`cancel-career-${career.id}`}>
                                  <X className="w-3.5 h-3.5 me-1.5" />
                                  {t('translation.cancel')}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => updateCareerArMutation.mutate({ id: career.id, titleAr: careerArValues.titleAr, descriptionAr: careerArValues.descriptionAr, requiredSkillsAr: careerArValues.requiredSkillsAr, educationLevelAr: careerArValues.educationLevelAr })}
                                  disabled={updateCareerArMutation.isPending}
                                  data-testid={`save-career-${career.id}`}
                                >
                                  <Save className="w-3.5 h-3.5 me-1.5" />
                                  {updateCareerArMutation.isPending ? t('translation.saving') : t('translation.save')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 items-center p-3">
                              <div className="w-8">
                                {career.titleAr && career.descriptionAr && career.requiredSkillsAr?.length
                                  ? <CheckCircle className="w-4 h-4 text-green-500" />
                                  : <AlertCircle className="w-4 h-4 text-amber-500" />
                                }
                              </div>
                              <div>
                                <p className="text-sm font-medium">{career.title}</p>
                                <p className="text-xs text-muted-foreground line-clamp-1">{career.description}</p>
                              </div>
                              <div dir="rtl">
                                {career.titleAr
                                  ? <p className="text-sm font-medium">{career.titleAr}</p>
                                  : <p className="text-sm italic text-amber-600 dark:text-amber-400">{t('translation.missing')}</p>
                                }
                                {career.descriptionAr
                                  ? <p className="text-xs text-muted-foreground line-clamp-1">{career.descriptionAr}</p>
                                  : <p className="text-xs italic text-amber-600 dark:text-amber-400">{t('translation.missing')}</p>
                                }
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingCareerId(career.id);
                                  setCareerArValues({ titleAr: career.titleAr || "", descriptionAr: career.descriptionAr || "", requiredSkillsAr: career.requiredSkillsAr?.join(', ') || "", educationLevelAr: career.educationLevelAr || "" });
                                }}
                                data-testid={`edit-career-ar-${career.id}`}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* CVQ Items sub-tab */}
            <TabsContent value="cvq">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('translation.dbCvq')}</CardTitle>
                  <CardDescription>
                    {cvqWithMissingAr.length === 0
                      ? t('translation.dbCvqAllDone')
                      : t('translation.dbCvqMissing', { n: cvqWithMissingAr.length })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {cvqLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{t('translation.loading')}</div>
                  ) : cvqItems.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{t('translation.noDbContent')}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 text-xs font-semibold text-muted-foreground px-2 pb-1 border-b">
                        <span className="w-8"></span>
                        <span>{t('translation.cvqDomain')}</span>
                        <span>{t('translation.cvqText')}</span>
                        <span>{t('translation.cvqTextAr')}</span>
                        <span></span>
                      </div>
                      {cvqItems.map(item => (
                        <div key={item.id} className="rounded-md border" data-testid={`cvq-row-${item.id}`}>
                          {editingCvqId === item.id ? (
                            <div className="p-3 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">{t('translation.cvqDomain')}: <span className="font-medium text-foreground">{item.domain}</span></Label>
                                  <p className="text-sm">{item.text}</p>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs" htmlFor={`cvq-ar-${item.id}`}>{t('translation.cvqTextAr')}</Label>
                                  <Textarea
                                    id={`cvq-ar-${item.id}`}
                                    value={cvqArValue}
                                    onChange={e => setCvqArValue(e.target.value)}
                                    dir="rtl"
                                    rows={2}
                                    className="text-sm"
                                    placeholder={t('translation.cvqPlaceholderAr')}
                                    data-testid={`input-cvq-ar-${item.id}`}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => { setEditingCvqId(null); setCvqArValue(""); }} data-testid={`cancel-cvq-${item.id}`}>
                                  <X className="w-3.5 h-3.5 me-1.5" />
                                  {t('translation.cancel')}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => updateCvqArMutation.mutate({ id: item.id, textAr: cvqArValue })}
                                  disabled={updateCvqArMutation.isPending}
                                  data-testid={`save-cvq-${item.id}`}
                                >
                                  <Save className="w-3.5 h-3.5 me-1.5" />
                                  {updateCvqArMutation.isPending ? t('translation.saving') : t('translation.save')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 items-center p-3">
                              <div className="w-8">
                                {item.textAr
                                  ? <CheckCircle className="w-4 h-4 text-green-500" />
                                  : <AlertCircle className="w-4 h-4 text-amber-500" />
                                }
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">{item.domain}</p>
                              </div>
                              <div>
                                <p className="text-sm line-clamp-2">{item.text}</p>
                              </div>
                              <div dir="rtl">
                                {item.textAr
                                  ? <p className="text-sm line-clamp-2">{item.textAr}</p>
                                  : <p className="text-sm italic text-amber-600 dark:text-amber-400">{t('translation.missing')}</p>
                                }
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingCvqId(item.id);
                                  setCvqArValue(item.textAr || "");
                                }}
                                data-testid={`edit-cvq-ar-${item.id}`}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Countries sub-tab */}
            <TabsContent value="countries">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('translation.dbCountries')}</CardTitle>
                  <CardDescription>{t('translation.countriesTableNote')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {countriesListLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{t('translation.loading')}</div>
                  ) : countriesList.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{t('translation.noDbContent')}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 text-xs font-semibold text-muted-foreground px-3 pb-1 border-b">
                        <span>{t('translation.englishTitle')}</span>
                        <span>{t('translation.countryNameArCol')}</span>
                        <span>{t('countries.codeCol')}</span>
                        <span></span>
                      </div>
                      {countriesList.map(country => (
                        <div
                          key={country.id}
                          className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 items-center rounded-md border px-3 py-2"
                          data-testid={`countries-row-${country.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{country.name}</span>
                            {!country.isActive && (
                              <Badge variant="secondary" className="text-xs">{t('countries.inactive')}</Badge>
                            )}
                          </div>
                          {editingCountryId === country.id ? (
                            <div className="flex gap-1">
                              <Input
                                value={countryArValue}
                                onChange={e => setCountryArValue(e.target.value)}
                                placeholder={t('translation.countryNameArPlaceholder')}
                                className="h-7 text-sm text-right"
                                dir="rtl"
                                data-testid={`input-country-name-ar-${country.id}`}
                              />
                              <Button
                                size="sm"
                                onClick={() => updateCountryArMutation.mutate({ id: country.id, nameAr: countryArValue })}
                                disabled={updateCountryArMutation.isPending}
                                data-testid={`button-save-country-ar-${country.id}`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingCountryId(null)}
                                data-testid={`button-cancel-country-ar-${country.id}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              className="text-sm text-right text-muted-foreground hover:text-foreground cursor-pointer truncate"
                              dir="rtl"
                              onClick={() => {
                                setEditingCountryId(country.id);
                                setCountryArValue(country.nameAr || "");
                              }}
                              data-testid={`button-edit-country-ar-${country.id}`}
                            >
                              {country.nameAr || <span className="text-muted-foreground/50 italic">{t('translation.countryNameArPlaceholder')}</span>}
                            </button>
                          )}
                          <Badge variant="outline" className="text-xs font-mono">{country.code}</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin?tab=countries&country=${country.id}`)}
                            data-testid={`button-goto-country-${country.id}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5 me-1.5" />
                            {t('translation.goToCountryMgmt')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Quiz Questions sub-tab */}
            <TabsContent value="questions">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{t('translation.dbQuestions')}</CardTitle>
                      {quizQuestionsData && (
                        <CardDescription>
                          {quizQuestionsData.missing === 0
                            ? t('translation.dbQuestionsAllDone')
                            : t('translation.dbQuestionsMissing', { n: quizQuestionsData.missing })}
                        </CardDescription>
                      )}
                    </div>
                    <Button
                      variant={showQMissingOnly ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setShowQMissingOnly(v => !v); setQuestionPage(0); }}
                      data-testid="button-q-missing-only"
                    >
                      <AlertCircle className="w-3.5 h-3.5 me-1.5" />
                      {t('translation.missingOnly')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {quizQuestionsLoading ? (
                    <div className="text-center py-8 text-muted-foreground">{t('translation.loading')}</div>
                  ) : !quizQuestionsData || quizQuestionsData.questions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{t('translation.noDbContent')}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[auto_auto_1fr_1fr_auto] gap-2 text-xs font-semibold text-muted-foreground px-2 pb-1 border-b">
                        <span className="w-6"></span>
                        <span>{t('translation.questionSubject')} / {t('translation.questionGrade')}</span>
                        <span>{t('translation.questionText')}</span>
                        <span>{t('translation.questionTextAr')}</span>
                        <span></span>
                      </div>
                      {quizQuestionsData.questions.map(q => (
                        <div key={q.id} className="rounded-md border" data-testid={`q-row-${q.id}`}>
                          {editingQuestionId === q.id ? (
                            <div className="p-3 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground font-medium">{q.subject} · {t('countries.gradeN', { grade: q.grade })}</p>
                                  <p className="text-sm">{q.question}</p>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs" htmlFor={`q-ar-${q.id}`}>{t('translation.questionTextAr')}</Label>
                                  <Textarea
                                    id={`q-ar-${q.id}`}
                                    value={questionArValue}
                                    onChange={e => setQuestionArValue(e.target.value)}
                                    dir="rtl"
                                    rows={3}
                                    className="text-sm"
                                    placeholder={t('translation.questionPlaceholderAr')}
                                    data-testid={`input-q-ar-${q.id}`}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => { setEditingQuestionId(null); setQuestionArValue(""); }} data-testid={`cancel-q-${q.id}`}>
                                  <X className="w-3.5 h-3.5 me-1.5" />
                                  {t('translation.cancel')}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => updateQuestionArMutation.mutate({ id: q.id, questionAr: questionArValue })}
                                  disabled={updateQuestionArMutation.isPending}
                                  data-testid={`save-q-${q.id}`}
                                >
                                  <Save className="w-3.5 h-3.5 me-1.5" />
                                  {updateQuestionArMutation.isPending ? t('translation.saving') : t('translation.save')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-[auto_auto_1fr_1fr_auto] gap-2 items-center p-2">
                              <div className="w-6">
                                {q.questionAr
                                  ? <CheckCircle className="w-4 h-4 text-green-500" />
                                  : <AlertCircle className="w-4 h-4 text-amber-500" />
                                }
                              </div>
                              <div className="min-w-[80px]">
                                <p className="text-xs font-medium text-muted-foreground">{q.subject}</p>
                                <p className="text-xs text-muted-foreground">{t('countries.gradeN', { grade: q.grade })}</p>
                              </div>
                              <div>
                                <p className="text-sm line-clamp-2">{q.question}</p>
                              </div>
                              <div dir="rtl">
                                {q.questionAr
                                  ? <p className="text-sm line-clamp-2">{q.questionAr}</p>
                                  : <p className="text-sm italic text-amber-600 dark:text-amber-400">{t('translation.missing')}</p>
                                }
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => { setEditingQuestionId(q.id); setQuestionArValue(q.questionAr || ""); }}
                                data-testid={`edit-q-ar-${q.id}`}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Pagination */}
                      {quizQuestionsData.total > PAGE_SIZE && (
                        <div className="flex items-center justify-between pt-2">
                          <p className="text-xs text-muted-foreground">
                            {questionPage * PAGE_SIZE + 1}–{Math.min((questionPage + 1) * PAGE_SIZE, quizQuestionsData.total)} / {quizQuestionsData.total}
                          </p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" disabled={questionPage === 0} onClick={() => setQuestionPage(p => p - 1)} data-testid="button-q-prev">
                              ←
                            </Button>
                            <Button size="sm" variant="outline" disabled={(questionPage + 1) * PAGE_SIZE >= quizQuestionsData.total} onClick={() => setQuestionPage(p => p + 1)} data-testid="button-q-next">
                              →
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
