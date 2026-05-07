# Question Banks — Contributor Guide

## Directory layout

```
server/questionBanks/
├── README.md          ← you are here
├── riasec.ts          ← RIASEC personality questions (shared, not country-specific)
└── uae/
    ├── index.ts       ← CountryQuestionBank entry point for UAE
    ├── mathematics.ts
    ├── science.ts
    ├── english.ts
    ├── arabic.ts
    ├── socialStudies.ts
    └── computerScience.ts
```

## Adding a new country

### 1 — Create the country directory and subject files

```
server/questionBanks/<countryCode>/
├── index.ts
└── <subject>.ts  (one file per subject)
```

### 2 — Set `curriculum` at the **bank level** (index.ts)

`flattenQuestionBank()` automatically propagates the bank-level `curriculum` value
into every question, so individual subject files do **not** need to repeat it.
Set it once, correctly, in `index.ts`:

```ts
// server/questionBanks/sa/index.ts
import type { CountryQuestionBank } from "../../../shared/questionTypes";
import { mathematics } from "./mathematics";

export const saQuestionBank: CountryQuestionBank = {
  countryId: "sa",           // must match the `id` in the countries DB table
  countryName: "Saudi Arabia",
  curriculum: "MOE National", // ← set the canonical CurriculumType value here
  subjects: [mathematics],
};
```

### 3 — Write subject files using SubjectQuestionBank

Required fields for every question (`QuizQuestionSeed`):

| Field           | Type                              | Notes                                          |
|-----------------|-----------------------------------|------------------------------------------------|
| `question`      | `string`                          | English question text                          |
| `questionType`  | `"multiple_choice"`               | only supported type currently                  |
| `options`       | `string[]`                        | at least 2 options; must contain `correctAnswer`|
| `correctAnswer` | `string`                          | must be one of the `options` values exactly    |
| `subject`       | `string`                          | should match `SubjectQuestionBank.subject`     |
| `grade`         | `GradeLevel`                      | `"8"` \| `"9"` \| `"10"` \| `"11"` \| `"12"` |
| `countryId`     | `string`                          | matches `CountryQuestionBank.countryId`        |
| `curriculum`    | `CurriculumType` *(optional)*     | omit it — bank-level value is always used at flatten time; include only if you want per-question validation |
| `topic`         | `string`                          | chapter / unit name                            |
| `difficulty`    | `"easy"` \| `"medium"` \| `"hard"` |                                               |
| `cognitiveLevel`| `"knowledge"` \| `"comprehension"` \| `"application"` \| `"analysis"` |  |

Optional Arabic translation fields:

| Field           | Type        | Notes                                         |
|-----------------|-------------|-----------------------------------------------|
| `questionAr`    | `string`    | Arabic translation of the question            |
| `optionsAr`     | `string[]`  | Arabic translations (same order as `options`) |
| `explanationAr` | `string`    | Arabic translation of explanation             |

Minimal subject file skeleton:

```ts
// server/questionBanks/sa/mathematics.ts
import type { SubjectQuestionBank } from "../../../shared/questionTypes";

export const mathematics: SubjectQuestionBank = {
  subject: "Mathematics",
  grades: {
    "8": [
      {
        question: "...",
        questionType: "multiple_choice",
        options: ["A", "B", "C", "D"],
        correctAnswer: "A",
        explanation: "...",
        subject: "Mathematics",
        grade: "8",
        countryId: "sa",
        curriculum: "MOE National",  // will be overridden by bank-level value
        topic: "Algebra - Linear Equations",
        difficulty: "easy",
        cognitiveLevel: "application",
      },
    ],
    "9":  [],
    "10": [],
    "11": [],
    "12": [],
  },
};
```

### 4 — Register the bank in the seeder (server/seed.ts)

Import your new bank alongside the UAE bank and add it to the seeding loop.
Run `validateQuestionBank()` and `checkCoverage()` from `shared/questionTypes`
to catch structural errors before committing.

### 5 — Aim for ≥ 6 questions per subject per grade

`checkCoverage()` warns when a grade has fewer than 4 questions. The quiz engine
picks questions randomly, so more questions = less repetition across sessions.

## CurriculumType values

See `KNOWN_CURRICULUM_TYPES` in `shared/questionTypes.ts` for the recognised list.
Add a new entry there when on-boarding a curriculum not yet listed.
