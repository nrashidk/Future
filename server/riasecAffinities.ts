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
  {
    careerTitle: "Civil Engineer",
    affinities: { R: 80, I: 75, A: 30, S: 25, E: 50, C: 65 },
    rationale: "High realistic (construction sites, infrastructure) and investigative (structural analysis, design). Moderate conventional (building codes) and enterprising (project management). Low artistic and social."
  },
  {
    careerTitle: "Architect",
    affinities: { R: 50, I: 70, A: 85, S: 35, E: 55, C: 50 },
    rationale: "High artistic (design creativity, aesthetics) and investigative (technical planning, structural considerations). Moderate realistic (building materials), enterprising (client projects), conventional (regulations). Low social."
  },
  {
    careerTitle: "Electrical Engineer",
    affinities: { R: 75, I: 85, A: 25, S: 20, E: 40, C: 70 },
    rationale: "High realistic (circuits, equipment) and investigative (electrical systems analysis). Moderate conventional (technical standards) and enterprising (project leadership). Low artistic and social."
  },
  {
    careerTitle: "Biomedical Engineer",
    affinities: { R: 70, I: 90, A: 30, S: 50, E: 45, C: 65 },
    rationale: "Extremely investigative (medical technology research) and high realistic (device prototyping). Moderate social (healthcare impact), conventional (regulatory compliance), enterprising (product development). Low artistic."
  },
  {
    careerTitle: "Pharmacist",
    affinities: { R: 40, I: 75, A: 15, S: 80, E: 35, C: 85 },
    rationale: "High social (patient counseling, healthcare) and conventional (prescription protocols, inventory). High investigative (drug interactions, dosages). Moderate realistic (medication preparation). Low artistic."
  },
  {
    careerTitle: "Doctor (General Practitioner)",
    affinities: { R: 60, I: 90, A: 20, S: 90, E: 50, C: 70 },
    rationale: "Extremely investigative (diagnosis, medical knowledge) and social (patient care, empathy). Moderate realistic (physical examinations), conventional (medical procedures), enterprising (practice management). Low artistic."
  },
  {
    careerTitle: "Dentist",
    affinities: { R: 75, I: 80, A: 30, S: 70, E: 55, C: 65 },
    rationale: "High realistic (hands-on procedures, tools) and investigative (dental diagnosis). High social (patient interaction). Moderate conventional (treatment protocols), enterprising (practice ownership). Low artistic."
  },
  {
    careerTitle: "Physical Therapist",
    affinities: { R: 70, I: 65, A: 25, S: 90, E: 40, C: 60 },
    rationale: "Extremely social (patient rehabilitation, motivation) and high realistic (hands-on therapy, equipment). Moderate investigative (treatment planning), conventional (therapy protocols). Low artistic."
  },
  {
    careerTitle: "Psychologist",
    affinities: { R: 20, I: 90, A: 30, S: 95, E: 35, C: 60 },
    rationale: "Extremely social (counseling, empathy) and investigative (human behavior research, assessment). Moderate conventional (clinical procedures, documentation). Low realistic."
  },
  {
    careerTitle: "Social Worker",
    affinities: { R: 25, I: 60, A: 30, S: 95, E: 40, C: 65 },
    rationale: "Extremely social (client advocacy, community support) and moderate investigative (case assessment). Moderate conventional (documentation, regulations), enterprising (program coordination). Low realistic."
  },
  {
    careerTitle: "Lawyer",
    affinities: { R: 15, I: 85, A: 35, S: 50, E: 80, C: 75 },
    rationale: "High investigative (legal research, analysis) and enterprising (advocacy, negotiation). High conventional (legal procedures, documentation). Moderate social (client representation), artistic (persuasive arguments). Low realistic."
  },
  {
    careerTitle: "Accountant",
    affinities: { R: 20, I: 70, A: 15, S: 30, E: 50, C: 95 },
    rationale: "Extremely conventional (financial records, tax codes, precision) and high investigative (financial analysis). Moderate enterprising (business consulting), social (client interaction). Low realistic and artistic."
  },
  {
    careerTitle: "Human Resources Manager",
    affinities: { R: 15, I: 55, A: 30, S: 85, E: 75, C: 70 },
    rationale: "High social (employee relations, interviewing) and enterprising (leadership, recruitment). High conventional (policies, compliance). Moderate investigative (talent assessment). Low realistic."
  },
  {
    careerTitle: "Management Consultant",
    affinities: { R: 20, I: 85, A: 35, S: 60, E: 90, C: 70 },
    rationale: "Extremely enterprising (business strategy, client persuasion) and investigative (data analysis, problem-solving). Moderate social (stakeholder engagement), conventional (frameworks), artistic (presentations). Low realistic."
  },
  {
    careerTitle: "Entrepreneur",
    affinities: { R: 35, I: 70, A: 60, S: 55, E: 95, C: 40 },
    rationale: "Extremely enterprising (risk-taking, leadership, sales) and high investigative (market research). Moderate artistic (innovation, branding), social (networking), realistic (product development). Lower conventional (less structured)."
  },
  {
    careerTitle: "Sales Manager",
    affinities: { R: 20, I: 50, A: 35, S: 70, E: 95, C: 55 },
    rationale: "Extremely enterprising (persuasion, deal-closing, targets) and high social (client relationships). Moderate conventional (CRM, reporting), investigative (market analysis). Low realistic."
  },
  {
    careerTitle: "Marketing Manager",
    affinities: { R: 15, I: 65, A: 75, S: 65, E: 90, C: 50 },
    rationale: "Extremely enterprising (campaigns, ROI) and high artistic (creative strategy, branding). Moderate social (audience engagement), investigative (market research), conventional (budgets). Low realistic."
  },
  {
    careerTitle: "Product Manager",
    affinities: { R: 30, I: 80, A: 55, S: 65, E: 85, C: 60 },
    rationale: "High enterprising (product strategy, stakeholder management) and investigative (user research, data-driven decisions). Moderate artistic (product design), social (cross-functional teams), conventional (roadmaps). Low realistic."
  },
  {
    careerTitle: "UX/UI Designer",
    affinities: { R: 35, I: 70, A: 90, S: 60, E: 40, C: 50 },
    rationale: "Extremely artistic (visual design, user interfaces) and high investigative (user research, usability testing). Moderate social (user empathy), realistic (design tools), conventional (design systems). Low enterprising."
  },
  {
    careerTitle: "Video Game Designer",
    affinities: { R: 40, I: 75, A: 95, S: 45, E: 50, C: 45 },
    rationale: "Extremely artistic (creative gameplay, storytelling, world-building) and high investigative (mechanics design, playtesting). Moderate realistic (game engines), enterprising (pitching concepts), social (player psychology). Lower conventional."
  },
  {
    careerTitle: "Journalist",
    affinities: { R: 30, I: 85, A: 70, S: 65, E: 55, C: 50 },
    rationale: "High investigative (research, fact-checking) and artistic (storytelling, writing). Moderate social (interviewing), enterprising (publishing deadlines), realistic (field reporting). Moderate conventional."
  },
  {
    careerTitle: "Content Creator",
    affinities: { R: 45, I: 55, A: 90, S: 70, E: 75, C: 35 },
    rationale: "Extremely artistic (creative content, video/photo production) and high enterprising (personal brand, monetization). Moderate social (audience engagement), realistic (filming equipment), investigative (trends). Lower conventional."
  },
  {
    careerTitle: "Photographer",
    affinities: { R: 60, I: 50, A: 95, S: 50, E: 50, C: 40 },
    rationale: "Extremely artistic (visual composition, creativity) and moderate realistic (camera equipment, lighting). Moderate social (client interaction), enterprising (freelance business), investigative (technical skills). Lower conventional."
  },
  {
    careerTitle: "Chef",
    affinities: { R: 75, I: 55, A: 80, S: 45, E: 60, C: 50 },
    rationale: "High artistic (culinary creativity, plating) and realistic (hands-on cooking, kitchen equipment). Moderate enterprising (restaurant management), investigative (recipe development), social (dining experience). Moderate conventional."
  },
  {
    careerTitle: "Fashion Designer",
    affinities: { R: 50, I: 50, A: 95, S: 40, E: 70, C: 45 },
    rationale: "Extremely artistic (design creativity, aesthetics) and high enterprising (fashion business, trends). Moderate realistic (garment construction, fabrics), investigative (trend forecasting), social (client fitting). Lower conventional."
  },
  {
    careerTitle: "Interior Designer",
    affinities: { R: 55, I: 60, A: 90, S: 60, E: 65, C: 55 },
    rationale: "Extremely artistic (space design, aesthetics) and moderate investigative (spatial planning, materials). Moderate realistic (construction knowledge), enterprising (client projects), social (client collaboration), conventional (building codes)."
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
