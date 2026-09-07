import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest, serverErrorMessage } from "@/lib/queryClient";
import { validateEmail } from "@/lib/utils";
import { SCHOOL_GRADES, gradeToNumber } from "@shared/grade";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { 
  Home, Plus, Download, Upload, Edit, Trash2, GraduationCap, 
  Users, Building2, Key, RefreshCw, FileDown, Lock, LockOpen, User, LogOut, BarChart, Shield, FileQuestion, Gift,
  Link as LinkIcon, X, ClipboardCheck
} from "lucide-react";
import { StickyNote } from "@/components/StickyNote";
import ContributeQuestions from "@/components/admin/ContributeQuestions";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { useTranslation } from "react-i18next";

async function downloadFile(url: string, defaultFilename: string, toast: any, t: (key: string) => string, setIsDownloading?: (v: boolean) => void): Promise<void> {
  try {
    setIsDownloading?.(true);
    const response = await fetch(url, { credentials: 'include' });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(errorData.message || `HTTP error ${response.status}`);
    }
    
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = defaultFilename;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/i);
      if (match) {
        filename = match[1];
      }
    }
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
    
    toast({ title: t('orgs.downloadedTitle'), description: t('orgs.downloadStartedDesc') });
  } catch (error: any) {
    toast({ 
      title: t('orgs.downloadFailedDesc'), 
      description: error.message || t('orgs.downloadFailedDesc'), 
      variant: "destructive" 
    });
  } finally {
    setIsDownloading?.(false);
  }
}

interface Organization {
  id: string;
  name: string;
  adminUserId: string;
  totalLicenses: number;
  usedLicenses: number;
  isUnlimitedLicenses: boolean;
  logoUrl?: string | null;
  countryId?: string | null;
  curriculum?: string | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  pendingRewardCredits?: number;
  rewardCredits?: number;
}

interface Country {
  id: string;
  name: string;
  curricula?: string[] | null;
}

interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  grade?: string;
  studentId?: string;
  studentGender?: string;
  role: string;
  hasCompletedAssessment: boolean;
  hasStartedAssessment: boolean;
  hasInProgressAssessment: boolean;
  isLocked: boolean;
  passwordLastReset?: string;
  passwordResetBy?: string;
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    lastLoginAt?: string;
  };
}

function getMemberStatus(member: OrganizationMember, t: (key: string) => string): { key: string; label: string; variant: "default" | "secondary" | "outline" | "destructive"; description: string } {
  if (member.role === 'admin') {
    return { key: 'admin', label: t('orgs.adminLabel'), variant: 'secondary', description: t('orgs.statusAdminDesc') };
  }
  if (member.hasCompletedAssessment) {
    return { key: 'completed', label: t('orgs.completedLabel'), variant: 'default', description: t('orgs.statusCompletedDesc') };
  }
  if (member.hasInProgressAssessment) {
    return { key: 'in_progress', label: t('orgs.inProgressLabel'), variant: 'outline', description: t('orgs.statusInProgressDesc') };
  }
  if (member.user.lastLoginAt) {
    return { key: 'active', label: t('orgs.activeLabel'), variant: 'outline', description: t('orgs.statusActiveDesc') };
  }
  return { key: 'not_active', label: t('orgs.notActiveLabel'), variant: 'secondary', description: t('orgs.statusNotActiveDesc') };
}

export default function AdminOrganizations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  useEffect(() => { document.title = t('pageTitles.adminOrganizations'); }, [t]);
  const [, navigate] = useLocation();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isCreateOrgDialogOpen, setIsCreateOrgDialogOpen] = useState(false);
  const [isEditOrgDialogOpen, setIsEditOrgDialogOpen] = useState(false);
  const [isCreateMemberDialogOpen, setIsCreateMemberDialogOpen] = useState(false);
  const [isBulkUploadDialogOpen, setIsBulkUploadDialogOpen] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState("");
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "student">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "not_active" | "active" | "in_progress" | "completed">("all");
  const [bulkResetResults, setBulkResetResults] = useState<Array<{ userId: string; username: string | null; newPassword: string | null; success: boolean; error?: string }>>([]);
  const [isBulkResetResultsModalOpen, setIsBulkResetResultsModalOpen] = useState(false);

  const { data: organizations = [], isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations'],
  });

  // Get unique first letters from organization names for the A-Z filter
  const availableLetters = Array.from(
    new Set(organizations.map(org => org.name.charAt(0).toUpperCase()))
  ).sort();

  const filteredOrganizations = organizations.filter((org) => {
    // Apply search filter
    if (schoolSearchQuery && !org.name.toLowerCase().includes(schoolSearchQuery.toLowerCase())) {
      return false;
    }
    // Apply letter filter
    if (letterFilter && !org.name.toUpperCase().startsWith(letterFilter)) {
      return false;
    }
    return true;
  });

  const { data: members = [], isLoading: membersLoading, isSuccess: membersLoaded } = useQuery<OrganizationMember[]>({
    queryKey: ['/api/admin/organizations', selectedOrgId, 'members'],
    enabled: !!selectedOrgId,
  });

  const selectedOrg = organizations.find(org => org.id === selectedOrgId);

  // EditOrganizationForm needs this: the PATCH endpoint locks country and
  // curriculum once a school has students. The organization row carries no
  // student count, but the edit dialog only ever opens for selectedOrg, and the
  // members query above is already loaded for exactly that school — so the form
  // can be told without a second request. Admin rows share the members table and
  // are not what the lock is about, hence the role filter.
  //
  // undefined, not 0, until the query has actually resolved: the form treats an
  // unknown count as LOCKED. `members` defaults to [] while in flight, and
  // reporting that as "no students" would leave the selects editable for an
  // admin to start a change the server then refuses — the 400 arriving after the
  // work, rather than the disable arriving before it. isSuccess rather than
  // !isLoading because a disabled query (no school selected) is pending, not
  // loading, and because a fresh queryKey has no data to fall back on when the
  // selected school changes.
  const selectedOrgStudentCount = membersLoaded
    ? members.filter(m => m.role === 'student').length
    : undefined;

  // Auto-select first organization for org_admin when organizations load
  useEffect(() => {
    if (user?.accountType === 'org_admin' && organizations.length > 0 && !selectedOrgId) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [organizations, selectedOrgId, user?.accountType]);

  // Reset selected members and filters when changing organizations
  useEffect(() => {
    setSelectedMemberIds([]);
    setRoleFilter("all");
    setStatusFilter("all");
  }, [selectedOrgId]);

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      return apiRequest('POST', `/api/admin/organizations/${selectedOrgId}/members/bulk-delete`, { memberIds });
    },
    onSuccess: () => {
      toast({ title: t('superadmin.success'), description: t('orgs.bulkDeleteSuccess') });
      setSelectedMemberIds([]);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrgId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
    },
    onError: (error: any) => {
      toast({ 
        title: t('superadmin.error'), 
        description: serverErrorMessage(error) || t('orgs.bulkDeleteError'), 
        variant: "destructive" 
      });
    },
  });

  // Bulk reset passwords mutation
  const bulkResetPasswordsMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      const res = await apiRequest('POST', `/api/admin/organizations/${selectedOrgId}/members/bulk-reset-passwords`, { memberIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      const successCount = data.results.filter((r: any) => r.success).length;
      const failCount = data.results.filter((r: any) => !r.success).length;
      toast({ 
        title: t('orgs.bulkPasswordResetComplete'), 
        description: t('orgs.bulkPasswordResetResult', { success: successCount, fail: failCount }),
        variant: failCount > 0 ? "destructive" : "default"
      });
      setBulkResetResults(data.results);
      setIsBulkResetResultsModalOpen(true);
      setSelectedMemberIds([]);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrgId, 'members'] });
    },
    onError: (error: any) => {
      toast({ 
        title: t('superadmin.error'), 
        description: serverErrorMessage(error) || t('orgs.bulkPasswordResetError'), 
        variant: "destructive" 
      });
    },
  });

  // Filter members based on role and status
  const filteredMembers = members.filter(member => {
    // Role filter
    if (roleFilter === "admin" && member.role !== "admin") return false;
    if (roleFilter === "student" && member.role === "admin") return false;
    
    // Status filter (only applies to non-admin members)
    if (statusFilter !== "all" && member.role !== "admin") {
      const status = getMemberStatus(member, t);
      if (statusFilter === "not_active" && status.key !== "not_active") return false;
      if (statusFilter === "active" && status.key !== "active") return false;
      if (statusFilter === "in_progress" && status.key !== "in_progress") return false;
      if (statusFilter === "completed" && status.key !== "completed") return false;
    }
    
    return true;
  });

  // Check/uncheck all members (excluding admins and locked members)
  const selectableMembers = filteredMembers.filter(m => !m.isLocked && m.role !== 'admin');
  const toggleAllMembers = () => {
    if (selectedMemberIds.length === selectableMembers.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(selectableMembers.map(m => m.id));
    }
  };

  // Toggle individual member
  const toggleMember = (memberId: string) => {
    setSelectedMemberIds(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">{t('nav.futurePathways')}</span>
            {user?.accountType === 'superadmin' && <Badge variant="secondary">{t('badges.superadmin')}</Badge>}
            {user?.accountType === 'org_admin' && <Badge variant="secondary">{t('badges.schoolAdmin')}</Badge>}
          </Link>
          <div className="flex gap-2">
            {user?.accountType === 'superadmin' && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-superadmin">
                  <Link href="/superadmin">
                    <Shield className="w-4 h-4 me-2" />
                    {t('nav.superAdmin')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                  <Link href="/admin/organizations">
                    <Building2 className="w-4 h-4 me-2" />
                    {t('nav.admin')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-questions">
                  <Link href="/admin">
                    <FileQuestion className="w-4 h-4 me-2" />
                    {t('nav.quiz')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                  <Link href="/analytics">
                    <BarChart className="w-4 h-4 me-2" />
                    {t('nav.analytics')}
                  </Link>
                </Button>
              </>
            )}
            {user?.accountType === 'org_admin' && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                  <Link href="/admin/organizations">
                    <Building2 className="w-4 h-4 me-2" />
                    {t('nav.admin')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
                  <Link href="/assessment">
                    <ClipboardCheck className="w-4 h-4 me-2" />
                    {t('nav.assessment')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                  <Link href="/analytics">
                    <BarChart className="w-4 h-4 me-2" />
                    {t('nav.analytics')}
                  </Link>
                </Button>
              </>
            )}
            {user && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-profile">
                  <Link href="/profile">
                    <User className="w-4 h-4 me-2" />
                    {t('nav.profile')}
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout}
                  data-testid="button-logout-admin-orgs"
                >
                  <LogOut className="w-4 h-4 me-2" />
                  {t('nav.logout')}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-4">
        <AnnouncementBanner />
      </div>

      <div className="max-w-7xl mx-auto py-12 px-4 space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Building2 className="w-12 h-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">{t('orgs.title')}</h1>
          </div>
          <p className="text-muted-foreground text-lg">{t('orgs.orgAdminDesc')}</p>
        </div>

        {/* Organization Selector */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg">{t('orgs.selectSchool')}</CardTitle>
              <CardDescription>{organizations.length} school{organizations.length !== 1 ? 's' : ''}</CardDescription>
            </div>
            {user?.accountType !== 'org_admin' && (
              <Dialog open={isCreateOrgDialogOpen} onOpenChange={setIsCreateOrgDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-create-school">
                    <Plus className="w-4 h-4 me-2" />
                    {t('orgs.addSchool')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <CreateOrganizationForm 
                    onSuccess={() => {
                      setIsCreateOrgDialogOpen(false);
                      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
                    }}
                  />
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {orgsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('orgs.loading')}</p>
            ) : organizations.length === 0 ? (
              <div className="text-center py-8">
                <StickyNote color="yellow" rotation="1" className="mx-auto mb-4">
                  <Building2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('orgs.noSchoolsYet')}</p>
                </StickyNote>
              </div>
            ) : (
              <div className="space-y-4">
                {organizations.length > 0 && (
                  <div className="space-y-3">
                    {/* Search input */}
                    <div className="relative">
                      <Input
                        placeholder={t('orgs.searchSchools')}
                        value={schoolSearchQuery}
                        onChange={(e) => {
                          setSchoolSearchQuery(e.target.value);
                          if (e.target.value) setLetterFilter(null); // Clear letter filter when searching
                        }}
                        className="max-w-sm"
                        data-testid="input-search-schools"
                      />
                    </div>
                    
                    {/* A-Z Letter Filter */}
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs text-muted-foreground mr-2">{t('orgs.filterByLetter')}</span>
                      <Button
                        variant={letterFilter === null ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setLetterFilter(null)}
                        data-testid="letter-filter-all"
                      >
                        {t('orgs.allLetter')}
                      </Button>
                      {availableLetters.map((letter) => (
                        <Button
                          key={letter}
                          variant={letterFilter === letter ? "default" : "ghost"}
                          size="sm"
                          className="h-7 w-7 p-0 text-xs"
                          onClick={() => {
                            setLetterFilter(letter);
                            setSchoolSearchQuery(""); // Clear search when selecting a letter
                          }}
                          data-testid={`letter-filter-${letter}`}
                        >
                          {letter}
                        </Button>
                      ))}
                    </div>
                    
                    {/* Filter status */}
                    {(schoolSearchQuery || letterFilter) && (
                      <p className="text-xs text-muted-foreground">
                        {t('orgs.showingSchools', { count: filteredOrganizations.length, total: organizations.length })}
                        {letterFilter && t('orgs.startingWith', { letter: letterFilter })}
                        {schoolSearchQuery && t('orgs.matchingQuery', { query: schoolSearchQuery })}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {filteredOrganizations.map((org) => (
                    <Button
                      key={org.id}
                      variant={selectedOrgId === org.id ? "default" : "outline"}
                      onClick={() => setSelectedOrgId(org.id)}
                      className="flex items-center gap-2"
                      data-testid={`org-item-${org.id}`}
                    >
                      <Building2 className="w-4 h-4" />
                      <span>{org.name}</span>
                      <Badge variant={selectedOrgId === org.id ? "secondary" : (org.isUnlimitedLicenses || org.usedLicenses < org.totalLicenses ? "default" : "secondary")} className="ml-1">
                        {org.isUnlimitedLicenses ? t('orgs.unlimited') : `${org.usedLicenses}/${org.totalLicenses}`}
                      </Badge>
                      {(org.pendingRewardCredits ?? 0) > 0 && (
                        <Badge variant="outline" className="ml-1 bg-orange-50 text-orange-700 border-orange-200">
                          <Gift className="w-3 h-3 mr-1" />
                          {t('orgs.pendingN', { n: org.pendingRewardCredits })}
                        </Badge>
                      )}
                    </Button>
                  ))}
                  {filteredOrganizations.length === 0 && (schoolSearchQuery || letterFilter) && (
                    <div className="text-center py-4 w-full">
                      <p className="text-sm text-muted-foreground">
                        {t('orgs.noSchoolsFound')}{letterFilter && t('orgs.startingWith', { letter: letterFilter })}{schoolSearchQuery && t('orgs.matchingQuery', { query: schoolSearchQuery })}
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="mt-2 text-primary"
                        onClick={() => { setLetterFilter(null); setSchoolSearchQuery(""); }}
                      >
                        {t('orgs.clearFilters')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {!selectedOrg ? (
          <Card className="flex items-center justify-center py-16">
            <CardContent className="text-center">
              <StickyNote color="blue" rotation="-1" className="mx-auto">
                <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {t('orgs.selectSchoolHint')}
                </p>
              </StickyNote>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Organization Details - Centered */}
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {selectedOrg.logoUrl && (
                      <img 
                        src={selectedOrg.logoUrl} 
                        alt={`${selectedOrg.name} logo`} 
                        className="h-12 w-12 object-contain rounded"
                        data-testid="img-org-logo-display"
                      />
                    )}
                    <div>
                      <CardTitle className="text-2xl">{selectedOrg.name}</CardTitle>
                      <CardDescription>School ID: {selectedOrg.id}</CardDescription>
                    </div>
                  </div>
                  <Dialog open={isEditOrgDialogOpen} onOpenChange={setIsEditOrgDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-edit-school">
                        <Edit className="w-4 h-4 mr-2" />
                        {t('orgs.editDetails')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <EditOrganizationForm 
                        organization={selectedOrg}
                        studentCount={selectedOrgStudentCount}
                        onSuccess={() => {
                          setIsEditOrgDialogOpen(false);
                          queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
            </Card>

            {/* Licenses Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StickyNote color="green" rotation="1" className="p-6">
                <p className="text-sm text-muted-foreground mb-2">{t('orgs.licenseStatus')}</p>
                <p className="text-3xl font-bold">
                  {selectedOrg.isUnlimitedLicenses ? t('orgs.unlimited') : selectedOrg.totalLicenses}
                </p>
              </StickyNote>
              <StickyNote color="blue" rotation="-1" className="p-6">
                <p className="text-sm text-muted-foreground mb-2">{t('superadmin.licenseUtilization')}</p>
                <p className="text-3xl font-bold">{selectedOrg.usedLicenses}</p>
              </StickyNote>
              <StickyNote color="yellow" rotation="2" className="p-6">
                <p className="text-sm text-muted-foreground mb-2">{t('orgs.available')}</p>
                <p className="text-3xl font-bold">
                  {selectedOrg.isUnlimitedLicenses ? t('orgs.unlimited') : (selectedOrg.totalLicenses - selectedOrg.usedLicenses)}
                </p>
              </StickyNote>
            </div>

            {/* Students Roster - Full Width */}
            <Card>
              <CardHeader className="space-y-4 pb-4">
                <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-lg">{t('orgs.roster')}</CardTitle>
                    <CardDescription>
                      {filteredMembers.length === members.length 
                        ? `${members.length} members`
                        : `Showing ${filteredMembers.length} of ${members.length} members`}
                      {selectedMemberIds.length > 0 && (
                        <span className="text-primary font-medium ml-2">
                          ({selectedMemberIds.length} selected)
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
                      <SelectTrigger className="w-[130px]" data-testid="select-role-filter">
                        <SelectValue placeholder={t('orgs.filterRole')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('orgs.allRoles')}</SelectItem>
                        <SelectItem value="admin">{t('orgs.admins')}</SelectItem>
                        <SelectItem value="student">{t('orgs.students')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                      <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                        <SelectValue placeholder={t('orgs.filterStatus')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('orgs.allStatus')}</SelectItem>
                        <SelectItem value="not_active">{t('orgs.notActive')}</SelectItem>
                        <SelectItem value="active">{t('orgs.active')}</SelectItem>
                        <SelectItem value="in_progress">{t('orgs.inProgress')}</SelectItem>
                        <SelectItem value="completed">{t('orgs.completed')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    data-testid="button-export-reports"
                    onClick={async () => {
                      await downloadFile(
                        `/api/admin/organizations/${selectedOrgId}/export/reports`,
                        'reports.zip',
                        toast,
                        t
                      );
                      toast({
                        title: t('orgs.exportReportsSummaryHintTitle'),
                        description: t('orgs.exportReportsSummaryHintDesc'),
                      });
                    }}
                    disabled={members.filter(m => m.isLocked).length === 0}
                  >
                    <FileDown className="w-4 h-4 me-2" />
                    {t('orgs.exportReports')}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    data-testid="button-export-csv"
                    onClick={() => {
                      downloadFile(
                        `/api/admin/organizations/${selectedOrgId}/export/csv`,
                        'student_data.csv',
                        toast,
                        t
                      );
                    }}
                    disabled={members.length === 0}
                  >
                    <Download className="w-4 h-4 me-2" />
                    {t('orgs.exportStudents')}
                  </Button>
                  {selectedMemberIds.length > 0 && (
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => bulkResetPasswordsMutation.mutate(selectedMemberIds)}
                        disabled={bulkResetPasswordsMutation.isPending}
                        data-testid="button-bulk-reset-passwords"
                      >
                        <Key className="w-4 h-4 me-2" />
                        {t('orgs.bulkReset')} ({selectedMemberIds.length})
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" data-testid="button-bulk-delete">
                            <Trash2 className="w-4 h-4 me-2" />
                            {t('orgs.bulkDelete')} ({selectedMemberIds.length})
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('orgs.bulkDelete')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('orgs.confirmDelete')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('orgs.cancel')}</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => bulkDeleteMutation.mutate(selectedMemberIds)}
                              className="bg-destructive hover:bg-destructive/90"
                              data-testid="button-confirm-bulk-delete"
                            >
                              {t('orgs.delete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedMemberIds([])}
                        data-testid="button-clear-selection"
                      >
                        {t('orgs.deselectAll')}
                      </Button>
                    </div>
                  )}
                  <Dialog open={isBulkResetResultsModalOpen} onOpenChange={setIsBulkResetResultsModalOpen}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{t('orgs.bulkPasswordResetComplete')}</DialogTitle>
                        <DialogDescription>
                          {t('orgs.newPasswordDesc')}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-2">
                        {bulkResetResults.map((result, index) => (
                          <div key={index} className={`p-3 rounded-md border ${result.success ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                            {result.success ? (
                              <div className="flex justify-between items-center">
                                <span className="font-medium">{result.username}</span>
                                <code className="bg-muted px-2 py-1 rounded text-sm">{result.newPassword}</code>
                              </div>
                            ) : (
                              <div className="text-red-600 dark:text-red-400">
                                {result.username || result.userId}: {result.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            const text = bulkResetResults
                              .filter(r => r.success)
                              .map(r => `${r.username}: ${r.newPassword}`)
                              .join('\n');
                            navigator.clipboard.writeText(text);
                            toast({ title: t('orgs.copiedCredentialsTitle'), description: t('orgs.credentialsCopiedClipboard') });
                          }}
                          data-testid="button-copy-bulk-credentials"
                        >
                          {t('orgs.copyToClipboardBtn')}
                        </Button>
                        <Button onClick={() => setIsBulkResetResultsModalOpen(false)} data-testid="button-close-bulk-results">
                          {t('orgs.closeBtn')}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={isBulkUploadDialogOpen} onOpenChange={setIsBulkUploadDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-bulk-upload">
                        <Upload className="w-4 h-4 me-2" />
                        {t('orgs.bulkUpload')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <BulkUploadForm 
                        organizationId={selectedOrg.id}
                        onSuccess={() => {
                          setIsBulkUploadDialogOpen(false);
                          queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrgId, 'members'] });
                          queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                  <Dialog open={isCreateMemberDialogOpen} onOpenChange={setIsCreateMemberDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-create-member">
                        <Plus className="w-4 h-4 me-2" />
                        {t('orgs.addStudent')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <CreateMemberForm 
                        organizationId={selectedOrg.id}
                        onSuccess={() => {
                          setIsCreateMemberDialogOpen(false);
                          queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrgId, 'members'] });
                          queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {membersLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t('orgs.loading')}</p>
                ) : members.length === 0 ? (
                  <div className="text-center py-8">
                    <StickyNote color="purple" rotation="-2" className="mx-auto">
                      <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t('orgs.noMembers')}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t('orgs.rosterDesc')}</p>
                    </StickyNote>
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">{t('orgs.noMembersFilter')}</p>
                    <Button 
                      variant="ghost" 
                      onClick={() => { setRoleFilter("all"); setStatusFilter("all"); }}
                      className="mt-2 text-primary"
                    >
                      {t('orgs.deselectAll')}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectableMembers.length > 0 && selectedMemberIds.length === selectableMembers.length}
                              onCheckedChange={toggleAllMembers}
                              disabled={selectableMembers.length === 0}
                              data-testid="checkbox-select-all"
                            />
                          </TableHead>
                          <TableHead>{t('orgs.name')}</TableHead>
                          <TableHead>{t('orgs.username')}</TableHead>
                          <TableHead>{t('orgs.gender')}</TableHead>
                          <TableHead>{t('orgs.grade')}</TableHead>
                          <TableHead>{t('orgs.studentId')}</TableHead>
                          <TableHead>{t('orgs.status')}</TableHead>
                          <TableHead className="text-right">{t('orgs.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMembers.map((member) => (
                          <TableRow key={member.id} data-testid={`member-row-${member.id}`}>
                            <TableCell>
                              <Checkbox
                                checked={selectedMemberIds.includes(member.id)}
                                onCheckedChange={() => toggleMember(member.id)}
                                disabled={member.isLocked || member.role === 'admin'}
                                data-testid={`checkbox-member-${member.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {member.user.firstName} {member.user.lastName}
                            </TableCell>
                            <TableCell>{member.user.username}</TableCell>
                            <TableCell className="capitalize">{member.studentGender || '-'}</TableCell>
                            <TableCell>{member.grade || '-'}</TableCell>
                            <TableCell>{member.studentId || '-'}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {member.isLocked && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Lock className="w-3 h-3 me-1" />
                                    {t('orgs.lockedLabel')}
                                  </Badge>
                                )}
                                {(() => {
                                  const status = getMemberStatus(member, t);
                                  return (
                                    <Badge 
                                      variant={status.variant} 
                                      className="text-xs"
                                      title={status.description}
                                    >
                                      {member.role === 'admin' && <Shield className="w-3 h-3 mr-1" />}
                                      {status.label}
                                    </Badge>
                                  );
                                })()}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <MemberActions member={member} organizationId={selectedOrg.id} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contribute Questions Section - Only for org_admin */}
            {user?.accountType === 'org_admin' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Gift className="w-6 h-6 text-primary" />
                    <div>
                      <CardTitle>{t('orgs.contributeTab')}</CardTitle>
                      <CardDescription>{t('contributions.submitFirst')}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ContributeQuestions />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CreateOrganizationForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [formData, setFormData] = useState({
    organizationName: "",
    totalLicenses: 50,
    isUnlimitedLicenses: false,
    // Required by POST /api/superadmin/organizations/create-with-admin. Was
    // the "none" sentinel; a required field has no "none".
    countryId: "" as string,
    curriculum: "" as string,
    adminFirstName: "",
    adminLastName: "",
    adminEmail: "",
    adminUsername: "",
  });
  const [createdCredentials, setCreatedCredentials] = useState<{
    username: string;
    password: string;
    organizationName: string;
  } | null>(null);

  const { data: countries = [] } = useQuery<Country[]>({
    queryKey: ['/api/countries'],
  });

  const selectedCountry = countries.find(c => c.id === formData.countryId);
  const availableCurricula = selectedCountry?.curricula || [];

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        organizationName: data.organizationName,
        totalLicenses: data.totalLicenses,
        isUnlimitedLicenses: data.isUnlimitedLicenses,
        countryId: data.countryId,
        curriculum: data.curriculum,
        adminFirstName: data.adminFirstName,
        adminLastName: data.adminLastName,
        adminEmail: data.adminEmail || undefined,
        adminUsername: data.adminUsername || undefined,
      };
      return apiRequest('POST', '/api/superadmin/organizations/create-with-admin', payload);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      setCreatedCredentials({
        username: result.admin.credentials.username,
        password: result.admin.credentials.password,
        organizationName: result.organization.name,
      });
      toast({ title: t('superadmin.success'), description: t('orgs.schoolCreatedAndAdminSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('superadmin.error'), description: serverErrorMessage(error) || t('orgs.schoolCreatedError'), variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleCopyCredentials = () => {
    if (createdCredentials) {
      const text = `${t('orgs.orgSchoolNameLabel')}: ${createdCredentials.organizationName}\n${t('orgs.orgAdminUsernameLabel')}: ${createdCredentials.username}\n${t('orgs.orgAdminPasswordLabel')}: ${createdCredentials.password}`;
      navigator.clipboard.writeText(text);
      toast({ title: t('orgs.copiedCredentialsTitle'), description: t('orgs.credentialsCopiedClipboard') });
    }
  };

  const handleDownloadCredentials = () => {
    if (createdCredentials) {
      const content = `${t('orgs.credFileTitleAdmin')}
${t('orgs.credFileSeparator')}

${t('orgs.orgSchoolNameLabel')}: ${createdCredentials.organizationName}
${t('orgs.orgAdminUsernameLabel')}: ${createdCredentials.username}
${t('orgs.orgAdminPasswordLabel')}: ${createdCredentials.password}

${t('orgs.loginUrlLabel')}: ${window.location.origin}/student-login

${t('orgs.credFileImportant')}
`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${createdCredentials.organizationName.replace(/\s+/g, '_')}_admin_credentials.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t('orgs.downloadedTitle'), description: t('orgs.credentialsFileDownloaded') });
    }
  };

  if (createdCredentials) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t('orgs.schoolCreatedTitle')}</DialogTitle>
          <DialogDescription>
            {t('orgs.schoolCreatedTitleDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-4 bg-muted/50 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t('orgs.orgSchoolNameLabel')}</Label>
            <p className="font-medium">{createdCredentials.organizationName}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t('orgs.orgAdminUsernameLabel')}</Label>
            <p className="font-mono font-medium">{createdCredentials.username}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t('orgs.orgAdminPasswordLabel')}</Label>
            <p className="font-mono font-medium text-primary">{createdCredentials.password}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handleDownloadCredentials} data-testid="button-download-credentials">
            <Download className="w-4 h-4 mr-2" />
            {t('orgs.downloadBtn')}
          </Button>
          <Button variant="outline" onClick={handleCopyCredentials} data-testid="button-copy-credentials">
            {t('orgs.copyCredentials')}
          </Button>
          <Button onClick={onSuccess} data-testid="button-done">
            {t('orgs.doneBtn')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t('orgs.createSchoolFormTitle')}</DialogTitle>
        <DialogDescription>
          {t('orgs.createSchoolFormDesc')}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="org-name">{t('orgs.schoolNameRequired')}</Label>
          <Input
            id="org-name"
            value={formData.organizationName}
            onChange={(e) => setFormData(f => ({ ...f, organizationName: e.target.value }))}
            required
            placeholder={t('orgs.schoolNamePlaceholder')}
            data-testid="input-org-name"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="unlimited-licenses" className="text-base">{t('orgs.unlimitedLicensesToggle')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('orgs.unlimitedLicensesToggleDesc')}
            </p>
          </div>
          <Switch
            id="unlimited-licenses"
            checked={formData.isUnlimitedLicenses}
            onCheckedChange={(checked) => setFormData(f => ({ ...f, isUnlimitedLicenses: checked }))}
            data-testid="switch-unlimited-licenses"
          />
        </div>

        {!formData.isUnlimitedLicenses && (
          <div>
            <Label htmlFor="total-licenses">{t('orgs.totalLicensesRequired')}</Label>
            <Input
              id="total-licenses"
              type="number"
              min="1"
              value={formData.totalLicenses}
              onChange={(e) => setFormData(f => ({ ...f, totalLicenses: parseInt(e.target.value) }))}
              required
              data-testid="input-total-licenses"
            />
          </div>
        )}

        <div>
          <Label htmlFor="org-country">{t('orgs.countryRequired')}</Label>
          <Select 
            value={formData.countryId} 
            onValueChange={(value) => setFormData(f => ({ ...f, countryId: value, curriculum: "" }))}
          >
            <SelectTrigger id="org-country" data-testid="select-org-country">
              <SelectValue placeholder={t('orgs.selectCountryReq')} />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country.id} value={country.id}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {t('orgs.defaultCountryHint')}
          </p>
        </div>

        {formData.countryId && availableCurricula.length === 0 && (
          <p className="text-xs text-destructive" data-testid="error-org-no-curricula">
            {t('orgs.countryNoCurricula')}
          </p>
        )}

        {formData.countryId && availableCurricula.length > 0 && (
          <div>
            <Label htmlFor="org-curriculum">{t('orgs.schoolCurriculumLabel')}</Label>
            <Select 
              value={formData.curriculum} 
              onValueChange={(value) => setFormData(f => ({ ...f, curriculum: value }))}
            >
              <SelectTrigger id="org-curriculum" data-testid="select-org-curriculum">
                <SelectValue placeholder={t('orgs.selectCurriculumOpt')} />
              </SelectTrigger>
              <SelectContent>
                {availableCurricula.map((curriculum) => (
                  <SelectItem key={curriculum} value={curriculum}>
                    {curriculum}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {t('orgs.curriculumHint')}
            </p>
          </div>
        )}

        <Separator />

        <div>
          <h4 className="font-medium mb-3">{t('orgs.schoolAdminSection')}</h4>
          <p className="text-sm text-muted-foreground mb-4">
            {t('orgs.schoolAdminSectionDesc')}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="admin-first-name">{t('orgs.firstNameRequired')}</Label>
              <Input
                id="admin-first-name"
                value={formData.adminFirstName}
                onChange={(e) => setFormData(f => ({ ...f, adminFirstName: e.target.value }))}
                required
                data-testid="input-admin-first-name"
              />
            </div>
            <div>
              <Label htmlFor="admin-last-name">{t('orgs.lastNameRequired')}</Label>
              <Input
                id="admin-last-name"
                value={formData.adminLastName}
                onChange={(e) => setFormData(f => ({ ...f, adminLastName: e.target.value }))}
                required
                data-testid="input-admin-last-name"
              />
            </div>
          </div>

          <div className="mt-3">
            <Label htmlFor="admin-email">{t('orgs.emailOptionalLabel')}</Label>
            <Input
              id="admin-email"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => setFormData(f => ({ ...f, adminEmail: e.target.value }))}
              placeholder={t('superadmin.adminEmailPlaceholder')}
              data-testid="input-admin-email"
            />
            {validateEmail(formData.adminEmail) && (
              <p className="text-xs text-destructive mt-1">{validateEmail(formData.adminEmail)}</p>
            )}
          </div>

          <div className="mt-3">
            <Label htmlFor="admin-username">{t('orgs.usernameOptionalLabel')}</Label>
            <Input
              id="admin-username"
              value={formData.adminUsername}
              onChange={(e) => setFormData(f => ({ ...f, adminUsername: e.target.value }))}
              placeholder={t('orgs.usernameLeavePlaceholder')}
              data-testid="input-admin-username"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('orgs.usernameGeneratedHint')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={mutation.isPending || !formData.countryId || !formData.curriculum || !!validateEmail(formData.adminEmail)} data-testid="button-submit-school">
          {mutation.isPending ? t('orgs.creatingSchool') : t('orgs.createSchoolFormBtn')}
        </Button>
      </div>
    </form>
  );
}

function EditOrganizationForm({ organization, studentCount, onSuccess }: { organization: Organization; studentCount: number | undefined; onSuccess: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [formData, setFormData] = useState({
    name: organization.name,
    logoUrl: organization.logoUrl || "",
    // "" not "none": the PATCH endpoint refuses to clear either field once set
    // (admin.routes.ts), so there is no "none" to offer. An empty value here
    // means "this school never had one" and is simply omitted from the payload.
    countryId: organization.countryId || "",
    curriculum: organization.curriculum || "",
  });
  const [logoInputMode, setLogoInputMode] = useState<"url" | "upload">("url");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: countries = [] } = useQuery<Country[]>({
    queryKey: ['/api/countries'],
  });

  const selectedCountry = countries.find(c => c.id === formData.countryId);
  const availableCurricula = selectedCountry?.curricula || [];

  // The PATCH endpoint refuses to CHANGE either field once the school has
  // students — the quiz bank is curriculum-scoped and every existing assessment
  // records the curriculum it was drawn under. Only a school that already has
  // the field set is locked: filling in a blank one stays open, which is how an
  // unconfigured school is made usable.
  //
  // An unknown count (undefined — the members query has not resolved) locks too.
  // The disable exists to tell the admin the rule BEFORE they pick a new
  // curriculum; defaulting to editable would invert that, letting them make a
  // change and learn from a 400 that it was never allowed. Failing safe costs at
  // most a moment of a select being disabled on a school that turns out to have
  // no students.
  const countUnknown = studentCount === undefined;
  const countryLocked = (countUnknown || studentCount > 0) && !!organization.countryId;
  const curriculumLocked = (countUnknown || studentCount > 0) && !!organization.curriculum;

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        name: data.name,
        logoUrl: data.logoUrl === "" ? null : data.logoUrl,
        // undefined, not null — null is a clear, which the endpoint rejects.
        // Omitting leaves an as-yet-unconfigured school untouched.
        countryId: data.countryId || undefined,
        curriculum: data.curriculum || undefined,
      };
      return apiRequest('PATCH', `/api/admin/organizations/${organization.id}`, payload);
    },
    onSuccess: () => {
      toast({ title: t('superadmin.success'), description: t('orgs.schoolUpdateSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      onSuccess();
    },
    onError: (error: unknown) => {
      // Was arg-less, so the 400 from the PATCH endpoint (a18343b) rendered as
      // "failed to update" with no reason.
      toast({ title: t('superadmin.error'), description: serverErrorMessage(error) || t('orgs.schoolUpdateError'), variant: "destructive" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: t('superadmin.error'), description: t('orgs.logoTypeError'), variant: "destructive" });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t('superadmin.error'), description: t('orgs.logoSizeError'), variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('logo', file);

      const response = await fetch(`/api/admin/organizations/${organization.id}/logo`, {
        method: 'POST',
        body: formDataUpload,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      setFormData(f => ({ ...f, logoUrl: result.logoUrl }));
      toast({ title: t('superadmin.success'), description: t('orgs.logoUploadSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
    } catch (error: any) {
      toast({ title: t('superadmin.error'), description: error.message || t('orgs.logoUploadError'), variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t('orgs.editSchoolTitle')}</DialogTitle>
        <DialogDescription>
          {t('orgs.editSchoolDesc')}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="edit-org-name">{t('orgs.schoolNameReqLabel')}</Label>
          <Input
            id="edit-org-name"
            value={formData.name}
            onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
            required
            placeholder={t('orgs.schoolNamePlaceholder')}
            data-testid="input-edit-org-name"
          />
        </div>

        <div>
          <Label>{t('orgs.logoOptionalLabel')}</Label>
          <div className="flex gap-2 mt-1 mb-2">
            <Button
              type="button"
              variant={logoInputMode === "url" ? "default" : "outline"}
              size="sm"
              onClick={() => setLogoInputMode("url")}
              data-testid="button-logo-url-mode"
            >
              <LinkIcon className="h-4 w-4 mr-1" />
              {t('orgs.urlModeBtn')}
            </Button>
            <Button
              type="button"
              variant={logoInputMode === "upload" ? "default" : "outline"}
              size="sm"
              onClick={() => setLogoInputMode("upload")}
              data-testid="button-logo-upload-mode"
            >
              <Upload className="h-4 w-4 mr-1" />
              {t('orgs.uploadModeBtn')}
            </Button>
          </div>

          {logoInputMode === "url" ? (
            <>
              <Input
                id="edit-org-logo"
                value={formData.logoUrl}
                onChange={(e) => setFormData(f => ({ ...f, logoUrl: e.target.value }))}
                placeholder={t('orgs.logoUrlPlaceholder')}
                data-testid="input-edit-org-logo"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('orgs.logoUrlHint')}
              </p>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="flex-1"
                  data-testid="input-upload-logo"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('orgs.uploadLogoHint')}
              </p>
              {isUploading && (
                <p className="text-xs text-primary mt-1">{t('orgs.uploadingLogo')}</p>
              )}
            </>
          )}

          {formData.logoUrl && (
            <div className="mt-3 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">{t('orgs.logoPreviewLabel')}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData(f => ({ ...f, logoUrl: "" }))}
                  className="h-6 px-2 text-xs"
                  data-testid="button-remove-logo"
                >
                  <X className="h-3 w-3 mr-1" />
                  {t('orgs.removeLogoBtn')}
                </Button>
              </div>
              <img 
                src={formData.logoUrl} 
                alt="Logo preview" 
                className="h-16 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="edit-org-country">{t('orgs.defaultCountryLabel')}</Label>
          <Select 
            value={formData.countryId} 
            onValueChange={(value) => setFormData(f => ({ ...f, countryId: value, curriculum: "" }))}
            disabled={countryLocked}
          >
            <SelectTrigger id="edit-org-country" data-testid="select-edit-org-country">
              <SelectValue placeholder={t('orgs.selectCountryReq')} />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country.id} value={country.id}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Said rather than merely done: a select that will not open reads as a
            bug unless the reason is on screen. The unknown-count wording states
            the rule without a number — claiming one we do not have would be
            worse than admitting the check is still running. */}
        {(countryLocked || curriculumLocked) && (
          <p className="text-xs text-muted-foreground" data-testid="note-edit-org-curriculum-locked">
            {countUnknown
              ? t('orgs.curriculumLockedChecking')
              : t('orgs.curriculumLockedNote', { n: studentCount })}
          </p>
        )}

        {formData.countryId && availableCurricula.length === 0 && (
          <p className="text-xs text-destructive" data-testid="error-edit-org-no-curricula">
            {t('orgs.countryNoCurricula')}
          </p>
        )}

        {formData.countryId && availableCurricula.length > 0 && (
          <div>
            <Label htmlFor="edit-org-curriculum">{t('orgs.schoolCurriculumLabel')}</Label>
            <Select 
              value={formData.curriculum} 
              onValueChange={(value) => setFormData(f => ({ ...f, curriculum: value }))}
              disabled={curriculumLocked}
            >
              <SelectTrigger id="edit-org-curriculum" data-testid="select-edit-org-curriculum">
                <SelectValue placeholder={t('orgs.selectCurriculumOpt')} />
              </SelectTrigger>
              <SelectContent>
                {availableCurricula.map((curriculum) => (
                  <SelectItem key={curriculum} value={curriculum}>
                    {curriculum}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {t('orgs.curriculumHint')}
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        {/* A country with no curriculum selected would leave the school paired
            with whatever curriculum the PREVIOUS country had — changing country
            resets curriculum to "", and an omitted curriculum is not written,
            so the stale one would survive. Block that pairing rather than save
            it. A school with no country at all is left alone: this form must
            still be usable to edit the name or logo of an unconfigured school. */}
        <Button
          type="submit"
          disabled={
            mutation.isPending ||
            isUploading ||
            (!!formData.countryId && availableCurricula.length === 0) ||
            (!!formData.countryId && availableCurricula.length > 0 && !formData.curriculum)
          }
          data-testid="button-submit-edit-school"
        >
          {mutation.isPending ? t('orgs.updatingSchool') : t('orgs.updateSchoolBtn')}
        </Button>
      </div>
    </form>
  );
}

function CreateMemberForm({ organizationId, onSuccess }: { organizationId: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [formData, setFormData] = useState({
    fullName: "",
    grade: "",
    studentId: "",
    studentGender: "",
    username: "",
    passwordComplexity: "medium" as "easy" | "medium" | "strong",
  });
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null);
  // Grade and gender are required by the DB (the role-scoped CHECK on
  // organization_members) and by studentDemographicsSchema on the server. Both
  // controls are Radix Selects, not native inputs, so a `required` attribute
  // does nothing — the gate has to be explicit.
  const [fieldErrors, setFieldErrors] = useState<{ grade?: string; studentGender?: string }>({});

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('POST', `/api/admin/organizations/${organizationId}/members`, data);
      return await response.json();
    },
    onSuccess: (data) => {
      setCreatedCredentials({ username: data.user.username, password: data.password });
      toast({ title: t('superadmin.success'), description: t('orgs.studentCreateSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', organizationId, 'members'] });
    },
    onError: (error: any) => {
      toast({ 
        title: t('superadmin.error'), 
        description: serverErrorMessage(error) || t('orgs.studentCreateError'), 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { grade?: string; studentGender?: string } = {};
    if (!formData.grade) errors.grade = t('orgs.fieldRequired');
    if (!formData.studentGender) errors.studentGender = t('orgs.fieldRequired');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    mutation.mutate(formData);
  };

  const handleDownloadCredentials = () => {
    if (!createdCredentials) return;
    
    const content = `${t('orgs.usernameFieldLabel')}: ${createdCredentials.username}\n${t('orgs.passwordFieldLabel')}: ${createdCredentials.password}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${createdCredentials.username}-credentials.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    onSuccess();
  };

  if (createdCredentials) {
    return (
      <div className="space-y-6">
        <DialogHeader>
          <DialogTitle>{t('orgs.studentAccountCreated')}</DialogTitle>
          <DialogDescription>
            {t('orgs.studentAccountCreatedDesc')}
          </DialogDescription>
        </DialogHeader>

        <StickyNote color="yellow" rotation="1" className="mx-auto">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('orgs.usernameFieldLabel')}</p>
              <p className="font-mono font-bold text-lg">{createdCredentials.username}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('orgs.passwordFieldLabel')}</p>
              <p className="font-mono font-bold text-lg">{createdCredentials.password}</p>
            </div>
          </div>
        </StickyNote>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => {
            navigator.clipboard.writeText(`${t('orgs.usernameFieldLabel')}: ${createdCredentials.username}\n${t('orgs.passwordFieldLabel')}: ${createdCredentials.password}`);
            toast({ title: t('orgs.copiedTitle'), description: t('orgs.credentialsCopiedClipboard') });
          }}>
            {t('orgs.copyToClipboardBtn')}
          </Button>
          <Button onClick={handleDownloadCredentials} data-testid="button-download-credentials">
            <Download className="w-4 h-4 mr-2" />
            {t('orgs.downloadCloseBtn')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t('orgs.addStudentFormTitle')}</DialogTitle>
        <DialogDescription>
          {t('orgs.addStudentFormDesc')}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="full-name">{t('orgs.fullNameRequired')}</Label>
          <Input
            id="full-name"
            value={formData.fullName}
            onChange={(e) => setFormData(f => ({ ...f, fullName: e.target.value }))}
            required
            placeholder={t('orgs.fullNamePlaceholder')}
            data-testid="input-full-name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="grade">{t('orgs.gradeRequired')}</Label>
            <Select value={formData.grade} onValueChange={(value) => {
              setFormData(f => ({ ...f, grade: value }));
              setFieldErrors(e => ({ ...e, grade: undefined }));
            }}>
              <SelectTrigger id="grade" data-testid="select-grade">
                <SelectValue placeholder={t('orgs.selectGradeOpt')} />
              </SelectTrigger>
              <SelectContent>
                {/* Values are canonical ('grade8'…'grade12'); the label keeps the
                    bare number. This select used to emit "8"…"12", which is how a
                    second grade format entered organization_members. */}
                {SCHOOL_GRADES.map(g => (
                  <SelectItem key={g} value={g}>{t('orgs.gradeItemN', { n: gradeToNumber(g) })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.grade && (
              <p className="text-xs text-destructive mt-1" data-testid="error-grade">{fieldErrors.grade}</p>
            )}
          </div>

          <div>
            <Label htmlFor="student-id">{t('orgs.studentIdFieldLabel')}</Label>
            <Input
              id="student-id"
              value={formData.studentId}
              onChange={(e) => setFormData(f => ({ ...f, studentId: e.target.value }))}
              placeholder={t('orgs.optionalPlaceholder')}
              data-testid="input-student-id"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="student-gender">{t('orgs.genderRequired')}</Label>
          <Select value={formData.studentGender} onValueChange={(value) => {
            setFormData(f => ({ ...f, studentGender: value }));
            setFieldErrors(e => ({ ...e, studentGender: undefined }));
          }}>
            <SelectTrigger id="student-gender" data-testid="select-student-gender">
              <SelectValue placeholder={t('orgs.selectGenderReq')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">{t('orgs.maleOption')}</SelectItem>
              <SelectItem value="female">{t('orgs.femaleOption')}</SelectItem>
            </SelectContent>
          </Select>
          {fieldErrors.studentGender && (
            <p className="text-xs text-destructive mt-1" data-testid="error-student-gender">{fieldErrors.studentGender}</p>
          )}
        </div>

        <div>
          <Label htmlFor="username">{t('orgs.usernameOptField')}</Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) => setFormData(f => ({ ...f, username: e.target.value }))}
            placeholder={t('orgs.autoGeneratedPlaceholder')}
            data-testid="input-username"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('orgs.autoGeneratedHint')}
          </p>
        </div>

        <div>
          <Label htmlFor="password-complexity">{t('orgs.passwordComplexityLabel')}</Label>
          <Select 
            value={formData.passwordComplexity} 
            onValueChange={(value: "easy" | "medium" | "strong") => setFormData(f => ({ ...f, passwordComplexity: value }))}
          >
            <SelectTrigger id="password-complexity" data-testid="select-password-complexity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">{t('orgs.passwordEasy')}</SelectItem>
              <SelectItem value="medium">{t('orgs.passwordMedium')}</SelectItem>
              <SelectItem value="strong">{t('orgs.passwordStrong')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-member">
          {mutation.isPending ? t('orgs.creatingStudentBtn') : t('orgs.createStudentAccountBtn')}
        </Button>
      </div>
    </form>
  );
}

function BulkUploadForm({ organizationId, onSuccess }: { organizationId: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [file, setFile] = useState<File | null>(null);
  const [passwordComplexity, setPasswordComplexity] = useState<"easy" | "medium" | "strong">("medium");
  const [uploadResult, setUploadResult] = useState<{ success: number; failed: number; credentials: any[] } | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const students = lines.slice(1).map(line => {
        const [username, grade, studentId, studentName, studentAge, studentGender] = line.split(',').map(s => s.trim());
        return { 
          fullName: username,
          grade, 
          studentId: studentId || undefined,
          studentName: studentName || undefined,
          studentAge: studentAge ? parseInt(studentAge) : undefined,
          studentGender: studentGender || undefined
        };
      });

      const response = await apiRequest('POST', `/api/admin/organizations/${organizationId}/members/bulk`, {
        members: students,
        passwordComplexity,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setUploadResult(data);
      toast({ 
        title: t('orgs.uploadCompleteTitle'), 
        description: t('orgs.bulkUploadSuccess', { n: data.success }) 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
    },
    onError: (error: any) => {
      toast({ 
        title: t('superadmin.error'), 
        description: serverErrorMessage(error) || t('orgs.bulkUploadError'), 
        variant: "destructive" 
      });
    },
  });

  const handleDownloadTemplate = () => {
    const csv = "username,grade,studentId,studentName,studentAge,studentGender\nahmed.ali,grade10,S12345,Ahmed Ali,15,male\nfatima.hassan,grade11,S12346,Fatima Hassan,16,female";
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCredentials = () => {
    if (!uploadResult) return;
    
    const csv = "username,password,grade,studentId\n" + 
      uploadResult.credentials.map(c => 
        `${c.username},${c.password},${c.grade || ''},${c.studentId || ''}`
      ).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-credentials-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    onSuccess();
  };

  if (uploadResult) {
    return (
      <div className="space-y-6">
        <DialogHeader>
          <DialogTitle>{t('orgs.uploadCompleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('orgs.uploadCompleteDesc', { n: uploadResult.success })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <StickyNote color="green" rotation="1">
            <p className="text-xs text-muted-foreground mb-1">{t('orgs.createdLabel')}</p>
            <p className="text-3xl font-bold">{uploadResult.success}</p>
          </StickyNote>
          <StickyNote color="pink" rotation="-1">
            <p className="text-xs text-muted-foreground mb-1">{t('orgs.failedLabel')}</p>
            <p className="text-3xl font-bold">{uploadResult.failed}</p>
          </StickyNote>
        </div>

        <div className="flex gap-2 justify-end">
          <Button onClick={handleDownloadCredentials} data-testid="button-download-all-credentials">
            <FileDown className="w-4 h-4 mr-2" />
            {t('orgs.downloadCredentialsCSV')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle>{t('orgs.bulkUploadFormTitle')}</DialogTitle>
        <DialogDescription>
          {t('orgs.bulkUploadFormDesc')}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="bg-muted/50 p-4 rounded-lg space-y-3">
          <p className="text-sm font-medium">{t('orgs.csvFormatLabel')}</p>
          <p className="text-xs text-muted-foreground">
            {t('orgs.csvRequiredCols')}<span className="font-semibold">username, grade</span>
            <br />
            {t('orgs.csvOptionalCols')}<span className="font-semibold">studentId, studentName, studentAge, studentGender</span>
            <br />
            <span className="text-xs text-muted-foreground/70">{t('orgs.csvPreFillNote')}</span>
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownloadTemplate}
            data-testid="button-download-template"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('orgs.downloadTemplateBtn')}
          </Button>
        </div>

        <div>
          <Label htmlFor="csv-file">{t('orgs.uploadCSVLabel')}</Label>
          <Input
            id="csv-file"
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
            data-testid="input-csv-file"
          />
        </div>

        <div>
          <Label htmlFor="bulk-password-complexity">{t('orgs.passwordComplexityLabel')}</Label>
          <Select 
            value={passwordComplexity} 
            onValueChange={(value: "easy" | "medium" | "strong") => setPasswordComplexity(value)}
          >
            <SelectTrigger id="bulk-password-complexity" data-testid="select-bulk-password-complexity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">{t('orgs.passwordEasy')}</SelectItem>
              <SelectItem value="medium">{t('orgs.passwordMedium')}</SelectItem>
              <SelectItem value="strong">{t('orgs.passwordStrong')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button 
          onClick={() => mutation.mutate()} 
          disabled={!file || mutation.isPending}
          data-testid="button-submit-bulk-upload"
        >
          {mutation.isPending ? t('orgs.uploadingStudents') : t('orgs.uploadStudentsBtn')}
        </Button>
      </div>
    </div>
  );
}

function MemberActions({ member, organizationId }: { member: OrganizationMember; organizationId: string }) {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/admin/organizations/${organizationId}/members/${member.id}`);
    },
    onSuccess: () => {
      toast({ title: t('superadmin.success'), description: t('orgs.studentDeletedSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', organizationId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
    },
    onError: (error: any) => {
      toast({ 
        title: t('superadmin.error'), 
        description: serverErrorMessage(error) || t('orgs.studentDeletedError'), 
        variant: "destructive" 
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (passwordComplexity: "easy" | "medium" | "strong") => {
      const response = await apiRequest(
        'POST', 
        `/api/admin/organizations/${organizationId}/members/${member.id}/reset-password`,
        { passwordComplexity }
      );
      return await response.json();
    },
    onSuccess: (data) => {
      setNewPassword(data.password);
      toast({ title: t('superadmin.success'), description: t('orgs.passwordResetSuccess') });
    },
    onError: (error: unknown) => {
      toast({ title: t('superadmin.error'), description: serverErrorMessage(error) || t('orgs.passwordResetError'), variant: "destructive" });
    },
  });

  if (newPassword) {
    return (
      <Dialog open={true} onOpenChange={() => setNewPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orgs.newPasswordTitle')}</DialogTitle>
            <DialogDescription>
              {t('orgs.studentAccountCreatedDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('orgs.usernameFieldLabel')}</p>
              <p className="font-mono font-semibold">{member.user.username}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('orgs.newPasswordLabel')}</p>
              <p className="font-mono font-bold text-lg">{newPassword}</p>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => {
              navigator.clipboard.writeText(`${t('orgs.usernameFieldLabel')}: ${member.user.username}\n${t('orgs.passwordFieldLabel')}: ${newPassword}`);
              toast({ title: t('orgs.copiedTitle'), description: t('orgs.credentialsCopiedClipboard') });
            }}>
              {t('orgs.copyToClipboardBtn')}
            </Button>
            <Button onClick={() => setNewPassword(null)}>
              {t('orgs.closeBtn')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="flex gap-1 justify-end">
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" data-testid={`button-reset-password-${member.id}`}>
            <Key className="w-4 h-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orgs.resetPasswordTitle')}</DialogTitle>
            <DialogDescription>
              {t('orgs.resetPasswordDesc', { name: `${member.user.firstName} ${member.user.lastName}` })}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => {
                resetPasswordMutation.mutate("easy");
                setIsResetDialogOpen(false);
              }}
            >
              {t('orgs.passwordEasy')}
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => {
                resetPasswordMutation.mutate("medium");
                setIsResetDialogOpen(false);
              }}
            >
              {t('orgs.passwordMedium')}
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => {
                resetPasswordMutation.mutate("strong");
                setIsResetDialogOpen(false);
              }}
            >
              {t('orgs.passwordStrong')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {member.role !== 'admin' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              disabled={member.isLocked}
              data-testid={`button-delete-member-${member.id}`}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('orgs.deleteStudentTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('orgs.deleteStudentDesc', { name: `${member.user.firstName} ${member.user.lastName}` })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('orgs.cancel')}</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => deleteMutation.mutate()}
                className="bg-destructive hover:bg-destructive/90"
                data-testid={`button-confirm-delete-${member.id}`}
              >
                {t('orgs.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
