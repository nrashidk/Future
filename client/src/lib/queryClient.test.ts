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
import { serverErrorMessage } from "./queryClient";

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
