# `DELETE /api/users/me` — the full dependent list

Pre-implementation enumeration for fix 1. **Nothing has been changed.**

The bug class here is an incomplete cleanup list, so this list is derived
mechanically from `shared/schema.ts` — every `references(() => X.id)` parsed out
and closed transitively — rather than read off the code. 38 tables, 52 foreign
keys, 16 of them pointing at `users`.

---

## 1. Every FK that points at `users`, and what erasure must do with it

The 16 direct references split three ways, and the split is the whole design
question. In some rows the user is the **subject** — the row is about them. In
others the user is an **actor** — the row is somebody else's audit record that
happens to name who did it. Erasure must empty the first kind and must not
touch the second.

### 1a. Handled by the database already — nothing to write

| Table.column | Null? | `ON DELETE` | schema.ts |
|---|---|---|---|
| `password_reset_tokens.user_id` | NOT NULL | **CASCADE** | :89 |
| `organization_consents.performed_by` | nullable | **SET NULL** | :1559 |

`organization_consents` is deliberate and documented at `:1553-1558`: *"The FK is
a convenience for joins; the denormalised name and email are the identity. An
attestation that dissolves when its author leaves the school is not a record."*
See §5 — it has a consequence for what erasure can honestly claim.

### 1b. Subject rows — erasure MUST delete these

| Table.column | Null? | `ON DELETE` | Handled today? | schema.ts |
|---|---|---|---|---|
| `assessments.user_id` | nullable | NO ACTION | yes — :158 | :682 |
| `organization_members.user_id` | NOT NULL | NO ACTION | yes — :162 | :153 |
| `cvq_results.user_id` | **NOT NULL** | NO ACTION | **partial — see §3b** | :995 |
| `wef_competency_results.user_id` | nullable | NO ACTION | **NO — see §3a** | :402 |

And transitively, everything hanging off `assessments`:

| Table.column | Null? | `ON DELETE` | Handled today? | schema.ts |
|---|---|---|---|---|
| `llm_narrative_cache.assessment_id` | NOT NULL | **CASCADE** | automatic | :1960 |
| `recommendations.assessment_id` | NOT NULL | NO ACTION | yes — :152 | :743 |
| `assessment_quizzes.assessment_id` | NOT NULL | NO ACTION | yes — :147 | :902 |
| `quiz_responses.assessment_quiz_id` | NOT NULL | NO ACTION | yes — :145 | :944 |
| `cvq_results.assessment_id` | nullable | NO ACTION | yes — :141 | :994 |
| `wef_competency_results.assessment_id` | **NOT NULL** | NO ACTION | **NO — the bug** | :401 |

`quiz_responses.question_id -> quiz_questions` (:945, NO ACTION) is in the graph
but never blocks: the response rows are deleted, the shared question rows are
not touched.

### 1c. Actor rows — erasure must NOT delete these

These name the user as the person who *did* something in a record that belongs
to someone else. Deleting them would destroy a school's or the platform's audit
trail because a person left.

| Table.column | Null? | `ON DELETE` | Who this is | schema.ts |
|---|---|---|---|---|
| `organizations.admin_user_id` | NOT NULL | NO ACTION | org admin | :107 |
| `organization_events.performed_by` | NOT NULL | NO ACTION | admin / superadmin | :1449 |
| `organization_events.affected_user_id` | nullable | NO ACTION | **admins only** (4 sites) | :1455 |
| `files.uploaded_by` | NOT NULL | NO ACTION | superadmin only | :1392 |
| `contribution_submissions.submitted_by_user_id` | NOT NULL | NO ACTION | org admin only | :1780 |
| `contribution_submissions.reviewed_by_user_id` | nullable | NO ACTION | superadmin | :1800 |
| `contribution_rewards.awarded_by_user_id` | NOT NULL | NO ACTION | superadmin | :1848 |
| `scoring_config_change_log.changed_by` | NOT NULL | NO ACTION | superadmin | :1701 |
| `system_config.updated_by_user_id` | nullable | NO ACTION | superadmin | :1901 |
| `system_announcements.created_by_user_id` | NOT NULL | NO ACTION | superadmin | :1931 |

**None of these can be produced by a student**, which is why the fix below makes
student erasure work completely while leaving admin erasure explicitly refused
rather than silently broken. Verified per row, not assumed:

- `organization_events.affected_user_id` — 4 write sites, all in
  `superadmin.routes.ts` (:515, :577, :621, :917), all targeting an **admin**
  being added, removed, promoted, or created with the org. Never a student.
- `contribution_submissions` — gated by `checkOrgAdmin`
  (`contribution.routes.ts:165-200`), which 403s anything that is not an org
  admin. Students cannot contribute.
- `files.uploaded_by` — `POST /api/files/upload` is gated by `isAdmin`
  (`files.routes.ts:79`), which is **superadmin**, not org admin.
- The remaining five are superadmin-only surfaces.

---

## 2. What the code actually deletes today

`user.routes.ts:134-167`, in order:

```
per assessment:  cvq_results (by assessment_id)      :141
                 quiz_responses (by quiz id)          :145
                 assessment_quizzes (by assessment)   :147
                 recommendations (by assessment_id)   :152
                 assessments (by user_id)             :158
                 organization_members (by user_id)    :162
                 users (by id)                        :166
```

The import list at `user.routes.ts:5` is the shortest proof it is incomplete —
seven tables imported, and `wefCompetencyResults` is not among them.

---

## 3. The two confirmed failures

### 3a. `wef_competency_results` — the 500

`wef_competency_results.assessment_id` is `NOT NULL REFERENCES assessments(id)`
with `NO ACTION` (`:401`). Nothing deletes it. So `tx.delete(assessments)` at
`:158` raises `23503`, the transaction rolls back whole, and the handler returns
**500 "Failed to delete account"**.

It fires for anyone with a premium assessment:
`recommendations.routes.ts:137` calls `syncWEFSkillsProfile` when
`isPremiumAssessment(assessment.assessmentType)`, which writes the row via
`wefOrchestrator.ts:57` → `storage.upsertWefCompetencyResult` (`storage.ts:2179`).
School students are forced premium at `auth.routes.ts:53`. So **every school
student who has completed an assessment gets a 500 from the right-to-erasure
endpoint** — the exact population the CLAUDE.md escalation rule is written for,
on the exact route position 4 depends on.

> **Correcting the earlier consent recon.** `docs/consent-implementation-recon.md:131-134`
> states this route *"Works for an org student"* and lists what it
> "transactionally deletes". That claim is wrong, not merely stale — the
> `wef_competency_results` gap was present when it was written. Position 4's
> "the route exists; the door does not" is worse than recorded: the door is
> missing **and** the route behind it is broken for the students it is for.

### 3b. `cvq_results` with a null `assessment_id`

`cvq_results.assessment_id` is nullable (`:994`) while `cvq_results.user_id` is
`NOT NULL` with `NO ACTION` (`:995`). The erasure deletes cvq rows **by
`assessment_id` only** (`:141`), inside the per-assessment loop. A row with a
null `assessment_id` is never reached by that loop, survives, and then blocks
`tx.delete(users)` at `:166` with a second `23503`.

Narrower than 3a — it needs a cvq row that was written without an assessment —
but it is the same bug shape, and deleting by `user_id` closes it unconditionally.

---

## 4. Proposed sequence

Delete by `user_id` or by `inArray(assessmentIds)` throughout, rather than by
`assessment_id` inside a per-assessment loop. That is what makes the list
*complete by construction* instead of complete by inspection:

```
0.  assessmentIds = SELECT id FROM assessments WHERE user_id = $1   (inside tx)

1.  quiz_responses         WHERE assessment_quiz_id IN (
                             SELECT id FROM assessment_quizzes
                             WHERE assessment_id IN assessmentIds)
2.  assessment_quizzes     WHERE assessment_id IN assessmentIds
3.  recommendations        WHERE assessment_id IN assessmentIds
4.  cvq_results            WHERE user_id = $1        <-- was assessment_id (3b)
5.  wef_competency_results WHERE user_id = $1 OR assessment_id IN assessmentIds
                                                     <-- entirely new (3a)
6.  assessments            WHERE user_id = $1        (llm_narrative_cache CASCADEs)
7.  organization_members   WHERE user_id = $1
8.  users                  WHERE id = $1             (password_reset_tokens CASCADEs)
```

Step 5 needs both predicates: `user_id` is nullable and is null for rows written
while the assessment was still a guest assessment, so a `user_id`-only delete
would miss exactly the rows a guest-then-registered student accumulated.

Two implementation notes on the existing code:

- `:143` calls `storage.getAssessmentQuizByAssessmentId(...)` **inside** the
  transaction. That read goes through `db`, not `tx`, so it runs on a different
  connection and outside the transaction's snapshot. Harmless today because
  nothing concurrent races it, but it is why step 1 should use a subquery on
  `tx` instead.
- The loop issues 4 statements per assessment. The sequence above is 8 total
  regardless of assessment count.

**Role scope.** Steps 1-8 make erasure complete for students, guests-turned-users
and ordinary individual accounts. They do **not** make it work for an org admin
or superadmin, because of the §1c actor rows — `organizations.admin_user_id` and
`organization_events.performed_by` are both `NOT NULL` with `NO ACTION` and
cannot be nulled without a schema change. I propose an explicit **409 naming
which audit records block it**, rather than a 500 from Postgres. Deleting a
school's audit trail because its admin exercised erasure is not something to do
as a side effect, and it is a different decision from this one.

---

## 5. What erasure will still not erase — and should say so

After a successful erasure, `organization_consents` retains
`performed_by_name` and `performed_by_email` (`:1561-1562`, both `NOT NULL`), by
explicit design (`:1553-1558`). For a **student** this is empty — students never
attest. For an **org admin** it means their name and email survive their own
erasure request. The schema comment at `:1533-1540` already names this as an
accepted retention decision to revisit against a retention schedule; it is not a
bug, but it is a limit the endpoint should not pretend it does not have. The
current response says *"Account and all associated data have been permanently
deleted"* (`:183`), which for an org admin would be untrue.

---

## 6. Two adjacent issues I am not folding into this commit

**The licence seat leak.** The admin member-delete paths decrement the school's
quota — `admin.routes.ts:1158` (`-1`) and `:1233` (`-deletedCount`).
`DELETE /api/users/me` deletes the `organization_members` row and never touches
the counter, so a student who erases their account permanently burns one of the
school's seats. Already recorded at `docs/consent-implementation-recon.md:155-159`;
I re-verified it (line numbers have moved from that recon's `:1136`, the claim
holds). It belongs in fix 2 with the removal path, not here.

**`GET /api/users/me/export` has the symmetric gap.** It exports assessments,
recommendations, quiz responses and cvq results (`:40-105`) but **not**
`wef_competency_results` and **not** the `organization_members` row — which is
where the school-recorded `student_name`, `date_of_birth`, `grade`,
`student_gender` and `student_id` live. Same incomplete-list bug class, opposite
direction: subject access returns less than it holds. CLAUDE.md 1e asks about
export and deletion together, so flagging it; not in scope for this commit.

---

## 7. Verification plan for the commit

No test runner gap — `vitest` is configured (`package.json`, `vitest.config.ts`)
and route-level tests already exist beside the routes. Smoke test asserting:

1. a user with a **premium** assessment (so a `wef_competency_results` row
   exists) is fully deleted and the endpoint returns 200 — this is the
   regression test for 3a and fails against current `main`
2. a `cvq_results` row with a null `assessment_id` does not survive — 3b
3. every table in §1b holds zero rows for that user afterwards
4. an org admin gets a 409 naming the blocking records, not a 500
