import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import CountryOnboarding from "./CountryOnboarding";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, serverErrorMessage } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { formatMoney, toMajor } from "@shared/pricing";
import { ADD_BUTTON_CLASS, CARD_ACTIONS_CLASS } from "@/lib/adminActions";
import { 
  Globe, Plus, Edit, Trash2, Sparkles, BookOpen,
  CheckCircle, Clock, RefreshCw, Loader2, ArrowRightLeft, AlertTriangle
} from "lucide-react";

interface Country {
  id: string;
  name: string;
  nameAr: string | null;
  code: string;
  flag: string | null;
  abbreviation: string | null;
  mission: string;
  missionAr: string | null;
  vision: string;
  visionAr: string | null;
  visionPlan: string | null;
  prioritySectors: string[];
  prioritySectorsAr: string[] | null;
  nationalGoals: string[];
  nationalGoalsAr: string[] | null;
  educationSystem: string | null;
  universitiesLink: string | null;
  universitiesLinkLabel: string | null;
  curricula: string[] | null;
  subjects: string[] | null;
  gradeLevels: string[] | null;
  isActive: boolean;
  llmPopulated: boolean;
  /**
   * MINOR UNITS — fils, halalas, cents — as a whole number, with the currency
   * beside it. 3673 with AED is 36.73 dirhams. Never render this raw: pass it
   * through formatMoney, which knows how many decimals the currency has.
   */
  licensePriceMinor?: number | null;
  licenseCurrency?: string | null;
  createdAt: string;
  /**
   * Whether this country can actually produce a usable report.
   *
   * "Active" above says only that the country is switched on, which is not the
   * same thing and was the only signal this table carried. A country with no
   * sector map scores every career identically for national-vision alignment,
   * and a curriculum with fewer than three subjects cannot be got past the
   * first step of the assessment -- both of them silent, and both of them
   * showing as a perfectly healthy Active row.
   */
  readiness: {
    ready: boolean;
    blockerCount: number;
    warningCount: number;
    blockers: string[];
    warnings: string[];
  } | null;
}

const GRADES = ["8", "9", "10", "11", "12"];

export default function CountryManagement() {
  const { toast } = useToast();
  const { t, i18n } = useTranslation('admin');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isGenerateQuestionsOpen, setIsGenerateQuestionsOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);

  /**
   * THE PRICE EDITOR. Holds the figure as TEXT while it is being typed —
   * "36." is a valid thing to be halfway through typing and not a valid
   * number, so parsing on each keystroke would fight the person. It is
   * converted once, on the server, which is also the only place that knows
   * how many decimals the currency allows.
   */
  const [priceCountry, setPriceCountry] = useState<Country | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("AED");

  const openPriceEditor = (country: Country) => {
    setPriceCountry(country);
    // Pre-filled in MAJOR units, the same way it is displayed, so the field
    // shows what the person last meant rather than the stored integer.
    setPriceInput(
      country.licensePriceMinor && country.licenseCurrency
        ? String(toMajor(country.licensePriceMinor, country.licenseCurrency))
        : "");
    setPriceCurrency(country.licenseCurrency ?? "AED");
  };
  const [repopulatingCountryId, setRepopulatingCountryId] = useState<string | null>(null);
  
  const [newCountryForm, setNewCountryForm] = useState({
    id: "",
    name: "",
    nameAr: "",
    code: "",
    abbreviation: "",
    autoPopulate: true,
  });

  /**
   * The world's countries, for the picker.
   *
   * The name used to be typed, so the same country could arrive as "UAE",
   * "U.A.E." or "Emirates" depending on who added it -- and that string is
   * handed to the model as the thing to research, where an ambiguous or
   * misspelled name produces research about the wrong place, or nothing, with
   * no error anywhere. Picking from a list removes the failure rather than
   * validating against it.
   *
   * It also supplies the Arabic name, which creation previously had no way to
   * accept at all, in a product that is bilingual throughout.
   *
   * Fetched only while the dialog is open: 250 entries are not worth holding
   * for a screen nobody has opened.
   */
  const { data: catalog } = useQuery<{
    countries: Array<{
      alpha2: string; alpha3: string | null; name: string; nameAr: string | null;
      suggestedId: string; suggestedCode: string; alreadyAdded: boolean;
    }>;
  }>({
    queryKey: ['/api/reference/country-catalog'],
    enabled: isCreateModalOpen,
  });
  
  const [generateForm, setGenerateForm] = useState({
    subject: "",
    grade: "9",
    curriculum: "National",
    count: 10,
  });
  
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameForm, setRenameForm] = useState({
    countryId: "",
    oldName: "",
    newName: "",
  });

  const { data: countries = [], isLoading } = useQuery<Country[]>({
    queryKey: ['/api/admin/countries'],
  });

  /**
   * The country being walked through setup, or null.
   *
   * Creating a country used to close the dialog and drop the superadmin back
   * on the list, with the remaining steps -- sector map, questions -- spread
   * across other tabs and nothing saying they were outstanding. That is how a
   * country ended up created but unusable. So creation now HANDS OFF to the
   * onboarding panel instead of dismissing, and the panel holds until the
   * readiness endpoint says the country is ready.
   */
  const [onboarding, setOnboarding] = useState<{
    id: string; name: string; suggestedCurricula: string[];
  } | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: typeof newCountryForm) => {
      const response = await apiRequest('POST', '/api/admin/countries', data);
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/countries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/countries'] });
      setIsCreateModalOpen(false);
      setOnboarding({
        id: result.country?.id ?? newCountryForm.id,
        name: result.country?.name ?? newCountryForm.name,
        suggestedCurricula: result.suggestedCurricula ?? [],
      });
      setNewCountryForm({ id: "", name: "", nameAr: "", code: "", abbreviation: "", autoPopulate: true });
      toast({ 
        title: t('countries.createSuccess'), 
        description: result.autoPopulated 
          ? t('countries.createSuccessAI')
          : t('countries.createSuccessManual')
      });
    },
    onError: (error: unknown) => {
      toast({ 
        title: t('countries.errorTitle'), 
        description: serverErrorMessage(error) ?? t('countries.createError'), 
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Country> }) => {
      return apiRequest('PUT', `/api/admin/countries/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/countries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/countries'] });
      setIsEditModalOpen(false);
      setSelectedCountry(null);
      toast({ title: t('countries.updateSuccess'), description: t('countries.updateSuccessDesc') });
    },
    onError: () => {
      toast({ title: t('countries.errorTitle'), description: t('countries.updateError'), variant: "destructive" });
    },
  });

  /**
   * SAVE THE PRICE. Sends the figure as typed, in major units, and lets the
   * server convert and validate — it is the only place that knows the
   * currency's decimal places, and duplicating that here is how the two come
   * to disagree.
   *
   * The server's error message is shown verbatim rather than a generic one: it
   * names the currency and how many decimals it allows, which is the only
   * thing a person needs to fix the entry.
   */
  const priceMutation = useMutation({
    mutationFn: async ({ id, price, currency }: { id: string; price: string | null; currency?: string }) => {
      return apiRequest('PATCH', `/api/admin/countries/${id}/license-price`,
        price === null ? { price: null } : { price, currency });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/countries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/countries'] });
      setPriceCountry(null);
      toast({
        title: t('countries.priceSaved'),
        // The stored figure, formatted — so the person sees what a buyer will
        // be charged and can spot a misplaced decimal immediately.
        description: data?.formatted
          ? t('countries.priceSavedDesc', { price: data.formatted })
          : t('countries.priceClearedDesc'),
      });
    },
    onError: (err: any) => {
      toast({
        title: t('countries.errorTitle'),
        description: err?.message || t('countries.priceError'),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/admin/countries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/countries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/countries'] });
      toast({ title: t('countries.updateSuccess'), description: t('countries.deleteSuccess') });
    },
    onError: (error: unknown) => {
      toast({ 
        title: t('countries.errorTitle'), 
        description: serverErrorMessage(error) ?? t('countries.deleteError'), 
        variant: "destructive" 
      });
    },
  });

  const repopulateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/admin/countries/${id}/repopulate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/countries'] });
      setRepopulatingCountryId(null);
      toast({ title: t('countries.updateSuccess'), description: t('countries.refreshSuccess') });
    },
    onError: (error: unknown) => {
      setRepopulatingCountryId(null);
      toast({ 
        title: t('countries.errorTitle'), 
        description: serverErrorMessage(error) ?? t('countries.refreshError'), 
        variant: "destructive" 
      });
    },
  });
  
  const handleRepopulate = (countryId: string) => {
    setRepopulatingCountryId(countryId);
    repopulateMutation.mutate(countryId);
  };

  const generateQuestionsMutation = useMutation({
    mutationFn: async ({ countryId, ...data }: { countryId: string; subject: string; grade: number; curriculum: string; count: number }) => {
      const response = await apiRequest('POST', `/api/admin/countries/${countryId}/generate-questions`, data);
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/questions'] });
      setIsGenerateQuestionsOpen(false);

      // A shortfall used to be visible only as a number that did not match the
      // one requested — the server logged which question failed and why, and the
      // person who asked for them saw neither. Name them.
      const failures: Array<{ index: number; reason: string }> = result.failures || [];
      if (failures.length > 0) {
        toast({
          title: t('countries.questionsGenerated'),
          description: (
            <div className="space-y-1">
              <p>
                {t('countries.questionsPartial', {
                  created: result.questionsCreated,
                  generated: result.questionsGenerated,
                  failed: failures.length,
                  tokens: result.tokensUsed,
                })}
              </p>
              <ul className="list-disc ps-4">
                {failures.map(f => (
                  <li key={f.index}>{`#${f.index + 1}: ${f.reason}`}</li>
                ))}
              </ul>
            </div>
          ),
          variant: "destructive",
        });
        return;
      }

      toast({ 
        title: t('countries.questionsGenerated'), 
        description: t('countries.questionsGeneratedDesc', { n: result.questionsCreated, tokens: result.tokensUsed })
      });
    },
    onError: (error: unknown) => {
      toast({ 
        title: t('countries.errorTitle'), 
        description: serverErrorMessage(error) ?? t('countries.generateError'), 
        variant: "destructive" 
      });
    },
  });

  const renameCurriculumMutation = useMutation({
    mutationFn: async ({ countryId, oldName, newName }: { countryId: string; oldName: string; newName: string }) => {
      const response = await apiRequest('POST', `/api/superadmin/countries/${countryId}/curricula/rename`, { oldName, newName });
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/countries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/countries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/subjects'] });
      setIsRenameModalOpen(false);
      setRenameForm({ countryId: "", oldName: "", newName: "" });
      toast({ 
        title: t('countries.curriculumRenamed'), 
        description: t('countries.curriculumRenamedDesc', { subjects: result.updated?.subjects || 0, questions: result.updated?.questions || 0, schools: result.updated?.organizations || 0 })
      });
    },
    onError: (error: unknown) => {
      toast({ 
        title: t('countries.errorTitle'), 
        description: serverErrorMessage(error) ?? t('countries.renameError'), 
        variant: "destructive" 
      });
    },
  });

  const handleCreateCountry = () => {
    if (!newCountryForm.id || !newCountryForm.name || !newCountryForm.code) {
      toast({ title: t('countries.errorTitle'), description: t('countries.fieldRequiredError'), variant: "destructive" });
      return;
    }
    createMutation.mutate(newCountryForm);
  };

  const handleGenerateQuestions = () => {
    if (!selectedCountry || !generateForm.subject) {
      toast({ title: t('countries.errorTitle'), description: t('countries.selectSubjectError'), variant: "destructive" });
      return;
    }
    generateQuestionsMutation.mutate({
      countryId: selectedCountry.id,
      subject: generateForm.subject,
      grade: parseInt(generateForm.grade),
      curriculum: generateForm.curriculum,
      count: generateForm.count,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          {/* Title, description and actions in one row, as on every other
              admin table. The page previously carried an <h2> page heading
              AND its actions above this card, which then repeated its own
              title — two headings for one table, with the Add button nowhere
              near it. */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                {t('countries.countriesTable', { n: countries.length })}
              </CardTitle>
              <CardDescription>
                {t('countries.subtitle')}
              </CardDescription>
            </div>
            <div className={CARD_ACTIONS_CLASS}>
              <Button variant="outline" size="sm" onClick={() => setIsRenameModalOpen(true)} data-testid="button-rename-curriculum">
                <ArrowRightLeft className="w-4 h-4 me-2" />
                {t('countries.renameCurriculum')}
              </Button>
              <Button onClick={() => setIsCreateModalOpen(true)} className={ADD_BUTTON_CLASS} data-testid="button-add-country">
                <Plus className="w-4 h-4 me-2" />
                {t('countries.addCountry')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {countries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">{t('countries.noCountries')}</p>
              <p className="text-sm mt-2">{t('countries.noCountriesDesc')}</p>
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('countries.nameCol')}</TableHead>
                <TableHead>{t('countries.codeCol')}</TableHead>
                <TableHead>{t('countries.visionCol')}</TableHead>
                <TableHead>{t('countries.curriculaCol')}</TableHead>
                <TableHead>{t('countries.priceCol')}</TableHead>
                <TableHead>{t('countries.statusCol')}</TableHead>
                <TableHead className="text-right">{t('countries.actionsCol')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {countries.map((country) => (
                <TableRow key={country.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      {country.name}
                      {country.llmPopulated && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="w-3 h-3 me-1" />
                          {t('countries.aiLabel')}
                        </Badge>
                      )}
                      {/* READINESS, next to the name rather than in a column of
                          its own: this is the first thing to know about a
                          country and it has to be impossible to miss. The
                          reasons go in the tooltip because they are sentences,
                          not a count -- a superadmin who sees "Not ready" needs
                          to know it is the sector map before they can fix it. */}
                      {country.readiness && !country.readiness.ready && (
                        <Badge
                          variant="destructive"
                          className="text-xs cursor-help"
                          title={country.readiness.blockers.join("\n")}
                          data-testid={`badge-country-not-ready-${country.id}`}
                        >
                          <AlertTriangle className="w-3 h-3 me-1" />
                          {t('countries.notReady', { count: country.readiness.blockerCount })}
                        </Badge>
                      )}
                      {country.readiness?.ready && country.readiness.warningCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-xs cursor-help border-amber-500 text-amber-600"
                          title={country.readiness.warnings.join("\n")}
                          data-testid={`badge-country-warnings-${country.id}`}
                        >
                          <AlertTriangle className="w-3 h-3 me-1" />
                          {t('countries.readyWithWarnings', { count: country.readiness.warningCount })}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{country.code}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {country.visionPlan || (country.vision ? country.vision.slice(0, 50) + "..." : t('countries.notSet'))}
                  </TableCell>
                  <TableCell>
                    {country.curricula?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {country.curricula.slice(0, 2).map((c) => (
                          <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                        ))}
                        {country.curricula.length > 2 && (
                          <Badge variant="secondary" className="text-xs">+{country.curricula.length - 2}</Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t('countries.notSet')}</span>
                    )}
                  </TableCell>
                  {/* THE PRICE, IN NORMAL MONEY.
                      The column stores minor units — fils, halalas — which is
                      right for storage and wrong for a person. This shows the
                      figure a buyer is charged, and the editor takes the same
                      figure back. Nobody should ever type or read fils. */}
                  <TableCell>
                    {country.licensePriceMinor && country.licenseCurrency ? (
                      <button
                        className="font-medium underline decoration-dotted hover:text-primary"
                        onClick={() => openPriceEditor(country)}
                        data-testid={`button-edit-price-${country.id}`}
                      >
                        {formatMoney(country.licensePriceMinor, country.licenseCurrency, i18n.language)}
                      </button>
                    ) : (
                      <button
                        className="text-muted-foreground underline decoration-dotted hover:text-primary text-sm"
                        onClick={() => openPriceEditor(country)}
                        data-testid={`button-edit-price-${country.id}`}
                      >
                        {t('countries.priceFallback')}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    {country.isActive ? (
                      <Badge className="bg-green-500">
                        <CheckCircle className="w-3 h-3 me-1" />
                        {t('countries.active')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Clock className="w-3 h-3 me-1" />
                        {t('countries.inactive')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => {
                          setSelectedCountry(country);
                          setGenerateForm({
                            subject: country.subjects?.[0] || "Mathematics",
                            grade: "9",
                            curriculum: country.curricula?.[0] || "National",
                            count: 10,
                          });
                          setIsGenerateQuestionsOpen(true);
                        }}
                        title={t('countries.generateQuestions')}
                        data-testid={`button-generate-${country.id}`}
                      >
                        <BookOpen className="w-4 h-4" />
                      </Button>
                      {/* THE WAY BACK IN. A country whose setup was left
                          unfinished needs one obvious route to the checklist,
                          or the red badge on this row is a dead end. Shown
                          only when there is something to finish. */}
                      {country.readiness && !country.readiness.ready && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOnboarding({
                            id: country.id, name: country.name, suggestedCurricula: [],
                          })}
                          data-testid={`button-finish-setup-${country.id}`}
                        >
                          {t('countries.onboarding.finishSetup')}
                        </Button>
                      )}
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => handleRepopulate(country.id)}
                        disabled={repopulatingCountryId !== null}
                        title={t('countries.refreshAI')}
                        data-testid={`button-refresh-${country.id}`}
                      >
                        <RefreshCw className={`w-4 h-4 ${repopulatingCountryId === country.id ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => {
                          setSelectedCountry(country);
                          setIsEditModalOpen(true);
                        }}
                        title={t('countries.editCountry')}
                        data-testid={`button-edit-${country.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => {
                          if (confirm(t('countries.confirmDelete', { name: country.name }))) {
                            deleteMutation.mutate(country.id);
                          }
                        }}
                        disabled={country.id === "uae"}
                        title={country.id === "uae" ? t('countries.cannotDelete') : t('countries.deleteCountry')}
                        data-testid={`button-delete-${country.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {/* THE ONBOARDING FLOW.
          Not dismissable by clicking outside while the country is unfinished
          would be the obvious instinct, and it is wrong -- a superadmin who
          has to leave must be able to, and the red readiness badge on the list
          row is what brings them back. "Finish later" is an explicit exit
          rather than a trap. */}
      <Dialog open={!!onboarding} onOpenChange={(open) => { if (!open) setOnboarding(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('countries.onboarding.title')}</DialogTitle>
            <DialogDescription>{t('countries.onboarding.description')}</DialogDescription>
          </DialogHeader>
          {onboarding && (
            <CountryOnboarding
              countryId={onboarding.id}
              countryName={onboarding.name}
              suggestedCurricula={onboarding.suggestedCurricula}
              onDone={() => setOnboarding(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('countries.addCountryTitle')}</DialogTitle>
            <DialogDescription>{t('countries.addCountryDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="countryId">{t('countries.countryId')}</Label>
                <Input
                  id="countryId"
                  placeholder="e.g., saudi"
                  value={newCountryForm.id}
                  onChange={(e) => setNewCountryForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/\s/g, '-') }))}
                  data-testid="input-country-id"
                />
              </div>
              <div>
                <Label htmlFor="countryCode">{t('countries.countryCode')}</Label>
                <Input
                  id="countryCode"
                  placeholder="e.g., SAU"
                  maxLength={3}
                  value={newCountryForm.code}
                  onChange={(e) => setNewCountryForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  data-testid="input-country-code"
                />
              </div>
            </div>
            {/* THE PICKER, and it comes first because everything else derives
                from it. A country already added is shown as taken rather than
                hidden, so nobody hunts for one that is already there. */}
            <div>
              <Label htmlFor="countryName">{t('countries.countryName')}</Label>
              <select
                id="countryName"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newCountryForm.name}
                onChange={(e) => {
                  const picked = catalog?.countries.find((c) => c.name === e.target.value);
                  setNewCountryForm((f) => ({
                    ...f,
                    name: e.target.value,
                    nameAr: picked?.nameAr ?? "",
                    // Pre-filled, not imposed: both stay editable below, because
                    // the live UAE row uses "uae"/"UAE" rather than ISO's
                    // "are"/"ARE" and its key is already pointed at.
                    id: picked?.suggestedId ?? f.id,
                    code: picked?.suggestedCode ?? f.code,
                  }));
                }}
                data-testid="select-country-name"
              >
                <option value="">{t('countries.selectCountry')}</option>
                {(catalog?.countries ?? []).map((c) => (
                  <option key={c.alpha2} value={c.name} disabled={c.alreadyAdded}>
                    {c.name}{c.nameAr ? ` — ${c.nameAr}` : ""}{c.alreadyAdded ? ` (${t('countries.alreadyAdded')})` : ""}
                  </option>
                ))}
              </select>
              {newCountryForm.nameAr && (
                <p className="text-sm text-muted-foreground mt-1" dir="rtl">{newCountryForm.nameAr}</p>
              )}
            </div>
            {/* NO ABBREVIATION FIELD.
                It is display-only -- the subject screens render
                `abbreviation || name` as a column shorthand -- and it
                duplicates `code`, which the picker now always fills with the
                ISO alpha-2. Asking for it meant asking for a value most
                countries do not have, to shorten a name that `code` already
                shortens. The column and the edit field stay, so the UAE row's
                existing "UAE" is untouched; the displays fall back through
                `code` now, so a country without one is never shown as a long
                name in a narrow column. */}
            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="autoPopulate" className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {t('countries.aiAutoPopulate')}
                </Label>
                <p className="text-sm text-muted-foreground">{t('countries.aiAutoPopulateDesc')}</p>
              </div>
              <Switch
                id="autoPopulate"
                checked={newCountryForm.autoPopulate}
                onCheckedChange={(checked) => setNewCountryForm(f => ({ ...f, autoPopulate: checked }))}
                data-testid="switch-auto-populate"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              {t('countries.cancel')}
            </Button>
            <Button 
              onClick={handleCreateCountry} 
              disabled={createMutation.isPending}
              data-testid="button-create-country"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  {newCountryForm.autoPopulate ? t('countries.researching') : t('countries.creating')}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 me-2" />
                  {t('countries.createCountry')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('countries.editCountryTitle')}: {selectedCountry?.name}</DialogTitle>
            <DialogDescription>{t('countries.editCountryDesc')}</DialogDescription>
          </DialogHeader>
          {selectedCountry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('countries.editNameLabel')}</Label>
                  <Input
                    value={selectedCountry.name}
                    onChange={(e) => setSelectedCountry({ ...selectedCountry, name: e.target.value })}
                    data-testid="input-edit-name"
                  />
                </div>
                <div>
                  <Label>{t('countries.visionPlanLabel')}</Label>
                  <Input
                    placeholder="e.g., Vision 2030"
                    value={selectedCountry.visionPlan || ""}
                    onChange={(e) => setSelectedCountry({ ...selectedCountry, visionPlan: e.target.value })}
                    data-testid="input-edit-vision-plan"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('countries.editFlag')}</Label>
                  <Input
                    placeholder="e.g., 🇦🇪"
                    value={selectedCountry.flag || ""}
                    onChange={(e) => setSelectedCountry({ ...selectedCountry, flag: e.target.value || null })}
                    data-testid="input-edit-flag"
                  />
                </div>
                <div>
                  <Label>{t('countries.editAbbreviation')}</Label>
                  <Input
                    placeholder="e.g., UAE"
                    value={selectedCountry.abbreviation || ""}
                    onChange={(e) => setSelectedCountry({ ...selectedCountry, abbreviation: e.target.value || null })}
                    data-testid="input-edit-abbreviation"
                  />
                </div>
              </div>
              <div>
                <Label>{t('countries.missionLabel')}</Label>
                <Textarea
                  rows={2}
                  value={selectedCountry.mission}
                  onChange={(e) => setSelectedCountry({ ...selectedCountry, mission: e.target.value })}
                  data-testid="input-edit-mission"
                />
              </div>
              <div>
                <Label>{t('countries.visionLabel')}</Label>
                <Textarea
                  rows={2}
                  value={selectedCountry.vision}
                  onChange={(e) => setSelectedCountry({ ...selectedCountry, vision: e.target.value })}
                  data-testid="input-edit-vision"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('countries.editUniversitiesLink')}</Label>
                  <Input
                    placeholder="https://..."
                    value={selectedCountry.universitiesLink || ""}
                    onChange={(e) => setSelectedCountry({ ...selectedCountry, universitiesLink: e.target.value })}
                    data-testid="input-edit-universities-link"
                  />
                </div>
                <div>
                  <Label>{t('countries.editUniversitiesLinkLabel')}</Label>
                  <Input
                    placeholder="e.g., Ministry of Education"
                    value={selectedCountry.universitiesLinkLabel || ""}
                    onChange={(e) => setSelectedCountry({ ...selectedCountry, universitiesLinkLabel: e.target.value })}
                    data-testid="input-edit-universities-label"
                  />
                </div>
              </div>
              <div>
                <Label>{t('countries.editEducation')}</Label>
                <Textarea
                  rows={2}
                  value={selectedCountry.educationSystem || ""}
                  onChange={(e) => setSelectedCountry({ ...selectedCountry, educationSystem: e.target.value })}
                  data-testid="input-edit-education"
                />
              </div>
              <div>
                <Label>{t('countries.editCurricula')}</Label>
                <Input
                  placeholder="National, IB, Cambridge"
                  value={selectedCountry.curricula?.join(", ") || ""}
                  onChange={(e) => setSelectedCountry({ 
                    ...selectedCountry, 
                    curricula: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                  })}
                  data-testid="input-edit-curricula"
                />
              </div>
              <div>
                <Label>{t('countries.editSubjects')}</Label>
                <Input
                  placeholder="Mathematics, Science, English..."
                  value={selectedCountry.subjects?.join(", ") || ""}
                  onChange={(e) => setSelectedCountry({ 
                    ...selectedCountry, 
                    subjects: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                  })}
                  data-testid="input-edit-subjects"
                />
              </div>
              <div>
                <Label>{t('countries.editSectors')}</Label>
                <Input
                  placeholder="Technology, Healthcare, Energy..."
                  value={selectedCountry.prioritySectors?.join(", ") || ""}
                  onChange={(e) => setSelectedCountry({ 
                    ...selectedCountry, 
                    prioritySectors: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                  })}
                  data-testid="input-edit-sectors"
                />
              </div>
              <div>
                <Label>{t('countries.editGoals')}</Label>
                <Textarea
                  rows={3}
                  placeholder="One national goal per line..."
                  value={selectedCountry.nationalGoals?.join("\n") || ""}
                  onChange={(e) => setSelectedCountry({ 
                    ...selectedCountry, 
                    nationalGoals: e.target.value.split("\n").map(s => s.trim()).filter(Boolean)
                  })}
                  data-testid="input-edit-goals"
                />
              </div>

              <div className="border-t pt-4 mt-2">
                <p className="text-sm font-semibold text-muted-foreground mb-3">{t('countries.arabicSection')}</p>
                <div className="space-y-4">
                  <div>
                    <Label>{t('countries.editNameAr')}</Label>
                    <Input
                      dir="rtl"
                      placeholder="الإمارات العربية المتحدة"
                      value={selectedCountry.nameAr || ""}
                      onChange={(e) => setSelectedCountry({ ...selectedCountry, nameAr: e.target.value || null })}
                      data-testid="input-edit-name-ar"
                    />
                  </div>
                  <div>
                    <Label>{t('countries.missionArLabel')}</Label>
                    <Textarea
                      dir="rtl"
                      rows={2}
                      placeholder="نص رسالة الدولة بالعربية..."
                      value={selectedCountry.missionAr || ""}
                      onChange={(e) => setSelectedCountry({ ...selectedCountry, missionAr: e.target.value || null })}
                      data-testid="input-edit-mission-ar"
                    />
                  </div>
                  <div>
                    <Label>{t('countries.visionArLabel')}</Label>
                    <Textarea
                      dir="rtl"
                      rows={2}
                      placeholder="نص رؤية الدولة بالعربية..."
                      value={selectedCountry.visionAr || ""}
                      onChange={(e) => setSelectedCountry({ ...selectedCountry, visionAr: e.target.value || null })}
                      data-testid="input-edit-vision-ar"
                    />
                  </div>
                  <div>
                    <Label>{t('countries.editSectorsAr')}</Label>
                    <Input
                      dir="rtl"
                      placeholder="الذكاء الاصطناعي, الطاقة المتجددة..."
                      value={selectedCountry.prioritySectorsAr?.join("، ") || ""}
                      onChange={(e) => setSelectedCountry({ 
                        ...selectedCountry, 
                        prioritySectorsAr: e.target.value.split(/[,،]/).map(s => s.trim()).filter(Boolean)
                      })}
                      data-testid="input-edit-sectors-ar"
                    />
                  </div>
                  <div>
                    <Label>{t('countries.editGoalsAr')}</Label>
                    <Textarea
                      dir="rtl"
                      rows={3}
                      placeholder="هدف وطني واحد في كل سطر..."
                      value={selectedCountry.nationalGoalsAr?.join("\n") || ""}
                      onChange={(e) => setSelectedCountry({ 
                        ...selectedCountry, 
                        nationalGoalsAr: e.target.value.split("\n").map(s => s.trim()).filter(Boolean)
                      })}
                      data-testid="input-edit-goals-ar"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={selectedCountry.isActive}
                  onCheckedChange={(checked) => setSelectedCountry({ ...selectedCountry, isActive: checked })}
                  data-testid="switch-edit-active"
                />
                <Label>{t('countries.countryIsActive')}</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              {t('countries.cancel')}
            </Button>
            <Button 
              onClick={() => selectedCountry && updateMutation.mutate({ 
                id: selectedCountry.id, 
                data: selectedCountry 
              })}
              disabled={updateMutation.isPending}
              data-testid="button-save-country"
            >
              {updateMutation.isPending ? t('countries.saving') : t('countries.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGenerateQuestionsOpen} onOpenChange={setIsGenerateQuestionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('countries.generateTitle')}</DialogTitle>
            <DialogDescription>
              {t('countries.generateDesc')} — {selectedCountry?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('countries.generateSubject')}</Label>
              <Select 
                value={generateForm.subject} 
                onValueChange={(value) => setGenerateForm(f => ({ ...f, subject: value }))}
              >
                <SelectTrigger data-testid="select-generate-subject">
                  <SelectValue placeholder={t('countries.selectSubjectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(selectedCountry?.subjects || ["Mathematics", "Science", "English", "Social Studies", "Computer Science"]).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('countries.gradeLevel')}</Label>
                <Select 
                  value={generateForm.grade} 
                  onValueChange={(value) => setGenerateForm(f => ({ ...f, grade: value }))}
                >
                  <SelectTrigger data-testid="select-generate-grade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g} value={g}>{t('countries.gradeN', { grade: g })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('countries.generateCurriculum')}</Label>
                <Select 
                  value={generateForm.curriculum} 
                  onValueChange={(value) => setGenerateForm(f => ({ ...f, curriculum: value }))}
                >
                  <SelectTrigger data-testid="select-generate-curriculum">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedCountry?.curricula || ["National"]).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t('countries.generateCount')}</Label>
              <Select 
                value={generateForm.count.toString()} 
                onValueChange={(value) => setGenerateForm(f => ({ ...f, count: parseInt(value) }))}
              >
                <SelectTrigger data-testid="select-generate-count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20].map(n => (
                    <SelectItem key={n} value={String(n)}>{t('countries.questionCount', { n })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGenerateQuestionsOpen(false)}>
              {t('countries.cancel')}
            </Button>
            <Button 
              onClick={handleGenerateQuestions}
              disabled={generateQuestionsMutation.isPending || !generateForm.subject}
              data-testid="button-generate-questions"
            >
              {generateQuestionsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  {t('countries.generating')}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 me-2" />
                  {t('countries.generate')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameModalOpen} onOpenChange={setIsRenameModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('countries.renameCurriculumTitle')}</DialogTitle>
            <DialogDescription>{t('countries.renameCurriculumDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('countries.nameCol')}</Label>
              <Select 
                value={renameForm.countryId} 
                onValueChange={(value) => {
                  setRenameForm(f => ({ ...f, countryId: value, oldName: "", newName: "" }));
                }}
              >
                <SelectTrigger data-testid="select-rename-country">
                  <SelectValue placeholder={t('countries.selectCountry')} />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((country) => (
                    <SelectItem key={country.id} value={country.id}>{country.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {renameForm.countryId && (
              <>
                <div>
                  <Label>{t('countries.oldCurriculumName')}</Label>
                  <Select 
                    value={renameForm.oldName} 
                    onValueChange={(value) => setRenameForm(f => ({ ...f, oldName: value, newName: value }))}
                  >
                    <SelectTrigger data-testid="select-rename-old">
                      <SelectValue placeholder={t('countries.selectCurriculumPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.find(c => c.id === renameForm.countryId)?.curricula?.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('countries.newCurriculumName')}</Label>
                  <Input
                    placeholder={t('countries.enterNewNamePlaceholder')}
                    value={renameForm.newName}
                    onChange={(e) => setRenameForm(f => ({ ...f, newName: e.target.value }))}
                    data-testid="input-rename-new"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameModalOpen(false)}>
              {t('countries.cancel')}
            </Button>
            <Button 
              onClick={() => renameCurriculumMutation.mutate(renameForm)}
              disabled={renameCurriculumMutation.isPending || !renameForm.countryId || !renameForm.oldName || !renameForm.newName || renameForm.oldName === renameForm.newName}
              data-testid="button-rename-curriculum"
            >
              {renameCurriculumMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  {t('countries.renaming')}
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 me-2" />
                  {t('countries.renameBtn')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------- THE PRICE EDITOR ---- */}
      <Dialog open={!!priceCountry} onOpenChange={(open) => !open && setPriceCountry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('countries.priceTitle', { country: priceCountry?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>{t('countries.priceDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="license-price">{t('countries.priceLabel')}</Label>
                <Input
                  id="license-price"
                  type="text"
                  inputMode="decimal"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="36.73"
                  data-testid="input-license-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-currency">{t('countries.priceCurrencyLabel')}</Label>
                <Input
                  id="license-currency"
                  type="text"
                  maxLength={3}
                  value={priceCurrency}
                  onChange={(e) => setPriceCurrency(e.target.value.toUpperCase())}
                  placeholder="AED"
                  data-testid="input-license-currency"
                />
              </div>
            </div>

            {/* The figure as it will be charged, echoed live. A misplaced
                decimal is obvious here and invisible in the field above. */}
            <p className="text-sm text-muted-foreground" data-testid="text-price-preview">
              {t('countries.pricePreview', {
                price: priceInput.trim() === "" ? "—" : `${priceInput} ${priceCurrency}`,
              })}
            </p>
          </div>

          <DialogFooter className="gap-2">
            {priceCountry?.licensePriceMinor ? (
              <Button
                variant="outline"
                onClick={() => priceCountry && priceMutation.mutate({ id: priceCountry.id, price: null })}
                disabled={priceMutation.isPending}
                data-testid="button-clear-price"
              >
                {t('countries.priceClear')}
              </Button>
            ) : null}
            <Button
              onClick={() => priceCountry && priceMutation.mutate({
                id: priceCountry.id, price: priceInput.trim(), currency: priceCurrency,
              })}
              disabled={priceMutation.isPending || priceInput.trim() === ""}
              data-testid="button-save-price"
            >
              {priceMutation.isPending ? t('countries.priceSaving') : t('countries.priceSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
