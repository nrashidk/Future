/**
 * Interest Lexicon for Career Matching
 * 
 * Structured synonym thesaurus that maps student interests to career-related keywords.
 * Used by the Interest Match scoring component to provide richer, more accurate matching.
 * 
 * Architecture:
 * - Each interest has: primary keywords (category matches), description keywords (found in career descriptions), 
 *   and skill keywords (found in required skills)
 * - Supports weighted multi-channel matching for better accuracy
 */

export interface InterestMapping {
  /** Primary category keywords - highest weight match */
  categories: string[];
  /** Description keywords - medium weight match */
  descriptionKeywords: string[];
  /** Skill keywords - lower weight match */
  skillKeywords: string[];
}

export const INTEREST_LEXICON: Record<string, InterestMapping> = {
  "Technology": {
    categories: ["Technology", "IT & Software", "Engineering"],
    descriptionKeywords: [
      "tech", "digital", "computer", "coding", "programming", "software", 
      "apps", "innovation", "ai", "artificial intelligence", "machine learning",
      "web", "mobile", "cloud", "data", "automation", "robotics", "cyber"
    ],
    skillKeywords: [
      "programming", "coding", "python", "java", "javascript", "sql",
      "algorithms", "data structures", "software development", "debugging"
    ],
  },

  "Healthcare": {
    categories: ["Healthcare", "Medical", "Nursing", "Health Services"],
    descriptionKeywords: [
      "health", "medical", "patient", "care", "hospital", "clinic", "treatment",
      "diagnosis", "therapy", "wellness", "medicine", "nursing", "doctor",
      "healthcare", "healing", "recovery", "rehabilitation"
    ],
    skillKeywords: [
      "patient care", "medical knowledge", "clinical skills", "anatomy",
      "physiology", "pharmacology", "emergency response", "bedside manner"
    ],
  },

  "Arts & Design": {
    categories: ["Creative", "Design", "Arts", "Media"],
    descriptionKeywords: [
      "creative", "design", "art", "visual", "aesthetic", "artistic", "beauty",
      "graphics", "illustration", "photography", "video", "animation",
      "creative expression", "imagination", "style", "composition", "layout"
    ],
    skillKeywords: [
      "creativity", "design thinking", "color theory", "typography",
      "visual communication", "adobe", "sketching", "illustration", "3d modeling"
    ],
  },

  "Business": {
    categories: ["Business", "Management", "Finance", "Entrepreneurship"],
    descriptionKeywords: [
      "business", "management", "company", "organization", "strategy",
      "finance", "accounting", "economics", "marketing", "sales", "revenue",
      "profit", "investment", "corporate", "entrepreneur", "startup", "trade"
    ],
    skillKeywords: [
      "leadership", "strategic thinking", "financial analysis", "budgeting",
      "project management", "negotiation", "business planning", "analytics"
    ],
  },

  "Education": {
    categories: ["Education", "Teaching", "Training", "Academia"],
    descriptionKeywords: [
      "teach", "education", "learning", "instruction", "curriculum", "classroom",
      "student", "academic", "pedagogy", "training", "mentoring", "tutoring",
      "knowledge transfer", "educational development", "school"
    ],
    skillKeywords: [
      "teaching", "curriculum development", "classroom management",
      "educational psychology", "assessment", "lesson planning", "mentorship"
    ],
  },

  "Science": {
    categories: ["Science", "Research", "Engineering", "Laboratory"],
    descriptionKeywords: [
      "science", "research", "experiment", "discovery", "analysis", "laboratory",
      "scientific", "investigation", "study", "testing", "hypothesis",
      "innovation", "breakthrough", "theory", "evidence", "data collection"
    ],
    skillKeywords: [
      "scientific method", "research methodology", "data analysis",
      "laboratory techniques", "critical thinking", "hypothesis testing",
      "statistical analysis", "experimental design"
    ],
  },

  "Sports": {
    categories: ["Sports", "Athletics", "Fitness", "Recreation"],
    descriptionKeywords: [
      "sports", "athletic", "fitness", "exercise", "training", "competition",
      "physical", "performance", "coaching", "team", "game", "movement",
      "recreation", "wellness", "conditioning", "strength"
    ],
    skillKeywords: [
      "athletic ability", "coaching", "physical fitness", "sports psychology",
      "teamwork", "competition strategy", "physical therapy", "nutrition"
    ],
  },

  "Social Services": {
    categories: ["Social Services", "Community", "Nonprofit", "Counseling"],
    descriptionKeywords: [
      "social", "community", "help", "support", "counseling", "advocacy",
      "service", "charity", "nonprofit", "welfare", "assistance", "outreach",
      "empowerment", "social work", "humanitarian", "volunteer"
    ],
    skillKeywords: [
      "empathy", "active listening", "counseling", "case management",
      "conflict resolution", "advocacy", "community organizing", "cultural sensitivity"
    ],
  },

  "Law & Government": {
    categories: ["Legal", "Government", "Public Service", "Policy"],
    descriptionKeywords: [
      "law", "legal", "government", "policy", "regulation", "justice", "court",
      "legislation", "public service", "civic", "political", "administration",
      "governance", "compliance", "rights", "attorney", "lawyer"
    ],
    skillKeywords: [
      "legal research", "critical thinking", "argumentation", "writing",
      "public speaking", "policy analysis", "constitutional law", "negotiation"
    ],
  },

  "Environment": {
    categories: ["Environmental", "Science", "Sustainability", "Conservation"],
    descriptionKeywords: [
      "environment", "sustainability", "conservation", "ecology", "nature",
      "green", "renewable", "climate", "ecosystem", "biodiversity", "pollution",
      "environmental protection", "natural resources", "carbon", "sustainable"
    ],
    skillKeywords: [
      "environmental science", "sustainability", "ecology", "conservation",
      "environmental policy", "renewable energy", "waste management", "climate science"
    ],
  },

  "Media & Communication": {
    categories: ["Media", "Communication", "Journalism", "Broadcasting"],
    descriptionKeywords: [
      "media", "communication", "journalism", "news", "broadcasting", "writing",
      "reporting", "storytelling", "content", "digital media", "social media",
      "public relations", "marketing communication", "video production"
    ],
    skillKeywords: [
      "writing", "communication", "storytelling", "interviewing", "editing",
      "content creation", "public speaking", "social media management"
    ],
  },

  "Engineering": {
    categories: ["Engineering", "Technology", "Construction", "Manufacturing"],
    descriptionKeywords: [
      "engineering", "design", "build", "construct", "develop", "mechanical",
      "electrical", "civil", "structural", "systems", "technical", "prototype",
      "manufacturing", "infrastructure", "architecture", "blueprint"
    ],
    skillKeywords: [
      "engineering design", "technical analysis", "problem solving", "CAD",
      "mathematics", "physics", "project management", "systems thinking"
    ],
  },

  "Food & Hospitality": {
    categories: ["Culinary", "Hospitality", "Food Service", "Tourism"],
    descriptionKeywords: [
      "food", "cooking", "culinary", "chef", "restaurant", "hospitality",
      "service", "cuisine", "menu", "recipe", "hotel", "tourism", "guest",
      "catering", "dining", "kitchen", "meal preparation"
    ],
    skillKeywords: [
      "cooking", "food preparation", "culinary arts", "menu planning",
      "customer service", "food safety", "hospitality management", "creativity"
    ],
  },

  "Fashion & Style": {
    categories: ["Fashion", "Design", "Retail", "Creative"],
    descriptionKeywords: [
      "fashion", "style", "clothing", "apparel", "design", "trends", "fabric",
      "garment", "textiles", "accessories", "runway", "boutique", "wardrobe",
      "styling", "couture", "fashion industry"
    ],
    skillKeywords: [
      "fashion design", "sewing", "pattern making", "textile knowledge",
      "trend forecasting", "styling", "color theory", "sketching"
    ],
  },

  "Gaming & Animation": {
    categories: ["Gaming", "Technology", "Creative", "Entertainment"],
    descriptionKeywords: [
      "gaming", "games", "video game", "animation", "interactive", "gameplay",
      "character", "3d", "virtual", "esports", "game design", "gaming industry",
      "player experience", "level design", "storytelling"
    ],
    skillKeywords: [
      "game design", "programming", "3d modeling", "animation", "unity",
      "unreal engine", "storytelling", "user experience", "creative problem solving"
    ],
  },

  "Problem Solving": {
    categories: ["Technology", "Engineering", "Science", "Business"],
    descriptionKeywords: [
      "problem", "solve", "solution", "challenge", "troubleshoot", "debug",
      "analytical", "critical thinking", "optimization", "strategic", "resolve",
      "technical challenges", "complex problems", "decision making", "innovation"
    ],
    skillKeywords: [
      "problem solving", "critical thinking", "analytical skills", "troubleshooting",
      "debugging", "logical thinking", "algorithms", "optimization", "root cause analysis"
    ],
  },

  "Leadership": {
    categories: ["Business", "Management", "Education", "Government"],
    descriptionKeywords: [
      "lead", "leadership", "manage", "direct", "guide", "coordinate", "supervise",
      "team", "organize", "motivate", "mentor", "decision making", "strategic planning",
      "influence", "inspire", "delegation", "responsibility"
    ],
    skillKeywords: [
      "leadership", "team management", "strategic thinking", "decision making",
      "mentorship", "delegation", "communication", "project management", "motivation"
    ],
  },

  "Helping": {
    categories: ["Healthcare", "Social Services", "Education", "Community"],
    descriptionKeywords: [
      "help", "assist", "support", "care", "service", "aid", "benefit", "contribute",
      "volunteer", "community", "social impact", "patient care", "counseling",
      "teaching", "mentoring", "empowerment", "wellbeing"
    ],
    skillKeywords: [
      "empathy", "active listening", "patient care", "counseling", "teaching",
      "mentorship", "communication", "compassion", "problem solving"
    ],
  },

  "Physical": {
    categories: ["Sports", "Healthcare", "Physical Therapy", "Fitness"],
    descriptionKeywords: [
      "physical", "movement", "exercise", "athletic", "sports", "fitness", "active",
      "training", "strength", "conditioning", "rehabilitation", "therapy", "wellness",
      "health", "performance", "coordination", "endurance"
    ],
    skillKeywords: [
      "physical fitness", "athletic ability", "physical therapy", "sports medicine",
      "exercise science", "kinesiology", "coaching", "rehabilitation"
    ],
  },
};

/**
 * Configuration for weighted multi-channel matching
 */
export const INTEREST_MATCHING_WEIGHTS = {
  /** Weight for exact category match */
  categoryMatch: 0.6,
  /** Weight for description keyword match */
  descriptionMatch: 0.3,
  /** Weight for skill keyword match */
  skillMatch: 0.1,
};

/**
 * Normalize text for matching: lowercase, preserve emoji and unicode, consolidate whitespace
 * Preserves emoji for matching against career icons and descriptions
 * Preserves hyphens and slashes in compound terms (e.g., "AI/ML", "self-direction")
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}'"]/g, ' ') // Remove only punctuation, keep emoji/unicode
    .replace(/\s+/g, ' ') // Consolidate whitespace
    .trim();
}

/**
 * Check if any keywords from a list appear in the target text
 * Returns matching keywords found
 * Handles compound keywords by checking both original and space-separated versions
 * (e.g., "ai/ml" matches both "ai/ml" and "ai ml")
 */
export function findMatchingKeywords(
  keywords: string[],
  targetText: string
): string[] {
  const normalized = normalizeText(targetText);
  const matches: string[] = [];

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    
    // Check exact match
    if (normalized.includes(normalizedKeyword)) {
      matches.push(keyword);
      continue;
    }
    
    // Check space-separated version for compound keywords (ai/ml → ai ml)
    if (normalizedKeyword.includes('/') || normalizedKeyword.includes('-')) {
      const spaceSeparated = normalizedKeyword.replace(/[/-]/g, ' ');
      if (normalized.includes(spaceSeparated)) {
        matches.push(keyword);
        continue;
      }
    }
    
    // Check joined version (self-direction → selfdirection)
    if (normalizedKeyword.includes(' ')) {
      const joined = normalizedKeyword.replace(/\s+/g, '');
      if (normalized.includes(joined)) {
        matches.push(keyword);
      }
    }
  }

  return matches;
}
