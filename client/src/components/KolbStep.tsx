import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, ArrowLeft } from "lucide-react";

// Kolb Questions (imported from server/questionBanks/kolb.ts structure)
interface KolbQuestion {
  id: string;
  dimension: 'CE' | 'RO' | 'AC' | 'AE';
  text: string;
}

const kolbQuestions: KolbQuestion[] = [
  // Concrete Experience (CE)
  { id: 'ce1', dimension: 'CE', text: 'I learn best when I can observe real situations up close.' },
  { id: 'ce2', dimension: 'CE', text: 'I like to collect concrete examples before forming an opinion.' },
  { id: 'ce3', dimension: 'CE', text: 'Hands-on exposure helps me "get it" faster.' },
  { id: 'ce4', dimension: 'CE', text: 'I prefer stories and case studies to abstract descriptions.' },
  { id: 'ce5', dimension: 'CE', text: "I'm most confident after seeing it in action." },
  { id: 'ce6', dimension: 'CE', text: 'I feel lost when learning without practical context.' },
  
  // Reflective Observation (RO)
  { id: 'ro1', dimension: 'RO', text: 'I need quiet time to review what happened before deciding.' },
  { id: 'ro2', dimension: 'RO', text: 'I often journal or take notes to process experiences.' },
  { id: 'ro3', dimension: 'RO', text: 'I like to compare multiple perspectives before acting.' },
  { id: 'ro4', dimension: 'RO', text: 'I prefer to watch first, then try.' },
  { id: 'ro5', dimension: 'RO', text: 'I often ask clarifying questions before moving on.' },
  { id: 'ro6', dimension: 'RO', text: 'I look for patterns across different experiences.' },
  
  // Abstract Conceptualization (AC)
  { id: 'ac1', dimension: 'AC', text: 'I enjoy building models or frameworks to explain things.' },
  { id: 'ac2', dimension: 'AC', text: 'I feel confident when I can define the underlying principles.' },
  { id: 'ac3', dimension: 'AC', text: 'I often turn experiences into general rules.' },
  { id: 'ac4', dimension: 'AC', text: 'I prefer logic and structure over examples.' },
  { id: 'ac5', dimension: 'AC', text: 'I learn well from diagrams or formal explanations.' },
  { id: 'ac6', dimension: 'AC', text: 'I like to test an idea against a theory.' },
  
  // Active Experimentation (AE)
  { id: 'ae1', dimension: 'AE', text: 'I prefer to try things quickly rather than over-analyze.' },
  { id: 'ae2', dimension: 'AE', text: 'I like to run small experiments to learn what works.' },
  { id: 'ae3', dimension: 'AE', text: "I'm comfortable making changes on the fly." },
  { id: 'ae4', dimension: 'AE', text: 'I often propose pilots to move from talk to action.' },
  { id: 'ae5', dimension: 'AE', text: "I iterate publicly, even if it's not perfect." },
  { id: 'ae6', dimension: 'AE', text: 'I learn best when I can apply something immediately.' },
];

const likertOptions = [
  { value: "1", label: "Strongly Disagree" },
  { value: "2", label: "Disagree" },
  { value: "3", label: "Neutral" },
  { value: "4", label: "Agree" },
  { value: "5", label: "Strongly Agree" },
];

interface KolbStepProps {
  responses: Record<string, number>;
  onUpdate: (responses: Record<string, number>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function KolbStep({ responses, onUpdate, onNext, onBack }: KolbStepProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const questionsPerPage = 6;
  const totalPages = Math.ceil(kolbQuestions.length / questionsPerPage);
  
  const startIdx = currentPage * questionsPerPage;
  const endIdx = Math.min(startIdx + questionsPerPage, kolbQuestions.length);
  const currentQuestions = kolbQuestions.slice(startIdx, endIdx);

  const answeredCount = Object.keys(responses).length;
  const progressPercent = (answeredCount / kolbQuestions.length) * 100;
  
  const currentPageComplete = currentQuestions.every(q => responses[q.id]);
  const allQuestionsAnswered = answeredCount === kolbQuestions.length;

  const handleResponse = (questionId: string, value: string) => {
    onUpdate({
      ...responses,
      [questionId]: parseInt(value),
    });
  };

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    } else if (allQuestionsAnswered) {
      onNext();
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    } else {
      onBack();
    }
  };

  const getDimensionLabel = (dimension: string) => {
    const labels = {
      'CE': 'Concrete Experience (Learning through feeling)',
      'RO': 'Reflective Observation (Learning through watching)',
      'AC': 'Abstract Conceptualization (Learning through thinking)',
      'AE': 'Active Experimentation (Learning through doing)',
    };
    return labels[dimension as keyof typeof labels] || dimension;
  };

  const currentDimension = currentQuestions[0]?.dimension;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Discover Your Learning Style
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Based on Kolb's Experiential Learning Theory - answer honestly to get accurate insights
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>{answeredCount} of {kolbQuestions.length} answered</span>
          <span>Page {currentPage + 1} of {totalPages}</span>
        </div>
        <Progress value={progressPercent} className="h-2" data-testid="progress-kolb" />
      </div>

      {/* Dimension Label */}
      <Card className="p-4 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700">
        <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
          {getDimensionLabel(currentDimension)}
        </p>
      </Card>

      {/* Questions */}
      <div className="space-y-6">
        {currentQuestions.map((question, idx) => (
          <Card key={question.id} className="p-6" data-testid={`card-question-${question.id}`}>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-900 dark:text-purple-100 font-semibold">
                  {startIdx + idx + 1}
                </div>
                <Label className="text-base font-medium leading-relaxed pt-1">
                  {question.text}
                </Label>
              </div>

              <RadioGroup
                value={responses[question.id]?.toString() || ""}
                onValueChange={(value) => handleResponse(question.id, value)}
                className="space-y-2"
                data-testid={`radio-group-${question.id}`}
              >
                {likertOptions.map((option) => (
                  <div
                    key={option.value}
                    className="flex items-center space-x-2 p-3 rounded-lg hover-elevate active-elevate-2 border border-gray-200 dark:border-gray-700"
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={`${question.id}-${option.value}`}
                      data-testid={`radio-${question.id}-${option.value}`}
                    />
                    <Label
                      htmlFor={`${question.id}-${option.value}`}
                      className="flex-1 cursor-pointer"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </Card>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-4">
        <Button
          variant="outline"
          onClick={handlePrevPage}
          data-testid="button-kolb-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {currentPage === 0 ? "Back" : "Previous"}
        </Button>

        <Button
          onClick={handleNextPage}
          disabled={!currentPageComplete}
          className="bg-purple-600 hover:bg-purple-700"
          data-testid="button-kolb-next"
        >
          {currentPage === totalPages - 1 ? "Continue" : "Next"}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {!currentPageComplete && (
        <p className="text-sm text-center text-gray-500">
          Please answer all questions on this page to continue
        </p>
      )}
    </div>
  );
}
