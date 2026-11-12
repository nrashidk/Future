/**
 * A career category's name in the reader's language.
 *
 * `careers.category` is a canonical English label ("Engineering",
 * "Healthcare") used for matching sectors, and it was interpolated as-is into
 * the Arabic next-steps of a report: "خصوصًا المرتبطة بمجال Engineering".
 * Seen on production 2026-11-12 in a report generated wholly in Arabic.
 *
 * An unknown category falls back to its stored name, like subjectNameFor: a
 * word in the wrong language is more honest than a blank.
 */
export const CAREER_CATEGORY_NAMES_AR: Record<string, string> = {
  "Engineering": "الهندسة",
  "Technology": "التقنية",
  "Science": "العلوم",
  "Healthcare": "الرعاية الصحية",
  "Finance": "المالية",
  "Business & Management": "الأعمال والإدارة",
  "Business & Marketing": "الأعمال والتسويق",
  "Media & Communications": "الإعلام والاتصال",
  "Education": "التعليم",
  "Creative Arts": "الفنون الإبداعية",
  "Design & Architecture": "التصميم والعمارة",
  "Culinary Arts": "فنون الطهي",
  "Legal": "القانون",
  "Social Services": "الخدمات الاجتماعية",
  "Aviation & Transport": "الطيران والنقل",
};

export function careerCategoryFor(name: string | null | undefined, lang: string): string {
  if (!name) return "";
  if (lang !== "ar") return name;
  return CAREER_CATEGORY_NAMES_AR[name] ?? name;
}
