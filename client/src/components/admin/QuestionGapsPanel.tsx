/**
 * "WHAT TO WRITE NEXT" — the school's bank, cell by cell (subject × grade).
 *
 * `/api/contributions/gaps` existed and no screen called it, so a school wrote
 * whatever it was strongest at — the cell least likely to need it. A student
 * gets five questions per subject at THEIR grade, so a thin cell means the
 * students of that grade all see nearly the same questions.
 */
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { subjectCodeLabel } from "@shared/subjects";
import type { QuestionGaps } from "./ContributeQuestions";

const STYLE: Record<string, string> = {
  empty: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200",
  short: "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200",
  thin: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  ok: "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
};

export function QuestionGapsPanel({ gaps, subjects, onWrite }: {
  gaps: QuestionGaps;
  subjects: Array<{ name: string; code: string }>;
  onWrite: (subjectCode: string, grade: number) => void;
}) {
  const { t, i18n } = useTranslation("admin");
  const subjectNames = Array.from(new Set(gaps.cells.map((c) => c.subject)));
  const grades = Array.from(new Set(gaps.cells.map((c) => c.grade)))
    .sort((a, b) => parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10));
  const cell = (s: string, g: string) => gaps.cells.find((c) => c.subject === s && c.grade === g);
  const codeOf = (name: string) => subjects.find((x) => x.name === name)?.code;
  const label = { empty: t("contributions.gapsEmpty"), short: t("contributions.gapsShort"), thin: t("contributions.gapsThin"), ok: t("contributions.gapsOk") };
  const healthy = gaps.healthy ?? 10;

  return (
    <Card data-testid="card-question-gaps">
      <CardHeader>
        <CardTitle>{t("contributions.gapsTitle")}</CardTitle>
        <CardDescription>{t("contributions.gapsDesc", { n: gaps.target })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full border-separate" style={{ borderSpacing: "6px" }}>
            <thead>
              <tr className="text-sm text-muted-foreground">
                <th className="text-start font-medium px-1">{t("contributions.subjectLabel")}</th>
                {grades.map((g) => (
                  <th key={g} className="font-medium text-center">{t("contributions.gradeN", { n: parseInt(g.replace(/\D/g, ""), 10) })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjectNames.map((s) => {
                const code = codeOf(s);
                return (
                  <tr key={s}>
                    <td className="text-sm font-medium px-1 whitespace-nowrap">{code ? subjectCodeLabel(code, i18n.language) : s}</td>
                    {grades.map((g) => {
                      const c = cell(s, g);
                      if (!c) return <td key={g} />;
                      const gradeNum = parseInt(g.replace(/\D/g, ""), 10);
                      return (
                        <td key={g} className="p-0">
                          <div className={`rounded-md min-h-[64px] px-2 py-1.5 flex flex-col items-center justify-center gap-0.5 ${STYLE[c.status]}`} data-testid={`gap-cell-${code ?? s}-${gradeNum}`}>
                            <span className="text-base font-bold leading-none">{c.count}</span>
                            <span className="text-[11px]">{label[c.status]}</span>
                            {c.status !== "ok" && code && (
                              <button type="button" className="text-xs font-semibold underline underline-offset-2 hover:opacity-80" onClick={() => onWrite(code, gradeNum)} data-testid={`button-gap-write-${code}-${gradeNum}`}>
                                {t("contributions.gapsWrite")}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><b>{label.empty}</b> {t("contributions.gapsLegendEmpty")}</span>
          <span><b>{label.short}</b> {t("contributions.gapsLegendShort", { n: gaps.target })}</span>
          <span><b>{label.thin}</b> {t("contributions.gapsLegendThin", { n: gaps.target, m: healthy - 1 })}</span>
          <span><b>{label.ok}</b> {t("contributions.gapsLegendOk", { m: healthy })}</span>
          <span className="ms-auto">{t("contributions.gapsSummary", { empty: gaps.summary.empty, short: gaps.summary.short, thin: gaps.summary.thin, ok: gaps.summary.ok })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
