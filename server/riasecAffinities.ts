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
  // --- PHASE 3 STEP 1: Space & Future Sciences ------------------------------
  // Grounded in the O*NET interest codes for each occupation (17-2011.00 = IRC,
  // 19-2011.00 = IR), not authored from intuition.
  {
    careerTitle: "Aerospace Engineer",
    affinities: { R: 80, I: 90, A: 40, S: 20, E: 40, C: 65 },
    rationale: "High investigative (aerodynamics, orbital mechanics, failure analysis) and realistic (hardware, test rigs, prototypes) - O*NET interest code IRC. Moderate conventional (certification and safety standards) and enterprising (programme leadership). Some artistic in novel structural design. Low social."
  },
  {
    careerTitle: "Space Scientist (Astrophysicist)",
    affinities: { R: 45, I: 100, A: 35, S: 25, E: 25, C: 55 },
    rationale: "Almost purely investigative - O*NET interest code IR, and the most research-led career in the catalog. Moderate realistic (instruments, observing runs) and conventional (data pipelines, peer review). Low enterprising and social; the work is published, not sold."
  },
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
  {
    careerTitle: "Web Developer",
    affinities: { R: 40, I: 80, A: 65, S: 30, E: 45, C: 70 },
    rationale: "High investigative (debugging, evaluating code, problem-solving) and conventional (web standards, structured code, browser/device compatibility). Notable artistic component (interface design, front-end creativity) — higher than backend-focused Software Engineer. Moderate enterprising (freelance/project work), some realistic (dev tooling). Grounded in O*NET 15-1254.00 Web Developers (Investigative-Conventional-Artistic)."
  },
  // --- PHASE 3 STAGE 2: the 29 derived careers ------------------------------
  // Every one of the 29 is DERIVED from the occupation's real O*NET interest
  // profile, not authored from intuition. Source: O*NET 31.0 "Career Interest
  // Types.txt" (the file 30.0 shipped as "Interests.txt"), OI scale, 1.00-7.00,
  // domain source "Machine Learning/Expert".
  //
  // Transform, applied mechanically to all six dimensions of all 29 rows:
  //     affinity = round5( 18 + 0.82 * ((OI - 1) / 6 * 100) )
  // which maps OI 1.00 -> 20 and OI 7.00 -> 100. The constants are calibrated,
  // not arbitrary: they put the 29 careers' mean per-career affinity at 54.3
  // against the existing 39 careers' 55.6, so a new career is neither
  // advantaged nor penalised by register when calculateRiasecScore takes the
  // user-weighted average across the catalog.
  //
  // Consequence worth knowing: these 29 rows are REPRODUCIBLE from O*NET; the
  // 39 rows above them are hand-authored and are not. Where the two disagree in
  // register (Chef, Software Engineer, Space Scientist all sit lower on
  // Realistic than their OI profile implies) the existing rows are left alone -
  // re-deriving them is a catalog-wide change, not a Stage 2 one.
  //
  // The interest code quoted in each rationale is O*NET's own first/second/third
  // high-point, verbatim.
  // Cybersecurity Analyst (15-1212.00) - O*NET interest code CI
  {
    careerTitle: "Cybersecurity Analyst",
    affinities: { R: 55, I: 80, A: 25, S: 35, E: 45, C: 85 },
    rationale: "Conventional-led with strong investigative - O*NET 31.0 interest code CI (Conventional 6.08, Investigative 5.40 on the 1-7 OI scale). Controls, evidence, logs and standards frames the work as much as the hunt does. Moderate realistic (systems, hardware, network estate); artistic 25 is near the floor."
  },
  // AI Research Scientist (15-1221.00) - O*NET interest code IC
  {
    careerTitle: "AI Research Scientist",
    affinities: { R: 55, I: 100, A: 45, S: 30, E: 40, C: 70 },
    rationale: "The purest investigative profile available - O*NET interest code IC with Investigative at the 7.00 ceiling, matched in this catalog only by Geneticist and Physicist. Conventional 70 (method, reproducibility, peer review) and artistic 45 for genuine novelty in model and problem design. Low social and enterprising: the work is published, not sold."
  },
  // Robotics Engineer (17-2199.08) - O*NET interest code RIC
  {
    careerTitle: "Robotics Engineer",
    affinities: { R: 90, I: 80, A: 30, S: 25, E: 30, C: 65 },
    rationale: "Realistic-led, investigative close behind - O*NET interest code RIC (Realistic 6.18, Investigative 5.61). The work is hands-on build-and-test as much as it is control theory. Moderate conventional (safety standards, calibration). Low social and artistic."
  },
  // Nuclear Engineer (17-2161.00) - O*NET interest code IRC
  {
    careerTitle: "Nuclear Engineer",
    affinities: { R: 70, I: 90, A: 30, S: 30, E: 40, C: 65 },
    rationale: "Investigative-led with high realistic - O*NET interest code IRC (Investigative 6.44, Realistic 4.92). Reactor physics and thermal analysis over a plant you can walk around. Conventional 65 carries the licensing and safeguards regime that defines the profession. Low artistic and social."
  },
  // Chemical Engineer (17-2041.00) - O*NET interest code RIC
  {
    careerTitle: "Chemical Engineer",
    affinities: { R: 90, I: 85, A: 30, S: 20, E: 30, C: 65 },
    rationale: "Realistic and investigative in near-equal measure, realistic marginally ahead - O*NET interest code RIC (Realistic 6.27, Investigative 5.75). Plant, pilot rig and process before paper. Social 20 is the lowest of the 29, which is what O*NET measures."
  },
  // Risk & Compliance Officer (13-1041.00) - O*NET interest code CE
  {
    careerTitle: "Risk & Compliance Officer",
    affinities: { R: 40, I: 45, A: 20, S: 45, E: 60, C: 90 },
    rationale: "Conventional-led by a wide margin - O*NET interest code CE (Conventional 6.33, Enterprising 4.08). Rules, records, filings and audit trails are the job. Moderate enterprising (advising the business, defending a position to a regulator). Artistic 20 near the floor."
  },
  // Geneticist (19-1029.03) - O*NET interest code ICR
  {
    careerTitle: "Geneticist",
    affinities: { R: 60, I: 100, A: 45, S: 45, E: 25, C: 70 },
    rationale: "Investigative at the 7.00 ceiling - O*NET interest code ICR, one of only three occupations in this catalog to saturate the scale. Conventional 70 (protocol, replication, provenance) and realistic 60 (bench and sequencing platform). Enterprising 25 is the lowest of the science group."
  },
  // Health Informatics Specialist (15-1211.01) - O*NET interest code ICS
  {
    careerTitle: "Health Informatics Specialist",
    affinities: { R: 45, I: 90, A: 30, S: 65, E: 35, C: 70 },
    rationale: "Investigative-led with a real social third - O*NET interest code ICS (Investigative 6.29, Conventional 4.71, Social 4.52). The social 65 is what separates it from Data Engineer, which shares its analytic core but not its clinical audience."
  },
  // Hospitality Manager (11-9081.00) - O*NET interest code ECS
  {
    careerTitle: "Hospitality Manager",
    affinities: { R: 40, I: 20, A: 25, S: 65, E: 90, C: 75 },
    rationale: "Enterprising-led - O*NET interest code ECS (Enterprising 6.21, Conventional 5.22, Social 4.31). Occupancy, rate and commercial decisions, over standards and scheduling, over a large front-line team. Investigative 20 is the lowest in the catalog: this is an operating job, not an analytic one."
  },
  // Tourism & Events Manager (13-1121.00) - O*NET interest code ECS
  {
    careerTitle: "Tourism & Events Manager",
    affinities: { R: 20, I: 25, A: 40, S: 65, E: 100, C: 70 },
    rationale: "Enterprising at the 7.00 ceiling - O*NET interest code ECS, the most enterprising occupation in the catalog. High conventional (contracts, run-sheets, logistics) and social (delegates, crews, sponsors), with real artistic content at 40 in event concept and staging. Realistic 20 at the floor."
  },
  // Airline Pilot (53-2011.00) - O*NET interest code RCE
  {
    careerTitle: "Airline Pilot",
    affinities: { R: 70, I: 45, A: 25, S: 40, E: 55, C: 70 },
    rationale: "Realistic and conventional together - O*NET interest code RCE (Realistic 4.74, Conventional 4.70, Enterprising 3.81). Hand-flying and systems management inside a procedure set that does not bend. The moderate, flat profile is genuine: no interest dimension dominates, which is unusual and is what the occupation measures."
  },
  // Agricultural Scientist (Agronomist) (19-1013.00) - O*NET interest code IR
  {
    careerTitle: "Agricultural Scientist (Agronomist)",
    affinities: { R: 90, I: 95, A: 35, S: 25, E: 30, C: 50 },
    rationale: "Investigative and realistic almost equal, both very high - O*NET interest code IR (Investigative 6.71, Realistic 6.43). Field trials and soil chemistry in the field, not only the lab. Conventional 50 is the lowest of the science group; low artistic and enterprising."
  },
  // Food Technologist (19-1012.00) - O*NET interest code IRC
  {
    careerTitle: "Food Technologist",
    affinities: { R: 75, I: 80, A: 40, S: 35, E: 40, C: 60 },
    rationale: "Investigative-led with high realistic - O*NET interest code IRC (Investigative 5.71, Realistic 5.05). Formulation, shelf-life and microbiology, run on a pilot plant. Conventional 60 carries HACCP and regulatory batch records; artistic 40 is real, in new-product development."
  },
  // Agricultural Engineer (17-2021.00) - O*NET interest code RI
  {
    careerTitle: "Agricultural Engineer",
    affinities: { R: 95, I: 90, A: 35, S: 30, E: 35, C: 55 },
    rationale: "The most realistic occupation of the 29 - O*NET interest code RI (Realistic 6.65, Investigative 6.29). Irrigation, machinery and controlled-environment structures are built and commissioned on site. This is the contrast with Agricultural Scientist, whose investigative edge is the other way round."
  },
  // Satellite & Remote Sensing Scientist (19-2099.01) - O*NET interest code IRC
  {
    careerTitle: "Satellite & Remote Sensing Scientist",
    affinities: { R: 70, I: 90, A: 30, S: 20, E: 25, C: 70 },
    rationale: "Investigative-led - O*NET interest code IRC (Investigative 6.09, Realistic 4.86, Conventional 4.81). Sensor physics and image science, with the conventional half carrying calibration and processing chains. Social 20 and enterprising 25 are both near the floor."
  },
  // Film & TV Producer (27-2012.00) - O*NET interest code AE
  {
    careerTitle: "Film & TV Producer",
    affinities: { R: 35, I: 35, A: 90, S: 45, E: 85, C: 55 },
    rationale: "Artistic and enterprising together, unusually high on both - O*NET interest code AE (Artistic 6.14, Enterprising 5.78). The only occupation in the catalog where those two lead jointly, and it is exactly right: a producer both makes the creative call and raises the money."
  },
  // Data Engineer (15-1243.00) - O*NET interest code CI
  {
    careerTitle: "Data Engineer",
    affinities: { R: 40, I: 80, A: 35, S: 30, E: 40, C: 90 },
    rationale: "Conventional-led with strong investigative - O*NET interest code CI (Conventional 6.12, Investigative 5.63). Schemas, contracts, lineage and reliability first; the analysis is downstream. The conventional 90 is what separates it from AI Research Scientist, which shares nothing but the ICT stack."
  },
  // Atmospheric & Space Scientist (19-2021.00) - O*NET interest code IRC
  {
    careerTitle: "Atmospheric & Space Scientist",
    affinities: { R: 70, I: 90, A: 40, S: 40, E: 40, C: 65 },
    rationale: "Investigative-led - O*NET interest code IRC (Investigative 6.26, Realistic 4.77, Conventional 4.45). Modelling and observation in equal measure. Social 40 is higher than the rest of the space group because the output is a public forecast."
  },
  // Physicist (19-2012.00) - O*NET interest code IRC
  {
    careerTitle: "Physicist",
    affinities: { R: 70, I: 100, A: 40, S: 35, E: 30, C: 70 },
    rationale: "Investigative at the 7.00 ceiling - O*NET interest code IRC, the third and last saturating occupation in the catalog. High realistic 70 (instruments, apparatus, beam time) and conventional 70 (method and error analysis). Enterprising 30 near the floor."
  },
  // Environmental Engineer (17-2081.00) - O*NET interest code IRC
  {
    careerTitle: "Environmental Engineer",
    affinities: { R: 75, I: 90, A: 30, S: 35, E: 50, C: 65 },
    rationale: "Investigative-led with high realistic - O*NET interest code IRC (Investigative 6.10, Realistic 5.17). Enterprising 50 is the highest of the engineering group: permitting, stakeholders and remediation cases are argued, not only calculated."
  },
  // Actuary (15-2011.00) - O*NET interest code CIE
  {
    careerTitle: "Actuary",
    affinities: { R: 30, I: 65, A: 20, S: 40, E: 50, C: 90 },
    rationale: "Conventional-led - O*NET interest code CIE (Conventional 6.29, Investigative 4.45, Enterprising 3.33). Reserving standards, regulatory bases and documented method, over the modelling itself. Artistic 20 and realistic 30 at the floor."
  },
  // Investment & Financial Manager (11-3031.00) - O*NET interest code EC
  {
    careerTitle: "Investment & Financial Manager",
    affinities: { R: 25, I: 40, A: 25, S: 45, E: 100, C: 80 },
    rationale: "Enterprising at the 7.00 ceiling - O*NET interest code EC, joint most-enterprising occupation in the catalog with Tourism & Events Manager. Conventional 80 (controls, reporting, fiduciary duty). Investigative 40 is deliberately well below Financial Analyst and Actuary: this is the capital-allocation role, not the modelling one."
  },
  // Primary School Teacher (25-2021.00) - O*NET interest code S
  {
    careerTitle: "Primary School Teacher",
    affinities: { R: 40, I: 50, A: 55, S: 100, E: 40, C: 55 },
    rationale: "Social at the 7.00 ceiling and no meaningful second - O*NET interest code S, a single high-point, exactly as for Teacher (Secondary Education). Artistic 55 is the next strongest and is real: primary teaching is performance and material-making. Everything else sits mid-band."
  },
  // School Counsellor & Career Advisor (21-1012.00) - O*NET interest code SCE
  {
    careerTitle: "School Counsellor & Career Advisor",
    affinities: { R: 20, I: 50, A: 45, S: 100, E: 60, C: 60 },
    rationale: "Social at the 7.00 ceiling - O*NET interest code SCE (Social 7.00, Enterprising 3.92, Conventional 4.09). The enterprising and conventional thirds are the advocacy and the casework/records half of the job. Realistic 20 at the floor - the lowest realistic in the catalog."
  },
  // Curriculum & Instructional Designer (25-9031.00) - O*NET interest code SEI
  {
    careerTitle: "Curriculum & Instructional Designer",
    affinities: { R: 25, I: 60, A: 55, S: 90, E: 65, C: 60 },
    rationale: "Social-led but the flattest profile of the three education careers - O*NET interest code SEI (Social 6.16, Enterprising 4.26, Investigative 4.04). Enterprising 65 and investigative 60 carry the programme-leadership and evaluation halves that the classroom roles do not have."
  },
  // Cloud & Network Architect (15-1241.00) - O*NET interest code ICR
  {
    careerTitle: "Cloud & Network Architect",
    affinities: { R: 60, I: 75, A: 35, S: 35, E: 50, C: 75 },
    rationale: "Investigative and conventional together - O*NET interest code ICR (Investigative 5.28, Conventional 5.06, Realistic 4.04). Design under constraint, then standards and operability. Realistic 60 for the physical estate; enterprising 50 for vendor and cost decisions."
  },
  // Industrial Engineer (17-2112.00) - O*NET interest code CIR
  {
    careerTitle: "Industrial Engineer",
    affinities: { R: 70, I: 75, A: 25, S: 25, E: 50, C: 75 },
    rationale: "Conventional-led, and unusually so for an engineering career - O*NET interest code CIR (Conventional 5.35, Investigative 4.99, Realistic 4.96). Standards, metrics, quality systems and documented process. Deliberately the contrast with Robotics Engineer's realistic lead - the two share a category and must not share a profile."
  },
  // Video Editor (27-4032.00) - O*NET interest code AC
  {
    careerTitle: "Video Editor",
    affinities: { R: 45, I: 30, A: 80, S: 30, E: 45, C: 55 },
    rationale: "Artistic-led - O*NET interest code AC (Artistic 5.61, Conventional 3.75). Realistic 45 is higher than for any other creative career in the catalog: the craft is run on machines, timelines and codecs. Investigative 30 near the floor."
  },
  // Dietitian & Nutritionist (29-1031.00) - O*NET interest code SI
  {
    careerTitle: "Dietitian & Nutritionist",
    affinities: { R: 45, I: 70, A: 35, S: 80, E: 50, C: 50 },
    rationale: "Social-led with a strong investigative second - O*NET interest code SI (Social 5.50, Investigative 4.80). Counselling a patient sits on top of biochemistry and assessment. This is the clinical half of the Food Security & Agriculture group, and the only one of its four careers with social above 40."
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
