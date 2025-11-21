import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { GraduationCap, Crown, Users, ClipboardCheck, Home, User } from "lucide-react";
import { StickyNote } from "@/components/StickyNote";

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

  // For individual users and org students: fetch their own assessments
  const { data: assessments = [] } = useQuery<Assessment[]>({
    queryKey: ['/api/assessments'],
    enabled: !!user && !isOrgAdmin,
  });

  // For org admins: fetch organization details
  const { data: organization, isLoading: isOrgLoading } = useQuery<Organization>({
    queryKey: ['/api/my-organization'],
    enabled: !!user && isOrgAdmin,
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
      case 'org_admin':
        return <Badge className="bg-purple-500 hover:bg-purple-600" data-testid="badge-account-type"><Users className="w-3 h-3 mr-1" /> Organization Admin</Badge>;
      case 'org_student':
        return <Badge variant="secondary" data-testid="badge-account-type"><Users className="w-3 h-3 mr-1" /> Organization Student</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-account-type"><User className="w-3 h-3 mr-1" /> Individual Account</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2" data-testid="link-home">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Future Pathways</span>
          </Link>
          <Button variant="outline" size="sm" asChild data-testid="button-nav-home">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              Home
            </Link>
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">My Profile</h1>
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
              {isOrgAdmin && organization && (
                <div>
                  <p className="text-sm text-muted-foreground">Organization</p>
                  <p className="font-medium text-primary" data-testid="text-organization-name">{organization.name}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Account Type</p>
                {getAccountTypeBadge()}
              </div>
            </CardContent>
          </StickyNote>

          {/* Premium Status */}
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
                {user.isPremium ? (
                  <Badge className="bg-yellow-500 hover:bg-yellow-600" data-testid="badge-premium-status">
                    <Crown className="w-3 h-3 mr-1" />
                    Premium
                  </Badge>
                ) : (
                  <Badge variant="outline" data-testid="badge-premium-status">Free</Badge>
                )}
              </div>

              {user.isPremium && !isOrgAdmin && (
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

          {/* Assessment History - Only show for individual users */}
          {!isOrgAdmin && (
            <StickyNote rotation="-1" color="pink">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5" />
                  My Assessment History
                </CardTitle>
                <CardDescription>
                  {individualCompletedAssessments} completed assessment{individualCompletedAssessments !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assessments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">You haven't taken any assessments yet.</p>
                  <Button asChild data-testid="button-start-first-assessment">
                    <Link href="/assessment">
                      <ClipboardCheck className="w-4 h-4 mr-2" />
                      Start Your First Assessment
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {assessments.map((assessment) => (
                    <div key={assessment.id} className="flex items-center justify-between p-3 border rounded-lg hover-elevate" data-testid={`assessment-item-${assessment.id}`}>
                      <div>
                        <p className="font-medium">{assessment.name || 'Assessment'}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(assessment.createdAt).toLocaleDateString()} 
                          {assessment.tier && ` • ${assessment.tier === 'kolb' ? 'Premium' : 'Free'}`}
                        </p>
                      </div>
                      {assessment.status === 'completed' && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">
                          Completed
                        </Badge>
                      )}
                    </div>
                  ))}
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
