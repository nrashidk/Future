import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { StickyNote } from "@/components/StickyNote";
import { 
  Gift, Plus, Send, Clock, CheckCircle, XCircle, 
  AlertCircle, Trash2, Edit, HelpCircle, Star,
  TrendingUp, Calendar, Upload, FileText, Download
} from "lucide-react";

interface CreditBalance {
  rewardCredits: number;
  pendingRewardCredits: number;
  rewardCreditsUsed: number;
  availableCredits: number;
  yearlyCreditsEarned: number;
  yearlyCreditsRemaining: number;
  questionsPerCredit: number;
  maxYearlyCredits: number;
  currentYear: number;
  approvedUnallocatedCount: number;
  stats: {
    totalSubmissions: number;
    pendingSubmissions: number;
    totalApproved: number;
    totalCreditsEarned: number;
  };
}

interface Submission {
  id: string;
  countryId: string;
  countryName?: string;
  curriculum: string;
  subject: string;
  grade: number;
  status: "pending" | "llm_verified" | "in_review" | "approved" | "rejected" | "needs_changes";
  questionCount: number;
  approvedCount: number;
  creditsAwarded: number;
  reviewerFeedback?: string;
  createdAt: string;
  reviewedAt?: string;
  llmVerificationScore?: number;
}

interface Country {
  id: string;
  name: string;
  curricula: string[] | null;
  subjects: string[] | null;
  gradeLevels: string[] | null;
}

interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  cognitiveLevel: "knowledge" | "comprehension" | "application" | "analysis";
}

const COGNITIVE_LEVELS = [
  { value: "knowledge", label: "Knowledge (Recall facts)" },
  { value: "comprehension", label: "Comprehension (Understand concepts)" },
  { value: "application", label: "Application (Use in new situations)" },
  { value: "analysis", label: "Analysis (Break down complex ideas)" },
];

const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending Review</Badge>;
    case "llm_verified":
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200"><CheckCircle className="w-3 h-3 mr-1" />Quality Checked</Badge>;
    case "in_review":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><HelpCircle className="w-3 h-3 mr-1" />In Review</Badge>;
    case "approved":
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
    case "needs_changes":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><AlertCircle className="w-3 h-3 mr-1" />Needs Changes</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function ContributeQuestions() {
  const { toast } = useToast();
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question>({
    question: "",
    options: ["", "", "", ""],
    correctAnswer: "",
    explanation: "",
    topic: "",
    difficulty: "medium",
    cognitiveLevel: "comprehension",
  });
  const [submissionConfig, setSubmissionConfig] = useState({
    countryId: "",
    curriculum: "",
    subject: "",
    grade: 9,
  });

  const { data: balance, isLoading: balanceLoading } = useQuery<CreditBalance>({
    queryKey: ['/api/contributions/balance'],
  });

  const { data: submissions = [], isLoading: submissionsLoading } = useQuery<Submission[]>({
    queryKey: ['/api/contributions/submissions'],
  });

  // Use public countries endpoint (accessible to all users including org_admins)
  const { data: countries = [] } = useQuery<Country[]>({
    queryKey: ['/api/countries'],
  });

  const selectedCountry = countries.find(c => c.id === submissionConfig.countryId);

  // Fetch curriculum-specific subjects when country and curriculum are selected
  const { data: curriculumSubjects = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/countries', submissionConfig.countryId, 'curricula', submissionConfig.curriculum, 'subjects'],
    enabled: !!submissionConfig.countryId && !!submissionConfig.curriculum,
  });

  // CSV Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvQuestions, setCsvQuestions] = useState<Question[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [isParsingCsv, setIsParsingCsv] = useState(false);
  const [submissionMode, setSubmissionMode] = useState<"manual" | "csv">("manual");

  const submitMutation = useMutation({
    mutationFn: async (data: { countryId: string; curriculum: string; subject: string; grade: number; questions: Question[] }) => {
      return apiRequest('POST', '/api/contributions/submit', data);
    },
    onSuccess: () => {
      toast({
        title: "Questions Submitted",
        description: "Your questions have been submitted for review. You'll be notified when they're reviewed.",
      });
      setIsSubmitDialogOpen(false);
      setQuestions([]);
      setCsvQuestions([]);
      setCsvErrors([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setCurrentQuestion({
        question: "",
        options: ["", "", "", ""],
        correctAnswer: "",
        explanation: "",
        topic: "",
        difficulty: "medium",
        cognitiveLevel: "comprehension",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/submissions'] });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit questions. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addQuestion = () => {
    if (!currentQuestion.question.trim()) {
      toast({ title: "Please enter a question", variant: "destructive" });
      return;
    }
    if (currentQuestion.options.some(o => !o.trim())) {
      toast({ title: "Please fill in all 4 options", variant: "destructive" });
      return;
    }
    if (!currentQuestion.correctAnswer.trim()) {
      toast({ title: "Please enter the correct answer", variant: "destructive" });
      return;
    }
    if (!currentQuestion.topic.trim()) {
      toast({ title: "Please enter a topic", variant: "destructive" });
      return;
    }

    setQuestions([...questions, currentQuestion]);
    setCurrentQuestion({
      question: "",
      options: ["", "", "", ""],
      correctAnswer: "",
      explanation: "",
      topic: "",
      difficulty: "medium",
      cognitiveLevel: "comprehension",
    });
    toast({ title: "Question added", description: `${questions.length + 1} question(s) ready for submission` });
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const questionsToSubmit = submissionMode === "csv" ? csvQuestions : questions;
    
    if (questionsToSubmit.length === 0) {
      toast({ title: "Add at least one question", variant: "destructive" });
      return;
    }
    if (!submissionConfig.countryId || !submissionConfig.curriculum || !submissionConfig.subject) {
      toast({ title: "Please select country, curriculum and subject", variant: "destructive" });
      return;
    }

    submitMutation.mutate({
      ...submissionConfig,
      questions: questionsToSubmit,
    });
  };

  // CSV Parsing function
  const parseCsvFile = (file: File) => {
    setIsParsingCsv(true);
    setCsvErrors([]);
    setCsvQuestions([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          setCsvErrors(["CSV file must have a header row and at least one data row"]);
          setIsParsingCsv(false);
          return;
        }

        // Parse header (case-insensitive)
        const headerLine = lines[0];
        const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        
        // Required columns
        const requiredColumns = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'topic'];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));
        
        if (missingColumns.length > 0) {
          setCsvErrors([`Missing required columns: ${missingColumns.join(', ')}`]);
          setIsParsingCsv(false);
          return;
        }

        const parsedQuestions: Question[] = [];
        const errors: string[] = [];

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Handle CSV with quoted fields
          const values: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim().replace(/^"|"$/g, ''));
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim().replace(/^"|"$/g, ''));

          // Map values to headers
          const row: Record<string, string> = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
          });

          // Validate row
          const question = row['question'];
          const optionA = row['option_a'];
          const optionB = row['option_b'];
          const optionC = row['option_c'];
          const optionD = row['option_d'];
          const correctAnswer = row['correct_answer'];
          const topic = row['topic'];
          const difficulty = row['difficulty'] || 'medium';
          const cognitiveLevel = row['cognitive_level'] || 'comprehension';
          const explanation = row['explanation'] || '';

          if (!question) {
            errors.push(`Row ${i + 1}: Missing question text`);
            continue;
          }
          if (!optionA || !optionB || !optionC || !optionD) {
            errors.push(`Row ${i + 1}: Missing one or more options`);
            continue;
          }
          if (!correctAnswer) {
            errors.push(`Row ${i + 1}: Missing correct answer`);
            continue;
          }
          if (!topic) {
            errors.push(`Row ${i + 1}: Missing topic`);
            continue;
          }

          // Validate correct answer matches one of the options
          const options = [optionA, optionB, optionC, optionD];
          if (!options.includes(correctAnswer)) {
            errors.push(`Row ${i + 1}: Correct answer doesn't match any option`);
            continue;
          }

          // Validate difficulty
          const validDifficulties = ['easy', 'medium', 'hard'];
          const normalizedDifficulty = validDifficulties.includes(difficulty.toLowerCase()) 
            ? difficulty.toLowerCase() as "easy" | "medium" | "hard"
            : 'medium';

          // Validate cognitive level
          const validCognitiveLevels = ['knowledge', 'comprehension', 'application', 'analysis'];
          const normalizedCognitiveLevel = validCognitiveLevels.includes(cognitiveLevel.toLowerCase())
            ? cognitiveLevel.toLowerCase() as "knowledge" | "comprehension" | "application" | "analysis"
            : 'comprehension';

          parsedQuestions.push({
            question,
            options,
            correctAnswer,
            topic,
            difficulty: normalizedDifficulty,
            cognitiveLevel: normalizedCognitiveLevel,
            explanation,
          });
        }

        setCsvQuestions(parsedQuestions);
        setCsvErrors(errors);
        
        if (parsedQuestions.length > 0) {
          toast({
            title: "CSV Parsed Successfully",
            description: `${parsedQuestions.length} question(s) ready for submission${errors.length > 0 ? `, ${errors.length} row(s) skipped` : ''}`,
          });
        } else {
          toast({
            title: "No Valid Questions Found",
            description: "Please check the CSV format and try again",
            variant: "destructive",
          });
        }
      } catch (error) {
        setCsvErrors(["Failed to parse CSV file. Please check the format."]);
      }
      setIsParsingCsv(false);
    };
    
    reader.onerror = () => {
      setCsvErrors(["Failed to read CSV file"]);
      setIsParsingCsv(false);
    };
    
    reader.readAsText(file);
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast({ title: "Please upload a CSV file", variant: "destructive" });
        return;
      }
      parseCsvFile(file);
    }
  };

  const downloadCsvTemplate = () => {
    const template = `question,option_a,option_b,option_c,option_d,correct_answer,topic,difficulty,cognitive_level,explanation
"What is 2 + 2?","3","4","5","6","4","Basic Arithmetic","easy","knowledge","The sum of 2 and 2 equals 4"
"Which planet is closest to the Sun?","Venus","Mercury","Mars","Earth","Mercury","Solar System","medium","comprehension","Mercury is the first planet from the Sun"`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearCsvData = () => {
    setCsvQuestions([]);
    setCsvErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const yearlyProgress = balance ? (balance.yearlyCreditsEarned / balance.maxYearlyCredits) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StickyNote color="green" rotation="1" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-5 h-5 text-green-600" />
            <span className="text-sm text-muted-foreground">Available Credits</span>
          </div>
          <p className="text-3xl font-bold">{balance?.availableCredits ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Free assessments to use</p>
        </StickyNote>

        <StickyNote color="blue" rotation="-1" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-muted-foreground">Pending Rewards</span>
          </div>
          <p className="text-3xl font-bold">{balance?.pendingRewardCredits ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Waiting for allocation</p>
        </StickyNote>

        <StickyNote color="yellow" rotation="2" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-yellow-600" />
            <span className="text-sm text-muted-foreground">Approved Questions</span>
          </div>
          <p className="text-3xl font-bold">{balance?.stats.totalApproved ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Questions added to system</p>
        </StickyNote>

        <StickyNote color="pink" rotation="-2" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-pink-600" />
            <span className="text-sm text-muted-foreground">Pending Review</span>
          </div>
          <p className="text-3xl font-bold">{balance?.stats.pendingSubmissions ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Submissions awaiting review</p>
        </StickyNote>
      </div>

      {/* Pending rewards notification */}
      {(balance?.pendingRewardCredits ?? 0) > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <div>
                <p className="font-medium text-orange-700">Rewards Pending Allocation</p>
                <p className="text-sm text-orange-600">
                  Your school has {balance?.pendingRewardCredits} credits approved and waiting for allocation by an administrator.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {balance?.currentYear ?? new Date().getFullYear()} Progress
              </CardTitle>
              <CardDescription>
                {balance?.questionsPerCredit ?? 5} approved questions = 1 free assessment credit
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">
              <Calendar className="w-3 h-3 mr-1" />
              {balance?.yearlyCreditsEarned ?? 0} / {balance?.maxYearlyCredits ?? 50} credits this year
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={yearlyProgress} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {balance?.yearlyCreditsRemaining ?? 50} credits remaining this year
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle>Contribute Questions</CardTitle>
              <CardDescription>
                Submit curriculum-aligned quiz questions to earn free assessment credits
              </CardDescription>
            </div>
            <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
              <Button onClick={() => setIsSubmitDialogOpen(true)} data-testid="button-new-submission">
                <Plus className="w-4 h-4 mr-2" />
                New Submission
              </Button>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Submit Quiz Questions</DialogTitle>
                  <DialogDescription>
                    Add questions that match your school's curriculum. Each 5 approved questions = 1 free assessment credit.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  {/* Configuration Selects - shared between manual and CSV modes */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Select
                        value={submissionConfig.countryId}
                        onValueChange={(v) => setSubmissionConfig({...submissionConfig, countryId: v, curriculum: "", subject: ""})}
                      >
                        <SelectTrigger data-testid="select-country">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          {countries.map((country) => (
                            <SelectItem key={country.id} value={country.id}>{country.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Curriculum</Label>
                      <Select
                        value={submissionConfig.curriculum}
                        onValueChange={(v) => setSubmissionConfig({...submissionConfig, curriculum: v, subject: ""})}
                        disabled={!selectedCountry}
                      >
                        <SelectTrigger data-testid="select-curriculum">
                          <SelectValue placeholder="Select curriculum" />
                        </SelectTrigger>
                        <SelectContent>
                          {(selectedCountry?.curricula || []).map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Select
                        value={submissionConfig.subject}
                        onValueChange={(v) => setSubmissionConfig({...submissionConfig, subject: v})}
                        disabled={!submissionConfig.curriculum}
                      >
                        <SelectTrigger data-testid="select-subject">
                          <SelectValue placeholder="Select subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {curriculumSubjects.length > 0 
                            ? curriculumSubjects.map((s) => (
                                <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                              ))
                            : (selectedCountry?.subjects || []).map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))
                          }
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Grade</Label>
                      <Select
                        value={String(submissionConfig.grade)}
                        onValueChange={(v) => setSubmissionConfig({...submissionConfig, grade: parseInt(v)})}
                      >
                        <SelectTrigger data-testid="select-grade">
                          <SelectValue placeholder="Select grade" />
                        </SelectTrigger>
                        <SelectContent>
                          {[8, 9, 10, 11, 12].map((g) => (
                            <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Tabs for Manual vs CSV Upload */}
                  <Tabs 
                    value={submissionMode} 
                    onValueChange={(v) => {
                      const newMode = v as "manual" | "csv";
                      setSubmissionMode(newMode);
                      // Clear data when switching modes to prevent confusion
                      if (newMode === "manual") {
                        setCsvQuestions([]);
                        setCsvErrors([]);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      } else {
                        setQuestions([]);
                      }
                    }} 
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="manual" data-testid="tab-manual-entry">
                        <Edit className="w-4 h-4 mr-2" />
                        Manual Entry
                      </TabsTrigger>
                      <TabsTrigger value="csv" data-testid="tab-csv-upload">
                        <Upload className="w-4 h-4 mr-2" />
                        CSV Bulk Upload
                      </TabsTrigger>
                    </TabsList>

                    {/* Manual Entry Tab */}
                    <TabsContent value="manual" className="mt-4">
                      <div className="border rounded-lg p-4 space-y-4">
                        <h4 className="font-medium">Add Question</h4>
                    
                    <div className="space-y-2">
                      <Label>Question Text</Label>
                      <Textarea
                        placeholder="Enter your question..."
                        value={currentQuestion.question}
                        onChange={(e) => setCurrentQuestion({...currentQuestion, question: e.target.value})}
                        className="min-h-[80px]"
                        data-testid="input-question-text"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="space-y-2">
                          <Label>Option {String.fromCharCode(65 + i)}</Label>
                          <Input
                            placeholder={`Option ${String.fromCharCode(65 + i)}`}
                            value={currentQuestion.options[i]}
                            onChange={(e) => {
                              const newOptions = [...currentQuestion.options];
                              newOptions[i] = e.target.value;
                              setCurrentQuestion({...currentQuestion, options: newOptions});
                            }}
                            data-testid={`input-option-${i}`}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Correct Answer</Label>
                        <Select
                          value={currentQuestion.correctAnswer}
                          onValueChange={(v) => setCurrentQuestion({...currentQuestion, correctAnswer: v})}
                        >
                          <SelectTrigger data-testid="select-correct-answer">
                            <SelectValue placeholder="Select correct answer" />
                          </SelectTrigger>
                          <SelectContent>
                            {currentQuestion.options.filter(o => o.trim()).map((opt, i) => (
                              <SelectItem key={i} value={opt}>
                                {String.fromCharCode(65 + i)}: {opt.substring(0, 50)}{opt.length > 50 ? '...' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Topic</Label>
                        <Input
                          placeholder="e.g., Algebra, Photosynthesis"
                          value={currentQuestion.topic}
                          onChange={(e) => setCurrentQuestion({...currentQuestion, topic: e.target.value})}
                          data-testid="input-topic"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Difficulty</Label>
                        <Select
                          value={currentQuestion.difficulty}
                          onValueChange={(v) => setCurrentQuestion({...currentQuestion, difficulty: v as any})}
                        >
                          <SelectTrigger data-testid="select-difficulty">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DIFFICULTIES.map((d) => (
                              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Cognitive Level</Label>
                        <Select
                          value={currentQuestion.cognitiveLevel}
                          onValueChange={(v) => setCurrentQuestion({...currentQuestion, cognitiveLevel: v as any})}
                        >
                          <SelectTrigger data-testid="select-cognitive-level">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COGNITIVE_LEVELS.map((c) => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Explanation (Optional)</Label>
                      <Textarea
                        placeholder="Explain why this is the correct answer..."
                        value={currentQuestion.explanation}
                        onChange={(e) => setCurrentQuestion({...currentQuestion, explanation: e.target.value})}
                        data-testid="input-explanation"
                      />
                    </div>

                        <Button onClick={addQuestion} variant="outline" className="w-full" data-testid="button-add-question">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Question to Submission ({questions.length} added)
                        </Button>
                      </div>

                      {questions.length > 0 && (
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium mb-3">Questions to Submit ({questions.length})</h4>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {questions.map((q, i) => (
                              <div key={i} className="flex items-center justify-between p-2 bg-muted rounded">
                                <div className="flex-1 mr-2">
                                  <p className="text-sm font-medium truncate">{i + 1}. {q.question}</p>
                                  <p className="text-xs text-muted-foreground">{q.topic} • {q.difficulty} • {q.cognitiveLevel}</p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeQuestion(i)}
                                  data-testid={`button-remove-question-${i}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* CSV Upload Tab */}
                    <TabsContent value="csv" className="mt-4 space-y-4">
                      <div className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div>
                            <h4 className="font-medium">Bulk Upload Questions</h4>
                            <p className="text-sm text-muted-foreground">Upload a CSV file with multiple questions at once</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={downloadCsvTemplate} data-testid="button-download-template">
                            <Download className="w-4 h-4 mr-2" />
                            Download Template
                          </Button>
                        </div>

                        <div className="border-2 border-dashed rounded-lg p-6 text-center">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleCsvUpload}
                            className="hidden"
                            data-testid="input-csv-file"
                          />
                          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-sm text-muted-foreground mb-4">
                            Upload a CSV file with columns: question, option_a, option_b, option_c, option_d, correct_answer, topic
                          </p>
                          <Button 
                            variant="outline" 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isParsingCsv}
                            data-testid="button-upload-csv"
                          >
                            {isParsingCsv ? (
                              "Parsing..."
                            ) : (
                              <>
                                <Upload className="w-4 h-4 mr-2" />
                                Select CSV File
                              </>
                            )}
                          </Button>
                        </div>

                        {/* CSV Errors */}
                        {csvErrors.length > 0 && (
                          <div className="border border-destructive/50 rounded-lg p-3 bg-destructive/10">
                            <h5 className="font-medium text-destructive mb-2 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              Issues Found ({csvErrors.length})
                            </h5>
                            <ul className="text-sm text-destructive space-y-1 max-h-32 overflow-y-auto">
                              {csvErrors.slice(0, 10).map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                              {csvErrors.length > 10 && (
                                <li className="font-medium">...and {csvErrors.length - 10} more issues</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* CSV Questions Preview */}
                      {csvQuestions.length > 0 && (
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium">Parsed Questions ({csvQuestions.length})</h4>
                            <Button variant="ghost" size="sm" onClick={clearCsvData} data-testid="button-clear-csv">
                              <Trash2 className="w-4 h-4 mr-1" />
                              Clear
                            </Button>
                          </div>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {csvQuestions.map((q, i) => (
                              <div key={i} className="flex items-center justify-between p-2 bg-muted rounded">
                                <div className="flex-1 mr-2">
                                  <p className="text-sm font-medium truncate">{i + 1}. {q.question}</p>
                                  <p className="text-xs text-muted-foreground">{q.topic} • {q.difficulty} • {q.cognitiveLevel}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={(submissionMode === "manual" ? questions.length === 0 : csvQuestions.length === 0) || submitMutation.isPending}
                    data-testid="button-submit-questions"
                  >
                    {submitMutation.isPending ? (
                      "Submitting..."
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Submit {submissionMode === "manual" ? questions.length : csvQuestions.length} Question{(submissionMode === "manual" ? questions.length : csvQuestions.length) !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {submissionsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading submissions...</p>
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-8">
              <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No submissions yet</p>
              <p className="text-sm text-muted-foreground">Submit quiz questions to earn free assessment credits</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((sub) => (
                  <TableRow key={sub.id} data-testid={`row-submission-${sub.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{sub.subject}</p>
                        <p className="text-xs text-muted-foreground">{sub.curriculum}</p>
                      </div>
                    </TableCell>
                    <TableCell>Grade {sub.grade}</TableCell>
                    <TableCell>
                      {sub.status === 'approved' ? (
                        <span className="text-green-600">{sub.approvedCount}/{sub.questionCount}</span>
                      ) : (
                        sub.questionCount
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(sub.status)}</TableCell>
                    <TableCell>
                      {sub.creditsAwarded > 0 && (
                        <Badge className="bg-green-500">+{sub.creditsAwarded}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
