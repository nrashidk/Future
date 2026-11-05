# Future Path — end-to-end test plan

**Scope:** every role, every page, every flow that can be exercised through the UI.
**Audience:** you, executing manually against a deployed environment.

Grounded in the code as of `384e097`: **24 client routes, 170 server endpoints, 5 roles.**
Where this plan asserts a behaviour, it was read in the source, not assumed — but
**a behaviour read in source is not a behaviour observed running.** That is the
whole point of executing this.

---

## How to use this

Work a role to completion before switching. Each test is `ID | what to do |
what should happen`. Record one of:

- **PASS** — did what it says
- **FAIL** — did something else (write what)
- **BLOCKED** — couldn't run it (write why)
- **N/A** — doesn't apply in your environment

**Test in both languages.** Arabic is not a translation layer over a working
English app; it is a second rendering with its own failure modes (RTL layout,
bidi digits, locale key resolution). A pass in English says nothing about
Arabic. Where a test is language-sensitive it is marked **[AR]** — run those
twice.

**Use staging, not production,** for anything destructive: bulk delete, account
deletion, org deletion. Production has real data.

---

## 0. Before you start — read this or you will waste a day

### 0.1 Known-undecided: the guest → save flow

The question of whether a 13–18 year old may self-consent is open. It determines
whether `/register` reopens as a free save-only account or stays retired.
**Sections 1.6–1.8 and 2.1 test a flow that is likely to change.** Run them to
record current behaviour, but don't raise bugs against them yet.

### 0.2 Known-unverified: migrations 026, 027, 028

`server/migrations/` holds `026_organization_deletions.sql`,
`027_child_profiles.sql` and `028_child_guardian_consents.sql`. **Whether your
environments have them applied has never been confirmed.** Check first:

```sql
SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 6;
```

If 026 is absent, **§5.7 (organization deletion) will fail inside its
transaction** and that failure is expected, not a new bug. Same for §4.4 if 028
is absent.

### 0.3 Known-current: Stripe is in test mode

Every payment test uses a test card. `4242 4242 4242 4242`, any future expiry,
any CVC. **Do not test with a real card.** A real charge in test mode is not
possible, but a real card in a live key is — confirm which keys the environment
carries before §2.3.

### 0.4 What you need before starting

| Need | For |
|---|---|
| A superadmin account (email in `SUPERADMIN_EMAILS`) | §5 |
| **Two** organizations, each with its own org_admin | §6 — cross-tenant tests need two |
| At least 2 students enrolled in each organization | §4, §6 |
| One parent-registered account with a paid child | §3 |
| A second browser or private window | §6 — two roles signed in at once |
| Access to the inbox for `support@futurepath.ae` | §7.3 |

**§6 cannot be run without two organizations.** It is the highest-value section
in this plan — minors' data crossing a school boundary is the worst failure this
product can have. Create the second org first.

---

## 1. Guest — no account, no school

The only role with no identity. A student arrives from a link or a search.

| ID | Do | Expect |
|---|---|---|
| G-01 | Open `/` | Landing renders; no console errors |
| G-02 | **[AR]** Switch language on `/` | Whole page flips RTL; nothing clipped at the right edge; no raw `i18n.key` strings anywhere |
| G-03 | Start the assessment from the landing CTA | Lands on `/assessment` at the demographics step |
| G-04 | On demographics, leave the consent box unticked and try to continue | Blocked. The tick is a real gate, not decoration |
| G-05 | Enter an age under 18 | A note appears about parental/institutional consent. **Record its exact wording** — §0.1 |
| G-06 | Complete demographics and continue | Subject step appears; grade and country are editable (guest, not school-locked) |
| G-07 | Pick 3 subjects, then 4, then 5 | Quiz length stays **15 questions** at every subject count |
| G-08 | **[AR]** Run the quiz in Arabic | Question text and all options render; no Latin-script leakage in question bodies; option order is not reversed illogically |
| G-09 | Abandon mid-quiz, close the tab, reopen the site | Guest session resumes or restarts cleanly — **record which**; neither is a bug, but an error page is |
| G-10 | Complete the assessment | Report renders with **2 career matches** (free tier) |
| G-11 | Read the expiry notice on the report | States a deletion date **72 hours** from completion. **[AR]** the date renders LTR-correct inside the Arabic sentence |
| G-12 | Check each match shows its reasoning | Subjects, interests and values that produced it are shown — not a bare score |
| G-13 | Click "Get the full PDF report" | Goes to `/tier-selection`; a back control exists and returns you to the report |
| G-14 | From `/tier-selection`, go back, then forward again | No dead end. You can always return to the report |
| G-15 | Use the recovery-email block: send yourself the link | Email arrives. **[AR]** in Arabic the email body is Arabic *including the brand* — `مسار المستقبل`, never `مسارات المستقبل` |
| G-16 | Open the recovery link in a different browser | The report opens, read-only, without a session |
| G-17 | Send the recovery email to a malformed address | Clear error, no crash, no silent success |
| G-18 | Open `/results` directly with no assessment | Does not 500; redirects or shows an empty state |
| G-19 | Open `/print/results` directly with no token | Refused. **This is a report about a minor — it must not render unauthenticated** |
| G-20 | Open `/admin`, `/superadmin`, `/analytics` as a guest | Each refuses or redirects to login. **None renders a shell with empty data** |

---

## 2. Guest converting to a paying parent

| ID | Do | Expect |
|---|---|---|
| C-01 | From the report, click "Create Account" | Goes to `/register/parent` — **record whether the wording promised something free** (§0.1) |
| C-02 | On `/register/parent`, check the page chrome | Page header present, language switcher present, back control at the **top** |
| C-03 | Submit the form empty | Per-field validation messages, all localised. **[AR]** no English leaking into Arabic errors |
| C-04 | Enter a password under 8 characters | Rejected with the minimum stated |
| C-05 | Enter mismatched password confirmations | Rejected |
| C-06 | Leave the child's name blank and read the consent attestation | The fallback reads naturally in the sentence — EN "my child", **[AR]** `طفلي`. It must be grammatical, since a parent reads it while deciding to tick |
| C-07 | Fill the child's name, re-read the attestation | The real name now appears in the sentence, both languages |
| C-08 | Submit with consent unticked | Blocked |
| C-09 | Complete registration | Lands on checkout; **the guest report is claimed to the new account** — verify it is still there after |
| C-10 | Complete payment with the test card | Payment succeeds; account becomes premium |
| C-11 | Re-run the assessment as the paid user | **5 career matches**, not 2 |
| C-12 | Check the premium report has RIASEC and CVQ sections | Both present; free report had neither |
| C-13 | Abandon checkout halfway, then sign in | Account exists but unpaid. A clear route back to payment, not a dead end |
| C-14 | With the unpaid account, try to start an assessment | The payment-required gate appears and reads as *reassurance*, not failure |
| C-15 | Register with an email that already has an account | Refused with a clear message. **It must not reveal whether that address exists** beyond what is unavoidable |

---

## 3. Parent-registered user

| ID | Do | Expect |
|---|---|---|
| P-01 | Sign in at `/login` | Lands signed in |
| P-02 | Open `/profile` | Shows the account and the child |
| P-03 | Open `/progress` | Shows the child's progress, no one else's |
| P-04 | Download the PDF report | PDF generates. **[AR]** Arabic PDF is RTL throughout, no reversed lines, no missing glyphs |
| P-05 | **[AR]** Check digits in the Arabic PDF | Dates, scores and percentages read correctly, not reversed |
| P-06 | Change your email in `/profile`, if offered | Change takes effect; **a notice goes to the old address** |
| P-07 | Request a password reset at `/forgot-password` | Email arrives. Response does **not** differ for a non-existent address |
| P-08 | Use the reset link | Password changes; link does **not** work a second time |
| P-09 | Use a reset link after its expiry | Refused clearly |
| P-10 | Open `/profile/delete-account` and read it | States what will be deleted before asking |
| P-11 | **(staging only)** Delete the account | Account, child, assessments, report and files all gone. **Verify in the DB, not just the UI** — this is the PDPL erasure path |
| P-12 | Request your data export, if offered | Returns the full record: profile, assessment answers, results, files |
| P-13 | Sign in with Google | Works if the account exists; **does not silently create an account** if it doesn't |
| P-14 | Sign in with Microsoft | Same |
| P-15 | Sign in with an OAuth address matching an existing local account | **Record exactly what happens.** Auto-linking by unverified email is a known concern |

---

## 4. School student

Created in bulk by a school admin. Never registers; never consents.

| ID | Do | Expect |
|---|---|---|
| S-01 | Sign in at `/login/student` with issued credentials | Signed in |
| S-02 | Start the assessment | **The school consent notice appears, naming the school** — not a tick-box. The student is notified, not asked |
| S-03 | **[AR]** Read that notice in Arabic | Names the school correctly; school name in Latin script sits correctly in the Arabic sentence |
| S-04 | Try to change grade | Locked. The locked-fields notice explains the school set it |
| S-05 | Try to change country or curriculum | Locked, same explanation |
| S-06 | Complete the assessment | Report renders at the tier the school's licence bought |
| S-07 | Open `/profile` | Shows own data only |
| S-08 | Open `/progress` | Shows own progress only |
| S-09 | **Change the student ID in the URL** on any `/api/...` call to another student in the same school | **403 or 404. Never another student's data.** This is the single most important test in this section |
| S-10 | Try `/admin` | Refused |
| S-11 | Try to delete own account | Either refused with an explanation (school owns it) or works cleanly — **record which**; a 500 is a bug |

---

## 5. Organization admin (school)

| ID | Do | Expect |
|---|---|---|
| O-01 | Sign in, open `/admin` | Dashboard renders scoped to your school |
| O-02 | Give organization consent, if not yet given | Recorded with the exact wording you saw. **[AR]** the Arabic attestation names `مسار المستقبل` |
| O-03 | Try to enrol a student **before** consent is given | Blocked. The consent gate fails closed |
| O-04 | Add a single student | Created; appears in the roster |
| O-05 | Bulk-upload a student CSV | Imported; the format panel matched what the file needed |
| O-06 | Bulk-upload a CSV with a bad row | Per-row errors; **good rows are not silently dropped** — confirm the count |
| O-07 | Bulk-upload a CSV with a missing date of birth | Rejected — DOB is NOT NULL for students |
| O-08 | Download student credentials | File downloads; contains only **your** students |
| O-09 | Edit a student | Saves; the promise the form makes about what changes is kept |
| O-10 | Export all reports | Only your school's students |
| O-11 | Export selected reports | **[AR]** the `({{count}})` renders with brackets the right way round in Arabic |
| O-12 | Select students with no completed assessment and export | Clear message, no empty file |
| O-13 | Open `/analytics` | Scoped to your school only |
| O-14 | Bulk-delete students **(staging)** | Deletes; the result names each student and its outcome, not a bare count |
| O-15 | Check licence counts after enrolling and deleting | Used licences reconcile. Reward/comp accounts consume none |
| O-16 | Try `/superadmin` | Refused |

---

## 6. Cross-tenant — the most important section

**Needs two organizations, A and B, each with its own admin and students.**
Sign in as **A's admin** throughout. Every test here is a 403/404 test.

| ID | Do | Expect |
|---|---|---|
| X-01 | Fetch B's organization by id | Refused |
| X-02 | Fetch a B student's profile by id | Refused |
| X-03 | Fetch a B student's assessment by id | Refused |
| X-04 | Fetch a B student's report/recommendations by id | Refused |
| X-05 | Download a B student's file by id | Refused |
| X-06 | Generate a share link for a B file | Refused |
| X-07 | Delete a B student | Refused |
| X-08 | Delete B's organization | Refused |
| X-09 | Edit a B student | Refused |
| X-10 | Export B's reports | Refused |
| X-11 | Request analytics with B's `organizationId` in the query | **Returns A's data or refuses — never B's.** Scoping must come from your session, not your query |
| X-12 | Request analytics with no org filter at all | Still A-scoped. Absence of a filter must not mean "all schools" |
| X-13 | Add a student to B | Refused |
| X-14 | Give consent on B's behalf | Refused |
| X-15 | Repeat X-02 … X-05 as a **student** of A against a student of B | Refused |

**Any PASS-as-success here — i.e. you actually see B's data — stops the
launch.** It is minors' personal data crossing a school boundary.

---

## 7. Superadmin

| ID | Do | Expect |
|---|---|---|
| A-01 | Sign in, open `/superadmin` | All 11 tabs render on one row at 1280px; wraps cleanly narrower |
| A-02 | **[AR]** Same in Arabic | Tabs RTL, order mirrored, nothing clipped |
| A-03 | Walk every tab | Each loads; no empty shell, no console error |
| A-04 | Check the six Add buttons (School, Users, Announcement, Career, Country, Subject) | Same size, same place, same behaviour. **[AR]** same in Arabic |
| A-05 | Add a school | Created |
| A-06 | Add users in bulk | Created; licences counted |
| A-07 | Change a user's email | Changes; **record whether the new address is asked to confirm** |
| A-08 | Try to change a user's email **to** an address in `SUPERADMIN_EMAILS` | **Refused (403).** This is a privilege-escalation gate |
| A-09 | Try to change a **superadmin's** email | Refused (403) |
| A-10 | Try to change an email to one already taken | Refused (409) |
| A-11 | Add a career, a country, a subject | Each created and visible to the right audience |
| A-12 | Open the Translation Manager and edit a string | **Known: returns 501.** Overrides are not persisted. Expected, not a bug |
| A-13 | Open the LLM prompt-template UI | Loads. **Confirm no API key is ever present in the page source or a network response** |
| A-14 | Delete an organization **(staging)** | Works — or fails on migration 026 per §0.2 |
| A-15 | View nationwide analytics | All schools, not one |

---

## 8. Cross-cutting

### 8.1 Bilingual [AR]

| ID | Do | Expect |
|---|---|---|
| B-01 | Visit every one of the 24 routes in Arabic | No raw `namespace.key` strings anywhere. This class of defect shipped undetected for six weeks once |
| B-02 | Switch language mid-assessment | Progress is kept; questions re-render in the new language |
| B-03 | Check every page with a number in a sentence | Digits read correctly, not reversed |
| B-04 | Check every email in Arabic | Body, subject **and brand** all Arabic |

### 8.2 Payment

| ID | Do | Expect |
|---|---|---|
| Y-01 | Pay with the test card | Succeeds; tier upgrades |
| Y-02 | Pay with a declining test card (`4000 0000 0000 0002`) | Fails cleanly; no account left half-upgraded |
| Y-03 | Close the tab mid-payment | No partial state |
| Y-04 | Group pricing for multiple students | Count and total match |
| Y-05 | Confirm the Stripe webhook fires and is signature-verified | Tier changes only via the webhook, never the client's word |

### 8.3 Email

| ID | Do | Expect |
|---|---|---|
| E-01 | Password reset | Arrives, from `noreply@futurepath.ae`, reply-to `support@futurepath.ae` |
| E-02 | Guest recovery | Arrives; link works; expires with the report |
| E-03 | Email-change notice | Arrives at the **old** address; new address masked |
| E-04 | Reply to any of them | Lands in the support inbox |
| E-05 | **[AR]** All four in Arabic | Sticky-note styling intact, RTL, correct brand |

### 8.4 Files

| ID | Do | Expect |
|---|---|---|
| F-01 | Upload each permitted type: `.csv .json .pdf .xls .xlsx .zip .txt` | All accepted |
| F-02 | Upload `.exe`, `.svg`, `.html` | Rejected. The allowlist checks **MIME type and extension**, so both must match — try a `.csv` renamed to `.exe` and an `.exe` renamed to `.csv`; **both must fail** |
| F-03 | Upload over **50 MB** | Rejected with the limit stated |
| F-04 | Upload a file named `../../etc/passwd` | Rejected or neutralised |
| F-05 | Create a share link and open it signed out | Works until expiry |
| F-06 | Open the share link after expiry | Refused |
| F-07 | Alter one character of a share token | Refused. Tokens must not be guessable or enumerable |

---

## 9. Record your results here

| Section | Run | Pass | Fail | Blocked |
|---|---|---|---|---|
| 1. Guest (20) | | | | |
| 2. Converting (15) | | | | |
| 3. Parent (15) | | | | |
| 4. Student (11) | | | | |
| 5. Org admin (16) | | | | |
| 6. **Cross-tenant (15)** | | | | |
| 7. Superadmin (15) | | | | |
| 8. Cross-cutting (23) | | | | |
| **Total (130)** | | | | |

**If you have limited time, run §6 first**, then §1, then §4. Those three cover
the failures that would matter most: minors' data crossing a school boundary, the
only flow a stranger can reach, and the population who cannot consent for
themselves.
