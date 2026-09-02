import { storage } from "./storage";
import { uaeQuestionBank } from "./questionBanks/uae";
import { validateQuestionBank, checkCoverage, flattenQuestionBank } from "../shared/questionTypes";
import { RIASEC_CAREER_AFFINITIES } from "./riasecAffinities";
import { seedCVQItems } from "./cvq-seed";
import { applyGrade8ArabicContent } from "./migrations/quiz-arabic-content";
import { applyGrades9to12ArabicContent } from "./migrations/quiz-arabic-content-grades9-12";
import { applyCareerArabicContent } from "./migrations/career-arabic-content";
import { applyCareerValuesProfiles } from "./migrations/career-values-profiles";
import { applyMissingWefAffinities } from "./migrations/wef-skill-affinities";
import { applySectorRenames } from "./migrations/sector-renames";
import { applyCareerRelatedSubjects } from "./migrations/career-related-subjects";
import { WEF_16_SKILLS, CAREER_WEF_SKILL_AFFINITIES } from "./wefSkillsData";

// ---------------------------------------------------------------------------
// VISION ALIGNMENT — UAE priority sector ↔ career-category mapping
// ---------------------------------------------------------------------------
// Feeds country_sector_categories, which drives calculateVisionScore
// (server/services/matching.ts). Without these rows the component is INERT:
// every career floors at 40 and the 20%/30% vision weight cannot discriminate.
//
// Score = 40 + 60 × (relevance/100) × rankFactor, where rankFactor comes from
// the sector's display_order (1.00 for sector #1 down to 0.85 for the LAST
// sector — #10 since Phase 3 stage 2, #8 before it).
// Only the single best-weighted candidate counts, so a second, weaker row for
// the same category never lowers a score — it documents real-but-secondary
// relevance and keeps the map robust if sector priorities are re-ordered.
//
// Relevance bands: core 90–100 · strong 70–85 · moderate 50–65 · weak <50.
// CALIBRATION RULE: every secondary row sits far enough below its category's
// intended headline that rankFactor cannot flip which sector the student is
// shown. rankFactor spans 1.00–0.85, so a lower-ranked sector needs ~18% more
// relevance to win; the smallest margin below is ~3 score points. Two rows within
// a point of each other would make the rationale hostage to sector re-ordering.
// RE-MEASURED at 10 sectors (Phase 3 stage 2). The per-rank step narrows again,
// 0.0214 -> 0.0167 (the spread is fixed at 0.15 and divided by n-1). This time
// margins WIDENED rather than tightened, because Digital Economy stopped being last:
// it is now 8th of 10 at rankFactor 0.8833, and the two new sectors take 0.8667
// and 0.85 below it. Measured margins, worst first:
//   4.0  Social Services        Education & Human Capital 60 over Healthcare 50
//   4.3  Engineering            Renewable Energy 80 over Space & Advanced Sci 70
//   4.5  Business & Management  Digital Economy 65 over Artificial Intelligence 50  ⚠️ now unreachable, see below
//   4.8  Business & Marketing   Digital Economy 60 over Artificial Intelligence 45  ⚠️ now unreachable, see below
//   5.3  Technology             Digital Economy 95 over Artificial Intelligence 75
//   6.0  Design & Architecture  Creative Industries 70 over Digital Economy 60
// (up from 3.1 as the worst at 8 sectors), and no category's headline flipped.
//
// ⚠️ But the skill modulation is ±9 score points, which is larger than any of
// the top four margins, and one career DID move on it: ELECTRICAL ENGINEER
// flipped Space & Advanced Sciences -> Renewable Energy. Both
// candidates come from the Engineering rules above, and they were 0.4 score
// points apart before stage 2 and are 0.2 apart after it - a coin flip either
// way. The new answer matches this file's own stated intent for the Engineering
// rule ("reaches Electrical + Mechanical only", i.e. Renewable Energy), so it
// is left as measured; pinning it with a per-career override would make it
// deterministic and is the recommended follow-up. See docs/phase3-stage2-done.md.
// `sector` MUST be byte-identical to the countries.prioritySectors entry —
// recommendations.routes.ts localises reasoning by \b-substituting that exact
// string for its Arabic counterpart.
//
// ---------------------------------------------------------------------------
// SECTOR NAME HISTORY — the full chain, for anyone reading an older doc, commit
// message or a stored recommendations.reasoning written before a rename.
// ---------------------------------------------------------------------------
//   ORIGINAL (pre-Phase 1)   PHASE 2                          PHASE 4 (current)
//   Biotechnology         -> Healthcare & Life Sciences     -> Healthcare
//   Space Exploration     -> Space & Future Sciences        -> Space & Advanced Sciences
//   Renewable Energy      -> Renewable Energy & Sustainab.  -> Renewable Energy
//   Education             -> Education & Human Capital      -> (unchanged)
//   Technology            -> (unchanged)                    -> Digital Economy
//   Creative Ind. & Media  (added Phase 1)                  -> Cultural & Creative Industries
//   Financial Svcs & FinTech (added Phase 1)                -> Financial Services
//   Tourism & Hospitality  (added Phase 3)                  -> Tourism
//   Food Security & Agri.  (added Phase 3)                  -> Food Security
//   Artificial Intelligence  (unchanged throughout)
//
// PHASE 4 (docs/uae-official-sectors.md §3 and §5): eight sectors RENAMED onto
// the exact wording used by official UAE government sources, and six business
// careers moved OFF the Technology/Digital Economy catch-all onto overrides.
// The renames are LABELS ONLY - no vector, relevance, display order or category
// rule changed, and every career except those six keeps its sector by identity
// and its score to the last decimal. Grounding per name is cited in that report;
// the short form is on each row of SECTOR_RENAMES.
// Note that Phase 4 takes the name "Renewable Energy" BACK from Phase 2, so the
// two rename lists had to be collapsed rather than chained - see
// server/migrations/sector-renames.ts.
//
// PHASE 2 (priority-alignment plan): four sectors renamed, per the chain above.
// Artificial Intelligence and Digital Economy are deliberately KEPT SEPARATE
// (the white paper carries one merged sector; the product decision is to keep
// both). No vector, relevance or override changed - the renames were labels
// only, and were verified on staging to leave all 37 career scores identical.
// A rename CANNOT be done by the seed upsert; see
// server/migrations/sector-renames.ts for why, and note that it must run
// BEFORE the sector upsert loop.
//
// PHASE 1 (priority-alignment plan, docs/priority-alignment-plan.md section 6):
// Cultural & Creative Industries and Financial Services are ADDED, and the
// Creative Arts, Media & Communications, Design & Architecture and Finance
// categories are re-pointed off the catch-all sector (named Technology then,
// Digital Economy now) onto them. That sector headlined 8 of 12 mapped
// categories and won 20 of 37 careers; after Phase 1 it headlined 4, and after
// Phase 4's six business overrides it headlines 2 of 14 mapped categories. Its
// old rows are KEPT, demoted to documented secondaries - they state real but
// non-defining relevance, and a second, weaker row for a category never lowers
// a score (see above).
//
// ⚠️ TWO CATEGORY RULES ARE NOW UNREACHABLE, deliberately and not deleted:
// Business & Management and Business & Marketing. Every career in both
// categories now carries a per-career override (Phase 3 gave Hospitality
// Manager and Tourism & Events Manager one; Phase 4 gave the remaining six),
// and override-exclusive semantics mean a category rule can never fire for a
// career that has one. The rules are kept as the fallback for the NEXT career
// added to either category - delete them and a new business career silently
// floors at 40. Same reasoning as the absent Culinary Arts rule below, arrived
// at from the opposite direction.
//
// Culinary Arts is still absent, but the REASON changed in Phase 3 stage 2.
// It used to be "no UAE priority sector is genuinely about food service, so
// Chef floors at 40 - a real answer, not a gap". Tourism now
// exists and Chef is re-homed into it by a per-career override, so the floor
// is gone. The category rule stays absent only because Chef is the category's
// sole member; add one if more culinary careers land.
// Science is absent too, for a different reason — all eight of its members
// (Environmental Scientist, Space Scientist, Geneticist, Agricultural
// Scientist, Food Technologist, Satellite & Remote Sensing Scientist,
// Atmospheric & Space Scientist, Physicist) carry overrides below, and
// override-exclusive semantics mean any Science category rule could never fire.
// Aviation & Transport, new in stage 2, is absent for the same reason: its only
// member is Airline Pilot, which carries an override.
export const UAE_SECTOR_CATEGORY_RULES: Array<{
  sector: string;
  category: string;
  relevance: number;
  notes: string;
}> = [
  // — Digital Economy (category rule reaches Product Manager, Software Engineer, UX/UI Designer, Web Developer; Data Scientist is overridden below)
  { sector: "Digital Economy", category: "Technology", relevance: 95, notes: "Core: digital transformation, smart cities and the innovation ecosystem are built by this category." },
  { sector: "Artificial Intelligence", category: "Technology", relevance: 75, notes: "AI systems are specified, built and deployed by software and data practitioners." },
  { sector: "Space & Advanced Sciences", category: "Technology", relevance: 55, notes: "MBRSC satellite/Mars programmes run on flight software, ground systems and data pipelines." },
  { sector: "Renewable Energy", category: "Technology", relevance: 50, notes: "Smart-grid, energy-management and monitoring platforms." },
  { sector: "Education & Human Capital", category: "Technology", relevance: 50, notes: "EdTech platforms behind the national digital-learning push." },

  // — Engineering (category rule reaches Electrical + Mechanical only; the other three are overridden below)
  { sector: "Space & Advanced Sciences", category: "Engineering", relevance: 70, notes: "Aerospace, propulsion, avionics and satellite hardware." },
  { sector: "Renewable Energy", category: "Engineering", relevance: 80, notes: "Solar, nuclear, grid and storage plant engineering for the 2050 clean-energy target." },
  { sector: "Digital Economy", category: "Engineering", relevance: 65, notes: "Advanced manufacturing, robotics and smart infrastructure." },
  { sector: "Artificial Intelligence", category: "Engineering", relevance: 50, notes: "Automation and intelligent control systems." },

  // — Healthcare (Dentist, Doctor, Nurse, Pharmacist, Physical Therapist, Psychologist)
  { sector: "Healthcare", category: "Healthcare", relevance: 85, notes: "The sector is defined as advanced healthcare, genomics and life sciences — clinicians are its delivery workforce." },
  { sector: "Artificial Intelligence", category: "Healthcare", relevance: 55, notes: "AI diagnostics and clinical decision support." },
  { sector: "Digital Economy", category: "Healthcare", relevance: 50, notes: "National digital-health platforms (Malaffi, Riayati) and telemedicine." },

  // — Education (Teacher)
  { sector: "Education & Human Capital", category: "Education", relevance: 100, notes: "Core: the sector IS this category's workforce." },
  { sector: "Digital Economy", category: "Education", relevance: 60, notes: "Digital learning delivery and classroom technology." },
  { sector: "Artificial Intelligence", category: "Education", relevance: 55, notes: "AI is being taught as national school curriculum content." },

  // — Business & Management (Entrepreneur, HR Manager, Management Consultant)
  { sector: "Digital Economy", category: "Business & Management", relevance: 65, notes: "Founding and scaling ventures inside the innovation ecosystem." },
  { sector: "Artificial Intelligence", category: "Business & Management", relevance: 50, notes: "AI-adoption programmes across government and enterprise." },

  // — Business & Marketing (Digital Marketing Specialist, Marketing Manager, Sales Manager)
  { sector: "Digital Economy", category: "Business & Marketing", relevance: 60, notes: "Digital economy, e-commerce and platform go-to-market." },
  { sector: "Artificial Intelligence", category: "Business & Marketing", relevance: 45, notes: "AI-driven analytics, targeting and personalisation." },

  // — Creative Arts (Fashion Designer, Graphic Designer, Photographer, Video Game Designer)
  { sector: "Cultural & Creative Industries", category: "Creative Arts", relevance: 90, notes: "Core: these four careers ARE the creative economy the Dubai Creative Economy Strategy and Creative UAE are built on. Previously headlined Technology at 55 — a catch-all attribution, not a statement about the sector these careers serve." },
  { sector: "Digital Economy", category: "Creative Arts", relevance: 55, notes: "Secondary: digital creative tooling and the games sector. Real, but no longer the headline — Cultural & Creative Industries is." },
  { sector: "Artificial Intelligence", category: "Creative Arts", relevance: 40, notes: "Weak band: generative tooling is entering design and content work but is not the job." },

  // — Design & Architecture (Architect, Interior Designer)
  // Deliberately 70, not 90: architecture is a design discipline but it is also
  // an engineering and planning one, and the smart-city claim below is genuine.
  // The 10-point gap over Digital Economy is the whole margin here — see the
  // calibration note at the top and keep Cultural & Creative Industries ranked
  // ABOVE Digital Economy, or this category becomes a coin-flip on re-ordering.
  { sector: "Cultural & Creative Industries", category: "Design & Architecture", relevance: 70, notes: "Strong: architecture and interior design are design professions before they are technical ones; the creative-economy strategy names design as one of its pillars." },
  { sector: "Digital Economy", category: "Design & Architecture", relevance: 60, notes: "Secondary: smart-city planning and design (Dubai 2040, Masdar City)." },
  { sector: "Renewable Energy", category: "Design & Architecture", relevance: 50, notes: "Sustainable and low-carbon building design." },

  // — Finance (Accountant, Financial Analyst)
  { sector: "Financial Services", category: "Finance", relevance: 95, notes: "Core: DIFC and ADGM make financial services a first-order national pillar, and this category IS its workforce. Previously headlined Technology at 55, which described the FinTech tooling rather than the sector the careers serve." },
  { sector: "Digital Economy", category: "Finance", relevance: 55, notes: "Secondary: the digital-economy finance stack. The FinTech claim now sits with the sector that owns it." },
  { sector: "Artificial Intelligence", category: "Finance", relevance: 40, notes: "Weak band: algorithmic analysis and risk models apply to analysts far more than to accountants." },

  // — Legal (Lawyer)
  { sector: "Digital Economy", category: "Legal", relevance: 45, notes: "Weak band: legal frameworks for the digital economy. No UAE priority sector is genuinely legal-led." },

  // — Media & Communications (Content Creator, Journalist)
  { sector: "Cultural & Creative Industries", category: "Media & Communications", relevance: 90, notes: "Core: the sector's name is this category. UAE media is a named creative-economy pillar (Dubai Media City, twofour54, the creator economy)." },
  { sector: "Digital Economy", category: "Media & Communications", relevance: 55, notes: "Secondary: the distribution platforms. The medium is not the sector — Cultural & Creative Industries is." },
  { sector: "Artificial Intelligence", category: "Media & Communications", relevance: 40, notes: "Weak band: AI content tooling assists but does not define the work." },

  // — Social Services (Social Worker)
  { sector: "Education & Human Capital", category: "Social Services", relevance: 60, notes: "School social work and student wellbeing sit inside the education system." },
  { sector: "Healthcare", category: "Social Services", relevance: 50, notes: "Healthcare social work inside the advanced-healthcare sector." },
];

// Per-career overrides: OVERRIDE-EXCLUSIVE — once a career has any override row,
// category rules stop applying to it entirely. Used only where the career's
// category is too coarse and would otherwise attribute the career to the wrong
// sector: the Engineering rule cannot tell a biomedical engineer from a civil
// engineer, so all five would share one rationale.
export const UAE_SECTOR_CAREER_OVERRIDES: Array<{
  sector: string;
  careerTitle: string;
  relevance: number;
  notes: string;
}> = [
  { sector: "Renewable Energy", careerTitle: "Renewable Energy Engineer", relevance: 100, notes: "The career is the sector. Pins Renewable Energy and lifts 84 -> 95; the Engineering rule cannot express that this career IS the sector." },
  { sector: "Healthcare", careerTitle: "Biomedical Engineer", relevance: 90, notes: "Medical devices and life-sciences engineering. The Engineering rule would have credited Renewable Energy (84) - wrong sector for this career." },
  { sector: "Renewable Energy", careerTitle: "Environmental Scientist", relevance: 85, notes: "Climate leadership and the 50%-clean-energy-by-2050 target. Its category (Science) has no rule, so without this it would floor at 40." },
  { sector: "Digital Economy", careerTitle: "Civil Engineer", relevance: 70, notes: "Smart-city and infrastructure delivery. The Engineering rule would have credited Renewable Energy (84), overstating a civil engineer's clean-energy role." },
  { sector: "Space & Advanced Sciences", careerTitle: "Aerospace Engineer", relevance: 100, notes: "The career is the sector: MBRSC satellites, launch and propulsion. The Engineering rule would have credited Renewable Energy (80) - wrong sector for this career." },
  { sector: "Space & Advanced Sciences", careerTitle: "Space Scientist (Astrophysicist)", relevance: 95, notes: "Mars 2117 and planetary science - the research half of the sector. Its category (Science) has no rule, so without this it would floor at 40, exactly as Environmental Scientist would." },
  { sector: "Artificial Intelligence", careerTitle: "Data Scientist", relevance: 90, notes: "UAE frames data science under its flagship AI priority — AI Strategy 2031's 'Data and Infrastructure' pillar names data professionals as AI-strategy talent. The Digital Economy rule (88, headlined 'Digital Economy') understates it; this headlines Artificial Intelligence at 94." },

  // --- PHASE 3 STAGE 2 ------------------------------------------------------
  // 18 rows: 16 of the 29 new careers, plus the two re-homes.
  //
  // THE RULE APPLIED, and it is deliberately narrow: a new career gets an
  // override if and only if the category rules would put it in the WRONG
  // sector, would FLOOR it, or would materially UNDERSTATE a sector-defining
  // career (plan §5 rule 3). The other 13 new careers are attributed correctly
  // by an existing category rule and get NO row, on purpose - an override is
  // override-EXCLUSIVE, so adding one to a career that does not need it would
  // silently delete that career's documented secondary sectors. Cybersecurity
  // Analyst and Cloud & Network Architect (Digital Economy @95), Risk & Compliance
  // Officer, Actuary and Investment & Financial Manager (Finance @95), the
  // three Education careers (Education @100), Film & TV Producer and Video
  // Editor (Media & Communications @90), Health Informatics Specialist
  // (Healthcare @85) and Chemical + Environmental Engineer (Engineering @80)
  // are all in that group. See docs/phase3-stage2-done.md §3.
  //
  // Two categories floor without a row, exactly as Science already did:
  //   Science            - 6 of the 29 are Science; it has no category rule.
  //   Aviation & Transport - a NEW category, introduced by Airline Pilot alone.

  // — Artificial Intelligence: the flagship sector had ONE career (Data Scientist)
  { sector: "Artificial Intelligence", careerTitle: "AI Research Scientist", relevance: 95, notes: "15-1221.00 is the only rated O*NET code that IS AI research (MBZUAI, TII, G42). Its category (Technology) headlines Digital Economy @95, which is the catch-all this phase is dismantling; only an override moves the sector's defining research career into the sector." },
  { sector: "Artificial Intelligence", careerTitle: "Robotics Engineer", relevance: 85, notes: "Re-homed from the dropped Advanced Manufacturing sector (docs/career-sourcing-map.md §3.11). The Engineering rule would have credited Renewable Energy (80) - wrong sector. Autonomy and intelligent control are the AI 2031 deployment story." },
  { sector: "Artificial Intelligence", careerTitle: "Data Engineer", relevance: 85, notes: "AI 2031's 'Data & Infrastructure' pillar, same argument as Data Scientist @90 above and pitched one band below it: pipelines serve the models rather than being them. Its category (Technology) would headline Digital Economy @95." },

  // — Space & Advanced Sciences: all three are Science, which has no category rule
  { sector: "Space & Advanced Sciences", careerTitle: "Satellite & Remote Sensing Scientist", relevance: 95, notes: "MBRSC's actual business is Earth observation (KhalifaSat, MBZ-Sat), which the sector's two existing careers do not represent. Its category (Science) has no rule, so without this it would floor at 40." },
  { sector: "Space & Advanced Sciences", careerTitle: "Atmospheric & Space Scientist", relevance: 88, notes: "National Center of Meteorology and the UAEREP rain-enhancement programme - a funded national research line. Science has no category rule; without this it floors at 40." },
  { sector: "Space & Advanced Sciences", careerTitle: "Physicist", relevance: 85, notes: "The 'Future Sciences' half of the sector name, currently unrepresented - TII's Quantum Research Centre. Pitched below the two mission-facing space careers because the claim is a research one. Science has no category rule; without this it floors at 40." },

  // — Renewable Energy
  { sector: "Renewable Energy", careerTitle: "Electrical Engineer", relevance: 80, notes: "PHASE 3 STAGE 3 — RESOLVES A COIN FLIP, does not change the answer. Power systems, transmission, grid integration and plant electrical are what an electrical engineer does for the 50%-clean-energy target, and the Engineering category rule above was written for exactly this career plus Mechanical Engineer ('reaches Electrical + Mechanical only'). But the rule left it 0.4 score points from Space & Advanced Sciences at 39 careers and 0.2 points the other way at 68 - decided by rounding, not by meaning, and re-orderable by any future sector addition. Relevance is 80, byte-identical to the Engineering rule's, so the SCORE is unchanged (87.55) and only the determinism is new. Cost, recorded: override-exclusive semantics drop this career's documented secondaries (Space 70, Digital Economy 65, Artificial Intelligence 50) - none of which was ever going to win, but they are gone." },
  { sector: "Renewable Energy", careerTitle: "Nuclear Engineer", relevance: 92, notes: "Barakah is 4 reactors, 5.6 GW and ~25% of UAE electricity, with an explicit ENEC Emiratisation pipeline - the most UAE-specific occupation in the catalog. The Engineering rule reaches the right sector but at 80, the same as a generic mechanical engineer; this says the career is closer to defining it. UPLIFT ONLY - the sector is unchanged." },

  // — Healthcare
  { sector: "Healthcare", careerTitle: "Geneticist", relevance: 95, notes: "The Emirati Genome Programme is the world's largest national genomic database (750k+ samples). This is the career that finally backs the '& Life Sciences' half of the sector's name. Its category (Science) has no rule, so without this it would floor at 40." },

  // — Financial Services
  { sector: "Financial Services", careerTitle: "Lawyer", relevance: 70, notes: "RE-HOME. Lawyer was the catalog's weakest attribution: Digital Economy @45 (named Technology at the time), a 'weak band' rule that server/seed.ts itself describes as covering 'legal frameworks for the digital economy'. DIFC Courts and ADGM are English-common-law jurisdictions with their own judiciaries and a real regulatory and corporate legal market - that is a genuine sector claim. 70, not higher: the sector is not legal-led, and inventing a 90 to avoid a low score is exactly what plan §5 rule 4 forbids." },

  // — Digital Economy
  { sector: "Digital Economy", careerTitle: "Industrial Engineer", relevance: 80, notes: "Re-homed from the dropped Advanced Manufacturing sector. The Engineering rule would have credited Renewable Energy (80) - wrong sector for a process and systems engineer. Operation 300bn / Make it in the Emirates is a smart-manufacturing programme, which is the Digital Economy rule's own 'advanced manufacturing, robotics and smart infrastructure' wording." },

  // — Tourism (NEW SECTOR - every one of its four careers needs a row)
  { sector: "Tourism", careerTitle: "Hospitality Manager", relevance: 95, notes: "The career is the sector: ~11,300 new hotel rooms by 2027 and 15,000+ hospitality jobs. Its category (Business & Management) headlines Digital Economy @65 - without this, a hotel manager is attributed to the digital-economy sector." },
  { sector: "Tourism", careerTitle: "Tourism & Events Manager", relevance: 90, notes: "Business tourism is the strategy's own pillar (Dubai World Trade Centre, ADNEC). Same category problem as Hospitality Manager: Business & Management would credit Digital Economy @65." },
  { sector: "Tourism", careerTitle: "Airline Pilot", relevance: 85, notes: "⚠️ LEAST-BAD HOME, flagged rather than hidden (docs/career-sourcing-map.md §3.7). Aviation is not tourism; but Digital Economy (then named Technology) is the catch-all this phase is dismantling and there is no Transport & Logistics sector. Its category, Aviation & Transport, is NEW and has no rule at all, so the alternative is the floor. Emirates, Etihad and flydubai run published cadet pipelines and are among the largest UAE employers. If an 11th sector is ever added, this row is the first thing to revisit." },
  { sector: "Tourism", careerTitle: "Chef", relevance: 85, notes: "RE-HOME. Chef was the only career in the catalog with NO sector at all - it floored at 40, and server/seed.ts:37-38 explained that as 'no UAE priority sector is genuinely about food service'. That was true, and this sector is the answer to it. Dubai's gastronomy positioning (Michelin, 30+ starred restaurants) is a named part of the tourism strategy. An override rather than a Culinary Arts category rule because Chef is the category's only member; add the rule instead if more culinary careers land." },

  // — Food Security (NEW SECTOR - every one of its four careers needs a row)
  { sector: "Food Security", careerTitle: "Agricultural Scientist (Agronomist)", relevance: 95, notes: "National Food Security Strategy 2051 desert agronomy; ICBA in Dubai is a dedicated saline-agriculture research institute. Its category (Science) has no rule, so without this it would floor at 40." },
  { sector: "Food Security", careerTitle: "Agricultural Engineer", relevance: 92, notes: "Vertical farming is the strategy's named technology - Emirates Bustanica is the world's largest vertical farm. Controlled-environment agriculture is engineering, and the Engineering category rule would have credited Renewable Energy (80)." },
  { sector: "Food Security", careerTitle: "Food Technologist", relevance: 90, notes: "NFSS 2051 food processing and safety (Silal, Agthia). Science has no category rule; without this it floors at 40." },
  { sector: "Food Security", careerTitle: "Dietitian & Nutritionist", relevance: 80, notes: "⚠️ CONTESTED, and the weakest row here. The career bridges Food Security ↔ Healthcare and its category (Healthcare) would credit Healthcare @85 - a defensible answer. It is placed here because the National Nutrition Strategy 2030 is a food-system commitment and because the sector's other three careers are all upstream of the plate; 80, below the other three, records that the claim is weaker. Reviewable." },

  // --- PHASE 4: the six BUSINESS careers, off the catch-all -----------------
  // docs/uae-official-sectors.md §4 is the finding these six implement: NO
  // official UAE government source treats business, entrepreneurship or SMEs as
  // a distinct economic SECTOR. The National Agenda for Entrepreneurship and
  // SMEs is built entirely of ENABLERS (its seven themes are ease of doing
  // business, innovation, business support, digital transformation, funding,
  // human capital and increasing demand), its aim is "an entrepreneurial
  // nation", and one of its four directives is "enhancing the culture of
  // entrepreneurship amongst DIFFERENT SECTORS of the society". 'We the UAE
  // 2031' calls it an "entrepreneurial ECOSYSTEM" and does not list it among the
  // Forward Economy's eight named sectors. So there is no 11th sector to create
  // and no official name to give one - these six are distributed instead.
  //
  // Every one of them previously headlined the catch-all: Business & Management
  // @65 and Business & Marketing @60, rules whose own notes ("founding and
  // scaling ventures inside the innovation ecosystem", "digital economy,
  // e-commerce and platform go-to-market") describe the ecosystem, not the
  // sector these careers serve. Relevances below are deliberately NOT uplifts
  // for their own sake - two of the six keep a value at or near the rule they
  // replace, because the point is the attribution, not the score.
  //
  // COST, recorded once for all six: override-exclusive semantics drop each
  // career's documented secondary (Artificial Intelligence @50 or @45). None
  // was ever going to win, but they are gone.
  { sector: "Education & Human Capital", careerTitle: "Human Resources Manager", relevance: 75, notes: "The cleanest official hook of the six. 'Human capital' is the second half of this sector's name and 'We the UAE 2031' names it as the MAIN DRIVER of the Forward Economy pillar; the National Employment Strategy 2031 (MoHRE) makes workforce development and Emiratisation a national programme with statutory quotas, and HR managers are the workforce that administers it. 75 is the bottom of the core band, above Lawyer's re-home at 70 because the claim is stronger than a jurisdiction one - but not higher, because an HR manager is not an educator. ⚠️ THE LARGEST SCORE MOVE OF THE SIX, 75.28 -> 89.50 (+14.22), and it is not all relevance: this career's WEF profile aligns with the Education & Human Capital vector strongly enough to take the FULL +15 skill modulation (75 -> 90), on top of a rank rise from 8th to 6th. If 89.5 reads high for an HR manager, the number to change is this relevance, not the vector." },
  { sector: "Digital Economy", careerTitle: "Digital Marketing Specialist", relevance: 80, notes: "The strongest sector fit of the six. The Business & Marketing rule it replaces already made the digital-economy claim in its own notes ('digital economy, e-commerce and platform go-to-market') - it just made it at 60 on behalf of three careers, only one of which IS digital-economy work. The Digital Economy Strategy targets 9.7%->19.4% of GDP; this career sits inside that target rather than adjacent to it. 80, not 95: the sector's defining careers are the engineers and data professionals, not its marketers. Measured 75.33 -> 85.93." },
  { sector: "Digital Economy", careerTitle: "Entrepreneur", relevance: 70, notes: "⚠️ LEAST-BAD HOME, flagged rather than hidden - the same status as Airline Pilot above. docs/uae-official-sectors.md §4.3 finds that an entrepreneur is best modelled as CROSS-CUTTING, scoring across all ten sectors, which this schema cannot express: a career gets one headline. Digital Economy is chosen because the National Agenda for Entrepreneurship and SMEs frames its target in startups and unicorns (one million startups, ten unicorns) and that framing is a digital-economy one. 70, below Digital Marketing Specialist at 80, records that the placement is a compromise and not a claim that founders belong to the digital sector. Measured 82.40 -> 85.05, the smallest move of the six - it stays on the same sector ROW, and only its candidate source changes from category rule to override. If a cross-cutting attribution is ever added, this row is the first thing to revisit." },
  { sector: "Financial Services", careerTitle: "Management Consultant", relevance: 65, notes: "⚠️ THE WEAKEST OF THE SIX, and said so plainly. The official home is 'services', which the Forward Economy names as a sector and this catalog does not carry; Financial Services is the nearest thing to it. DIFC and ADGM are real professional-services clusters and consultants are a real part of them, but a management consultant is not a financial-services professional. 65 - deliberately unchanged from the Business & Management rule it replaces, so no relevance is invented to justify the move. Measured on staging the score still rises 81.02 -> 84.61 (+3.59), because the sector RANK changed (Financial Services is 5th at rankFactor 0.9333, the catch-all is 8th at 0.8833) and the skill modulation re-runs against a different vector. Reviewable, and the first candidate to move if a Services or Advanced Industries sector is ever added." },
  { sector: "Financial Services", careerTitle: "Sales Manager", relevance: 60, notes: "Same 'services' argument as Management Consultant, one band lower. 60 is byte-identical to the Business & Marketing rule it replaces - deliberately, because a re-home onto a better-grounded sector is not a reason to inflate a score (plan §5 rule 4). The SCORE still moves, 73.83 -> 76.45 (+2.62), and it is worth knowing why: relevance is only one of three terms. The sector rank rises (5th, 0.9333, against the catch-all's 8th, 0.8833) and the ±15-point skill modulation re-runs against a different vector. A rename cannot move a score; a re-home always can. The claim is the DIFC/ADGM commercial ecosystem, not that sales is a financial discipline." },
  { sector: "Cultural & Creative Industries", careerTitle: "Marketing Manager", relevance: 70, notes: "Brand, advertising and communications sit inside the creative economy: the National Strategy for the Cultural and Creative Industries targets 5% of GDP by 2031 and the Dubai Creative Economy Strategy names advertising, design and audio-visual media among its fields. 70 matches this sector's Design & Architecture rule, which is the calibration this claim belongs at - a strong-but-not-defining relevance. Measured 76.31 -> 85.24. Distinguished from Digital Marketing Specialist @80 on purpose: that career is platform and performance work (digital economy), this one is brand and campaign work (creative industries)." },
];

// Define UAE sector-to-WEF skills mappings with importance scores (0-100)
// Based on UAE Centennial 2071 priorities and WEF Future of Jobs 2025 insights.
//
// ---------------------------------------------------------------------------
// THESE VECTORS DEFINE THE GEOMETRY OF THE VISION SCORE - read before editing
// ---------------------------------------------------------------------------
// calculateVisionScore (server/services/matching.ts) modulates each seeded
// sector-category relevance by how well a career's WEF affinity profile fits
// the sector's skills here. Two properties matter more than the individual
// numbers, and both were violated by the original 4-5-skill vectors:
//
// 1. SECTORS MUST BE SEPARABLE. With the original vectors the six sectors
//    spanned about three independent directions - Space & Advanced Sciences and
//    Renewable Energy correlated at r=0.99 across the career
//    catalog, because both were {Scientific Literacy, Critical Thinking,
//    Numeracy} plus one low-variance competency. A skill that appears in most
//    sectors carries weight without carrying information.
//
// 2. THE SKILLS USED MUST DISCRIMINATE BETWEEN CAREERS. Across the 576
//    career affinities the six foundational literacies vary widely (Scientific
//    Literacy sd 19.0, Financial Literacy 14.7, Numeracy 13.9, Cultural and
//    Civic Literacy 13.1) while the ten competencies are near-constant
//    (Persistence and Grit sd 5.1, Initiative 5.5, Adaptability 5.9). The
//    original map used NO sector for Financial Literacy, Cultural and Civic
//    Literacy, Leadership or Persistence and Grit - discarding two of the four
//    most discriminating columns in the whole matrix - while putting Critical
//    Thinking (sd 6.9) in five of six sectors.
//
// Adding a skill to a sector is not free: the score is an importance-weighted
// MEAN, so a low-variance skill dilutes the discriminating ones. Add a skill
// only where the sector genuinely requires it.
export const UAE_SECTOR_WEF_SKILLS: Array<{
  name: string;
  displayOrder: number;
  description: string;
  skills: Record<string, number>;
}> = [
  {
    name: "Artificial Intelligence",
    displayOrder: 1,
    description: "AI-driven innovation across government services, economy, and society",
    // Unchanged. No orphaned skill belongs here more than what is already
    // present, and Digital Economy - its nearest neighbour at r=0.79 - is the one
    // being widened, which separates the pair without diluting this vector.
    skills: {
      "ICT Literacy": 95,
      "Critical Thinking and Problem Solving": 90,
      "Numeracy": 85,
      "Creativity": 80,
      "Adaptability": 75,
    }
  },
  {
    name: "Space & Advanced Sciences",
    displayOrder: 2,
    description: "Leadership in space science, Mars colonization, and satellite technology",
    // REWEIGHTED to break the Space <-> Renewable Energy
    // collinearity (r=0.888). The old vector led on Scientific Literacy 95 /
    // Critical Thinking 90 / Numeracy 85 - the SAME high-variance core
    // Renewable Energy leads on - and then differentiated with
    // Initiative (sd 5.5), Collaboration (sd 5.9) and Persistence and Grit (sd
    // 5.1), the three LOWEST-variance skills in the catalog. Those three carry
    // weight without carrying information, so the shared core decided the whole
    // column: on the shared top-3 alone the two sectors correlate at r=1.000.
    //
    // The fix is CONTRAST, not coverage. Numeracy is promoted to the sector's
    // signature (Renewable Energy holds it at only 75),
    // Scientific Literacy is demoted so it is no longer the dominant shared
    // term, and Creativity is added as a high-variance skill NEITHER Renewable
    // Energy & Sustainability nor Healthcare carries. Result:
    // Space <-> Renewable Energy falls 0.888 -> 0.530.
    //
    // ICT Literacy is deliberately held at 65, well under Digital Economy's and
    // Artificial Intelligence's 95. Leading on ICT scores lower against
    // Renewable Energy but simply MOVES the collinearity to
    // Artificial Intelligence (measured r=0.953, with Software Engineer and
    // Video Game Designer surfacing as top "space" careers). Space is
    // science-led, not IT-led, and the vector has to say so.
    skills: {
      // Orbital mechanics, trajectory optimisation, delta-v and error budgets.
      // sd 14.0, the 3rd most discriminating column, and Renewable Energy &
      // Sustainability holds it at only 75 - so at 95 this separates rather
      // than shares.
      "Numeracy": 95,
      // Novel engineering under extreme mass, power, thermal and radiation
      // constraints, where no off-the-shelf part exists. sd 12.0, and neither
      // Renewable Energy nor Healthcare
      // carries it at all.
      "Creativity": 85,
      // Astrophysics and planetary science: still essential, but DEMOTED from
      // 95 so it stops dominating the vector. Renewable Energy
      // 90, Healthcare 95 both lead on it; matching them there
      // is what caused the collinearity.
      "Scientific Literacy": 80,
      // Exploration and discovery is the sector's literal purpose. sd 7.3 - a
      // modest signal, kept because it is genuinely sector-defining.
      "Curiosity": 75,
      // Flight software, telemetry, autonomy and simulation. Real, but held well
      // below the ICT-led sectors on purpose (see note above).
      "ICT Literacy": 65,
      // RE-HOMED here in Phase 3 stage 3, at 55 rather than the 85 this sector
      // used to carry. Healthcare was the only sector holding
      // Persistence and Grit, and the stage 3 retune dropped it from there
      // (sd 5.1 - the least discriminating column in the whole 68 x 16 matrix,
      // and it was doing none of the separating work Healthcare needed). That
      // would have left the skill referenced by NO sector, which the
      // "every WEF skill is used by at least one sector" guard in
      // matching.vision.test.ts forbids - and rightly: an orphaned skill is
      // invisible to the vision score entirely.
      //
      // Space is where it belongs and this file already said so when it dropped
      // it ("Space work genuinely needs all three; so does every other career
      // in the catalog"). Multi-year missions, launch windows that slip a year,
      // hardware that fails and is rebuilt. At 55 it is the lowest weight in
      // any vector, which is the honest statement: real, and not discriminating.
      // Measured: this LOWERS catalog max |r| 0.765 -> 0.763 and moves no career.
      "Persistence and Grit": 55,
      // DROPPED, deliberately:
      //   Critical Thinking (was 90) - sd 6.9 and present in 5 of 6 sectors:
      //     weight without information, per the geometry note at the top.
      //   Initiative (80), Collaboration (75), Persistence and Grit (85) - sd
      //     5.5 / 5.9 / 5.1, the three least discriminating columns in the
      //     matrix. Space work genuinely needs all three; so does every other
      //     career in the catalog, which is exactly why they cannot separate
      //     this sector from any other.
    }
  },
  {
    name: "Healthcare",
    displayOrder: 3,
    description: "Advanced healthcare, genomics, and life sciences innovation",
    // RETUNED (Phase 3 stage 3) to break the Healthcare <-> Space collinearity.
    // Measured over the 68-career catalog, this pair was the WORST in the
    // matrix at r=0.903 - worse than anything Phase 1 or Phase 2 ever had, and
    // worse than the 0.851 it sat at when the catalog was 39 careers.
    //
    // WHY IT BROKE. Nothing about either vector changed; the CATALOG changed.
    // Stage 1 added six Science-category careers (Geneticist, Physicist,
    // Atmospheric & Space Scientist, Satellite & Remote Sensing Scientist,
    // Agricultural Scientist, Food Technologist) plus three science-led
    // engineers, all of which load Scientific Literacy, ICT and Curiosity
    // together - which is exactly the region where the old vector overlapped
    // Space & Advanced Sciences. Three of this sector's six skills (Critical
    // Thinking sd 6.7, Collaboration sd 5.9, Persistence and Grit sd 5.1) were
    // the three LEAST discriminating columns in the matrix, so they could not
    // pull it back apart: the shared Scientific Literacy / ICT / Curiosity core
    // decided the whole column. This is the same failure the Space vector had
    // against Renewable Energy in Phase 1, and it has the same fix.
    //
    // THE FIX IS CONTRAST, NOT COVERAGE, and it is a fix by SUBTRACTION plus
    // two genuinely missing skills. Scientific Literacy stays the lead at 95 -
    // it is honest and it is what the sector is. What changes is the second
    // term: Social and Cultural Awareness (sd 14.1, the 5th most discriminating
    // column) and Communication (sd 10.4) replace Critical Thinking and
    // Persistence and Grit. Space & Advanced Sciences carries NEITHER, and
    // neither did this vector - which was the real defect. Seven of this
    // sector's nine careers are clinicians whose work IS the consultation, in a
    // country where the patient and the clinician usually do not share a first
    // language. A healthcare vector with no Communication term was describing a
    // laboratory, not a health system.
    //
    // Measured result on the live 68-career catalog: Healthcare <-> Space
    // 0.903 -> 0.338, Healthcare <-> Food Security 0.806 -> 0.716, Healthcare
    // <-> Renewable Energy 0.623 -> 0.326, Healthcare <-> Artificial
    // Intelligence 0.613 -> 0.021. Together with the Education change below,
    // catalog max |r| 0.903 -> 0.763 and mean |r| 0.397 -> 0.354, with NO pair
    // left above 0.80. ZERO careers changed sector and zero careers floor.
    //
    // docs/priority-alignment-plan.md §2 proposed Social and Cultural Awareness
    // at 80 for this sector back when it had no measurement to justify it. It
    // was right, for the reason it could not yet show.
    skills: {
      // Genomics, pharmacology, physiology, diagnosis. Unchanged, and still the
      // highest-variance column in the matrix (sd 19.5).
      "Scientific Literacy": 95,
      // Patient, family and care team, across languages and cultures. sd 14.1.
      // The term that separates this sector from every science sector, and the
      // one the old vector was missing entirely.
      "Social and Cultural Awareness": 85,
      // History-taking, consent, explanation, handover. sd 10.4, and again
      // carried by no science sector.
      "Communication": 80,
      // Malaffi and Riayati, the Emirati Genome Programme's bioinformatics, and
      // this sector's own Health Informatics Specialist. Held at 70, under the
      // ICT-led sectors' 95.
      "ICT Literacy": 70,
      // The research half - Geneticist, and the trial and replication work.
      // DEMOTED 80 -> 65: Space & Advanced Sciences holds it at 75, so at 80 it
      // was a shared term doing the collinearity's work for it.
      "Curiosity": 65,
      // Multidisciplinary care teams. sd 5.9, demoted 70 -> 60 and kept only
      // because it is genuinely how clinical work is organised.
      "Collaboration": 60,
      // DROPPED, deliberately:
      //   Critical Thinking (was 85) - sd 6.7, and present in 5 of 10 sectors.
      //     Weight without information, per the geometry note at the top.
      //   Persistence and Grit (was 80) - sd 5.1, the single least
      //     discriminating column in the whole 68 x 16 matrix. The trial-
      //     timelines rationale it carried is real about the work and useless
      //     as a signal: every career in the catalog scores 80-100 on it.
    }
  },
  {
    name: "Renewable Energy",
    displayOrder: 4,
    description: "50% clean energy by 2050 and climate leadership",
    skills: {
      "Scientific Literacy": 90,
      "Critical Thinking and Problem Solving": 85,
      "Numeracy": 75,
      "Adaptability": 70,
      // "Sustainability": 90 used to sit here and was aliased to Scientific
      // Literacy below, colliding with the entry above on the
      // (sector_id, wef_skill_id) unique index. The upsert overwrote rather
      // than added, so this sector silently ran on FOUR skills, not five, and
      // the intended sustainability signal vanished. Sustainability is not one
      // of the WEF 16; the alias is removed and the signal is now carried by
      // the two real skills the UAE clean-energy programme actually needs.
      //
      // The 50%-by-2050 target is a capital-allocation problem before it is an
      // engineering one - LCOE, PPAs, and the cost curve are the daily work.
      "Financial Literacy": 70,
      // Climate leadership is a policy and treaty commitment (Net Zero 2050,
      // COP28 host). Also what most separates this sector from Space
      // Exploration, which it otherwise duplicated at r=0.99.
      "Cultural and Civic Literacy": 65,
    }
  },
  {
    name: "Financial Services",
    displayOrder: 5,
    description: "Global financial hub (DIFC, ADGM) and the digital-finance stack",
    // NEW (Phase 1). Placed 5th on merit: DIFC and ADGM are first-order
    // national economic pillars, ranked below the four science/technology
    // moonshots and above the general Digital Economy label that previously stood in
    // for this sector.
    //
    // Contrastive by construction, per the geometry note above. Financial
    // Literacy is the 2nd most discriminating column in the whole affinity
    // matrix (sd 15.0) and NO sector leads on it - Renewable Energy &
    // Sustainability holds it at 70 and Digital Economy at 70, both as supporting
    // terms. Leading on it at 95 is what makes this sector separable rather
    // than another ICT clone.
    skills: {
      // Markets, instruments, risk and capital allocation. The signature skill:
      // highest available variance, and unclaimed as a lead until now.
      "Financial Literacy": 95,
      // Valuation, quantitative modelling and statistics. sd 14.0. Shared with
      // Space & Advanced Sciences (95), but Space carries no Financial Literacy
      // at all, so the pair stays separated by the leading term.
      "Numeracy": 90,
      // The "FinTech" half: payments rails, digital banking, trading systems.
      // Held at 75, deliberately under the ICT-led sectors' 95 - this sector is
      // finance-led, and the vector has to say so.
      "ICT Literacy": 75,
      // Client, fund and desk leadership; the profession's own progression path.
      "Leadership": 60,
      // Disclosure, regulation and reporting are read-and-write work.
      "Literacy": 55,
      // DROPPED, deliberately: Critical Thinking (sd 6.9, present in 5 of 6
      // existing sectors - weight without information), and every competency
      // below sd 6 for the same reason.
    }
  },
  {
    name: "Education & Human Capital",
    displayOrder: 6,
    description: "World-class education system and lifelong learning culture",
    skills: {
      "Communication": 90,
      "Collaboration": 85,
      "Literacy": 90,
      "Social and Cultural Awareness": 80,
      // National identity, Islamic studies and civics are core UAE curriculum
      // content, not background - this is what the sector transmits.
      "Cultural and Civic Literacy": 85,
      // A classroom is led, not administered; school and phase leadership is
      // the profession's own progression ladder.
      "Leadership": 70,
      // DROPPED in Phase 3 stage 3: Creativity (was 75).
      //
      // Once the Healthcare retune above landed, this became the catalog's
      // worst remaining pair: Education & Human Capital <-> Creative Industries
      // & Media at r=0.828, and it had been quietly high all along (0.818 at 39
      // careers). Creativity 95 is Cultural & Creative Industries's SIGNATURE - the
      // one column that sector is built to own - and carrying it here at 75, as
      // a supporting term, is the exact pattern the geometry note at the top of
      // this file warns about: a skill that appears in most sectors carries
      // weight without carrying information, and here it was carrying it
      // straight into the neighbouring sector's lead.
      //
      // Lesson design and classroom practice are genuinely creative; that is
      // not in dispute. What this vector says by dropping the term is that
      // ORIGINAL AUTHORSHIP is not what distinguishes an education career from
      // every other career in the catalog - Communication, Literacy and
      // Cultural and Civic Literacy are. Measured: Education <-> Creative
      // 0.828 -> 0.735, catalog max |r| 0.828 -> 0.765, and ZERO careers
      // changed sector.
      //
      // Creativity is still claimed by Artificial Intelligence (80), Space &
      // Advanced Sciences (85), Cultural & Creative Industries (95) and Digital Economy
      // (80), so the "every WEF skill is used by at least one sector" guard in
      // matching.vision.test.ts still holds.
    }
  },
  {
    name: "Cultural & Creative Industries",
    displayOrder: 7,
    description: "Creative economy, media, design and content production",
    // NEW (Phase 1). Placed 7th - above the general "Digital Economy" label, below
    // Education & Human Capital. That ordering is not cosmetic: Design &
    // Architecture is claimed here at 70 against Digital Economy's 60, and a
    // 10-point relevance gap only survives the rankFactor spread while this
    // sector outranks Digital Economy. Re-order these two and Architect/Interior
    // Designer become a coin-flip.
    //
    // Creativity (sd 12.0) is the lead. Only two existing sectors carry it at
    // all - Space & Advanced Sciences 85 and Digital Economy 80 - and neither leads
    // on it, so at 95 it separates. The rest of the vector is the sector's own
    // literacy / communication axis, which no technology sector carries.
    skills: {
      // Original authorship - design, image, narrative, play. The signature.
      "Creativity": 95,
      // Scripts, copy, editorial and story. sd 8.7 - a modest column, but it is
      // Education & Human Capital's lead, and pairing it with Creativity (which
      // that sector lacks) is what keeps the two apart rather than collapsing
      // them.
      "Literacy": 75,
      // Audience, brief and message: the work only exists once it lands.
      "Communication": 75,
      // Production, post, engines and platforms. Held at 65, well under the
      // ICT-led sectors - the tools are not the discipline.
      "ICT Literacy": 65,
      // Bilingual, multi-cultural audiences and Emirati cultural narrative are
      // the working context for UAE media and design.
      "Social and Cultural Awareness": 60,
      // DROPPED, deliberately: Critical Thinking and the sub-sd-6 competencies,
      // for the reason in the geometry note above.
    }
  },
  {
    name: "Digital Economy",
    displayOrder: 8,
    description: "Digital transformation, smart cities, and innovation ecosystem",
    skills: {
      "ICT Literacy": 95,
      "Critical Thinking and Problem Solving": 85,
      "Creativity": 80,
      "Adaptability": 75,
      "Initiative": 70,
      // FinTech and the digital-economy finance stack - the same claim the
      // seeded category rule "Digital Economy -> Finance (55)" already makes above.
      "Financial Literacy": 70,
      // "Founding and scaling ventures inside the innovation ecosystem" - the
      // wording of the "Digital Economy -> Business & Management (65)" rule above.
      "Leadership": 65,
    }
  },
  {
    name: "Tourism",
    displayOrder: 9,
    description: "UAE Tourism Strategy 2031, aviation and the visitor economy",
    // NEW (Phase 3 stage 2). This sector could not be added before now: it had
    // exactly ONE serving career (Chef, which floored at 40 with no sector at
    // all) and docs/sector-list-recon.md's own coverage gate rejects a sector
    // that claims nothing. It now claims four.
    //
    // Contrastive by construction. Social and Cultural Awareness is the 5th
    // most discriminating column in the affinity matrix (sd 14.1) and NO other
    // sector leads on it - Education & Human Capital holds it at 80 and
    // Cultural & Creative Industries at 60, both as supporting terms. Leading on
    // it at 95 is what keeps this sector off the Education vector, which is the
    // pair docs/priority-alignment-plan.md §2 measured at r=0.947 back when
    // Tourism had one career and no distinct column of its own.
    skills: {
      // Guests, delegates and crews from everywhere, served in a country where
      // the workforce is as international as the visitors. The signature skill.
      "Social and Cultural Awareness": 95,
      // Occupancy, rate, event P&L and margin. This is the term that separates
      // the sector from Education & Human Capital, which carries no Financial
      // Literacy at all - measured over the 68-career catalog: demoting it to
      // the draft's 60 takes Education <-> Tourism from 0.71 back up to 0.90.
      // Held under Financial Services's
      // 95: hospitality is commercially run, not finance-led.
      "Financial Literacy": 85,
      // The product IS the interaction - front desk, brief, sponsor, cabin.
      "Communication": 80,
      // PMS, GDS, channel managers and revenue systems. Deliberately low-band:
      // the tools matter and the discipline is not about them.
      "ICT Literacy": 60,
      // Yield, occupancy and covers are counted daily. Low-band on purpose -
      // a weight of 55 says "present and minor", which is information too.
      "Numeracy": 55,
      // DROPPED, deliberately: Collaboration (sd 5.9) and Adaptability (sd
      // 6.5), which the plan's draft vector carried. Every career in the
      // catalog scores 75-95 on both, so they add weight without adding
      // information - the geometry note above. Leadership was also dropped
      // after measurement: Education & Human Capital holds it at 70, and
      // carrying it here is part of what kept those two sectors collinear.
    }
  },
  {
    name: "Food Security",
    displayOrder: 10,
    description: "National Food Security Strategy 2051 and desert agritech",
    // NEW (Phase 3 stage 2). Previously an EMPTY sector - docs/sector-list-recon.md
    // §3 rejected it outright because no career in the catalog was even adjacent.
    // Four careers were derived FROM the sector rather than the other way round
    // (docs/career-sourcing-map.md §3.10), which is why it can ship now.
    //
    // ⚠️ This is the collinearity risk of the whole phase. Scientific Literacy
    // is the single most discriminating column (sd 19.5) and THREE sectors now
    // want it: Healthcare leads on it at 95, Renewable Energy &
    // Sustainability at 90, and this sector needs it too - agronomy and food
    // science are laboratory disciplines. docs/priority-alignment-plan.md §2
    // measured Space <-> Food Security at r=0.904 with zero careers here.
    //
    // The separation is carried by what this vector does NOT take: no Critical
    // Thinking, no Curiosity, no Financial Literacy, and Numeracy held at 75
    // against Space's 95. ICT at 80 is the positive differentiator -
    // controlled-environment agriculture (Emirates Bustanica, Pure Harvest) and
    // remote-sensed agronomy are control-systems work, which is not true of
    // Healthcare's lab bench. Measured result: 0.806 against Healthcare & Life
    // Sciences and 0.763 against Renewable Energy, both below
    // the worst PRE-EXISTING pair (Space <-> Healthcare, 0.903).
    skills: {
      // Soil chemistry, crop genetics, food microbiology. The core, shared -
      // see the note above for how the sector stays separable despite it.
      "Scientific Literacy": 90,
      // Vertical farms, irrigation control, precision and remote-sensed
      // agronomy. The positive differentiator: Healthcare
      // holds ICT at 75 and Renewable Energy carries none.
      "ICT Literacy": 80,
      // Yield, water balance and nutrition modelling. Held at 75, well under
      // Space & Advanced Sciences' 95 - the demotion is the point.
      "Numeracy": 75,
      // 50% local production by 2051 is a national self-sufficiency commitment
      // before it is an agronomy problem. sd 14.6, and neither science sector
      // this one must separate from carries it at all.
      "Cultural and Civic Literacy": 70,
      // Extension work with growers, food culture, and the nutrition half of
      // the sector. Low-band and honest: three of its four careers are
      // upstream of the plate, and only Dietitian & Nutritionist is not.
      "Social and Cultural Awareness": 60,
      // DROPPED, deliberately: Persistence and Grit (sd 5.1) and Curiosity (sd
      // 7.3), which the plan's draft vector carried. Both are near-constant
      // across the catalog, and Curiosity is additionally carried by BOTH
      // science sectors this one must separate from. Financial Literacy was
      // also dropped after measurement - Renewable Energy
      // holds it at 70, and carrying it alongside Scientific Literacy 90 put
      // that pair at r=0.911, the worst in the catalog.
    }
  },
];


export async function seedDatabase() {
  console.log("🌱 Seeding database...");

  // When false, seed skips OVERWRITING existing admin-editable config rows
  // (tier component weights, assessment component weights, LLM prompt templates);
  // new rows are still created on first boot. Set FORCE_RESEED=true to re-apply
  // seed defaults over existing rows. Reference data (WEF skills, sectors,
  // sector→skill maps, career affinities) is unaffected by this flag.
  const forceReseed = process.env.FORCE_RESEED === 'true';

  // Seed Countries (UAE only - all quiz questions are UAE curriculum-based)
  const countries = [
    {
      id: "uae",
      name: "United Arab Emirates",
      nameAr: "الإمارات العربية المتحدة",
      code: "UAE",
      abbreviation: "UAE",
      flag: "🇦🇪",
      mission: "To establish the UAE as having the best government, education, and economy in the world through four key pillars: future-focused government, excellent education, diversified knowledge economy, and happy cohesive society.",
      missionAr: "إرساء الإمارات العربية المتحدة دولةً ذات أفضل حكومة وتعليم واقتصاد في العالم، من خلال أربعة ركائز أساسية: حكومة تعمل للمستقبل، وتعليم متميز، واقتصاد متنوع قائم على المعرفة، ومجتمع سعيد ومتماسك.",
      vision: "To be the best country in the world by the UAE's 100th anniversary in 2071, leading in AI, space exploration, and sustainable development.",
      visionAr: "أن تكون الإمارات العربية المتحدة أفضل دولة في العالم بحلول الذكرى المئوية عام 2071، رائدةً في الذكاء الاصطناعي واستكشاف الفضاء والتنمية المستدامة.",
      visionPlan: "UAE Centennial 2071",
      // POSITIONAL AND UNKEYED: prioritySectorsAr[i] localises prioritySectors[i]
      // (recommendations.routes.ts:307-312). Both arrays are in displayOrder and
      // MUST stay the same length and the same order as UAE_SECTOR_WEF_SKILLS.
      prioritySectors: ["Artificial Intelligence", "Space & Advanced Sciences", "Healthcare", "Renewable Energy", "Financial Services", "Education & Human Capital", "Cultural & Creative Industries", "Digital Economy", "Tourism", "Food Security"],
      prioritySectorsAr: ["الذكاء الاصطناعي", "الفضاء والعلوم المتقدمة", "الرعاية الصحية", "الطاقة المتجددة", "الخدمات المالية", "التعليم ورأس المال البشري", "الصناعات الثقافية والإبداعية", "الاقتصاد الرقمي", "السياحة", "الأمن الغذائي"],
      nationalGoals: [
        "100% AI reliance for government services by 2031",
        "50% clean energy by 2050",
        "Double GDP from AED 1.49 trillion to AED 3 trillion",
        "Mars colonization by 2117"
      ],
      nationalGoalsAr: [
        "الاعتماد الكامل على الذكاء الاصطناعي في الخدمات الحكومية بحلول 2031",
        "50% طاقة نظيفة بحلول 2050",
        "مضاعفة الناتج المحلي الإجمالي من 1.49 إلى 3 تريليونات درهم",
        "استعمار المريخ بحلول 2117"
      ],
      targets: {
        climate: [
          { metric: "Clean Energy", value: "50%", year: 2050, focusArea: "Energy" },
          { metric: "Emissions Reduction", value: "47%", year: 2035, focusArea: "Climate" }
        ],
        tech: [
          { metric: "AI in Government", value: "100%", year: 2031, focusArea: "Digital Gov" },
          { metric: "AI GDP Contribution", value: "$96B (14%)", year: 2030, focusArea: "Economy" }
        ],
        economic: [
          { metric: "GDP", value: "AED 3 trillion", year: 2031, focusArea: "Economy" }
        ]
      },
      // Curriculum configuration for UAE
      educationSystem: "The UAE follows a K-12 education system with the Ministry of Education (MoE) National Curriculum. International schools offer British, American, IB, and other curricula.",
      curricula: ["MOE National", "British", "American", "IB"],
      gradeLevels: ["8", "9", "10", "11", "12"],
      universitiesLink: "https://caa.ae",
      universitiesLinkLabel: "CAA Accredited Universities",
      isActive: true,
    },
  ];

  for (const country of countries) {
    try {
      await storage.createCountry(country);
      console.log(`✓ Created country: ${country.name}`);
    } catch (error) {
      console.log(`Country ${country.name} already exists, applying Arabic content migration...`);
      // Patch existing record with Arabic fields (idempotent update)
      try {
        await storage.updateCountry(country.id, {
          nameAr: country.nameAr,
          missionAr: country.missionAr,
          visionAr: country.visionAr,
          // prioritySectors (ENGLISH) must be updated here too, not just the
          // Arabic array. createCountry only runs on a from-scratch DB, so on
          // every existing database this update IS the only path by which the
          // seed's sector list reaches countries.prioritySectors. Updating the
          // Ar array alone left the two arrays at different lengths and shifted
          // the positional pairing in recommendations.routes.ts:307-312 — after
          // Phase 1 added two sectors that would have localised the Education
          // sector as "Financial Services" in every Arabic report.
          prioritySectors: country.prioritySectors,
          prioritySectorsAr: country.prioritySectorsAr,
          nationalGoalsAr: country.nationalGoalsAr,
        });
        console.log(`✓ Arabic content applied to: ${country.name}`);
      } catch (updateError) {
        console.error(`Failed to apply Arabic content to ${country.name}:`, updateError);
      }
    }
  }

  // Seed Subjects (curriculum-scoped)
  const subjects = [
    // UAE MOE National Curriculum subjects
    {
      name: "Mathematics",
      code: "mathematics",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education Mathematics curriculum covering algebra, geometry, calculus, and statistics",
      aliases: ["Math", "Maths", "Calculus", "Algebra", "Geometry"],
      displayOrder: 1,
      isActive: true,
    },
    {
      name: "Science",
      code: "science",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education integrated Science curriculum covering physics, chemistry, and biology",
      aliases: ["Physics", "Chemistry", "Biology", "Physical Science", "Life Science"],
      displayOrder: 2,
      isActive: true,
    },
    {
      name: "English",
      code: "english",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education English Language curriculum covering reading, writing, grammar, and literature",
      aliases: ["English Language", "Literature", "Writing"],
      displayOrder: 3,
      isActive: true,
    },
    {
      name: "Arabic",
      code: "arabic",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education Arabic Language curriculum covering reading, writing, grammar, and Arabic literature",
      aliases: ["Arabic Language"],
      displayOrder: 4,
      isActive: true,
    },
    {
      name: "Social Studies",
      code: "social_studies",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education Social Studies curriculum covering UAE history, geography, civics, and Islamic studies",
      aliases: ["History", "Geography", "Civics", "Government", "Economics", "Sociology"],
      displayOrder: 5,
      isActive: true,
    },
    {
      name: "Computer Science",
      code: "computer_science",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education Computer Science and IT curriculum covering programming, digital literacy, and technology",
      aliases: ["Programming", "Coding", "IT", "Technology"],
      displayOrder: 6,
      isActive: true,
    },
  ];

  for (const subject of subjects) {
    try {
      // Check if subject already exists
      const existing = await storage.getSubjectByCode(subject.countryId, subject.curriculum, subject.code);
      if (!existing) {
        await storage.createSubject(subject);
        console.log(`✓ Created subject: ${subject.name} (${subject.curriculum})`);
      } else {
        console.log(`Subject ${subject.name} (${subject.curriculum}) already exists`);
      }
    } catch (error) {
      console.log(`Subject ${subject.name} already exists or error:`, error);
    }
  }

  // Seed Careers
  const careers = [
    {
      title: "Software Engineer",
      description: "Build apps, websites, and games that people use every day. Turn ideas into working software by writing code and solving technical challenges.",
      requiredSkills: ["Programming", "Problem Solving", "Data Structures", "Algorithms"],
      requiredSkillsAr: ["البرمجة", "حل المشكلات", "هياكل البيانات", "الخوارزميات"],
      relatedSubjects: ["Computer Science", "Mathematics", "Physics"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Computer Science or related field",
      averageSalary: "$80,000 - $150,000",
      growthOutlook: "Excellent (25% growth)",
      icon: "💻",
      onetCode: "15-1299.08",
      valuesProfile: { achievement: 72, benevolence: 44, self_direction: 66, security: 56, power: 78 },
    },
    {
      title: "Data Scientist",
      description: "Uncover hidden patterns in massive amounts of data to help companies predict trends, understand customers, and make smarter decisions. Use AI and machine learning to solve real-world problems.",
      requiredSkills: ["Statistics", "Machine Learning", "Python/R", "Data Visualization"],
      requiredSkillsAr: ["الإحصاء", "التعلم الآلي", "بايثون/R", "تصوير البيانات"],
      relatedSubjects: ["Mathematics", "Computer Science", "Statistics"],
      category: "Technology",
      educationLevel: "Bachelor's or Master's degree in Data Science, Statistics, or Computer Science",
      averageSalary: "$90,000 - $160,000",
      growthOutlook: "Excellent (36% growth)",
      icon: "📊",
      onetCode: "15-2051.01",
      valuesProfile: { achievement: 72, benevolence: 14, self_direction: 0, security: 46, power: 22 },
    },
    {
      title: "Renewable Energy Engineer",
      description: "Design solar panels, wind turbines, and clean energy systems that power homes and cities without harming the planet. Help create a sustainable future for the next generation.",
      requiredSkills: ["Engineering Design", "Sustainability", "Project Management", "Technical Analysis"],
      requiredSkillsAr: ["التصميم الهندسي", "الاستدامة", "إدارة المشاريع", "التحليل التقني"],
      relatedSubjects: ["Physics", "Mathematics", "Chemistry", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Engineering (Electrical, Mechanical, or Environmental)",
      averageSalary: "$70,000 - $120,000",
      growthOutlook: "Very Good (20% growth)",
      icon: "⚡",
      onetCode: "17-2199.03",
      valuesProfile: { achievement: 56, benevolence: 36, self_direction: 54, security: 66, power: 56 },
    },
    {
      title: "Healthcare Professional (Nurse)",
      description: "Care for patients when they need it most, from helping newborns take their first breath to supporting families through difficult times. Make a real difference in people's lives every single day.",
      requiredSkills: ["Patient Care", "Medical Knowledge", "Communication", "Empathy"],
      requiredSkillsAr: ["رعاية المرضى", "المعرفة الطبية", "التواصل", "التعاطف"],
      relatedSubjects: ["Biology", "Chemistry", "Health Science"],
      category: "Healthcare",
      educationLevel: "Bachelor's of Science in Nursing (BSN)",
      averageSalary: "$60,000 - $95,000",
      growthOutlook: "Excellent (6% growth)",
      icon: "🏥",
      onetCode: "29-1141.00",
      valuesProfile: { achievement: 56, benevolence: 86, self_direction: 54, security: 78, power: 44 },
    },
    {
      title: "Digital Marketing Specialist",
      description: "Create engaging campaigns, grow social media communities, and help brands connect with customers online. Turn creative ideas into posts, ads, and content that people actually want to see.",
      requiredSkills: ["Social Media", "Content Creation", "Analytics", "SEO/SEM"],
      requiredSkillsAr: ["وسائل التواصل الاجتماعي", "إنشاء المحتوى", "التحليلات", "تحسين محركات البحث"],
      relatedSubjects: ["Business", "English", "Computer Science", "Art"],
      category: "Business & Marketing",
      educationLevel: "Bachelor's degree in Marketing, Communications, or Business",
      averageSalary: "$50,000 - $85,000",
      growthOutlook: "Very Good (10% growth)",
      icon: "📱",
      onetCode: "13-1161.00",
      valuesProfile: { achievement: 28, benevolence: 22, self_direction: 10, security: 42, power: 12 },
    },
    {
      title: "Graphic Designer",
      description: "Design eye-catching logos, posters, websites, and packaging that grab attention and tell stories. Bring brands to life through colors, shapes, and visual creativity that people remember.",
      requiredSkills: ["Creative Design", "Adobe Creative Suite", "Typography", "Visual Communication"],
      requiredSkillsAr: ["التصميم الإبداعي", "حزمة أدوبي الإبداعية", "الطباعة الفنية", "التواصل البصري"],
      relatedSubjects: ["Art", "Computer Science", "Design"],
      category: "Creative Arts",
      educationLevel: "Bachelor's degree in Graphic Design or Fine Arts",
      averageSalary: "$45,000 - $75,000",
      growthOutlook: "Good (3% growth)",
      icon: "🎨",
      onetCode: "27-1024.00",
      valuesProfile: { achievement: 72, benevolence: 36, self_direction: 54, security: 38, power: 44 },
    },
    {
      title: "Mechanical Engineer",
      description: "Invent and improve machines that make life easier, from robots and drones to cars and medical devices. Test your designs, solve technical problems, and watch your creations come to life.",
      requiredSkills: ["CAD Software", "Physics", "Materials Science", "Problem Solving"],
      requiredSkillsAr: ["برامج التصميم بالحاسوب", "الفيزياء", "علم المواد", "حل المشكلات"],
      relatedSubjects: ["Physics", "Mathematics", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Mechanical Engineering",
      averageSalary: "$70,000 - $110,000",
      growthOutlook: "Good (2% growth)",
      icon: "⚙️",
      onetCode: "17-2141.00",
      valuesProfile: { achievement: 56, benevolence: 50, self_direction: 54, security: 60, power: 78 },
    },
    {
      title: "Financial Analyst",
      description: "Help companies and investors grow their money by analyzing markets, predicting trends, and finding smart investment opportunities. Turn numbers into insights that drive million-dollar decisions.",
      requiredSkills: ["Financial Modeling", "Excel", "Data Analysis", "Risk Assessment"],
      requiredSkillsAr: ["النمذجة المالية", "إكسل", "تحليل البيانات", "تقييم المخاطر"],
      relatedSubjects: ["Mathematics", "Economics", "Business"],
      category: "Finance",
      educationLevel: "Bachelor's degree in Finance, Economics, or Accounting",
      averageSalary: "$65,000 - $105,000",
      growthOutlook: "Good (9% growth)",
      icon: "💰",
      onetCode: "13-2099.01",
      valuesProfile: { achievement: 44, benevolence: 44, self_direction: 54, security: 52, power: 56 },
    },
    {
      title: "Teacher (Secondary Education)",
      description: "Shape young minds and inspire the next generation of scientists, artists, and leaders. Make complex topics exciting, help students discover their talents, and watch them grow into confident learners.",
      requiredSkills: ["Subject Expertise", "Communication", "Patience", "Curriculum Development"],
      requiredSkillsAr: ["الخبرة في المادة", "التواصل", "الصبر", "تطوير المناهج"],
      // NOT ["Education", "Subject Specialization"] — those name the profession, not
      // a school subject, so both drop in normalizeCareerSubjects() and the career
      // is pinned to the flat-20 subjects floor. Keep in sync with
      // server/migrations/career-related-subjects.ts, which fixes existing rows.
      relatedSubjects: ["English", "Mathematics", "Science"],
      category: "Education",
      educationLevel: "Bachelor's degree in Education or subject area + teaching certification",
      averageSalary: "$45,000 - $75,000",
      growthOutlook: "Good (4% growth)",
      icon: "📚",
      onetCode: "25-2031.00",
      valuesProfile: { achievement: 72, benevolence: 100, self_direction: 44, security: 64, power: 22 },
    },
    {
      title: "Environmental Scientist",
      description: "Protect our planet by studying pollution, climate change, and ecosystems. Develop solutions to environmental challenges and help communities live in harmony with nature.",
      requiredSkills: ["Research", "Data Analysis", "Environmental Policy", "Field Work"],
      requiredSkillsAr: ["البحث", "تحليل البيانات", "السياسة البيئية", "العمل الميداني"],
      relatedSubjects: ["Biology", "Chemistry", "Geography", "Environmental Science"],
      category: "Science",
      educationLevel: "Bachelor's degree in Environmental Science or related field",
      averageSalary: "$55,000 - $90,000",
      growthOutlook: "Very Good (8% growth)",
      icon: "🌍",
      onetCode: "19-2041.00",
      valuesProfile: { achievement: 44, benevolence: 36, self_direction: 44, security: 36, power: 56 },
    },
    {
      title: "Civil Engineer",
      description: "Plan and build the roads, bridges, airports, and water systems that communities depend on every day. Turn blueprints into real structures that stand for generations.",
      requiredSkills: ["Structural Design", "Project Management", "AutoCAD", "Mathematics"],
      requiredSkillsAr: ["التصميم الإنشائي", "إدارة المشاريع", "أوتوكاد", "الرياضيات"],
      relatedSubjects: ["Mathematics", "Physics", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Civil Engineering",
      averageSalary: "$70,000 - $115,000",
      growthOutlook: "Good (5% growth)",
      icon: "🏗️",
      onetCode: "17-2051.00",
      valuesProfile: { achievement: 56, benevolence: 36, self_direction: 76, security: 66, power: 66 },
    },
    {
      title: "Architect",
      description: "Design stunning buildings and spaces where people live, work, and gather. Blend art with engineering to create structures that are both beautiful and functional.",
      requiredSkills: ["Architectural Design", "3D Modeling", "Building Codes", "Creativity"],
      requiredSkillsAr: ["التصميم المعماري", "النمذجة ثلاثية الأبعاد", "قوانين البناء", "الإبداع"],
      relatedSubjects: ["Art", "Mathematics", "Physics", "Engineering"],
      category: "Design & Architecture",
      educationLevel: "Bachelor's degree in Architecture + licensing",
      averageSalary: "$65,000 - $120,000",
      growthOutlook: "Good (3% growth)",
      icon: "🏛️",
      onetCode: "17-1011.00",
      valuesProfile: { achievement: 72, benevolence: 29, self_direction: 76, security: 60, power: 78 },
    },
    {
      title: "Electrical Engineer",
      description: "Design the electrical systems that power everything from smartphones to power grids. Work on cutting-edge technology like electric vehicles, renewable energy, and smart devices.",
      requiredSkills: ["Circuit Design", "Power Systems", "Electronics", "Programming"],
      requiredSkillsAr: ["تصميم الدوائر الكهربائية", "أنظمة الطاقة", "الإلكترونيات", "البرمجة"],
      relatedSubjects: ["Physics", "Mathematics", "Computer Science"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Electrical Engineering",
      averageSalary: "$75,000 - $125,000",
      growthOutlook: "Very Good (7% growth)",
      icon: "⚡",
      onetCode: "17-2071.00",
      valuesProfile: { achievement: 72, benevolence: 44, self_direction: 54, security: 60, power: 66 },
    },
    {
      title: "Biomedical Engineer",
      description: "Create life-saving medical devices like artificial organs, prosthetic limbs, and diagnostic equipment. Combine engineering with biology to solve healthcare challenges and improve patient care.",
      requiredSkills: ["Medical Device Design", "Biomechanics", "Regulatory Compliance", "Research"],
      requiredSkillsAr: ["تصميم الأجهزة الطبية", "الميكانيكا الحيوية", "الامتثال التنظيمي", "البحث"],
      relatedSubjects: ["Biology", "Physics", "Mathematics", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Biomedical Engineering",
      averageSalary: "$70,000 - $120,000",
      growthOutlook: "Excellent (10% growth)",
      icon: "🔬",
      onetCode: "17-2031.00",
      valuesProfile: { achievement: 56, benevolence: 58, self_direction: 76, security: 68, power: 56 },
    },
    {
      title: "Pharmacist",
      description: "Be the medication expert who helps patients understand their prescriptions and stay healthy. Advise doctors on drug interactions and ensure people get the right treatments safely.",
      requiredSkills: ["Pharmacology", "Patient Counseling", "Drug Interactions", "Attention to Detail"],
      requiredSkillsAr: ["علم الأدوية", "إرشاد المرضى", "التفاعلات الدوائية", "الاهتمام بالتفاصيل"],
      relatedSubjects: ["Chemistry", "Biology", "Health Science"],
      category: "Healthcare",
      educationLevel: "Doctor of Pharmacy (PharmD) degree + licensing",
      averageSalary: "$90,000 - $135,000",
      growthOutlook: "Good (2% growth)",
      icon: "💊",
      onetCode: "29-1051.00",
      valuesProfile: { achievement: 28, benevolence: 58, self_direction: 32, security: 64, power: 78 },
    },
    {
      title: "Doctor (General Practitioner)",
      description: "Be the first person people turn to when they're sick or need medical advice. Diagnose illnesses, treat patients, and build trusted relationships that keep communities healthy.",
      requiredSkills: ["Medical Diagnosis", "Patient Care", "Clinical Skills", "Communication"],
      requiredSkillsAr: ["التشخيص الطبي", "رعاية المرضى", "المهارات السريرية", "التواصل"],
      relatedSubjects: ["Biology", "Chemistry", "Health Science"],
      category: "Healthcare",
      educationLevel: "Medical degree (MD or DO) + residency + licensing",
      averageSalary: "$150,000 - $250,000",
      growthOutlook: "Good (3% growth)",
      icon: "⚕️",
      onetCode: "29-1215.00",
      valuesProfile: { achievement: 100, benevolence: 94, self_direction: 88, security: 80, power: 100 },
    },
    {
      title: "Dentist",
      description: "Help people maintain healthy smiles and confident teeth. Fix cavities, perform cleanings, and educate patients on oral health using precision and care.",
      requiredSkills: ["Dental Procedures", "Patient Care", "Hand-Eye Coordination", "Attention to Detail"],
      requiredSkillsAr: ["إجراءات طب الأسنان", "رعاية المرضى", "التنسيق الحركي", "الاهتمام بالتفاصيل"],
      relatedSubjects: ["Biology", "Chemistry", "Health Science"],
      category: "Healthcare",
      educationLevel: "Doctor of Dental Surgery (DDS) or Doctor of Dental Medicine (DMD) + licensing",
      averageSalary: "$130,000 - $200,000",
      growthOutlook: "Good (6% growth)",
      icon: "🦷",
      onetCode: "29-1021.00",
      valuesProfile: { achievement: 85, benevolence: 78, self_direction: 100, security: 50, power: 78 },
    },
    {
      title: "Physical Therapist",
      description: "Help athletes recover from injuries, assist elderly patients regain mobility, and guide people through rehabilitation exercises. Make movement possible again for those in pain.",
      requiredSkills: ["Patient Rehabilitation", "Anatomy Knowledge", "Exercise Therapy", "Empathy"],
      requiredSkillsAr: ["إعادة تأهيل المرضى", "معرفة التشريح", "العلاج بالتمارين", "التعاطف"],
      relatedSubjects: ["Biology", "Health Science", "Physical Education"],
      category: "Healthcare",
      educationLevel: "Doctor of Physical Therapy (DPT) degree + licensing",
      averageSalary: "$70,000 - $95,000",
      growthOutlook: "Excellent (17% growth)",
      icon: "🏃",
      onetCode: "29-1123.00",
      valuesProfile: { achievement: 72, benevolence: 94, self_direction: 54, security: 64, power: 78 },
    },
    {
      title: "Psychologist",
      description: "Help people overcome anxiety, depression, and life challenges through counseling and therapy. Understand how the human mind works and guide people toward better mental health.",
      requiredSkills: ["Counseling", "Research", "Assessment", "Empathy"],
      requiredSkillsAr: ["الإرشاد", "البحث", "التقييم", "التعاطف"],
      relatedSubjects: ["Psychology", "Biology", "Social Studies"],
      category: "Healthcare",
      educationLevel: "Doctoral degree in Psychology (PhD or PsyD) + licensing",
      averageSalary: "$65,000 - $110,000",
      growthOutlook: "Good (6% growth)",
      icon: "🧠",
      onetCode: "19-3033.00",
      valuesProfile: { achievement: 79, benevolence: 96, self_direction: 76, security: 46, power: 66 },
    },
    {
      title: "Social Worker",
      description: "Stand up for people who need help the most. Connect families with resources, support children in difficult situations, and advocate for vulnerable communities.",
      requiredSkills: ["Case Management", "Advocacy", "Communication", "Empathy"],
      requiredSkillsAr: ["إدارة الحالات", "المناصرة", "التواصل", "التعاطف"],
      relatedSubjects: ["Social Studies", "Psychology", "Sociology"],
      category: "Social Services",
      educationLevel: "Bachelor's degree in Social Work (BSW) or Master's (MSW)",
      averageSalary: "$45,000 - $70,000",
      growthOutlook: "Very Good (9% growth)",
      icon: "🤝",
      onetCode: "21-1022.00",
      valuesProfile: { achievement: 72, benevolence: 94, self_direction: 66, security: 64, power: 34 },
    },
    {
      title: "Lawyer",
      description: "Fight for justice in courtrooms, negotiate major business deals, and defend people's rights. Use persuasive arguments and legal knowledge to solve complex disputes.",
      requiredSkills: ["Legal Research", "Advocacy", "Writing", "Critical Thinking"],
      requiredSkillsAr: ["البحث القانوني", "المناصرة", "الكتابة", "التفكير النقدي"],
      relatedSubjects: ["English", "Social Studies", "Government"],
      category: "Legal",
      educationLevel: "Law degree (JD) + bar exam",
      averageSalary: "$80,000 - $180,000",
      growthOutlook: "Good (4% growth)",
      icon: "⚖️",
      onetCode: "23-1011.00",
      valuesProfile: { achievement: 85, benevolence: 36, self_direction: 76, security: 68, power: 100 },
    },
    {
      title: "Accountant",
      description: "Manage company finances, prepare tax returns, and help businesses make smart financial decisions. Work with numbers to ensure organizations stay profitable and legally compliant.",
      requiredSkills: ["Accounting", "Tax Preparation", "Excel", "Attention to Detail"],
      requiredSkillsAr: ["المحاسبة", "إعداد الضرائب", "إكسل", "الاهتمام بالتفاصيل"],
      relatedSubjects: ["Mathematics", "Business", "Economics"],
      category: "Finance",
      educationLevel: "Bachelor's degree in Accounting + CPA certification",
      averageSalary: "$55,000 - $95,000",
      growthOutlook: "Good (4% growth)",
      icon: "📊",
      onetCode: "13-2011.00",
      valuesProfile: { achievement: 44, benevolence: 50, self_direction: 44, security: 50, power: 44 },
    },
    {
      title: "Human Resources Manager",
      description: "Build great company cultures by hiring talented people, resolving workplace conflicts, and developing programs that make employees happy and productive. Be the bridge between management and staff.",
      requiredSkills: ["Recruitment", "Employee Relations", "Conflict Resolution", "Leadership"],
      requiredSkillsAr: ["التوظيف", "علاقات الموظفين", "حل النزاعات", "القيادة"],
      relatedSubjects: ["Business", "Psychology", "Communication"],
      category: "Business & Management",
      educationLevel: "Bachelor's degree in Human Resources or Business",
      averageSalary: "$70,000 - $120,000",
      growthOutlook: "Good (7% growth)",
      icon: "👥",
      onetCode: "11-3121.00",
      valuesProfile: { achievement: 56, benevolence: 78, self_direction: 44, security: 58, power: 78 },
    },
    {
      title: "Management Consultant",
      description: "Solve tough business challenges for major companies. Analyze problems, present solutions to executives, and help organizations transform their operations and strategy.",
      requiredSkills: ["Business Analysis", "Strategy", "Presentation", "Problem Solving"],
      requiredSkillsAr: ["تحليل الأعمال", "الاستراتيجية", "العروض التقديمية", "حل المشكلات"],
      relatedSubjects: ["Business", "Mathematics", "Economics"],
      category: "Business & Management",
      educationLevel: "Bachelor's degree in Business or related field (MBA preferred)",
      averageSalary: "$85,000 - $150,000",
      growthOutlook: "Very Good (11% growth)",
      icon: "📈",
      onetCode: "13-1111.00",
      valuesProfile: { achievement: 56, benevolence: 78, self_direction: 54, security: 44, power: 56 },
    },
    {
      title: "Entrepreneur",
      description: "Turn your ideas into reality by launching your own business. Take calculated risks, innovate solutions to problems, and build something from the ground up that you're passionate about.",
      requiredSkills: ["Business Planning", "Risk Taking", "Innovation", "Leadership"],
      requiredSkillsAr: ["التخطيط التجاري", "المخاطرة المحسوبة", "الابتكار", "القيادة"],
      relatedSubjects: ["Business", "Mathematics", "Economics"],
      category: "Business & Management",
      educationLevel: "Varies (business education helpful but not required)",
      averageSalary: "Varies widely",
      growthOutlook: "Depends on venture",
      icon: "🚀",
      onetCode: "11-1021.00",
      valuesProfile: { achievement: 56, benevolence: 86, self_direction: 76, security: 74, power: 78 },
    },
    {
      title: "Sales Manager",
      description: "Lead teams that bring in revenue and grow businesses. Develop winning sales strategies, motivate your team to hit targets, and build strong client relationships that last.",
      requiredSkills: ["Sales Strategy", "Leadership", "Communication", "Negotiation"],
      requiredSkillsAr: ["استراتيجية المبيعات", "القيادة", "التواصل", "التفاوض"],
      relatedSubjects: ["Business", "Communication", "Mathematics"],
      category: "Business & Marketing",
      educationLevel: "Bachelor's degree in Business or Marketing",
      averageSalary: "$70,000 - $130,000",
      growthOutlook: "Good (4% growth)",
      icon: "📞",
      onetCode: "11-2022.00",
      valuesProfile: { achievement: 56, benevolence: 36, self_direction: 66, security: 78, power: 44 },
    },
    {
      title: "Marketing Manager",
      description: "Create campaigns that make products successful and brands memorable. Plan launch strategies, analyze customer behavior, and lead creative teams to connect with target audiences.",
      requiredSkills: ["Marketing Strategy", "Digital Marketing", "Analytics", "Creativity"],
      requiredSkillsAr: ["استراتيجية التسويق", "التسويق الرقمي", "التحليلات", "الإبداع"],
      relatedSubjects: ["Business", "English", "Art", "Computer Science"],
      category: "Business & Marketing",
      educationLevel: "Bachelor's degree in Marketing or Business",
      averageSalary: "$75,000 - $140,000",
      growthOutlook: "Very Good (8% growth)",
      icon: "📣",
      onetCode: "11-2021.00",
      valuesProfile: { achievement: 85, benevolence: 72, self_direction: 66, security: 82, power: 66 },
    },
    {
      title: "Product Manager",
      description: "Own the vision for digital products and features. Work with designers and engineers to bring new ideas to life, listen to customer feedback, and decide what gets built next.",
      requiredSkills: ["Product Strategy", "User Research", "Project Management", "Communication"],
      requiredSkillsAr: ["استراتيجية المنتج", "بحث المستخدمين", "إدارة المشاريع", "التواصل"],
      relatedSubjects: ["Business", "Computer Science", "Design"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Business, Computer Science, or related field",
      averageSalary: "$90,000 - $160,000",
      growthOutlook: "Excellent (20% growth)",
      icon: "📦",
      onetCode: "15-1299.09",
      valuesProfile: { achievement: 85, benevolence: 22, self_direction: 66, security: 38, power: 56 },
    },
    {
      title: "UX/UI Designer",
      description: "Make apps and websites beautiful and easy to use. Research how people interact with technology, design intuitive interfaces, and create experiences that delight users.",
      requiredSkills: ["User Research", "Interface Design", "Prototyping", "Design Tools"],
      requiredSkillsAr: ["بحث المستخدمين", "تصميم الواجهات", "النمذجة الأولية", "أدوات التصميم"],
      relatedSubjects: ["Art", "Computer Science", "Psychology"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Design, HCI, or related field",
      averageSalary: "$65,000 - $120,000",
      growthOutlook: "Very Good (13% growth)",
      icon: "🎨",
      onetCode: "27-1021.00",
      valuesProfile: { achievement: 44, benevolence: 58, self_direction: 32, security: 46, power: 44 },
    },
    {
      title: "Video Game Designer",
      description: "Design engaging games that players love. Create immersive worlds, develop gameplay mechanics that keep players interested, and tell compelling stories through interactive experiences.",
      requiredSkills: ["Game Design", "Creativity", "Programming", "Storytelling"],
      requiredSkillsAr: ["تصميم الألعاب", "الإبداع", "البرمجة", "سرد القصص"],
      relatedSubjects: ["Computer Science", "Art", "English"],
      category: "Creative Arts",
      educationLevel: "Bachelor's degree in Game Design or Computer Science",
      averageSalary: "$55,000 - $110,000",
      growthOutlook: "Good (5% growth)",
      icon: "🎮",
      onetCode: "15-1255.01",
      valuesProfile: { achievement: 85, benevolence: 14, self_direction: 76, security: 44, power: 34 },
    },
    {
      title: "Journalist",
      description: "Uncover the truth and tell important stories that inform the public. Investigate issues that matter, interview key people, and report news that holds power accountable.",
      requiredSkills: ["Writing", "Research", "Interviewing", "Critical Thinking"],
      requiredSkillsAr: ["الكتابة", "البحث", "إجراء المقابلات", "التفكير النقدي"],
      relatedSubjects: ["English", "Social Studies", "Communication"],
      category: "Media & Communications",
      educationLevel: "Bachelor's degree in Journalism or Communications",
      averageSalary: "$40,000 - $75,000",
      growthOutlook: "Declining (-6% growth)",
      icon: "📰",
      onetCode: "27-3023.00",
      valuesProfile: { achievement: 72, benevolence: 54, self_direction: 50, security: 38, power: 72 },
    },
    {
      title: "Content Creator",
      description: "Build an online following by creating videos, posts, and content that people love to watch and share. Turn your creativity and personality into a career on platforms like YouTube, TikTok, and Instagram.",
      requiredSkills: ["Video Production", "Social Media", "Creativity", "Audience Engagement"],
      requiredSkillsAr: ["إنتاج الفيديو", "وسائل التواصل الاجتماعي", "الإبداع", "إشراك الجمهور"],
      relatedSubjects: ["Art", "English", "Computer Science"],
      category: "Media & Communications",
      educationLevel: "Varies (communications or media degree helpful)",
      averageSalary: "$35,000 - $100,000+",
      growthOutlook: "Excellent (growing field)",
      icon: "🎥",
      onetCode: "27-3043.00",
      valuesProfile: { achievement: 44, benevolence: 36, self_direction: 0, security: 38, power: 12 },
    },
    {
      title: "Photographer",
      description: "Tell stories through powerful images. Capture weddings, fashion shoots, news events, or nature scenes. Turn moments into memories and art that people treasure.",
      requiredSkills: ["Photography", "Photo Editing", "Lighting", "Creativity"],
      requiredSkillsAr: ["التصوير الفوتوغرافي", "تعديل الصور", "الإضاءة", "الإبداع"],
      relatedSubjects: ["Art", "Computer Science"],
      category: "Creative Arts",
      educationLevel: "Formal training helpful but not always required",
      averageSalary: "$35,000 - $80,000",
      growthOutlook: "Good (4% growth)",
      icon: "📸",
      onetCode: "27-4021.00",
      valuesProfile: { achievement: 15, benevolence: 50, self_direction: 44, security: 0, power: 12 },
    },
    {
      title: "Chef",
      description: "Create delicious dishes that make people's day better. Design menus, experiment with flavors and techniques, and lead kitchen teams in restaurants, hotels, or your own establishment.",
      requiredSkills: ["Cooking", "Menu Planning", "Food Safety", "Creativity"],
      requiredSkillsAr: ["الطبخ", "تخطيط قائمة الطعام", "سلامة الغذاء", "الإبداع"],
      relatedSubjects: ["Chemistry", "Art", "Business"],
      category: "Culinary Arts",
      educationLevel: "Culinary school or apprenticeship",
      averageSalary: "$40,000 - $85,000",
      growthOutlook: "Good (6% growth)",
      icon: "👨‍🍳",
      onetCode: "35-1011.00",
      valuesProfile: { achievement: 44, benevolence: 50, self_direction: 76, security: 32, power: 66 },
    },
    {
      title: "Fashion Designer",
      description: "Create the clothes and accessories that define style and culture. Sketch original designs, select fabrics, and see your creations on runways or in stores worldwide.",
      requiredSkills: ["Fashion Design", "Sewing", "Trend Forecasting", "Creativity"],
      requiredSkillsAr: ["تصميم الأزياء", "الخياطة", "توقع الاتجاهات", "الإبداع"],
      relatedSubjects: ["Art", "Design", "Business"],
      category: "Creative Arts",
      educationLevel: "Bachelor's degree in Fashion Design",
      averageSalary: "$45,000 - $95,000",
      growthOutlook: "Stable (0% growth)",
      icon: "👗",
      onetCode: "27-1022.00",
      valuesProfile: { achievement: 72, benevolence: 36, self_direction: 54, security: 18, power: 44 },
    },
    {
      title: "Interior Designer",
      description: "Transform empty spaces into beautiful, functional rooms where people love to live and work. Choose colors, furniture, and layouts that match clients' dreams and lifestyles.",
      requiredSkills: ["Space Planning", "Color Theory", "3D Modeling", "Client Communication"],
      requiredSkillsAr: ["تخطيط المساحات", "نظرية الألوان", "النمذجة ثلاثية الأبعاد", "التواصل مع العملاء"],
      relatedSubjects: ["Art", "Mathematics", "Design"],
      category: "Design & Architecture",
      educationLevel: "Bachelor's degree in Interior Design",
      averageSalary: "$45,000 - $90,000",
      growthOutlook: "Good (4% growth)",
      icon: "🛋️",
      onetCode: "27-1025.00",
      valuesProfile: { achievement: 72, benevolence: 58, self_direction: 66, security: 10, power: 34 },
    },
    {
      title: "Web Developer",
      description: "Build attractive, high-performance websites and web applications. Turn interface designs into smooth, interactive experiences using modern web technologies and collaborate with design teams to launch standout digital products.",
      requiredSkills: ["HTML/CSS", "JavaScript", "Frontend Frameworks", "APIs"],
      requiredSkillsAr: ["HTML/CSS", "JavaScript", "أطر العمل الأمامية", "واجهات برمجة التطبيقات"],
      relatedSubjects: ["Computer Science", "Mathematics", "Design"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Computer Science or related field",
      averageSalary: "$60,000 - $120,000",
      growthOutlook: "Excellent (23% growth)",
      icon: "🌐",
      onetCode: "15-1254.00",
      valuesProfile: { achievement: 44, benevolence: 36, self_direction: 66, security: 58, power: 56 },
    },
    // --- PHASE 3 STEP 1: Space & Advanced Sciences careers ---------------------
    // Spec: docs/new-careers-spec.md §5. Both carry a per-career override to
    // Space & Advanced Sciences (UAE_SECTOR_CAREER_OVERRIDES above) — Aerospace
    // because the Engineering category rule would credit Renewable Energy &
    // Sustainability instead, Space Scientist because its category (Science)
    // has no rule at all and it would otherwise floor at 40.
    //
    // RESOLVED in Phase 3 Stage 1: both now carry a COMPUTED valuesProfile.
    // The blocker recorded in docs/phase3-space-careers.md was that the
    // Work-Styles pipeline (onet_fetch_cache.py -> compute_profiles.py) needs an
    // ONET_KEY. That pipeline is superseded (docs/cvq-divergence-recon.md): the
    // shipped profiles come from the O*NET 30.0 Work Values flat file via
    // scripts/generate-cvq-values-profiles.ts, which needs no key. Both codes
    // (17-2011.00, 19-2011.00) are in the 874-occupation Work Values set, so
    // they were computed with the other 66 in one catalog-wide pass — on the
    // SAME basis as every other career, which is what the original block
    // required. Values are still COMPUTED, never authored
    // (docs/VALUES_PROFILE_DERIVATION_METHODOLOGY.md:34).
    {
      title: "Aerospace Engineer",
      description: "Design the satellites, rockets and aircraft that leave the ground and stay there. Work on the propulsion, structures and control systems that make a Mars mission or an Earth-observation satellite actually fly.",
      requiredSkills: ["Aerodynamics", "Propulsion Systems", "Systems Engineering", "Simulation and Testing"],
      requiredSkillsAr: ["الديناميكا الهوائية", "أنظمة الدفع", "هندسة الأنظمة", "المحاكاة والاختبار"],
      // Normalizes to {Science, Mathematics, Computer Science} — verified against
      // normalizeCareerSubjects; does NOT floor at 20.
      relatedSubjects: ["Physics", "Mathematics", "Engineering", "Computer Science"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Aerospace or Mechanical Engineering",
      averageSalary: "$75,000 - $135,000",
      // O*NET 17-2011.00, BLS projections 2024-2034: "Faster than average
      // (5% to 6%)", 71,600 employed, 4,500 openings. Bright Outlook: YES.
      // Lower bound of the band, and the tier must be one of the five the client
      // localiser knows (Results.tsx:132-138) or the Arabic report falls back to
      // English for this field.
      growthOutlook: "Very Good (5% growth)",
      icon: "🛰️",
      onetCode: "17-2011.00",
      valuesProfile: { achievement: 44, benevolence: 44, self_direction: 54, security: 72, power: 66 },
    },
    {
      title: "Space Scientist (Astrophysicist)",
      description: "Study planets, stars and the physics of everything beyond Earth. Analyse data from telescopes and space probes to answer questions nobody has answered yet, and help plan the missions that go looking.",
      requiredSkills: ["Astrophysics", "Data Analysis", "Scientific Modelling", "Research Writing"],
      requiredSkillsAr: ["الفيزياء الفلكية", "تحليل البيانات", "النمذجة العلمية", "الكتابة البحثية"],
      // Normalizes to {Science, Mathematics, Computer Science}. "Astronomy" has no
      // umbrella-6 home and is dropped by design — it is a student-facing flavour
      // tag, exactly as Chef carries "Art" and "Business".
      relatedSubjects: ["Physics", "Mathematics", "Astronomy", "Computer Science"],
      category: "Science",
      educationLevel: "Master's or PhD in Physics, Astronomy, or Space Science",
      averageSalary: "$70,000 - $130,000",
      // O*NET 19-2011.00, BLS projections 2024-2034: "Slower than average
      // (1% to 2%)", only 1,800 employed, 100 openings. Bright Outlook: NO.
      // Reported honestly rather than dressed up - this is a small, slow-growing
      // occupation, and a 13-18 audience is exactly who should be told that.
      growthOutlook: "Moderate (1% growth)",
      icon: "🔭",
      onetCode: "19-2011.00",
      valuesProfile: { achievement: 85, benevolence: 0, self_direction: 66, security: 28, power: 78 },
    },

    // =====================================================================
    // PHASE 3 STAGE 1 — the 29 derived careers (docs/career-sourcing-map.md §5)
    // =====================================================================
    // Tier 1 (16) + Tier 2 (13). Every one is a rated O*NET-SOC occupation
    // present in the 874-occupation Work Values set, so all 29 carry a computed
    // valuesProfile — NO substitutions were required (unlike Software Engineer,
    // Financial Analyst and Product Manager, see
    // scripts/generate-cvq-values-profiles.ts §1a).
    //
    // ⚠️ valuesProfile on EVERY career in this array (all 68, not just these 29)
    // was REGENERATED IN ONE PASS when these were added. The rescale is
    // catalog-wide — see the SCALE WARNING in
    // server/migrations/career-values-profiles.ts. Never hand-edit one row.
    //
    // ⚠️ STAGE 1 IS DATA ONLY. No WEF skill affinity, RIASEC affinity, sector
    // category rule or per-career override exists for these 29 yet (Stage 2).
    // Until Stage 2 lands: the 12 that fall in categories WITH a rule inherit
    // that category's sector; the 6 in `Science` and the 1 in the new
    // `Aviation & Transport` category have NO rule and FLOOR AT 40 on vision,
    // exactly as Environmental Scientist and Space Scientist do without their
    // overrides. That is expected at this stage, not a defect.
    //
    // ⚠️ `growthOutlook` tier must be one of the five the client localiser knows
    // (client/src/pages/Results.tsx:131-137) or the Arabic report silently falls
    // back to English. Every value below is mapped from the real O*NET/BLS
    // 2024-2034 projection recorded in the comment above it.

    {
      title: "Cybersecurity Analyst",
      description: "Defend banks, hospitals and government systems from hackers by hunting for weaknesses before attackers find them. Investigate real intrusions and build the defences that keep millions of people's data safe.",
      requiredSkills: ["Network Security", "Threat Analysis", "Incident Response", "Risk Assessment"],
      requiredSkillsAr: ["أمن الشبكات", "تحليل التهديدات", "الاستجابة للحوادث", "تقييم المخاطر"],
      relatedSubjects: ["Computer Science", "Mathematics", "Physics"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Cybersecurity, Computer Science, or Information Technology",
      averageSalary: "$75,000 - $130,000",
      // O*NET 15-1212.00, BLS 2024-2034: "Much faster than average (7% or higher)",
      // median $129,180, 182,800 employed. Bright Outlook: YES.
      growthOutlook: "Excellent (7% growth)",
      icon: "🛡️",
      onetCode: "15-1212.00", // Information Security Analysts
      valuesProfile: { achievement: 28, benevolence: 44, self_direction: 54, security: 80, power: 34 },
    },
    {
      title: "AI Research Scientist",
      description: "Invent the algorithms that let machines see, read and reason. Design and test new AI models, then publish what works so the whole field can build on it.",
      requiredSkills: ["Machine Learning", "Algorithm Design", "Mathematical Modelling", "Research Methods"],
      requiredSkillsAr: ["التعلم الآلي", "تصميم الخوارزميات", "النمذجة الرياضية", "مناهج البحث"],
      relatedSubjects: ["Mathematics", "Computer Science", "Physics", "Statistics"],
      category: "Technology",
      educationLevel: "Master's or PhD in Computer Science, Artificial Intelligence, or Mathematics",
      averageSalary: "$85,000 - $140,000",
      // O*NET 15-1221.00, BLS 2024-2034: "Much faster than average (7% or higher)",
      // median $140,300, 40,300 employed. Bright Outlook: YES.
      growthOutlook: "Excellent (7% growth)",
      icon: "🧠",
      onetCode: "15-1221.00", // Computer and Information Research Scientists
      valuesProfile: { achievement: 72, benevolence: 29, self_direction: 54, security: 70, power: 66 },
    },
    {
      title: "Robotics Engineer",
      description: "Build robots that weld car bodies, pick crops or perform surgery, and write the control code that makes them move precisely. Turn machines into something that can sense the world and act on it.",
      requiredSkills: ["Control Systems", "Mechanical Design", "Embedded Programming", "Sensor Integration"],
      requiredSkillsAr: ["أنظمة التحكم", "التصميم الميكانيكي", "برمجة الأنظمة المدمجة", "تكامل المستشعرات"],
      relatedSubjects: ["Physics", "Mathematics", "Computer Science", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Robotics, Mechatronics, or Mechanical Engineering",
      averageSalary: "$70,000 - $125,000",
      // O*NET 17-2199.08, BLS 2024-2034: "Slower than average (1% to 2%)",
      // median $122,930 (parent: Engineers, All Other), 158,800 (parent) employed. Bright Outlook: YES.
      growthOutlook: "Moderate (1% growth)",
      icon: "🤖",
      onetCode: "17-2199.08", // Robotics Engineers
      valuesProfile: { achievement: 56, benevolence: 22, self_direction: 66, security: 74, power: 56 },
    },
    {
      title: "Nuclear Engineer",
      description: "Design reactor systems that generate huge amounts of electricity without burning anything. Work on the safety, fuel and shielding decisions that let a nuclear plant run for sixty years without harming anyone.",
      requiredSkills: ["Reactor Physics", "Radiation Safety", "Thermal Analysis", "Systems Engineering"],
      requiredSkillsAr: ["فيزياء المفاعلات", "السلامة الإشعاعية", "التحليل الحراري", "هندسة الأنظمة"],
      relatedSubjects: ["Physics", "Mathematics", "Chemistry", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Nuclear Engineering or Mechanical Engineering",
      averageSalary: "$80,000 - $135,000",
      // O*NET 17-2161.00, BLS 2024-2034: "Decline (-1% or lower)",
      // median $133,970, 15,400 employed. Bright Outlook: YES.
      // ⚠️ O*NET projects DECLINE. The client localiser has no "Declining"
      // tier and its pattern requires a non-negative integer
      // (Results.tsx:140), so the honest value cannot be expressed today.
      // Recorded as the lowest expressible tier and FLAGGED in
      // docs/phase3-stage1-done.md — a 6th tier is needed.
      growthOutlook: "Moderate (0% growth)",
      icon: "⚛️",
      onetCode: "17-2161.00", // Nuclear Engineers
      valuesProfile: { achievement: 72, benevolence: 0, self_direction: 44, security: 72, power: 78 },
    },
    {
      title: "Chemical Engineer",
      description: "Scale a reaction that works in a test tube up to a plant that makes thousands of tonnes of it. Design the processes behind clean hydrogen, plastics, fertiliser and medicine.",
      requiredSkills: ["Process Design", "Thermodynamics", "Reaction Engineering", "Process Safety"],
      requiredSkillsAr: ["تصميم العمليات", "الديناميكا الحرارية", "هندسة التفاعلات", "سلامة العمليات"],
      relatedSubjects: ["Chemistry", "Mathematics", "Physics", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Chemical Engineering",
      averageSalary: "$75,000 - $125,000",
      // O*NET 17-2041.00, BLS 2024-2034: "Average (3% to 4%)",
      // median $125,040, 21,600 employed. Bright Outlook: YES.
      growthOutlook: "Good (3% growth)",
      icon: "⚗️",
      onetCode: "17-2041.00", // Chemical Engineers
      valuesProfile: { achievement: 56, benevolence: 36, self_direction: 54, security: 52, power: 78 },
    },
    {
      title: "Risk & Compliance Officer",
      description: "Make sure a bank or trading firm is actually following the rules that protect its customers. Investigate suspicious transactions and stop financial crime before the money moves.",
      requiredSkills: ["Regulatory Analysis", "Anti-Money Laundering", "Investigation", "Report Writing"],
      requiredSkillsAr: ["التحليل التنظيمي", "مكافحة غسل الأموال", "التحقيق", "كتابة التقارير"],
      relatedSubjects: ["Economics", "Mathematics", "English", "Business"],
      category: "Finance",
      educationLevel: "Bachelor's degree in Finance, Law, Accounting, or Business",
      averageSalary: "$50,000 - $80,000",
      // O*NET 13-1041.00, BLS 2024-2034: "Average (3% to 4%)",
      // median $80,730, 418,000 employed. Bright Outlook: YES.
      growthOutlook: "Good (3% growth)",
      icon: "⚖️",
      onetCode: "13-1041.00", // Compliance Officers
      valuesProfile: { achievement: 0, benevolence: 58, self_direction: 32, security: 42, power: 0 },
    },
    {
      title: "Geneticist",
      description: "Read the DNA that makes each person unique and find the tiny changes that cause disease. Turn genome data into treatments doctors can actually give a patient.",
      requiredSkills: ["Molecular Biology", "Genome Analysis", "Laboratory Technique", "Scientific Writing"],
      requiredSkillsAr: ["البيولوجيا الجزيئية", "تحليل الجينوم", "التقنيات المخبرية", "الكتابة العلمية"],
      relatedSubjects: ["Biology", "Chemistry", "Mathematics", "Statistics"],
      category: "Science",
      educationLevel: "Master's or PhD in Genetics, Molecular Biology, or Genomics",
      averageSalary: "$60,000 - $100,000",
      // O*NET 19-1029.03, BLS 2024-2034: "Slower than average (1% to 2%)",
      // median $98,920, 63,700 employed. Bright Outlook: YES.
      growthOutlook: "Moderate (1% growth)",
      icon: "🧬",
      onetCode: "19-1029.03", // Geneticists
      valuesProfile: { achievement: 72, benevolence: 29, self_direction: 66, security: 42, power: 88 },
    },
    {
      title: "Health Informatics Specialist",
      description: "Build the systems that put a patient's whole medical history in front of a doctor in one second. Turn scattered hospital records into data that spots illness earlier.",
      requiredSkills: ["Health Data Systems", "Clinical Workflow Analysis", "Data Privacy", "Database Design"],
      requiredSkillsAr: ["أنظمة البيانات الصحية", "تحليل سير العمل السريري", "خصوصية البيانات", "تصميم قواعد البيانات"],
      relatedSubjects: ["Computer Science", "Biology", "Mathematics", "Health Science"],
      category: "Healthcare",
      educationLevel: "Bachelor's or Master's degree in Health Informatics, Computer Science, or Public Health",
      averageSalary: "$65,000 - $105,000",
      // O*NET 15-1211.01, BLS 2024-2034: "Much faster than average (7% or higher)",
      // median $105,850, 521,100 employed. Bright Outlook: YES.
      growthOutlook: "Excellent (7% growth)",
      icon: "🩺",
      onetCode: "15-1211.01", // Health Informatics Specialists
      valuesProfile: { achievement: 44, benevolence: 50, self_direction: 44, security: 56, power: 44 },
    },
    {
      title: "Hospitality Manager",
      description: "Run a hotel so well that guests from thirty countries all feel looked after. Lead the front-desk, housekeeping and events teams, and fix problems before anyone notices them.",
      requiredSkills: ["Operations Management", "Guest Relations", "Team Leadership", "Budgeting"],
      requiredSkillsAr: ["إدارة العمليات", "علاقات الضيوف", "قيادة الفريق", "إعداد الميزانيات"],
      relatedSubjects: ["Business", "Economics", "English", "Arabic"],
      category: "Business & Management",
      educationLevel: "Bachelor's degree in Hospitality Management or Business Administration",
      averageSalary: "$45,000 - $70,000",
      // O*NET 11-9081.00, BLS 2024-2034: "Average (3% to 4%)",
      // median $69,250, 52,000 employed. Bright Outlook: YES.
      growthOutlook: "Good (3% growth)",
      icon: "🏨",
      onetCode: "11-9081.00", // Lodging Managers
      valuesProfile: { achievement: 44, benevolence: 100, self_direction: 76, security: 32, power: 34 },
    },
    {
      title: "Tourism & Events Manager",
      description: "Plan the conferences, festivals and world expos that bring thousands of visitors into a city. Handle the venues, budgets and schedules so that on the day everything simply works.",
      requiredSkills: ["Event Planning", "Vendor Negotiation", "Logistics Coordination", "Budget Management"],
      requiredSkillsAr: ["تخطيط الفعاليات", "التفاوض مع الموردين", "تنسيق اللوجستيات", "إدارة الميزانية"],
      relatedSubjects: ["Business", "Geography", "English", "Arabic"],
      category: "Business & Management",
      educationLevel: "Bachelor's degree in Event Management, Tourism, Hospitality, or Business",
      averageSalary: "$40,000 - $60,000",
      // O*NET 13-1121.00, BLS 2024-2034: "Faster than average (5% to 6%)",
      // median $61,160, 155,800 employed. Bright Outlook: YES.
      growthOutlook: "Very Good (5% growth)",
      icon: "🎪",
      onetCode: "13-1121.00", // Meeting, Convention, and Event Planners
      valuesProfile: { achievement: 44, benevolence: 86, self_direction: 54, security: 32, power: 56 },
    },
    {
      title: "Airline Pilot",
      description: "Fly a three-hundred-tonne aircraft full of people safely across continents. Read the weather, the systems and the fuel, and make the calls that keep everyone on board safe.",
      requiredSkills: ["Flight Operations", "Navigation", "Situational Awareness", "Crew Coordination"],
      requiredSkillsAr: ["عمليات الطيران", "الملاحة", "الوعي الظرفي", "تنسيق الطاقم"],
      relatedSubjects: ["Physics", "Mathematics", "Geography", "English"],
      category: "Aviation & Transport",
      educationLevel: "Commercial pilot licence (ATPL) plus flight-school training; a bachelor's degree is often preferred",
      averageSalary: "$110,000 - $230,000",
      // O*NET 53-2011.00, BLS 2024-2034: "Average (3% to 4%)",
      // median $232,140, 100,000 employed. Bright Outlook: YES.
      growthOutlook: "Good (3% growth)",
      icon: "✈️",
      onetCode: "53-2011.00", // Airline Pilots, Copilots, and Flight Engineers
      valuesProfile: { achievement: 72, benevolence: 58, self_direction: 88, security: 100, power: 78 },
    },
    {
      title: "Agricultural Scientist (Agronomist)",
      description: "Work out how to grow food in one of the hottest, driest places on Earth. Study soil, water and crop genetics to make desert farming produce more with less, so the country can feed itself.",
      requiredSkills: ["Soil Science", "Crop Management", "Field Experimentation", "Data Analysis"],
      requiredSkillsAr: ["علم التربة", "إدارة المحاصيل", "التجارب الحقلية", "تحليل البيانات"],
      relatedSubjects: ["Biology", "Chemistry", "Environmental Science", "Geography"],
      category: "Science",
      educationLevel: "Bachelor's or Master's degree in Agricultural Science or Agronomy",
      averageSalary: "$55,000 - $80,000",
      // O*NET 19-1013.00, BLS 2024-2034: "Faster than average (5% to 6%)",
      // median $78,850, 20,700 employed. Bright Outlook: YES.
      growthOutlook: "Very Good (5% growth)",
      icon: "🌾",
      onetCode: "19-1013.00", // Soil and Plant Scientists
      valuesProfile: { achievement: 85, benevolence: 36, self_direction: 66, security: 36, power: 66 },
    },
    {
      title: "Food Technologist",
      description: "Invent food that stays fresh longer, tastes better and is safe to eat months after it leaves the factory. Test what is really inside a product and design the process that makes it at scale.",
      requiredSkills: ["Food Chemistry", "Quality Assurance", "Product Development", "Food Safety Standards"],
      requiredSkillsAr: ["كيمياء الأغذية", "ضمان الجودة", "تطوير المنتجات", "معايير سلامة الغذاء"],
      relatedSubjects: ["Chemistry", "Biology", "Mathematics"],
      category: "Science",
      educationLevel: "Bachelor's degree in Food Science, Food Technology, or Chemistry",
      averageSalary: "$55,000 - $90,000",
      // O*NET 19-1012.00, BLS 2024-2034: "Much faster than average (7% or higher)",
      // median $88,720, 15,200 employed. Bright Outlook: YES.
      growthOutlook: "Excellent (7% growth)",
      icon: "🥫",
      onetCode: "19-1012.00", // Food Scientists and Technologists
      valuesProfile: { achievement: 44, benevolence: 44, self_direction: 22, security: 56, power: 44 },
    },
    {
      title: "Agricultural Engineer",
      description: "Engineer the indoor farms that grow lettuce in the desert using ninety percent less water. Design the irrigation, climate control and machinery that make food production possible where nothing should grow.",
      requiredSkills: ["Irrigation Systems", "Controlled-Environment Design", "Machinery Engineering", "Resource Efficiency"],
      requiredSkillsAr: ["أنظمة الري", "تصميم البيئات المتحكم بها", "هندسة الآلات", "كفاءة الموارد"],
      relatedSubjects: ["Physics", "Mathematics", "Biology", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Agricultural or Biosystems Engineering",
      averageSalary: "$60,000 - $100,000",
      // O*NET 17-2021.00, BLS 2024-2034: "Faster than average (5% to 6%)",
      // median $98,590, 1,700 employed. Bright Outlook: YES.
      growthOutlook: "Very Good (5% growth)",
      icon: "🚜",
      onetCode: "17-2021.00", // Agricultural Engineers
      valuesProfile: { achievement: 56, benevolence: 22, self_direction: 66, security: 52, power: 44 },
    },
    {
      title: "Satellite & Remote Sensing Scientist",
      description: "Turn pictures taken from orbit into answers about the planet below. Track shrinking water, growing cities and dust storms using satellite data nobody else has looked at yet.",
      requiredSkills: ["Satellite Imagery Analysis", "Geospatial Systems", "Data Processing", "Scientific Modelling"],
      requiredSkillsAr: ["تحليل صور الأقمار الصناعية", "النظم الجغرافية المكانية", "معالجة البيانات", "النمذجة العلمية"],
      relatedSubjects: ["Physics", "Mathematics", "Geography", "Computer Science"],
      category: "Science",
      educationLevel: "Bachelor's or Master's degree in Remote Sensing, Geomatics, or Earth Science",
      averageSalary: "$70,000 - $125,000",
      // O*NET 19-2099.01, BLS 2024-2034: "Slower than average (1% to 2%)",
      // median $122,570, 31,900 employed. Bright Outlook: YES.
      growthOutlook: "Moderate (1% growth)",
      icon: "🛰️",
      onetCode: "19-2099.01", // Remote Sensing Scientists and Technologists
      valuesProfile: { achievement: 72, benevolence: 36, self_direction: 54, security: 52, power: 66 },
    },
    {
      title: "Film & TV Producer",
      description: "Take a story from a first idea to something millions of people watch. Pick the crew, hold the budget and make the hundred daily decisions that decide how the finished film feels.",
      requiredSkills: ["Production Planning", "Storytelling", "Team Direction", "Budget Management"],
      requiredSkillsAr: ["تخطيط الإنتاج", "السرد القصصي", "إدارة الفريق", "إدارة الميزانية"],
      relatedSubjects: ["English", "Arabic", "Art", "Business"],
      category: "Media & Communications",
      educationLevel: "Bachelor's degree in Film, Media Production, or Communications",
      averageSalary: "$50,000 - $90,000",
      // O*NET 27-2012.00, BLS 2024-2034: "Faster than average (5% to 6%)",
      // median $90,360, 167,000 employed. Bright Outlook: YES.
      growthOutlook: "Very Good (5% growth)",
      icon: "🎬",
      onetCode: "27-2012.00", // Producers and Directors
      valuesProfile: { achievement: 79, benevolence: 62, self_direction: 88, security: 28, power: 88 },
    },
    {
      title: "Data Engineer",
      description: "Build the pipelines and databases that move billions of records without losing one. Design the foundations every dashboard, app and AI model quietly depends on.",
      requiredSkills: ["Data Modelling", "SQL and Pipelines", "Cloud Data Platforms", "Performance Tuning"],
      requiredSkillsAr: ["نمذجة البيانات", "SQL وخطوط البيانات", "منصات البيانات السحابية", "تحسين الأداء"],
      relatedSubjects: ["Computer Science", "Mathematics", "Statistics"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Computer Science, Information Systems, or Data Engineering",
      averageSalary: "$85,000 - $140,000",
      // O*NET 15-1243.00, BLS 2024-2034: "Much faster than average (7% or higher)",
      // median $139,500, 66,900 employed. Bright Outlook: YES.
      growthOutlook: "Excellent (7% growth)",
      icon: "🗄️",
      onetCode: "15-1243.00", // Database Architects
      valuesProfile: { achievement: 85, benevolence: 8, self_direction: 54, security: 46, power: 34 },
    },
    {
      title: "Atmospheric & Space Scientist",
      description: "Forecast dust storms, study how clouds form and test whether you can make it rain over a desert. Use satellites and physics to predict an atmosphere that affects everyone's day.",
      requiredSkills: ["Atmospheric Physics", "Numerical Modelling", "Data Analysis", "Instrumentation"],
      requiredSkillsAr: ["فيزياء الغلاف الجوي", "النمذجة العددية", "تحليل البيانات", "الأجهزة العلمية"],
      relatedSubjects: ["Physics", "Mathematics", "Geography", "Computer Science"],
      category: "Science",
      educationLevel: "Bachelor's or Master's degree in Atmospheric Science, Meteorology, or Physics",
      averageSalary: "$60,000 - $100,000",
      // O*NET 19-2021.00, BLS 2024-2034: "Slower than average (1% to 2%)",
      // median $99,070, 9,400 employed. Bright Outlook: YES.
      growthOutlook: "Moderate (1% growth)",
      icon: "🌦️",
      onetCode: "19-2021.00", // Atmospheric and Space Scientists
      valuesProfile: { achievement: 56, benevolence: 58, self_direction: 44, security: 30, power: 44 },
    },
    {
      title: "Physicist",
      description: "Ask how the universe actually works and then design the experiment that answers it. Work on quantum computers, lasers and materials that did not exist five years ago.",
      requiredSkills: ["Theoretical Physics", "Experimental Design", "Mathematical Analysis", "Scientific Computing"],
      requiredSkillsAr: ["الفيزياء النظرية", "تصميم التجارب", "التحليل الرياضي", "الحوسبة العلمية"],
      relatedSubjects: ["Physics", "Mathematics", "Computer Science"],
      category: "Science",
      educationLevel: "Master's or PhD in Physics",
      averageSalary: "$95,000 - $170,000",
      // O*NET 19-2012.00, BLS 2024-2034: "Average (3% to 4%)",
      // median $172,250, 24,600 employed. Bright Outlook: YES.
      growthOutlook: "Good (3% growth)",
      icon: "🔬",
      onetCode: "19-2012.00", // Physicists
      valuesProfile: { achievement: 85, benevolence: 8, self_direction: 76, security: 60, power: 100 },
    },
    {
      title: "Environmental Engineer",
      description: "Design the systems that clean a city's water, cut its emissions and deal with its waste. Solve pollution problems with engineering instead of hoping someone else will.",
      requiredSkills: ["Water Treatment Design", "Environmental Modelling", "Waste Management", "Regulatory Compliance"],
      requiredSkillsAr: ["تصميم معالجة المياه", "النمذجة البيئية", "إدارة النفايات", "الامتثال التنظيمي"],
      relatedSubjects: ["Chemistry", "Biology", "Mathematics", "Environmental Science"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Environmental or Civil Engineering",
      averageSalary: "$65,000 - $105,000",
      // O*NET 17-2081.00, BLS 2024-2034: "Average (3% to 4%)",
      // median $107,110, 39,400 employed. Bright Outlook: YES.
      growthOutlook: "Good (3% growth)",
      icon: "♻️",
      onetCode: "17-2081.00", // Environmental Engineers
      valuesProfile: { achievement: 72, benevolence: 44, self_direction: 44, security: 64, power: 78 },
    },
    {
      title: "Actuary",
      description: "Put a price on risk: how likely a flood is, how long people live, what an insurer should charge. Use probability and huge datasets to make decisions worth billions.",
      requiredSkills: ["Probability and Statistics", "Risk Modelling", "Financial Mathematics", "Data Analysis"],
      requiredSkillsAr: ["الاحتمالات والإحصاء", "نمذجة المخاطر", "الرياضيات المالية", "تحليل البيانات"],
      relatedSubjects: ["Mathematics", "Statistics", "Economics", "Computer Science"],
      category: "Finance",
      educationLevel: "Bachelor's degree in Actuarial Science, Mathematics, or Statistics plus professional exams",
      averageSalary: "$75,000 - $130,000",
      // O*NET 15-2011.00, BLS 2024-2034: "Much faster than average (7% or higher)",
      // median $130,000, 33,600 employed. Bright Outlook: YES.
      growthOutlook: "Excellent (7% growth)",
      icon: "📈",
      onetCode: "15-2011.00", // Actuaries
      valuesProfile: { achievement: 28, benevolence: 29, self_direction: 32, security: 52, power: 34 },
    },
    {
      title: "Investment & Financial Manager",
      description: "Decide where an organisation's money goes and make it grow. Read the markets, plan the funding and answer for the numbers when the results are published.",
      requiredSkills: ["Financial Analysis", "Investment Strategy", "Forecasting", "Stakeholder Communication"],
      requiredSkillsAr: ["التحليل المالي", "استراتيجية الاستثمار", "التنبؤ المالي", "التواصل مع أصحاب المصلحة"],
      relatedSubjects: ["Mathematics", "Economics", "Business", "English"],
      category: "Finance",
      educationLevel: "Bachelor's or Master's degree in Finance, Economics, or Business Administration",
      averageSalary: "$95,000 - $165,000",
      // O*NET 11-3031.00, BLS 2024-2034: "Much faster than average (7% or higher)",
      // median $166,570, 868,600 employed. Bright Outlook: YES.
      growthOutlook: "Excellent (7% growth)",
      icon: "💼",
      onetCode: "11-3031.00", // Financial Managers
      valuesProfile: { achievement: 56, benevolence: 58, self_direction: 76, security: 80, power: 78 },
    },
    {
      title: "Primary School Teacher",
      description: "Teach a child to read, add up and ask questions in the years when it matters most. Build the confidence and curiosity that everything they learn afterwards is stacked on.",
      requiredSkills: ["Lesson Planning", "Classroom Management", "Child Development", "Assessment"],
      requiredSkillsAr: ["تخطيط الدروس", "إدارة الصف", "نمو الطفل", "التقييم"],
      relatedSubjects: ["English", "Mathematics", "Science", "Arabic"],
      category: "Education",
      educationLevel: "Bachelor's degree in Education or Primary Teaching plus teaching licence",
      averageSalary: "$45,000 - $65,000",
      // O*NET 25-2021.00, BLS 2024-2034: "Decline (-1% or lower)",
      // median $63,970, 1,422,700 employed. Bright Outlook: YES.
      // ⚠️ O*NET projects DECLINE. The client localiser has no "Declining"
      // tier and its pattern requires a non-negative integer
      // (Results.tsx:140), so the honest value cannot be expressed today.
      // Recorded as the lowest expressible tier and FLAGGED in
      // docs/phase3-stage1-done.md — a 6th tier is needed.
      growthOutlook: "Moderate (0% growth)",
      icon: "🍎",
      onetCode: "25-2021.00", // Elementary School Teachers, Except Special Education
      valuesProfile: { achievement: 72, benevolence: 86, self_direction: 54, security: 64, power: 34 },
    },
    {
      title: "School Counsellor & Career Advisor",
      description: "Help students work out who they are and what they could do next. Sit with a teenager who has no idea what to choose, and give them a real, honest path forward.",
      requiredSkills: ["Counselling", "Career Assessment", "Active Listening", "Student Advocacy"],
      requiredSkillsAr: ["الإرشاد النفسي", "التقييم المهني", "الإصغاء الفعّال", "الدفاع عن الطلاب"],
      relatedSubjects: ["Psychology", "English", "Arabic", "Social Studies"],
      category: "Education",
      educationLevel: "Bachelor's or Master's degree in Counselling, Psychology, or Education",
      averageSalary: "$45,000 - $65,000",
      // O*NET 21-1012.00, BLS 2024-2034: "Average (3% to 4%)",
      // median $64,330, 376,300 employed. Bright Outlook: YES.
      growthOutlook: "Good (3% growth)",
      icon: "🧭",
      onetCode: "21-1012.00", // Educational, Guidance, and Career Counselors and Advisors
      valuesProfile: { achievement: 56, benevolence: 100, self_direction: 32, security: 42, power: 44 },
    },
    {
      title: "Curriculum & Instructional Designer",
      description: "Design what gets taught and how, for a whole school or a whole country. Turn a subject into lessons, materials and assessments that actually work in a real classroom.",
      requiredSkills: ["Curriculum Design", "Learning Assessment", "Teacher Training", "Educational Technology"],
      requiredSkillsAr: ["تصميم المناهج", "تقييم التعلم", "تدريب المعلمين", "تقنيات التعليم"],
      relatedSubjects: ["English", "Mathematics", "Science", "Computer Science"],
      category: "Education",
      educationLevel: "Master's degree in Curriculum and Instruction or Education",
      averageSalary: "$50,000 - $75,000",
      // O*NET 25-9031.00, BLS 2024-2034: "Slower than average (1% to 2%)",
      // median $77,440, 232,600 employed. Bright Outlook: YES.
      growthOutlook: "Moderate (1% growth)",
      icon: "📐",
      onetCode: "25-9031.00", // Instructional Coordinators
      valuesProfile: { achievement: 72, benevolence: 78, self_direction: 76, security: 28, power: 44 },
    },
    {
      title: "Cloud & Network Architect",
      description: "Design the networks and cloud systems that carry a company's entire business without falling over. Plan the capacity, the security and the backup for the day something breaks.",
      requiredSkills: ["Network Design", "Cloud Infrastructure", "Systems Security", "Capacity Planning"],
      requiredSkillsAr: ["تصميم الشبكات", "البنية السحابية", "أمن الأنظمة", "تخطيط السعة"],
      relatedSubjects: ["Computer Science", "Mathematics", "Physics"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Computer Science, Network Engineering, or Information Technology",
      averageSalary: "$80,000 - $135,000",
      // O*NET 15-1241.00, BLS 2024-2034: "Much faster than average (7% or higher)",
      // median $134,050, 179,200 employed. Bright Outlook: YES.
      growthOutlook: "Excellent (7% growth)",
      icon: "☁️",
      onetCode: "15-1241.00", // Computer Network Architects
      valuesProfile: { achievement: 85, benevolence: 8, self_direction: 54, security: 58, power: 34 },
    },
    {
      title: "Industrial Engineer",
      description: "Find the wasted time, money and material inside a factory or hospital and design it out. Redesign how work flows so the same people produce far more with less effort.",
      requiredSkills: ["Process Optimisation", "Operations Analysis", "Quality Systems", "Supply Chain Design"],
      requiredSkillsAr: ["تحسين العمليات", "تحليل العمليات التشغيلية", "أنظمة الجودة", "تصميم سلاسل التوريد"],
      relatedSubjects: ["Mathematics", "Physics", "Statistics", "Business"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Industrial, Manufacturing, or Systems Engineering",
      averageSalary: "$65,000 - $100,000",
      // O*NET 17-2112.00, BLS 2024-2034: "Much faster than average (7% or higher)",
      // median $102,440, 351,100 employed. Bright Outlook: YES.
      growthOutlook: "Excellent (7% growth)",
      icon: "🏭",
      onetCode: "17-2112.00", // Industrial Engineers
      valuesProfile: { achievement: 56, benevolence: 29, self_direction: 66, security: 68, power: 78 },
    },
    {
      title: "Video Editor",
      description: "Cut hours of raw footage into something people cannot stop watching. Choose every shot, sound and pause so a story lands exactly the way it was meant to.",
      requiredSkills: ["Video Editing", "Colour and Sound", "Visual Storytelling", "Post-Production Workflow"],
      requiredSkillsAr: ["مونتاج الفيديو", "تصحيح الألوان والصوت", "السرد البصري", "سير عمل ما بعد الإنتاج"],
      relatedSubjects: ["Art", "English", "Computer Science", "Arabic"],
      category: "Media & Communications",
      educationLevel: "Bachelor's degree in Film, Media Production, or a strong portfolio",
      averageSalary: "$45,000 - $75,000",
      // O*NET 27-4032.00, BLS 2024-2034: "Average (3% to 4%)",
      // median $75,420, 43,500 employed. Bright Outlook: YES.
      growthOutlook: "Good (3% growth)",
      icon: "🎞️",
      onetCode: "27-4032.00", // Film and Video Editors
      valuesProfile: { achievement: 44, benevolence: 8, self_direction: 54, security: 16, power: 56 },
    },
    {
      title: "Dietitian & Nutritionist",
      description: "Work out exactly what someone should eat to manage diabetes, recover from surgery or perform as an athlete. Turn food science into a plan a real person can follow.",
      requiredSkills: ["Clinical Nutrition", "Dietary Assessment", "Patient Counselling", "Food Science"],
      requiredSkillsAr: ["التغذية السريرية", "التقييم الغذائي", "إرشاد المرضى", "علوم الأغذية"],
      relatedSubjects: ["Biology", "Chemistry", "Health Science", "Mathematics"],
      category: "Healthcare",
      educationLevel: "Bachelor's degree in Dietetics or Nutrition plus supervised practice and licensure",
      averageSalary: "$50,000 - $75,000",
      // O*NET 29-1031.00, BLS 2024-2034: "Faster than average (5% to 6%)",
      // median $76,400, 90,900 employed. Bright Outlook: YES.
      growthOutlook: "Very Good (5% growth)",
      icon: "🥗",
      onetCode: "29-1031.00", // Dietitians and Nutritionists
      valuesProfile: { achievement: 44, benevolence: 78, self_direction: 66, security: 42, power: 56 },
    },
  ];

  const existingCareers = await storage.getAllCareers();
  const existingCareerTitles = new Set(existingCareers.map(c => c.title));

  for (const career of careers) {
    if (!existingCareerTitles.has(career.title)) {
      try {
        const created = await storage.createCareer(career);
        console.log(`✓ Created career: ${career.title}`);
        
        // Create job market trends for each country
        for (const country of countries) {
          try {
            await storage.createJobMarketTrend({
              countryId: country.id,
              careerId: created.id,
              demandScore: 50 + Math.random() * 50, // 50-100
              growthRate: Math.random() * 30, // 0-30%
              nationalPriorityAlignment: career.relatedSubjects.some(s => 
                country.prioritySectors.some(sector => sector.toLowerCase().includes(s.toLowerCase()))
              ) ? 70 + Math.random() * 30 : 40 + Math.random() * 40, // Higher if aligned
              year: 2025,
              averageSalaryLocal: career.averageSalary,
              openings: Math.floor(Math.random() * 1000) + 100,
            });
          } catch (error) {
            // Trend might exist
          }
        }
      } catch (error) {
        console.log(`Error creating career ${career.title}:`, error);
      }
    }
  }

  // Template-based quiz question generator
  const countryData = {
    "saudi-arabia": { name: "Saudi Arabia", vision: "Vision 2030", keyFocus: "tourism and entertainment" },
    "uae": { name: "UAE", vision: "UAE Centennial 2071", keyFocus: "technology and innovation" },
    "bahrain": { name: "Bahrain", vision: "Economic Vision 2030", keyFocus: "financial services" },
    "kuwait": { name: "Kuwait", vision: "Vision 2035", keyFocus: "private sector growth" },
    "oman": { name: "Oman", vision: "Vision 2040", keyFocus: "logistics and tourism" },
    "qatar": { name: "Qatar", vision: "National Vision 2030", keyFocus: "knowledge economy" },
    "singapore": { name: "Singapore", vision: "Smart Nation 2.0", keyFocus: "digital innovation" },
    "canada": { name: "Canada", vision: "Innovation Nation", keyFocus: "research and technology" },
    "australia": { name: "Australia", vision: "Future Made in Australia", keyFocus: "clean energy" },
    "germany": { name: "Germany", vision: "Energiewende 2050", keyFocus: "renewable energy" },
    "japan": { name: "Japan", vision: "Society 5.0", keyFocus: "AI and robotics" },
    "south-korea": { name: "South Korea", vision: "Korean New Deal", keyFocus: "green technology" },
    "usa": { name: "USA", vision: "National Strategy", keyFocus: "infrastructure" },
    "uk": { name: "UK", vision: "Levelling Up", keyFocus: "regional development" },
    "india": { name: "India", vision: "Atmanirbhar Bharat", keyFocus: "manufacturing" }
  };

  const generateTemplateQuestions = (): any[] => {
    const generated: any[] = [];
    
    // Template for each (domain, grade band) combination
    const templates = {
      vision_awareness_8_9: (country: any, countryId: string) => ({
        question: `What is a main goal of ${country.name}'s ${country.vision}?`,
        questionType: "multiple_choice",
        options: [
          { id: "a", text: `Develop ${country.keyFocus}` },
          { id: "b", text: "Stop all progress" },
          { id: "c", text: "Avoid technology" },
          { id: "d", text: "Reduce education" }
        ],
        correctAnswer: "a",
        gradeBand: "8-9",
        domain: "vision_awareness",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["National Development"],
        cognitiveLevel: "knowledge",
        outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
      }),
      vision_awareness_10_12: (country: any, countryId: string) => ({
        question: `${country.name}'s ${country.vision} emphasizes ${country.keyFocus}. Why is this important for the country's future?`,
        questionType: "multiple_choice",
        options: [
          { id: "a", text: "To create economic opportunities and prepare for the future" },
          { id: "b", text: "To eliminate all jobs" },
          { id: "c", text: "To stop development" },
          { id: "d", text: "To reduce innovation" }
        ],
        correctAnswer: "a",
        gradeBand: "10-12",
        domain: "vision_awareness",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["Economic Development", "Innovation"],
        cognitiveLevel: "comprehension",
        outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
      }),
      sector_competency_8_9: (country: any, countryId: string) => ({
        question: `To work in ${country.keyFocus} in ${country.name}, what skills would be helpful?`,
        questionType: "multiple_choice",
        options: [
          { id: "a", text: "Technology skills and continuous learning" },
          { id: "b", text: "No skills needed" },
          { id: "c", text: "Avoiding education" },
          { id: "d", text: "Only manual labor" }
        ],
        correctAnswer: "a",
        gradeBand: "8-9",
        domain: "sector_competency",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["Technology", "Learning"],
        cognitiveLevel: "comprehension",
        outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
      }),
      sector_competency_10_12: (country: any, countryId: string) => ({
        question: `Which competency is most valuable for careers aligned with ${country.name}'s focus on ${country.keyFocus}?`,
        questionType: "multiple_choice",
        options: [
          { id: "a", text: "Adaptability, technical skills, and innovation mindset" },
          { id: "b", text: "Resisting all change" },
          { id: "c", text: "Avoiding technology" },
          { id: "d", text: "No competency needed" }
        ],
        correctAnswer: "a",
        gradeBand: "10-12",
        domain: "sector_competency",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["Innovation", "Technology"],
        cognitiveLevel: "analysis",
        outcomeWeights: { vision: 0.2, sector: 0.7, motivation: 0.1 }
      }),
      personal_alignment_8_9: (country: any, countryId: string) => ({
        question: `If you care about ${country.keyFocus}, how motivated are you to learn more about careers in this area?`,
        questionType: "rating",
        options: [
          { id: "1", text: "1 - Not interested" },
          { id: "2", text: "2 - Slightly interested" },
          { id: "3", text: "3 - Moderately interested" },
          { id: "4", text: "4 - Very interested" },
          { id: "5", text: "5 - Extremely interested" }
        ],
        correctAnswer: null,
        gradeBand: "8-9",
        domain: "personal_alignment",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["Career Exploration"],
        cognitiveLevel: "knowledge",
        outcomeWeights: { vision: 0.2, sector: 0.2, motivation: 0.6 }
      }),
      personal_alignment_10_12: (country: any, countryId: string) => ({
        question: `How important is contributing to ${country.name}'s ${country.vision} in your career choice?`,
        questionType: "rating",
        options: [
          { id: "1", text: "1 - Not important" },
          { id: "2", text: "2 - Slightly important" },
          { id: "3", text: "3 - Moderately important" },
          { id: "4", text: "4 - Very important" },
          { id: "5", text: "5 - Extremely important" }
        ],
        correctAnswer: null,
        gradeBand: "10-12",
        domain: "personal_alignment",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["National Development", "Purpose"],
        cognitiveLevel: "knowledge",
        outcomeWeights: { vision: 0.3, sector: 0.1, motivation: 0.6 }
      })
    };

    // Generate questions for each country × grade band × domain
    for (const [countryId, country] of Object.entries(countryData)) {
      generated.push(templates.vision_awareness_8_9(country, countryId));
      generated.push(templates.vision_awareness_10_12(country, countryId));
      generated.push(templates.sector_competency_8_9(country, countryId));
      generated.push(templates.sector_competency_10_12(country, countryId));
      generated.push(templates.personal_alignment_8_9(country, countryId));
      generated.push(templates.personal_alignment_10_12(country, countryId));
    }

    return generated;
  };

  // Seed Quiz Questions - combining manual questions with template-generated ones
  const quizQuestions = [
    // VISION AWARENESS - Grade 8-9 - Global
    {
      question: "What does 'sustainable development' mean for a country's future?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Growing the economy as fast as possible" },
        { id: "b", text: "Meeting today's needs without harming future generations" },
        { id: "c", text: "Focusing only on environmental protection" },
        { id: "d", text: "Reducing all technology use" }
      ],
      correctAnswer: "b",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: null,
      sectorTags: ["Environment", "Sustainability"],
      interestTags: ["Science", "Environment"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.6, sector: 0.2, motivation: 0.2 }
    },
    // VISION AWARENESS - Grade 8-9 - UAE
    {
      question: "The UAE wants to be among the world's best countries by 2071. Which of these is a key part of their plan?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Leading in AI and space exploration" },
        { id: "b", text: "Focusing only on oil production" },
        { id: "c", text: "Avoiding all new technology" },
        { id: "d", text: "Reducing tourism" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: "uae",
      sectorTags: ["Artificial Intelligence", "Space Exploration", "Technology"],
      interestTags: ["Technology", "Science"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // VISION AWARENESS - Grade 8-9 - Saudi Arabia
    {
      question: "Saudi Arabia's Vision 2030 aims to reduce dependence on oil. What is one way they're doing this?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Developing tourism and entertainment sectors" },
        { id: "b", text: "Selling more oil" },
        { id: "c", text: "Closing schools" },
        { id: "d", text: "Stopping all construction" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: "saudi-arabia",
      sectorTags: ["Tourism & Entertainment", "Renewable Energy", "Technology & Innovation"],
      interestTags: ["Business", "Tourism", "Technology"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // VISION AWARENESS - Grade 10-12 - Global
    {
      question: "Many countries are investing heavily in renewable energy. What is the primary long-term benefit of this shift?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Lower electricity bills for everyone immediately" },
        { id: "b", text: "Reducing carbon emissions and ensuring energy security" },
        { id: "c", text: "Eliminating all traditional jobs" },
        { id: "d", text: "Making energy more expensive" }
      ],
      correctAnswer: "b",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: null,
      sectorTags: ["Renewable Energy", "Sustainability"],
      interestTags: ["Environment", "Engineering"],
      cognitiveLevel: "analysis",
      outcomeWeights: { vision: 0.6, sector: 0.3, motivation: 0.1 }
    },
    // VISION AWARENESS - Grade 10-12 - Singapore
    {
      question: "Singapore's Smart Nation 2.0 initiative focuses on using technology to improve citizens' lives. What is a key challenge they must address?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Balancing innovation with data privacy and security" },
        { id: "b", text: "Avoiding all digital technologies" },
        { id: "c", text: "Reducing education standards" },
        { id: "d", text: "Limiting internet access" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "singapore",
      sectorTags: ["Technology", "ICT & Digital Economy"],
      interestTags: ["Technology", "Government"],
      cognitiveLevel: "analysis",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    
    // SECTOR COMPETENCY - Grade 8-9 - Global
    {
      question: "If you enjoy solving puzzles and building things, which career path might suit you?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Engineering or Computer Science" },
        { id: "b", text: "Writing or Journalism" },
        { id: "c", text: "Sales or Marketing" },
        { id: "d", text: "Teaching Literature" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: null,
      sectorTags: ["Technology", "Engineering"],
      interestTags: ["Problem Solving", "Building", "Technology"],
      cognitiveLevel: "application",
      outcomeWeights: { vision: 0.1, sector: 0.7, motivation: 0.2 }
    },
    // SECTOR COMPETENCY - Grade 8-9 - UAE
    {
      question: "The UAE is investing heavily in space exploration. Which skills would be most valuable for someone wanting to work in this sector?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Math, physics, and engineering" },
        { id: "b", text: "Only drawing and art" },
        { id: "c", text: "Only sports training" },
        { id: "d", text: "Only language skills" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: "uae",
      sectorTags: ["Space Exploration", "Technology", "Engineering"],
      interestTags: ["Science", "Technology", "Space"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    },
    // SECTOR COMPETENCY - Grade 10-12 - Saudi Arabia
    {
      question: "Saudi Arabia's Vision 2030 prioritizes renewable energy. Which combination of subjects would best prepare you for a career in this sector?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Physics, Chemistry, and Environmental Science" },
        { id: "b", text: "History and Literature only" },
        { id: "c", text: "Physical Education only" },
        { id: "d", text: "Art and Music only" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "sector_competency",
      countryId: "saudi-arabia",
      sectorTags: ["Renewable Energy", "Engineering"],
      interestTags: ["Science", "Environment", "Technology"],
      cognitiveLevel: "application",
      outcomeWeights: { vision: 0.2, sector: 0.7, motivation: 0.1 }
    },
    // SECTOR COMPETENCY - Grade 10-12 - USA
    {
      question: "The USA's tech industry is rapidly evolving with AI and machine learning. What mindset is crucial for success in this field?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Continuous learning and adaptability" },
        { id: "b", text: "Avoiding all new technologies" },
        { id: "c", text: "Working only independently" },
        { id: "d", text: "Focusing only on past methods" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "sector_competency",
      countryId: "usa",
      sectorTags: ["Technology", "Artificial Intelligence"],
      interestTags: ["Technology", "Innovation", "Learning"],
      cognitiveLevel: "analysis",
      outcomeWeights: { vision: 0.1, sector: 0.6, motivation: 0.3 }
    },
    
    // PERSONAL ALIGNMENT - Grade 8-9 - Global
    {
      question: "How important is it to you to help solve environmental problems through your future career?",
      questionType: "rating",
      options: [
        { id: "1", text: "Not important at all" },
        { id: "2", text: "Slightly important" },
        { id: "3", text: "Moderately important" },
        { id: "4", text: "Very important" },
        { id: "5", text: "Extremely important" }
      ],
      correctAnswer: null,
      gradeBand: "8-9",
      domain: "personal_alignment",
      countryId: null,
      sectorTags: ["Environment", "Sustainability"],
      interestTags: ["Environment", "Science", "Social Impact"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.2, sector: 0.2, motivation: 0.6 }
    },
    // PERSONAL ALIGNMENT - Grade 8-9 - Global
    {
      question: "I prefer working on projects that:",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Have a clear impact on helping people" },
        { id: "b", text: "Involve creating or building new things" },
        { id: "c", text: "Focus on analyzing data and finding patterns" },
        { id: "d", text: "Allow me to work outdoors or with nature" }
      ],
      correctAnswer: null,
      gradeBand: "8-9",
      domain: "personal_alignment",
      countryId: null,
      sectorTags: null,
      interestTags: ["Social Impact", "Building", "Analysis", "Environment"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.1, sector: 0.3, motivation: 0.6 }
    },
    // PERSONAL ALIGNMENT - Grade 10-12 - Global
    {
      question: "When choosing a career, how important is it that your work aligns with your country's national development goals?",
      questionType: "rating",
      options: [
        { id: "1", text: "Not important - I'll choose based only on personal interest" },
        { id: "2", text: "Slightly important - Nice to have but not essential" },
        { id: "3", text: "Moderately important - I'd like some alignment" },
        { id: "4", text: "Very important - Strong alignment matters to me" },
        { id: "5", text: "Extremely important - It's a top priority" }
      ],
      correctAnswer: null,
      gradeBand: "10-12",
      domain: "personal_alignment",
      countryId: null,
      sectorTags: null,
      interestTags: ["Government", "Social Impact", "National Development"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.4, sector: 0.1, motivation: 0.5 }
    },
    // PERSONAL ALIGNMENT - Grade 10-12 - Global
    {
      question: "I am most motivated by:",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Making a positive impact on society" },
        { id: "b", text: "Earning a high salary" },
        { id: "c", text: "Creative expression and innovation" },
        { id: "d", text: "Job security and stability" }
      ],
      correctAnswer: null,
      gradeBand: "10-12",
      domain: "personal_alignment",
      countryId: null,
      sectorTags: null,
      interestTags: ["Social Impact", "Finance", "Creativity", "Stability"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.2, sector: 0.2, motivation: 0.6 }
    },

    // Additional country-specific questions for remaining 11 countries
    // Bahrain
    {
      question: "Bahrain's Economic Vision 2030 focuses on shifting from oil dependence. Which sector is a key priority?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Financial Services and ICT" },
        { id: "b", text: "Agriculture only" },
        { id: "c", text: "Coal mining" },
        { id: "d", text: "Textile manufacturing only" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: "bahrain",
      sectorTags: ["Financial Services", "ICT & Digital Economy"],
      interestTags: ["Finance", "Technology"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // Kuwait
    {
      question: "Kuwait Vision 2035 aims to transform the country into a financial and trade hub. Which area is emphasized?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Private sector development and economic diversification" },
        { id: "b", text: "Only government jobs" },
        { id: "c", text: "Reducing all trade" },
        { id: "d", text: "Closing borders" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "kuwait",
      sectorTags: ["Financial Services", "Trade"],
      interestTags: ["Business", "Finance"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // Oman
    {
      question: "Oman Vision 2040 prioritizes economic diversification. Which skills are increasingly important?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Technology, logistics, and tourism expertise" },
        { id: "b", text: "Only oil extraction" },
        { id: "c", text: "No new skills needed" },
        { id: "d", text: "Only traditional crafts" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: "oman",
      sectorTags: ["Technology", "Logistics", "Tourism"],
      interestTags: ["Technology", "Tourism", "Business"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    },
    // Qatar
    {
      question: "Qatar National Vision 2030 emphasizes knowledge economy. Which field is crucial?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Education, research, and technology innovation" },
        { id: "b", text: "Only sports" },
        { id: "c", text: "Reducing education" },
        { id: "d", text: "Avoiding technology" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "qatar",
      sectorTags: ["Education", "Technology", "Research"],
      interestTags: ["Education", "Technology", "Science"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // Canada
    {
      question: "Canada's Innovation Nation strategy focuses on becoming a global leader in innovation. Which mindset is essential?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Continuous learning and embracing new technologies" },
        { id: "b", text: "Avoiding all innovation" },
        { id: "c", text: "Only traditional methods" },
        { id: "d", text: "Rejecting change" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "sector_competency",
      countryId: "canada",
      sectorTags: ["Technology", "Innovation", "Research"],
      interestTags: ["Technology", "Innovation", "Learning"],
      cognitiveLevel: "analysis",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    },
    // Australia
    {
      question: "Australia's 'Future Made in Australia' plan emphasizes clean energy and manufacturing. What's important?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Sustainability skills and advanced manufacturing knowledge" },
        { id: "b", text: "Only mining coal" },
        { id: "c", text: "Avoiding renewable energy" },
        { id: "d", text: "No manufacturing" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: "australia",
      sectorTags: ["Renewable Energy", "Manufacturing", "Sustainability"],
      interestTags: ["Environment", "Engineering", "Technology"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    },
    // Germany
    {
      question: "Germany's Energiewende (Energy Transition) 2050 aims for climate neutrality. Which career path aligns with this?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Renewable energy engineering and environmental science" },
        { id: "b", text: "Only fossil fuel extraction" },
        { id: "c", text: "Avoiding green technology" },
        { id: "d", text: "No environmental careers" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "germany",
      sectorTags: ["Renewable Energy", "Environment", "Engineering"],
      interestTags: ["Environment", "Engineering", "Science"],
      cognitiveLevel: "application",
      outcomeWeights: { vision: 0.6, sector: 0.3, motivation: 0.1 }
    },
    // Japan
    {
      question: "Japan's Society 5.0 vision integrates cyber and physical spaces. What skills are vital?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "AI, robotics, and IoT expertise" },
        { id: "b", text: "Only traditional crafts" },
        { id: "c", text: "Avoiding all technology" },
        { id: "d", text: "No digital skills" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "sector_competency",
      countryId: "japan",
      sectorTags: ["Artificial Intelligence", "Robotics", "Technology"],
      interestTags: ["Technology", "Engineering", "Innovation"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.2, sector: 0.7, motivation: 0.1 }
    },
    // South Korea
    {
      question: "South Korea's Korean New Deal focuses on digital and green transformation. Which field is emphasized?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Digital technology and renewable energy" },
        { id: "b", text: "Only heavy industry" },
        { id: "c", text: "Avoiding digital transformation" },
        { id: "d", text: "No green energy" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: "south-korea",
      sectorTags: ["Technology", "Renewable Energy", "Digital Economy"],
      interestTags: ["Technology", "Environment", "Innovation"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // United Kingdom
    {
      question: "The UK's Levelling Up initiative aims to reduce regional inequality. What does this create opportunities in?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Infrastructure, technology, and regional development" },
        { id: "b", text: "Only London-based jobs" },
        { id: "c", text: "Reducing investment" },
        { id: "d", text: "No regional development" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "uk",
      sectorTags: ["Infrastructure", "Technology", "Regional Development"],
      interestTags: ["Government", "Technology", "Social Impact"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // India
    {
      question: "India's Atmanirbhar Bharat (Self-Reliant India) promotes domestic manufacturing. Which skills matter?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Manufacturing, technology, and entrepreneurship" },
        { id: "b", text: "Only importing goods" },
        { id: "c", text: "Avoiding manufacturing" },
        { id: "d", text: "No technology skills" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: "india",
      sectorTags: ["Manufacturing", "Technology", "Entrepreneurship"],
      interestTags: ["Business", "Technology", "Innovation"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    }
  ];

  // Seed UAE curriculum questions
  console.log("📚 Seeding UAE curriculum questions...");
  
  // Validate question bank
  const validation = validateQuestionBank(uaeQuestionBank);
  if (!validation.valid) {
    console.error("❌ UAE question bank validation failed:");
    validation.errors.forEach(err => console.error(`  - ${err}`));
    throw new Error("Invalid question bank");
  }
  if (validation.warnings.length > 0) {
    console.warn("⚠️  UAE question bank warnings:");
    validation.warnings.forEach(w => console.warn(`  - ${w}`));
  }
  
  // Check coverage
  const coverage = checkCoverage(uaeQuestionBank);
  console.log(`✓ Total questions: ${coverage.totalQuestions}`);
  console.log(`✓ Coverage by subject:`);
  Object.entries(coverage.bySubject).forEach(([subject, counts]) => {
    console.log(`  - ${subject}: Grade 8 (${counts["8"]}), Grade 9 (${counts["9"]}), Grade 10 (${counts["10"]}), Grade 11 (${counts["11"]}), Grade 12 (${counts["12"]}), Total (${counts.total})`);
  });
  
  if (coverage.warnings.length > 0) {
    console.log("⚠️ Coverage warnings:");
    coverage.warnings.forEach(w => console.log(`  - ${w}`));
  }
  
  // Flatten all questions for seeding
  const allQuestions = flattenQuestionBank(uaeQuestionBank);
  
  const existingQuestions = await storage.getAllQuizQuestions?.() || [];
  const existingQuestionTexts = new Set(existingQuestions.map((q: any) => q.question));

  let createdCount = 0;
  for (const question of allQuestions) {
    if (!existingQuestionTexts.has(question.question)) {
      try {
        // Use countryId and curriculum from the question bank
        // Convert string grade to numeric grade for database compatibility
        const numericGrade = question.grade ? parseInt(question.grade) : null;
        
        // Extract only the fields that match InsertQuizQuestion schema
        await storage.createQuizQuestion({ 
          question: question.question,
          questionType: question.questionType,
          options: question.options,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          ...(question.questionAr ? { questionAr: question.questionAr } : {}),
          ...(question.optionsAr ? { optionsAr: question.optionsAr } : {}),
          ...(question.explanationAr ? { explanationAr: question.explanationAr } : {}),
          subject: question.subject,
          grade: numericGrade!,
          countryId: question.countryId, // Now properly links to UAE country
          curriculum: question.curriculum, // MOE National curriculum
          topic: question.topic,
          difficulty: question.difficulty,
          cognitiveLevel: question.cognitiveLevel,
        });
        createdCount++;
      } catch (error) {
        console.log(`Error creating quiz question:`, error);
      }
    }
  }
  
  console.log(`✓ Created ${createdCount} new quiz questions (total: ${allQuestions.length})`);

  // Seed Assessment Components
  console.log("\n📋 Seeding assessment components...");
  
  // Define all components with database default weights
  // Note: Actual weights are determined by tier-specific overrides in tierWeights.ts
  const componentsToSeed = [
    {
      name: "Subject Match",
      key: "subjects",
      description: "Matches career requirements with student's subject preferences and demonstrated competency from quiz scores",
      weight: 35, // Default weight (overridden per tier)
      isActive: true,
      requiresPremium: false,
      displayOrder: 0,
    },
    {
      name: "Interest Match",
      key: "interests",
      description: "Keyword-based matching between student interests and career descriptions (free tier only)",
      weight: 35, // Default weight (overridden per tier)
      isActive: true,
      requiresPremium: false,
      displayOrder: 1,
    },
    {
      name: "Country Vision Alignment",
      key: "vision",
      description: "Aligns career paths with national development priorities and vision sectors",
      weight: 30, // Default weight (overridden per tier)
      isActive: true,
      requiresPremium: false,
      displayOrder: 2,
    },
    {
      name: "RIASEC (Holland Code)",
      key: "riasec",
      description: "Career personality assessment based on Holland's RIASEC model (Realistic, Investigative, Artistic, Social, Enterprising, Conventional)",
      weight: 35,
      isActive: true,
      requiresPremium: true,
      displayOrder: 3,
    },
    {
      name: "Personal Values (CVQ)",
      key: "cvq",
      description: "Career values alignment based on Children's Values Questionnaire (Schwartz model)",
      weight: 25,
      isActive: true,
      requiresPremium: true,
      displayOrder: 4,
    },
  ];
  
  // Seed or update all components
  const seededComponents: Record<string, any> = {};
  for (const componentData of componentsToSeed) {
    try {
      const component = await storage.createAssessmentComponent(componentData);
      seededComponents[componentData.key] = component;
      console.log(`✓ Created component: ${component.name} (${component.weight}%)`);
    } catch (error: any) {
      if (error?.message?.includes('unique') || error?.code === '23505' || error?.cause?.code === '23505') {
        // Component already exists - fetch and update weight
        const components = await storage.getAllAssessmentComponents?.() || [];
        const existing = components.find((c: any) => c.key === componentData.key);
        if (existing) {
          if (forceReseed) {
            // Update weight and isActive status
            const updated = await storage.updateAssessmentComponent(existing.id, {
              weight: componentData.weight,
              isActive: componentData.isActive,
              description: componentData.description,
            });
            seededComponents[componentData.key] = updated;
            console.log(`  ${componentData.name} already exists (updated weight to ${componentData.weight}%)`);
          } else {
            seededComponents[componentData.key] = existing;
            console.log(`  skipped (exists, FORCE_RESEED not set): assessment component ${componentData.key}`);
          }
        }
      } else {
        console.error(`  Error creating component ${componentData.name}:`, error);
      }
    }
  }
  
  // Seed RIASEC career affinities (regardless of whether component was created or fetched)
  const riasecComponent = seededComponents['riasec'];
  if (riasecComponent) {
    console.log("\n🎯 Seeding RIASEC career affinities...");
    const allCareers = await storage.getAllCareers();

    // IDEMPOTENT since Phase 3 stage 3. This loop used to be an unconditional
    // storage.createCareerComponentAffinity() wrapped in a catch that swallowed
    // SQLSTATE 23505 "if the affinity already exists" — but the table had NO
    // unique constraint, so 23505 could never be raised and every boot appended
    // one more identical row per career. Staging had reached 358 rows for 68
    // careers before migration 010_career_component_affinities_unique.sql
    // deduped it and added career_component_affinity_unique_idx.
    //
    // The upsert below is keyed on that index, so a re-run now UPDATES in place:
    // re-running the seed adds zero rows, and editing a vector in
    // server/riasecAffinities.ts actually reaches an existing database (it never
    // did before — the first copy won and every later copy was dead weight).
    let riasecCreated = 0, riasecUpdated = 0, riasecMissing = 0;
    for (const mapping of RIASEC_CAREER_AFFINITIES) {
      const career = allCareers.find(c => c.title === mapping.careerTitle);
      if (!career) {
        console.log(`⚠️  Career not found: ${mapping.careerTitle}`);
        riasecMissing++;
        continue;
      }

      try {
        const existing = await storage.getCareerComponentAffinity(career.id, riasecComponent.id);
        await storage.createOrUpdateCareerComponentAffinity({
          careerId: career.id,
          componentId: riasecComponent.id,
          affinityData: mapping.affinities, // Store all 6 theme scores as jsonb
        });
        if (existing) { riasecUpdated++; } else { riasecCreated++; }
      } catch (error: any) {
        console.error(`  Error upserting RIASEC affinity for ${career.title}:`, error);
      }
    }
    console.log(`✓ RIASEC affinities: ${riasecCreated} created, ${riasecUpdated} updated, ${riasecMissing} careers not found`);
  } else {
    console.error("⚠️  Failed to create or fetch RIASEC component");
  }

  // Seed WEF (World Economic Forum) 16 Skills Framework
  console.log("\n🌐 Seeding WEF 16 Skills Framework...");
  
  // Seed WEF Skills (6 foundational literacies + 10 competencies)
  const seededWefSkills: Record<string, any> = {};
  for (const skillData of WEF_16_SKILLS) {
    try {
      const skill = await storage.upsertWefSkillByName(skillData);
      seededWefSkills[skill.name] = skill;
      console.log(`✓ ${skillData.competencyType === 'foundational_literacy' ? '📚' : '🎯'} ${skill.name} (${skill.displayOrder}/16)`);
    } catch (error: any) {
      console.error(`  Error seeding WEF skill ${skillData.name}:`, error);
    }
  }
  
  console.log(`\n✓ Seeded ${Object.keys(seededWefSkills).length}/16 WEF skills`);
  
  // Seed Career-WEF Skill Affinities
  console.log("\n🔗 Seeding Career-WEF Skill affinities...");
  const allCareersForWef = await storage.getAllCareers();
  
  // Check if affinities are already seeded by comparing expected vs actual counts
  const expectedAffinityCount = CAREER_WEF_SKILL_AFFINITIES.reduce((total, mapping) => {
    return total + Object.keys(mapping.skills).length;
  }, 0);
  
  // Get actual count from database
  const existingAffinityCount = await storage.getCareerWefSkillAffinityCount();
  
  if (existingAffinityCount >= expectedAffinityCount) {
    console.log(`✓ WEF career affinities already seeded (${existingAffinityCount}/${expectedAffinityCount}), skipping...`);
  } else {
    console.log(`  Found ${existingAffinityCount} existing affinities, need ${expectedAffinityCount}. Seeding missing affinities...`);
    // Proceed with seeding
    let affinitiesCreated = 0;
    let affinitiesUpdated = 0;
    
    for (const mapping of CAREER_WEF_SKILL_AFFINITIES) {
      const career = allCareersForWef.find(c => c.title === mapping.careerTitle);
      if (!career) {
        console.log(`⚠️  Career not found: ${mapping.careerTitle}`);
        continue;
      }
      
      // For each skill affinity score
      for (const [skillName, affinityScore] of Object.entries(mapping.skills)) {
        const wefSkill = seededWefSkills[skillName];
        if (!wefSkill) {
          console.log(`⚠️  WEF skill not found: ${skillName}`);
          continue;
        }
        
        // Validate affinity score (0-100)
        if (affinityScore < 0 || affinityScore > 100) {
          console.warn(`⚠️  Invalid affinity score for ${career.title} - ${skillName}: ${affinityScore} (expected 0-100)`);
        }
        
        try {
          // Check if affinity already exists to determine if we're creating or updating
          const existing = await storage.getCareerWefSkillAffinity(career.id, wefSkill.id);
          
          await storage.createOrUpdateCareerWefSkillAffinity(
            career.id,
            wefSkill.id,
            {
              affinityScore,
              source: 'Expert Panel',
              evidence: null,
            }
          );
          
          if (existing) {
            affinitiesUpdated++;
          } else {
            affinitiesCreated++;
          }
        } catch (error: any) {
          console.error(`  Error creating affinity for ${career.title} - ${skillName}:`, error);
        }
      }
    }
    
    console.log(`✓ Created ${affinitiesCreated} new affinities, updated ${affinitiesUpdated} existing affinities`);
    console.log(`✓ Total affinities: ${affinitiesCreated + affinitiesUpdated} across ${allCareersForWef.length} careers × 16 WEF skills`);
  }

  // Seed UAE Priority Sectors and WEF Skills Mapping
  console.log("\n🇦🇪 Seeding UAE Priority Sectors → WEF Skills mapping...");
  

  const allCountries = await storage.getAllCountries();
  const uaeCountry = allCountries.find((c: any) => c.code === "UAE");
  if (!uaeCountry) {
    console.warn("⚠️  UAE country not found, skipping priority sectors seeding");
  } else {
    // MUST run before the upsert loop below. createOrUpdateCountryPrioritySector
    // conflicts on (country_id, name), so it cannot rename — given a renamed
    // entry in UAE_SECTOR_WEF_SKILLS it would INSERT a second sector and leave
    // the old one behind with its skill vector and category rules orphaned.
    // This reconciles the existing rows first, in place, keeping their ids.
    // Non-fatal: a failure here leaves the old names live, which still scores
    // correctly — it must not take the rest of the seed down with it.
    try {
      await applySectorRenames(uaeCountry.id);
    } catch (error: any) {
      console.error("  Sector rename migration error (non-fatal, continuing):", error.message);
    }

    let sectorsCreated = 0;
    let skillMappingsCreated = 0;
    let skillMappingsRemoved = 0;
    const seededSectors: Record<string, string> = {}; // sector name -> id, for the vision mapping below

    for (const sectorData of UAE_SECTOR_WEF_SKILLS) {
      // Create or update sector
      const sector = await storage.createOrUpdateCountryPrioritySector(
        uaeCountry.id,
        sectorData.name,
        sectorData.displayOrder,
        sectorData.description
      );
      sectorsCreated++;
      seededSectors[sectorData.name] = sector.id;

      // Map sector to WEF skills
      const keptSkillIds: string[] = [];
      for (const [skillName, importance] of Object.entries(sectorData.skills)) {
        // No aliasing: every key above must be one of the WEF 16 verbatim. The
        // previous "Sustainability" -> "Scientific Literacy" alias collided on
        // the (sector_id, wef_skill_id) unique index and silently cost Renewable
        // Energy a skill. A typo must fail loudly here, not merge into a
        // neighbour.
        const wefSkill = seededWefSkills[skillName];

        if (!wefSkill) {
          console.warn(`⚠️  WEF skill not found: ${skillName} — sector ${sectorData.name} will be missing it`);
          continue;
        }

        await storage.createOrUpdateCountrySectorWefSkill(
          sector.id,
          wefSkill.id,
          importance
        );
        keptSkillIds.push(wefSkill.id);
        skillMappingsCreated++;
      }

      // RECONCILE, don't just upsert. createOrUpdateCountrySectorWefSkill can add
      // a skill and change an importance but cannot REMOVE one, so on any
      // already-seeded database a skill deleted from the vector above would keep
      // its old row and keep feeding skillAlignment - the vector in this file and
      // the vector the scorer uses would silently disagree. Phase 3 stage 3 is the
      // first change to remove skills (Healthcare drops Critical
      // Thinking and Persistence and Grit; Education & Human Capital drops
      // Creativity), which is what surfaced this.
      //
      // Guarded on a non-empty vector: a sector whose skills map somehow arrived
      // empty must not have its whole mapping deleted.
      if (keptSkillIds.length > 0) {
        const removed = await storage.deleteCountrySectorWefSkillsNotIn(sector.id, keptSkillIds);
        if (removed > 0) {
          console.log(`  ↺ ${sectorData.name}: removed ${removed} stale sector→skill row(s) no longer in the vector`);
          skillMappingsRemoved += removed;
        }
      }
    }

    console.log(`✓ Created/updated ${sectorsCreated} UAE priority sectors`);
    console.log(`✓ Created/updated ${skillMappingsCreated} sector→WEF skill mappings` +
      (skillMappingsRemoved > 0 ? `, removed ${skillMappingsRemoved} stale` : ""));

    // --- VISION ALIGNMENT: sector ↔ career-category mapping ---
    // Non-fatal by design: this block is the LAST thing in the priority-sector
    // section, but seedDatabase() continues well past it (CVQ items, Arabic
    // content). An uncaught throw here unwinds the whole function and is only
    // caught by the `.catch(console.error)` at the call site in server/index.ts,
    // which would silently skip every remaining seed step. A missing vision map
    // degrades gracefully at runtime (matching.ts falls back to the score floor);
    // missing CVQ items and Arabic content do not. So this failure must not be
    // allowed to take them down with it.
    try {
      console.log("\n🇦🇪 Seeding UAE vision-alignment sector ↔ career-category mapping...");

      const careersForVision = await storage.getAllCareers();
      const careerIdByTitle = new Map(careersForVision.map((c: any) => [c.title, c.id as string]));
      const knownCategories = new Set(careersForVision.map((c: any) => String(c.category).trim().toLowerCase()));

      let categoryRulesSeeded = 0;
      for (const rule of UAE_SECTOR_CATEGORY_RULES) {
        const sectorId = seededSectors[rule.sector];
        if (!sectorId) {
          console.warn(`⚠️  Vision mapping: unknown sector "${rule.sector}" — skipping rule for ${rule.category}`);
          continue;
        }
        // A rule for a category no career uses is dead data, not an error — warn loudly.
        if (!knownCategories.has(rule.category.trim().toLowerCase())) {
          console.warn(`⚠️  Vision mapping: no career uses category "${rule.category}" — rule will never fire`);
        }
        await storage.createOrUpdateSectorCategoryRule(sectorId, rule.category, rule.relevance, rule.notes);
        categoryRulesSeeded++;
      }

      let overridesSeeded = 0;
      for (const override of UAE_SECTOR_CAREER_OVERRIDES) {
        const sectorId = seededSectors[override.sector];
        const careerId = careerIdByTitle.get(override.careerTitle);
        if (!sectorId) {
          console.warn(`⚠️  Vision mapping: unknown sector "${override.sector}" — skipping override for ${override.careerTitle}`);
          continue;
        }
        if (!careerId) {
          // Silently skipping would leave the career on its (wrong) category rule.
          console.warn(`⚠️  Vision mapping: career "${override.careerTitle}" not found — override NOT applied, career falls back to its category rule`);
          continue;
        }
        await storage.createOrUpdateSectorCareerOverride(sectorId, careerId, override.relevance, override.notes);
        overridesSeeded++;
      }

      console.log(`✓ Created/updated ${categoryRulesSeeded} sector→career-category rules`);
      console.log(`✓ Created/updated ${overridesSeeded} per-career vision overrides`);
    } catch (error: any) {
      console.error("  Vision-alignment mapping seed error (non-fatal, continuing):", error.message);
    }
  }

  // Seed CVQ (Children's Values Questionnaire) items
  try {
    await seedCVQItems();
  } catch (error: any) {
    console.error("  CVQ seed error (non-fatal, continuing):", error.message);
  }

  // Apply Arabic translations to Grade 8 quiz questions
  try {
    await applyGrade8ArabicContent();
  } catch (error: any) {
    console.error("  Grade 8 Arabic quiz content error (non-fatal, continuing):", error.message);
  }

  // Apply Arabic translations to Grade 9–12 quiz questions
  try {
    await applyGrades9to12ArabicContent();
  } catch (error: any) {
    console.error("  Grades 9–12 Arabic quiz content error (non-fatal, continuing):", error.message);
  }

  // Apply Arabic titles and descriptions to all 36 careers
  try {
    await applyCareerArabicContent();
  } catch (error: any) {
    console.error("  Career Arabic content error (non-fatal, continuing):", error.message);
  }

  // Backfill CVQ values profiles + O*NET codes onto the careers that already exist.
  // The careers seed loop above is INSERT-only and skips existing titles, so the
  // valuesProfile/onetCode fields in that array only ever reach a from-scratch DB;
  // this is what populates the rows that are already there. Without it every career
  // has values_profile = NULL, calculateCvqScore returns null for all of them, and
  // the cvq component silently contributes nothing while still holding its weight.
  try {
    await applyCareerValuesProfiles();
  } catch (error: any) {
    console.error("  Career values profiles error (non-fatal, continuing):", error.message);
  }

  // Same INSERT-only/count-guard trap, applied to WEF affinities: the affinity
  // block above is count-guarded, so a career added to
  // CAREER_WEF_SKILL_AFFINITIES after the first seed is never backfilled. Without
  // this, that career has no skill vector and calculateVisionScore scores it on
  // its unmodified category relevance while every other career is modulated.
  try {
    await applyMissingWefAffinities(storage);
  } catch (error: any) {
    console.error("  WEF affinity backfill error (non-fatal, continuing):", error.message);
  }

  // Correct relatedSubjects on careers whose seeded tags project to no
  // student-selectable subject. Same INSERT-only reason as the block above: the
  // seed array's relatedSubjects only ever reach a from-scratch DB. Without this,
  // Teacher stays at the flat-20 subjects floor on every already-seeded database.
  try {
    await applyCareerRelatedSubjects();
  } catch (error: any) {
    console.error("  Career relatedSubjects error (non-fatal, continuing):", error.message);
  }

  // Validate Arabic completeness — warn about canonical careers missing AR translations
  // Only checks careers whose titles match the canonical seed list; rogue/test DB
  // entries with non-standard titles (e.g. suffixed with digits) are excluded.
  try {
    const { CANONICAL_CAREER_TITLES } = await import("./migrations/career-arabic-content");
    const allCareers = await storage.getAllCareers();
    const missingAr = allCareers.filter(
      c => CANONICAL_CAREER_TITLES.has(c.title) &&
           (!c.titleAr || !c.descriptionAr || !c.requiredSkillsAr?.length || !c.educationLevelAr)
    );
    if (missingAr.length > 0) {
      console.warn(`⚠️  ${missingAr.length} career(s) missing Arabic translations: ${missingAr.map(c => c.title).join(', ')}`);
      console.warn("   To fix: edit in the Superadmin Dashboard → Careers tab or use career-arabic-content.ts");
    }
  } catch {
    // Non-fatal — don't block startup
  }

  // Seed Test Organization Admin Account (for testing admin functionality)
  console.log("\n👤 Seeding test organization admin account...");
  try {
    const { hashPassword } = await import("./utils/passwordHash");
    const { db } = await import("./db");
    const { users, organizations, organizationMembers } = await import("@shared/schema");

    const adminPassword = process.env.SEED_SCHOOLADMIN_PASSWORD;
    const existingAdmin = await storage.getUserByUsername("schooladmin");

    if (existingAdmin) {
      // Account already exists — do NOT reset its password, so live
      // credential changes are never clobbered on deploy.
      console.log("  Test admin account already exists (schooladmin) - password left unchanged");
    } else if (!adminPassword) {
      // No account yet, and no password to set. Never fall back to a
      // hardcoded password — skip seeding and warn instead.
      console.warn("  ⚠️  SEED_SCHOOLADMIN_PASSWORD is not set — skipping schooladmin account creation (no hardcoded fallback).");
    } else {
      // Create admin user — password is only set here, at creation time
      const adminPasswordHash = await hashPassword(adminPassword);
      const [adminUser] = await db
        .insert(users)
        .values({
          username: "schooladmin",
          email: "admin@futurepathways.edu",
          firstName: "School",
          lastName: "Administrator",
          passwordHash: adminPasswordHash,
          accountType: 'org_admin',
          role: 'admin',
          isOrgGenerated: false,
          isPremium: false,
        })
        .returning();

      // Create test organization
      const [testOrg] = await db
        .insert(organizations)
        .values({
          name: "Test High School",
          adminUserId: adminUser.id,
          totalLicenses: 50,
          usedLicenses: 0,
          passwordComplexity: 'medium',
        })
        .returning();

      // Create organization membership for admin
      await db.insert(organizationMembers).values({
        organizationId: testOrg.id,
        userId: adminUser.id,
        role: 'admin',
      });

      console.log("✓ Test organization admin created:");
      console.log(`  📧 Username: schooladmin`);
      console.log(`  🏫 Organization: ${testOrg.name}`);
      console.log(`  📊 Total Licenses: ${testOrg.totalLicenses}`);
    }
  } catch (error: any) {
    console.error("  Error creating test admin:", error.message);
  }

  // Seed Superadmin Account
  console.log("\n🔐 Seeding superadmin account...");
  try {
    const { hashPassword: hashPw } = await import("./utils/passwordHash");
    const { db: dbConn } = await import("./db");
    const { users: usersTable } = await import("@shared/schema");
    const { eq: eqOp } = await import("drizzle-orm");

    const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD;

    // Use the first email from SUPERADMIN_EMAILS env var if set, otherwise fall back to local dev placeholder
    const superadminEmailFromEnv = (process.env.SUPERADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .find((e) => e.length > 0);
    const superadminEmail = superadminEmailFromEnv || "superadmin@local.dev";

    // First, check if a superadmin already exists by username
    const existingByUsername = await storage.getUserByUsername("superadmin");

    // Also check if the SUPERADMIN_EMAILS account exists (might be OAuth-created, no username/password)
    const [existingByEmail] = await dbConn
      .select()
      .from(usersTable)
      .where(eqOp(usersTable.email, superadminEmail))
      .limit(1);

    if (existingByUsername) {
      // Account already exists — do NOT reset its password, so live
      // credential changes are never clobbered on deploy. Only ensure the
      // role is correct (idempotent, not a credential reset).
      await dbConn
        .update(usersTable)
        .set({ role: "superadmin" })
        .where(eqOp(usersTable.id, existingByUsername.id));
      console.log("  Superadmin account already exists (username: superadmin) - password left unchanged");
    } else if (!superadminPassword) {
      // No username account yet, and no password to set. Never fall back to a
      // hardcoded password — skip seeding and warn instead.
      console.warn("  ⚠️  SEED_SUPERADMIN_PASSWORD is not set — skipping superadmin account creation (no hardcoded fallback).");
    } else if (existingByEmail) {
      // OAuth-created account with this email exists but no username/password — patch it
      const superadminHash = await hashPw(superadminPassword);
      await dbConn
        .update(usersTable)
        .set({ username: "superadmin", passwordHash: superadminHash, role: "superadmin" })
        .where(eqOp(usersTable.id, existingByEmail.id));
      console.log(`  ✓ Patched OAuth account (${superadminEmail}) with username & password for superadmin login`);
    } else {
      // No account at all — create fresh (password is only set here, at creation time)
      const superadminHash = await hashPw(superadminPassword);
      await dbConn
        .insert(usersTable)
        .values({
          username: "superadmin",
          email: superadminEmail,
          firstName: "Super",
          lastName: "Admin",
          passwordHash: superadminHash,
          accountType: "individual",
          role: "superadmin",
          isOrgGenerated: false,
          isPremium: false,
        });
      console.log(`  ✓ Superadmin account created (username: superadmin, email: ${superadminEmail})`);
    }
  } catch (error: any) {
    console.error("  Error seeding superadmin:", error.message);
  }

  // Seed Scoring Tiers and Tier Component Weights
  console.log("\n⚙️ Seeding scoring methodology configuration...");
  
  // Define scoring tiers (matching tierWeights.ts)
  const tiersToSeed = [
    {
      key: "basic",
      name: "Free Assessment",
      description: "Basic career assessment using subject preferences, interests, and vision alignment",
      isActive: true,
      displayOrder: 0,
    },
    {
      key: "premium",
      name: "Premium Assessment",
      description: "Comprehensive assessment for self-paying individual students",
      isActive: true,
      displayOrder: 1,
    },
    {
      key: "group",
      name: "School Assessment",
      description: "Comprehensive assessment for students enrolled through their school or organization",
      isActive: true,
      displayOrder: 2,
    },
  ];
  
  // Seed tiers
  const seededTiers: Record<string, any> = {};
  for (const tierData of tiersToSeed) {
    try {
      const tier = await storage.createScoringTier(tierData);
      seededTiers[tierData.key] = tier;
      console.log(`✓ Created scoring tier: ${tier.name}`);
    } catch (error: any) {
      if (error?.message?.includes('unique') || error?.code === '23505' || error?.cause?.code === '23505') {
        const existing = await storage.getScoringTierByKey(tierData.key);
        if (existing) {
          seededTiers[tierData.key] = existing;
          console.log(`  Scoring tier ${tierData.name} already exists`);
        }
      } else {
        console.error(`  Error creating tier ${tierData.name}:`, error);
      }
    }
  }
  
  // Define tier-specific component weights (migrating from tierWeights.ts)
  const tierWeightConfigs: Record<string, Record<string, { weight: number; isEnabled: boolean }>> = {
    basic: {
      subjects: { weight: 35, isEnabled: true },
      interests: { weight: 35, isEnabled: true },
      vision: { weight: 30, isEnabled: true },
      riasec: { weight: 0, isEnabled: false },
      cvq: { weight: 0, isEnabled: false },
    },
    premium: {
      subjects: { weight: 20, isEnabled: true },
      interests: { weight: 0, isEnabled: false },
      vision: { weight: 20, isEnabled: true },
      riasec: { weight: 35, isEnabled: true },
      cvq: { weight: 25, isEnabled: true },
    },
    group: {
      subjects: { weight: 20, isEnabled: true },
      interests: { weight: 0, isEnabled: false },
      vision: { weight: 20, isEnabled: true },
      riasec: { weight: 35, isEnabled: true },
      cvq: { weight: 25, isEnabled: true },
    },
  };
  
  // Seed tier component weights
  for (const [tierKey, componentWeights] of Object.entries(tierWeightConfigs)) {
    const tier = seededTiers[tierKey];
    if (!tier) continue;

    const existingTierWeights = await storage.getTierComponentWeights(tier.id);

    for (const [componentKey, config] of Object.entries(componentWeights)) {
      const component = seededComponents[componentKey];
      if (!component) continue;

      const weightExists = existingTierWeights.some(w => w.componentId === component.id);
      if (weightExists && !forceReseed) {
        console.log(`  skipped (exists, FORCE_RESEED not set): tier weight ${tierKey}/${componentKey}`);
        continue;
      }

      try {
        await storage.upsertTierComponentWeight({
          tierId: tier.id,
          componentId: component.id,
          weight: config.weight,
          isEnabled: config.isEnabled,
        });
      } catch (error: any) {
        console.error(`  Error setting weight for ${tierKey}/${componentKey}:`, error.message);
      }
    }
    console.log(`✓ Configured weights for tier: ${tier.name}`);
  }
  
  // Seed LLM Prompt Templates for premium reports
  console.log("\n📝 Seeding LLM prompt templates...");
  
  const promptTemplates = [
    {
      key: "career_reasoning",
      name: "Why This Career?",
      description: "Generates personalized explanation of why a career matches the student",
      systemPrompt: `You are a career guidance counselor for school students aged 13-18 in the UAE. Your role is to explain career matches in an encouraging, age-appropriate way. Be specific about how the student's assessment results connect to the career.`,
      userPromptTemplate: `Based on the following student assessment data, explain why {{careerTitle}} is a good career match for this student.

Student Assessment Data:
- Overall Match Score: {{overallScore}}%
- Top RIASEC Themes: {{riasecTop3}}
- Top Personal Values: {{cvqTop3}}
- Favorite Subjects: {{favoriteSubjects}}

How this career scored for this student (highest first):
{{scoreBreakdown}}

Career Information:
- Title: {{careerTitle}}
- Category: {{careerCategory}}
- Required Skills: {{requiredSkills}}

Write 3 short paragraphs (max ~60 words each), under 200 words total. Be concrete and personal; avoid generic phrases. Do not use headings.

Ground the explanation in the score breakdown above:
- Lead with the dimension(s) that scored HIGHEST — those are the real reasons this career fits. Name the specific evidence (their actual RIASEC themes, values, or subjects) behind the strong scores.
- Do NOT praise or overclaim on dimensions that scored low. If a dimension scored weakly, either leave it out or frame it as an area to grow into — never describe a low-scoring dimension as a strength.
- Keep the tone warm and encouraging for a student aged 13-18. The goal is honest guidance, not flattery.

{{dreamGuidance}}

IMPORTANT: Write your entire response in {{language}}. If the language is Arabic, use right-to-left Arabic script throughout.`,
      model: "claude-sonnet-4-6",
      maxTokens: 1000,
      temperature: 0.7,
      isActive: true,
    },
    {
      key: "education_pathways",
      name: "Education Pathways",
      description: "Recommends educational programs and universities for the career path",
      systemPrompt: `You are an educational advisor helping UAE school students plan their higher education journey. Provide practical, actionable guidance about programs, universities, and preparation steps. Always reference official UAE education resources.`,
      userPromptTemplate: `Based on the student's career interest in {{careerTitle}}, recommend educational pathways.

Student Information:
- Grade Level: {{gradeLevel}}
- Favorite Subjects: {{favoriteSubjects}}

Career Requirements:
- Education Level: {{educationLevel}}
- Required Skills: {{requiredSkills}}
- Related Subjects: {{relatedSubjects}}

Provide guidance on:
1. Recommended degree programs (bachelor's, master's if applicable)
2. Key subjects to focus on in remaining school years
3. Extracurricular activities that would strengthen applications
4. Preparation timeline (what to do now, next year, before university)

Important: Direct students to verify program accreditation at:
- UAE Commission for Academic Accreditation: https://caa.ae/Pages/Institutes/All.aspx
- Accredited Programs: https://caa.ae/Pages/Programs/All.aspx

IMPORTANT: Write your entire response in {{language}}. If the language is Arabic, use right-to-left Arabic script throughout.`,
      model: "claude-sonnet-4-6",
      maxTokens: 800,
      temperature: 0.7,
      isActive: true,
    },
  ];

  for (const template of promptTemplates) {
    try {
      await storage.createLlmPromptTemplate(template);
      console.log(`✓ Created prompt template: ${template.name}`);
    } catch (error: any) {
      if (error?.message?.includes('unique') || error?.code === '23505' || error?.cause?.code === '23505') {
        // Template exists — update model and userPromptTemplate to current defaults
        try {
          const existing = await storage.getLlmPromptTemplateByKey(template.key);
          if (existing) {
            if (forceReseed) {
              await storage.updateLlmPromptTemplate(existing.id, {
                model: template.model,
                userPromptTemplate: template.userPromptTemplate,
              });
              console.log(`  Prompt template ${template.name} already exists (model + userPromptTemplate updated)`);
            } else {
              console.log(`  skipped (exists, FORCE_RESEED not set): prompt template ${template.key}`);
            }
          } else {
            console.log(`  Prompt template ${template.name} already exists`);
          }
        } catch {
          console.log(`  Prompt template ${template.name} already exists`);
        }
      } else {
        console.error(`  Error creating template ${template.name}:`, error.message);
      }
    }
  }

  console.log("\n✅ Database seeded successfully!");
}
