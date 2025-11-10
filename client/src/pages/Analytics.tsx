import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { StickyNote } from "@/components/StickyNote";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
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
  Home,
  Plus,
  Award,
  Briefcase
} from "lucide-react";

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

export default function Analytics() {
  const [pinnedCountryIds, setPinnedCountryIds] = useState<string[]>([]);
  const [activeCountryId, setActiveCountryId] = useState<string | null>(null);
  const [addCountryOpen, setAddCountryOpen] = useState(false);

  // Countries list (always unfiltered to show all available countries)
  const { data: countries, isLoading: countriesLoading } = useQuery<Array<{ countryId: string; countryName: string; studentCount: number }>>({
    queryKey: ['/api/analytics/countries'],
  });

  // Auto-default to UAE on initial load
  useEffect(() => {
    if (countries && countries.length > 0 && pinnedCountryIds.length === 0) {
      // Find UAE by name, fallback to first country
      const uaeCountry = countries.find(c => c.countryName.toLowerCase().includes('emirates')) || countries[0];
      if (uaeCountry) {
        setPinnedCountryIds([uaeCountry.countryId]);
        setActiveCountryId(uaeCountry.countryId);
      }
    }
  }, [countries, pinnedCountryIds.length]);

  // Query with active country filter
  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ['/api/analytics/overview', activeCountryId],
    queryFn: async () => {
      const url = activeCountryId 
        ? `/api/analytics/overview?countryId=${activeCountryId}`
        : '/api/analytics/overview';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
  });

  const { data: careers, isLoading: careersLoading } = useQuery<CareerTrend[]>({
    queryKey: ['/api/analytics/careers', activeCountryId],
    queryFn: async () => {
      const url = activeCountryId 
        ? `/api/analytics/careers?countryId=${activeCountryId}`
        : '/api/analytics/careers';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch careers');
      return res.json();
    },
  });

  const { data: sectors, isLoading: sectorsLoading } = useQuery<SectorData[]>({
    queryKey: ['/api/analytics/sectors', activeCountryId],
    queryFn: async () => {
      const url = activeCountryId 
        ? `/api/analytics/sectors?countryId=${activeCountryId}`
        : '/api/analytics/sectors';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch sectors');
      return res.json();
    },
  });

  const completionRate = overview && overview.totalStudents > 0
    ? Math.round((overview.completedAssessments / overview.totalStudents) * 100)
    : 0;

  const topCareer = careers?.[0];

  // Available countries for "Add Country" (not already pinned and has completed assessments)
  const availableCountries = countries?.filter(c => 
    !pinnedCountryIds.includes(c.countryId) && c.studentCount > 0
  ) || [];

  // Get pinned countries data
  const pinnedCountries = pinnedCountryIds
    .map(id => countries?.find(c => c.countryId === id))
    .filter(Boolean) as Array<{ countryId: string; countryName: string; studentCount: number }>;

  const handleAddCountry = (countryId: string) => {
    setPinnedCountryIds([...pinnedCountryIds, countryId]);
    setActiveCountryId(countryId);
    setAddCountryOpen(false);
  };

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

        {/* Country Selection - Sticky Notes */}
        <div className="mb-12">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Pinned Country Sticky Notes */}
            {pinnedCountries.map((country, index) => {
              const colors = ['yellow', 'pink', 'blue', 'green', 'purple'] as const;
              const rotations = ['-2', '-1', '1', '2', '-1'] as const;
              const color = colors[index % colors.length];
              const rotation = rotations[index % rotations.length];

              return (
                <button
                  key={country.countryId}
                  onClick={() => setActiveCountryId(country.countryId)}
                  className="focus:outline-none transition-transform hover:scale-105"
                  data-testid={`filter-country-${country.countryId}`}
                >
                  <StickyNote 
                    color={color} 
                    rotation={rotation}
                    className={activeCountryId === country.countryId ? "ring-4 ring-primary ring-offset-2" : ""}
                  >
                    <div className="text-center">
                      <p className="text-lg font-bold mb-2 line-clamp-1">{country.countryName}</p>
                      <p className="text-3xl font-bold text-primary">{country.studentCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">students assessed</p>
                    </div>
                  </StickyNote>
                </button>
              );
            })}

            {/* Add Country Button */}
            {availableCountries.length > 0 && (
              <Popover open={addCountryOpen} onOpenChange={setAddCountryOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="lg"
                    className="h-32 min-w-32"
                    data-testid="button-add-country"
                  >
                    <Plus className="w-6 h-6 mr-2" />
                    Add Country
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search countries..." />
                    <CommandEmpty>No countries found.</CommandEmpty>
                    <CommandGroup>
                      {availableCountries.map((country) => (
                        <CommandItem
                          key={country.countryId}
                          value={country.countryName}
                          onSelect={() => handleAddCountry(country.countryId)}
                          data-testid={`add-country-${country.countryId}`}
                        >
                          <Globe className="mr-2 h-4 w-4" />
                          <span>{country.countryName}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {country.studentCount} students
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
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
                  {countriesLoading ? "..." : countries?.length || 0}
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

        {/* Top Career Recommendations - Portrait Sticky Notes */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">Top Career Recommendations</h2>
          </div>
          
          {careersLoading ? (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              Loading career trends...
            </div>
          ) : careers && careers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {careers.slice(0, 12).map((career, index) => {
                const colors: Array<"yellow" | "pink" | "blue" | "green" | "purple"> = ["yellow", "pink", "blue", "green", "purple"];
                const rotations: Array<"-1" | "1" | "-2" | "2"> = ["-1", "1", "-2", "2"];
                
                return (
                  <StickyNote 
                    key={career.careerId}
                    color={colors[index % 5]}
                    rotation={rotations[index % 4]}
                    className="aspect-[3/4]"
                  >
                    <div className="flex flex-col h-full p-1">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="text-xs">
                          #{index + 1}
                        </Badge>
                        <Award className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="font-bold text-sm mb-2 line-clamp-3" data-testid={`career-${index}`}>
                        {career.careerTitle}
                      </h4>
                      <div className="mt-auto space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          <span>{career.recommendationCount} recommendations</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-3 h-3 text-primary" />
                          <span className="text-xs font-semibold text-primary">
                            {career.avgMatchScore.toFixed(1)}% avg match
                          </span>
                        </div>
                      </div>
                    </div>
                  </StickyNote>
                );
              })}
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              No career data available yet
            </div>
          )}
        </div>

        {/* Talent Pipeline by Priority Sector - Portrait Sticky Notes */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Target className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">Talent Pipeline by Priority Sector</h2>
          </div>
          
          {sectorsLoading ? (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              Loading sector data...
            </div>
          ) : sectors && sectors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sectors.slice(0, 12).map((sector, index) => {
                const colors: Array<"yellow" | "pink" | "blue" | "green" | "purple"> = ["blue", "green", "pink", "yellow", "purple"];
                const rotations: Array<"-1" | "1" | "-2" | "2"> = ["1", "-1", "2", "-2"];
                
                return (
                  <StickyNote 
                    key={sector.sector}
                    color={colors[index % 5]}
                    rotation={rotations[index % 4]}
                    className="aspect-[3/4]"
                  >
                    <div className="flex flex-col h-full p-1">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-xs">
                          Sector #{index + 1}
                        </Badge>
                        <Briefcase className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="font-bold text-sm mb-2 line-clamp-3" data-testid={`sector-${index}`}>
                        {sector.sector}
                      </h4>
                      <div className="mt-auto space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          <span>{sector.studentCount} students</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Vision Alignment</span>
                            <span className="font-semibold text-primary">
                              {sector.avgAlignment.toFixed(1)}%
                            </span>
                          </div>
                          <Progress value={sector.avgAlignment} className="h-2" />
                        </div>
                      </div>
                    </div>
                  </StickyNote>
                );
              })}
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              No sector data available yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
