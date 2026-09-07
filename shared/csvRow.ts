/**
 * CSV row splitting, shared by the two paths that read a school's student file.
 *
 * WHY THIS IS SHARED AND NOT COPIED: a school can get students into the system
 * two ways — pasting a file into the bulk-upload dialog, which parses in the
 * browser (client/src/lib/bulkStudentCsv.ts), or uploading it to the CSV import
 * endpoint, which parses on the server (server/routes/admin.routes.ts). Those
 * were two hand-maintained copies of the same loop, and they were both wrong in
 * the same way for as long as nobody compared them. One function means the same
 * file produces the same students however it arrives.
 *
 * NOT a general CSV library. It handles the subset a school spreadsheet actually
 * exports: comma separators, optionally double-quoted fields, escaped quotes,
 * and either line ending.
 */

/**
 * Split one CSV row into fields, respecting double-quoted values.
 *
 * Handles the three things a bare `split(',')` gets wrong:
 *
 *  - A COMMA INSIDE A QUOTED FIELD stays part of the value. `"Ali, Ahmed"` is
 *    one field; splitting it into two shifted every column after it, which
 *    under the old positional parser silently produced wrong records.
 *
 *  - A DOUBLED QUOTE inside a quoted field is RFC 4180's way of writing a
 *    literal quote, and yields one: `"O""Brien"` is `O"Brien`. Both parsers
 *    previously toggled on every quote and kept none, so that name was stored as
 *    `OBrien` — a corrupted child's record that nothing downstream could
 *    distinguish from a name genuinely typed that way.
 *
 *  - SURROUNDING QUOTES on an ordinary field are delimiters, not data, and are
 *    dropped.
 *
 * Fields are trimmed. That is what lets a hand-edited header row with stray
 * spaces still match by name, and it is also what strips the trailing carriage
 * return from a CRLF file — the line splitting each caller does is belt and
 * braces on top of it, not the load-bearing part.
 */
export function splitCsvRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      // Inside a quoted field, "" is an escaped quote: consume both characters
      // and emit one. Anywhere else a quote is a delimiter and contributes
      // nothing, which is what strips the quotes around an ordinary field.
      if (insideQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}
