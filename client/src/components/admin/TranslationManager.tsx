import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CheckCircle, AlertCircle, Search, Globe, Edit, Save, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CoverageEntry {
  namespace: string;
  totalKeys: number;
  translatedKeys: number;
  coveragePercent: number;
}

interface CoverageData {
  namespaces: CoverageEntry[];
  overallCoverage: number;
}

interface TranslationEntry {
  key: string;
  en: string;
  ar: string;
  isMissing: boolean;
}

interface TranslationsData {
  namespace: string;
  translations: TranslationEntry[];
}

const NAMESPACES = ["common", "landing", "assessment", "results", "auth", "admin", "riasec", "profile", "legal", "pricing"];

export default function TranslationManager() {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [selectedNs, setSelectedNs] = useState("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<{ en: string; ar: string }>({ en: "", ar: "" });

  const { data: coverage, isLoading: coverageLoading } = useQuery<CoverageData>({
    queryKey: ['/api/superadmin/translations/coverage'],
  });

  const { data: translations, isLoading: translationsLoading } = useQuery<TranslationsData>({
    queryKey: ['/api/superadmin/translations', selectedNs],
    queryFn: async () => {
      const res = await fetch(`/api/superadmin/translations/${selectedNs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch translations');
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ lang, key, value }: { lang: string; key: string; value: string }) => {
      return apiRequest('PATCH', `/api/superadmin/translations/${selectedNs}`, { lang, key, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/translations', selectedNs] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/translations/coverage'] });
      toast({ title: t('translation.saved'), description: t('translation.savedDesc') });
    },
    onError: () => {
      toast({ title: t('translation.saveError'), variant: "destructive" });
    },
  });

  const handleStartEdit = (entry: TranslationEntry) => {
    setEditingKey(entry.key);
    setEditingValues({ en: entry.en, ar: entry.ar });
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditingValues({ en: "", ar: "" });
  };

  const handleSave = async () => {
    if (!editingKey) return;
    const original = translations?.translations.find(t => t.key === editingKey);
    if (!original) return;
    const promises: Promise<any>[] = [];
    if (editingValues.en !== original.en) {
      promises.push(updateMutation.mutateAsync({ lang: "en", key: editingKey, value: editingValues.en }));
    }
    if (editingValues.ar !== original.ar) {
      promises.push(updateMutation.mutateAsync({ lang: "ar", key: editingKey, value: editingValues.ar }));
    }
    if (promises.length === 0) {
      setEditingKey(null);
      return;
    }
    try {
      await Promise.all(promises);
      setEditingKey(null);
    } catch {
      // error handled in mutation
    }
  };

  const filteredTranslations = useMemo(() => {
    if (!translations?.translations) return [];
    return translations.translations.filter(entry => {
      if (showMissingOnly && !entry.isMissing) return false;
      if (!searchQuery) return true;
      return entry.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.ar.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [translations, searchQuery, showMissingOnly]);

  const currentCoverage = coverage?.namespaces.find(n => n.namespace === selectedNs);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Globe className="w-7 h-7 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">{t('translation.title')}</h2>
          <p className="text-muted-foreground text-sm">{t('translation.subtitle')}</p>
        </div>
      </div>

      {/* Overall coverage */}
      {!coverageLoading && coverage && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">{t('translation.overallCoverage')}</CardTitle>
              <Badge variant={coverage.overallCoverage >= 80 ? "default" : "destructive"} className="text-sm">
                {coverage.overallCoverage}%
              </Badge>
            </div>
            <Progress value={coverage.overallCoverage} className="h-2" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {coverage.namespaces.map(ns => (
                <button
                  key={ns.namespace}
                  onClick={() => setSelectedNs(ns.namespace)}
                  className={`rounded-md p-2 text-start border transition-colors hover-elevate ${selectedNs === ns.namespace ? "border-primary bg-primary/5" : "border-border"}`}
                  data-testid={`ns-select-${ns.namespace}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold">{ns.namespace}</span>
                    {ns.coveragePercent === 100
                      ? <CheckCircle className="w-3 h-3 text-green-500" />
                      : <AlertCircle className="w-3 h-3 text-amber-500" />
                    }
                  </div>
                  <Progress value={ns.coveragePercent} className="h-1 mb-1" />
                  <p className="text-xs text-muted-foreground">{ns.translatedKeys}/{ns.totalKeys}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Translation editor */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base capitalize">{selectedNs} {t('translation.namespace')}</CardTitle>
              {currentCoverage && (
                <CardDescription>
                  {currentCoverage.translatedKeys}/{currentCoverage.totalKeys} {t('translation.keysTranslated')} ({currentCoverage.coveragePercent}%)
                </CardDescription>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedNs} onValueChange={setSelectedNs}>
                <SelectTrigger className="w-44" data-testid="select-namespace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NAMESPACES.map(ns => (
                    <SelectItem key={ns} value={ns}>{ns}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={showMissingOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowMissingOnly(v => !v)}
                data-testid="button-show-missing"
              >
                <AlertCircle className="w-3.5 h-3.5 me-1.5" />
                {t('translation.missingOnly')}
              </Button>
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="ps-9"
              placeholder={t('translation.searchKeys')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              data-testid="input-search-translations"
            />
          </div>
        </CardHeader>
        <CardContent>
          {translationsLoading ? (
            <div className="text-center text-muted-foreground py-12">{t('translation.loading')}</div>
          ) : filteredTranslations.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">{t('translation.noKeys')}</div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-semibold text-muted-foreground px-2 pb-1 border-b">
                <span>{t('translation.colKey')}</span>
                <span>EN</span>
                <span>AR</span>
                <span></span>
              </div>
              {filteredTranslations.map(entry => (
                <div
                  key={entry.key}
                  className={`grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start rounded-md px-2 py-2 text-sm ${entry.isMissing ? "bg-amber-50 dark:bg-amber-900/10" : "hover:bg-muted/50"}`}
                  data-testid={`translation-row-${entry.key}`}
                >
                  {editingKey === entry.key ? (
                    <>
                      <div className="font-mono text-xs text-muted-foreground self-center break-all">{entry.key}</div>
                      <Textarea
                        value={editingValues.en}
                        onChange={e => setEditingValues(v => ({ ...v, en: e.target.value }))}
                        rows={2}
                        className="text-xs"
                        data-testid={`edit-en-${entry.key}`}
                      />
                      <Textarea
                        value={editingValues.ar}
                        onChange={e => setEditingValues(v => ({ ...v, ar: e.target.value }))}
                        rows={2}
                        className="text-xs"
                        dir="rtl"
                        data-testid={`edit-ar-${entry.key}`}
                      />
                      <div className="flex gap-1 self-start">
                        <Button size="icon" variant="default" onClick={handleSave} disabled={updateMutation.isPending} data-testid={`save-${entry.key}`}>
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={handleCancelEdit} data-testid={`cancel-${entry.key}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-mono text-xs text-muted-foreground break-all">{entry.key}</div>
                      <div className="text-sm line-clamp-2">{entry.en || <span className="text-muted-foreground italic">{t('translation.empty')}</span>}</div>
                      <div className={`text-sm line-clamp-2 ${entry.isMissing ? "text-amber-600 dark:text-amber-400 italic" : ""}`} dir="rtl">
                        {entry.ar || <span className="text-muted-foreground italic">{t('translation.missing')}</span>}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => handleStartEdit(entry)} data-testid={`edit-${entry.key}`}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
