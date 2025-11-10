import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Home, Plus, Download, Upload, Edit, Trash2, GraduationCap } from "lucide-react";

interface QuizQuestion {
  id: string;
  question: string;
  questionType: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  subject: string;
  gradeBand: string;
  countryId?: string;
  topic: string;
  difficulty: string;
  cognitiveLevel: string;
}

const SUBJECTS = ["Mathematics", "Science", "English", "Arabic", "Social Studies", "Computer Science"];
const GRADE_BANDS = ["8-9", "10-12"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const COGNITIVE_LEVELS = ["knowledge", "comprehension", "application", "analysis"];

const normalizeCountryId = (value: string): string | null => {
  return value === "all" ? null : value;
};

export default function Admin() {
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    countryId: "all",
    subject: "all",
    gradeBand: "all",
  });
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: questions = [], isLoading } = useQuery<QuizQuestion[]>({
    queryKey: ['/api/admin/questions', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.countryId && filters.countryId !== 'all') params.set('countryId', filters.countryId);
      if (filters.subject && filters.subject !== 'all') params.set('subject', filters.subject);
      if (filters.gradeBand && filters.gradeBand !== 'all') params.set('gradeBand', filters.gradeBand);
      const queryString = params.toString();
      const url = queryString ? `/api/admin/questions?${queryString}` : '/api/admin/questions';
      
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch questions');
      return res.json();
    },
    enabled: true,
  });

  const { data: countries = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/countries'],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/admin/questions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/questions'] });
      toast({ title: "Success", description: "Question deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete question", variant: "destructive" });
    },
  });

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const params = new URLSearchParams({
        format,
        ...filters,
      });
      window.location.href = `/api/admin/questions/export?${params.toString()}`;
      toast({ title: "Success", description: `Questions exported as ${format.toUpperCase()}` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to export questions", variant: "destructive" });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const questions = JSON.parse(text);
      
      await apiRequest('POST', '/api/admin/questions/bulk-upload', { questions });

      queryClient.invalidateQueries({ queryKey: ['/api/admin/questions'] });
      toast({ title: "Success", description: "Questions imported successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to import questions", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
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
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Super Admin Dashboard</h1>
          <p className="text-muted-foreground text-lg">Manage Quiz Question Bank</p>
        </div>

        <div className="mb-8 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="filter-country">Country</Label>
            <Select value={filters.countryId} onValueChange={(value) => setFilters(f => ({ ...f, countryId: value }))}>
              <SelectTrigger id="filter-country" data-testid="select-filter-country">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="filter-subject">Subject</Label>
            <Select value={filters.subject} onValueChange={(value) => setFilters(f => ({ ...f, subject: value }))}>
              <SelectTrigger id="filter-subject" data-testid="select-filter-subject">
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {SUBJECTS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="filter-grade">Grade Band</Label>
            <Select value={filters.gradeBand} onValueChange={(value) => setFilters(f => ({ ...f, gradeBand: value }))}>
              <SelectTrigger id="filter-grade" data-testid="select-filter-grade">
                <SelectValue placeholder="All Grades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grades</SelectItem>
                {GRADE_BANDS.map(g => (
                  <SelectItem key={g} value={g}>Grade {g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport('json')} data-testid="button-export-json">
              <Download className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
            <Button variant="outline" onClick={() => handleExport('csv')} data-testid="button-export-csv">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" asChild data-testid="button-import">
              <label>
                <Upload className="w-4 h-4 mr-2" />
                Import JSON
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>
            </Button>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-question">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Question
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <QuestionForm 
                  onSuccess={() => {
                    setIsCreateDialogOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['/api/admin/questions'] });
                  }}
                  countries={countries}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4">
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Loading questions...
              </CardContent>
            </Card>
          ) : questions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No questions found. Create your first question to get started.
              </CardContent>
            </Card>
          ) : (
            questions.map((question, index) => (
              <Card key={question.id} data-testid={`question-card-${index}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">{question.question}</CardTitle>
                      <CardDescription className="flex flex-wrap gap-2">
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
                          {question.subject}
                        </span>
                        <span className="bg-accent/50 px-2 py-1 rounded text-xs">
                          Grade {question.gradeBand}
                        </span>
                        <span className="bg-muted px-2 py-1 rounded text-xs">
                          {question.difficulty}
                        </span>
                        <span className="bg-muted px-2 py-1 rounded text-xs">
                          {question.topic}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Dialog open={isEditDialogOpen && editingQuestion?.id === question.id} onOpenChange={(open) => {
                        setIsEditDialogOpen(open);
                        if (!open) setEditingQuestion(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setEditingQuestion(question)}
                            data-testid={`button-edit-${index}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                          <QuestionForm 
                            question={editingQuestion || undefined}
                            onSuccess={() => {
                              setIsEditDialogOpen(false);
                              setEditingQuestion(null);
                              queryClient.invalidateQueries({ queryKey: ['/api/admin/questions'] });
                            }}
                            countries={countries}
                          />
                        </DialogContent>
                      </Dialog>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => deleteMutation.mutate(question.id)}
                        data-testid={`button-delete-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Options:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {question.options.map((option, i) => (
                        <li 
                          key={i}
                          className={option === question.correctAnswer ? "text-green-600 font-medium" : ""}
                        >
                          {option} {option === question.correctAnswer && "(Correct)"}
                        </li>
                      ))}
                    </ul>
                    {question.explanation && (
                      <div className="mt-3 p-3 bg-muted rounded">
                        <p className="text-sm font-medium mb-1">Explanation:</p>
                        <p className="text-sm text-muted-foreground">{question.explanation}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionForm({ 
  question, 
  onSuccess, 
  countries 
}: { 
  question?: QuizQuestion; 
  onSuccess: () => void;
  countries: Array<{ id: string; name: string }>;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    question: question?.question || "",
    questionType: question?.questionType || "multiple_choice",
    options: question?.options || ["", "", "", ""],
    correctAnswer: question?.correctAnswer || "",
    explanation: question?.explanation || "",
    subject: question?.subject || "",
    gradeBand: question?.gradeBand || "",
    countryId: question?.countryId || "all",
    topic: question?.topic || "",
    difficulty: question?.difficulty || "",
    cognitiveLevel: question?.cognitiveLevel || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const url = question 
        ? `/api/admin/questions/${question.id}`
        : '/api/admin/questions';
      const method = question ? 'PATCH' : 'POST';
      
      return apiRequest(method, url, {
        ...data,
        options: data.options.filter(o => o.trim()),
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: `Question ${question ? 'updated' : 'created'} successfully` });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Error", description: `Failed to ${question ? 'update' : 'create'} question`, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...formData,
      countryId: normalizeCountryId(formData.countryId),
    });
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData(f => ({ ...f, options: newOptions }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <DialogHeader>
        <DialogTitle>{question ? 'Edit' : 'Create'} Question</DialogTitle>
        <DialogDescription>
          {question ? 'Update' : 'Add'} a quiz question to the question bank
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="question">Question *</Label>
          <Textarea
            id="question"
            value={formData.question}
            onChange={(e) => setFormData(f => ({ ...f, question: e.target.value }))}
            required
            rows={3}
            data-testid="input-question"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Select value={formData.subject} onValueChange={(value) => setFormData(f => ({ ...f, subject: value }))} required>
              <SelectTrigger id="subject" data-testid="select-subject">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="gradeBand">Grade Band *</Label>
            <Select value={formData.gradeBand} onValueChange={(value) => setFormData(f => ({ ...f, gradeBand: value }))} required>
              <SelectTrigger id="gradeBand" data-testid="select-gradeBand">
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_BANDS.map(g => (
                  <SelectItem key={g} value={g}>Grade {g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="topic">Topic *</Label>
            <Input
              id="topic"
              value={formData.topic}
              onChange={(e) => setFormData(f => ({ ...f, topic: e.target.value }))}
              required
              data-testid="input-topic"
            />
          </div>

          <div>
            <Label htmlFor="countryId">Country</Label>
            <Select value={formData.countryId} onValueChange={(value) => setFormData(f => ({ ...f, countryId: value }))}>
              <SelectTrigger id="countryId" data-testid="select-countryId">
                <SelectValue placeholder="Global (All Countries)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Global (All Countries)</SelectItem>
                {countries.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="difficulty">Difficulty *</Label>
            <Select value={formData.difficulty} onValueChange={(value) => setFormData(f => ({ ...f, difficulty: value }))} required>
              <SelectTrigger id="difficulty" data-testid="select-difficulty">
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="cognitiveLevel">Cognitive Level *</Label>
            <Select value={formData.cognitiveLevel} onValueChange={(value) => setFormData(f => ({ ...f, cognitiveLevel: value }))} required>
              <SelectTrigger id="cognitiveLevel" data-testid="select-cognitiveLevel">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {COGNITIVE_LEVELS.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Options *</Label>
          <div className="space-y-2 mt-2">
            {formData.options.map((option, index) => (
              <Input
                key={index}
                value={option}
                onChange={(e) => updateOption(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                required={index < 2}
                data-testid={`input-option-${index}`}
              />
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="correctAnswer">Correct Answer *</Label>
          <Select value={formData.correctAnswer} onValueChange={(value) => setFormData(f => ({ ...f, correctAnswer: value }))} required>
            <SelectTrigger id="correctAnswer" data-testid="select-correctAnswer">
              <SelectValue placeholder="Select correct answer" />
            </SelectTrigger>
            <SelectContent>
              {formData.options.filter(o => o.trim()).map((option, index) => (
                <SelectItem key={index} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="explanation">Explanation</Label>
          <Textarea
            id="explanation"
            value={formData.explanation}
            onChange={(e) => setFormData(f => ({ ...f, explanation: e.target.value }))}
            rows={2}
            data-testid="input-explanation"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-question">
          {mutation.isPending ? "Saving..." : (question ? "Update" : "Create")}
        </Button>
      </div>
    </form>
  );
}
