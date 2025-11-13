/**
 * WEF 16 Skills Framework - Assessment Mapping
 * 
 * Maps existing assessments (CVQ, RIASEC, Kolb, Subject Competency) to WEF skills
 * to calculate future-ready skills profiles WITHOUT adding new assessment questions.
 * 
 * Based on research:
 * - Schwartz Theory of Basic Values (CVQ foundation)
 * - Holland Code vocational framework (RIASEC)
 * - Kolb Experiential Learning Theory
 * - Subject matter expertise correlation studies
 */

/**
 * CVQ Domain → WEF Skills Mapping
 * 
 * Maps Schwartz's 7 value domains to relevant WEF skills.
 * Higher weights indicate stronger theoretical correlation.
 */
export const CVQ_TO_WEF_MAPPING: Record<string, Array<{ wefSkill: string; weight: number }>> = {
  // Achievement: Success through demonstrating competence
  achievement: [
    { wefSkill: "Initiative", weight: 0.8 },
    { wefSkill: "Persistence and Grit", weight: 0.7 },
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.5 },
    { wefSkill: "Leadership", weight: 0.4 },
  ],

  // Benevolence: Caring for welfare of close others
  benevolence: [
    { wefSkill: "Collaboration", weight: 0.9 },
    { wefSkill: "Social and Cultural Awareness", weight: 0.7 },
    { wefSkill: "Communication", weight: 0.6 },
    { wefSkill: "Leadership", weight: 0.5 },
  ],

  // Universalism: Understanding, appreciation, tolerance
  universalism: [
    { wefSkill: "Social and Cultural Awareness", weight: 1.0 },
    { wefSkill: "Cultural and Civic Literacy", weight: 0.9 },
    { wefSkill: "Curiosity", weight: 0.6 },
    { wefSkill: "Adaptability", weight: 0.5 },
  ],

  // Self-Direction: Independent thought and action
  self_direction: [
    { wefSkill: "Curiosity", weight: 0.9 },
    { wefSkill: "Initiative", weight: 0.8 },
    { wefSkill: "Creativity", weight: 0.7 },
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.6 },
  ],

  // Security: Safety, harmony, stability
  security: [
    { wefSkill: "Persistence and Grit", weight: 0.6 },
    { wefSkill: "Adaptability", weight: 0.5 },
    { wefSkill: "Collaboration", weight: 0.4 },
  ],

  // Power: Status, prestige, control over people/resources
  power: [
    { wefSkill: "Leadership", weight: 0.9 },
    { wefSkill: "Initiative", weight: 0.7 },
    { wefSkill: "Communication", weight: 0.6 },
  ],

  // Hedonism: Pleasure, sensuous gratification
  hedonism: [
    { wefSkill: "Creativity", weight: 0.6 },
    { wefSkill: "Adaptability", weight: 0.5 },
    { wefSkill: "Curiosity", weight: 0.4 },
  ],
};

/**
 * RIASEC Theme → WEF Skills Mapping
 * 
 * Maps Holland Code vocational personality types to WEF skills.
 * Weights based on vocational psychology research correlations.
 */
export const RIASEC_TO_WEF_MAPPING: Record<string, Array<{ wefSkill: string; weight: number }>> = {
  // Realistic: Practical, hands-on, technical work
  realistic: [
    { wefSkill: "ICT Literacy", weight: 0.7 },
    { wefSkill: "Numeracy", weight: 0.6 },
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.6 },
    { wefSkill: "Persistence and Grit", weight: 0.5 },
  ],

  // Investigative: Scientific, analytical, research-oriented
  investigative: [
    { wefSkill: "Scientific Literacy", weight: 0.9 },
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.9 },
    { wefSkill: "Curiosity", weight: 0.8 },
    { wefSkill: "Numeracy", weight: 0.7 },
  ],

  // Artistic: Creative, expressive, original
  artistic: [
    { wefSkill: "Creativity", weight: 1.0 },
    { wefSkill: "Communication", weight: 0.7 },
    { wefSkill: "Curiosity", weight: 0.6 },
    { wefSkill: "Cultural and Civic Literacy", weight: 0.5 },
  ],

  // Social: Helping, teaching, caring for others
  social: [
    { wefSkill: "Collaboration", weight: 0.9 },
    { wefSkill: "Communication", weight: 0.9 },
    { wefSkill: "Social and Cultural Awareness", weight: 0.8 },
    { wefSkill: "Leadership", weight: 0.6 },
  ],

  // Enterprising: Persuading, leading, entrepreneurial
  enterprising: [
    { wefSkill: "Leadership", weight: 0.9 },
    { wefSkill: "Initiative", weight: 0.9 },
    { wefSkill: "Communication", weight: 0.8 },
    { wefSkill: "Adaptability", weight: 0.7 },
  ],

  // Conventional: Organized, detail-oriented, systematic
  conventional: [
    { wefSkill: "Numeracy", weight: 0.7 },
    { wefSkill: "Financial Literacy", weight: 0.7 },
    { wefSkill: "Persistence and Grit", weight: 0.6 },
    { wefSkill: "ICT Literacy", weight: 0.5 },
  ],
};

/**
 * Kolb Learning Style → WEF Skills Mapping
 * 
 * Maps experiential learning preferences to skill development patterns.
 * Based on learning theory correlations with skill acquisition.
 */
export const KOLB_TO_WEF_MAPPING: Record<string, Array<{ wefSkill: string; weight: number }>> = {
  // Diverging: Concrete Experience + Reflective Observation (feeling & watching)
  diverging: [
    { wefSkill: "Creativity", weight: 0.9 },
    { wefSkill: "Curiosity", weight: 0.8 },
    { wefSkill: "Social and Cultural Awareness", weight: 0.7 },
    { wefSkill: "Collaboration", weight: 0.6 },
  ],

  // Assimilating: Abstract Conceptualization + Reflective Observation (thinking & watching)
  assimilating: [
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.9 },
    { wefSkill: "Scientific Literacy", weight: 0.8 },
    { wefSkill: "Numeracy", weight: 0.7 },
    { wefSkill: "Curiosity", weight: 0.6 },
  ],

  // Converging: Abstract Conceptualization + Active Experimentation (thinking & doing)
  converging: [
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.9 },
    { wefSkill: "Initiative", weight: 0.8 },
    { wefSkill: "ICT Literacy", weight: 0.7 },
    { wefSkill: "Persistence and Grit", weight: 0.6 },
  ],

  // Accommodating: Concrete Experience + Active Experimentation (feeling & doing)
  accommodating: [
    { wefSkill: "Adaptability", weight: 0.9 },
    { wefSkill: "Initiative", weight: 0.8 },
    { wefSkill: "Leadership", weight: 0.7 },
    { wefSkill: "Collaboration", weight: 0.6 },
  ],
};

/**
 * Subject Competency → WEF Skills Mapping
 * 
 * Maps demonstrated subject proficiency (via quiz scores) to related skills.
 * Higher weights for direct literacies, lower for transferable competencies.
 */
export const SUBJECT_TO_WEF_MAPPING: Record<string, Array<{ wefSkill: string; weight: number }>> = {
  Mathematics: [
    { wefSkill: "Numeracy", weight: 1.0 },
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.8 },
    { wefSkill: "Persistence and Grit", weight: 0.5 },
  ],

  Science: [
    { wefSkill: "Scientific Literacy", weight: 1.0 },
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.9 },
    { wefSkill: "Curiosity", weight: 0.7 },
  ],

  English: [
    { wefSkill: "Literacy", weight: 1.0 },
    { wefSkill: "Communication", weight: 0.8 },
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.6 },
  ],

  Arabic: [
    { wefSkill: "Literacy", weight: 1.0 },
    { wefSkill: "Cultural and Civic Literacy", weight: 0.9 },
    { wefSkill: "Communication", weight: 0.7 },
  ],

  "Social Studies": [
    { wefSkill: "Cultural and Civic Literacy", weight: 1.0 },
    { wefSkill: "Social and Cultural Awareness", weight: 0.9 },
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.7 },
  ],

  "Computer Science": [
    { wefSkill: "ICT Literacy", weight: 1.0 },
    { wefSkill: "Critical Thinking and Problem Solving", weight: 0.8 },
    { wefSkill: "Creativity", weight: 0.6 },
  ],
};

/**
 * Normalized WEF skill names for consistent reference
 */
export const WEF_SKILL_NAMES = [
  "Literacy",
  "Numeracy",
  "Scientific Literacy",
  "ICT Literacy",
  "Financial Literacy",
  "Cultural and Civic Literacy",
  "Critical Thinking and Problem Solving",
  "Creativity",
  "Communication",
  "Collaboration",
  "Curiosity",
  "Initiative",
  "Persistence and Grit",
  "Adaptability",
  "Leadership",
  "Social and Cultural Awareness",
] as const;

export type WEFSkillName = typeof WEF_SKILL_NAMES[number];

/**
 * Utility: Get all WEF skills affected by an assessment component
 */
export function getWEFSkillsForAssessment(
  assessmentType: "cvq" | "riasec" | "kolb" | "subjects"
): WEFSkillName[] {
  let mapping: Record<string, Array<{ wefSkill: string; weight: number }>>;

  switch (assessmentType) {
    case "cvq":
      mapping = CVQ_TO_WEF_MAPPING;
      break;
    case "riasec":
      mapping = RIASEC_TO_WEF_MAPPING;
      break;
    case "kolb":
      mapping = KOLB_TO_WEF_MAPPING;
      break;
    case "subjects":
      mapping = SUBJECT_TO_WEF_MAPPING;
      break;
  }

  const skills = new Set<string>();
  Object.values(mapping).forEach((skillMappings) => {
    skillMappings.forEach(({ wefSkill }) => skills.add(wefSkill));
  });

  return Array.from(skills) as WEFSkillName[];
}
