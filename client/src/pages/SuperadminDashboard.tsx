import { useState } from "react";
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
import { 
  Building2, Users, GraduationCap, Key, Search, Filter, 
  Plus, Download, Edit, Trash2, UserPlus, Crown, Shield,
  TrendingUp, AlertCircle, CheckCircle, Clock, Home, User, LogOut,
  ChevronUp, ChevronDown, History, Infinity, BarChart, Copy, FileQuestion
} from "lucide-react";

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

export default function SuperadminDashboard() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [licenseFilter, setLicenseFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  
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

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Super Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage all schools, licenses, and administrators</p>
          </div>
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
          <TabsList>
            <TabsTrigger value="organizations" data-testid="tab-schools">Schools</TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">Recent Activity</TabsTrigger>
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
                {orgsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading schools...</div>
                ) : sortedOrgs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No schools found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
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
    </div>
  );
}
