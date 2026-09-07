import { splitCsvRow } from "@shared/csvRow";

/**
 * Re-exported so this module stays the single import for everything the bulk
 * upload needs, and so the tests that pin row-splitting behaviour keep sitting
 * next to the parser that depends on it.
 */
export { splitCsvRow };

/**
 * The bulk student-upload CSV parser.
 *
 * Extracted from AdminOrganizations.tsx so it can be tested without mounting a
 * dialog. It is pure — text in, rows out — and it carries the column contract
 * that decides whether an admin's file is accepted at all, so it is worth
 * testing directly rather than through the form.
 *
 * WHAT IT IS NOT: a general CSV library. It handles the subset a school
 * spreadsheet actually exports — comma separators, optional double quotes,
 * either line ending.
 *
 * Row splitting itself lives in shared/csvRow.ts and is the SAME FUNCTION the
 * server-side CSV import route calls. It used to be a second hand-maintained
 * copy, and the two were identically wrong about escaped quotes for as long as
 * nobody compared them.
 */

/**
 * The columns the file must carry, matched by name.
 *
 * These four are the ones studentDemographicsSchema rejects a create without
 * (shared/schema.ts), so a file missing any of them fails every row. Checking
 * them up front lets the form say so once, before uploading, instead of the
 * admin reading five hundred copies of the same sentence.
 *
 * studentId, studentName and studentAge stay optional. studentName falls back to
 * fullName at the sink; studentAge is superseded by dateOfBirth and is still
 * accepted only because the create paths still write it.
 */
export const BULK_REQUIRED_COLUMNS = ['fullName', 'grade', 'studentGender', 'dateOfBirth'] as const;

/** One parsed row, in the shape the bulk endpoint's `members` array expects. */
export interface BulkStudentRow {
  fullName: string;
  grade: string;
  studentId?: string;
  studentName?: string;
  studentAge?: number;
  studentGender?: string;
  dateOfBirth?: string;
}

export type BulkStudentCsvResult =
  | { ok: true; rows: BulkStudentRow[] }
  | { ok: false; missingColumns: string[] };

/**
 * Parse a bulk-upload CSV into rows, or report which required columns are absent.
 *
 * Returns a result rather than throwing, and reports the missing column NAMES
 * rather than a finished sentence, because the message the admin sees is an
 * i18n key the caller owns. This module has no opinion about language.
 *
 * Columns are matched by NAME. This parser used to destructure each row by
 * POSITION, which made column order the contract and the header row decorative:
 * a file with the right columns in a different order was silently misread, and a
 * grade landing in studentId is not an error anywhere downstream, just a wrong
 * record.
 *
 * A DUPLICATE column name resolves to the leftmost one, which is `indexOf`'s
 * behaviour and is left as it is rather than made an error. A spreadsheet that
 * exports two `grade` columns has one real column and one the admin forgot to
 * delete, and taking the first is both the likelier intent and the same answer
 * the server's parser gives — it builds a rowData object keyed by header, so a
 * duplicate there is overwritten by the LAST one. Those two disagree, which is
 * recorded in the tests and worth reconciling if a real file ever shows up with
 * duplicate headings.
 */
export function parseBulkStudentCsv(text: string): BulkStudentCsvResult {
  // Split on either line ending. A file saved on Windows — which is most files a
  // school sends — arrives CRLF-delimited, and a stray \r on the last cell of
  // every row would be fatal by name: the header 'dateOfBirth\r' does not match
  // 'dateOfBirth', so a perfectly good file would be refused for a column that
  // is plainly there.
  //
  // BELT AND BRACES, NOT THE LOAD-BEARING PART, and worth being honest about
  // because it is easy to misread: splitCsvRow trims every cell, which already
  // strips a trailing \r. Removing this regex breaks no test. It stays because
  // the trim is there for a different reason (hand-edited headings with stray
  // spaces) and could reasonably be narrowed one day without anyone realising
  // CRLF support was riding on it.
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { ok: true, rows: [] };

  const headers = splitCsvRow(lines[0]);
  const missingColumns = BULK_REQUIRED_COLUMNS.filter(h => !headers.includes(h));
  if (missingColumns.length > 0) return { ok: false, missingColumns };

  const rows = lines.slice(1).map(line => {
    const values = splitCsvRow(line);
    const cell = (name: string) => {
      const index = headers.indexOf(name);
      return index === -1 ? '' : (values[index] ?? '');
    };

    const studentAge = cell('studentAge');
    return {
      fullName: cell('fullName'),
      grade: cell('grade'),
      studentId: cell('studentId') || undefined,
      studentName: cell('studentName') || undefined,
      studentAge: studentAge ? parseInt(studentAge) : undefined,
      studentGender: cell('studentGender') || undefined,
      // Sent as typed. The server validates against ITS clock and returns the
      // shared module's sentence per row; normalizing here would be a second
      // opinion on a minor's birth date formed in the browser.
      dateOfBirth: cell('dateOfBirth') || undefined,
    };
  });

  return { ok: true, rows };
}
