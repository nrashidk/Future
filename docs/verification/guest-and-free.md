# Guest, then a free account from the guest report — click walk

Production, built-in browser, signed out. Build `d74823c`, 2026-11-15.

| Item | Result | Note |
|---|---|---|
| Home page signed out | ✅ | Get Started, Explore as Guest, For schools, "Create a free account for your child" |
| Guest step 1 | ✅ | grade only; under-18 note shown; Continue disabled until the terms box is ticked |
| Guest steps | ✅ | 6 steps (no personality or values; an interests step instead) |
| Quiz | ✅ | 15 questions; the marble question offers 5/14 and 15/56 (no duplicate value) |
| Free report | ✅ | 2 careers; PDF 403; no dollar figure; "This report will be deleted on 18/11/2026 unless you create an account to save it" |
| Strength wording, free report | ✅ | Mathematics 100% and English 60% named as strengths; Science 40% not |
| "Create Account" from the report | ✅ | opens `/register/parent` |
| Registration | ✅ | owner typed email, password and the two consents; the rest filled by me. It took ~25 s because the Free instance had slept and the click woke it (`startedAt` 10:40:59Z, account created 10:41:24Z) |
| Guest report moved to the account | ✅ | landed on the same report, now showing the child's name, age, grade, gender; deletion notice gone |
| Account state | ✅ | free `individual`, not premium, on no pool; confirmation due 2026-11-18T10:41Z |
| Banner | ✅ | "Confirm your email address — 3 days left, then the account is deleted", with Send again |
| Profile | ✅ | Free; "1 of 3"; one Grade 10 report, Free; data counts 1 / 2 / 1 / 15 |
| Superadmin's "unconfirmed" badge for this account | ⏸ | not looked at (needs a superadmin sign-in); seen on 2026-11-13 for an earlier account |
| ⚠️ Form controls | ⚠️ | on the registration form and the guest step 1, a click on the next control right after a dropdown only closes the dropdown; the tick or choice has to be made twice. Radix behaviour, not data loss. Flagged, not changed |

Left on production: "Nasser Walk Check" (child "ZZ Walk Child"), unconfirmed. It will be erased after 2026-11-18T10:41Z unless its link is opened.
