/**
 * splitStudentName is shared by the student CREATE path and the member UPDATE
 * path, and the whole reason it exists is that those two must split a name
 * identically — organization_members.student_name and users.firstName/lastName
 * are two copies of the same name, and a divergence between the writers is how
 * they drift apart. These cases pin the behaviour the create path had before
 * the extraction, so re-splitting an existing row cannot change it.
 */

import { describe, it, expect } from "vitest";
import { splitStudentName } from "./studentName";

describe("splitStudentName", () => {
  it("splits on the first space", () => {
    expect(splitStudentName("Ahmed Ali")).toEqual({ firstName: "Ahmed", lastName: "Ali" });
  });

  it("keeps every remaining part in the last name", () => {
    expect(splitStudentName("Fatima bint Hassan Al Maktoum"))
      .toEqual({ firstName: "Fatima", lastName: "bint Hassan Al Maktoum" });
  });

  it("collapses runs of whitespace rather than emitting empty parts", () => {
    expect(splitStudentName("  Ahmed   Ali  ")).toEqual({ firstName: "Ahmed", lastName: "Ali" });
  });

  // users.firstName and users.lastName are NOT NULL, so a one-word name still
  // has to produce two values.
  it("falls back to 'User' for a single-word name", () => {
    expect(splitStudentName("Ahmed")).toEqual({ firstName: "Ahmed", lastName: "User" });
  });

  it("falls back to 'Student User' for an empty name", () => {
    expect(splitStudentName("")).toEqual({ firstName: "Student", lastName: "User" });
    expect(splitStudentName("   ")).toEqual({ firstName: "Student", lastName: "User" });
  });
});
