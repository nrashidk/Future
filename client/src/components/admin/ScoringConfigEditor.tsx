import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { 
  Settings, Save, AlertTriangle, CheckCircle, 
  Key, MessageSquare, Sparkles, History, Eye, EyeOff,
  TestTube, Trash2
} from "lucide-react";

interface TierComponent {
  key: string;
  name: string;
  weight: number;
  isEnabled: boolean;
}

interface Tier {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  totalWeight: number;
  components: TierComponent[];
}

interface ScoringConfigSummary {
  tiers: Tier[];
  isValid: boolean;
  validationErrors: string[];
}

interface LlmPromptTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  maxTokens: number;
  temperature: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiCredential {
  id: string;
  provider: string;
  apiKeyMasked: string | null;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChangeLog {
  id: string;
  changedBy: string;
  changeType: string;
  entityType: string;
  entityId: string;
  previousValue: any;
  newValue: any;
  changeDescription: string | null;
  createdAt: string;
  changedByUser: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export default function ScoringConfigEditor() {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [tierWeights, setTierWeights] = useState<Record<string, Record<string, { weight: number; isEnabled: boolean }>>>({});
  const [editingPrompt, setEditingPrompt] = useState<LlmPromptTemplate | null>(null);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const { data: configData, isLoading: configLoading } = useQuery<ScoringConfigSummary>({
    queryKey: ['/api/superadmin/scoring-config'],
  });

  const { data: prompts, isLoading: promptsLoading } = useQuery<LlmPromptTemplate[]>({
    queryKey: ['/api/superadmin/llm-prompts'],
  });

  const { data: credentials, isLoading: credentialsLoading } = useQuery<ApiCredential[]>({
    queryKey: ['/api/superadmin/api-credentials'],
  });

  const { data: changelog, isLoading: changelogLoading } = useQuery<ChangeLog[]>({
    queryKey: ['/api/superadmin/scoring-config/changelog'],
  });

  const updateWeightsMutation = useMutation({
    mutationFn: async ({ tierKey, weights }: { tierKey: string; weights: Record<string, { weight: number; isEnabled: boolean }> }) => {
      return apiRequest('PATCH', `/api/superadmin/scoring-config/tiers/${tierKey}/weights`, { weights });
    },
    onSuccess: () => {
      toast({ title: t('scoring.weightsUpdated'), description: t('scoring.weightsUpdatedDesc') });
      setEditingTier(null);
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config/changelog'] });
    },
    onError: (error: any) => {
      toast({ title: t('superadmin.errorTitle'), description: error.message || t('scoring.failedUpdateWeights'), variant: "destructive" });
    },
  });

  const updatePromptMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<LlmPromptTemplate> }): Promise<{ cacheCleared: boolean }> => {
      const res = await apiRequest('PATCH', `/api/superadmin/llm-prompts/${data.id}`, data.updates);
      return res.json();
    },
    onSuccess: (data) => {
      const description = data.cacheCleared
        ? t('scoring.promptUpdatedCacheClearedDesc')
        : t('scoring.promptUpdatedDesc');
      toast({ title: t('scoring.promptUpdated'), description });
      setIsPromptModalOpen(false);
      setEditingPrompt(null);
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/llm-prompts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config/changelog'] });
    },
    onError: (error: any) => {
      toast({ title: t('superadmin.errorTitle'), description: error.message || t('scoring.failedUpdatePrompt'), variant: "destructive" });
    },
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: async (data: { provider: string; apiKey: string }) => {
      return apiRequest('POST', '/api/superadmin/api-credentials', data);
    },
    onSuccess: () => {
      toast({ title: t('scoring.apiKeySaved'), description: t('scoring.anthropicKeySavedDesc') });
      setNewApiKey("");
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/api-credentials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config/changelog'] });
    },
    onError: (error: any) => {
      toast({ title: t('superadmin.errorTitle'), description: error.message || t('scoring.failedSaveKey'), variant: "destructive" });
    },
  });

  const testApiKeyMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await apiRequest('POST', `/api/superadmin/api-credentials/${provider}/test`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: t('scoring.testPassed'), description: data.message });
      } else {
        toast({ title: t('scoring.testFailed'), description: data.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/api-credentials'] });
    },
    onError: (error: any) => {
      toast({ title: t('superadmin.errorTitle'), description: error.message || t('scoring.failedTestKey'), variant: "destructive" });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (provider: string) => {
      return apiRequest('DELETE', `/api/superadmin/api-credentials/${provider}`);
    },
    onSuccess: () => {
      toast({ title: t('scoring.apiKeyDeleted'), description: t('scoring.apiKeyDeletedDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/api-credentials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config/changelog'] });
    },
    onError: (error: any) => {
      toast({ title: t('superadmin.errorTitle'), description: error.message || t('scoring.failedDeleteKey'), variant: "destructive" });
    },
  });

  const startEditingTier = (tier: Tier) => {
    const weights: Record<string, { weight: number; isEnabled: boolean }> = {};
    tier.components.forEach(c => {
      weights[c.key] = { weight: c.weight, isEnabled: c.isEnabled };
    });
    setTierWeights({ ...tierWeights, [tier.key]: weights });
    setEditingTier(tier.key);
  };

  const updateWeight = (tierKey: string, componentKey: string, field: 'weight' | 'isEnabled', value: number | boolean) => {
    setTierWeights(prev => ({
      ...prev,
      [tierKey]: {
        ...prev[tierKey],
        [componentKey]: {
          ...prev[tierKey][componentKey],
          [field]: value,
        },
      },
    }));
  };

  const calculateTotalWeight = (tierKey: string) => {
    const weights = tierWeights[tierKey];
    if (!weights) return 0;
    return Object.values(weights).reduce((sum, w) => sum + (w.isEnabled ? w.weight : 0), 0);
  };

  const saveWeights = (tierKey: string) => {
    const weights = tierWeights[tierKey];
    if (!weights) return;
    
    const total = calculateTotalWeight(tierKey);
    if (Math.abs(total - 100) > 0.01) {
      toast({ 
        title: t('scoring.invalidWeights'), 
        description: t('scoring.invalidWeightsDesc', { n: total }), 
        variant: "destructive" 
      });
      return;
    }
    
    updateWeightsMutation.mutate({ tierKey, weights });
  };

  const openPromptEditor = (prompt: LlmPromptTemplate) => {
    setEditingPrompt({ ...prompt });
    setIsPromptModalOpen(true);
  };

  const savePrompt = () => {
    if (!editingPrompt) return;
    updatePromptMutation.mutate({
      id: editingPrompt.id,
      updates: {
        systemPrompt: editingPrompt.systemPrompt,
        userPromptTemplate: editingPrompt.userPromptTemplate,
        model: editingPrompt.model,
        maxTokens: editingPrompt.maxTokens,
        temperature: editingPrompt.temperature,
        isActive: editingPrompt.isActive,
      },
    });
  };

  const anthropicCredential = credentials?.find(c => c.provider === 'anthropic');

  return (
    <div className="space-y-6">
      <Tabs defaultValue="weights" className="space-y-4">
        <TabsList>
          <TabsTrigger value="weights" data-testid="tab-scoring-weights">
            <Settings className="w-4 h-4 me-2" />
            {t('scoring.scoringWeights')}
          </TabsTrigger>
          <TabsTrigger value="llm" data-testid="tab-llm-config">
            <Sparkles className="w-4 h-4 me-2" />
            {t('scoring.llmConfig')}
          </TabsTrigger>
          <TabsTrigger value="prompts" data-testid="tab-prompts">
            <MessageSquare className="w-4 h-4 me-2" />
            {t('scoring.promptTemplates')}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-config-history">
            <History className="w-4 h-4 me-2" />
            {t('scoring.changeHistory')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="weights" className="space-y-4">
          {configLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('scoring.loading')}</div>
          ) : (
            <>
              {configData && !configData.isValid && (
                <Card className="border-destructive">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-5 h-5" />
                      {t('scoring.configErrors')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc pl-4 space-y-1">
                      {configData.validationErrors.map((error, i) => (
                        <li key={i} className="text-sm text-destructive">{error}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {configData?.tiers.map(tier => (
                <Card key={tier.id} data-testid={`card-tier-${tier.key}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {tier.name}
                          {tier.isActive ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">{t('scoring.active')}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">{t('scoring.inactive')}</Badge>
                          )}
                        </CardTitle>
                        <CardDescription>{tier.description}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingTier === tier.key ? (
                          <>
                            <div className={`text-sm font-medium ${Math.abs(calculateTotalWeight(tier.key) - 100) < 0.01 ? 'text-green-600' : 'text-destructive'}`}>
                              {t('scoring.totalPct', { n: calculateTotalWeight(tier.key) })}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingTier(null)}
                              data-testid={`button-cancel-${tier.key}`}
                            >
                              {t('scoring.cancel')}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveWeights(tier.key)}
                              disabled={updateWeightsMutation.isPending}
                              data-testid={`button-save-${tier.key}`}
                            >
                              <Save className="w-4 h-4 me-2" />
                              {t('scoring.save')}
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className={`text-sm font-medium ${tier.totalWeight === 100 ? 'text-green-600' : 'text-destructive'}`}>
                              {t('scoring.totalPct', { n: tier.totalWeight })}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditingTier(tier)}
                              data-testid={`button-edit-${tier.key}`}
                            >
                              {t('scoring.editWeights')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('scoring.component')}</TableHead>
                          <TableHead className="w-24">{t('scoring.enabled')}</TableHead>
                          <TableHead className="w-48">{t('scoring.weight')}</TableHead>
                          <TableHead className="w-20 text-right">{t('scoring.pctHeader')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tier.components.map(component => {
                          const isEditing = editingTier === tier.key;
                          const currentWeight = isEditing 
                            ? tierWeights[tier.key]?.[component.key]?.weight ?? component.weight
                            : component.weight;
                          const currentEnabled = isEditing
                            ? tierWeights[tier.key]?.[component.key]?.isEnabled ?? component.isEnabled
                            : component.isEnabled;
                          
                          return (
                            <TableRow key={component.key} className={!currentEnabled ? 'opacity-50' : ''}>
                              <TableCell className="font-medium">{component.name}</TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Switch
                                    checked={currentEnabled}
                                    onCheckedChange={(v) => updateWeight(tier.key, component.key, 'isEnabled', v)}
                                    data-testid={`switch-${tier.key}-${component.key}`}
                                  />
                                ) : (
                                  currentEnabled ? (
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing && currentEnabled ? (
                                  <Slider
                                    value={[currentWeight]}
                                    onValueChange={([v]) => updateWeight(tier.key, component.key, 'weight', v)}
                                    max={100}
                                    step={5}
                                    className="w-full"
                                    data-testid={`slider-${tier.key}-${component.key}`}
                                  />
                                ) : (
                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-primary" 
                                      style={{ width: `${currentEnabled ? currentWeight : 0}%` }}
                                    />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {currentEnabled ? `${currentWeight}%` : '-'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="llm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                {t('scoring.anthropicCardTitle')}
              </CardTitle>
              <CardDescription>
                {t('scoring.anthropicCardDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {credentialsLoading ? (
                <div className="text-muted-foreground">{t('scoring.loadingCredentials')}</div>
              ) : anthropicCredential ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">{t('scoring.anthropicLabel')}</div>
                      <div className="text-sm text-muted-foreground font-mono">
                        {anthropicCredential.apiKeyMasked || t('scoring.keyConfigured')}
                      </div>
                      {anthropicCredential.lastTestedAt && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {t('scoring.lastTestedLabel')} {new Date(anthropicCredential.lastTestedAt).toLocaleString()}
                          {' - '}
                          <span className={anthropicCredential.lastTestResult === 'success' ? 'text-green-600' : 'text-destructive'}>
                            {anthropicCredential.lastTestResult}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={anthropicCredential.isActive ? "default" : "secondary"}>
                        {anthropicCredential.isActive ? t('scoring.active') : t('scoring.inactive')}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testApiKeyMutation.mutate('anthropic')}
                        disabled={testApiKeyMutation.isPending}
                        data-testid="button-test-anthropic"
                      >
                        <TestTube className="w-4 h-4 me-2" />
                        {t('scoring.test')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteApiKeyMutation.mutate('anthropic')}
                        disabled={deleteApiKeyMutation.isPending}
                        data-testid="button-delete-anthropic"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <Label>{t('scoring.updateKey')}</Label>
                    <div className="flex gap-2 mt-2">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder="sk-ant-..."
                          value={newApiKey}
                          onChange={(e) => setNewApiKey(e.target.value)}
                          data-testid="input-new-api-key"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      <Button
                        onClick={() => saveApiKeyMutation.mutate({ provider: 'anthropic', apiKey: newApiKey })}
                        disabled={!newApiKey || saveApiKeyMutation.isPending}
                        data-testid="button-save-api-key"
                      >
                        <Save className="w-4 h-4 me-2" />
                        {t('scoring.update')}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                    {t('scoring.noAnthropicKey')}
                  </div>
                  <div>
                    <Label>{t('scoring.addAnthropicLabel')}</Label>
                    <div className="flex gap-2 mt-2">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder="sk-ant-..."
                          value={newApiKey}
                          onChange={(e) => setNewApiKey(e.target.value)}
                          data-testid="input-api-key"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      <Button
                        onClick={() => saveApiKeyMutation.mutate({ provider: 'anthropic', apiKey: newApiKey })}
                        disabled={!newApiKey || saveApiKeyMutation.isPending}
                        data-testid="button-add-api-key"
                      >
                        <Key className="w-4 h-4 me-2" />
                        {t('scoring.addKey')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('scoring.llmPrompts')}</CardTitle>
              <CardDescription>
                {t('scoring.llmPromptsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {promptsLoading ? (
                <div className="text-muted-foreground">{t('scoring.loadingPrompts')}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('scoring.promptName')}</TableHead>
                      <TableHead>{t('scoring.descriptionCol')}</TableHead>
                      <TableHead>{t('scoring.model')}</TableHead>
                      <TableHead>{t('scoring.status')}</TableHead>
                      <TableHead className="w-24">{t('scoring.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prompts?.map(prompt => (
                      <TableRow key={prompt.id}>
                        <TableCell className="font-medium">{prompt.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {prompt.description}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{prompt.model}</Badge>
                        </TableCell>
                        <TableCell>
                          {prompt.isActive ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">{t('scoring.active')}</Badge>
                          ) : (
                            <Badge variant="secondary">{t('scoring.inactive')}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPromptEditor(prompt)}
                            data-testid={`button-edit-prompt-${prompt.key}`}
                          >
                            {t('scoring.editPrompt')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('scoring.changeHistoryTitle')}</CardTitle>
              <CardDescription>
                {t('scoring.changeHistoryDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {changelogLoading ? (
                <div className="text-muted-foreground">{t('scoring.loadingHistory')}</div>
              ) : changelog?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{t('scoring.noChangesYet')}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('scoring.dateCol')}</TableHead>
                      <TableHead>{t('scoring.changeType')}</TableHead>
                      <TableHead>{t('scoring.entity')}</TableHead>
                      <TableHead>{t('scoring.changedBy')}</TableHead>
                      <TableHead>{t('scoring.descriptionCol')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changelog?.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.changeType.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{log.entityType}</TableCell>
                        <TableCell className="text-sm">
                          {log.changedByUser 
                            ? `${log.changedByUser.firstName || ''} ${log.changedByUser.lastName || ''} (${log.changedByUser.username})`
                            : log.changedBy
                          }
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {log.changeDescription || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isPromptModalOpen} onOpenChange={setIsPromptModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('scoring.editPromptModalTitle', { name: editingPrompt?.name })}</DialogTitle>
            <DialogDescription>{editingPrompt?.description}</DialogDescription>
          </DialogHeader>
          
          {editingPrompt && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{t('scoring.model')}</Label>
                  <Select
                    value={editingPrompt.model}
                    onValueChange={(v) => setEditingPrompt({ ...editingPrompt, model: v })}
                  >
                    <SelectTrigger data-testid="select-prompt-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude-sonnet-4-6">{t('scoring.claudeSonnet')}</SelectItem>
                      <SelectItem value="claude-haiku-4-5">{t('scoring.claudeHaiku')}</SelectItem>
                      <SelectItem value="claude-opus-4-6">{t('scoring.claudeOpus')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('scoring.maxTokens')}</Label>
                  <Input
                    type="number"
                    value={editingPrompt.maxTokens}
                    onChange={(e) => setEditingPrompt({ ...editingPrompt, maxTokens: parseInt(e.target.value) || 500 })}
                    data-testid="input-prompt-max-tokens"
                  />
                </div>
                <div>
                  <Label>{t('scoring.temperatureLabel')}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={editingPrompt.temperature}
                    onChange={(e) => setEditingPrompt({ ...editingPrompt, temperature: parseFloat(e.target.value) || 0.7 })}
                    data-testid="input-prompt-temperature"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={editingPrompt.isActive}
                  onCheckedChange={(v) => setEditingPrompt({ ...editingPrompt, isActive: v })}
                  data-testid="switch-prompt-active"
                />
                <Label>{t('scoring.activeLabel')}</Label>
              </div>

              <div>
                <Label>{t('scoring.systemPrompt')}</Label>
                <Textarea
                  value={editingPrompt.systemPrompt}
                  onChange={(e) => setEditingPrompt({ ...editingPrompt, systemPrompt: e.target.value })}
                  className="min-h-[100px] font-mono text-sm"
                  data-testid="textarea-system-prompt"
                />
              </div>

              <div>
                <Label>{t('scoring.userPrompt')}</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {t('scoring.availableVars', { vars: '{{careerTitle}}, {{overallScore}}, {{riasecTop3}}, {{cvqTop3}}, {{favoriteSubjects}}, {{gradeLevel}}, {{educationLevel}}, {{requiredSkills}}, {{relatedSubjects}}' })}
                </p>
                <Textarea
                  value={editingPrompt.userPromptTemplate}
                  onChange={(e) => setEditingPrompt({ ...editingPrompt, userPromptTemplate: e.target.value })}
                  className="min-h-[300px] font-mono text-sm"
                  data-testid="textarea-user-prompt"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPromptModalOpen(false)}>
              {t('scoring.cancel')}
            </Button>
            <Button 
              onClick={savePrompt}
              disabled={updatePromptMutation.isPending}
              data-testid="button-save-prompt"
            >
              <Save className="w-4 h-4 me-2" />
              {t('scoring.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
