import { describe, it, expect } from "vitest";
import { primarySectorFor, type SectorMapRow } from "./sectorAssignment";

const rows: SectorMapRow[] = [
  { sectorName: "Healthcare", displayOrder: 2, careerCategory: "Healthcare", careerId: null, relevance: 100 },
  { sectorName: "Artificial Intelligence", displayOrder: 1, careerCategory: "Technology", careerId: null, relevance: 90 },
  { sectorName: "Digital Economy", displayOrder: 3, careerCategory: "Technology", careerId: null, relevance: 90 },
  { sectorName: "Space & Advanced Sciences", displayOrder: 4, careerCategory: "Technology", careerId: null, relevance: 60 },
  { sectorName: "Space & Advanced Sciences", displayOrder: 4, careerCategory: null, careerId: "physicist", relevance: 80 },
  { sectorName: "Tourism", displayOrder: 5, careerCategory: null, careerId: null, relevance: null },
];

describe("primarySectorFor", () => {
  it("takes the category rule with the highest relevance", () => {
    expect(primarySectorFor({ id: "nurse", category: "Healthcare" }, rows)).toBe("Healthcare");
  });
  it("breaks a tie by the country's own order", () => {
    expect(primarySectorFor({ id: "dev", category: " technology " }, rows)).toBe("Artificial Intelligence");
  });
  it("uses only the overrides when a career has any (override-exclusive)", () => {
    // Its category rules would give Artificial Intelligence at 90; the override says Space.
    expect(primarySectorFor({ id: "physicist", category: "Technology" }, rows)).toBe("Space & Advanced Sciences");
  });
  it("puts an unmapped career in no sector", () => {
    expect(primarySectorFor({ id: "chef", category: "Hospitality" }, rows)).toBeNull();
    expect(primarySectorFor({ id: "x", category: null }, rows)).toBeNull();
  });
});
