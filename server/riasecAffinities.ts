/**
 * RIASEC Career Affinity Mappings
 * 
 * Each career is scored 0-100 on six Holland Code dimensions:
 * - R (Realistic): Hands-on, practical work with tools/machines
 * - I (Investigative): Analytical, research-oriented problem solving
 * - A (Artistic): Creative, expressive, design-focused
 * - S (Social): People-oriented, helping/teaching
 * - E (Enterprising): Leadership, business, persuasion
 * - C (Conventional): Organized, detail-oriented, structured
 */

export interface RiasecAffinityMapping {
  careerTitle: string;
  affinities: {
    R: number; // Realistic
    I: number; // Investigative
    A: number; // Artistic
    S: number; // Social
    E: number; // Enterprising
    C: number; // Conventional
  };
  rationale: string;
}

export const RIASEC_CAREER_AFFINITIES: RiasecAffinityMapping[] = [
  {
    careerTitle: "Software Engineer",
    affinities: { R: 40, I: 90, A: 30, S: 20, E: 35, C: 70 },
    rationale: "Highly investigative (problem-solving, algorithms) and conventional (structured code, documentation). Moderate realistic (working with computer systems) and enterprising (project leadership). Low social and artistic."
  },
  {
    careerTitle: "Data Scientist",
    affinities: { R: 25, I: 95, A: 25, S: 25, E: 40, C: 75 },
    rationale: "Extremely investigative (statistical analysis, research) and highly conventional (data structures, methodologies). Moderate enterprising (presenting insights). Low realistic, artistic, social."
  },
  {
    careerTitle: "Renewable Energy Engineer",
    affinities: { R: 75, I: 80, A: 20, S: 25, E: 45, C: 60 },
    rationale: "High realistic (hands-on engineering, field work) and investigative (technical problem-solving, design). Moderate conventional (engineering standards) and enterprising (project management). Low artistic and social."
  },
  {
    careerTitle: "Healthcare Professional (Nurse)",
    affinities: { R: 55, I: 60, A: 20, S: 95, E: 30, C: 65 },
    rationale: "Extremely social (patient care, empathy, communication) and moderate-high investigative (medical knowledge, diagnosis). Moderate realistic (hands-on care, equipment), conventional (procedures, documentation). Low artistic."
  },
  {
    careerTitle: "Digital Marketing Specialist",
    affinities: { R: 15, I: 50, A: 70, S: 60, E: 85, C: 55 },
    rationale: "High enterprising (persuasion, campaigns, ROI) and artistic (content creation, design). Moderate social (audience engagement), investigative (analytics), conventional (reporting). Low realistic."
  },
  {
    careerTitle: "Graphic Designer",
    affinities: { R: 30, I: 35, A: 95, E: 30, S: 45, C: 40 },
    rationale: "Extremely artistic (visual creativity, design thinking) and moderate social (client collaboration). Some realistic (design tools), enterprising (freelance business), conventional (brand guidelines). Low investigative."
  },
  {
    careerTitle: "Mechanical Engineer",
    affinities: { R: 85, I: 80, A: 25, S: 20, E: 40, C: 70 },
    rationale: "High realistic (hands-on prototyping, testing) and investigative (physics, materials science). Moderate conventional (engineering standards) and enterprising (project leadership). Low artistic and social."
  },
  {
    careerTitle: "Financial Analyst",
    affinities: { R: 15, I: 75, A: 15, S: 25, E: 65, C: 90 },
    rationale: "Extremely conventional (financial models, reporting standards) and high investigative (data analysis, risk assessment). Moderate enterprising (investment recommendations). Low realistic, artistic, social."
  },
  {
    careerTitle: "Teacher (Secondary Education)",
    affinities: { R: 25, I: 60, A: 50, S: 95, E: 40, C: 60 },
    rationale: "Extremely social (student interaction, mentoring, communication) and moderate investigative (subject expertise, curriculum development). Moderate artistic (creative lesson planning), conventional (grading, planning). Low realistic."
  },
  {
    careerTitle: "Environmental Scientist",
    affinities: { R: 65, I: 90, A: 20, S: 40, E: 35, C: 70 },
    rationale: "Highly investigative (research, data analysis, environmental policy) and realistic (field work, sample collection). Moderate conventional (scientific methods, documentation) and social (community engagement). Low artistic."
  },
];

/**
 * Get RIASEC affinity scores for a career by title
 */
export function getRiasecAffinityForCareer(careerTitle: string): RiasecAffinityMapping | undefined {
  return RIASEC_CAREER_AFFINITIES.find(mapping => mapping.careerTitle === careerTitle);
}

/**
 * Validate that all RIASEC scores are within valid range [0-100]
 */
export function validateRiasecAffinities(): boolean {
  return RIASEC_CAREER_AFFINITIES.every(mapping => {
    const { R, I, A, S, E, C } = mapping.affinities;
    return [R, I, A, S, E, C].every(score => score >= 0 && score <= 100);
  });
}
