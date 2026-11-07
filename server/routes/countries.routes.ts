import type { Express } from "express";
import { countryPricing, quotePrice, toMajor } from "@shared/pricing";
import { storage } from "../storage";
import { SUBJECT_IDS, subjectNameFor, gradeLabelFor } from "@shared/subjects";
import { createRequire } from "module";
import isoCountries from "i18n-iso-countries";

/**
 * THE LOCALE FILES ARE LOADED WITH require, NOT import. This matters and it
 * took production down to learn.
 *
 * `import isoEn from "i18n-iso-countries/langs/en.json"` type-checks, builds,
 * and runs in dev. It then crashes the deployed server at boot:
 *
 *   ERR_IMPORT_ATTRIBUTE_MISSING: Module ".../langs/en.json" needs an import
 *   attribute of "type: json"
 *
 * The server bundle is ESM built with esbuild --packages=external, so an
 * import of a file inside a dependency survives into dist/index.js as a bare
 * ESM import and is resolved by Node at boot. Node requires
 * `with { type: "json" }` on any ESM JSON import. Vite rewrites JSON imports
 * for the client, and tsx tolerates them in dev, so neither the typecheck nor
 * the local run shows it -- the failure only exists in the one place nothing
 * was exercising: `node dist/index.js`.
 *
 * createRequire sidesteps the whole question: CJS require has always loaded
 * JSON natively, needs no attribute, and is unaffected by how the file is
 * bundled.
 */
const require = createRequire(import.meta.url);
const isoEn = require("i18n-iso-countries/langs/en.json");
const isoAr = require("i18n-iso-countries/langs/ar.json");

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
  /**
   * WHAT A LICENCE COSTS IN A GIVEN COUNTRY — the quote the pricing page shows.
   *
   * Public and read-only: a school has no account when it is deciding whether
   * to buy, so this cannot sit behind a login.
   *
   * IT EXISTS SO THE PAGE DOES NOT CALCULATE THE PRICE ITSELF. The quote shown
   * and the amount charged now come from the same function reading the same
   * country row, instead of the client deriving one and the server deriving
   * the other — which is exactly how the volume tiers came to be written out
   * twice and agree only by luck.
   *
   * An unknown country is refused rather than quietly quoted in dollars, the
   * same as at checkout: a typo in a country id must not silently sell a UAE
   * school a dollar licence. A country with no price set DOES fall back, and
   * says so in `usesFallbackPrice`, because refusing there would block every
   * sale in a country nobody has priced yet.
   */
  /**
   * THE COUNTRIES A BUYER CAN PICK, for the pricing page's selector.
   *
   * Separate from /api/reference, which carries every country's curricula and
   * every curriculum's subjects and aliases — kilobytes of question-bank
   * structure that a pricing dropdown has no use for and an anonymous visitor
   * has no reason to receive.
   *
   * Both names, because the vocabulary is bilingual and the page may be read
   * in either. Inactive countries are excluded: a country that cannot run an
   * assessment must not be sellable.
   */
  app.get("/api/pricing/countries", async (_req, res) => {
    try {
      const all = await storage.getAllCountries();
      res.json({
        countries: all
          .filter((c: any) => c.isActive !== false)
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            nameAr: c.nameAr ?? null,
            currency: c.licenseCurrency ?? null,
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name)),
      });
    } catch (error) {
      console.error("Error listing countries for pricing:", error);
      res.status(500).json({ message: "Failed to list countries" });
    }
  });

  app.get("/api/pricing/quote", async (req, res) => {
    try {
      const studentCount = parseInt(String(req.query.students ?? "1"), 10);
      if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > 100000) {
        return res.status(400).json({ message: "Invalid student count", code: "INVALID_COUNT" });
      }

      const countryId = req.query.countryId ? String(req.query.countryId) : null;
      let country = null;
      if (countryId) {
        country = await storage.getCountryById(countryId);
        if (!country) {
          return res.status(400).json({ message: "Unknown country", code: "UNKNOWN_COUNTRY" });
        }
      }

      const { unitPriceMinor, currency, usedFallback } = countryPricing(country);
      const quote = quotePrice({ studentCount, unitPriceMinor, currency });

      res.json({
        countryId: country?.id ?? null,
        currency: quote.currency,
        // Minor units are authoritative; the major-unit figures are for
        // display only and are never what gets charged.
        unitPriceMinor: quote.unitPriceMinor,
        perStudentMinor: quote.perStudentMinor,
        totalMinor: quote.totalMinor,
        unitPrice: toMajor(quote.unitPriceMinor, quote.currency),
        perStudent: toMajor(quote.perStudentMinor, quote.currency),
        total: toMajor(quote.totalMinor, quote.currency),
        discountPercent: quote.discountPercent,
        studentCount: quote.studentCount,
        // Visible, not silent: a live country transacting in dollars is
        // otherwise only noticed on a receipt.
        usesFallbackPrice: usedFallback,
      });
    } catch (error) {
      console.error("Error quoting licence price:", error);
      res.status(500).json({ message: "Failed to quote price" });
    }
  });

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
