import type { Express } from "express";
import { storage } from "../storage";
import { SUBJECT_IDS, subjectNameFor, gradeLabelFor } from "@shared/subjects";
import isoCountries from "i18n-iso-countries";
import isoEn from "i18n-iso-countries/langs/en.json";
import isoAr from "i18n-iso-countries/langs/ar.json";

/**
 * The world's countries, in English and Arabic, for the picker that creates
 * one.
 *
 * REGISTERED ONCE AT MODULE LOAD, and only two locales: the package ships
 * ~190 of them and registering all would be megabytes for no purpose.
 *
 * WHY A LIST AT ALL. Creating a country took four free-text fields, so the
 * same country could arrive as "UAE", "U.A.E." or "Emirates" depending on who
 * typed it -- and that string is then handed to the model as the thing to
 * research. An ambiguous or misspelled name produces research about the wrong
 * place, or nothing, with no error. The name is also what a school's country
 * is matched against later.
 *
 * ISO rather than a hand-written list because the Arabic names have to be
 * right, and 250 of them typed by hand would not be.
 */
isoCountries.registerLocale(isoEn as any);
isoCountries.registerLocale(isoAr as any);

export function registerCountriesRoutes(app: Express) {
  app.get("/api/countries", async (_req, res) => {
    try {
      const countries = await storage.getAllCountries();
      res.json(countries);
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  app.get("/api/countries/:id", async (req, res) => {
    try {
      const country = await storage.getCountryById(req.params.id);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }
      res.json(country);
    } catch (error) {
      console.error("Error fetching country:", error);
      res.status(500).json({ message: "Failed to fetch country" });
    }
  });

  // Get subjects for a specific country and curriculum (public endpoint)
  app.get("/api/countries/:countryId/curricula/:curriculum/subjects", async (req, res) => {
    try {
      const { countryId, curriculum } = req.params;
      
      // Verify country exists
      const country = await storage.getCountryById(countryId);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }
      
      const subjects = await storage.getSubjectsByCurriculum(countryId, curriculum);
      res.json(subjects);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ message: "Failed to fetch subjects" });
    }
  });

  // Get all subjects for a country (across all curricula) - only active subjects
  app.get("/api/countries/:countryId/subjects", async (req, res) => {
    try {
      const { countryId } = req.params;
      
      // Verify country exists
      const country = await storage.getCountryById(countryId);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }
      
      // Get all subjects for the country and filter to active only for public endpoint
      const allSubjects = await storage.getSubjectsByCountry(countryId);
      const activeSubjects = allSubjects.filter(s => s.isActive);
      res.json(activeSubjects);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      res.status(500).json({ message: "Failed to fetch subjects" });
    }
  });

  /**
   * THE REFERENCE VOCABULARY, IN ONE PLACE, IN BOTH LANGUAGES.
   *
   * Everything that builds a prompt, a dropdown or a validation message needs
   * the same four lists -- countries, curricula, subjects, grades -- and until
   * now each caller assembled them itself from a different query, or hardcoded
   * them. That is how the vocabularies drifted: the contributed-question
   * defect (contribution.subjectVocabulary.test.ts) was a subject NAME on one
   * side and a subject CODE on the other, and the Arabic report printed English
   * subject names because the server had no Arabic subject list at all.
   *
   * ARABIC IS THE POINT, not a decoration. Curricula and grades carry no
   * Arabic in the database and subjects carry none either, so anything
   * rendering an Arabic screen or writing an Arabic prompt had nothing to use.
   * Here each entry carries `name` and `nameAr` together, so a caller picks a
   * language instead of discovering there is only one.
   *
   * WHAT IS DELIBERATELY NOT HERE: anything scored or generated -- careers,
   * WEF skills, priority sectors. Those are data a feature reasons about, not
   * vocabulary it must agree on, and they are large. This is the controlled
   * vocabulary a caller has to match exactly or fail silently.
   *
   * Public, like the other routes in this file: it is the same information the
   * assessment already exposes to a guest choosing a country, and a prompt
   * builder on the server uses the same source rather than a second one.
   */
  app.get("/api/reference", async (req, res) => {
    try {
      const countryId = typeof req.query.countryId === "string" ? req.query.countryId : undefined;
      const countries = await storage.getAllCountries();
      const scope = countryId ? countries.filter((c: any) => c.id === countryId) : countries;

      if (countryId && scope.length === 0) {
        return res.status(404).json({ message: "Country not found" });
      }

      const out = [];
      for (const country of scope as any[]) {
        const curricula = [];
        for (const curriculum of country.curricula ?? []) {
          const rows = await storage.getSubjectsByCurriculum(country.id, curriculum);
          curricula.push({
            name: curriculum,
            // No Arabic column exists for a curriculum name, and most are
            // proper nouns that stay in Latin script in Arabic text anyway
            // ("IB", "British"). Stated as null rather than echoed in English,
            // so a caller can tell "not translated" from "same in both".
            nameAr: null,
            subjects: rows
              .filter((s: any) => s.isActive)
              .map((s: any) => ({
                name: s.name,
                nameAr: subjectNameFor(s.name, "ar"),
                code: s.code,
                // The local names that resolve to this subject -- what lets a
                // curriculum call it "Islamic Studies" or "Physics" without
                // becoming a seventh subject.
                aliases: s.aliases ?? [],
              })),
          });
        }

        const grades = (country.gradeLevels ?? []).map((g: string) => ({
          value: g,
          // The VALUE is never localised: it is what quiz_questions.grade is
          // matched against, and Arabic-Indic digits here would stop matching.
          label: gradeLabelFor(g, "en"),
          labelAr: gradeLabelFor(g, "ar"),
        }));

        out.push({
          id: country.id,
          name: country.name,
          nameAr: country.nameAr ?? null,
          curricula,
          grades,
        });
      }

      res.json({
        countries: out,
        // The six canonical subjects, independent of any country. A caller
        // validating a subject name, or telling a model which subjects exist,
        // wants this rather than one country's rows -- career matching is
        // hard-coded to these six, so a seventh cannot be scored.
        canonicalSubjects: SUBJECT_IDS.map((name) => ({
          name, nameAr: subjectNameFor(name, "ar"),
        })),
      });
    } catch (error) {
      console.error("Error building reference data:", error);
      res.status(500).json({ message: "Failed to build reference data" });
    }
  });

  /**
   * The catalogue a superadmin picks from when adding a country.
   *
   * `alreadyAdded` is marked rather than filtered out, so the picker can show
   * a country as taken instead of silently omitting it and leaving someone
   * hunting for a country that is already there.
   *
   * Suggestions are ISO ALPHA-2 -- AE, SA, EG -- which is the house
   * convention. They are suggestions and not an imposed convention because
   * the live UAE row predates it and uses "uae"/"UAE"; rewriting a primary
   * key that foreign keys and URLs already point at is a migration, not a
   * tidy-up. So the picker pre-fills and the fields stay editable.
   */
  app.get("/api/reference/country-catalog", async (_req, res) => {
    try {
      const existing = await storage.getAllCountries();
      const takenNames = new Set(existing.map((c: any) => (c.name ?? "").toLowerCase()));

      const en = isoCountries.getNames("en", { select: "official" });
      const ar = isoCountries.getNames("ar", { select: "official" });

      const catalog = Object.entries(en)
        .map(([alpha2, name]) => ({
          alpha2,
          alpha3: isoCountries.alpha2ToAlpha3(alpha2) ?? null,
          name: name as string,
          nameAr: (ar as Record<string, string>)[alpha2] ?? null,
          // ISO ALPHA-2, which is the house convention: AE, SA, EG.
          // Suggested rather than binding -- the fields stay editable, because
          // the live UAE row predates this and uses "uae"/"UAE".
          suggestedId: alpha2.toLowerCase(),
          suggestedCode: alpha2,
          alreadyAdded: takenNames.has((name as string).toLowerCase()),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({ countries: catalog });
    } catch (error) {
      console.error("Error building country catalog:", error);
      res.status(500).json({ message: "Failed to build country catalog" });
    }
  });
}
