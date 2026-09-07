/**
 * splitCsvRow — the row splitter both student-import paths read files with.
 *
 * It lives in shared/ and is tested here because it is the ONE function the
 * browser-side bulk paste and the server-side CSV import both call. It used to
 * be two hand-maintained copies, and they were identically wrong about escaped
 * quotes for as long as nobody compared them — a school pasting a file and a
 * school uploading the same file got the same corrupted names, which reads as
 * consistency rather than a bug.
 *
 * client/src/lib/bulkStudentCsv.test.ts covers what the bulk parser builds on
 * top of this (the column contract, row shapes, whole-file handling). These
 * cases are about one row.
 */

import { describe, it, expect } from "vitest";
import { splitCsvRow } from "./csvRow";

describe("splitCsvRow", () => {
  it("splits an ordinary row on commas", () => {
    expect(splitCsvRow("Ahmed Ali,grade10,male,2010-03-14")).toEqual([
      "Ahmed Ali",
      "grade10",
      "male",
      "2010-03-14",
    ]);
  });

  it("strips the quotes around a quoted field", () => {
    expect(splitCsvRow('"Ahmed Ali",grade10')).toEqual(["Ahmed Ali", "grade10"]);
  });

  it("keeps a comma inside a quoted field", () => {
    // A bare split(',') made this two fields and shifted every column after it.
    expect(splitCsvRow('"Ali, Ahmed",grade10,male')).toEqual(["Ali, Ahmed", "grade10", "male"]);
  });

  it("emits one quote for a doubled quote, per RFC 4180", () => {
    // THE BUG THIS MODULE WAS CREATED TO FIX, on the server side of it. Both
    // parsers toggled on every quote character and kept none, so this name was
    // imported as `OBrien` — a corrupted child's record, indistinguishable
    // downstream from a name genuinely typed that way.
    expect(splitCsvRow('"O""Brien",grade10')).toEqual(['O"Brien', "grade10"]);
  });

  it("keeps an escaped quote at the end of a field", () => {
    // The server additionally ran .replace(/^"|"$/g, '') over each value, which
    // truncated a trailing quote that was data rather than a delimiter. Dead
    // code while the splitter dropped every quote; harmful the moment it
    // stopped, so it was removed with this fix.
    expect(splitCsvRow('"He said ""hi""",grade10')).toEqual(['He said "hi"', "grade10"]);
  });

  it("handles an escaped quote and a comma in the same field", () => {
    expect(splitCsvRow('"O""Brien, Ahmed",grade10')).toEqual(['O"Brien, Ahmed', "grade10"]);
  });

  it("handles a field that is only an escaped quote", () => {
    expect(splitCsvRow('"""",grade10')).toEqual(['"', "grade10"]);
  });

  it("lets a stray mid-field quote open a quoted region", () => {
    // Documented, not endorsed. A quote anywhere outside a quoted field opens
    // one, so an unbalanced quote swallows the following commas: `a"b,c` is a
    // SINGLE field `ab,c`, not two.
    //
    // Left as it is because every alternative is a guess about what a malformed
    // row meant, and this parser's contract everywhere else is to be
    // predictable rather than clever. It is also self-limiting in practice: the
    // bulk parser matches columns by name against a header row, so a row
    // mangled this way loses cells and fails at the sink with a sentence naming
    // the missing field, rather than quietly storing a shifted record — which is
    // exactly what the old positional parser did do.
    expect(splitCsvRow('a"b,c')).toEqual(["ab,c"]);
  });

  it("trims surrounding whitespace, which is what makes CRLF and hand-edited headers work", () => {
    // Two jobs at once: a header row an admin has spaced out still matches by
    // name, and the trailing carriage return of a CRLF file is stripped. The
    // callers' line splitting is belt and braces on top of this, not the
    // load-bearing part.
    expect(splitCsvRow("  fullName , grade ")).toEqual(["fullName", "grade"]);
    expect(splitCsvRow("male,2010-03-14\r")).toEqual(["male", "2010-03-14"]);
  });

  it("yields an empty final field for a trailing comma", () => {
    expect(splitCsvRow("a,b,")).toEqual(["a", "b", ""]);
  });

  it("yields empty strings for empty fields", () => {
    expect(splitCsvRow("a,,c")).toEqual(["a", "", "c"]);
  });

  it("yields one field for a row with no commas", () => {
    expect(splitCsvRow("fullName")).toEqual(["fullName"]);
  });

  it("yields one empty field for an empty row", () => {
    expect(splitCsvRow("")).toEqual([""]);
  });
});
