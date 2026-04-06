import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Building2, Users, GraduationCap, Key, Search, Filter, 
  Plus, Download, Edit, Trash2, UserPlus, Crown, Shield,
  TrendingUp, AlertCircle, CheckCircle, Clock, Home, User, LogOut,
  ChevronUp, ChevronDown, History, Infinity, BarChart, Copy, FileQuestion,
  Settings, Globe, Gift, FileText, Megaphone, Briefcase, Eye, RefreshCw,
  UserCog, Info, AlertTriangle, XCircle
} from "lucide-react";
import ScoringConfigEditor from "@/components/admin/ScoringConfigEditor";
import CountryManagement from "@/components/admin/CountryManagement";
import ContributionReviewQueue from "@/components/admin/ContributionReviewQueue";
import SubjectManagement from "@/components/admin/SubjectManagement";

interface Metrics {
  totalSchools: number;
  totalAdmins: number;
  totalStudents: number;
  studentsCompleted: number;
  totalLicenses: number;
  usedLicenses: number;
  unlimitedSchools: number;
  utilizationRate: number;
  completionRate: number;
}

interface PrimaryAdmin {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

interface OrganizationWithDetails {
  id: string;
  name: string;
  adminUserId: string;
  totalLicenses: number;
  usedLicenses: number;
  isUnlimitedLicenses: boolean;
  countryId: string | null;
  createdAt: string;
  adminCount: number;
  studentCount: number;
  completedCount: number;
  primaryAdmin: PrimaryAdmin | null;
  utilizationRate: number | null;
}

interface AdminDetail {
  memberId: string;
  userId: string;
  isPrimaryAdmin: boolean;
  createdAt: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    createdAt: string;
  } | null;
}

interface AuditEvent {
  id: string;
  organizationId: string;
  eventType: string;
  eventDescription: string;
  performedBy: string;
  performedByRole: string;
  previousValue: any;
  newValue: any;
  affectedUserId: string | null;
  createdAt: string;
  performer: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  organization?: {
    id: string;
    name: string;
  } | null;
}

interface StudentWithAssessment {
  user: {
    id: string;
    username: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    accountType: string;
    isPremium: boolean;
    createdAt: string;
  };
  organizationName: string | null;
  assessmentCount: number;
  latestAssessmentDate: string | null;
}

interface FileRecord {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  fileType: string;
  category: string | null;
  description: string | null;
  uploadedBy: string;
  organizationId: string | null;
  isPublic: boolean;
  downloadCount: number;
  processingStatus: string | null;
  createdAt: string;
}

interface SystemAnnouncement {
  id: string;
  title: string;
  content: string;
  type: string;
  targetAudience: string;
  isActive: boolean;
  isPinned: boolean;
  backgroundColor: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  createdByUserId: string;
  createdAt: string;
}

interface Career {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  relatedSubjects: string[];
  category: string;
  educationLevel: string;
  averageSalary: string | null;
  growthOutlook: string;
  icon: string | null;
  countryId: string | null;
  createdAt: string;
}

interface Country {
  id: string;
  name: string;
  code: string;
}

export default function SuperadminDashboard() {
  useEffect(() => { document.title = "Superadmin Dashboard | Future Pathways"; }, []);

  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState<string>("all");
  const [licenseFilter, setLicenseFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  
  // Bulk selection states
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [bulkResetResults, setBulkResetResults] = useState<Array<{ userId: string; username: string; newPassword: string; success: boolean; error?: string }> | null>(null);
  const [isBulkResultsModalOpen, setIsBulkResultsModalOpen] = useState(false);
  
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isAdminsModalOpen, setIsAdminsModalOpen] = useState(false);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [isAddAdminModalOpen, setIsAddAdminModalOpen] = useState(false);
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  
  const [newAdminForm, setNewAdminForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    username: "",
  });
  
  const [createdAdminCredentials, setCreatedAdminCredentials] = useState<{ username: string; password: string } | null>(null);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  
  const [licenseForm, setLicenseForm] = useState({
    totalLicenses: 0,
    isUnlimited: false,
    adjustment: 0,
  });
  
  const [newOrgForm, setNewOrgForm] = useState({
    organizationName: "",
    totalLicenses: 50,
    isUnlimitedLicenses: false,
    adminFirstName: "",
    adminLastName: "",
    adminEmail: "",
    adminPhone: "",
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<Metrics>({
    queryKey: ['/api/superadmin/metrics'],
  });

  const { data: organizations = [], isLoading: orgsLoading } = useQuery<OrganizationWithDetails[]>({
    queryKey: ['/api/superadmin/organizations', { search: searchQuery, licenseStatus: licenseFilter, sortBy, sortOrder }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (licenseFilter && licenseFilter !== 'all') params.set('licenseStatus', licenseFilter);
      if (sortBy) params.set('sortBy', sortBy);
      if (sortOrder) params.set('sortOrder', sortOrder);
      const url = `/api/superadmin/organizations${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch schools');
      return res.json();
    },
  });

  const { data: orgAdmins = [], isLoading: adminsLoading } = useQuery<AdminDetail[]>({
    queryKey: ['/api/superadmin/organizations', selectedOrgId, 'admins'],
    enabled: !!selectedOrgId && isAdminsModalOpen,
  });

  const { data: orgEvents = [], isLoading: eventsLoading } = useQuery<AuditEvent[]>({
    queryKey: ['/api/superadmin/organizations', selectedOrgId, 'events'],
    enabled: !!selectedOrgId && isEventsModalOpen,
  });

  const { data: allEvents = [] } = useQuery<AuditEvent[]>({
    queryKey: ['/api/superadmin/events'],
  });

  const selectedOrg = organizations.find(org => org.id === selectedOrgId);

  const addAdminMutation = useMutation({
    mutationFn: async (data: typeof newAdminForm) => {
      const res = await apiRequest('POST', `/api/superadmin/organizations/${selectedOrgId}/admins`, data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setCreatedAdminCredentials({ 
        username: data.credentials.username, 
        password: data.credentials.password 
      });
      setIsAddAdminModalOpen(false);
      setIsCredentialsModalOpen(true);
      setNewAdminForm({ firstName: "", lastName: "", email: "", phone: "", username: "" });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations', selectedOrgId, 'admins'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add admin", variant: "destructive" });
    },
  });

  const removeAdminMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest('DELETE', `/api/superadmin/organizations/${selectedOrgId}/admins/${memberId}`);
    },
    onSuccess: () => {
      toast({ title: "Admin Removed", description: "Admin has been removed from the school" });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations', selectedOrgId, 'admins'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove admin", variant: "destructive" });
    },
  });

  const promoteAdminMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest('PATCH', `/api/superadmin/organizations/${selectedOrgId}/admins/${memberId}/promote`);
    },
    onSuccess: () => {
      toast({ title: "Admin Promoted", description: "Admin has been promoted to primary" });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations', selectedOrgId, 'admins'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to promote admin", variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest('POST', `/api/superadmin/impersonate/${userId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Impersonation Started", description: data.message || "Now impersonating user" });
      window.location.href = '/';
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to impersonate user", variant: "destructive" });
    },
  });

  const bulkResetPasswordsMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      const res = await apiRequest('POST', '/api/superadmin/users/bulk/reset-passwords', { userIds });
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
      setIsBulkResultsModalOpen(true);
      setSelectedUserIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/students'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reset passwords", variant: "destructive" });
    },
  });

  const bulkDeleteOrgsMutation = useMutation({
    mutationFn: async (orgIds: string[]) => {
      const res = await apiRequest('POST', '/api/superadmin/organizations/bulk/delete', { orgIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      const successCount = data.results.filter((r: any) => r.success).length;
      const failCount = data.results.filter((r: any) => !r.success).length;
      toast({ 
        title: "Bulk Delete Complete", 
        description: `${successCount} schools deleted, ${failCount} failed`,
        variant: failCount > 0 ? "destructive" : "default"
      });
      setSelectedOrgIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/metrics'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete schools", variant: "destructive" });
    },
  });

  const updateLicensesMutation = useMutation({
    mutationFn: async (data: { totalLicenses?: number; isUnlimitedLicenses?: boolean; adjustment?: number }) => {
      return apiRequest('PATCH', `/api/superadmin/organizations/${selectedOrgId}/licenses`, data);
    },
    onSuccess: () => {
      toast({ title: "Licenses Updated", description: "License settings have been updated" });
      setIsLicenseModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/metrics'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update licenses", variant: "destructive" });
    },
  });

  const createOrgMutation = useMutation({
    mutationFn: async (data: typeof newOrgForm) => {
      return apiRequest('POST', '/api/superadmin/organizations/create-with-admin', data);
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "School Created", 
        description: `Created ${data.organization.name} with admin: ${data.admin.credentials.username} / ${data.admin.credentials.password}`,
      });
      setIsCreateOrgModalOpen(false);
      setNewOrgForm({
        organizationName: "",
        totalLicenses: 50,
        isUnlimitedLicenses: false,
        adminFirstName: "",
        adminLastName: "",
        adminEmail: "",
        adminPhone: "",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/metrics'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create school", variant: "destructive" });
    },
  });

  // New state for additional features
  const [isDeleteOrgModalOpen, setIsDeleteOrgModalOpen] = useState(false);
  const [deleteOrgConfirmName, setDeleteOrgConfirmName] = useState("");
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ username: string; newPassword: string } | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<SystemAnnouncement | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    content: "",
    type: "info",
    targetAudience: "all",
    isPinned: false,
    backgroundColor: "#ffffff",
    publishAt: "",
    expiresAt: "",
  });
  const [isCareerModalOpen, setIsCareerModalOpen] = useState(false);
  const [editingCareer, setEditingCareer] = useState<Career | null>(null);
  const [careerForm, setCareerForm] = useState({
    title: "",
    description: "",
    requiredSkills: "",
    relatedSubjects: "",
    category: "",
    educationLevel: "",
    averageSalary: "",
    growthOutlook: "",
    icon: "",
    countryId: "",
  });

  // Countries query for career management
  const { data: countries = [] } = useQuery<Country[]>({
    queryKey: ['/api/admin/countries'],
  });

  // New queries for additional features
  const { data: students = [], isLoading: studentsLoading } = useQuery<StudentWithAssessment[]>({
    queryKey: ['/api/superadmin/students'],
  });

  const { data: files = [], isLoading: filesLoading } = useQuery<FileRecord[]>({
    queryKey: ['/api/superadmin/files'],
  });

  const { data: announcements = [], isLoading: announcementsLoading } = useQuery<SystemAnnouncement[]>({
    queryKey: ['/api/superadmin/announcements'],
  });

  const { data: careers = [], isLoading: careersLoading } = useQuery<Career[]>({
    queryKey: ['/api/superadmin/careers'],
  });

  const { data: searchedUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/superadmin/users/search', userSearchQuery],
    enabled: userSearchQuery.length >= 2,
  });

  // Delete organization mutation
  const deleteOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      return apiRequest('DELETE', `/api/superadmin/organizations/${orgId}`);
    },
    onSuccess: () => {
      toast({ title: "School Deleted", description: "The school and all its members have been deleted" });
      setIsDeleteOrgModalOpen(false);
      setDeleteOrgConfirmName("");
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/metrics'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete school", variant: "destructive" });
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest('POST', `/api/superadmin/users/${userId}/reset-password`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setResetPasswordResult({ username: data.username, newPassword: data.newPassword });
      toast({ title: "Password Reset", description: "New password has been generated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reset password", variant: "destructive" });
    },
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest('DELETE', `/api/superadmin/files/${fileId}`);
    },
    onSuccess: () => {
      toast({ title: "File Deleted", description: "File has been deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/files'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete file", variant: "destructive" });
    },
  });

  // Announcement mutations
  const createAnnouncementMutation = useMutation({
    mutationFn: async (data: typeof announcementForm) => {
      return apiRequest('POST', '/api/superadmin/announcements', data);
    },
    onSuccess: () => {
      toast({ title: "Announcement Created", description: "New announcement has been created" });
      setIsAnnouncementModalOpen(false);
      resetAnnouncementForm();
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/announcements'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create announcement", variant: "destructive" });
    },
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof announcementForm>) => {
      return apiRequest('PATCH', `/api/superadmin/announcements/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Announcement Updated", description: "Announcement has been updated" });
      setIsAnnouncementModalOpen(false);
      setEditingAnnouncement(null);
      resetAnnouncementForm();
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/announcements'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update announcement", variant: "destructive" });
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/superadmin/announcements/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Announcement Deleted", description: "Announcement has been deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/announcements'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete announcement", variant: "destructive" });
    },
  });

  // Career mutations
  const createCareerMutation = useMutation({
    mutationFn: async (data: typeof careerForm) => {
      return apiRequest('POST', '/api/superadmin/careers', {
        ...data,
        requiredSkills: data.requiredSkills.split(',').map(s => s.trim()).filter(Boolean),
        relatedSubjects: data.relatedSubjects.split(',').map(s => s.trim()).filter(Boolean),
      });
    },
    onSuccess: () => {
      toast({ title: "Career Created", description: "New career has been added" });
      setIsCareerModalOpen(false);
      resetCareerForm();
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/careers'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create career", variant: "destructive" });
    },
  });

  const updateCareerMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof careerForm) => {
      return apiRequest('PATCH', `/api/superadmin/careers/${id}`, {
        ...data,
        requiredSkills: data.requiredSkills.split(',').map(s => s.trim()).filter(Boolean),
        relatedSubjects: data.relatedSubjects.split(',').map(s => s.trim()).filter(Boolean),
      });
    },
    onSuccess: () => {
      toast({ title: "Career Updated", description: "Career has been updated" });
      setIsCareerModalOpen(false);
      setEditingCareer(null);
      resetCareerForm();
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/careers'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update career", variant: "destructive" });
    },
  });

  const deleteCareerMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/superadmin/careers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Career Deleted", description: "Career has been deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/careers'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete career", variant: "destructive" });
    },
  });

  const resetAnnouncementForm = () => {
    setAnnouncementForm({ title: "", content: "", type: "info", targetAudience: "all", isPinned: false, backgroundColor: "#ffffff", publishAt: "", expiresAt: "" });
  };

  const resetCareerForm = () => {
    setCareerForm({ title: "", description: "", requiredSkills: "", relatedSubjects: "", category: "", educationLevel: "", averageSalary: "", growthOutlook: "", icon: "", countryId: "" });
  };

  const openDeleteOrgModal = (orgId: string) => {
    setSelectedOrgId(orgId);
    setDeleteOrgConfirmName("");
    setIsDeleteOrgModalOpen(true);
  };

  const openResetPasswordModal = (userId: string) => {
    setSelectedUserId(userId);
    setResetPasswordResult(null);
    setIsResetPasswordModalOpen(true);
  };

  const openEditAnnouncement = (announcement: SystemAnnouncement) => {
    setEditingAnnouncement(announcement);
    setAnnouncementForm({
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      targetAudience: announcement.targetAudience,
      isPinned: announcement.isPinned,
      backgroundColor: announcement.backgroundColor || "#ffffff",
      publishAt: announcement.publishAt ? announcement.publishAt.split('T')[0] : "",
      expiresAt: announcement.expiresAt ? announcement.expiresAt.split('T')[0] : "",
    });
    setIsAnnouncementModalOpen(true);
  };

  const openEditCareer = (career: Career) => {
    setEditingCareer(career);
    setCareerForm({
      title: career.title,
      description: career.description,
      requiredSkills: career.requiredSkills.join(', '),
      relatedSubjects: career.relatedSubjects.join(', '),
      category: career.category,
      educationLevel: career.educationLevel,
      averageSalary: career.averageSalary || "",
      growthOutlook: career.growthOutlook,
      icon: career.icon || "",
      countryId: career.countryId || "",
    });
    setIsCareerModalOpen(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getAnnouncementTypeIcon = (type: string) => {
    switch (type) {
      case "warning": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "error": return <XCircle className="w-4 h-4 text-red-500" />;
      case "success": return <CheckCircle className="w-4 h-4 text-green-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const openAdminsModal = (orgId: string) => {
    setSelectedOrgId(orgId);
    setIsAdminsModalOpen(true);
  };

  const openLicenseModal = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setSelectedOrgId(orgId);
      setLicenseForm({
        totalLicenses: org.totalLicenses,
        isUnlimited: org.isUnlimitedLicenses,
        adjustment: 0,
      });
      setIsLicenseModalOpen(true);
    }
  };

  const openEventsModal = (orgId: string) => {
    setSelectedOrgId(orgId);
    setIsEventsModalOpen(true);
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const filteredOrgs = organizations.filter(org => {
    if (searchQuery && !org.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (licenseFilter !== "all") {
      if (licenseFilter === "unlimited" && !org.isUnlimitedLicenses) return false;
      if (licenseFilter === "low" && (org.isUnlimitedLicenses || (org.totalLicenses - org.usedLicenses) > 10)) return false;
      if (licenseFilter === "exhausted" && (org.isUnlimitedLicenses || org.usedLicenses < org.totalLicenses)) return false;
    }
    return true;
  });

  const sortedOrgs = [...filteredOrgs].sort((a, b) => {
    const order = sortOrder === "asc" ? 1 : -1;
    switch (sortBy) {
      case "name": return order * a.name.localeCompare(b.name);
      case "students": return order * (a.studentCount - b.studentCount);
      case "licenses": return order * ((a.totalLicenses || 0) - (b.totalLicenses || 0));
      case "utilization": return order * ((a.utilizationRate || 0) - (b.utilizationRate || 0));
      default: return 0;
    }
  });

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case "license_added": return <Plus className="w-4 h-4 text-green-500" />;
      case "license_removed": return <Trash2 className="w-4 h-4 text-red-500" />;
      case "unlimited_enabled": return <Infinity className="w-4 h-4 text-blue-500" />;
      case "unlimited_disabled": return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case "admin_added": return <UserPlus className="w-4 h-4 text-green-500" />;
      case "admin_removed": return <Trash2 className="w-4 h-4 text-red-500" />;
      case "admin_promoted": return <Crown className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Future Pathways</span>
            <Badge variant="secondary">Superadmin</Badge>
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild data-testid="button-nav-superadmin">
              <Link href="/superadmin">
                <Shield className="w-4 h-4 mr-2" />
                Super Admin
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="button-nav-schools">
              <Link href="/admin/organizations">
                <Building2 className="w-4 h-4 mr-2" />
                Schools
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
            <Button variant="outline" size="sm" asChild data-testid="button-nav-profile">
              <Link href="/profile">
                <User className="w-4 h-4 mr-2" />
                Profile
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12 space-y-8">
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-12 h-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">Super Admin Dashboard</h1>
          </div>
          <p className="text-muted-foreground text-lg">Manage all schools, licenses, and administrators</p>
        </div>
        <div className="flex justify-end mb-4">
          <Button onClick={() => setIsCreateOrgModalOpen(true)} data-testid="button-create-school">
            <Plus className="w-4 h-4 mr-2" />
            Create School
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-sm font-medium">Total Schools</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-schools">
                {metricsLoading ? "..." : metrics?.totalSchools || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics?.unlimitedSchools || 0} with unlimited licenses
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-sm font-medium">Total Admins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-admins">
                {metricsLoading ? "..." : metrics?.totalAdmins || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Across all schools
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-sm font-medium">Total Students</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-students">
                {metricsLoading ? "..." : metrics?.totalStudents || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics?.studentsCompleted || 0} completed ({metrics?.completionRate || 0}%)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-sm font-medium">License Utilization</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-license-utilization">
                {metricsLoading ? "..." : `${metrics?.utilizationRate || 0}%`}
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics?.usedLicenses || 0} / {metrics?.totalLicenses || 0} licenses used
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="organizations" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="organizations" data-testid="tab-schools">Schools</TabsTrigger>
            <TabsTrigger value="students" data-testid="tab-students">
              <Users className="w-4 h-4 mr-2" />
              Students
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">Recent Activity</TabsTrigger>
            <TabsTrigger value="files" data-testid="tab-files">
              <FileText className="w-4 h-4 mr-2" />
              Files
            </TabsTrigger>
            <TabsTrigger value="announcements" data-testid="tab-announcements">
              <Megaphone className="w-4 h-4 mr-2" />
              Announcements
            </TabsTrigger>
            <TabsTrigger value="careers" data-testid="tab-careers">
              <Briefcase className="w-4 h-4 mr-2" />
              Careers
            </TabsTrigger>
            <TabsTrigger value="countries" data-testid="tab-countries">
              <Globe className="w-4 h-4 mr-2" />
              Countries
            </TabsTrigger>
            <TabsTrigger value="subjects" data-testid="tab-subjects">
              <GraduationCap className="w-4 h-4 mr-2" />
              Subjects
            </TabsTrigger>
            <TabsTrigger value="scoring" data-testid="tab-scoring">
              <Settings className="w-4 h-4 mr-2" />
              Scoring
            </TabsTrigger>
            <TabsTrigger value="contributions" data-testid="tab-contributions">
              <Gift className="w-4 h-4 mr-2" />
              Contributions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organizations" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Schools Directory</CardTitle>
                    <CardDescription>Manage all schools and their licenses</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search schools..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-64"
                        data-testid="input-search-orgs"
                      />
                    </div>
                    <Select value={licenseFilter} onValueChange={setLicenseFilter}>
                      <SelectTrigger className="w-40" data-testid="select-license-filter">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="unlimited">Unlimited</SelectItem>
                        <SelectItem value="low">Low Licenses</SelectItem>
                        <SelectItem value="exhausted">Exhausted</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" asChild data-testid="button-export-orgs">
                      <a href="/api/superadmin/export/organizations?format=csv" download>
                        <Download className="w-4 h-4 mr-2" />
                        Export CSV
                      </a>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedOrgIds.size > 0 && (
                  <div className="flex items-center gap-4 p-3 mb-4 bg-muted rounded-lg">
                    <span className="text-sm font-medium">{selectedOrgIds.size} school(s) selected</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete ${selectedOrgIds.size} school(s)? This action cannot be undone.`)) {
                            bulkDeleteOrgsMutation.mutate(Array.from(selectedOrgIds));
                          }
                        }}
                        disabled={bulkDeleteOrgsMutation.isPending}
                        data-testid="button-bulk-delete-orgs"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Schools
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedOrgIds(new Set())}
                        data-testid="button-clear-org-selection"
                      >
                        Clear Selection
                      </Button>
                    </div>
                  </div>
                )}
                {orgsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading schools...</div>
                ) : sortedOrgs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No schools found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={sortedOrgs.length > 0 && sortedOrgs.every(org => selectedOrgIds.has(org.id))}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedOrgIds(new Set(sortedOrgs.map(org => org.id)));
                                } else {
                                  setSelectedOrgIds(new Set());
                                }
                              }}
                              data-testid="checkbox-select-all-orgs"
                            />
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover-elevate"
                            onClick={() => {
                              if (sortBy === "name") setSortOrder(prev => prev === "asc" ? "desc" : "asc");
                              else { setSortBy("name"); setSortOrder("asc"); }
                            }}
                          >
                            <div className="flex items-center gap-1">
                              School
                              {sortBy === "name" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                            </div>
                          </TableHead>
                          <TableHead>Primary Admin</TableHead>
                          <TableHead 
                            className="cursor-pointer hover-elevate"
                            onClick={() => {
                              if (sortBy === "students") setSortOrder(prev => prev === "asc" ? "desc" : "asc");
                              else { setSortBy("students"); setSortOrder("desc"); }
                            }}
                          >
                            <div className="flex items-center gap-1">
                              Students
                              {sortBy === "students" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover-elevate"
                            onClick={() => {
                              if (sortBy === "licenses") setSortOrder(prev => prev === "asc" ? "desc" : "asc");
                              else { setSortBy("licenses"); setSortOrder("desc"); }
                            }}
                          >
                            <div className="flex items-center gap-1">
                              Licenses
                              {sortBy === "licenses" && (sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                            </div>
                          </TableHead>
                          <TableHead>Admins</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedOrgs.map((org) => (
                          <TableRow key={org.id} data-testid={`row-org-${org.id}`}>
                            <TableCell>
                              <Checkbox
                                checked={selectedOrgIds.has(org.id)}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(selectedOrgIds);
                                  if (checked) {
                                    newSet.add(org.id);
                                  } else {
                                    newSet.delete(org.id);
                                  }
                                  setSelectedOrgIds(newSet);
                                }}
                                data-testid={`checkbox-org-${org.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{org.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Created {new Date(org.createdAt).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              {org.primaryAdmin ? (
                                <div>
                                  <div className="font-medium">
                                    {org.primaryAdmin.firstName} {org.primaryAdmin.lastName}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {org.primaryAdmin.username}
                                  </div>
                                  {org.primaryAdmin.email && (
                                    <div className="text-xs text-muted-foreground">
                                      {org.primaryAdmin.email}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No admin</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{org.studentCount}</div>
                              <div className="text-xs text-muted-foreground">
                                {org.completedCount} completed
                              </div>
                            </TableCell>
                            <TableCell>
                              {org.isUnlimitedLicenses ? (
                                <Badge variant="secondary" className="gap-1">
                                  <Infinity className="w-3 h-3" />
                                  Unlimited
                                </Badge>
                              ) : (
                                <div>
                                  <div className="font-medium">
                                    {org.usedLicenses} / {org.totalLicenses}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {org.utilizationRate}% used
                                  </div>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{org.adminCount} admin{org.adminCount !== 1 ? "s" : ""}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openAdminsModal(org.id)}
                                  title="Manage Admins"
                                  data-testid={`button-manage-admins-${org.id}`}
                                >
                                  <Users className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openLicenseModal(org.id)}
                                  title="Manage Licenses"
                                  data-testid={`button-manage-licenses-${org.id}`}
                                >
                                  <Key className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEventsModal(org.id)}
                                  title="View History"
                                  data-testid={`button-view-history-${org.id}`}
                                >
                                  <History className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openDeleteOrgModal(org.id)}
                                  title="Delete School"
                                  className="text-destructive hover:text-destructive"
                                  data-testid={`button-delete-org-${org.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="students" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>All Users</CardTitle>
                    <CardDescription>View all students, school admins, and premium users with assessment history</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={studentSearchQuery}
                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                        className="pl-9 w-64"
                        data-testid="input-search-students"
                      />
                    </div>
                    <Select value={userTypeFilter} onValueChange={setUserTypeFilter}>
                      <SelectTrigger className="w-40" data-testid="select-user-type-filter">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="students">School Students</SelectItem>
                        <SelectItem value="org_admins">School Admins</SelectItem>
                        <SelectItem value="premium">Premium Users</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" asChild data-testid="button-export-students">
                      <a href="/api/superadmin/export/students?format=csv" download>
                        <Download className="w-4 h-4 mr-2" />
                        Export CSV
                      </a>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedUserIds.size > 0 && (
                  <div className="flex items-center gap-4 p-3 mb-4 bg-muted rounded-lg">
                    <span className="text-sm font-medium">{selectedUserIds.size} user(s) selected</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => bulkResetPasswordsMutation.mutate(Array.from(selectedUserIds))}
                        disabled={bulkResetPasswordsMutation.isPending}
                        data-testid="button-bulk-reset-passwords"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        Reset Passwords
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedUserIds(new Set())}
                        data-testid="button-clear-user-selection"
                      >
                        Clear Selection
                      </Button>
                    </div>
                  </div>
                )}
                {studentsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading users...</div>
                ) : (() => {
                  const filteredStudents = students.filter((s) => {
                    const searchLower = studentSearchQuery.toLowerCase();
                    const matchesSearch = !studentSearchQuery || 
                      (s.user.firstName?.toLowerCase().includes(searchLower)) ||
                      (s.user.lastName?.toLowerCase().includes(searchLower)) ||
                      (s.user.email?.toLowerCase().includes(searchLower)) ||
                      (s.user.username?.toLowerCase().includes(searchLower)) ||
                      (s.organizationName?.toLowerCase().includes(searchLower));
                    const matchesType = userTypeFilter === 'all' ||
                      (userTypeFilter === 'students' && s.user.accountType === 'org_student') ||
                      (userTypeFilter === 'org_admins' && s.user.accountType === 'org_admin') ||
                      (userTypeFilter === 'premium' && s.user.accountType === 'individual' && s.user.isPremium);
                    return matchesSearch && matchesType;
                  });
                  const allFilteredSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedUserIds.has(s.user.id));
                  
                  return filteredStudents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No users found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={allFilteredSelected}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedUserIds(new Set(filteredStudents.map(s => s.user.id)));
                                  } else {
                                    setSelectedUserIds(new Set());
                                  }
                                }}
                                data-testid="checkbox-select-all-users"
                              />
                            </TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>User Type</TableHead>
                            <TableHead>Assessments</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredStudents.map((student) => (
                            <TableRow key={student.user.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedUserIds.has(student.user.id)}
                                  onCheckedChange={(checked) => {
                                    const newSet = new Set(selectedUserIds);
                                    if (checked) {
                                      newSet.add(student.user.id);
                                    } else {
                                      newSet.delete(student.user.id);
                                    }
                                    setSelectedUserIds(newSet);
                                  }}
                                  data-testid={`checkbox-user-${student.user.id}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">
                                  {student.user.firstName} {student.user.lastName}
                                </div>
                                {student.user.email && (
                                  <div className="text-xs text-muted-foreground">{student.user.email}</div>
                                )}
                              </TableCell>
                              <TableCell>{student.user.username || "-"}</TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <Badge 
                                    variant={student.user.accountType === 'org_admin' ? 'destructive' : student.user.accountType === 'org_student' ? 'secondary' : 'default'}
                                    className="w-fit"
                                  >
                                    {student.user.accountType === 'org_admin' ? 'Admin' : student.user.accountType === 'org_student' ? 'Student' : 'Premium'}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground mt-1">
                                    School: {student.organizationName || "Individual"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{student.assessmentCount}</div>
                                {student.latestAssessmentDate && (
                                  <div className="text-xs text-muted-foreground">
                                    Last: {new Date(student.latestAssessmentDate).toLocaleDateString()}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openResetPasswordModal(student.user.id)}
                                    title="Reset Password"
                                    data-testid={`button-reset-password-${student.user.id}`}
                                  >
                                    <Key className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    asChild
                                    title="View Results"
                                    data-testid={`button-view-results-${student.user.id}`}
                                  >
                                    <a href={`/api/superadmin/students/${student.user.id}/results`} target="_blank" rel="noopener noreferrer">
                                      <Eye className="w-4 h-4" />
                                    </a>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => impersonateMutation.mutate(student.user.id)}
                                    title="Impersonate User"
                                  data-testid={`button-impersonate-${student.user.id}`}
                                >
                                  <UserCog className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  asChild
                                  title="View Assessments"
                                  data-testid={`button-view-assessments-${student.user.id}`}
                                >
                                  <a href={`/api/superadmin/students/${student.user.id}/assessments`} target="_blank" rel="noopener noreferrer">
                                    <History className="w-4 h-4" />
                                  </a>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Audit log of recent changes across all schools</CardDescription>
              </CardHeader>
              <CardContent>
                {allEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No recent activity</div>
                ) : (
                  <div className="space-y-4">
                    {allEvents.slice(0, 20).map((event) => (
                      <div key={event.id} className="flex items-start gap-4 p-3 rounded-lg hover-elevate border">
                        <div className="mt-1">{getEventTypeIcon(event.eventType)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{event.eventDescription}</div>
                          <div className="text-sm text-muted-foreground">
                            {event.organization?.name || "Unknown School"}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                            <span>By {event.performer?.username || "Unknown"}</span>
                            <span>{new Date(event.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>File Management</CardTitle>
                    <CardDescription>View and manage all uploaded files</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading files...</div>
                ) : files.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No files found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Filename</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Downloads</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Uploaded</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {files.map((file) => (
                          <TableRow key={file.id}>
                            <TableCell>
                              <div className="font-medium truncate max-w-[200px]" title={file.originalFilename}>
                                {file.originalFilename}
                              </div>
                              {file.description && (
                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {file.description}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{file.fileType}</Badge>
                            </TableCell>
                            <TableCell>{formatFileSize(file.fileSize)}</TableCell>
                            <TableCell>{file.downloadCount}</TableCell>
                            <TableCell>
                              <Badge variant={file.processingStatus === "completed" ? "default" : "secondary"}>
                                {file.processingStatus || "pending"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(file.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  asChild
                                  title="Download"
                                  data-testid={`button-download-file-${file.id}`}
                                >
                                  <a href={`/api/files/${file.id}/download`} download>
                                    <Download className="w-4 h-4" />
                                  </a>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteFileMutation.mutate(file.id)}
                                  title="Delete"
                                  className="text-destructive hover:text-destructive"
                                  data-testid={`button-delete-file-${file.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="announcements" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>System Announcements</CardTitle>
                    <CardDescription>Create and manage announcements visible to users</CardDescription>
                  </div>
                  <Button onClick={() => { resetAnnouncementForm(); setEditingAnnouncement(null); setIsAnnouncementModalOpen(true); }} data-testid="button-new-announcement">
                    <Plus className="w-4 h-4 mr-2" />
                    New Announcement
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {announcementsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading announcements...</div>
                ) : announcements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No announcements yet</div>
                ) : (
                  <div className="space-y-4">
                    {announcements.map((announcement) => (
                      <div key={announcement.id} className="flex items-start gap-4 p-4 rounded-lg border hover-elevate">
                        <div className="mt-1">{getAnnouncementTypeIcon(announcement.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{announcement.title}</span>
                            {announcement.isPinned && <Badge variant="secondary">Pinned</Badge>}
                            {!announcement.isActive && <Badge variant="outline">Inactive</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{announcement.content}</div>
                          <div className="text-xs text-muted-foreground mt-2 flex gap-4 flex-wrap">
                            <span>Audience: {announcement.targetAudience === 'all' ? 'All Users' : announcement.targetAudience === 'students' ? 'School Students' : announcement.targetAudience === 'org_admins' ? 'School Admins' : announcement.targetAudience === 'premium' ? 'Premium Users' : announcement.targetAudience}</span>
                            {announcement.publishAt && new Date(announcement.publishAt) > new Date() && (
                              <Badge variant="outline" className="text-xs">Scheduled: {new Date(announcement.publishAt).toLocaleDateString()}</Badge>
                            )}
                            {announcement.expiresAt && <span>Expires: {new Date(announcement.expiresAt).toLocaleDateString()}</span>}
                            <span>Created: {new Date(announcement.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditAnnouncement(announcement)} title="Edit" data-testid={`button-edit-announcement-${announcement.id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteAnnouncementMutation.mutate(announcement.id)} title="Delete" className="text-destructive hover:text-destructive" data-testid={`button-delete-announcement-${announcement.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="careers" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Career Management</CardTitle>
                    <CardDescription>Add, edit, or remove careers from the system</CardDescription>
                  </div>
                  <Button onClick={() => { resetCareerForm(); setEditingCareer(null); setIsCareerModalOpen(true); }} data-testid="button-new-career">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Career
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {careersLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading careers...</div>
                ) : careers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No careers found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Education</TableHead>
                          <TableHead>Growth</TableHead>
                          <TableHead>Skills</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {careers.map((career) => (
                          <TableRow key={career.id}>
                            <TableCell>
                              <div className="font-medium">{career.title}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">{career.description.substring(0, 50)}...</div>
                            </TableCell>
                            <TableCell><Badge variant="outline">{career.category}</Badge></TableCell>
                            <TableCell>{career.educationLevel}</TableCell>
                            <TableCell>
                              <Badge variant={career.growthOutlook === "high" ? "default" : career.growthOutlook === "medium" ? "secondary" : "outline"}>
                                {career.growthOutlook}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1 max-w-[150px]">
                                {career.requiredSkills.slice(0, 2).map((skill, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                                ))}
                                {career.requiredSkills.length > 2 && (
                                  <Badge variant="outline" className="text-xs">+{career.requiredSkills.length - 2}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditCareer(career)} title="Edit" data-testid={`button-edit-career-${career.id}`}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => deleteCareerMutation.mutate(career.id)} title="Delete" className="text-destructive hover:text-destructive" data-testid={`button-delete-career-${career.id}`}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="countries" className="space-y-4">
            <CountryManagement />
          </TabsContent>

          <TabsContent value="subjects" className="space-y-4">
            <SubjectManagement />
          </TabsContent>

          <TabsContent value="scoring" className="space-y-4">
            <ScoringConfigEditor />
          </TabsContent>

          <TabsContent value="contributions" className="space-y-4">
            <ContributionReviewQueue />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isAdminsModalOpen} onOpenChange={setIsAdminsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Admins - {selectedOrg?.name}</DialogTitle>
            <DialogDescription>View and manage administrators for this school</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setIsAddAdminModalOpen(true)} data-testid="button-add-admin">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Admin
              </Button>
            </div>
            {adminsLoading ? (
              <div className="text-center py-4">Loading admins...</div>
            ) : orgAdmins.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">No admins found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgAdmins.map((admin) => (
                    <TableRow key={admin.memberId}>
                      <TableCell>
                        <div className="font-medium">
                          {admin.user?.firstName} {admin.user?.lastName}
                        </div>
                      </TableCell>
                      <TableCell>{admin.user?.username}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {admin.user?.email && <div>{admin.user.email}</div>}
                          {admin.user?.phone && <div>{admin.user.phone}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {admin.isPrimaryAdmin ? (
                          <Badge className="gap-1">
                            <Crown className="w-3 h-3" />
                            Primary
                          </Badge>
                        ) : (
                          <Badge variant="outline">Admin</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!admin.isPrimaryAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => promoteAdminMutation.mutate(admin.memberId)}
                                disabled={promoteAdminMutation.isPending}
                                title="Promote to Primary"
                              >
                                <Crown className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeAdminMutation.mutate(admin.memberId)}
                                disabled={removeAdminMutation.isPending}
                                title="Remove Admin"
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddAdminModalOpen} onOpenChange={setIsAddAdminModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Admin</DialogTitle>
            <DialogDescription>Create a new administrator for {selectedOrg?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={newAdminForm.firstName}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, firstName: e.target.value })}
                  data-testid="input-admin-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={newAdminForm.lastName}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, lastName: e.target.value })}
                  data-testid="input-admin-lastname"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newAdminForm.email}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                data-testid="input-admin-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={newAdminForm.phone}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, phone: e.target.value })}
                data-testid="input-admin-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username (optional, will be auto-generated)</Label>
              <Input
                id="username"
                value={newAdminForm.username}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, username: e.target.value })}
                data-testid="input-admin-username"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddAdminModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => addAdminMutation.mutate(newAdminForm)}
              disabled={!newAdminForm.firstName || !newAdminForm.lastName || addAdminMutation.isPending}
              data-testid="button-submit-add-admin"
            >
              {addAdminMutation.isPending ? "Creating..." : "Create Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Credentials Modal */}
      <Dialog open={isCredentialsModalOpen} onOpenChange={setIsCredentialsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin Account Created</DialogTitle>
            <DialogDescription>
              Save these credentials securely - they won't be shown again!
            </DialogDescription>
          </DialogHeader>
          {createdAdminCredentials && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Username</p>
                  <p className="font-mono font-bold text-lg" data-testid="text-created-username">{createdAdminCredentials.username}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Password</p>
                  <p className="font-mono font-bold text-lg" data-testid="text-created-password">{createdAdminCredentials.password}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    navigator.clipboard.writeText(`Username: ${createdAdminCredentials.username}\nPassword: ${createdAdminCredentials.password}`);
                    toast({ title: "Copied!", description: "Credentials copied to clipboard" });
                  }}
                  data-testid="button-copy-credentials"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    const content = `Username: ${createdAdminCredentials.username}\nPassword: ${createdAdminCredentials.password}`;
                    const blob = new Blob([content], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${createdAdminCredentials.username}-credentials.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  data-testid="button-download-credentials"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => {
              setIsCredentialsModalOpen(false);
              setCreatedAdminCredentials(null);
              toast({ title: "Admin Added", description: "The new admin can now log in with their credentials" });
            }} data-testid="button-close-credentials">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLicenseModalOpen} onOpenChange={setIsLicenseModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Licenses - {selectedOrg?.name}</DialogTitle>
            <DialogDescription>Adjust license allocation for this school</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">Current Usage</div>
              <div className="text-2xl font-bold">
                {selectedOrg?.usedLicenses || 0} / {selectedOrg?.isUnlimitedLicenses ? "Unlimited" : selectedOrg?.totalLicenses || 0}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="unlimited">Unlimited Licenses</Label>
              <Switch
                id="unlimited"
                checked={licenseForm.isUnlimited}
                onCheckedChange={(checked) => setLicenseForm({ ...licenseForm, isUnlimited: checked })}
                data-testid="switch-unlimited"
              />
            </div>
            {!licenseForm.isUnlimited && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="totalLicenses">Total Licenses</Label>
                  <Input
                    id="totalLicenses"
                    type="number"
                    min={selectedOrg?.usedLicenses || 0}
                    value={licenseForm.totalLicenses}
                    onChange={(e) => setLicenseForm({ ...licenseForm, totalLicenses: parseInt(e.target.value) || 0 })}
                    data-testid="input-total-licenses"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cannot be less than {selectedOrg?.usedLicenses || 0} (currently in use)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Quick Adjustment</Label>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLicenseForm({ ...licenseForm, totalLicenses: licenseForm.totalLicenses + 10 })}
                    >
                      +10
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLicenseForm({ ...licenseForm, totalLicenses: licenseForm.totalLicenses + 50 })}
                    >
                      +50
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLicenseForm({ ...licenseForm, totalLicenses: Math.max(selectedOrg?.usedLicenses || 0, licenseForm.totalLicenses - 10) })}
                    >
                      -10
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLicenseModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => updateLicensesMutation.mutate({
                totalLicenses: licenseForm.totalLicenses,
                isUnlimitedLicenses: licenseForm.isUnlimited,
              })}
              disabled={updateLicensesMutation.isPending}
              data-testid="button-save-licenses"
            >
              {updateLicensesMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEventsModalOpen} onOpenChange={setIsEventsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Activity History - {selectedOrg?.name}</DialogTitle>
            <DialogDescription>Recent changes and events for this school</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {eventsLoading ? (
              <div className="text-center py-4">Loading events...</div>
            ) : orgEvents.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">No activity recorded</div>
            ) : (
              <div className="space-y-3">
                {orgEvents.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className="mt-1">{getEventTypeIcon(event.eventType)}</div>
                    <div className="flex-1">
                      <div className="font-medium">{event.eventDescription}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <span>By {event.performer?.username || "Unknown"} ({event.performedByRole})</span>
                        <span>{new Date(event.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOrgModalOpen} onOpenChange={setIsCreateOrgModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New School</DialogTitle>
            <DialogDescription>Create a new school with a primary administrator account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">School Name *</Label>
              <Input
                id="orgName"
                value={newOrgForm.organizationName}
                onChange={(e) => setNewOrgForm({ ...newOrgForm, organizationName: e.target.value })}
                placeholder="e.g., Dubai International School"
                data-testid="input-org-name"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="unlimitedOrg">Unlimited Licenses</Label>
              <Switch
                id="unlimitedOrg"
                checked={newOrgForm.isUnlimitedLicenses}
                onCheckedChange={(checked) => setNewOrgForm({ ...newOrgForm, isUnlimitedLicenses: checked })}
                data-testid="switch-org-unlimited"
              />
            </div>
            {!newOrgForm.isUnlimitedLicenses && (
              <div className="space-y-2">
                <Label htmlFor="orgLicenses">Total Licenses</Label>
                <Input
                  id="orgLicenses"
                  type="number"
                  min={1}
                  value={newOrgForm.totalLicenses}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, totalLicenses: parseInt(e.target.value) || 1 })}
                  data-testid="input-org-licenses"
                />
              </div>
            )}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Primary Admin Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="adminFirst">First Name *</Label>
                  <Input
                    id="adminFirst"
                    value={newOrgForm.adminFirstName}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, adminFirstName: e.target.value })}
                    data-testid="input-org-admin-firstname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminLast">Last Name *</Label>
                  <Input
                    id="adminLast"
                    value={newOrgForm.adminLastName}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, adminLastName: e.target.value })}
                    data-testid="input-org-admin-lastname"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="adminEmail">Admin Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={newOrgForm.adminEmail}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, adminEmail: e.target.value })}
                  data-testid="input-org-admin-email"
                />
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="adminPhone">Admin Phone</Label>
                <Input
                  id="adminPhone"
                  value={newOrgForm.adminPhone}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, adminPhone: e.target.value })}
                  data-testid="input-org-admin-phone"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOrgModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => createOrgMutation.mutate(newOrgForm)}
              disabled={!newOrgForm.organizationName || !newOrgForm.adminFirstName || !newOrgForm.adminLastName || createOrgMutation.isPending}
              data-testid="button-submit-create-org"
            >
              {createOrgMutation.isPending ? "Creating..." : "Create School"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Modal */}
      <Dialog open={isDeleteOrgModalOpen} onOpenChange={setIsDeleteOrgModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete School</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the school,
              all admins, students, and their assessment data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm font-medium">You are about to delete:</p>
              <p className="text-lg font-bold mt-1">{selectedOrg?.name}</p>
              <div className="mt-2 text-sm text-muted-foreground">
                <p>{selectedOrg?.studentCount || 0} students</p>
                <p>{selectedOrg?.adminCount || 0} admins</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type the school name to confirm:</Label>
              <Input
                value={deleteOrgConfirmName}
                onChange={(e) => setDeleteOrgConfirmName(e.target.value)}
                placeholder={selectedOrg?.name}
                data-testid="input-confirm-delete-org"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOrgModalOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => selectedOrgId && deleteOrgMutation.mutate(selectedOrgId)}
              disabled={deleteOrgConfirmName !== selectedOrg?.name || deleteOrgMutation.isPending}
              data-testid="button-confirm-delete-org"
            >
              {deleteOrgMutation.isPending ? "Deleting..." : "Delete School"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={isResetPasswordModalOpen} onOpenChange={setIsResetPasswordModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              Generate a new password for this user. The current password will be replaced.
            </DialogDescription>
          </DialogHeader>
          {resetPasswordResult ? (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Username</p>
                  <p className="font-mono font-bold text-lg">{resetPasswordResult.username}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">New Password</p>
                  <p className="font-mono font-bold text-lg" data-testid="text-new-password">{resetPasswordResult.newPassword}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(`Username: ${resetPasswordResult.username}\nNew Password: ${resetPasswordResult.newPassword}`);
                  toast({ title: "Copied!", description: "Credentials copied to clipboard" });
                }}
                data-testid="button-copy-new-password"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy to Clipboard
              </Button>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground">Click below to generate a new password for this user.</p>
            </div>
          )}
          <DialogFooter>
            {resetPasswordResult ? (
              <Button onClick={() => setIsResetPasswordModalOpen(false)} data-testid="button-close-reset-password">Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsResetPasswordModalOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => selectedUserId && resetPasswordMutation.mutate(selectedUserId)}
                  disabled={resetPasswordMutation.isPending}
                  data-testid="button-reset-password"
                >
                  {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Announcement Modal */}
      <Dialog open={isAnnouncementModalOpen} onOpenChange={setIsAnnouncementModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAnnouncement ? "Edit Announcement" : "New Announcement"}</DialogTitle>
            <DialogDescription>
              {editingAnnouncement ? "Update the announcement details" : "Create a new announcement visible to users"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Title *</Label>
              <Input
                id="announcement-title"
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                placeholder="Announcement title"
                data-testid="input-announcement-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-content">Content *</Label>
              <Textarea
                id="announcement-content"
                value={announcementForm.content}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                placeholder="Announcement content"
                rows={4}
                data-testid="input-announcement-content"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="announcement-type">Type</Label>
                <Select value={announcementForm.type} onValueChange={(v) => setAnnouncementForm({ ...announcementForm, type: v })}>
                  <SelectTrigger data-testid="select-announcement-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement-audience">Target Audience</Label>
                <Select value={announcementForm.targetAudience} onValueChange={(v) => setAnnouncementForm({ ...announcementForm, targetAudience: v })}>
                  <SelectTrigger data-testid="select-announcement-audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="students">School Students Only</SelectItem>
                    <SelectItem value="org_admins">School Admins Only</SelectItem>
                    <SelectItem value="premium">Premium Users Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="announcement-pinned"
                  checked={announcementForm.isPinned}
                  onCheckedChange={(c) => setAnnouncementForm({ ...announcementForm, isPinned: c })}
                  data-testid="switch-announcement-pinned"
                />
                <Label htmlFor="announcement-pinned">Pin to top</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="announcement-bgcolor">Background Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="announcement-bgcolor"
                    type="color"
                    value={announcementForm.backgroundColor}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, backgroundColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border"
                    data-testid="input-announcement-bgcolor"
                  />
                  <Input
                    type="text"
                    value={announcementForm.backgroundColor}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, backgroundColor: e.target.value })}
                    className="w-24"
                    placeholder="#ffffff"
                    data-testid="input-announcement-bgcolor-text"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="announcement-publish">Publish Date (optional)</Label>
                <Input
                  id="announcement-publish"
                  type="date"
                  value={announcementForm.publishAt}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, publishAt: e.target.value })}
                  data-testid="input-announcement-publish"
                />
                <p className="text-xs text-muted-foreground">Leave empty to publish immediately</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement-expires">Expires (optional)</Label>
                <Input
                  id="announcement-expires"
                  type="date"
                  value={announcementForm.expiresAt}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, expiresAt: e.target.value })}
                  data-testid="input-announcement-expires"
                />
                <p className="text-xs text-muted-foreground">Leave empty for no expiration</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAnnouncementModalOpen(false); setEditingAnnouncement(null); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingAnnouncement) {
                  updateAnnouncementMutation.mutate({ id: editingAnnouncement.id, ...announcementForm });
                } else {
                  createAnnouncementMutation.mutate(announcementForm);
                }
              }}
              disabled={!announcementForm.title || !announcementForm.content || createAnnouncementMutation.isPending || updateAnnouncementMutation.isPending}
              data-testid="button-save-announcement"
            >
              {(createAnnouncementMutation.isPending || updateAnnouncementMutation.isPending) ? "Saving..." : (editingAnnouncement ? "Update" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Career Modal */}
      <Dialog open={isCareerModalOpen} onOpenChange={setIsCareerModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCareer ? "Edit Career" : "Add Career"}</DialogTitle>
            <DialogDescription>
              {editingCareer ? "Update career information" : "Add a new career to the system"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="career-title">Title *</Label>
                <Input
                  id="career-title"
                  value={careerForm.title}
                  onChange={(e) => setCareerForm({ ...careerForm, title: e.target.value })}
                  placeholder="e.g., Software Engineer"
                  data-testid="input-career-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="career-category">Category *</Label>
                <Input
                  id="career-category"
                  value={careerForm.category}
                  onChange={(e) => setCareerForm({ ...careerForm, category: e.target.value })}
                  placeholder="e.g., Technology"
                  data-testid="input-career-category"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="career-description">Description *</Label>
              <Textarea
                id="career-description"
                value={careerForm.description}
                onChange={(e) => setCareerForm({ ...careerForm, description: e.target.value })}
                placeholder="Career description"
                rows={3}
                data-testid="input-career-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="career-education">Education Level *</Label>
                <Select value={careerForm.educationLevel} onValueChange={(v) => setCareerForm({ ...careerForm, educationLevel: v })}>
                  <SelectTrigger data-testid="select-career-education">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high_school">High School</SelectItem>
                    <SelectItem value="diploma">Diploma</SelectItem>
                    <SelectItem value="bachelors">Bachelor's Degree</SelectItem>
                    <SelectItem value="masters">Master's Degree</SelectItem>
                    <SelectItem value="doctorate">Doctorate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="career-growth">Growth Outlook *</Label>
                <Select value={careerForm.growthOutlook} onValueChange={(v) => setCareerForm({ ...careerForm, growthOutlook: v })}>
                  <SelectTrigger data-testid="select-career-growth">
                    <SelectValue placeholder="Select outlook" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High Growth</SelectItem>
                    <SelectItem value="medium">Medium Growth</SelectItem>
                    <SelectItem value="low">Low Growth</SelectItem>
                    <SelectItem value="declining">Declining</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="career-skills">Required Skills (comma-separated)</Label>
              <Input
                id="career-skills"
                value={careerForm.requiredSkills}
                onChange={(e) => setCareerForm({ ...careerForm, requiredSkills: e.target.value })}
                placeholder="e.g., Programming, Problem Solving, Communication"
                data-testid="input-career-skills"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="career-subjects">Related Subjects (comma-separated)</Label>
              <Input
                id="career-subjects"
                value={careerForm.relatedSubjects}
                onChange={(e) => setCareerForm({ ...careerForm, relatedSubjects: e.target.value })}
                placeholder="e.g., Mathematics, Physics, Computer Science"
                data-testid="input-career-subjects"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="career-salary">Average Salary (optional)</Label>
                <Input
                  id="career-salary"
                  value={careerForm.averageSalary}
                  onChange={(e) => setCareerForm({ ...careerForm, averageSalary: e.target.value })}
                  placeholder="e.g., AED 180,000/year"
                  data-testid="input-career-salary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="career-icon">Icon (optional)</Label>
                <Input
                  id="career-icon"
                  value={careerForm.icon}
                  onChange={(e) => setCareerForm({ ...careerForm, icon: e.target.value })}
                  placeholder="e.g., laptop"
                  data-testid="input-career-icon"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="career-country">Country (optional - leave empty for global)</Label>
              <Select value={careerForm.countryId || "_global"} onValueChange={(v) => setCareerForm({ ...careerForm, countryId: v === "_global" ? "" : v })}>
                <SelectTrigger data-testid="select-career-country">
                  <SelectValue placeholder="Global (all countries)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_global">Global (all countries)</SelectItem>
                  {countries.map((country) => (
                    <SelectItem key={country.id} value={country.id}>
                      {country.name} ({country.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select a country to make this career only available for that country's students
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCareerModalOpen(false); setEditingCareer(null); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingCareer) {
                  updateCareerMutation.mutate({ id: editingCareer.id, ...careerForm });
                } else {
                  createCareerMutation.mutate(careerForm);
                }
              }}
              disabled={!careerForm.title || !careerForm.description || !careerForm.category || !careerForm.educationLevel || !careerForm.growthOutlook || createCareerMutation.isPending || updateCareerMutation.isPending}
              data-testid="button-save-career"
            >
              {(createCareerMutation.isPending || updateCareerMutation.isPending) ? "Saving..." : (editingCareer ? "Update" : "Add Career")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
