/**
 * parseBulkStudentCsv — the bulk student-upload CSV parser.
 *
 * Worth testing directly for two reasons. It decides whether an admin's file of
 * several hundred minors' records is accepted at all, and it was SILENTLY
 * MISREADING files until the commit that introduced named columns: the previous
 * parser destructured each row by position, so a spreadsheet with the right
 * columns in a different order produced wrong records rather than an error. A
 * grade landing in studentId is not a failure anywhere downstream.
 *
 * The cases below split into three groups: the column contract (what is
 * required, and what happens when it is absent), the row-shape guarantees that
 * replaced positional parsing, and the file-shape realities of a spreadsheet
 * exported by a school — CRLF endings, trailing blank lines, hand-edited
 * headings with stray spaces.
 */

import { describe, it, expect } from "vitest";
import {
  BULK_REQUIRED_COLUMNS,
  parseBulkStudentCsv,
  splitCsvRow,
} from "./bulkStudentCsv";

/** The file the Download Template button hands an admin, byte for byte. */
const TEMPLATE =
  "fullName,grade,studentGender,dateOfBirth,studentId,studentName\n" +
  '"Ahmed Ali",grade10,male,2010-03-14,S12345,"Ahmed Ali"\n' +
  '"Fatima Hassan",grade11,female,2009-11-02,S12346,"Fatima Hassan"';

/** Shorthand for the happy path: assert ok and hand back the rows. */
const rowsOf = (text: string) => {
  const result = parseBulkStudentCsv(text);
  if (!result.ok) {
    throw new Error(`expected a parse, got missing columns: ${result.missingColumns.join(", ")}`);
  }
  return result.rows;
};

describe("the required-column contract", () => {
  it("names the four columns the sink rejects a create without", () => {
    // Pinned rather than inferred: this list is what the form advertises AND
    // what it rejects a file on, and it has to stay in step with
    // studentDemographicsSchema. If a fifth field becomes required at the sink
    // and this list is not updated, the form accepts files that fail every row.
    expect([...BULK_REQUIRED_COLUMNS]).toEqual([
      "fullName",
      "grade",
      "studentGender",
      "dateOfBirth",
    ]);
  });

  it("parses the shipped template", () => {
    // If this ever fails, the button is handing schools a file the app refuses.
    expect(rowsOf(TEMPLATE)).toEqual([
      {
        fullName: "Ahmed Ali",
        grade: "grade10",
        studentGender: "male",
        dateOfBirth: "2010-03-14",
        studentId: "S12345",
        studentName: "Ahmed Ali",
        studentAge: undefined,
      },
      {
        fullName: "Fatima Hassan",
        grade: "grade11",
        studentGender: "female",
        dateOfBirth: "2009-11-02",
        studentId: "S12346",
        studentName: "Fatima Hassan",
        studentAge: undefined,
      },
    ]);
  });

  it("rejects a file in the pre-date-of-birth template shape", () => {
    // The template that shipped before DOB was required. Its first column was
    // headed `username` while holding the student's name, so BOTH fullName and
    // dateOfBirth are reported absent.
    const result = parseBulkStudentCsv(
      "username,grade,studentId,studentName,studentAge,studentGender\n" +
        "ahmed.ali,grade10,S1,Ahmed Ali,15,male",
    );

    expect(result).toEqual({ ok: false, missingColumns: ["fullName", "dateOfBirth"] });
  });

  it("reports only the column that is actually missing", () => {
    const result = parseBulkStudentCsv("fullName,grade,studentGender\nAhmed Ali,grade10,male");

    expect(result).toEqual({ ok: false, missingColumns: ["dateOfBirth"] });
  });

  it("reads no rows when a required column is absent", () => {
    // The check is a gate, not a warning: a file missing a column must not
    // produce half-populated members that then fail one at a time at the sink.
    const result = parseBulkStudentCsv("fullName,grade\nAhmed Ali,grade10");

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("rows");
  });
});

describe("named columns, not positional", () => {
  it("reads columns in any order", () => {
    // The regression this parser exists for. Under positional parsing this file
    // produced fullName "2010-03-14" and grade "Ahmed Ali", with no error.
    expect(rowsOf("dateOfBirth,studentGender,fullName,grade\n2010-03-14,male,Ahmed Ali,grade10")).toEqual([
      {
        fullName: "Ahmed Ali",
        grade: "grade10",
        studentGender: "male",
        dateOfBirth: "2010-03-14",
        studentId: undefined,
        studentName: undefined,
        studentAge: undefined,
      },
    ]);
  });

  it("ignores a column it does not recognise, wherever it sits", () => {
    // Schools add their own columns. An unknown heading in the MIDDLE would
    // have shifted every field after it under positional parsing.
    const rows = rowsOf(
      "fullName,houseTeam,grade,studentGender,dateOfBirth\nAhmed Ali,Falcons,grade10,male,2010-03-14",
    );

    expect(rows[0].grade).toBe("grade10");
    expect(rows[0].dateOfBirth).toBe("2010-03-14");
  });

  it("resolves a duplicate column name to the leftmost one", () => {
    // Recording indexOf's behaviour rather than endorsing it. NOTE: the
    // server-side importer builds an object keyed by header, so a duplicate
    // there resolves to the RIGHTMOST. The two disagree, which matters only for
    // a file nobody has yet produced — see the module doc.
    expect(rowsOf("fullName,grade,grade,studentGender,dateOfBirth\nAhmed Ali,grade10,grade12,male,2010-03-14")[0].grade)
      .toBe("grade10");
  });

  it("leaves an absent optional column undefined rather than empty", () => {
    // `|| undefined` matters at the sink: studentName falls back to fullName
    // when undefined, and an empty string would be stored as a blank name.
    const row = rowsOf("fullName,grade,studentGender,dateOfBirth\nAhmed Ali,grade10,male,2010-03-14")[0];

    expect(row.studentName).toBeUndefined();
    expect(row.studentId).toBeUndefined();
    expect(row.studentAge).toBeUndefined();
  });

  it("treats an empty optional cell as absent", () => {
    const row = rowsOf("fullName,grade,studentGender,dateOfBirth,studentId\nAhmed Ali,grade10,male,2010-03-14,")[0];

    expect(row.studentId).toBeUndefined();
  });

  it("tolerates a row with fewer cells than headings", () => {
    // A short row must not throw — it should fail at the sink with a sentence
    // naming the field, like any other incomplete record.
    const row = rowsOf("fullName,grade,studentGender,dateOfBirth,studentId\nAhmed Ali,grade10,male")[0];

    expect(row.fullName).toBe("Ahmed Ali");
    expect(row.dateOfBirth).toBeUndefined();
  });

  it("still parses studentAge, as a number, while the create paths write it", () => {
    const row = rowsOf("fullName,grade,studentGender,dateOfBirth,studentAge\nAhmed Ali,grade10,male,2010-03-14,15")[0];

    expect(row.studentAge).toBe(15);
  });

  it("passes the date of birth through exactly as typed", () => {
    // Deliberately NOT normalized here. The server validates against its own
    // clock and returns the shared module's sentence; a browser-side opinion on
    // a minor's birth date would be a second source of truth.
    expect(rowsOf("fullName,grade,studentGender,dateOfBirth\nAhmed Ali,grade10,male,14/03/2010")[0].dateOfBirth)
      .toBe("14/03/2010");
  });
});

describe("the shapes a real spreadsheet arrives in", () => {
  it("handles CRLF line endings", () => {
    // Most files a school sends are saved on Windows. A stray carriage return on
    // the last cell of each row is fatal by name: the header 'dateOfBirth\r'
    // does not match 'dateOfBirth', so a good file would be refused for a column
    // that is plainly there.
    //
    // This asserts the OUTCOME, not a mechanism. Two things currently deliver
    // it — the \r?\n split and splitCsvRow's per-cell trim — and the trim alone
    // is sufficient, so this test still passes if the split is reduced to '\n'.
    // The test below pins the trim, which is the half actually carrying it.
    const rows = rowsOf(TEMPLATE.replace(/\n/g, "\r\n"));

    expect(rows).toHaveLength(2);
    expect(rows[0].studentName).toBe("Ahmed Ali");
    expect(rows[1].dateOfBirth).toBe("2009-11-02");
  });

  it("ignores a trailing empty line", () => {
    // Every text editor leaves one. It must not become a row of blanks that
    // consumes a licence and creates an empty student.
    expect(rowsOf(TEMPLATE + "\n")).toHaveLength(2);
  });

  it("ignores trailing blank and whitespace-only lines", () => {
    expect(rowsOf(TEMPLATE + "\n\n   \n\n")).toHaveLength(2);
  });

  it("ignores a blank line between rows", () => {
    const rows = rowsOf(
      "fullName,grade,studentGender,dateOfBirth\n" +
        "Ahmed Ali,grade10,male,2010-03-14\n" +
        "\n" +
        "Fatima Hassan,grade11,female,2009-11-02",
    );

    expect(rows.map(r => r.fullName)).toEqual(["Ahmed Ali", "Fatima Hassan"]);
  });

  it("matches headings that carry surrounding whitespace", () => {
    // A hand-edited header row. Without trimming, ' grade' does not match
    // 'grade' and the file is refused for a column the admin can plainly see.
    const rows = rowsOf(
      " fullName , grade ,  studentGender,dateOfBirth \nAhmed Ali,grade10,male,2010-03-14",
    );

    expect(rows[0]).toMatchObject({ fullName: "Ahmed Ali", grade: "grade10", studentGender: "male" });
  });

  it("trims whitespace around cell values", () => {
    expect(rowsOf("fullName,grade,studentGender,dateOfBirth\n  Ahmed Ali , grade10 , male , 2010-03-14 ")[0])
      .toMatchObject({ fullName: "Ahmed Ali", grade: "grade10", dateOfBirth: "2010-03-14" });
  });

  it("returns no rows for a header-only file", () => {
    expect(rowsOf("fullName,grade,studentGender,dateOfBirth")).toEqual([]);
  });

  it("returns no rows for an empty file", () => {
    expect(parseBulkStudentCsv("")).toEqual({ ok: true, rows: [] });
    expect(parseBulkStudentCsv("\n\n  \n")).toEqual({ ok: true, rows: [] });
  });
});

describe("splitCsvRow", () => {
  it("keeps a comma inside a quoted field", () => {
    // "Ali, Ahmed" became two fields under the old bare split(','), shifting
    // every column after it.
    expect(splitCsvRow('"Ali, Ahmed",grade10,male')).toEqual(["Ali, Ahmed", "grade10", "male"]);
  });

  it("parses a quoted name containing a comma through the full parser", () => {
    expect(rowsOf('fullName,grade,studentGender,dateOfBirth\n"Ali, Ahmed",grade10,male,2010-03-14')[0].fullName)
      .toBe("Ali, Ahmed");
  });

  it("DROPS a doubled quote instead of emitting one — a known RFC 4180 deviation", () => {
    // RFC 4180 writes a literal quote inside a quoted field as "". This parser
    // toggles on every quote character and keeps none, so `"O""Brien"` yields
    // `OBrien` — a silently corrupted name.
    //
    // Pinned as-is rather than fixed here for one reason: the server-side
    // importer does exactly the same thing, and the two paths must read a file
    // identically. Correcting it is a change to both and belongs in its own
    // commit. This test is what makes that deviation visible instead of folklore
    // — when it is fixed, this expectation should be inverted, not deleted.
    expect(splitCsvRow('"O""Brien",grade10')).toEqual(["OBrien", "grade10"]);
    expect(splitCsvRow('a,"He said ""hi""",c')).toEqual(["a", "He said hi", "c"]);
  });

  it("strips the quotes around an ordinary quoted field", () => {
    expect(splitCsvRow('"Ahmed Ali",grade10')).toEqual(["Ahmed Ali", "grade10"]);
  });

  it("yields an empty final field for a trailing comma", () => {
    expect(splitCsvRow("a,b,")).toEqual(["a", "b", ""]);
  });

  it("yields one field for a row with no commas", () => {
    expect(splitCsvRow("fullName")).toEqual(["fullName"]);
  });

  it("strips a trailing carriage return, which is what makes CRLF files work", () => {
    // Named explicitly because the parser's \r?\n split is redundant with this
    // and removing that split breaks nothing. If the trim is ever narrowed, CRLF
    // support goes with it, and this is the test that says so.
    expect(splitCsvRow("male,2010-03-14\r")).toEqual(["male", "2010-03-14"]);
    expect(splitCsvRow("fullName,grade,studentGender,dateOfBirth\r")).toEqual([
      "fullName",
      "grade",
      "studentGender",
      "dateOfBirth",
    ]);
  });
});
