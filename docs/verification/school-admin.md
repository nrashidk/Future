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
| Export Students (CSV) | ✅ | 2026-11-16 | the button itself pressed: "Downloaded / Download started". Earlier (2026-11-15) its request read 200 text/csv, no password column. ⚠️ grade printed `grade11`, gender lowercase |
| Export All Reports | ✅ | 2026-11-15 | fetched: 200 zip, 1.6 MB, 4 PDFs (the 4 finished students) |
| Export Selected (no reports) | ✅ | 2026-11-15 | "None of the 2 selected students has a completed assessment" |
| Allow repeat, then withdraw | ✅ | 2026-11-15 | Khalid User: "Repeat allowed", then withdrawn, both toasts |
| View a student's report | ✅ | 2026-11-15 | "Administrator view: Khalid's report", no unlock offer, no $; PDF 200, 8 pages. ⚠️ report says age 15, roster says 17 |
| Bulk reset passwords | ⚠️ | 2026-11-15 | works (2 succeeded) but runs on ONE click with no confirmation; the superadmin's version asks first |
| Delete one student permanently | ✅ | 2026-11-15 | roster 9 -> 8... -> back to 8 |
| Delete selected permanently | ⚠️ | 2026-11-15 | works; but "Keep account & report" is offered, and is the PRIMARY button, when 0 of 2 have a report |
| Edit school details (rename, restore) | ✅ | 2026-11-15 | renamed and back, toast each time |
| Logo upload | ✅ | 2026-11-16 | owner said replace the testing logo. Edit Details -> Upload -> a PNG: "Logo uploaded successfully", preview and header changed at once; Update School -> "School updated successfully"; `/api/my-organization` carries the new URL, which serves the image, and the OLD file now answers AccessDenied from the bucket (deleted, as the note warned). ⚠️ Seen once and not reproduced: the first time the dialog was opened, at the moment a deploy restarted the server, Country was empty and it said "This country has no curricula configured", with Update School disabled; after a reload it showed UAE / MOE National correctly |
| Top-up quote | ✅ | 2026-11-15 | 100 = AED 3,600, AED 36 each, 10% off; Pay online (test mode) and Request invoice offered. Payment itself walked 2026-11-14 |
| New question submission | ✅ | 2026-11-15 | one Science Grade 9 question; empty Add says "Please enter a question"; check ran, row went "Pending LLM Check" -> "Peer review". ⚠️ "Submit 1 Questions" |
| See reviewer feedback on "Needs Changes" | 🔧 | 2026-11-15 | built; live: the feedback page, then Fix and send again -> pending -> the check passed it to peer review |
| Peer review other schools' questions | 🔧 | 2026-11-15 | built; Test High School's card reads "Nothing to review right now" (its own work is never offered). As UAQ School's admin: card showed 2 waiting, Start reviewing opened Test High School's Grade 10 Maths with no school name on the page; Submit stays disabled until a vote is chosen, and for Reject until a comment is typed; Approve -> "Vote recorded", the queue moved on to the 1 left; a second vote on the same submission answered 409 `ALREADY_REVIEWED` |
| A school with no curriculum (AD School) | 🔧 | 2026-11-15 | AD School has country UAE, curriculum EMPTY, no consent. My School says only "record consent"; nothing says the curriculum is missing. "What to write next" and "Review other schools" are silently absent (both routes answer 409 `SCHOOL_SETUP_REQUIRED`), and New Submission opens a form with an empty subject list and no explanation. The only fix is inside Edit Details, which nothing points to |
| Peer vote settles a submission (AD School, second Approve) | 🔧 | 2026-11-15 | "Vote recorded / Your vote settled it"; but the approved questions were NOT added to the bank (bug). Fixed + migration 047: Maths Grade 10 went 7 -> 9 live |
| Author's view after peer approval (Test High School) | 🔧 | 2026-11-15 | list: both submissions "Approved · In the question bank" (Maths G10 9, Science G9 11 in the gaps grid); feedback page shows "Reviewer 1 · Approved / Reviewer 2 · Approved", no school named. It still showed the old "Please fix and resubmit" under the reviewer's-note heading; now titled as an earlier note (build `97d190a`, seen live) |
| Sign-in page address and wording | 🔧 | 2026-11-15 | was `/login/student`, titled "Student Login", for every role; now `/login/password`, "Sign in", old address redirects |
| Question gaps ("what to write next") | 🔧 | 2026-11-15 | built; live 18 thin / 12 healthy; Write opens a submission for that cell |
| Submission form asks country and curriculum | 🔧 | 2026-11-15 | no longer asks; live: "Questions go to your school's curriculum: MOE National" |
| Roster status filter | ⚠️ | 2026-11-15 | "Completed" still lists the School Administrator row |
| Analytics | ⚠️ | 2026-11-15 | "5 students assessed" beside 40% = 4 of 10 (5 counts reports, salm has two); every sector "5 students / 66.6%"; "1 recommendations" |
| Profile | ⚠️ | 2026-11-15 | figures right; button still says "Go to Admin Dashboard" |
| Arabic | ⚠️ | 2026-11-15 | My School is Arabic and RTL; but there is NO language switch on My School or Analytics (only Profile); the consent card keeps "(Last updated: 6 April 2026)" in English and a year-first date |
| Row icon buttons | ⚠️ | 2026-11-15 | edit / reset / delete have no label or tooltip (the repeat button has one) |
| Record consent again | ⏸ | | your legal attestation; left for you |

## 2026-11-18, build `403fdd0`

| Item | Result | Note |
|---|---|---|
| Analytics "students assessed" | 🔧 | 8 -> 5 (counted reports, now students) |
| Analytics "1 recommendations" | 🔧 | "1 recommendation" |
| Language switch on My School / Analytics | 🔧 | toggles Arabic and back |
| Students CSV | 🔧 | "Grade 10", "Male", 17/11/2026 |
| Row icon labels | 🔧 | Edit Student / Reset Password / Delete Student |
| Bulk reset asks first | ✅ | opened and cancelled ("2 account(s)") |
| Bulk delete, nobody with a report | 🔧 | "Keep account & report" muted; cancelled |
| Completed filter | ✅ | 5 students, no admin |
| Profile button | 🔧 | "Go to My School" |
| Report age 15 vs roster 17 (Khalid) | not a bug | report keeps the age stored in June; DOB edited in September |
| Every sector the same count | ⏸ | needs a definition |
