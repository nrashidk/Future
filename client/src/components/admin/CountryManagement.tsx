import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { 
  Globe, Plus, Edit, Trash2, Sparkles, BookOpen, 
  CheckCircle, Clock, RefreshCw, Loader2, ArrowRightLeft
} from "lucide-react";

interface Country {
  id: string;
  name: string;
  code: string;
  abbreviation: string | null;
  mission: string;
  vision: string;
  visionPlan: string | null;
  prioritySectors: string[];
  nationalGoals: string[];
  educationSystem: string | null;
  universitiesLink: string | null;
  universitiesLinkLabel: string | null;
  curricula: string[] | null;
  subjects: string[] | null;
  gradeLevels: string[] | null;
  isActive: boolean;
  llmPopulated: boolean;
  createdAt: string;
}

const GRADES = ["8", "9", "10", "11", "12"];

export default function CountryManagement() {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isGenerateQuestionsOpen, setIsGenerateQuestionsOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [repopulatingCountryId, setRepopulatingCountryId] = useState<string | null>(null);
  
  const [newCountryForm, setNewCountryForm] = useState({
    id: "",
    name: "",
    code: "",
    abbreviation: "",
    autoPopulate: true,
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

  const createMutation = useMutation({
    mutationFn: async (data: typeof newCountryForm) => {
      const response = await apiRequest('POST', '/api/admin/countries', data);
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/countries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/countries'] });
      setIsCreateModalOpen(false);
      setNewCountryForm({ id: "", name: "", code: "", abbreviation: "", autoPopulate: true });
      toast({ 
        title: t('countries.createSuccess'), 
        description: result.autoPopulated 
          ? t('countries.createSuccessAI')
          : t('countries.createSuccessManual')
      });
    },
    onError: (error: any) => {
      toast({ 
        title: t('countries.errorTitle'), 
        description: error.message || t('countries.createError'), 
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/admin/countries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/countries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/countries'] });
      toast({ title: t('countries.updateSuccess'), description: t('countries.deleteSuccess') });
    },
    onError: (error: any) => {
      toast({ 
        title: t('countries.errorTitle'), 
        description: error.message || t('countries.deleteError'), 
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
    onError: (error: any) => {
      setRepopulatingCountryId(null);
      toast({ 
        title: t('countries.errorTitle'), 
        description: error.message || t('countries.refreshError'), 
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
      toast({ 
        title: t('countries.questionsGenerated'), 
        description: t('countries.questionsGeneratedDesc', { n: result.questionsCreated, tokens: result.tokensUsed })
      });
    },
    onError: (error: any) => {
      toast({ 
        title: t('countries.errorTitle'), 
        description: error.message || t('countries.generateError'), 
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
        description: t('countries.curriculumRenamedDesc', { subjects: result.updated?.subjects || 0, questions: result.updated?.questions || 0 })
      });
    },
    onError: (error: any) => {
      toast({ 
        title: t('countries.errorTitle'), 
        description: error.message || t('countries.renameError'), 
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('countries.title')}</h2>
          <p className="text-muted-foreground">
            {t('countries.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsRenameModalOpen(true)} data-testid="button-rename-curriculum">
            <ArrowRightLeft className="w-4 h-4 me-2" />
            {t('countries.renameCurriculum')}
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)} data-testid="button-add-country">
            <Plus className="w-4 h-4 me-2" />
            {t('countries.addCountry')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            {t('countries.countriesTable', { n: countries.length })}
          </CardTitle>
          <CardDescription>
            {t('countries.countriesDesc')}
          </CardDescription>
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
                <TableHead>{t('countries.statusCol')}</TableHead>
                <TableHead className="text-right">{t('countries.actionsCol')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {countries.map((country) => (
                <TableRow key={country.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {country.name}
                      {country.llmPopulated && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="w-3 h-3 me-1" />
                          {t('countries.aiLabel')}
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
            <div>
              <Label htmlFor="countryName">{t('countries.countryName')}</Label>
              <Input
                id="countryName"
                placeholder="e.g., Saudi Arabia"
                value={newCountryForm.name}
                onChange={(e) => setNewCountryForm(f => ({ ...f, name: e.target.value }))}
                data-testid="input-country-name"
              />
            </div>
            <div>
              <Label htmlFor="abbreviation">{t('countries.abbreviation')}</Label>
              <Input
                id="abbreviation"
                placeholder="e.g., KSA (optional)"
                value={newCountryForm.abbreviation}
                onChange={(e) => setNewCountryForm(f => ({ ...f, abbreviation: e.target.value }))}
                data-testid="input-country-abbreviation"
              />
            </div>
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
    </div>
  );
}
