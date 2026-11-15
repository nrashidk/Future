# Paid individual — click walk

Account `ali.ali` (individual, premium, own pool). Production, built-in browser.

| Item | Result | Date | Note |
|---|---|---|---|
| All licences used | ✅ | 2026-11-15 | build `0dd3376`: `/assessment` shows "You've used all your assessments"; "View your reports" opens the latest report; "Request more assessments" is a mailto to support, not checkout |
| Old report (Grade 12, 12/11) | ✅ | 2026-11-15 | 5 careers, no dollar figure, no upgrade offer; scores 40/20/20 and nothing calls them strengths (AI text regenerated after the cache clear) |
| PDF of old report | ✅ | 2026-11-15 | 200, application/pdf, 1.21 MB, 8 pages |
| Data export | ✅ | 2026-11-15 | 200 JSON |
| Staff routes and another student's report refused | ✅ | 2026-11-15 | salm's assessment, PDF and quiz 403; superadmin students, prompts, invoices and my-organization 403 |
| Superadmin gives 3 licences | ✅ | 2026-11-15 | done by the owner from the Users tab; `/api/licenses/me` 0 -> 3 |
| Form: step 1 | ⚠️ | 2026-11-15 | age 45 accepted (flagged 2026-11-12, still open) |
| Form: subjects | ✅ | 2026-11-15 | Continue disabled at 2 subjects |
| Assessment created at step 4 | ✅ | 2026-11-15 | name, age, grade, subjects stored; type `basic` at creation, `premium` once the report is generated |
| Same-grade repeat warning | ⚠️ | 2026-11-15 | a second Grade 12 report was taken with no warning (known: an individual's grade is typed per assessment) |
| Quiz | ✅ | 2026-11-15 | 15 questions; OPEC question asked as history; stored Arabic 40%, Social Studies 100%, Computer Science 100% |
| Personality and values | ✅ | 2026-11-15 | 30 + 15 statements, "Continue to Personal Values" / "Continue"; ⚠️ each statement shows its theme or value name |
| Get My Report needs a strength | ✅ | 2026-11-15 | disabled until one is picked |
| Report generated, charged once | ✅ | 2026-11-15 | licences 3 -> 2; 5 careers |
| Strength wording, positive case | ✅ | 2026-11-15 | Social Studies and Computer Science (100%) called strengths in the vision sentence and the AI text; Arabic (40%) never |
| PDF of new report | ⚠️ | 2026-11-15 | first request 502 (Render gateway; server did not restart), retry 200, 1.21 MB, 7 pages in 38 s. Cause unknown, seen once |
| Profile figures | ✅ | 2026-11-15 | Purchased 6 / Used 4 / Remaining 2; four Premium reports listed; "Assessment details come from your latest assessment" |
| Stored grade format | ⚠️ | 2026-11-15 | the new row stores `grade12`, the three older rows `12` |
