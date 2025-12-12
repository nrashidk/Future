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
import { queryClient, apiRequest } from "@/lib/queryClient";
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

function getMemberStatus(member: OrganizationMember): { label: string; variant: "default" | "secondary" | "outline" | "destructive"; description: string } {
  if (member.role === 'admin') {
    return { label: 'Admin', variant: 'secondary', description: 'School administrator (no assessment)' };
  }
  if (member.hasCompletedAssessment) {
    return { label: 'Completed', variant: 'default', description: 'Assessment completed' };
  }
  if (member.hasInProgressAssessment) {
    return { label: 'In Progress', variant: 'outline', description: 'Assessment started but not finished' };
  }
  if (member.user.lastLoginAt) {
    return { label: 'Active', variant: 'outline', description: 'Logged in, not started assessment' };
  }
  return { label: 'Not Active', variant: 'secondary', description: 'Never logged in' };
}

export default function AdminOrganizations() {
  const { user } = useAuth();
  const { toast } = useToast();
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

  const { data: members = [], isLoading: membersLoading } = useQuery<OrganizationMember[]>({
    queryKey: ['/api/admin/organizations', selectedOrgId, 'members'],
    enabled: !!selectedOrgId,
  });

  const selectedOrg = organizations.find(org => org.id === selectedOrgId);

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
      toast({ title: "Success", description: "Selected students deleted successfully" });
      setSelectedMemberIds([]);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrgId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete students", 
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
        title: "Bulk Password Reset Complete", 
        description: `${successCount} succeeded, ${failCount} failed`,
        variant: failCount > 0 ? "destructive" : "default"
      });
      setBulkResetResults(data.results);
      setIsBulkResetResultsModalOpen(true);
      setSelectedMemberIds([]);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', selectedOrgId, 'members'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to reset passwords", 
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
      const status = getMemberStatus(member);
      if (statusFilter === "not_active" && status.label !== "Not Active") return false;
      if (statusFilter === "active" && status.label !== "Active") return false;
      if (statusFilter === "in_progress" && status.label !== "In Progress") return false;
      if (statusFilter === "completed" && status.label !== "Completed") return false;
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
            <span className="font-bold text-lg">Future Pathways</span>
            {user?.accountType === 'superadmin' && <Badge variant="secondary">Superadmin</Badge>}
            {user?.accountType === 'org_admin' && <Badge variant="secondary">School Admin</Badge>}
          </Link>
          <div className="flex gap-2">
            {user?.accountType === 'superadmin' && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-superadmin">
                  <Link href="/superadmin">
                    <Shield className="w-4 h-4 mr-2" />
                    Super Admin
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                  <Link href="/admin/organizations">
                    <Building2 className="w-4 h-4 mr-2" />
                    Admin
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-questions">
                  <Link href="/admin">
                    <FileQuestion className="w-4 h-4 mr-2" />
                    Quiz
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                  <Link href="/analytics">
                    <BarChart className="w-4 h-4 mr-2" />
                    Analytics
                  </Link>
                </Button>
              </>
            )}
            {user?.accountType === 'org_admin' && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                  <Link href="/admin/organizations">
                    <Building2 className="w-4 h-4 mr-2" />
                    Admin
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
                  <Link href="/assessment">
                    <ClipboardCheck className="w-4 h-4 mr-2" />
                    Assessment
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                  <Link href="/analytics">
                    <BarChart className="w-4 h-4 mr-2" />
                    Analytics
                  </Link>
                </Button>
              </>
            )}
            {user && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-profile">
                  <Link href="/profile">
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout}
                  data-testid="button-logout-admin-orgs"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
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
            <h1 className="text-4xl md:text-5xl font-bold">Schools Dashboard</h1>
          </div>
          <p className="text-muted-foreground text-lg">Manage Group Assessment Schools</p>
        </div>

        {/* Organization Selector */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg">Select School</CardTitle>
              <CardDescription>{organizations.length} school{organizations.length !== 1 ? 's' : ''}</CardDescription>
            </div>
            {user?.accountType !== 'org_admin' && (
              <Dialog open={isCreateOrgDialogOpen} onOpenChange={setIsCreateOrgDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-create-school">
                    <Plus className="w-4 h-4 mr-2" />
                    New School
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
              <p className="text-sm text-muted-foreground text-center py-4">Loading schools...</p>
            ) : organizations.length === 0 ? (
              <div className="text-center py-8">
                <StickyNote color="yellow" rotation="1" className="mx-auto mb-4">
                  <Building2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No schools yet</p>
                </StickyNote>
              </div>
            ) : (
              <div className="space-y-4">
                {organizations.length > 0 && (
                  <div className="space-y-3">
                    {/* Search input */}
                    <div className="relative">
                      <Input
                        placeholder="Search schools..."
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
                      <span className="text-xs text-muted-foreground mr-2">Filter by letter:</span>
                      <Button
                        variant={letterFilter === null ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setLetterFilter(null)}
                        data-testid="letter-filter-all"
                      >
                        All
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
                        Showing {filteredOrganizations.length} of {organizations.length} schools
                        {letterFilter && ` starting with "${letterFilter}"`}
                        {schoolSearchQuery && ` matching "${schoolSearchQuery}"`}
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
                        {org.isUnlimitedLicenses ? "Unlimited" : `${org.usedLicenses}/${org.totalLicenses}`}
                      </Badge>
                      {(org.pendingRewardCredits ?? 0) > 0 && (
                        <Badge variant="outline" className="ml-1 bg-orange-50 text-orange-700 border-orange-200">
                          <Gift className="w-3 h-3 mr-1" />
                          {org.pendingRewardCredits} pending
                        </Badge>
                      )}
                    </Button>
                  ))}
                  {filteredOrganizations.length === 0 && (schoolSearchQuery || letterFilter) && (
                    <div className="text-center py-4 w-full">
                      <p className="text-sm text-muted-foreground">
                        No schools found {letterFilter && `starting with "${letterFilter}"`}{schoolSearchQuery && ` matching "${schoolSearchQuery}"`}
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="mt-2 text-primary"
                        onClick={() => { setLetterFilter(null); setSchoolSearchQuery(""); }}
                      >
                        Clear filters
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
                  Select a school above to view details
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
                        Edit Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <EditOrganizationForm 
                        organization={selectedOrg}
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
                <p className="text-sm text-muted-foreground mb-2">Total Licenses</p>
                <p className="text-3xl font-bold">
                  {selectedOrg.isUnlimitedLicenses ? "Unlimited" : selectedOrg.totalLicenses}
                </p>
              </StickyNote>
              <StickyNote color="blue" rotation="-1" className="p-6">
                <p className="text-sm text-muted-foreground mb-2">Used Licenses</p>
                <p className="text-3xl font-bold">{selectedOrg.usedLicenses}</p>
              </StickyNote>
              <StickyNote color="yellow" rotation="2" className="p-6">
                <p className="text-sm text-muted-foreground mb-2">Available</p>
                <p className="text-3xl font-bold">
                  {selectedOrg.isUnlimitedLicenses ? "Unlimited" : (selectedOrg.totalLicenses - selectedOrg.usedLicenses)}
                </p>
              </StickyNote>
            </div>

            {/* Students Roster - Full Width */}
            <Card>
              <CardHeader className="space-y-4 pb-4">
                <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-lg">Student Roster</CardTitle>
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
                        <SelectValue placeholder="Filter by role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="admin">Admins Only</SelectItem>
                        <SelectItem value="student">Students Only</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                      <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="not_active">Not Active</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    data-testid="button-export-reports"
                    onClick={() => {
                      window.open(`/api/admin/organizations/${selectedOrgId}/export/reports`, '_blank');
                    }}
                    disabled={members.filter(m => m.isLocked).length === 0}
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Export Reports (ZIP)
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    data-testid="button-export-csv"
                    onClick={() => {
                      window.open(`/api/admin/organizations/${selectedOrgId}/export/csv`, '_blank');
                    }}
                    disabled={members.length === 0}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Data (CSV)
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
                        <Key className="w-4 h-4 mr-2" />
                        Reset Passwords ({selectedMemberIds.length})
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" data-testid="button-bulk-delete">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Selected ({selectedMemberIds.length})
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {selectedMemberIds.length} Students</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {selectedMemberIds.length} selected student(s)? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => bulkDeleteMutation.mutate(selectedMemberIds)}
                              className="bg-destructive hover:bg-destructive/90"
                              data-testid="button-confirm-bulk-delete"
                            >
                              Delete {selectedMemberIds.length} Students
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
                        Clear
                      </Button>
                    </div>
                  )}
                  <Dialog open={isBulkResetResultsModalOpen} onOpenChange={setIsBulkResetResultsModalOpen}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Bulk Password Reset Results</DialogTitle>
                        <DialogDescription>
                          Copy and save these credentials. They will not be shown again.
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
                            toast({ title: "Copied", description: "Credentials copied to clipboard" });
                          }}
                          data-testid="button-copy-bulk-credentials"
                        >
                          Copy All
                        </Button>
                        <Button onClick={() => setIsBulkResetResultsModalOpen(false)} data-testid="button-close-bulk-results">
                          Close
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={isBulkUploadDialogOpen} onOpenChange={setIsBulkUploadDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-bulk-upload">
                        <Upload className="w-4 h-4 mr-2" />
                        CSV Upload
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
                        <Plus className="w-4 h-4 mr-2" />
                        Add Student
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
                  <p className="text-sm text-muted-foreground text-center py-8">Loading students...</p>
                ) : members.length === 0 ? (
                  <div className="text-center py-8">
                    <StickyNote color="purple" rotation="-2" className="mx-auto">
                      <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No students yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Add students to get started</p>
                    </StickyNote>
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No members match the current filters</p>
                    <Button 
                      variant="ghost" 
                      onClick={() => { setRoleFilter("all"); setStatusFilter("all"); }}
                      className="mt-2 text-primary"
                    >
                      Clear filters
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
                          <TableHead>Name</TableHead>
                          <TableHead>Username</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Student ID</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
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
                                    <Lock className="w-3 h-3 mr-1" />
                                    Locked
                                  </Badge>
                                )}
                                {(() => {
                                  const status = getMemberStatus(member);
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
                      <CardTitle>Contribute Questions & Earn Credits</CardTitle>
                      <CardDescription>Submit quiz questions to earn free assessment credits for your school</CardDescription>
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
  const [formData, setFormData] = useState({
    organizationName: "",
    totalLicenses: 50,
    isUnlimitedLicenses: false,
    countryId: "none" as string,
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
        countryId: data.countryId === "none" ? undefined : data.countryId,
        curriculum: data.curriculum || undefined,
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
      toast({ title: "Success", description: "School and admin created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create school", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleCopyCredentials = () => {
    if (createdCredentials) {
      const text = `School: ${createdCredentials.organizationName}\nUsername: ${createdCredentials.username}\nPassword: ${createdCredentials.password}`;
      navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Credentials copied to clipboard" });
    }
  };

  const handleDownloadCredentials = () => {
    if (createdCredentials) {
      const content = `Future Pathways - School Admin Credentials
============================================

School Name: ${createdCredentials.organizationName}
Admin Username: ${createdCredentials.username}
Admin Password: ${createdCredentials.password}

Login URL: ${window.location.origin}/student-login

IMPORTANT: Keep this file secure. The password cannot be recovered.
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
      toast({ title: "Downloaded", description: "Credentials file downloaded" });
    }
  };

  if (createdCredentials) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>School Created Successfully</DialogTitle>
          <DialogDescription>
            Save the admin credentials below - the password cannot be recovered
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-4 bg-muted/50 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">School Name</Label>
            <p className="font-medium">{createdCredentials.organizationName}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Admin Username</Label>
            <p className="font-mono font-medium">{createdCredentials.username}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Admin Password</Label>
            <p className="font-mono font-medium text-primary">{createdCredentials.password}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handleDownloadCredentials} data-testid="button-download-credentials">
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          <Button variant="outline" onClick={handleCopyCredentials} data-testid="button-copy-credentials">
            Copy Credentials
          </Button>
          <Button onClick={onSuccess} data-testid="button-done">
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Create School</DialogTitle>
        <DialogDescription>
          Add a new school with an admin account for group assessments
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="org-name">School Name *</Label>
          <Input
            id="org-name"
            value={formData.organizationName}
            onChange={(e) => setFormData(f => ({ ...f, organizationName: e.target.value }))}
            required
            placeholder="e.g., Al Ain High School"
            data-testid="input-org-name"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="unlimited-licenses" className="text-base">Unlimited Licenses</Label>
            <p className="text-sm text-muted-foreground">
              Allow unlimited student assessments (superadmin only)
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
            <Label htmlFor="total-licenses">Total Licenses *</Label>
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
          <Label htmlFor="org-country">Default Country (Optional)</Label>
          <Select 
            value={formData.countryId} 
            onValueChange={(value) => setFormData(f => ({ ...f, countryId: value, curriculum: "" }))}
          >
            <SelectTrigger id="org-country" data-testid="select-org-country">
              <SelectValue placeholder="Select country (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {countries.map((country) => (
                <SelectItem key={country.id} value={country.id}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            If set, all students will automatically use this country and skip the country selection step
          </p>
        </div>

        {formData.countryId !== "none" && availableCurricula.length > 0 && (
          <div>
            <Label htmlFor="org-curriculum">School Curriculum *</Label>
            <Select 
              value={formData.curriculum} 
              onValueChange={(value) => setFormData(f => ({ ...f, curriculum: value }))}
            >
              <SelectTrigger id="org-curriculum" data-testid="select-org-curriculum">
                <SelectValue placeholder="Select curriculum" />
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
              Students will receive quiz questions aligned with this curriculum
            </p>
          </div>
        )}

        <Separator />

        <div>
          <h4 className="font-medium mb-3">School Admin Account</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Create an admin account that can manage students and view reports
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="admin-first-name">First Name *</Label>
              <Input
                id="admin-first-name"
                value={formData.adminFirstName}
                onChange={(e) => setFormData(f => ({ ...f, adminFirstName: e.target.value }))}
                required
                placeholder="John"
                data-testid="input-admin-first-name"
              />
            </div>
            <div>
              <Label htmlFor="admin-last-name">Last Name *</Label>
              <Input
                id="admin-last-name"
                value={formData.adminLastName}
                onChange={(e) => setFormData(f => ({ ...f, adminLastName: e.target.value }))}
                required
                placeholder="Smith"
                data-testid="input-admin-last-name"
              />
            </div>
          </div>

          <div className="mt-3">
            <Label htmlFor="admin-email">Email (Optional)</Label>
            <Input
              id="admin-email"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => setFormData(f => ({ ...f, adminEmail: e.target.value }))}
              placeholder="admin@school.ae"
              data-testid="input-admin-email"
            />
          </div>

          <div className="mt-3">
            <Label htmlFor="admin-username">Username (Optional)</Label>
            <Input
              id="admin-username"
              value={formData.adminUsername}
              onChange={(e) => setFormData(f => ({ ...f, adminUsername: e.target.value }))}
              placeholder="Leave blank to auto-generate"
              data-testid="input-admin-username"
            />
            <p className="text-xs text-muted-foreground mt-1">
              If not provided, a username will be generated from the admin's name
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-school">
          {mutation.isPending ? "Creating..." : "Create School"}
        </Button>
      </div>
    </form>
  );
}

function EditOrganizationForm({ organization, onSuccess }: { organization: Organization; onSuccess: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: organization.name,
    logoUrl: organization.logoUrl || "",
    countryId: organization.countryId || "none",
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

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        name: data.name,
        logoUrl: data.logoUrl === "" ? null : data.logoUrl,
        countryId: data.countryId === "none" ? null : data.countryId,
        curriculum: data.curriculum || null,
      };
      return apiRequest('PATCH', `/api/admin/organizations/${organization.id}`, payload);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "School updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update school", variant: "destructive" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Error", description: "Only PNG, JPG, GIF, WebP, and SVG files are allowed", variant: "destructive" });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "File size must be less than 5MB", variant: "destructive" });
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
      toast({ title: "Success", description: "Logo uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to upload logo", variant: "destructive" });
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
        <DialogTitle>Edit School</DialogTitle>
        <DialogDescription>
          Update school details
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="edit-org-name">School Name *</Label>
          <Input
            id="edit-org-name"
            value={formData.name}
            onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
            required
            placeholder="e.g., Al Ain High School"
            data-testid="input-edit-org-name"
          />
        </div>

        <div>
          <Label>School Logo (Optional)</Label>
          <div className="flex gap-2 mt-1 mb-2">
            <Button
              type="button"
              variant={logoInputMode === "url" ? "default" : "outline"}
              size="sm"
              onClick={() => setLogoInputMode("url")}
              data-testid="button-logo-url-mode"
            >
              <LinkIcon className="h-4 w-4 mr-1" />
              URL
            </Button>
            <Button
              type="button"
              variant={logoInputMode === "upload" ? "default" : "outline"}
              size="sm"
              onClick={() => setLogoInputMode("upload")}
              data-testid="button-logo-upload-mode"
            >
              <Upload className="h-4 w-4 mr-1" />
              Upload
            </Button>
          </div>

          {logoInputMode === "url" ? (
            <>
              <Input
                id="edit-org-logo"
                value={formData.logoUrl}
                onChange={(e) => setFormData(f => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://example.com/logo.png"
                data-testid="input-edit-org-logo"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Add a direct link to your school logo
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
                Upload PNG, JPG, GIF, WebP, or SVG (max 5MB)
              </p>
              {isUploading && (
                <p className="text-xs text-primary mt-1">Uploading...</p>
              )}
            </>
          )}

          {formData.logoUrl && (
            <div className="mt-3 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">Preview:</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData(f => ({ ...f, logoUrl: "" }))}
                  className="h-6 px-2 text-xs"
                  data-testid="button-remove-logo"
                >
                  <X className="h-3 w-3 mr-1" />
                  Remove
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
          <Label htmlFor="edit-org-country">Default Country</Label>
          <Select 
            value={formData.countryId} 
            onValueChange={(value) => setFormData(f => ({ ...f, countryId: value, curriculum: "" }))}
          >
            <SelectTrigger id="edit-org-country" data-testid="select-edit-org-country">
              <SelectValue placeholder="Select country (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {countries.map((country) => (
                <SelectItem key={country.id} value={country.id}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {formData.countryId !== "none" && availableCurricula.length > 0 && (
          <div>
            <Label htmlFor="edit-org-curriculum">School Curriculum</Label>
            <Select 
              value={formData.curriculum} 
              onValueChange={(value) => setFormData(f => ({ ...f, curriculum: value }))}
            >
              <SelectTrigger id="edit-org-curriculum" data-testid="select-edit-org-curriculum">
                <SelectValue placeholder="Select curriculum" />
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
              Students will receive quiz questions aligned with this curriculum
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={mutation.isPending || isUploading} data-testid="button-submit-edit-school">
          {mutation.isPending ? "Updating..." : "Update School"}
        </Button>
      </div>
    </form>
  );
}

function CreateMemberForm({ organizationId, onSuccess }: { organizationId: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    fullName: "",
    grade: "",
    studentId: "",
    username: "",
    passwordComplexity: "medium" as "easy" | "medium" | "strong",
  });
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('POST', `/api/admin/organizations/${organizationId}/members`, data);
      return await response.json();
    },
    onSuccess: (data) => {
      setCreatedCredentials({ username: data.user.username, password: data.password });
      toast({ title: "Success", description: "Student account created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', organizationId, 'members'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create student account", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleDownloadCredentials = () => {
    if (!createdCredentials) return;
    
    const content = `Username: ${createdCredentials.username}\nPassword: ${createdCredentials.password}`;
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
          <DialogTitle>Student Account Created</DialogTitle>
          <DialogDescription>
            Save these credentials securely - they won't be shown again
          </DialogDescription>
        </DialogHeader>

        <StickyNote color="yellow" rotation="1" className="mx-auto">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Username</p>
              <p className="font-mono font-bold text-lg">{createdCredentials.username}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Password</p>
              <p className="font-mono font-bold text-lg">{createdCredentials.password}</p>
            </div>
          </div>
        </StickyNote>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => {
            navigator.clipboard.writeText(`Username: ${createdCredentials.username}\nPassword: ${createdCredentials.password}`);
            toast({ title: "Copied!", description: "Credentials copied to clipboard" });
          }}>
            Copy to Clipboard
          </Button>
          <Button onClick={handleDownloadCredentials} data-testid="button-download-credentials">
            <Download className="w-4 h-4 mr-2" />
            Download & Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Add Student</DialogTitle>
        <DialogDescription>
          Create a new student account with auto-generated credentials
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="full-name">Full Name *</Label>
          <Input
            id="full-name"
            value={formData.fullName}
            onChange={(e) => setFormData(f => ({ ...f, fullName: e.target.value }))}
            required
            placeholder="e.g., Ahmed Ali Mohamed"
            data-testid="input-full-name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="grade">Grade</Label>
            <Select value={formData.grade} onValueChange={(value) => setFormData(f => ({ ...f, grade: value }))}>
              <SelectTrigger id="grade" data-testid="select-grade">
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent>
                {["8", "9", "10", "11", "12"].map(g => (
                  <SelectItem key={g} value={g}>Grade {g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="student-id">Student ID</Label>
            <Input
              id="student-id"
              value={formData.studentId}
              onChange={(e) => setFormData(f => ({ ...f, studentId: e.target.value }))}
              placeholder="Optional"
              data-testid="input-student-id"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="username">Username (optional)</Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) => setFormData(f => ({ ...f, username: e.target.value }))}
            placeholder="Auto-generated if empty"
            data-testid="input-username"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to auto-generate from name
          </p>
        </div>

        <div>
          <Label htmlFor="password-complexity">Password Complexity</Label>
          <Select 
            value={formData.passwordComplexity} 
            onValueChange={(value: "easy" | "medium" | "strong") => setFormData(f => ({ ...f, passwordComplexity: value }))}
          >
            <SelectTrigger id="password-complexity" data-testid="select-password-complexity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy (8 chars, lowercase + numbers)</SelectItem>
              <SelectItem value="medium">Medium (12 chars, mixed case + numbers)</SelectItem>
              <SelectItem value="strong">Strong (16 chars, mixed case + numbers + symbols)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-member">
          {mutation.isPending ? "Creating..." : "Create Student Account"}
        </Button>
      </div>
    </form>
  );
}

function BulkUploadForm({ organizationId, onSuccess }: { organizationId: string; onSuccess: () => void }) {
  const { toast } = useToast();
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
        title: "Upload Complete", 
        description: `${data.success} students created successfully` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to upload students", 
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
          <DialogTitle>Upload Complete</DialogTitle>
          <DialogDescription>
            {uploadResult.success} students created successfully
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <StickyNote color="green" rotation="1">
            <p className="text-xs text-muted-foreground mb-1">Created</p>
            <p className="text-3xl font-bold">{uploadResult.success}</p>
          </StickyNote>
          <StickyNote color="pink" rotation="-1">
            <p className="text-xs text-muted-foreground mb-1">Failed</p>
            <p className="text-3xl font-bold">{uploadResult.failed}</p>
          </StickyNote>
        </div>

        <div className="flex gap-2 justify-end">
          <Button onClick={handleDownloadCredentials} data-testid="button-download-all-credentials">
            <FileDown className="w-4 h-4 mr-2" />
            Download Credentials CSV
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle>Bulk Upload Students</DialogTitle>
        <DialogDescription>
          Upload a CSV file with student information
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="bg-muted/50 p-4 rounded-lg space-y-3">
          <p className="text-sm font-medium">CSV Format</p>
          <p className="text-xs text-muted-foreground">
            Required columns: <span className="font-semibold">username, grade</span>
            <br />
            Optional columns: <span className="font-semibold">studentId, studentName, studentAge, studentGender</span>
            <br />
            <span className="text-xs text-muted-foreground/70">Note: Pre-filling student info (name, age, gender) streamlines the assessment experience</span>
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownloadTemplate}
            data-testid="button-download-template"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Template
          </Button>
        </div>

        <div>
          <Label htmlFor="csv-file">Upload CSV File *</Label>
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
          <Label htmlFor="bulk-password-complexity">Password Complexity</Label>
          <Select 
            value={passwordComplexity} 
            onValueChange={(value: "easy" | "medium" | "strong") => setPasswordComplexity(value)}
          >
            <SelectTrigger id="bulk-password-complexity" data-testid="select-bulk-password-complexity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy (8 chars, lowercase + numbers)</SelectItem>
              <SelectItem value="medium">Medium (12 chars, mixed case + numbers)</SelectItem>
              <SelectItem value="strong">Strong (16 chars, mixed case + numbers + symbols)</SelectItem>
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
          {mutation.isPending ? "Uploading..." : "Upload Students"}
        </Button>
      </div>
    </div>
  );
}

function MemberActions({ member, organizationId }: { member: OrganizationMember; organizationId: string }) {
  const { toast } = useToast();
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/admin/organizations/${organizationId}/members/${member.id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Student deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations', organizationId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete student", 
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
      toast({ title: "Success", description: "Password reset successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset password", variant: "destructive" });
    },
  });

  if (newPassword) {
    return (
      <Dialog open={true} onOpenChange={() => setNewPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Password</DialogTitle>
            <DialogDescription>
              Save this password securely - it won't be shown again
            </DialogDescription>
          </DialogHeader>

          <StickyNote color="yellow" rotation="2" className="mx-auto">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">New Password for {member.user.username}</p>
              <p className="font-mono font-bold text-xl">{newPassword}</p>
            </div>
          </StickyNote>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => {
              navigator.clipboard.writeText(newPassword);
              toast({ title: "Copied!", description: "Password copied to clipboard" });
            }}>
              Copy
            </Button>
            <Button onClick={() => setNewPassword(null)}>
              Close
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
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Choose password complexity for {member.user.firstName} {member.user.lastName}
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
              Easy (8 chars, lowercase + numbers)
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => {
                resetPasswordMutation.mutate("medium");
                setIsResetDialogOpen(false);
              }}
            >
              Medium (12 chars, mixed case + numbers)
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => {
                resetPasswordMutation.mutate("strong");
                setIsResetDialogOpen(false);
              }}
            >
              Strong (16 chars, mixed case + numbers + symbols)
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
              <AlertDialogTitle>Delete Student</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <span className="font-semibold">{member.user.firstName} {member.user.lastName}</span>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => deleteMutation.mutate()}
                className="bg-destructive hover:bg-destructive/90"
                data-testid={`button-confirm-delete-${member.id}`}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
