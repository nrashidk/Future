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
  Plus, Edit, Trash2, Search, GraduationCap, Copy, 
  BookOpen, Calculator, FlaskConical, Languages, Globe2, Code, AlertCircle
} from "lucide-react";

interface Subject {
  id: string;
  name: string;
  code: string;
  countryId: string;
  curriculum: string;
  description: string | null;
  aliases: string[] | null;
  displayOrder: number;
  isActive: boolean;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Country {
  id: string;
  name: string;
  code: string;
  abbreviation: string | null;
  curricula: string[] | null;
}

const SUBJECT_ICONS: Record<string, any> = {
  mathematics: Calculator,
  science: FlaskConical,
  english: Languages,
  arabic: Languages,
  social_studies: Globe2,
  computer_science: Code,
  default: BookOpen,
};

function getSubjectIcon(code: string) {
  return SUBJECT_ICONS[code.toLowerCase()] || SUBJECT_ICONS.default;
}

export default function SubjectManagement() {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedCurriculum, setSelectedCurriculum] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    countryId: "",
    curriculum: "",
    description: "",
    aliases: "",
    displayOrder: 0,
    icon: "",
    isActive: true,
  });

  const [cloneData, setCloneData] = useState({
    sourceCountryId: "",
    sourceCurriculum: "",
    targetCountryId: "",
    targetCurriculum: "",
  });

  const { data: countries = [], isLoading: countriesLoading } = useQuery<Country[]>({
    queryKey: ["/api/countries"],
  });

  const { data: subjects = [], isLoading: subjectsLoading, refetch: refetchSubjects } = useQuery<Subject[]>({
    queryKey: ["/api/superadmin/subjects", selectedCountry, selectedCurriculum],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCountry) params.append("countryId", selectedCountry);
      if (selectedCurriculum) params.append("curriculum", selectedCurriculum);
      const response = await fetch(`/api/superadmin/subjects?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch subjects");
      return response.json();
    },
  });

  const { data: questionCounts = [] } = useQuery<Array<{ subject: string; curriculum: string; count: number }>>({
    queryKey: ["/api/superadmin/subjects/question-counts", selectedCountry, selectedCurriculum],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCountry) params.append("countryId", selectedCountry);
      if (selectedCurriculum) params.append("curriculum", selectedCurriculum);
      const response = await fetch(`/api/superadmin/subjects/question-counts?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const getQuestionCount = (code: string, curriculum: string) =>
    questionCounts.find(c => c.subject === code && c.curriculum === curriculum)?.count ?? 0;

  const createSubjectMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/superadmin/subjects", {
        ...data,
        aliases: data.aliases ? data.aliases.split(",").map(a => a.trim()).filter(Boolean) : [],
      });
    },
    onSuccess: () => {
      toast({ title: t('subjects.createSuccess'), description: t('subjects.createSuccessDesc') });
      setShowAddDialog(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/subjects"] });
    },
    onError: (error: any) => {
      toast({ title: t('subjects.error'), description: error.message || t('subjects.failedCreate'), variant: "destructive" });
    },
  });

  const updateSubjectMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      return apiRequest("PATCH", `/api/superadmin/subjects/${data.id}`, {
        name: data.name,
        code: data.code,
        description: data.description || null,
        aliases: data.aliases ? data.aliases.split(",").map(a => a.trim()).filter(Boolean) : [],
        displayOrder: data.displayOrder,
        icon: data.icon || null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      toast({ title: t('subjects.updateSuccess'), description: t('subjects.updateSuccessDesc') });
      setShowEditDialog(false);
      setSelectedSubject(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/subjects"] });
    },
    onError: (error: any) => {
      toast({ title: t('subjects.error'), description: error.message || t('subjects.failedUpdate'), variant: "destructive" });
    },
  });

  const deleteSubjectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/superadmin/subjects/${id}`);
    },
    onSuccess: () => {
      toast({ title: t('subjects.deleteSuccess'), description: t('subjects.deleteSuccessDesc') });
      setShowDeleteDialog(false);
      setSelectedSubject(null);
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/subjects"] });
    },
    onError: (error: any) => {
      toast({ title: t('subjects.error'), description: error.message || t('subjects.failedDelete'), variant: "destructive" });
    },
  });

  const cloneSubjectsMutation = useMutation({
    mutationFn: async (data: typeof cloneData) => {
      return apiRequest("POST", "/api/superadmin/subjects/clone", data);
    },
    onSuccess: (data: any) => {
      toast({ 
        title: t('subjects.cloneSuccess'), 
        description: t('subjects.cloneSuccessDesc', { cloned: data.cloned, skipped: data.skipped })
      });
      setShowCloneDialog(false);
      setCloneData({ sourceCountryId: "", sourceCurriculum: "", targetCountryId: "", targetCurriculum: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/subjects"] });
    },
    onError: (error: any) => {
      toast({ title: t('subjects.error'), description: error.message || t('subjects.failedClone'), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      countryId: "",
      curriculum: "",
      description: "",
      aliases: "",
      displayOrder: 0,
      icon: "",
      isActive: true,
    });
  };

  const openEditDialog = (subject: Subject) => {
    setSelectedSubject(subject);
    setFormData({
      name: subject.name,
      code: subject.code,
      countryId: subject.countryId,
      curriculum: subject.curriculum,
      description: subject.description || "",
      aliases: subject.aliases?.join(", ") || "",
      displayOrder: subject.displayOrder,
      icon: subject.icon || "",
      isActive: subject.isActive,
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (subject: Subject) => {
    setSelectedSubject(subject);
    setShowDeleteDialog(true);
  };

  const filteredSubjects = subjects.filter(subject => 
    subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    subject.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCountryData = countries.find(c => c.id === selectedCountry);
  const selectedCountryForForm = countries.find(c => c.id === formData.countryId);

  // Subjects that have quiz questions but no subject entry yet
  const unregisteredSubjects = questionCounts.filter(qc =>
    qc.count > 0 &&
    (!selectedCurriculum || qc.curriculum === selectedCurriculum) &&
    !subjects.some(s => s.code === qc.subject && s.curriculum === qc.curriculum)
  );

  const registerSubjectMutation = useMutation({
    mutationFn: async (data: { subject: string; curriculum: string; countryId: string }) => {
      const displayName = data.subject
        .split(/[\s_]+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      return apiRequest("POST", "/api/superadmin/subjects", {
        name: displayName,
        code: data.subject,
        countryId: data.countryId,
        curriculum: data.curriculum,
        isActive: true,
        displayOrder: 0,
      });
    },
    onSuccess: () => {
      toast({ title: t('subjects.registerSuccess'), description: t('subjects.registerSuccessDesc') });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/subjects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/subjects/question-counts"] });
    },
    onError: (error: any) => {
      toast({ title: t('subjects.error'), description: error.message || t('subjects.failedRegister'), variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              {t('subjects.title')}
            </CardTitle>
            <CardDescription>
              {t('subjects.subtitle')}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowCloneDialog(true)}
              data-testid="button-clone-subjects"
            >
              <Copy className="w-4 h-4 me-2" />
              {t('subjects.cloneSubjects')}
            </Button>
            <Button 
              size="sm" 
              onClick={() => {
                resetForm();
                setShowAddDialog(true);
              }}
              data-testid="button-add-subject"
            >
              <Plus className="w-4 h-4 me-2" />
              {t('subjects.addSubject')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Label>{t('subjects.filterCountry')}</Label>
            <Select value={selectedCountry || "__all__"} onValueChange={(value) => {
              setSelectedCountry(value === "__all__" ? "" : value);
              setSelectedCurriculum("");
            }}>
              <SelectTrigger data-testid="select-filter-country">
                <SelectValue placeholder={t('subjects.allCountries')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('subjects.allCountries')}</SelectItem>
                {countries.map(country => (
                  <SelectItem key={country.id} value={country.id}>
                    {country.abbreviation || country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {selectedCountry && selectedCountryData?.curricula && selectedCountryData.curricula.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <Label>{t('subjects.filterCurriculum')}</Label>
              <Select value={selectedCurriculum || "__all__"} onValueChange={(value) => setSelectedCurriculum(value === "__all__" ? "" : value)}>
                <SelectTrigger data-testid="select-filter-curriculum">
                  <SelectValue placeholder={t('subjects.allCurricula')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('subjects.allCurricula')}</SelectItem>
                  {selectedCountryData.curricula.map(curriculum => (
                    <SelectItem key={curriculum} value={curriculum}>
                      {curriculum}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="flex-1 min-w-[200px]">
            <Label>{t('subjects.search')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('subjects.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-subjects"
              />
            </div>
          </div>
        </div>

        {selectedCountry && unregisteredSubjects.length > 0 && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span>{t('subjects.unregistered', { n: unregisteredSubjects.length })}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {unregisteredSubjects.map(us => {
                const displayName = us.subject
                  .split(/[\s_]+/)
                  .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ");
                return (
                  <div key={`${us.subject}-${us.curriculum}`} className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm">
                    <span className="font-medium">{displayName}</span>
                    <Badge variant="outline" className="text-xs">{us.curriculum}</Badge>
                    <span className="text-muted-foreground">{us.count} {t('subjects.questionsCount')}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => registerSubjectMutation.mutate({ subject: us.subject, curriculum: us.curriculum, countryId: selectedCountry })}
                      disabled={registerSubjectMutation.isPending}
                      data-testid={`button-register-subject-${us.subject}`}
                    >
                      {t('subjects.register')}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subjectsLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t('subjects.loading')}</div>
        ) : filteredSubjects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {subjects.length === 0 
              ? t('subjects.noSubjects')
              : t('subjects.noMatchingSubjects')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('subjects.nameCol')}</TableHead>
                <TableHead>{t('subjects.codeCol')}</TableHead>
                <TableHead>{t('subjects.countryCol')}</TableHead>
                <TableHead>{t('subjects.curriculumCol')}</TableHead>
                <TableHead>{t('subjects.questionsCol')}</TableHead>
                <TableHead>{t('subjects.statusCol')}</TableHead>
                <TableHead>{t('subjects.orderCol')}</TableHead>
                <TableHead className="text-right">{t('subjects.actionsCol')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubjects.map((subject) => {
                const IconComponent = getSubjectIcon(subject.code);
                const country = countries.find(c => c.id === subject.countryId);
                return (
                  <TableRow key={subject.id} data-testid={`row-subject-${subject.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{subject.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{subject.code}</code>
                    </TableCell>
                    <TableCell>{country?.abbreviation || country?.name || subject.countryId}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{subject.curriculum}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getQuestionCount(subject.code, subject.curriculum) > 0 ? "default" : "secondary"} data-testid={`badge-question-count-${subject.id}`}>
                        {getQuestionCount(subject.code, subject.curriculum)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={subject.isActive ? "default" : "secondary"}>
                        {subject.isActive ? t('subjects.activeStatus') : t('subjects.inactiveStatus')}
                      </Badge>
                    </TableCell>
                    <TableCell>{subject.displayOrder}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(subject)}
                        data-testid={`button-edit-subject-${subject.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(subject)}
                        data-testid={`button-delete-subject-${subject.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="text-sm text-muted-foreground">
          {t('subjects.showingOf', { count: filteredSubjects.length, total: subjects.length })}
        </div>
      </CardContent>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('subjects.addSubjectTitle')}</DialogTitle>
            <DialogDescription>
              {t('subjects.addSubjectDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-country">{t('subjects.countryLabel')}</Label>
                <Select 
                  value={formData.countryId} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, countryId: value, curriculum: "" }))}
                >
                  <SelectTrigger id="add-country" data-testid="select-add-country">
                    <SelectValue placeholder={t('subjects.selectCountry')} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map(country => (
                      <SelectItem key={country.id} value={country.id}>
                        {country.abbreviation || country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="add-curriculum">{t('subjects.curriculumLabel')}</Label>
                <Select 
                  value={formData.curriculum} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, curriculum: value }))}
                  disabled={!formData.countryId || !selectedCountryForForm?.curricula?.length}
                >
                  <SelectTrigger id="add-curriculum" data-testid="select-add-curriculum">
                    <SelectValue placeholder={t('subjects.selectCurriculum')} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedCountryForForm?.curricula?.map(curriculum => (
                      <SelectItem key={curriculum} value={curriculum}>
                        {curriculum}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="add-name">{t('subjects.subjectName')}</Label>
              <Input
                id="add-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  name: e.target.value,
                  code: prev.code || e.target.value.toLowerCase().replace(/\s+/g, '_')
                }))}
                placeholder="e.g., Mathematics"
                data-testid="input-add-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="add-code">{t('subjects.subjectCode')}</Label>
              <Input
                id="add-code"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                placeholder="e.g., mathematics"
                data-testid="input-add-code"
              />
              <p className="text-xs text-muted-foreground">{t('subjects.subjectCodeHint')}</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="add-description">{t('subjects.descriptionLabel')}</Label>
              <Textarea
                id="add-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the subject"
                data-testid="input-add-description"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="add-aliases">{t('subjects.aliasesLabel')}</Label>
              <Input
                id="add-aliases"
                value={formData.aliases}
                onChange={(e) => setFormData(prev => ({ ...prev, aliases: e.target.value }))}
                placeholder="e.g., Math, Maths, Calculus"
                data-testid="input-add-aliases"
              />
              <p className="text-xs text-muted-foreground">{t('subjects.aliasesHint')}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-order">{t('subjects.displayOrderLabel')}</Label>
                <Input
                  id="add-order"
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-add-order"
                />
              </div>
              
              <div className="flex items-center justify-between space-x-2 pt-6">
                <Label htmlFor="add-active">{t('subjects.activeLabel')}</Label>
                <Switch
                  id="add-active"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                  data-testid="switch-add-active"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('subjects.cancel')}
            </Button>
            <Button 
              onClick={() => createSubjectMutation.mutate(formData)}
              disabled={!formData.name || !formData.code || !formData.countryId || !formData.curriculum || createSubjectMutation.isPending}
              data-testid="button-confirm-add-subject"
            >
              {createSubjectMutation.isPending ? t('subjects.creating') : t('subjects.createSubject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('subjects.editSubjectTitle')}</DialogTitle>
            <DialogDescription>
              {t('subjects.editSubjectDescFull')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('subjects.countryLabel')}</Label>
                <Select 
                  value={formData.countryId} 
                  onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, countryId: value, curriculum: "" }));
                  }}
                >
                  <SelectTrigger data-testid="select-edit-country">
                    <SelectValue placeholder={t('subjects.selectCountry')} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map(country => (
                      <SelectItem key={country.id} value={country.id}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('subjects.curriculumLabel')}</Label>
                <Select 
                  value={formData.curriculum} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, curriculum: value }))}
                  disabled={!formData.countryId}
                >
                  <SelectTrigger data-testid="select-edit-curriculum">
                    <SelectValue placeholder={t('subjects.selectCurriculum')} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.find(c => c.id === formData.countryId)?.curricula?.map(curriculum => (
                      <SelectItem key={curriculum} value={curriculum}>
                        {curriculum}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t('subjects.subjectName')}</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                data-testid="input-edit-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-code">{t('subjects.subjectCode')}</Label>
              <Input
                id="edit-code"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                data-testid="input-edit-code"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-description">{t('subjects.descriptionLabel')}</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-edit-description"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-aliases">{t('subjects.aliasesLabel')}</Label>
              <Input
                id="edit-aliases"
                value={formData.aliases}
                onChange={(e) => setFormData(prev => ({ ...prev, aliases: e.target.value }))}
                data-testid="input-edit-aliases"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-order">{t('subjects.displayOrderLabel')}</Label>
                <Input
                  id="edit-order"
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-edit-order"
                />
              </div>
              
              <div className="flex items-center justify-between space-x-2 pt-6">
                <Label htmlFor="edit-active">{t('subjects.activeLabel')}</Label>
                <Switch
                  id="edit-active"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                  data-testid="switch-edit-active"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('subjects.cancel')}
            </Button>
            <Button 
              onClick={() => selectedSubject && updateSubjectMutation.mutate({ ...formData, id: selectedSubject.id })}
              disabled={!formData.name || !formData.code || updateSubjectMutation.isPending}
              data-testid="button-confirm-edit-subject"
            >
              {updateSubjectMutation.isPending ? t('subjects.saving') : t('subjects.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('subjects.deleteSubjectTitle')}</DialogTitle>
            <DialogDescription>
              {t('subjects.deleteSubjectConfirm', { name: selectedSubject?.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('subjects.cancel')}
            </Button>
            <Button 
              variant="destructive"
              onClick={() => selectedSubject && deleteSubjectMutation.mutate(selectedSubject.id)}
              disabled={deleteSubjectMutation.isPending}
              data-testid="button-confirm-delete-subject"
            >
              {deleteSubjectMutation.isPending ? t('subjects.deleting') : t('subjects.deleteSubjectTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('subjects.cloneTitle')}</DialogTitle>
            <DialogDescription>
              {t('subjects.cloneDescFull')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-4 border rounded-lg p-4">
              <h4 className="font-medium text-sm">{t('subjects.source')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('subjects.country')}</Label>
                  <Select 
                    value={cloneData.sourceCountryId} 
                    onValueChange={(value) => setCloneData(prev => ({ ...prev, sourceCountryId: value, sourceCurriculum: "" }))}
                  >
                    <SelectTrigger data-testid="select-clone-source-country">
                      <SelectValue placeholder={t('subjects.selectCountry')} />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map(country => (
                        <SelectItem key={country.id} value={country.id}>
                          {country.abbreviation || country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('subjects.curriculum')}</Label>
                  <Select 
                    value={cloneData.sourceCurriculum} 
                    onValueChange={(value) => setCloneData(prev => ({ ...prev, sourceCurriculum: value }))}
                    disabled={!cloneData.sourceCountryId}
                  >
                    <SelectTrigger data-testid="select-clone-source-curriculum">
                      <SelectValue placeholder={t('subjects.selectCurriculum')} />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.find(c => c.id === cloneData.sourceCountryId)?.curricula?.map(curriculum => (
                        <SelectItem key={curriculum} value={curriculum}>
                          {curriculum}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-4 border rounded-lg p-4">
              <h4 className="font-medium text-sm">{t('subjects.target')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('subjects.country')}</Label>
                  <Select 
                    value={cloneData.targetCountryId} 
                    onValueChange={(value) => setCloneData(prev => ({ ...prev, targetCountryId: value, targetCurriculum: "" }))}
                  >
                    <SelectTrigger data-testid="select-clone-target-country">
                      <SelectValue placeholder={t('subjects.selectCountry')} />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map(country => (
                        <SelectItem key={country.id} value={country.id}>
                          {country.abbreviation || country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('subjects.curriculum')}</Label>
                  <Select 
                    value={cloneData.targetCurriculum} 
                    onValueChange={(value) => setCloneData(prev => ({ ...prev, targetCurriculum: value }))}
                    disabled={!cloneData.targetCountryId}
                  >
                    <SelectTrigger data-testid="select-clone-target-curriculum">
                      <SelectValue placeholder={t('subjects.selectCurriculum')} />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.find(c => c.id === cloneData.targetCountryId)?.curricula?.map(curriculum => (
                        <SelectItem key={curriculum} value={curriculum}>
                          {curriculum}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloneDialog(false)}>
              {t('subjects.cancel')}
            </Button>
            <Button 
              onClick={() => cloneSubjectsMutation.mutate(cloneData)}
              disabled={
                !cloneData.sourceCountryId || 
                !cloneData.sourceCurriculum || 
                !cloneData.targetCountryId || 
                !cloneData.targetCurriculum ||
                cloneSubjectsMutation.isPending
              }
              data-testid="button-confirm-clone-subjects"
            >
              {cloneSubjectsMutation.isPending ? t('subjects.cloning') : t('subjects.cloneSubjects')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
