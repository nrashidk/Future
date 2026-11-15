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
| Allowed repeat, from the school's roster | ✅ | 2026-11-15 | Test High School pressed the repeat button: toast and "Repeat allowed" on the row |
| Repeat warning, then the form | ✅ | 2026-11-15 | `screen-repeat-warning`; "Take it again anyway" opens the form; the new row was created at step 4 (the lock-out fix, first time seen for a school student) and `repeatBlocked` was true again at once |
| Country card in Arabic | ✅ | 2026-11-15 | "الإمارات العربية المتحدة" and "المنهاج الوطني (وزارة التربية والتعليم)", locked by the school. ⚠️ the vision name "UAE Centennial 2071" stays English |
| Arrows in Arabic | ✅ | 2026-11-15 | personality and values Next/Back arrows mirrored (`scale-x -1`); the country and subjects steps carry no arrows |
| Personality and values steps end in "Continue" | ✅ | 2026-11-15 | "المتابعة إلى القيم الشخصية" and "متابعة", not "Complete Assessment". ⚠️ each personality question still shows its theme ("( واقعي )") |
| Whole assessment through the form, Arabic | ✅ | 2026-11-15 | 3 subjects, 15 quiz questions, 30 personality, values, aspirations typed in Arabic, report generated; licences 47 -> 46 |
| New report wording, live | ✅ | 2026-11-15 | all three subjects at 20%: "ابنِ على مادة تحبها" (not "strength"), the generic vision sentence, heading "نتائجك في المواد"; under 0.4% Latin letters on the page |
| PDF of the new report (Arabic) | ✅ | 2026-11-15 | 200, 1.44 MB, 7 pages |
| No language switch inside the assessment form | ⚠️ | 2026-11-15 | the form has its own header; a student cannot change language mid-assessment |
| Another student's report refused | ⏸ | | needs another student's assessment id; last seen 2026-11-12 |
