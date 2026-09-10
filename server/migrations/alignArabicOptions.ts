import { uaeQuestionBank } from "../questionBanks/uae";
import { flattenQuestionBank } from "../../shared/questionTypes";

/**
 * Realigns a source-ordered Arabic option array to the order the row is actually
 * STORED in.
 *
 * The Arabic content files carry `optionsAr` as a bare positional array whose
 * order mirrors the English `options` array in the question bank source. That
 * held only while stored order equalled source order. Migration 020 permutes
 * stored order, and storage.createQuizQuestion permutes every new insert, so
 * writing `item.optionsAr` verbatim would now pair each Arabic label with a
 * different English option.
 *
 * THAT FAILURE IS WORSE THAN THE BIAS IT COMES FROM. The client stores the
 * canonical ENGLISH option text for whichever label the student clicked
 * (QuizStep.tsx:290-295), so a desynced Arabic array means an Arabic-reading
 * student reads one option and submits another — silently, and scored as if they
 * had chosen what they never saw.
 *
 * These migrations re-run unguarded from seed.ts on every seed, so this is not a
 * one-time concern: without this remap each seed would undo migration 020's
 * pairing.
 *
 * The remap is content-addressed rather than positional, which also removes the
 * older latent version of the same hazard — reordering options in a bank source
 * file without reordering optionsAr alongside it used to desync them just as
 * quietly. No question in the bank has duplicate option text, so the English
 * option is an unambiguous key.
 *
 * Returns null when the pairing cannot be established (question absent from the
 * bank, length mismatch, or a stored option with no source counterpart). Callers
 * must then leave options_ar untouched rather than write a guess.
 */

let sourceOptionsByQuestion: Map<string, string[]> | null = null;

function sourceOptions(): Map<string, string[]> {
  if (!sourceOptionsByQuestion) {
    sourceOptionsByQuestion = new Map(
      flattenQuestionBank(uaeQuestionBank).map((q) => [q.question, q.options]),
    );
  }
  return sourceOptionsByQuestion;
}

export function alignArabicOptions(
  questionText: string,
  storedOptions: unknown,
  sourceOrderedAr: string[],
): string[] | null {
  const source = sourceOptions().get(questionText);
  if (!source || source.length !== sourceOrderedAr.length) return null;
  if (!Array.isArray(storedOptions) || storedOptions.length !== source.length) return null;

  const arabicByEnglish = new Map<string, string>();
  source.forEach((en, i) => arabicByEnglish.set(en, sourceOrderedAr[i]));

  const aligned: string[] = [];
  for (const opt of storedOptions) {
    // Stored options are plain strings in the bank, but tolerate {id,text}.
    const english = typeof opt === "string" ? opt : (opt as any)?.text;
    const arabic = arabicByEnglish.get(english);
    if (arabic === undefined) return null;
    aligned.push(arabic);
  }
  return aligned;
}
