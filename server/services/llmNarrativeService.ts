/**
 * LLM Narrative Service
 * 
 * Generates personalized premium report narratives using OpenAI API.
 * Supports configurable prompts and multiple narrative types.
 */

import type { IStorage } from "../storage";
import type { Assessment, Career, LlmPromptTemplate } from "../../shared/schema";

interface StudentContext {
  gradeLevel: string;
  favoriteSubjects: string[];
  learningStyle: string;
  riasecTop3: string[];
  cvqTop3: string[];
  overallScore: number;
}

interface CareerContext {
  title: string;
  category: string;
  description: string;
  educationLevel: string;
  requiredSkills: string[];
  relatedSubjects: string[];
  salaryRange: string;
}

interface NarrativeResult {
  success: boolean;
  narrative?: string;
  error?: string;
  promptKey: string;
  model: string;
  tokensUsed?: number;
}

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 1000;
const DEFAULT_TEMPERATURE = 0.7;

/**
 * Replace template variables with actual values
 */
function replaceTemplateVariables(
  template: string,
  studentContext: StudentContext,
  careerContext: CareerContext
): string {
  return template
    .replace(/\{\{gradeLevel\}\}/g, studentContext.gradeLevel)
    .replace(/\{\{favoriteSubjects\}\}/g, studentContext.favoriteSubjects.join(", "))
    .replace(/\{\{learningStyle\}\}/g, studentContext.learningStyle)
    .replace(/\{\{riasecTop3\}\}/g, studentContext.riasecTop3.join(", "))
    .replace(/\{\{cvqTop3\}\}/g, studentContext.cvqTop3.join(", "))
    .replace(/\{\{overallScore\}\}/g, studentContext.overallScore.toString())
    .replace(/\{\{careerTitle\}\}/g, careerContext.title)
    .replace(/\{\{careerCategory\}\}/g, careerContext.category)
    .replace(/\{\{careerDescription\}\}/g, careerContext.description)
    .replace(/\{\{educationLevel\}\}/g, careerContext.educationLevel)
    .replace(/\{\{requiredSkills\}\}/g, careerContext.requiredSkills.join(", "))
    .replace(/\{\{relatedSubjects\}\}/g, careerContext.relatedSubjects.join(", "))
    .replace(/\{\{salaryRange\}\}/g, careerContext.salaryRange);
}

/**
 * Call OpenAI API to generate narrative
 */
async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `OpenAI API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const tokensUsed = data.usage?.total_tokens || 0;

  return { content, tokensUsed };
}

/**
 * Generate a narrative for a specific prompt template
 */
export async function generateNarrative(
  storage: IStorage,
  promptKey: string,
  studentContext: StudentContext,
  careerContext: CareerContext
): Promise<NarrativeResult> {
  try {
    // Get the OpenAI API key
    const credential = await storage.getApiCredential("openai");
    if (!credential || !credential.apiKey || !credential.isActive) {
      return {
        success: false,
        error: "OpenAI API key not configured or inactive",
        promptKey,
        model: DEFAULT_MODEL,
      };
    }

    // Get the prompt template
    const template = await storage.getLlmPromptTemplateByKey(promptKey);
    if (!template || !template.isActive) {
      return {
        success: false,
        error: `Prompt template "${promptKey}" not found or inactive`,
        promptKey,
        model: DEFAULT_MODEL,
      };
    }

    // Replace template variables
    const userPrompt = replaceTemplateVariables(
      template.userPromptTemplate,
      studentContext,
      careerContext
    );

    // Call OpenAI
    const { content, tokensUsed } = await callOpenAI(
      credential.apiKey,
      template.systemPrompt,
      userPrompt,
      template.model || DEFAULT_MODEL,
      template.maxTokens || DEFAULT_MAX_TOKENS,
      template.temperature ?? DEFAULT_TEMPERATURE
    );

    return {
      success: true,
      narrative: content,
      promptKey,
      model: template.model || DEFAULT_MODEL,
      tokensUsed,
    };
  } catch (error) {
    console.error(`[LLM] Error generating narrative for ${promptKey}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      promptKey,
      model: DEFAULT_MODEL,
    };
  }
}

/**
 * Generate "Why This Career?" narrative for premium reports
 */
export async function generateCareerReasoningNarrative(
  storage: IStorage,
  assessment: Assessment,
  career: Career,
  overallScore: number
): Promise<NarrativeResult> {
  const studentContext = buildStudentContext(assessment, overallScore);
  const careerContext = buildCareerContext(career);

  return generateNarrative(storage, "career_reasoning", studentContext, careerContext);
}

/**
 * Generate "Education Pathways" narrative for premium reports
 */
export async function generateEducationPathwaysNarrative(
  storage: IStorage,
  assessment: Assessment,
  career: Career,
  overallScore: number
): Promise<NarrativeResult> {
  const studentContext = buildStudentContext(assessment, overallScore);
  const careerContext = buildCareerContext(career);

  return generateNarrative(storage, "education_pathways", studentContext, careerContext);
}

/**
 * Build student context from assessment data
 */
function buildStudentContext(assessment: Assessment, overallScore: number): StudentContext {
  const learningStyleData = assessment.kolbScores as any;
  const riasecData = assessment.riasecScores as any;
  const cvqData = assessment.cvqScores as any;
  const assessmentData = assessment as any;

  // Extract learning style
  let learningStyle = "Not assessed";
  if (learningStyleData?.learningStyle) {
    learningStyle = learningStyleData.learningStyle;
  }

  // Extract top RIASEC themes
  let riasecTop3: string[] = [];
  if (riasecData?.top3) {
    riasecTop3 = riasecData.top3;
  } else if (riasecData?.ranking) {
    riasecTop3 = riasecData.ranking.slice(0, 3).map((r: any) => r.code);
  }

  // Extract top CVQ values
  let cvqTop3: string[] = [];
  if (cvqData?.ranking) {
    cvqTop3 = cvqData.ranking.slice(0, 3).map((r: any) => r.value || r.name);
  }

  // Extract favorite subjects from subjectScores or subjectInterests
  let favoriteSubjects: string[] = [];
  const subjectScores = assessmentData.subjectScores || assessmentData.subjectInterests;
  if (subjectScores && typeof subjectScores === 'object') {
    favoriteSubjects = Object.entries(subjectScores)
      .filter(([_, score]: [string, any]) => typeof score === 'number' ? score >= 70 : true)
      .map(([subject]: [string, any]) => subject)
      .slice(0, 3);
  }

  return {
    gradeLevel: assessmentData.gradeLevel || assessmentData.grade || "Unknown",
    favoriteSubjects,
    learningStyle,
    riasecTop3,
    cvqTop3,
    overallScore: Math.round(overallScore),
  };
}

/**
 * Build career context from career data
 */
function buildCareerContext(career: Career): CareerContext {
  return {
    title: career.title,
    category: career.category,
    description: career.description || "",
    educationLevel: career.educationLevel || "Bachelor's degree",
    requiredSkills: career.requiredSkills || [],
    relatedSubjects: career.relatedSubjects || [],
    salaryRange: career.averageSalary || "Varies by experience",
  };
}

/**
 * Check if LLM service is available (API key configured and active)
 */
export async function isLlmServiceAvailable(storage: IStorage): Promise<boolean> {
  try {
    const credential = await storage.getApiCredential("openai");
    return Boolean(credential?.apiKey && credential?.isActive);
  } catch {
    return false;
  }
}

/**
 * Generate all premium narratives for a career recommendation
 */
export async function generateAllPremiumNarratives(
  storage: IStorage,
  assessment: Assessment,
  career: Career,
  overallScore: number
): Promise<{
  careerReasoning: NarrativeResult;
  educationPathways: NarrativeResult;
}> {
  const [careerReasoning, educationPathways] = await Promise.all([
    generateCareerReasoningNarrative(storage, assessment, career, overallScore),
    generateEducationPathwaysNarrative(storage, assessment, career, overallScore),
  ]);

  return { careerReasoning, educationPathways };
}
