# School admin — click verification (live site)

Standard (owner, 2026-11-14): only a click on futurepath.ae counts. Test High
School's admin, signed in by the owner. ✅ clicked and held · ❌ broken ·
🔧 fixed and re-clicked · ⚠️ works with a flaw · ⏸ not clicked (why)

| Item | Result | Date | Note |
|---|---|---|---|
| Add Student: empty form refused | ✅ | 2026-11-15 | browser's own required-field message |
| Add Student: created, username readable, age shown | ✅ | 2026-11-15 | `zz.clickstudent`, Female, 16, Grade 10, Not Active; roster 8 -> 9 |
| Edit student (grade, student ID) | ✅ | 2026-11-15 | Grade 10 -> 11, ID set, toast "Student updated" |
| Reset password (one student) | ✅ | 2026-11-15 | complexity choice, then the new credentials once |
| Bulk upload CSV (2 good, 1 bad date) | ✅ | 2026-11-15 | 2 created, Arabic "أنثى" stored Female, bad row named with its reason. This is `/members/bulk`, the only CSV path left |
| Export Students (CSV) | ✅ | 2026-11-15 | fetched the button's own request: 200 text/csv, no password column. ⚠️ grade printed `grade11`, gender lowercase. Button not clicked (would download to your computer) |
| Export All Reports | ✅ | 2026-11-15 | fetched: 200 zip, 1.6 MB, 4 PDFs (the 4 finished students) |
| Export Selected (no reports) | ✅ | 2026-11-15 | "None of the 2 selected students has a completed assessment" |
| Allow repeat, then withdraw | ✅ | 2026-11-15 | Khalid User: "Repeat allowed", then withdrawn, both toasts |
| View a student's report | ✅ | 2026-11-15 | "Administrator view: Khalid's report", no unlock offer, no $; PDF 200, 8 pages. ⚠️ report says age 15, roster says 17 |
| Bulk reset passwords | ⚠️ | 2026-11-15 | works (2 succeeded) but runs on ONE click with no confirmation; the superadmin's version asks first |
| Delete one student permanently | ✅ | 2026-11-15 | roster 9 -> 8... -> back to 8 |
| Delete selected permanently | ⚠️ | 2026-11-15 | works; but "Keep account & report" is offered, and is the PRIMARY button, when 0 of 2 have a report |
| Edit school details (rename, restore) | ✅ | 2026-11-15 | renamed and back, toast each time |
| Logo upload | ⏸ | | uploading replaces and DELETES the current logo file; not done without a spare logo to put back |
| Top-up quote | ✅ | 2026-11-15 | 100 = AED 3,600, AED 36 each, 10% off; Pay online (test mode) and Request invoice offered. Payment itself walked 2026-11-14 |
| New question submission | ✅ | 2026-11-15 | one Science Grade 9 question; empty Add says "Please enter a question"; check ran, row went "Pending LLM Check" -> "Peer review". ⚠️ "Submit 1 Questions" |
| See reviewer feedback on "Needs Changes" | ❌ | 2026-11-15 | no screen shows it; `GET /api/contributions/:id/feedback` exists and nothing calls it; no way to amend and resend |
| Peer review other schools' questions | ❌ | 2026-11-15 | no screen at all: `/review-queue` and `/review/:id` have no caller. Peer review cannot happen in the product |
| Question gaps ("what to write next") | ❌ | 2026-11-15 | `/api/contributions/gaps` has no caller |
| Submission form asks country and curriculum | ⚠️ | 2026-11-15 | they are the school's own; the server refuses others, the form should not ask |
| Roster status filter | ⚠️ | 2026-11-15 | "Completed" still lists the School Administrator row |
| Analytics | ⚠️ | 2026-11-15 | "5 students assessed" beside 40% = 4 of 10 (5 counts reports, salm has two); every sector "5 students / 66.6%"; "1 recommendations" |
| Profile | ⚠️ | 2026-11-15 | figures right; button still says "Go to Admin Dashboard" |
| Arabic | ⚠️ | 2026-11-15 | My School is Arabic and RTL; but there is NO language switch on My School or Analytics (only Profile); the consent card keeps "(Last updated: 6 April 2026)" in English and a year-first date |
| Row icon buttons | ⚠️ | 2026-11-15 | edit / reset / delete have no label or tooltip (the repeat button has one) |
| Record consent again | ⏸ | | your legal attestation; left for you |
