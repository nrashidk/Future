/**
 * FUTURE-READINESS: is this occupation's kind of work still going to exist?
 *
 * Two sources, deliberately, because they measure different things:
 *
 *   O*NET / BLS  counts US HEADCOUNT. "Will there be more or fewer of these
 *                jobs?" Demographically driven, geographically parochial.
 *   WEF          surveys EMPLOYERS GLOBALLY on how work is changing. "Is this
 *                kind of work being automated away?" Opinion-based, coarse
 *                labels, five-year horizon.
 *
 * THE RULE THAT MATTERS: a career is only ever gated when BOTH agree. One
 * source alone yields 'watch', which is a human-review state and NEVER excludes.
 *
 * Why so conservative: O*NET alone would exclude Teacher (Secondary Education),
 * Primary School Teacher and Nuclear Engineer — the first two because US school
 * enrolment is falling (WEF ranks Secondary Education Teachers among the 15
 * LARGEST absolute job creators on earth, Figure 2.4), the third despite the UAE
 * operating Barakah. Excluding a career means a 15-year-old never learns the
 * option existed; that error is invisible and irreversible, so the threshold for
 * making it has to be high. See docs/future-readiness-recon.md §2.
 *
 * COUNTRY-INDEPENDENT BY CONSTRUCTION: nothing in this module reads a countryId
 * or a country-scoped table. Readiness is a property of the occupation, in the
 * same class as careers.valuesProfile and the WEF skill affinities — not the
 * class of job_market_trends. A career generated for any country is judged by
 * exactly this code.
 *
 * Sources:
 *   WEF, The Future of Jobs Report 2025 (January 2025), Figures 2.2 / 2.3 / 2.4
 *     https://www.weforum.org/publications/the-future-of-jobs-report-2025/
 *   O*NET OnLine occupation summaries, "Projected growth (2024-2034)",
 *     fetched 2026-09-02, e.g. https://www.onetonline.org/link/summary/43-9021.00
 */

import type { OnetGrowthBand } from "@shared/growthBands";

export const FUTURE_READINESS_VALUES = ["growing", "stable", "watch", "declining"] as const;
export type FutureReadiness = (typeof FUTURE_READINESS_VALUES)[number];

export function isFutureReadiness(v: unknown): v is FutureReadiness {
  return typeof v === "string" && (FUTURE_READINESS_VALUES as readonly string[]).includes(v);
}

/** WEF, Future of Jobs Report 2025, Figure 2.2 — the 15 fastest-DECLINING roles. */
export const WEF_2025_TOP15_DECLINING = [
  "Postal Service Clerks",
  "Bank Tellers and Related Clerks",
  "Data Entry Clerks",
  "Cashiers and Ticket Clerks",
  "Administrative Assistants and Executive Secretaries",
  "Printing and Related Trades Workers",
  "Accounting, Bookkeeping and Payroll Clerks",
  "Material-Recording and Stock-Keeping Clerks",
  "Transportation Attendants and Conductors",
  "Door-To-Door Sales Workers, News and Street Vendors, and Related Workers",
  "Graphic Designers",
  "Claims Adjusters, Examiners, and Investigators",
  "Legal Officials",
  "Legal Secretaries",
  "Telemarketers",
] as const;

/** WEF, Future of Jobs Report 2025, Figure 2.2 — the 15 fastest-GROWING roles. */
export const WEF_2025_TOP15_GROWING = [
  "Big Data Specialists",
  "FinTech Engineers",
  "AI and Machine Learning Specialists",
  "Software and Applications Developers",
  "Security Management Specialists",
  "Data Warehousing Specialists",
  "Autonomous and Electric Vehicle Specialists",
  "UI and UX Designers",
  "Light Truck or Delivery Services Drivers",
  "Internet of Things Specialists",
  "Data Analysts and Scientists",
  "Environmental Engineers",
  "Information Security Analysts",
  "Devops Engineer",
  "Renewable Energy Engineers",
] as const;

/**
 * The O*NET occupation each WEF fastest-declining role corresponds to, with the
 * band read live from O*NET on 2026-09-02.
 *
 * THIS IS WHAT MAKES STRICT AND ENFORCEABLE ON AN ARBITRARY TITLE. A career
 * invented by an LLM for a new country arrives with no growth band of its own;
 * without a second source, "WEF says declining" would be the only signal, and
 * gating on one source is precisely what this module refuses to do. Pinning each
 * WEF role to a real O*NET occupation means both sources are available for a
 * title we have never seen before.
 *
 * Note what falls out of the data rather than out of a hand-maintained
 * exception list: THREE of the fifteen are NOT corroborated by O*NET, so strict
 * AND never gates them.
 *   - Graphic Designers      O*NET 'slower' (i.e. growth). Rank 116 of 126 —
 *                            the least declining of WEF's 15. An earlier draft
 *                            of this design carried a WEF_DECLINING_REVIEWED_KEEP
 *                            allowlist so that Graphic Designer would survive;
 *                            the allowlist turned out to be unnecessary, because
 *                            the rule already declines to gate it. Deleted.
 *   - Transportation Attendants  mapped to Flight Attendants, which O*NET bands
 *                            'much_faster'. WEF's label bundles cabin crew with
 *                            rail conductors; the two are moving in opposite
 *                            directions and we do not gate on the ambiguity.
 *   - Legal Officials        no clean SOC exists. Judges is a poor proxy and is
 *                            marked 'low'; treat this row as unusable, not as
 *                            evidence.
 */
export const WEF_DECLINING_ROLE_ONET: Record<
  string,
  { onetCode: string; onetTitle: string; band: OnetGrowthBand; confidence: "high" | "med" | "low" }
> = {
  "Postal Service Clerks":            { onetCode: "43-5051.00", onetTitle: "Postal Service Clerks", band: "decline", confidence: "high" },
  "Bank Tellers and Related Clerks":  { onetCode: "43-3071.00", onetTitle: "Tellers", band: "decline", confidence: "high" },
  "Data Entry Clerks":                { onetCode: "43-9021.00", onetTitle: "Data Entry Keyers", band: "decline", confidence: "high" },
  "Cashiers and Ticket Clerks":       { onetCode: "41-2011.00", onetTitle: "Cashiers", band: "decline", confidence: "high" },
  "Administrative Assistants and Executive Secretaries":
                                      { onetCode: "43-6011.00", onetTitle: "Executive Secretaries and Executive Administrative Assistants", band: "decline", confidence: "high" },
  "Printing and Related Trades Workers":
                                      { onetCode: "51-5112.00", onetTitle: "Printing Press Operators", band: "decline", confidence: "high" },
  "Accounting, Bookkeeping and Payroll Clerks":
                                      { onetCode: "43-3031.00", onetTitle: "Bookkeeping, Accounting, and Auditing Clerks", band: "decline", confidence: "high" },
  "Material-Recording and Stock-Keeping Clerks":
                                      { onetCode: "43-5071.00", onetTitle: "Shipping, Receiving, and Inventory Clerks", band: "decline", confidence: "high" },
  "Door-To-Door Sales Workers, News and Street Vendors, and Related Workers":
                                      { onetCode: "41-9091.00", onetTitle: "Door-to-Door Sales Workers, News and Street Vendors, and Related Workers", band: "decline", confidence: "high" },
  "Claims Adjusters, Examiners, and Investigators":
                                      { onetCode: "13-1031.00", onetTitle: "Claims Adjusters, Examiners, and Investigators", band: "decline", confidence: "high" },
  "Legal Secretaries":                { onetCode: "43-6012.00", onetTitle: "Legal Secretaries and Administrative Assistants", band: "decline", confidence: "high" },
  "Telemarketers":                    { onetCode: "41-9041.00", onetTitle: "Telemarketers", band: "decline", confidence: "high" },
  // --- the three WEF-declining roles O*NET does NOT corroborate ---
  "Graphic Designers":                { onetCode: "27-1024.00", onetTitle: "Graphic Designers", band: "slower", confidence: "high" },
  "Transportation Attendants and Conductors":
                                      { onetCode: "53-2031.00", onetTitle: "Flight Attendants", band: "much_faster", confidence: "med" },
  "Legal Officials":                  { onetCode: "23-1023.00", onetTitle: "Judges, Magistrate Judges, and Magistrates", band: "average", confidence: "low" },
};

/**
 * Title matching for careers NOT in our seeded catalogue — the ones an LLM
 * invents for a new country. This is where the gate earns its keep: "Bank
 * Teller", "Data Entry Operator", "Administrative Assistant".
 *
 * Regexes, not exact strings, because a model will not reproduce WEF's exact
 * label. Deliberately narrow: a false positive here rejects a legitimate
 * generated career, so patterns must not reach beyond the occupation named.
 */
const DECLINING_ROLE_PATTERNS: Array<[string, RegExp]> = [
  ["Postal Service Clerks",                       /\b(postal (service )?(clerk|worker)|mail (clerk|sorter))\b/],
  ["Bank Tellers and Related Clerks",             /\b(bank teller|teller)\b/],
  ["Data Entry Clerks",                           /\bdata (entry|capture)\b/],
  ["Cashiers and Ticket Clerks",                  /\b(cashier|ticket (clerk|agent|seller))\b/],
  ["Administrative Assistants and Executive Secretaries",
                                                  /\b(administrative (assistant|secretary)|executive (secretary|assistant)|office (assistant|clerk)|personal assistant)\b/],
  ["Printing and Related Trades Workers",         /\b(printing (press )?(operator|worker)|prepress|typesetter)\b/],
  ["Accounting, Bookkeeping and Payroll Clerks",  /\b(bookkeep\w*|payroll clerk|accounting clerk|accounts (payable|receivable) clerk)\b/],
  ["Material-Recording and Stock-Keeping Clerks", /\b(stock (clerk|keeper)|storekeeper|inventory clerk|warehouse clerk)\b/],
  ["Transportation Attendants and Conductors",    /\b((train|bus|rail) conductor|flight attendant|cabin crew|transportation attendant)\b/],
  ["Door-To-Door Sales Workers, News and Street Vendors, and Related Workers",
                                                  /\b(door.?to.?door|street vendor|news vendor)\b/],
  ["Graphic Designers",                           /\bgraphic designer\b/],
  ["Claims Adjusters, Examiners, and Investigators",
                                                  /\b(claims (adjuster|examiner|investigator)|loss adjuster)\b/],
  ["Legal Officials",                             /\blegal official\b/],
  ["Legal Secretaries",                           /\blegal secretary\b/],
  ["Telemarketers",                               /\b(telemarket\w*|telesales)\b/],
];

/**
 * Our career titles -> the WEF role we judged them to be, with the rank in
 * Figure 2.3 (1 = fastest growing, 126 = fastest declining) and how far the
 * mapping should be trusted. 46 of our 68 map; the remaining 22 have no
 * defensible WEF role and run on O*NET alone — which, under strict AND, means
 * they can never be gated. That is the safe direction.
 *
 * Non-mappings that were tempting and WRONG, recorded so nobody "fixes" them:
 *   Airline Pilot     is NOT "Transportation Attendants and Conductors" (118) —
 *                     that label is cabin crew and rail conductors.
 *   Nuclear Engineer  is NOT "Power Production Plant Operators" (89) —
 *                     operators are not engineers.
 */
export const WEF_ROLE_BY_CAREER_TITLE: Record<
  string,
  { role: string; rank: number; confidence: "high" | "med" | "low" }
> = {
  "AI Research Scientist": { role: "AI and Machine Learning Specialists", rank: 3, confidence: "high" },
  "Software Engineer": { role: "Software and Applications Developers", rank: 4, confidence: "high" },
  "UX/UI Designer": { role: "UI and UX Designers", rank: 8, confidence: "high" },
  "Data Scientist": { role: "Data Analysts and Scientists", rank: 11, confidence: "high" },
  "Environmental Engineer": { role: "Environmental Engineers", rank: 12, confidence: "high" },
  "Cybersecurity Analyst": { role: "Information Security Analysts", rank: 13, confidence: "high" },
  "Renewable Energy Engineer": { role: "Renewable Energy Engineers", rank: 15, confidence: "high" },
  "Robotics Engineer": { role: "Robotics Engineers", rank: 16, confidence: "high" },
  "Data Engineer": { role: "Data Engineers", rank: 18, confidence: "high" },
  "Curriculum & Instructional Designer": { role: "Online Learning Managers", rank: 25, confidence: "med" },
  "Digital Marketing Specialist": { role: "Digital Marketing and Strategy Specialists", rank: 26, confidence: "high" },
  "Environmental Scientist": { role: "Environmental Protection Professionals", rank: 27, confidence: "med" },
  "Cloud & Network Architect": { role: "Database and Network Professionals", rank: 29, confidence: "med" },
  "Web Developer": { role: "Full Stack Engineers", rank: 31, confidence: "med" },
  "Food Technologist": { role: "Food Scientists and Technologists", rank: 32, confidence: "high" },
  "Content Creator": { role: "Social Media Strategist", rank: 37, confidence: "med" },
  "Hospitality Manager": { role: "Hotel and Restaurant Managers", rank: 38, confidence: "high" },
  "Product Manager": { role: "Product Managers", rank: 41, confidence: "high" },
  "Marketing Manager": { role: "Sales and Marketing Professionals", rank: 49, confidence: "med" },
  "Sales Manager": { role: "Sales and Marketing Professionals", rank: 49, confidence: "med" },
  "Psychologist": { role: "Social Scientists and Related Workers", rank: 50, confidence: "low" },
  "Management Consultant": { role: "Management and Organisation Analysts", rank: 53, confidence: "high" },
  "Industrial Engineer": { role: "Industrial and Production Engineers", rank: 56, confidence: "high" },
  "Chef": { role: "Chefs and Cooks", rank: 57, confidence: "high" },
  "Electrical Engineer": { role: "Electrotechnology Engineers", rank: 58, confidence: "med" },
  "Healthcare Professional (Nurse)": { role: "Nursing Professionals", rank: 59, confidence: "high" },
  "Film & TV Producer": { role: "Media and Communication Workers", rank: 60, confidence: "med" },
  "Journalist": { role: "Media and Communication Workers", rank: 60, confidence: "low" },
  "Video Editor": { role: "Media and Communication Workers", rank: 60, confidence: "med" },
  "Civil Engineer": { role: "Civil Engineers", rank: 61, confidence: "high" },
  "Mechanical Engineer": { role: "Mechanical Engineers", rank: 65, confidence: "high" },
  "Architect": { role: "Architects and Surveyors", rank: 66, confidence: "high" },
  "Teacher (Secondary Education)": { role: "Secondary Education Teachers", rank: 67, confidence: "high" },
  "Fashion Designer": { role: "Garment and Related Trades Workers", rank: 68, confidence: "low" },
  "Risk & Compliance Officer": { role: "Compliance Officers", rank: 70, confidence: "med" },
  "Investment & Financial Manager": { role: "Financial and Investment Advisers", rank: 71, confidence: "med" },
  "School Counsellor & Career Advisor": { role: "Social Work and Counselling Professionals", rank: 84, confidence: "med" },
  "Social Worker": { role: "Social Work and Counselling Professionals", rank: 84, confidence: "high" },
  "Primary School Teacher": { role: "Primary School and Early Childhood Teachers", rank: 85, confidence: "high" },
  "Entrepreneur": { role: "Managing Directors and Chief Executives", rank: 90, confidence: "low" },
  "Human Resources Manager": { role: "Human Resources Specialists", rank: 91, confidence: "med" },
  "Financial Analyst": { role: "Financial Analysts", rank: 93, confidence: "high" },
  "Lawyer": { role: "Lawyers", rank: 96, confidence: "high" },
  "Chemical Engineer": { role: "Chemical Engineers", rank: 100, confidence: "high" },
  "Accountant": { role: "Accountants and Auditors", rank: 109, confidence: "high" },
  "Graphic Designer": { role: "Graphic Designers", rank: 116, confidence: "high" },
};

export interface ReadinessVerdict {
  readiness: FutureReadiness;
  /** Human-readable justification, persisted so an adult can audit a decision. */
  why: string;
  /** The WEF role this title was judged to be, or null when nothing mapped. */
  wefRole: string | null;
  wefRank: number | null;
  wefVerdict: "growing" | "declining" | "neutral" | "unknown";
  /** The O*NET band actually used — either the career's own or the WEF role's. */
  onetBand: OnetGrowthBand | null;
  onetBandVia: "career" | "wef-role-proxy" | "none";
  mappingConfidence: "high" | "med" | "low" | "none";
}

/**
 * Resolve an arbitrary career title to a WEF top-15-declining role, or null.
 * Used for titles we have never seen — i.e. LLM-generated careers.
 */
export function matchWefDecliningRole(title: string): string | null {
  const t = title.toLowerCase().trim();
  for (const [role, re] of DECLINING_ROLE_PATTERNS) {
    if (re.test(t)) return role;
  }
  return null;
}

/**
 * THE COMBINE RULE (docs/future-readiness-recon.md §1e). Strict AND is the only
 * thing that can produce 'declining', and 'declining' is the only thing the gate
 * acts on.
 *
 *   declining  WEF fastest-declining AND O*NET decline   <- the ONLY gating state
 *   watch      exactly one source says decline           <- review only, never gates
 *   growing    WEF top-15 growing OR O*NET faster/much_faster
 *   stable     no decline signal from either source
 *
 * `band` is the career's own O*NET band when known. When it is null — a career
 * we have just been handed, e.g. from the LLM country generator — and the title
 * maps to a WEF declining role, that role's own O*NET band stands in, so both
 * sources are still consulted. If neither is available the career is treated as
 * NOT declining: the failure mode of this function is always "career is kept".
 */
export function deriveReadiness(
  title: string,
  band: OnetGrowthBand | null | undefined,
): ReadinessVerdict {
  const mapped = WEF_ROLE_BY_CAREER_TITLE[title];
  const wefRole = mapped?.role ?? matchWefDecliningRole(title);
  const wefRank = mapped?.rank ?? null;
  const mappingConfidence = mapped?.confidence ?? (wefRole ? "med" : "none");

  const wefVerdict: ReadinessVerdict["wefVerdict"] = !wefRole
    ? "unknown"
    : (WEF_2025_TOP15_DECLINING as readonly string[]).includes(wefRole)
      ? "declining"
      : (WEF_2025_TOP15_GROWING as readonly string[]).includes(wefRole)
        ? "growing"
        : "neutral";

  // Resolve the O*NET side. The career's own band wins; the WEF role's pinned
  // occupation is the fallback so strict AND still has two sources on an
  // unseen title.
  let onetBand: OnetGrowthBand | null = band ?? null;
  let onetBandVia: ReadinessVerdict["onetBandVia"] = band ? "career" : "none";
  if (!onetBand && wefRole && WEF_DECLINING_ROLE_ONET[wefRole]) {
    onetBand = WEF_DECLINING_ROLE_ONET[wefRole].band;
    onetBandVia = "wef-role-proxy";
  }

  const onetDeclining = onetBand === "decline";
  const onetGrowing = onetBand === "much_faster" || onetBand === "faster";
  const wefDeclining = wefVerdict === "declining";

  const base = { wefRole, wefRank, wefVerdict, onetBand, onetBandVia, mappingConfidence };

  if (wefDeclining && onetDeclining) {
    return {
      ...base,
      readiness: "declining",
      why: `WEF 2025 fastest-declining ("${wefRole}") AND O*NET band 'decline' — both sources agree`,
    };
  }
  if (wefDeclining) {
    return {
      ...base,
      readiness: "watch",
      why: `WEF 2025 fastest-declining ("${wefRole}") but O*NET band is '${onetBand ?? "unknown"}' — single source, NOT gated`,
    };
  }
  if (onetDeclining) {
    return {
      ...base,
      readiness: "watch",
      why: `O*NET band 'decline' but WEF does not corroborate (${wefRole ? `"${wefRole}"` : "no WEF role mapped"}) — single source, NOT gated`,
    };
  }
  if (wefVerdict === "growing") {
    return { ...base, readiness: "growing", why: `WEF 2025 top-15 fastest growing ("${wefRole}")` };
  }
  if (onetGrowing) {
    return { ...base, readiness: "growing", why: `O*NET band '${onetBand}'` };
  }
  return { ...base, readiness: "stable", why: "no decline signal from either source" };
}

/**
 * THE GATE PREDICATE. Everything that is not explicitly 'declining' passes —
 * including a null, an unrecognised value, and a legacy row. The failure mode is
 * "career is shown", never "career is silently hidden from a student".
 */
export function isFutureReady(career: { futureReadiness?: string | null }): boolean {
  return career.futureReadiness !== "declining";
}
