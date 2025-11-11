import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Home, Plus, Download, Upload, Edit, Trash2, GraduationCap, 
  Users, Building2, Key, RefreshCw, FileDown, Lock, LockOpen
} from "lucide-react";
import { StickyNote } from "@/components/StickyNote";

interface Organization {
  id: string;
  name: string;
  adminUserId: string;
  totalLicenses: number;
  usedLicenses: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
}

interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  grade?: string;
  studentId?: string;
  role: string;
  hasCompletedAssessment: boolean;
  isLocked: boolean;
  passwordLastReset?: string;
  passwordResetBy?: string;
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  };
}

export default function AdminOrganizations() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isCreateOrgDialogOpen, setIsCreateOrgDialogOpen] = useState(false);
  const [isCreateMemberDialogOpen, setIsCreateMemberDialogOpen] = useState(false);
  const [isBulkUploadDialogOpen, setIsBulkUploadDialogOpen] = useState(false);

  const { data: organizations = [], isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations'],
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<OrganizationMember[]>({
    queryKey: ['/api/admin/organizations', selectedOrgId, 'members'],
    enabled: !!selectedOrgId,
  });

  const selectedOrg = organizations.find(org => org.id === selectedOrgId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Future Pathways</span>
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild data-testid="button-nav-questions">
              <Link href="/admin">
                Quiz Questions
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="button-nav-home">
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Home
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-12 px-4">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Organizations Dashboard</h1>
          <p className="text-muted-foreground text-lg">Manage Group Assessment Organizations</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Organizations List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
                <div>
                  <CardTitle className="text-lg">Organizations</CardTitle>
                  <CardDescription>{organizations.length} total</CardDescription>
                </div>
                <Dialog open={isCreateOrgDialogOpen} onOpenChange={setIsCreateOrgDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-create-organization">
                      <Plus className="w-4 h-4" />
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
              </CardHeader>
              <CardContent>
                {orgsLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
                ) : organizations.length === 0 ? (
                  <div className="text-center py-8">
                    <StickyNote color="yellow" rotation="1" className="mx-auto mb-4">
                      <Building2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No organizations yet</p>
                    </StickyNote>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {organizations.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => setSelectedOrgId(org.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-all hover-elevate ${
                          selectedOrgId === org.id 
                            ? 'bg-primary/10 border-primary' 
                            : 'border-border'
                        }`}
                        data-testid={`org-item-${org.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{org.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {org.usedLicenses} / {org.totalLicenses} licenses used
                            </p>
                          </div>
                          <Badge variant={org.usedLicenses < org.totalLicenses ? "default" : "secondary"}>
                            {org.usedLicenses < org.totalLicenses ? "Active" : "Full"}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Organization Details & Members */}
          <div className="lg:col-span-2">
            {!selectedOrg ? (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center py-16">
                  <StickyNote color="blue" rotation="-1" className="mx-auto">
                    <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Select an organization to view details
                    </p>
                  </StickyNote>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Organization Header */}
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle>{selectedOrg.name}</CardTitle>
                        <CardDescription>Organization ID: {selectedOrg.id}</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" data-testid="button-edit-organization">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <StickyNote color="green" rotation="1">
                        <p className="text-xs text-muted-foreground mb-1">Total Licenses</p>
                        <p className="text-2xl font-bold">{selectedOrg.totalLicenses}</p>
                      </StickyNote>
                      <StickyNote color="blue" rotation="-1">
                        <p className="text-xs text-muted-foreground mb-1">Used</p>
                        <p className="text-2xl font-bold">{selectedOrg.usedLicenses}</p>
                      </StickyNote>
                      <StickyNote color="yellow" rotation="2">
                        <p className="text-xs text-muted-foreground mb-1">Available</p>
                        <p className="text-2xl font-bold">{selectedOrg.totalLicenses - selectedOrg.usedLicenses}</p>
                      </StickyNote>
                    </div>
                  </CardContent>
                </Card>

                {/* Students Roster */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
                    <div>
                      <CardTitle className="text-lg">Student Roster</CardTitle>
                      <CardDescription>{members.length} students</CardDescription>
                    </div>
                    <div className="flex gap-2">
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
                    ) : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Username</TableHead>
                              <TableHead>Grade</TableHead>
                              <TableHead>Student ID</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {members.map((member) => (
                              <TableRow key={member.id} data-testid={`member-row-${member.id}`}>
                                <TableCell className="font-medium">
                                  {member.user.firstName} {member.user.lastName}
                                </TableCell>
                                <TableCell>{member.user.username}</TableCell>
                                <TableCell>{member.grade || '-'}</TableCell>
                                <TableCell>{member.studentId || '-'}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    {member.isLocked && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Lock className="w-3 h-3 mr-1" />
                                        Locked
                                      </Badge>
                                    )}
                                    {member.hasCompletedAssessment ? (
                                      <Badge variant="default" className="text-xs">Completed</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">Pending</Badge>
                                    )}
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateOrganizationForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    totalLicenses: 50,
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('POST', '/api/admin/organizations', data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Organization created successfully" });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create organization", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Create Organization</DialogTitle>
        <DialogDescription>
          Add a new school or organization for group assessments
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="org-name">Organization Name *</Label>
          <Input
            id="org-name"
            value={formData.name}
            onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
            required
            placeholder="e.g., Al Ain High School"
            data-testid="input-org-name"
          />
        </div>

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
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-organization">
          {mutation.isPending ? "Creating..." : "Create Organization"}
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
        const [fullName, grade, studentId] = line.split(',').map(s => s.trim());
        return { fullName, grade, studentId };
      });

      const response = await apiRequest('POST', `/api/admin/organizations/${organizationId}/members/bulk`, {
        students,
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
    const csv = "fullName,grade,studentId\nAhmed Ali Mohamed,10,S12345\nFatima Hassan Ali,11,S12346";
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
    
    const csv = "username,password,fullName,grade,studentId\n" + 
      uploadResult.credentials.map(c => 
        `${c.username},${c.password},${c.fullName},${c.grade || ''},${c.studentId || ''}`
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
            Your CSV should have the following columns: fullName, grade, studentId
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

      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => {
          if (member.isLocked) {
            toast({ 
              title: "Cannot Delete", 
              description: "Locked students cannot be deleted", 
              variant: "destructive" 
            });
            return;
          }
          if (confirm(`Delete ${member.user.firstName} ${member.user.lastName}?`)) {
            deleteMutation.mutate();
          }
        }}
        disabled={member.isLocked}
        data-testid={`button-delete-${member.id}`}
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}
