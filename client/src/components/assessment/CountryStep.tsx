import { useState, useEffect } from "react";
import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Globe2, Target, Eye, ChevronDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface CountryStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
}

export function CountryStep({ data, onUpdate, onNext }: CountryStepProps) {
  const [selectedCountryId, setSelectedCountryId] = useState(data.countryId || "");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  const isMobile = typeof window !== 'undefined' && (
    /iphone|ipad|ipod|android|webos|blackberry|windows phone/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 1024)
  );

  const { data: countries = [], isLoading: countriesLoading, error: countriesError } = useQuery<any[]>({
    queryKey: ["/api/countries"],
  });

  useEffect(() => {
    if (countriesError) {
      console.error("Countries loading error:", countriesError);
    }
    if (countries) {
      console.log("Countries loaded:", countries.length);
    }
  }, [countries, countriesError]);

  const { data: countryDetails } = useQuery<any>({
    queryKey: ["/api/countries", selectedCountryId],
    enabled: !!selectedCountryId,
  });

  const handleCountryChange = (countryId: string) => {
    setSelectedCountryId(countryId);
    onUpdate("countryId", countryId);
    setIsDetailsOpen(false);
  };

  const canProceed = !!selectedCountryId;

  if (countriesLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">Where Are You From? 🌍</h2>
          <p className="text-lg text-muted-foreground font-body">
            Loading countries...
          </p>
        </div>
      </div>
    );
  }

  if (countriesError) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">Where Are You From? 🌍</h2>
          <p className="text-lg text-destructive font-body">
            Error loading countries. Please refresh the page.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {countriesError instanceof Error ? countriesError.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  if (!countries || countries.length === 0) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">Where Are You From? 🌍</h2>
          <p className="text-lg text-muted-foreground font-body">
            No countries available. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">Where Are You From? 🌍</h2>
        <p className="text-lg text-muted-foreground font-body">
          We'll align your career path with your country's vision and opportunities
        </p>
      </div>

      <StickyNote color="blue" rotation="1" className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Globe2 className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">Select Your Country</h3>
        </div>
        {isMobile ? (
          <select
            value={selectedCountryId}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background/50 border-foreground/20 px-3 py-2 text-lg ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="select-country"
          >
            <option value="">Choose your country</option>
            {countries.map((country: any) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </select>
        ) : (
          <Select value={selectedCountryId} onValueChange={handleCountryChange}>
            <SelectTrigger className="bg-background/50 border-foreground/20 text-lg" data-testid="select-country">
              <SelectValue placeholder="Choose your country" />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[9999] max-h-[300px]">
              {countries.map((country: any) => (
                <SelectItem key={country.id} value={country.id}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </StickyNote>

      {countryDetails && (
        <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-500">
          <StickyNote color="yellow" rotation="-1">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-bold">Mission - {countryDetails.name}</h4>
                {countryDetails.visionPlan && (
                  <span className="inline-block mt-1 px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-medium">
                    {countryDetails.visionPlan}
                  </span>
                )}
              </div>
            </div>
            <p className="font-body text-foreground/90 leading-relaxed">
              {countryDetails.mission}
            </p>
          </StickyNote>

          <StickyNote color="pink" rotation="2">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <h4 className="text-lg font-bold">Vision - {countryDetails.name}</h4>
            </div>
            <p className="font-body text-foreground/90 leading-relaxed">
              {countryDetails.vision}
            </p>
          </StickyNote>

          {countryDetails.prioritySectors && countryDetails.prioritySectors.length > 0 && (
            <StickyNote color="green" rotation="-2">
              <h4 className="text-lg font-bold mb-3">Priority Sectors - {countryDetails.name}</h4>
              <div className="flex flex-wrap gap-2">
                {countryDetails.prioritySectors.map((sector: string, index: number) => (
                  <span
                    key={index}
                    className="bg-primary/10 px-3 py-1 rounded-full text-sm font-medium font-body"
                  >
                    {sector}
                  </span>
                ))}
              </div>
            </StickyNote>
          )}

          {countryDetails.targets && (
            <StickyNote color="purple" rotation="1">
              <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-bold">2030/2050 Development Goals</h4>
                    <p className="text-sm text-foreground/70 font-body mt-1">
                      See how your country is working towards the future
                    </p>
                  </div>
                </div>

                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 hover-elevate active-elevate-2"
                    data-testid="button-read-more-vision"
                  >
                    {isDetailsOpen ? "Show less" : "Read more"}
                    <ChevronDown className={`ml-2 w-4 h-4 transition-transform ${isDetailsOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-4 space-y-4">
                  {Object.entries(countryDetails.targets).map(([category, targets]: [string, any]) => (
                    <div key={category} className="border-l-2 border-primary/30 pl-4">
                      <h5 className="font-bold capitalize mb-2 text-primary">
                        {category === "tech" ? "Technology" : category === "climate" ? "Climate & Environment" : category === "economic" ? "Economy" : category}
                      </h5>
                      <div className="space-y-2">
                        {(targets as any[]).map((target, idx) => (
                          <div key={idx} className="text-sm font-body">
                            <span className="font-semibold">{target.metric}:</span>{" "}
                            <span className="text-foreground/90">{target.value}</span>
                            <span className="text-xs text-foreground/60 ml-2">
                              ({target.year}) • {target.focusArea}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  {countryDetails.nationalGoals && countryDetails.nationalGoals.length > 0 && (
                    <div className="border-t border-foreground/10 pt-4 mt-4">
                      <h5 className="font-bold mb-2">Key National Goals</h5>
                      <ul className="space-y-1">
                        {countryDetails.nationalGoals.map((goal: string, index: number) => (
                          <li key={index} className="text-sm font-body text-foreground/90 flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{goal}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </StickyNote>
          )}
        </div>
      )}

      <div className="flex justify-center pt-8">
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-country"
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
