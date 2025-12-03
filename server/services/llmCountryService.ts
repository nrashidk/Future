/**
 * LLM Country Service
 * 
 * Auto-populates country data using OpenAI API.
 * Generates vision, strategic objectives, priority sectors, and curriculum-aligned quiz questions.
 */

import type { IStorage } from "../storage";

interface CountryResearchResult {
  success: boolean;
  data?: CountryData;
  error?: string;
  tokensUsed?: number;
}

interface CountryData {
  mission: string;
  vision: string;
  visionPlan: string;
  prioritySectors: string[];
  nationalGoals: string[];
  educationSystem: string;
  universitiesLink: string;
  universitiesLinkLabel: string;
  curricula: string[];
  subjects: string[];
  gradeLevels: string[];
  targets: {
    year: number;
    description: string;
  }[];
}

interface QuizGenerationResult {
  success: boolean;
  questions?: GeneratedQuestion[];
  error?: string;
  tokensUsed?: number;
}

interface GeneratedQuestion {
  question: string;
  questionType: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  subject: string;
  grade: number;
  curriculum: string;
  topic: string;
  difficulty: string;
  cognitiveLevel: string;
}

const DEFAULT_MODEL = "gpt-4o";
const MAX_TOKENS_RESEARCH = 2000;
const MAX_TOKENS_QUESTIONS = 3000;
const TEMPERATURE = 0.7;

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: TEMPERATURE,
      response_format: { type: "json_object" },
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
 * Research country data using LLM
 */
export async function researchCountryData(
  storage: IStorage,
  countryName: string,
  countryCode: string
): Promise<CountryResearchResult> {
  try {
    const credential = await storage.getApiCredential("openai");
    if (!credential || !credential.apiKey || !credential.isActive) {
      return {
        success: false,
        error: "OpenAI API key not configured or inactive",
      };
    }

    const systemPrompt = `You are an expert researcher on education systems and national development strategies. 
You provide accurate, well-researched information about countries' education systems, national visions, and development goals.
Always respond with valid JSON in the exact format specified.`;

    const userPrompt = `Research and provide comprehensive information about ${countryName} (${countryCode}) for a career guidance platform targeting students aged 13-18.

Provide the following information in JSON format:
{
  "mission": "The country's national mission statement or core purpose (2-3 sentences)",
  "vision": "The country's national vision statement, like 'UAE Vision 2071' (2-3 sentences)",
  "visionPlan": "The main national development plan name, e.g., 'Vision 2030', 'National Development Plan 2024'",
  "prioritySectors": ["Array of 5-8 key priority economic sectors for national development"],
  "nationalGoals": ["Array of 5-8 key national strategic goals related to economy, education, innovation"],
  "educationSystem": "Brief description of the education system (grade levels, structure, key features) in 2-3 sentences",
  "universitiesLink": "URL to the official higher education accreditation body or ministry website",
  "universitiesLinkLabel": "Display name for the link, e.g., 'Ministry of Education' or 'Higher Education Commission'",
  "curricula": ["Array of curricula used in the country, e.g., 'National Curriculum', 'CBSE', 'IB', 'Cambridge', 'American']",
  "subjects": ["Array of 6-8 core school subjects commonly taught, e.g., 'Mathematics', 'Science', 'English', 'History'"],
  "gradeLevels": ["8", "9", "10", "11", "12"],
  "targets": [
    {"year": 2030, "description": "Key development target for this year"},
    {"year": 2040, "description": "Key development target for this year if applicable"}
  ]
}

Focus on accurate, verifiable information. For subjects, use the actual names used in that country's education system.`;

    const { content, tokensUsed } = await callOpenAI(
      credential.apiKey,
      systemPrompt,
      userPrompt,
      MAX_TOKENS_RESEARCH
    );

    const data = JSON.parse(content) as CountryData;

    return {
      success: true,
      data,
      tokensUsed,
    };
  } catch (error) {
    console.error("Error researching country data:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Generate curriculum-aligned quiz questions for a country
 */
export async function generateCountryQuizQuestions(
  storage: IStorage,
  countryId: string,
  countryName: string,
  subject: string,
  grade: number,
  curriculum: string,
  count: number = 10
): Promise<QuizGenerationResult> {
  try {
    const credential = await storage.getApiCredential("openai");
    if (!credential || !credential.apiKey || !credential.isActive) {
      return {
        success: false,
        error: "OpenAI API key not configured or inactive",
      };
    }

    const systemPrompt = `You are an expert curriculum developer specializing in creating high-quality assessment questions aligned with national curricula.
Your questions must be:
- Age-appropriate for the specified grade level
- Aligned with the specified curriculum standards
- Varied in difficulty and cognitive levels (Bloom's Taxonomy)
- Culturally relevant to the specified country
Always respond with valid JSON in the exact format specified.`;

    const userPrompt = `Generate ${count} multiple-choice quiz questions for:
- Country: ${countryName}
- Subject: ${subject}
- Grade: ${grade}
- Curriculum: ${curriculum}

Requirements:
1. Questions should be curriculum-aligned and grade-appropriate
2. Include a mix of difficulties: 30% easy, 50% medium, 20% hard
3. Cover different cognitive levels: knowledge, comprehension, application, analysis
4. Make questions culturally relevant where appropriate
5. Each question must have exactly 4 options
6. Provide clear explanations for correct answers

Respond with JSON in this format:
{
  "questions": [
    {
      "question": "The question text",
      "questionType": "multiple_choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "The correct option text exactly as written in options",
      "explanation": "Why this is the correct answer",
      "subject": "${subject}",
      "grade": ${grade},
      "curriculum": "${curriculum}",
      "topic": "Specific topic within the subject (e.g., 'Algebra - Linear Equations')",
      "difficulty": "easy|medium|hard",
      "cognitiveLevel": "knowledge|comprehension|application|analysis"
    }
  ]
}`;

    const { content, tokensUsed } = await callOpenAI(
      credential.apiKey,
      systemPrompt,
      userPrompt,
      MAX_TOKENS_QUESTIONS
    );

    const parsed = JSON.parse(content) as { questions: GeneratedQuestion[] };

    return {
      success: true,
      questions: parsed.questions,
      tokensUsed,
    };
  } catch (error) {
    console.error("Error generating quiz questions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Generate priority sector to WEF skill mappings for a country
 */
export async function generateSectorWefMappings(
  storage: IStorage,
  countryName: string,
  prioritySectors: string[]
): Promise<{
  success: boolean;
  mappings?: Array<{ sector: string; wefSkills: string[]; importanceScore: number }>;
  error?: string;
}> {
  try {
    const credential = await storage.getApiCredential("openai");
    if (!credential || !credential.apiKey || !credential.isActive) {
      return {
        success: false,
        error: "OpenAI API key not configured or inactive",
      };
    }

    const wefSkills = [
      "Literacy", "Numeracy", "Scientific Literacy", "ICT Literacy",
      "Financial Literacy", "Cultural and Civic Literacy",
      "Critical Thinking and Problem Solving", "Creativity",
      "Communication", "Collaboration", "Curiosity", "Initiative",
      "Persistence and Grit", "Adaptability", "Leadership",
      "Social and Cultural Awareness"
    ];

    const systemPrompt = `You are an expert in workforce development and the World Economic Forum's 16 Skills Framework.
Map priority economic sectors to the most relevant WEF skills needed for success in those sectors.
Always respond with valid JSON.`;

    const userPrompt = `For ${countryName}, map each priority sector to the most relevant WEF skills.

Priority Sectors: ${prioritySectors.join(", ")}

Available WEF Skills: ${wefSkills.join(", ")}

Respond with JSON:
{
  "mappings": [
    {
      "sector": "Sector Name",
      "wefSkills": ["Top 4-5 most relevant WEF skills for this sector"],
      "importanceScore": 0.8  // 0.5 to 1.0 indicating how critical these skills are
    }
  ]
}`;

    const { content } = await callOpenAI(
      credential.apiKey,
      systemPrompt,
      userPrompt,
      1500
    );

    const parsed = JSON.parse(content) as {
      mappings: Array<{ sector: string; wefSkills: string[]; importanceScore: number }>;
    };

    return {
      success: true,
      mappings: parsed.mappings,
    };
  } catch (error) {
    console.error("Error generating sector mappings:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
