# Phase 5 recon — the guest → account claim

Read-only pass. Nothing changed. Verified against HEAD `287cc2e` (2026-09-08), after this
session's commits. Line numbers are current.

**Headline: FOLLOWUP's stated cause is wrong, and has been for some time.** FOLLOWUP.md:1121
records the defect as "guest->account migration broken (guestSessionId never stored)". The
server stores it — `assessment.routes.ts:319`, `guestSessionId: guestToken`, on every guest
assessment insert. The break is entirely client-side and is a different, more structural
problem than a missing write.

---

## 1. Guest lifecycle

### Creation

A guest reaches `/assessment?guest=true` (Landing CTAs; `Assessment.tsx:435-440` sets `isGuest`
from the query param, gated on `!isAuthenticated`). No row exists yet — steps 1–3 are React
state only.

On leaving Subjects (step 3), `handleNext` POSTs `/api/assessments`
(`Assessment.tsx:629`, `needsSaveBeforeQuiz`). Server side:

| Step | Location |
|---|---|
| `userId = req.isAuthenticated() ? req.user.userId : null`; `isGuest = !userId` | `assessment.routes.ts:180-183` |
| Token minted: `` `guest_${Date.now()}_${randomBytes(16).toString('hex')}` `` | `:186` |
| Persisted to the row as `guestSessionId` | `:319` |
| Set as an httpOnly cookie | `:326-333` |
| Deliberately **not** returned in the response body | `:335` (comment) |

The token is 16 bytes of `crypto.randomBytes` hex with a millisecond prefix — a real CSPRNG,
so replit.md's "cryptographic guest tokens" claim holds for generation.

Cookie flags: `httpOnly: true`, `secure` in production, `sameSite: "strict"`, `path: "/"`,
`maxAge: 7 * 24 * 60 * 60 * 1000`.

### Where guest state lives client-side

| Store | Key | Written at | Survives reload | New tab | Browser restart |
|---|---|---|---|---|---|
| Cookie (httpOnly) | `guest_token` | `assessment.routes.ts:326` | yes | yes | **yes, 7 days** |
| localStorage | `guestAssessments` | `Results.tsx:372-376` | yes | yes | yes |
| sessionStorage | `assessment_draft_*` | `Assessment.tsx:437` | yes | **no** | **no** |
| localStorage | `guestSessionId` | **NEVER WRITTEN** | — | — | — |

That last row is the whole bug. `guestSessionId` is read at `AuthCallback.tsx:39` and removed
at `:54`, and **no code anywhere in `client/` ever calls `setItem` for it**
(`grep -rn "guestSessionId" client/src` returns only those reads plus the removal).

The draft is the shortest-lived of the four and is irrelevant to the claim — it carries
in-progress form state, not identity. The cookie is what identifies a guest, and it is the
most durable of the three that exist.

---

## 2. The claim path

### The endpoint

`POST /api/assessments/migrate` — `assessment.routes.ts:651-674`, behind `isAuthenticated`.

```
const { guestAssessmentIds, guestSessionId } = req.body;      // :653
if (!Array.isArray(guestAssessmentIds) || !length) 400        // :656
if (!guestSessionId) return 400 "Guest session ID required"   // :660-662
storage.migrateGuestAssessments(ids, userId, guestSessionId)  // :664
```

`storage.migrateGuestAssessments` (`storage.ts:997-1020`) loops the ids and re-verifies each
one server-side before claiming it:

```
if (assessment && !assessment.userId && assessment.guestSessionId === guestSessionId)
  → set userId
```

**The server side of this is sound.** It is not vulnerable to the account-takeover shape the
audit brief worried about: it never trusts a client-supplied user id, it refuses an assessment
that already has an owner (`!assessment.userId`), and it requires the presented session id to
match the stored one. A guest cannot inject data into someone else's account through it.

### Every caller — both broken, for different reasons

There are exactly two, both client-side.

**Caller A — `AuthCallback.tsx:38-58`. Never fires.**

```js
const guestAssessmentIds = JSON.parse(localStorage.getItem("guestAssessments") || "[]");
const guestSessionId = localStorage.getItem("guestSessionId");   // always null
if (guestAssessmentIds.length > 0 && guestSessionId) {           // always false
```

`guestSessionId` is never written, so the condition is never true and the POST is never sent.
Control falls through to `:60`, `else if (guestAssessmentIds.length > 0) setLocation("/results")`
— so the user is redirected to the report as though something had happened, with no claim made
and no error shown.

**Caller B — `Results.tsx:381-393`. Dead code, and would 400.**

`migrateMutation` is declared and **never invoked** — `grep -n migrateMutation Results.tsx`
returns only line 381, the declaration. There is no `.mutate()` anywhere. Even if something
called it, `:384` sends `{ guestAssessmentIds }` with no `guestSessionId`, which the server
rejects at `:660` with a 400.

### The structural contradiction

The endpoint requires the client to send the guest session id. The client is **structurally
forbidden from knowing it**: the token is set `httpOnly` (`:327`) and deliberately withheld
from the response body (`:335`, "Return assessment without exposing guest token in response
body"). Both are correct security decisions — an httpOnly token cannot be stolen by XSS.

So this is not a missing `setItem`. The contract is unsatisfiable as written: an endpoint that
demands proof the caller cannot hold. The fix is to stop asking for it — the browser already
sends `guest_token` on every request as a cookie, and `req.cookies.guest_token` is what every
other guest-authorized route reads (`assessment.routes.ts:385`, `:433`,
`recommendations.routes.ts:196`). The migrate route is the only guest path in the codebase that
looks in the body instead.

---

## 3. What "Create Free Account" does today

The button is `Results.tsx:1303`, shown only when `!isAuthenticated` (`:1295`), under the copy
"Save Your Results! / Create an account to save your career recommendations and track your
progress" (`results.json` `saveResultsTitle` / `saveResultsDesc`).

End to end:

1. `handleSignUp` (`Results.tsx:441-444`) → `window.location.href = "/api/login?returnTo=/results"`.
   Its own comment says "Trigger migration after sign-up".
2. `server/auth.ts:269-271` — `app.get("/api/login", (req,res) => res.redirect("/login"))`.
   **`returnTo` is read by nothing and silently dropped.**
3. The guest lands on the **login** page. They clicked "Create Free Account" and arrived at a
   sign-in form; they must find the register link themselves.
4. If they do register: `POST /api/register` (`auth.ts:320-366`) creates the user with
   `accountType: "public"` and calls `req.logIn(...)`. It does not touch guest state at all —
   `grep -n guest server/auth.ts` returns nothing.
5. `Register.tsx:70` → `setLocation("/auth/callback")` → Caller A above → claim skipped →
   redirect to `/results`.

### Does the assessment and its report survive the signup?

**The report stays visible. The assessment is never attached to the account.** These are
different things, and the first one hides the second.

At `/results`, now authenticated, `GET /api/recommendations` with no `assessmentId`:

- `recommendations.routes.ts:196` reads `req.cookies.guest_token` — still present, 7-day cookie,
  unaffected by logging in.
- `:202-208` resolves the guest assessment from it via `getAssessmentByGuestToken`
  (`storage.ts:979`).
- The ownership gate at `:230-238`: `assessment.userId` is still **null**, so it takes the guest
  branch — `owns = !!guestToken && guestToken === assessment.guestSessionId` → **true**.

So the newly registered user sees their full report — authorized as a *guest*, not as its
owner. What follows from that:

- `GET /api/assessments/my` (`assessment.routes.ts:346-353`) filters on `userId` → returns `[]`.
  The Profile shows no assessments. The report is not listed anywhere in the account.
- When the cookie expires (7 days from creation, not from signup) the report becomes
  permanently unreachable.
- On any other device or browser, or after clearing cookies, it is gone immediately.
- The row is then **orphaned forever**: `userId` null, `guestSessionId` set to a token nobody
  holds. No code path can ever claim it — `migrateGuestAssessments` requires the token, and the
  only copy was in a cookie that no longer exists.

**Definite answer to the open question in FOLLOWUP: no, it does not survive.** It appears to
for up to seven days, which is worse than an obvious failure — the user has every reason to
believe it saved, and no warning before it disappears.

---

## 4. Interaction with 1b3154b (the banner gating)

The claim depends on **the cookie**, plus the localStorage id list. It does not depend on the
sessionStorage draft at all.

| Artefact | Needed for the claim? | Survives a full-page redirect? |
|---|---|---|
| `guest_token` cookie | **Yes — it is the identity** | Yes. Cookies are unaffected by navigation; 7-day persistent |
| localStorage `guestAssessments` | Yes — it is the id list | Yes |
| localStorage `guestSessionId` | Yes, per the endpoint's contract | N/A — never exists |
| sessionStorage draft | No | Yes in the same tab, but irrelevant here |

**The redirect is not the problem.** `handleSaveAndLogin` and `handleSignUp` are both full-page
redirects, and both preserve everything the claim actually needs. React state is discarded, but
the claim never reads React state.

1b3154b gated the banner on `assessmentId`, i.e. on the POST having fired. That is the same
moment the guest row and its cookie come into existence — so the banner is now shown exactly
when a claim would have something to claim, and hidden when it would not. That alignment is
correct and was arrived at for a different reason (the draft not existing yet). It neither
helps nor hinders the claim, but it does mean the banner no longer promises to save progress
that has no server-side existence.

Worth noting the banner's promise is *still* only half true: from step 4 the data exists and
survives the redirect, but the claim that would bind it to an account never runs.

---

## 5. What is actually broken — precisely

There are **two independent breaks** on one path.

### Break 1 — the CTA goes to the wrong page (`auth.ts:269-271`)

*What the guest does:* finishes the assessment, reads the report, clicks "Create Free Account".
*What they expect:* a registration form.
*What happens:* `/api/login` redirects to `/login`, a sign-in form, and `?returnTo=/results` is
discarded. They must notice the register link and navigate there themselves.
*Where it breaks:* `server/auth.ts:270`. `res.redirect("/login")` ignores `req.query.returnTo`.

Small, self-contained, and independently fixable.

### Break 2 — the claim never runs (`AuthCallback.tsx:41`, `assessment.routes.ts:660`)

*What the guest does:* registers anyway.
*What they expect:* per the CTA copy, their recommendations are saved to the account and their
progress is tracked.
*What happens:* the account is created and logged in. `AuthCallback` reads a localStorage key
that nothing has ever written, so the migrate POST is never sent. They are redirected to
`/results`, where the report renders normally — because the guest cookie is still in the
browser and still authorizes the read. Nothing anywhere says the claim failed.
*Where it breaks:* `AuthCallback.tsx:39-41` reads `localStorage.getItem("guestSessionId")`,
which no code writes; and `assessment.routes.ts:660` requires that value in the request body,
which the client cannot supply because the token is httpOnly by design.

*When the user finds out:* not at signup. Either the first time they open Profile and see no
assessments, or up to seven days later when the cookie expires and the report vanishes. By
then the row is unclaimable.

### Not broken, contrary to FOLLOWUP

- `guestSessionId` **is** stored (`assessment.routes.ts:319`). FOLLOWUP.md:1121's stated cause
  is stale.
- The token **is** a CSPRNG value (`:186`), unguessable, 16 bytes.
- `storage.migrateGuestAssessments` (`storage.ts:997`) is correct and safe — it re-verifies
  ownership server-side, refuses already-owned assessments, and cannot be used to inject data
  into another user's account.
- The httpOnly cookie decision is right and should not be reverted to fix this.

---

## 6. Is free-account access the same concern?

**Related by symptom, independent in cause and in fix. FOLLOWUP couples them, and that coupling
is misleading.**

`Assessment.tsx:481-483`:

```js
if (!isLoading && isAuthenticated && !isPremiumFlow && !isGuest) {
  setLocation("/tier-selection");
}
```

A newly registered free account has `isPremiumFlow === false` (not premium, not an org student)
and `isGuest === false`, so it is bounced off `/assessment` to the tier-selection page. That is
FOLLOWUP item (7), "free-account user blocked from all assessments".

They compound into one user-visible outcome — a fresh free account has neither the assessment
it just did nor the ability to start another — which is presumably why the note pairs them. But:

- **Different mechanisms.** One is a missing claim after signup; the other is a routing guard
  that treats free accounts as ineligible.
- **Different fixes.** Fixing the claim does not unblock `/assessment`; unblocking `/assessment`
  does not attach the existing assessment.
- **Different risk.** The claim break destroys data a student already produced. The access block
  withholds a new action, and the assessment they lost is the one that matters.
- **Different decisions.** The claim is unambiguously a bug. Whether a free account may start an
  assessment is a product/pricing question — the guard's neighbouring comment
  (`Assessment.tsx:437-440`) records lifting it for free accounts as deliberate Phase 5 scope
  (Bug #7), not an oversight.

Fix the claim first and independently. It is the one that loses work.

---

## Suggested fix direction (not applied)

1. **Stop asking the client for the token.** Have `POST /api/assessments/migrate` read
   `req.cookies.guest_token`, matching every other guest-authorized route
   (`assessment.routes.ts:385`, `:433`, `recommendations.routes.ts:196`). The body then needs
   only `guestAssessmentIds`, which the client does have — and `Results.tsx:384` already sends
   exactly that shape. `storage.migrateGuestAssessments` needs no change; it already re-verifies.
2. **Drop the `guestSessionId` reads** at `AuthCallback.tsx:39/41/54` so the claim actually fires.
3. **Consider not needing the id list either.** `getAssessmentByGuestToken` (`storage.ts:979`)
   can find the rows from the cookie alone, which would make the claim work even when
   localStorage was cleared. That is a slightly larger change and a separate decision.
4. **Fix the CTA** (`auth.ts:270`) to honour `returnTo`, and point "Create Free Account" at the
   register page rather than the login page.
5. **Delete or wire up `migrateMutation`** (`Results.tsx:381`). As dead code it implies a
   second, working claim path that does not exist.
6. **Decide what happens to the cookie after a successful claim.** It should be cleared, or the
   ownership gate at `recommendations.routes.ts:230-238` will keep authorizing via the guest
   branch for a row that now has an owner.

Steps 1, 2 and 5 together are the actual bug fix and are small. Step 4 is cosmetic but is what
makes the flow reachable. Step 6 is a correctness detail that only matters once 1 works.
