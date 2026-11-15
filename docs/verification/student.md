# Student — click verification (live site)

Standard (owner, 2026-11-14): only a click on futurepath.ae counts. Test High
School's student `salm.alktby` (Grade 11, two charged reports, repeat-blocked),
signed in by the owner. ✅ clicked and held · ❌ broken · 🔧 fixed and
re-clicked · ⚠️ works with a flaw · ⏸ not clicked (why)

| Item | Result | Date | Note |
|---|---|---|---|
| Home page signed in | ✅ | 2026-11-15 | only "Continue" (hero and closing section), one skip link |
| `/assessment` when the grade is already done | ✅ | 2026-11-15 | `screen-repeat-blocked`, "ask your school"; "View your report" opens the latest report |
| Report: no dollar figure, no unlock offer | ✅ | 2026-11-15 | |
| Report calls 20% scores "top strengths" | 🔧 | 2026-11-15 | "Your top strengths in English and Science" at 20% each, under "13% Room to Grow". One rule now (`shared/subjectStrength.ts`, 50%) for the page, the PDF and the next steps; the heading reads "Your Subject Results" / "نتائجك في المواد". Seen live, build `682615f`, English and Arabic |
| Report in Arabic | ✅ | 2026-11-15 | right-to-left, under 0.5% Latin letters on the page |
| PDF | ✅ | 2026-11-15 | 200, application/pdf, 1.23 MB, 8 pages (English) |
| Profile | ✅ | 2026-11-15 | "Your report for this grade is ready", no school balance, two Grade 11 reports, data export and deletion offered |
| Staff APIs refused | ✅ | 2026-11-15 | superadmin and school lists, review queue, gaps, invoices, question bank: 403 |
| Assessment form (Continue buttons, Arabic arrows, Arabic country card) | ⏸ | | needs the school to allow a repeat, which spends a licence |
| Another student's report refused | ⏸ | | needs another student's assessment id; last seen 2026-11-12 |
