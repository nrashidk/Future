/**
 * serverErrorMessage — the parser for what throwIfResNotOk formats.
 *
 * throwIfResNotOk throws `new Error(`${res.status}: ${text}`)`, so every error
 * reaching a mutation's onError carries the status code and the raw response
 * body in its message. Eight handlers in AdminOrganizations rendered that
 * straight into a toast, showing users strings like
 *   400: {"message":"Student gender is required","errors":[...]}
 *
 * These cases pin both halves of the contract: the server's own sentence is
 * extracted, and anything that would be worse than a generic fallback returns
 * null so the caller can substitute its localized default.
 *
 * The two functions have to agree on the wire format, which is why they live in
 * the same module — a change to throwIfResNotOk's template should break these.
 */

import { describe, it, expect } from "vitest";
import { serverErrorMessage, serverErrorCode } from "./queryClient";
import { CONSENT_REQUIRED_CODE, CONSENT_REQUIRED_MESSAGE } from "../../../server/utils/consentGate";

describe("serverErrorMessage", () => {
  describe("extracts the server's message", () => {
    it("reads `message` out of a JSON error body", () => {
      // The 400 from the PATCH guard on /api/admin/organizations/:id.
      const error = new Error(
        '400: {"message":"School setup incomplete: Al Noor School would have no country set. ' +
          'It is required to add students, so it cannot be cleared once set."}',
      );
      expect(serverErrorMessage(error)).toBe(
        "School setup incomplete: Al Noor School would have no country set. " +
          "It is required to add students, so it cannot be cleared once set.",
      );
    });

    it("ignores sibling keys such as the zod `errors` array", () => {
      // The 400 raised by studentDemographicsSchema at the student-create sink.
      const error = new Error(
        '400: {"message":"Student gender is required","errors":[{"path":["studentGender"],"message":"Student gender is required"}]}',
      );
      expect(serverErrorMessage(error)).toBe("Student gender is required");
    });

    it("joins multiple schema messages as the server sent them", () => {
      const error = new Error(
        '400: {"message":"Student name is required; Student gender is required"}',
      );
      expect(serverErrorMessage(error)).toBe(
        "Student name is required; Student gender is required",
      );
    });

    it("handles a body spanning multiple lines", () => {
      // Pins the [\s\S] in the status-stripping regex: a `.` would not match
      // across the newline and the whole body would be dropped.
      const error = new Error('500: {\n  "message": "Something broke"\n}');
      expect(serverErrorMessage(error)).toBe("Something broke");
    });

    it("falls back to a short plain-text body (res.statusText)", () => {
      // throwIfResNotOk uses res.statusText when the body is empty.
      expect(serverErrorMessage(new Error("500: Internal Server Error"))).toBe(
        "Internal Server Error",
      );
    });

    it("passes through an error with no status prefix", () => {
      // fetch itself failing, before any response exists.
      expect(serverErrorMessage(new Error("Failed to fetch"))).toBe("Failed to fetch");
    });

    it("accepts a plain-text body at the length limit", () => {
      // Boundary is inclusive; 200 is the last length still shown. Paired with
      // the "refuses a long plain-text body" case below, which uses 201.
      const body = "x".repeat(200);
      expect(serverErrorMessage(new Error(`500: ${body}`))).toBe(body);
    });

    it("trims surrounding whitespace", () => {
      expect(serverErrorMessage(new Error('400: {"message":"  Grade is required  "}'))).toBe(
        "Grade is required",
      );
    });
  });

  describe("returns null so the caller uses its own localized fallback", () => {
    it("refuses an HTML error page", () => {
      // A proxy's 502 page in a toast is worse than "failed to update".
      const error = new Error("502: <html><body><h1>502 Bad Gateway</h1></body></html>");
      expect(serverErrorMessage(error)).toBeNull();
    });

    it("refuses a long plain-text body", () => {
      expect(serverErrorMessage(new Error(`500: ${"x".repeat(201)}`))).toBeNull();
    });

    it("refuses a malformed JSON body rather than showing the raw text", () => {
      expect(serverErrorMessage(new Error('400: {"message": '))).toBeNull();
    });

    it("refuses JSON with no message key", () => {
      expect(serverErrorMessage(new Error('400: {"errors":["nope"]}'))).toBeNull();
    });

    it("refuses a non-string message", () => {
      expect(serverErrorMessage(new Error('400: {"message":42}'))).toBeNull();
    });

    it("refuses a blank message", () => {
      expect(serverErrorMessage(new Error('400: {"message":"   "}'))).toBeNull();
    });

    it("refuses an empty body", () => {
      expect(serverErrorMessage(new Error("404: "))).toBeNull();
    });

    it("refuses a non-Error value", () => {
      expect(serverErrorMessage("just a string")).toBeNull();
      expect(serverErrorMessage(null)).toBeNull();
      expect(serverErrorMessage(undefined)).toBeNull();
      expect(serverErrorMessage({ message: "not an Error instance" })).toBeNull();
    });

    it("refuses an Error with an empty message", () => {
      expect(serverErrorMessage(new Error(""))).toBeNull();
    });
  });
});

/**
 * serverErrorCode — the same body, the field meant to be branched on.
 *
 * The case that matters is the last one: it builds the exact 409 body the
 * enrolment gate returns and asserts the client's parser recovers the code the
 * server put there. That is the pair the shared constant exists to keep honest,
 * and a drift between the two ends is otherwise silent — the admin simply gets
 * the untranslated English message again, which is what this whole path was
 * written to remove.
 */
describe("serverErrorCode", () => {
  it("reads `code` out of a JSON error body", () => {
    const error = new Error('409: {"message":"Some English sentence.","code":"CONSENT_REQUIRED"}');
    expect(serverErrorCode(error)).toBe("CONSENT_REQUIRED");
  });

  it("returns null when the body carries a message but no code", () => {
    // The shape of almost every other error on the page: nothing to branch on,
    // so the caller falls through to serverErrorMessage.
    expect(serverErrorCode(new Error('400: {"message":"Student gender is required"}'))).toBeNull();
  });

  it("returns null for a non-JSON body", () => {
    // A proxy's plain-text or HTML failure. serverErrorMessage may still show
    // the short ones; there is never a code in them.
    expect(serverErrorCode(new Error("502: Bad Gateway"))).toBeNull();
    expect(serverErrorCode(new Error("502: <html><body>nginx</body></html>"))).toBeNull();
  });

  it("returns null for unparseable JSON, a blank code, and a non-string code", () => {
    expect(serverErrorCode(new Error('409: {"code":'))).toBeNull();
    expect(serverErrorCode(new Error('409: {"code":"   "}'))).toBeNull();
    expect(serverErrorCode(new Error('409: {"code":42}'))).toBeNull();
  });

  it("returns null for a non-Error value and an empty message", () => {
    expect(serverErrorCode("just a string")).toBeNull();
    expect(serverErrorCode(null)).toBeNull();
    expect(serverErrorCode(new Error(""))).toBeNull();
  });

  it("recovers the gate's code from the gate's own 409 body", () => {
    // Built the way throwIfResNotOk sees it: status, colon, the JSON the route
    // actually sends. Both ends are imported rather than retyped, so a change
    // to either the code or the response shape breaks this.
    const wire = new Error(
      `409: ${JSON.stringify({ message: CONSENT_REQUIRED_MESSAGE, code: CONSENT_REQUIRED_CODE })}`,
    );
    expect(serverErrorCode(wire)).toBe(CONSENT_REQUIRED_CODE);

    // And the message is still recoverable beside it — the code does not
    // replace the fallback chain, it precedes it.
    expect(serverErrorMessage(wire)).toBe(CONSENT_REQUIRED_MESSAGE);
  });
});
