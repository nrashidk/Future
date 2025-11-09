import { useQuery } from "@tanstack/react-query";
import { StickyNote } from "@/components/StickyNote";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Users, 
  TrendingUp, 
  Globe, 
  Target,
  CheckCircle,
  BarChart3,
  Sparkles,
  GraduationCap,
  Home
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

interface AnalyticsOverview {
  totalStudents: number;
  completedAssessments: number;
  countriesBreakdown: Array<{ countryId: string; countryName: string; count: number }>;
  gradeDistribution: Array<{ grade: string; count: number }>;
}

interface CareerTrend {
  careerId: string;
  careerTitle: string;
  recommendationCount: number;
  avgMatchScore: number;
}

interface SectorData {
  sector: string;
  studentCount: number;
  avgAlignment: number;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function Analytics() {
  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ['/api/analytics/overview'],
  });

  const { data: countries, isLoading: countriesLoading } = useQuery<Array<{ countryId: string; countryName: string; studentCount: number }>>({
    queryKey: ['/api/analytics/countries'],
  });

  const { data: careers, isLoading: careersLoading } = useQuery<CareerTrend[]>({
    queryKey: ['/api/analytics/careers'],
  });

  const { data: sectors, isLoading: sectorsLoading } = useQuery<SectorData[]>({
    queryKey: ['/api/analytics/sectors'],
  });

  const completionRate = overview 
    ? Math.round((overview.completedAssessments / overview.totalStudents) * 100)
    : 0;

  const topCareer = careers?.[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2">
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

      <div className="max-w-7xl mx-auto py-12 px-4">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BarChart3 className="w-12 h-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">Analytics Dashboard</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Real-time insights into student career pathways and trends
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StickyNote color="yellow" rotation="-1">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted-foreground text-sm mb-1">Total Students</p>
                <p className="text-3xl font-bold" data-testid="metric-total-students">
                  {overviewLoading ? "..." : overview?.totalStudents.toLocaleString() || 0}
                </p>
              </div>
              <Users className="w-8 h-8 text-primary" />
            </div>
          </StickyNote>

          <StickyNote color="pink" rotation="1">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted-foreground text-sm mb-1">Completion Rate</p>
                <p className="text-3xl font-bold" data-testid="metric-completion-rate">
                  {overviewLoading ? "..." : `${completionRate}%`}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
          </StickyNote>

          <StickyNote color="blue" rotation="-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted-foreground text-sm mb-1">Active Countries</p>
                <p className="text-3xl font-bold" data-testid="metric-active-countries">
                  {overviewLoading ? "..." : overview?.countriesBreakdown.length || 0}
                </p>
              </div>
              <Globe className="w-8 h-8 text-primary" />
            </div>
          </StickyNote>

          <StickyNote color="green" rotation="2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted-foreground text-sm mb-1">Top Career</p>
                <p className="text-lg font-bold line-clamp-2" data-testid="metric-top-career">
                  {careersLoading ? "..." : topCareer?.careerTitle || "N/A"}
                </p>
              </div>
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
          </StickyNote>
        </div>

        {/* Country Distribution */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Student Distribution by Country
            </CardTitle>
          </CardHeader>
          <CardContent>
            {countriesLoading ? (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                Loading chart data...
              </div>
            ) : countries && countries.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={countries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="countryName" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="studentCount" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                No country data available yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Career Trends */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top Career Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {careersLoading ? (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                Loading career trends...
              </div>
            ) : careers && careers.length > 0 ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={careers.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis 
                      dataKey="careerTitle" 
                      type="category" 
                      width={200}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'recommendationCount') return [value, 'Recommendations'];
                        if (name === 'avgMatchScore') return [`${value.toFixed(1)}%`, 'Avg Match'];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="recommendationCount" fill="hsl(var(--chart-1))" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                  {careers.slice(0, 6).map((career, index) => {
                    const colors: Array<"yellow" | "pink" | "blue" | "green" | "purple"> = ["yellow", "pink", "blue", "green", "purple", "yellow"];
                    const rotations: Array<"-1" | "1" | "-2" | "2"> = ["-1", "1", "-2", "2", "-1", "1"];
                    
                    return (
                      <StickyNote 
                        key={career.careerId}
                        color={colors[index % 6]}
                        rotation={rotations[index % 6]}
                        className="p-4"
                      >
                      <div>
                        <h4 className="font-bold text-sm mb-2 line-clamp-2" data-testid={`career-${index}`}>
                          {career.careerTitle}
                        </h4>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{career.recommendationCount} recommendations</span>
                          <span className="font-semibold text-primary">
                            {career.avgMatchScore.toFixed(0)}% match
                          </span>
                        </div>
                      </div>
                    </StickyNote>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                No career trend data available yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sector Pipeline */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Talent Pipeline by Priority Sector
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sectorsLoading ? (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                Loading sector data...
              </div>
            ) : sectors && sectors.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={sectors.slice(0, 15)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="sector" 
                    angle={-45}
                    textAnchor="end"
                    height={120}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'studentCount') return [value, 'Students'];
                      if (name === 'avgAlignment') return [`${value.toFixed(1)}%`, 'Avg Alignment'];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="studentCount" fill="hsl(var(--chart-2))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                No sector data available yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grade Distribution */}
        {overview?.gradeDistribution && overview.gradeDistribution.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Grade Level Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={overview.gradeDistribution}
                    dataKey="count"
                    nameKey="grade"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.grade}: ${entry.count}`}
                  >
                    {overview.gradeDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
