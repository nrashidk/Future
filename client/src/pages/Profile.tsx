import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { GraduationCap, Crown, Users, ClipboardCheck, Home, User, LogOut, BarChart, Shield, Building2, FileQuestion } from "lucide-react";
import { StickyNote } from "@/components/StickyNote";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

interface Assessment {
  id: string;
  name: string;
  age: number | null;
  grade: string | null;
  createdAt: string;
  tier: string;
  status: string;
}

interface Assessment {
  id: string;
  name: string;
  age: number | null;
  grade: string | null;
  createdAt: string;
  tier: string;
  status: string;
}

interface Organization {
  id: string;
  name: string;
  adminUserId: string;
  totalLicenses: number;
  usedLicenses: number;
}

interface OrgStats {
  totalLicenses: number;
  usedLicenses: number;
  remainingLicenses: number;
  totalMembers: number;
  completedAssessments: number;
  pendingAssessments: number;
}

export default function Profile() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const isOrgAdmin = user?.accountType === 'org_admin';
  const isOrgStudent = user?.accountType === 'org_student';
  const isSuperadmin = user?.accountType === 'superadmin';

  // For individual users and org students: fetch their own assessments
  const { data: assessments = [] } = useQuery<Assessment[]>({
    queryKey: ['/api/assessments/my'],
    enabled: !!user && !isOrgAdmin,
  });

  // For org admins AND org students: fetch organization details
  const { data: organization, isLoading: isOrgLoading } = useQuery<Organization>({
    queryKey: ['/api/my-organization'],
    enabled: !!user && (isOrgAdmin || isOrgStudent),
  });

  // For org admins: fetch organization-wide statistics
  const { data: orgStats, isLoading: isOrgStatsLoading, error: orgStatsError } = useQuery<OrgStats>({
    queryKey: ['/api/my-organization/stats'],
    enabled: !!user && isOrgAdmin,
  });

  if (isLoading || (isOrgAdmin && isOrgLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  // Calculate license information for individual users only
  // Org admin stats are handled separately when orgStats is available
  const completed = assessments.filter(a => a.status === 'completed').length;
  const individualCompletedAssessments = completed;
  const individualAvailableLicenses = user.purchasedLicenses || 0;
  const individualUsedLicenses = completed;
  const individualRemainingLicenses = Math.max(0, individualAvailableLicenses - individualUsedLicenses);

  const getAccountTypeBadge = () => {
    switch (user.accountType) {
      case 'superadmin':
        return <Badge className="bg-red-500 hover:bg-red-600" data-testid="badge-account-type"><Shield className="w-3 h-3 mr-1" /> Superadmin</Badge>;
      case 'org_admin':
        return <Badge className="bg-purple-500 hover:bg-purple-600" data-testid="badge-account-type"><Users className="w-3 h-3 mr-1" /> School Admin</Badge>;
      case 'org_student':
        return <Badge variant="secondary" data-testid="badge-account-type"><Users className="w-3 h-3 mr-1" /> School Student</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-account-type"><User className="w-3 h-3 mr-1" /> Individual Account</Badge>;
    }
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2" data-testid="link-home">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Future Pathways</span>
            {isSuperadmin && <Badge variant="secondary">Superadmin</Badge>}
            {isOrgAdmin && <Badge variant="secondary">School Admin</Badge>}
          </Link>
          <div className="flex gap-2">
            {isSuperadmin && (
              <>
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
              </>
            )}
            {isOrgAdmin && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-schools">
                  <Link href="/admin/organizations">
                    <Building2 className="w-4 h-4 mr-2" />
                    Schools
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
              data-testid="button-logout-profile"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-4">
        <AnnouncementBanner />
      </div>

      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <User className="w-12 h-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">My Profile</h1>
          </div>
          <p className="text-muted-foreground text-lg">Manage your account and view your progress</p>
        </div>

        <div className="grid gap-6">
          {/* Account Information */}
          <StickyNote rotation="-1" color="yellow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Two-column layout for org students: name/username on left, school/grade on right */}
              {isOrgStudent ? (
                <>
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left column: Name and Username */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Name</p>
                        <p className="font-medium" data-testid="text-user-name">
                          {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Not provided'}
                        </p>
                      </div>
                      {user.username && (
                        <div>
                          <p className="text-sm text-muted-foreground">Username</p>
                          <p className="font-medium" data-testid="text-user-username">{user.username}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Right column: School and Grade */}
                    <div className="space-y-4">
                      {((user as any).organizationName || organization) && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">School</p>
                          <div className="flex items-center gap-3">
                            {(user as any).organizationLogoUrl && (
                              <img 
                                src={(user as any).organizationLogoUrl} 
                                alt="School logo" 
                                className="h-10 w-10 object-contain rounded"
                                data-testid="img-org-logo-profile"
                              />
                            )}
                            <p className="font-medium text-primary" data-testid="text-organization-name">
                              {(user as any).organizationName || organization?.name}
                            </p>
                          </div>
                        </div>
                      )}
                      {(user as any).predefinedGrade && (
                        <div>
                          <p className="text-sm text-muted-foreground">Grade</p>
                          <p className="font-medium" data-testid="text-student-grade">{(user as any).predefinedGrade}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Third line: Account Type */}
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Account Type</p>
                    {getAccountTypeBadge()}
                  </div>
                </>
              ) : isOrgAdmin ? (
                <>
                  {/* Two-column layout for org admins: name/email on left, username/organization on right */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left column: Name and Email */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Name</p>
                        <p className="font-medium" data-testid="text-user-name">
                          {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Not provided'}
                        </p>
                      </div>
                      {user.email && (
                        <div>
                          <p className="text-sm text-muted-foreground">Email</p>
                          <p className="font-medium" data-testid="text-user-email">{user.email}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Right column: Username and Organization */}
                    <div className="space-y-4">
                      {user.username && (
                        <div>
                          <p className="text-sm text-muted-foreground">Username</p>
                          <p className="font-medium" data-testid="text-user-username">{user.username}</p>
                        </div>
                      )}
                      {((user as any).organizationName || organization) && (
                        <div>
                          <p className="text-sm text-muted-foreground">Organization</p>
                          <p className="font-medium text-primary" data-testid="text-organization-name">
                            {(user as any).organizationName || organization?.name}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Third line: Account Type */}
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Account Type</p>
                    {getAccountTypeBadge()}
                  </div>
                </>
              ) : (
                <>
                  {/* Regular layout for individual users */}
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium" data-testid="text-user-name">
                      {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Not provided'}
                    </p>
                  </div>
                  {user.email && (
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium" data-testid="text-user-email">{user.email}</p>
                    </div>
                  )}
                  {user.username && (
                    <div>
                      <p className="text-sm text-muted-foreground">Username</p>
                      <p className="font-medium" data-testid="text-user-username">{user.username}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Account Type</p>
                    {getAccountTypeBadge()}
                  </div>
                </>
              )}
            </CardContent>
          </StickyNote>

          {/* Premium Status - Hidden for superadmins */}
          {!isSuperadmin && (
          <StickyNote rotation="1" color="blue">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                Premium Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Status</p>
                {isOrgAdmin ? (
                  isOrgStatsLoading ? (
                    <Badge variant="outline" data-testid="badge-premium-status">Loading...</Badge>
                  ) : orgStatsError ? (
                    <Badge variant="outline" data-testid="badge-premium-status">Unavailable</Badge>
                  ) : orgStats && orgStats.totalLicenses > 0 ? (
                    <Badge className="bg-yellow-500 hover:bg-yellow-600" data-testid="badge-premium-status">
                      <Crown className="w-3 h-3 mr-1" />
                      Premium
                    </Badge>
                  ) : (
                    <Badge variant="outline" data-testid="badge-premium-status">Free</Badge>
                  )
                ) : user.isPremium ? (
                  <Badge className="bg-yellow-500 hover:bg-yellow-600" data-testid="badge-premium-status">
                    <Crown className="w-3 h-3 mr-1" />
                    Premium
                  </Badge>
                ) : (
                  <Badge variant="outline" data-testid="badge-premium-status">Free</Badge>
                )}
              </div>

              {user.isPremium && !isOrgAdmin && !isOrgStudent && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Purchased Licenses</p>
                    <p className="font-bold text-2xl" data-testid="text-purchased-licenses">{individualAvailableLicenses}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Used Licenses</p>
                    <p className="font-bold text-2xl" data-testid="text-used-licenses">{individualUsedLicenses}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Remaining Licenses</p>
                    <p className="font-bold text-2xl text-primary" data-testid="text-remaining-licenses">{individualRemainingLicenses}</p>
                  </div>

                  {individualRemainingLicenses > 0 && (
                    <div className="pt-4 border-t">
                      <Button asChild className="w-full" data-testid="button-start-assessment">
                        <Link href="/assessment">
                          <ClipboardCheck className="w-4 h-4 mr-2" />
                          Start Premium Assessment
                        </Link>
                      </Button>
                    </div>
                  )}

                  {individualRemainingLicenses === 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-sm text-muted-foreground text-center">
                        You've used all your licenses. Purchase more to continue.
                      </p>
                      <Button asChild variant="outline" className="w-full mt-2" data-testid="button-purchase-more">
                        <Link href="/tier-selection">
                          Purchase More Licenses
                        </Link>
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* Organization Students - Show available assessments */}
              {isOrgStudent && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground text-center mb-2">
                    You have access to the premium assessment through your school.
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-sm text-muted-foreground">Available Assessments</p>
                    <p className="font-bold text-2xl text-primary" data-testid="text-student-available-assessments">
                      {Math.max(0, 1 - assessments.filter(a => a.status === 'completed').length)}
                    </p>
                  </div>
                </div>
              )}

              {isOrgAdmin && isOrgStatsLoading && (
                <div className="py-8 text-center text-muted-foreground">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p>Loading organization statistics...</p>
                </div>
              )}

              {isOrgAdmin && orgStatsError && (
                <div className="py-8 text-center text-destructive">
                  <p className="font-medium">Failed to load organization statistics</p>
                  <p className="text-sm mt-2">Please try again later.</p>
                </div>
              )}

              {isOrgAdmin && orgStats && !isOrgStatsLoading && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Total Licenses (Organization)</p>
                    <p className="font-bold text-2xl" data-testid="text-purchased-licenses">{orgStats.totalLicenses}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Used Licenses (Organization)</p>
                    <p className="font-bold text-2xl" data-testid="text-used-licenses">{orgStats.usedLicenses}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Remaining Licenses (Organization)</p>
                    <p className="font-bold text-2xl text-primary" data-testid="text-remaining-licenses">{orgStats.remainingLicenses}</p>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Total Students</p>
                      <p className="font-bold text-xl" data-testid="text-total-members">{orgStats.totalMembers}</p>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Completed Assessments</p>
                      <p className="font-bold text-xl text-green-600" data-testid="text-completed-assessments">{orgStats.completedAssessments}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Pending Assessments</p>
                      <p className="font-bold text-xl text-orange-500" data-testid="text-pending-assessments">{orgStats.pendingAssessments}</p>
                    </div>
                  </div>
                </>
              )}

              {!user.isPremium && !isOrgAdmin && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    Upgrade to Premium for advanced career assessments and personalized insights!
                  </p>
                  <Button asChild className="w-full" data-testid="button-upgrade-premium">
                    <Link href="/tier-selection">
                      <Crown className="w-4 h-4 mr-2" />
                      Upgrade to Premium
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </StickyNote>
          )}

          {/* Assessment History - Only show for non-admin users */}
          {!isOrgAdmin && !isSuperadmin && (
            <StickyNote rotation="-1" color="pink">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5" />
                  My Assessment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-6 pb-4 border-b">
                  <p className="text-sm text-muted-foreground">Completed Assessments</p>
                  <p className="font-bold text-2xl text-green-600" data-testid="text-completed-assessments-count">
                    {individualCompletedAssessments}
                  </p>
                </div>
                {assessments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">You haven't taken any assessments yet.</p>
                  <Button asChild data-testid="button-start-first-assessment">
                    <Link href={isOrgStudent ? "/assessment" : "/tier-selection"}>
                      <ClipboardCheck className="w-4 h-4 mr-2" />
                      Start Your First Assessment
                    </Link>
                  </Button>
                </div>
              ) : (
                <div>
                  {/* Show Continue button if there's an in-progress assessment */}
                  {assessments.some(a => a.status !== 'completed') && (
                    <div className="mb-4">
                      <Button asChild className="w-full" data-testid="button-continue-assessment">
                        <Link href="/assessment">
                          <ClipboardCheck className="w-4 h-4 mr-2" />
                          Continue Your Assessment
                        </Link>
                      </Button>
                    </div>
                  )}
                  {(() => {
                    // Get the latest assessment (most recent by createdAt)
                    const latestAssessment = [...assessments].sort((a, b) => 
                      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    )[0];
                    
                    return latestAssessment && (
                      <div className="p-3 border rounded-lg" data-testid={`assessment-item-${latestAssessment.id}`}>
                        <p className="font-medium">{latestAssessment.name || 'Assessment'}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(latestAssessment.createdAt).toLocaleDateString()} 
                          {latestAssessment.tier && ` • ${latestAssessment.tier === 'kolb' ? 'Premium' : 'Free'}`}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
              </CardContent>
            </StickyNote>
          )}

          {/* Organization Admin Link */}
          {isOrgAdmin && (
            <StickyNote rotation="1" color="green">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Organization Management
                </CardTitle>
                <CardDescription>
                  Manage your organization's students and assessments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full" variant="outline" data-testid="button-manage-organization">
                  <Link href="/admin/organizations">
                    <Users className="w-4 h-4 mr-2" />
                    Go to Admin Dashboard
                  </Link>
                </Button>
              </CardContent>
            </StickyNote>
          )}
        </div>
      </div>
    </div>
  );
}
