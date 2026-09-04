/**
 * Free-tier "Why This Career?" narrative — deterministic, no LLM.
 *
 * THE PROBLEM THIS SOLVES. Every recommendation row already stores a reasoning
 * string, written at generate time for BOTH tiers
 * (server/routes/recommendations.routes.ts). But it is an AUDIT string, built by
 * joining each component's own one-liner with its weight and score:
 *
 *   Subject Match (35%): 72.3% - Strong in Mathematics, Science (preference +
 *   71% quiz competency) | Interest Match (35%): 64.0% - Strong match with your
 *   robotics (field, skills) interests | Country Vision Alignment (30%): 81.0% -
 *   Core to a national priority sector for United Arab Emirates: Advanced
 *   Technology & AI
 *
 * Useful for a developer reading the audit trail; unreadable for a 14-year-old.
 * The free report used to withhold it entirely and blur the section instead,
 * which meant a student was shown a locked box where an explanation belonged.
 *
 * THE APPROACH. Parse the audit string back into its parts and re-render them as
 * prose in a student register: no percentages, no pipes, no component names, no
 * weights. Nothing new is computed and no model is called — this is a
 * presentation layer over data the free tier already had. Premium is untouched
 * and keeps its LLM narrative (with generateEnhancedReasoning as its fallback).
 *
 * WHY PARSE RATHER THAN READ componentBreakdown. The stored breakdown JSONB
 * carries {key, displayName, score, weight} but deliberately NOT the per-
 * component reasoning text, which is exactly the part that names the student's
 * subjects, their interests and the national sector. That detail exists only
 * inside the audit string, so the string is the source.
 */

/** One component, recovered from the audit string. */
export interface ParsedComponent {
  /** Canonical component key, resolved from the display name where possible. */
  key: string | null;
  displayName: string;
  weight: number;
  score: number;
  /** The component's own reasoning sentence — the text after the score. */
  detail: string;
}

/** `Subject Match (35%): 72.3% - Strong in Mathematics, Science` */
const ENTRY_RE = /^(.+?)\s*\((\d+(?:\.\d+)?)%\):\s*(\d+(?:\.\d+)?)%\s*-\s*([\s\S]*)$/;

/**
 * Resolve a component key from its DB display name.
 *
 * Display names live in the `assessment_components` table (seeded as "Subject
 * Match" / "Interest Match" / "Country Vision Alignment") and an admin can
 * rename them, so this matches on a substring rather than an exact string, and
 * returns null rather than guessing when nothing fits. A null key degrades to
 * "skip this sentence", never to a wrong sentence.
 */
function resolveKey(displayName: string): string | null {
  const n = displayName.toLowerCase();
  if (n.includes("subject")) return "subjects";
  if (n.includes("interest")) return "interests";
  if (n.includes("vision")) return "vision";
  if (n.includes("riasec") || n.includes("holland") || n.includes("personality")) return "riasec";
  if (n.includes("value") || n.includes("cvq")) return "cvq";
  return null;
}

/** Split the stored audit blob back into its components. */
export function parseAuditReasoning(auditReasoning: string | null | undefined): ParsedComponent[] {
  if (!auditReasoning || typeof auditReasoning !== "string") return [];
  return auditReasoning
    .split("|")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const m = part.match(ENTRY_RE);
      if (!m) return null;
      const displayName = m[1].trim();
      return {
        key: resolveKey(displayName),
        displayName,
        weight: Number(m[2]),
        score: Number(m[3]),
        detail: m[4].trim(),
      } as ParsedComponent;
    })
    .filter((c): c is ParsedComponent => c !== null);
}

// ===== Detail extractors =====
// Each mirrors the exact sentence its calculator emits in
// server/services/matching.ts. A pattern that stops matching yields null and the
// sentence is simply left out, so a wording change upstream degrades to a
// shorter narrative rather than to leaked audit text.

/** From `Strong in X, Y (preference + N% quiz competency)` / `Interest in X, Y`. */
function extractSubjects(detail: string): { subjects: string[]; quizBacked: boolean } | null {
  const strong = detail.match(/^Strong in (.+?)\s*\(preference/i);
  if (strong) return { subjects: splitList(strong[1]), quizBacked: true };
  const plain = detail.match(/^Interest in (.+)$/i);
  if (plain) return { subjects: splitList(plain[1]), quizBacked: false };
  return null; // includes the "No matching subjects" case
}

/** From `Strong match with your robotics (field, skills) and space (work tasks) interests`. */
function extractInterests(detail: string): string[] | null {
  const m = detail.match(/^Strong match with your (.+?) interests$/i);
  if (!m) return null; // includes "Limited alignment with stated interests"
  return m[1]
    .split(/\s+and\s+/)
    .map(part => part.replace(/\s*\([^)]*\)\s*$/, "").trim())
    .filter(Boolean);
}

/** From `Core to|Supports|Some relevance to a national priority sector for <Country>: <Sector>`. */
function extractVision(detail: string): { country: string; sector: string; strength: "core" | "supports" | "some" } | null {
  const m = detail.match(
    /^(Core to|Supports|Some relevance to) a national priority sector for (.+?):\s*(.+)$/i
  );
  if (!m) return null; // includes the "Viable career path in X" floor case
  const lead = m[1].toLowerCase();
  return {
    strength: lead.startsWith("core") ? "core" : lead.startsWith("supports") ? "supports" : "some",
    country: m[2].trim(),
    sector: m[3].trim(),
  };
}

function splitList(s: string): string[] {
  return s.split(/,\s*|\s+and\s+/).map(x => x.trim()).filter(Boolean);
}

/** Join a list the way a person writes one: "A, B and C". */
function joinList(items: string[], lang: "en" | "ar"): string {
  const and = lang === "ar" ? " و" : " and ";
  if (items.length <= 1) return items[0] ?? "";
  if (lang === "ar") return items.join("، ").replace(/، (?=[^،]*$)/, and);
  return items.slice(0, -1).join(", ") + and + items[items.length - 1];
}

/**
 * Strength band for the opening sentence.
 *
 * Words, not numbers. The percentage is already on the card as a badge and as
 * the component bars; repeating it in prose is what made the audit string read
 * like a spreadsheet.
 */
function band(score: number): "strong" | "good" | "worth" {
  if (score >= 75) return "strong";
  if (score >= 60) return "good";
  return "worth";
}

export interface FreeNarrativeInput {
  auditReasoning: string | null | undefined;
  careerTitle: string;
  overallScore: number;
  language?: string;
}

/**
 * Render the free-tier "Why This Career?" text.
 *
 * Returns markdown-safe plain paragraphs separated by a blank line. Always
 * returns something: with an unparseable audit string it falls back to the
 * opening and closing paragraphs, which need only the title and the score.
 */
export function formatFreeReasoning(input: FreeNarrativeInput): string {
  const { auditReasoning, careerTitle, overallScore } = input;
  const lang: "en" | "ar" = input.language === "ar" ? "ar" : "en";
  const components = parseAuditReasoning(auditReasoning);
  const byKey = new Map(components.map(c => [c.key, c]));
  const paragraphs: string[] = [];

  // --- Opening: how strong the match is, in words ---
  const b = band(overallScore);
  if (lang === "ar") {
    paragraphs.push(
      b === "strong"
        ? `يُعدّ مجال ${careerTitle} من أقوى المسارات المتوافقة معك بناءً على ما شاركتنا به.`
        : b === "good"
        ? `يُعدّ مجال ${careerTitle} مساراً متوافقاً معك بشكل جيد بناءً على ما شاركتنا به.`
        : `يستحق مجال ${careerTitle} أن تلقي عليه نظرة، بناءً على ما شاركتنا به.`
    );
  } else {
    paragraphs.push(
      b === "strong"
        ? `${careerTitle} is one of your strongest matches, based on what you told us.`
        : b === "good"
        ? `${careerTitle} is a good match for you, based on what you told us.`
        : `${careerTitle} is worth a look, based on what you told us.`
    );
  }

  // --- Subjects ---
  const subjectsComp = byKey.get("subjects");
  const subjects = subjectsComp ? extractSubjects(subjectsComp.detail) : null;
  if (subjects && subjects.subjects.length > 0) {
    const list = joinList(subjects.subjects, lang);
    if (lang === "ar") {
      paragraphs.push(
        subjects.quizBacked
          ? `المواد التي اخترتها — ${list} — هي المواد التي يُبنى عليها هذا المسار، وقد أظهرت نتائجك في الاختبار القصير أنك تتقنها فعلاً وليس أنك تحبها فحسب.`
          : `المواد التي اخترتها — ${list} — هي المواد التي يُبنى عليها هذا المسار.`
      );
    } else {
      paragraphs.push(
        subjects.quizBacked
          ? `The subjects you picked — ${list} — are the ones this career is built on, and your quiz answers showed you can actually do them, not just that you enjoy them.`
          : `The subjects you picked — ${list} — are the ones this career is built on.`
      );
    }
  }

  // --- Interests ---
  const interestsComp = byKey.get("interests");
  const interests = interestsComp ? extractInterests(interestsComp.detail) : null;
  if (interests && interests.length > 0) {
    const list = joinList(interests, lang);
    paragraphs.push(
      lang === "ar"
        ? `كما أن اهتمامك بـ${list} يظهر في طبيعة العمل اليومي في هذا المجال وفي المهارات التي يحتاجها.`
        : `Your interest in ${list} also shows up in the day-to-day work here and in the skills the job asks for.`
    );
  }

  // --- National vision ---
  const visionComp = byKey.get("vision");
  const vision = visionComp ? extractVision(visionComp.detail) : null;
  if (vision) {
    if (lang === "ar") {
      paragraphs.push(
        vision.strength === "core"
          ? `هذا المجال في صميم قطاع ${vision.sector}، وهو أحد القطاعات ذات الأولوية الوطنية في ${vision.country} — أي أن الطلب على هذه المهنة يُتوقع أن ينمو قريباً منك، لا في مكان آخر.`
          : vision.strength === "supports"
          ? `هذا المجال يدعم قطاع ${vision.sector}، وهو أحد القطاعات ذات الأولوية الوطنية في ${vision.country}، ما يعني وجود فرص حقيقية قريباً منك.`
          : `لهذا المجال صلة بقطاع ${vision.sector}، وهو أحد القطاعات ذات الأولوية الوطنية في ${vision.country}.`
      );
    } else {
      paragraphs.push(
        vision.strength === "core"
          ? `This work sits at the centre of ${vision.sector}, a national priority sector in ${vision.country} — so demand for it is expected to grow close to home, not somewhere else.`
          : vision.strength === "supports"
          ? `This work supports ${vision.sector}, a national priority sector in ${vision.country}, so there are real openings close to home.`
          : `This work has some connection to ${vision.sector}, a national priority sector in ${vision.country}.`
      );
    }
  }

  // --- Closing: say plainly what this was and was not based on ---
  // Being explicit here is the point of the free report: the student should know
  // which signals produced it, so the premium upsell reads as "add more signal"
  // rather than "we were hiding the answer".
  paragraphs.push(
    lang === "ar"
      ? `يستند هذا الاقتراح إلى موادك واهتماماتك والقطاعات ذات الأولوية في بلدك. ولم يشمل بعد شخصيتك المهنية أو ما تُقدّره في العمل — وهما ما يضيفهما التقييم المتقدم.`
      : `This suggestion comes from your subjects, your interests, and your country's priority sectors. It does not yet include your career personality or what you value in work — that is what the advanced assessment adds.`
  );

  return paragraphs.join("\n\n");
}
