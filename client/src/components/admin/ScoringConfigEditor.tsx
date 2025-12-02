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
import { 
  Settings, Save, RefreshCw, AlertTriangle, CheckCircle, 
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
      toast({ title: "Weights Updated", description: "Tier weights have been saved successfully" });
      setEditingTier(null);
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config/changelog'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update weights", variant: "destructive" });
    },
  });

  const updatePromptMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<LlmPromptTemplate> }) => {
      return apiRequest('PATCH', `/api/superadmin/llm-prompts/${data.id}`, data.updates);
    },
    onSuccess: () => {
      toast({ title: "Prompt Updated", description: "LLM prompt template has been saved" });
      setIsPromptModalOpen(false);
      setEditingPrompt(null);
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/llm-prompts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config/changelog'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update prompt", variant: "destructive" });
    },
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: async (data: { provider: string; apiKey: string }) => {
      return apiRequest('POST', '/api/superadmin/api-credentials', data);
    },
    onSuccess: () => {
      toast({ title: "API Key Saved", description: "OpenAI API key has been saved securely" });
      setNewApiKey("");
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/api-credentials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config/changelog'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save API key", variant: "destructive" });
    },
  });

  const testApiKeyMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await apiRequest('POST', `/api/superadmin/api-credentials/${provider}/test`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Test Passed", description: data.message });
      } else {
        toast({ title: "Test Failed", description: data.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/api-credentials'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to test API key", variant: "destructive" });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (provider: string) => {
      return apiRequest('DELETE', `/api/superadmin/api-credentials/${provider}`);
    },
    onSuccess: () => {
      toast({ title: "API Key Deleted", description: "API credential has been removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/api-credentials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/scoring-config/changelog'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete API key", variant: "destructive" });
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
        title: "Invalid Weights", 
        description: `Enabled weights must sum to 100%. Current: ${total}%`, 
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

  const openaiCredential = credentials?.find(c => c.provider === 'openai');

  return (
    <div className="space-y-6">
      <Tabs defaultValue="weights" className="space-y-4">
        <TabsList>
          <TabsTrigger value="weights" data-testid="tab-scoring-weights">
            <Settings className="w-4 h-4 mr-2" />
            Scoring Weights
          </TabsTrigger>
          <TabsTrigger value="llm" data-testid="tab-llm-config">
            <Sparkles className="w-4 h-4 mr-2" />
            LLM Configuration
          </TabsTrigger>
          <TabsTrigger value="prompts" data-testid="tab-prompts">
            <MessageSquare className="w-4 h-4 mr-2" />
            Prompt Templates
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-config-history">
            <History className="w-4 h-4 mr-2" />
            Change History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="weights" className="space-y-4">
          {configLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading configuration...</div>
          ) : (
            <>
              {configData && !configData.isValid && (
                <Card className="border-destructive">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-5 h-5" />
                      Configuration Errors
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
                            <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                          )}
                        </CardTitle>
                        <CardDescription>{tier.description}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingTier === tier.key ? (
                          <>
                            <div className={`text-sm font-medium ${Math.abs(calculateTotalWeight(tier.key) - 100) < 0.01 ? 'text-green-600' : 'text-destructive'}`}>
                              Total: {calculateTotalWeight(tier.key)}%
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingTier(null)}
                              data-testid={`button-cancel-${tier.key}`}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveWeights(tier.key)}
                              disabled={updateWeightsMutation.isPending}
                              data-testid={`button-save-${tier.key}`}
                            >
                              <Save className="w-4 h-4 mr-2" />
                              Save
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className={`text-sm font-medium ${tier.totalWeight === 100 ? 'text-green-600' : 'text-destructive'}`}>
                              Total: {tier.totalWeight}%
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditingTier(tier)}
                              data-testid={`button-edit-${tier.key}`}
                            >
                              Edit Weights
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
                          <TableHead>Component</TableHead>
                          <TableHead className="w-24">Enabled</TableHead>
                          <TableHead className="w-48">Weight</TableHead>
                          <TableHead className="w-20 text-right">%</TableHead>
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
                OpenAI API Key
              </CardTitle>
              <CardDescription>
                Configure your OpenAI API key for generating personalized premium report narratives.
                The key is stored securely and used for Education Pathways recommendations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {credentialsLoading ? (
                <div className="text-muted-foreground">Loading...</div>
              ) : openaiCredential ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">OpenAI</div>
                      <div className="text-sm text-muted-foreground font-mono">
                        {openaiCredential.apiKeyMasked || 'Key configured'}
                      </div>
                      {openaiCredential.lastTestedAt && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Last tested: {new Date(openaiCredential.lastTestedAt).toLocaleString()}
                          {' - '}
                          <span className={openaiCredential.lastTestResult === 'success' ? 'text-green-600' : 'text-destructive'}>
                            {openaiCredential.lastTestResult}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={openaiCredential.isActive ? "default" : "secondary"}>
                        {openaiCredential.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testApiKeyMutation.mutate('openai')}
                        disabled={testApiKeyMutation.isPending}
                        data-testid="button-test-openai"
                      >
                        <TestTube className="w-4 h-4 mr-2" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteApiKeyMutation.mutate('openai')}
                        disabled={deleteApiKeyMutation.isPending}
                        data-testid="button-delete-openai"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <Label>Update API Key</Label>
                    <div className="flex gap-2 mt-2">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder="sk-..."
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
                        onClick={() => saveApiKeyMutation.mutate({ provider: 'openai', apiKey: newApiKey })}
                        disabled={!newApiKey || saveApiKeyMutation.isPending}
                        data-testid="button-save-api-key"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Update
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                    No OpenAI API key configured. Premium report narratives will not be generated.
                  </div>
                  <div>
                    <Label>Add OpenAI API Key</Label>
                    <div className="flex gap-2 mt-2">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder="sk-..."
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
                        onClick={() => saveApiKeyMutation.mutate({ provider: 'openai', apiKey: newApiKey })}
                        disabled={!newApiKey || saveApiKeyMutation.isPending}
                        data-testid="button-add-api-key"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        Add Key
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
              <CardTitle>LLM Prompt Templates</CardTitle>
              <CardDescription>
                Configure the prompts used to generate personalized premium report content.
                Use template variables like {"{{careerTitle}}"}, {"{{learningStyle}}"}, etc.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {promptsLoading ? (
                <div className="text-muted-foreground">Loading prompts...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
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
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPromptEditor(prompt)}
                            data-testid={`button-edit-prompt-${prompt.key}`}
                          >
                            Edit
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
              <CardTitle>Configuration Change History</CardTitle>
              <CardDescription>
                Audit log of all changes made to scoring methodology and LLM configuration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {changelogLoading ? (
                <div className="text-muted-foreground">Loading history...</div>
              ) : changelog?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No changes recorded yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Change Type</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Changed By</TableHead>
                      <TableHead>Description</TableHead>
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
            <DialogTitle>Edit Prompt Template: {editingPrompt?.name}</DialogTitle>
            <DialogDescription>{editingPrompt?.description}</DialogDescription>
          </DialogHeader>
          
          {editingPrompt && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Model</Label>
                  <Select
                    value={editingPrompt.model}
                    onValueChange={(v) => setEditingPrompt({ ...editingPrompt, model: v })}
                  >
                    <SelectTrigger data-testid="select-prompt-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    value={editingPrompt.maxTokens}
                    onChange={(e) => setEditingPrompt({ ...editingPrompt, maxTokens: parseInt(e.target.value) || 500 })}
                    data-testid="input-prompt-max-tokens"
                  />
                </div>
                <div>
                  <Label>Temperature (0-1)</Label>
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
                <Label>Active</Label>
              </div>

              <div>
                <Label>System Prompt</Label>
                <Textarea
                  value={editingPrompt.systemPrompt}
                  onChange={(e) => setEditingPrompt({ ...editingPrompt, systemPrompt: e.target.value })}
                  className="min-h-[100px] font-mono text-sm"
                  data-testid="textarea-system-prompt"
                />
              </div>

              <div>
                <Label>User Prompt Template</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Available variables: {"{{careerTitle}}, {{overallScore}}, {{learningStyle}}, {{riasecTop3}}, {{cvqTop3}}, {{favoriteSubjects}}, {{gradeLevel}}, {{educationLevel}}, {{requiredSkills}}, {{relatedSubjects}}"}
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
              Cancel
            </Button>
            <Button 
              onClick={savePrompt}
              disabled={updatePromptMutation.isPending}
              data-testid="button-save-prompt"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
