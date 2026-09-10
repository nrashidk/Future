# Arabic review pack — every unreviewed string, in order of consequence

**For a native Emirati Arabic reader.** Work top to bottom; the order is what happens
if the Arabic is wrong, not where the strings live in the code.

Nothing here has been reviewed by an Arabic speaker. All of it ships today. Each
entry gives you where the string appears, the English it was written from, the
Arabic as it currently ships, and what it has to do — plus any check already
recorded against it, so you are not re-deriving questions someone already asked.

**You are not being asked to approve a translation in the abstract.** For most of
these the question is register and audience, not accuracy: whether a 14-year-old
reads it as plain speech, whether an administrator reads an attestation as
something *they* are asserting, whether a term matches what the same product calls
the same thing on another screen. Where the recorded question is that specific, it
is quoted.

**Read §6 before you start.** Five strings this week were correct as text and wrong
on screen. §6 says which of these have actually been seen rendered in Arabic and
which have only been read as text — for the second group, reading the words is not
enough to clear them.

Conventions: `{{like_this}}` is a value the app substitutes at runtime — a school
name, a number, a username. Where the substituted value can itself be Latin script
inside an Arabic sentence, that is called out, because it is the construction that
has broken twice.

---

## 1. The two attestations — legal weight, review these first

These are the only two strings in the product whose translation carries legal
weight rather than polish.

**Why they are first.** The attestation card posts the **exact rendered wording**
back to the server, which stores `attestationTextHash` — a hash pinning what the
administrator actually saw when they agreed. The mechanism is neutral about
meaning: **it pins wrong Arabic exactly as precisely as right Arabic.** If the
Arabic says something other than what the English says, the record does not fail —
it succeeds, and what it evidences is that a named administrator, on a date,
agreed to a sentence that does not say what we believe they agreed to. Every other
string in this pack costs clarity. These two cost the integrity of a consent
record for minors.

**Where it appears:** the school administrator opens their school in *Manage
Schools* and cannot add any student until this card is completed. Two checkboxes,
one submit. It is a one-time act, recorded against their name and the date
(`OrganizationConsentCard`, mounted above the student roster in
`AdminOrganizations`).

### 1.1 `orgs.consentGuardian` — the guardian-consent attestation

> **EN:** I attest that {{school}} holds parent or guardian consent for each student it enrols on this platform.
>
> **AR:** أُقرّ بأن {{school}} تملك موافقة وليّ الأمر لكل طالب تسجّله في هذه المنصة.

**Must convey:** an act of attestation *by the person ticking the box* — "I attest"
— and not a statement of fact about the world. The English is unambiguous about who
is asserting and that they are asserting it; the Arabic has to be equally
unambiguous. A reading that lands as "the school has consent" (a description) rather
than "I declare that the school has consent" (an undertaking) changes what the
record is evidence of.

**Recorded check:** whether `أُقرّ بأن` carries the force of a personal
attestation in the register a school administrator would recognise, or whether it
reads as neutral reportage.

**Also:** `{{school}}` is a school name that may itself be in Latin script inside
this Arabic sentence — see §6 on mixed runs.

### 1.2 `orgs.consentProcessing` — the data-processing consent

> **EN:** On behalf of {{school}}, I consent to Future Pathways processing the personal data of the students we enrol, as described in the Privacy Policy and Terms of Use.
>
> **AR:** نيابةً عن {{school}}، أوافق على قيام مسارات المستقبل بمعالجة البيانات الشخصية للطلبة الذين نسجّلهم، وفق ما هو موضّح في سياسة الخصوصية وشروط الاستخدام.

**Must convey:** consent given *on behalf of the school* by someone empowered to
give it, covering processing of students' personal data, bounded by the two named
documents.

**Recorded check, and it is specific:** the Arabic names the processing party as
`مسارات المستقبل` where the English says "Future Pathways". That is consistent with
the rest of the Arabic UI, but **this is the one sentence in the product where the
name identifies a legal party to an agreement.** It should be confirmed against the
Arabic legal documents and against however the entity is actually named in its
registration — not against the rest of the UI. If the legal documents use the
English name, or a different Arabic rendering, this sentence should match them and
not the interface.

Second check: `نيابةً عن` must clearly mean the administrator is acting *for* the
school, i.e. binding the institution and not themselves personally.

### 1.3 `orgs.consentGuardianHelp` — the fact that makes the attestation matter

> **EN:** The students are aged 13-18. Future Pathways does not contact parents directly and relies on this attestation.
>
> **AR:** تتراوح أعمار الطلبة بين 13 و18 عاماً. لا تتواصل مسارات المستقبل مع أولياء الأمور مباشرةً، وتعتمد على هذا الإقرار.

**Must convey:** that no one else will check. There is no parent-facing flow
anywhere in this product; this attestation is the entire consent chain for a minor's
data. This is the sentence an administrator is most likely to skim, so it has to
land on first read.

**Recorded check:** that `وتعتمد على هذا الإقرار` carries the weight of *reliance* —
"this is what we are going off" — rather than reading as a procedural footnote.

### 1.4 The rest of the consent card — same screen, ordinary weight

Composed from existing product vocabulary, but the composition is new and nobody has
read it rendered. Review as a block, for whether the card reads as one voice.

| key | EN | AR |
|---|---|---|
| `orgs.consentTitle` | Consent for the students you enrol | الموافقة على تسجيل الطلبة |
| `orgs.consentIntro` | Before you can add students, {{school}} needs to record its consent. This is a one-time act, recorded against your name and the date. | قبل إضافة الطلبة، يجب على {{school}} تسجيل موافقتها. هذا إجراء يُنفَّذ مرة واحدة، ويُسجَّل باسمك وتاريخه. |
| `orgs.consentSubmit` | Record consent | تسجيل الموافقة |
| `orgs.consentSubmitting` | Recording… | جارٍ التسجيل… |
| `orgs.consentBothRequired` | Both statements must be affirmed. | يجب تأكيد كلا الإقرارين. |
| `orgs.consentRecordedTitle` | Consent recorded | تم تسجيل الموافقة |
| `orgs.consentRecordedBy` | Recorded by {{name}} on {{date}} | سجّلها {{name}} بتاريخ {{date}} |
| `orgs.consentPolicyRef` | Against policy version {{version}} ({{lastUpdated}}) | وفق إصدار السياسة {{version}} ({{lastUpdated}}) |
| `orgs.consentDrift` | The Terms and Privacy Policy have changed since this was recorded. Your consent remains valid; you may record it again against the current documents. | تغيّرت شروط الاستخدام وسياسة الخصوصية منذ تسجيل هذه الموافقة. موافقتك ما زالت سارية، ويمكنك تسجيلها مجدداً وفق المستندات الحالية. |
| `orgs.consentReaffirm` | Record again | تسجيل الموافقة مجدداً |
| `orgs.consentUnavailable` | The legal documents could not be loaded, so consent cannot be recorded right now. Please contact support. | تعذّر تحميل المستندات القانونية، لذا لا يمكن تسجيل الموافقة حالياً. يرجى التواصل مع الدعم. |
| `orgs.consentError` | Could not record consent. Please try again. | تعذّر تسجيل الموافقة. يرجى المحاولة مرة أخرى. |
| `orgs.consentBlocked` | Add students after recording consent above. | أضِف الطلبة بعد تسجيل الموافقة أعلاه. |

Two notes on this block. `consentRecordedBy` and `consentPolicyRef` interpolate a
person's name, a date and a version string into Arabic sentences — mixed-run
candidates (§6). `consentDrift` has to say *your consent is still valid* without
implying either that it has lapsed or that re-recording is optional busywork.

---

## 2. Student-facing — a 13-18 year old reads these mid-assessment, with nobody to ask

Second in order because of who reads them and when. A student meets these alone, on
a screen, part-way through an assessment. There is no help channel. If the Arabic is
unclear the student's only options are to guess or to stop.

**Register bar for this whole section:** the English was written for a 13-18 year
old and the Arabic has to clear the same bar. Formally correct Arabic that reads as
officialese fails here even when every word is accurate.

### 2.1 The school consent notice — the moment a student learns they were not asked

**Where:** the Basic Info step of the assessment, shown to a student whose school
created their account. It is the only place in the product where a student is told
that someone agreed to terms for them.

> **EN (`consentOrgNotice`):** {{school}} set up this assessment for you and agreed to the terms on your behalf. You can read them here:
>
> **AR:** أعدّت {{school}} هذا التقييم لك ووافقت على الشروط نيابةً عنك. يمكنك الاطّلاع عليها هنا:

> **EN (`consentOrgNoticeGeneric`):** Your school set up this assessment for you and agreed to the terms on your behalf. You can read them here:
>
> **AR:** أعدّت مدرستك هذا التقييم لك ووافقت على الشروط نيابةً عنك. يمكنك الاطّلاع عليها هنا:

**Must convey:** that the student was not asked, plainly, without either hiding it
or alarming them. **`نيابةً عنك` ("on your behalf") is the load-bearing phrase** — it
is the part that tells them.

**Recorded check:** whether `نيابةً عنك` reads as *plain speech* or as *legalese* to
a school-age reader. That is the question, not whether the rendering is accurate —
it is accurate. If a 14-year-old skims past it because it sounds like paperwork, the
sentence has failed at its only job.

**Context worth having:** a previous key here, `consentOrg`, was **removed** rather
than reworded, because it asserted that the *student* had agreed. Any Arabic
rewording must not drift back toward implying the student consented.

**Also:** `{{school}}` may be a Latin-script school name inside this Arabic sentence
(§6).

### 2.2 The locked-fields notice — the only screen showing what the school recorded

**Where:** Basic Info step, under fields the student cannot edit because their
school filled them in.

> **EN (`demographics.schoolOwnedNote`):** Your school filled in your details. Please check they're correct — if anything's wrong, ask your school administrator.
>
> **AR:** أدخلت مدرستك بياناتك. تأكّد من صحتها — وإن كان أي منها خطأ، اطلب من مدير مدرستك تصحيحه.

**Must convey, and this is the highest-stakes student string in the pack:** the
**ask** — *check these are correct* — has to survive translation as an ask, not
soften into a statement. This is the only screen on which a student ever sees what
their school recorded about them. A wrong date of birth is otherwise **silent**: it
produces a wrong derived age on every assessment they ever take, and nothing else in
the product will catch it. An Arabic rendering along the lines of "your school
entered your details", with no request to check, removes the single opportunity to
catch that error.

Second: **the school administrator must remain named** as the person who fixes it.

Third, a constraint carried from the English: **nothing may read as an error or as
the student's fault.** Nothing they did is wrong.

**Recorded check, and a trap:** an earlier version of this string explained that the
age is derived from the date of birth the school holds. That clause was
**deliberately removed** — the "set by school" marker on the age field carries it,
and the string was too long for its screen. An Arabic rendering that helpfully
restores the explanation re-lengthens the exact string that was shortened. Also
note an older recorded instruction against this key is now **stale**: it asked a
reviewer to confirm the Arabic keeps a promise that "you can still set your own
age". That promise is false today — age is derived and the field is locked. Do not
restore it.

**Also, check the em-dash.** `— وإن كان` carries an English punctuation pattern; a
comma or a new clause may be the native construction between two RTL clauses, and a
dash between RTL clauses can render ambiguously depending on the font.

### 2.3 The country/curriculum lock — three more fields the student cannot touch

**Where:** the Country step, same assessment, one screen later.

| key | EN | AR |
|---|---|---|
| `country.setBySchoolTitle` | Set by your school | محدَّد من قِبل مدرستك |
| `country.schoolOwnedNote` | Your school chose the country and curriculum for everyone it enrols, so these are not yours to change. Ask your school administrator if either looks wrong. | اختارت مدرستك الدولة والمنهج لجميع طلابها، لذا لا يمكنك تغييرهما. اطلب من مدير مدرستك المراجعة إذا بدا أي منهما خطأ. |
| `country.notSetBySchool` | Not set | غير محدَّد |

**Must convey:** *why* the fields will not accept input. Without it the student sees
a form that appears broken and has no way to learn that their school set those
values or that the administrator is who changes one. Same constraint as above:
nothing may read as an error or as the student's fault.

### 2.4 The blocked-start screen — a student who cannot begin at all

**Where:** the entire screen a student gets instead of their assessment, when their
school has not entered their date of birth.

| key | EN | AR |
|---|---|---|
| `schoolDataIncomplete.title` | Your school needs to add your date of birth | تحتاج مدرستك إلى إضافة تاريخ ميلادك |
| `schoolDataIncomplete.body` | Before you can start, your school needs to add your date of birth to your student record. Ask your school administrator to add it, then come back and start your assessment. | قبل أن تبدأ، تحتاج مدرستك إلى إضافة تاريخ ميلادك إلى سجلك الدراسي. اطلب من مدير مدرستك إضافته، ثم عُد لبدء تقييمك. |

**Must convey:** what is missing, who fixes it, and that the student may come back.
This is the whole screen — there is nothing else on it. A student who cannot read it
sees a dead end.

**Explicit constraint:** **nothing may read as an error, a rejection, or the
student's fault.** Nothing they did is wrong; their school simply has not entered a
date yet. An Arabic rendering that lands as a failure has inverted the one thing this
copy is for.

### 2.5 The discarded-quiz notice — reassurance, not an apology

**Where:** the student returns to the quiz after changing their subjects and finds
their earlier answers gone.

> **EN:** Your subjects changed, so here's a fresh quiz to match them. The answers you had given were to questions about subjects you no longer picked, so they have not been kept.
>
> **AR:** تغيّرت موادك، لذا إليك اختبارًا جديدًا يناسبها. كانت إجاباتك السابقة عن أسئلة تخصّ مواد لم تعد مختارة، لذلك لم يتم الاحتفاظ بها.

**Must convey, and this is the whole job of the line:** that **nothing went wrong.**
A rebuilt quiz is the correct outcome of changing subjects, not an error. If the
Arabic reads as an apology or a warning it has failed even if every word is accurate.

**Recorded check — `موادك` must match the Subjects screen.** The student meets that
word first on the Subjects step, whose Arabic title is «ما المواد التي تحبها؟» and
whose stepper label is «المواد». If this notice calls them something else the
sentence stops being about the screen the student just came back from. Confirm
`المواد` is the right register here and not, say, `المقررات`.

*(A previously recorded check on an em-dash in this string no longer applies — it has
since been split into two sentences in both languages. Listed so you do not go
looking for it.)*

### 2.6 The student's own profile — provenance and plan

**Where:** `/profile`, read by a school student about themselves.

| key | EN | AR |
|---|---|---|
| `account.title` | My Information | معلوماتي |
| `details.studentName` | Student | الطالب |
| `details.sourceAssessment` | Assessment details come from your latest assessment. | تفاصيل التقييم مأخوذة من آخر تقييم لك. |
| `details.sourceSchool` | Assessment details come from your school's records. | تفاصيل التقييم مأخوذة من سجلات مدرستك. |
| `assessment.completedOf` | {{completed}} of {{cap}} | {{completed}} من {{cap}} |
| `premium.title` | Plan & Access | الخطة والوصول |
| `premium.access` | Access | الوصول |
| `premium.accessSchoolStudent` | School access | وصول عبر المدرسة |
| `premium.accessSchoolAdmin` | School account | حساب مدرسة |

**`الطالب` is the load-bearing one, and it renders in exactly one situation:** when
the account holder's name and the assessment subject's name differ — i.e. a guardian
registered the account for a child. The word must read as *"the person this
assessment is about"* and **not as a form of address to the reader**, because in that
case the reader is the parent, not the student. A gendered or vocative reading names
the wrong person on a page about a minor.

**`سجلات مدرستك`** — confirm `سجلات` is the right word for an *administrative record*
rather than an academic transcript, and that the sentence does not read as though the
school is grading them. It is a provenance note, not a judgement.

**`{{completed}} من {{cap}}`** — `من` is doing "of" in a ratio, not "from". Confirm
that reads as a count against a ceiling to a 13-year-old, and that the digits sit the
right way round in RTL (§6 — this is exactly the shape that failed on the landing
cards).

**`وصول عبر المدرسة` is the one to weigh.** It replaced a badge reading «مميز»
(Premium) with a crown, which told a 13-year-old they had bought something their
school bought for them. The Arabic must convey *your school provides this* **without
implying the student is a lesser tier** than a paying one. The English "School
access" is deliberately neutral, not a downgrade.

`الخطة والوصول` — confirm it reads as a section heading rather than a sentence
fragment, and that `الوصول` is the right noun for something a student *has* rather
than an action they perform. `حساب مدرسة` is shown to administrators — confirm it
describes the account type and is not read as a label for the school itself;
`حساب مدرسي` is the likely alternative and a native eye should pick between them.

### 2.7 The Career Journey's one-grade state

**Where:** `/progress`, reached by bookmark or typed URL when only one grade is
recorded (the profile button no longer offers it).

| key | EN | AR |
|---|---|---|
| `progress.oneGradeTitle` | One Grade Recorded So Far | صف واحد مسجّل حتى الآن |
| `progress.oneGradeDesc` | Your Career Journey compares your results from one grade to the next. You have one grade recorded, so there is nothing to compare yet. Take the assessment again in a later grade and this page will show how your direction changes. | تقارن رحلتك المهنية نتائجك من صف إلى الصف الذي يليه. لديك صف واحد مسجّل، لذا لا يوجد ما يُقارن بعد. أعد إجراء التقييم في صف لاحق وستُظهر هذه الصفحة كيف يتغيّر مسارك. |

**`oneGradeDesc` is the one to check** — three sentences of explanation rather than a
label. Two recorded questions: `من صف إلى الصف الذي يليه` is a literal rendering of
an English idiom and may be wordier than Arabic needs; and the closing clause promises
a future behaviour (`وستُظهر هذه الصفحة…`) whose tense should match how the rest of
this file addresses the student.

**Read it against `noProgressDesc` directly above it** in the same file — that is the
no-assessments state. A student sees one or the other, never both, so they should not
read as if written by different hands. `صف` is already the file's word for a school
grade, so that term at least is consistent.

### 2.8 Assessment History rows

**Where:** the assessment list on `/profile`.

| key | EN | AR |
|---|---|---|
| `assessment.latest` | Latest | الأحدث |
| `assessment.inProgress` | In progress | قيد التنفيذ |
| `assessment.gradeUnknown` | Grade not recorded | الصف غير مسجل |
| `assessment.continueThis` | Continue | متابعة |

**`continueThis` is the one to check, and it is a shortening rather than a
translation.** It replaced `continueAssessment` (`مواصلة التقييم`, "Continue Your
Assessment"), which was list-wide phrasing and wrong on a single row. `متابعة` is the
bare verbal noun — right for a button whose object is the card it sits on, but a
different register from the sentence it replaced. `مواصلة` may read better on a button
in this file's voice.

The other three are short labels. `الصف غير مسجل` is the only one that asserts
anything; it should agree with however the demographics block phrases a missing value.

### 2.9 The report's weight sentences — how a match was scored

**Where:** the results page and the PDF report, under each career match, explaining
how much each part of the assessment counted.

| key | EN | AR |
|---|---|---|
| `weightSubjects` | Your subject results count for {{pct}}% of this match. | تحتسب نتائج موادك بنسبة {{pct}}% من هذا التطابق. |
| `weightInterests` | Your interests count for {{pct}}% of this match. | تحتسب اهتماماتك بنسبة {{pct}}% من هذا التطابق. |
| `weightVision` | Your fit with national priorities counts for {{pct}}% of this match. | يحتسب توافقك مع الأولويات الوطنية بنسبة {{pct}}% من هذا التطابق. |
| `weightRiasec` | Your personality results count for {{pct}}% of this match. | تحتسب نتائج شخصيتك بنسبة {{pct}}% من هذا التطابق. |
| `weightCvq` | What you value at work counts for {{pct}}% of this match. | يحتسب ما تُقدّره في العمل بنسبة {{pct}}% من هذا التطابق. |
| `weightWefSkills` | Your future skills count for {{pct}}% of this match. | تحتسب مهاراتك المستقبلية بنسبة {{pct}}% من هذا التطابق. |
| `weightGeneric` | {{component}} counts for {{pct}}% of this match. | يحتسب {{component}} بنسبة {{pct}}% من هذا التطابق. |
| `careerConnectionWeight` | Across your matches, what you value counts for {{pct}}% of each score. | في جميع مطابقاتك، يحتسب ما تُقدّره بنسبة {{pct}}% من كل درجة. |
| `careerConnectionTitle` | How Your Values Shape Your Career Matches | كيف تُشكّل قيمك مطابقاتك المهنية |

**These are the least-reviewed strings in the pack.** They are not translations of an
existing string — they replaced `weightLabel` (`وزن {{pct}}%`), which was noun-first
and worked as a label but not as a clause. Every one of them is a **new sentence
construction** in Arabic.

**Read them as a set**, since a student sees several stacked under one match: the
seven should share one frame and one voice, and the verb agreement differs across
them (`تحتسب` / `يحتسب`) according to the subject — worth confirming each is right
for its own subject rather than copied across.

**`weightGeneric` has a known defect and is not yours to fix:** `{{component}}`
arrives as an **English** noun from the stored breakdown, so it renders an English
word inside this Arabic sentence. It only fires for components missing from the
display map (today: `marketDemand`), so it is rare rather than absent. Flag how bad
it looks; the fix is a code change, not a wording one.

### 2.10 The instrument name a student now reads instead of "RIASEC"

**Where:** the results page, describing what the personality section measured.

> **EN:** A 30-question career personality inventory that identifies the kinds of work you are naturally drawn to
>
> **AR:** استبيان الشخصية المهنية المكوّن من 30 سؤالاً، يحدد أنواع العمل التي تنجذب إليها بطبيعتك

This replaced `استبيان هولاند (RIASEC) المكوّن من 30 سؤالاً`, removing both the jargon
and a Latin-script break mid-Arabic-sentence.

**A recorded term question that spans two files, and it needs one decision:** the
pricing page calls the same instrument `مخزون الشخصية المهنية` — `مخزون` is
"inventory" in the *stock-of-goods* sense, not the psychometric one. This string uses
`استبيان` (questionnaire), which is likely the right register. **The product now
describes one instrument with two different nouns, one of them probably wrong.**
Please pick one for both surfaces:

| where | EN | AR |
|---|---|---|
| `results.featureLearningDesc` | …career personality inventory… | استبيان الشخصية المهنية |
| `pricing` `feature2` | Career personality inventory | مخزون الشخصية المهنية |
| `pricing` `feature4` | Personal values profile | ملف القيم الشخصية |

### 2.11 Report action steps that are NOT in the locale files

**Where:** the "الخطوات التالية / Next Steps" block of a student's report and PDF —
the payoff section.

> `أكمل {educationLevel}` — "Complete {the education level}"
>
> `طوّر مهاراتك في: {skills}` — "Develop your skills in: {skills}"

**These are hardcoded in TypeScript** (`server/services/freeNarrative.ts`), not in
`locales/ar/`. A reviewer working through the locale files will never see them, and
any future translation pass over those files will silently miss them.

**Two things for a native eye.** `أكمل` is imperative "complete" — correct before a
degree name, but the value it precedes is free text authored separately, so it may
not read correctly before everything that column holds. And the skills list joins on
the Arabic comma (`،`), which is right, but the list items come from a different
field whose own register was never checked against this sentence frame.

**Much larger body behind these two.** `server/services/premiumNarratives.ts` carries
**106** hand-written Arabic literals — the seven-step, three-grade-band action-step
templates — and `server/services/email.ts` carries a whole bilingual password-reset
email, subject and body. None of it has ever been in a review path. It is
student-facing content that reaches the report and the PDF. **Not included string by
string in this pack** — it needs its own session, and knowing it exists is the point
of this entry.

---

## 3. Admin-facing — an administrator can ask someone; a student cannot

Lower consequence for that reason alone. But two of these are instructions someone
follows while handling several hundred minors' records, and a vague rendering there
costs a re-export at best.

### 3.1 The bulk-upload format panel — instructions before uploading student records

**Where:** the CSV bulk-import panel in *Manage Schools*, read before uploading a file
of student records.

| key | EN | AR |
|---|---|---|
| `orgs.csvDateFormatNote` | Date of birth must be written as YYYY-MM-DD, for example 2010-03-14. | يجب كتابة تاريخ الميلاد بالصيغة YYYY-MM-DD، مثال: 2010-03-14. |
| `orgs.csvColumnOrderNote` | Columns are matched by their heading, so they can be in any order. | تُطابَق الأعمدة بحسب عنوانها، لذا يمكن ترتيبها بأي ترتيب. |
| `orgs.csvMissingColumns` | This file is missing required columns: {{columns}}. Download the template for the expected format. | هذا الملف تنقصه أعمدة مطلوبة: {{columns}}. نزّل النموذج للاطلاع على الصيغة المتوقعة. |

**`csvDateFormatNote` is the one to get exactly right, and it is a rendering check
more than a wording one.** It contains the literal pattern `YYYY-MM-DD` and a
Latin-numeral example, both of which **must stay in Latin script and in that order**
inside an RTL sentence. If the Arabic renders the example as `14-03-2010`, or reorders
the pattern, it is instructing schools to produce files the server will reject row by
row. **Check it rendered, not just read** (§6). `csvMissingColumns` interpolates a
comma-separated list of Latin-script field names and has the same concern.

### 3.2 The date-of-birth field — why a school is asked for a minor's birth date

| key | EN | AR |
|---|---|---|
| `orgs.dateOfBirthHint` | Used to work out the student's age at the time of their assessment. | يُستخدم لحساب عمر الطالب وقت إجراء التقييم. |
| `orgs.dateOfBirthAgeToday` | Age today: {{age}} | العمر اليوم: {{age}} |

**`dateOfBirthHint` carries a consent function, not just a UI one.** Its whole job is
to tell the administrator *why* a school is being asked for a child's birth date —
that it derives the student's age at assessment time, and is not one more identifier
collected for its own sake. An administrator who cannot read that reason is being
asked for a minor's DOB with no stated purpose.

**`dateOfBirthAgeToday`: the word carrying the whole key is TODAY.** The age that ends
up in the student's record is the age at *assessment* time, which can be months later
and a year higher. An Arabic rendering that drops the temporal qualifier and reads as
a bare `العمر` turns a confirmation into a promise the system does not keep. Confirm
it still says *today*.

Two rendering notes on the same key: `{{age}}` is a Latin numeral interpolated into an
RTL sentence — confirm the digits land after the colon and do not reorder against the
label (§6). And the number gets no plural forms, so `العمر اليوم: 2` is how it will
render — harmless in English, worth a second look in Arabic.

**Also worth a native eye, and nothing in this codebase controls it:** the field
renders a **native browser date picker**, so its month names, first day of week and
value ordering come from the browser locale, not from our translations. Check in an
Arabic browser that what the picker shows agrees with the label beside it.

### 3.3 The country/curriculum lock on the school form

| key | EN | AR |
|---|---|---|
| `orgs.curriculumLockedNote` | Country and curriculum are fixed once a school has students ({{n}} enrolled). Their assessments are drawn from this curriculum's quiz bank, so changing it would leave existing results out of step. | تُثبَّت الدولة والمنهج بمجرد وجود طلاب في المدرسة ({{n}} مسجلين). تُستمد تقييماتهم من بنك أسئلة هذا المنهج، لذا فإن تغييره سيجعل نتائجهم الحالية غير متوافقة. |
| `orgs.curriculumLockedChecking` | Checking enrolment. Country and curriculum are fixed once a school has students, so they stay locked until the count is known. | جارٍ التحقق من التسجيل. تُثبَّت الدولة والمنهج بمجرد وجود طلاب في المدرسة، لذا تبقى مقفلة حتى يُعرف العدد. |
| `orgs.countryNoCurricula` | This country has no curricula configured. Add them in Country Management first. | لا توجد مناهج مُعرَّفة لهذه الدولة. أضفها من إدارة الدول أولاً. |

`curriculumLockedNote` is the riskiest of the admin batch: two full sentences with an
interpolated count, translated rather than derived from any existing string, explaining
**why a control is disabled**. If the Arabic is unclear the administrator sees a dead
select and no working explanation — worse than the untranslated case.

**Known defect, not yours to fix:** the sentence reads `{{n}} مسجلين` for **every**
count including 1, because the key interpolates a plain number rather than using the
plural machinery. Arabic needs *more* forms than English, not fewer. Flag how wrong it
looks at 1, 2 and 11; the fix is a code change.

### 3.4 The edit-student form — the promise that stops an admin avoiding it

| key | EN | AR |
|---|---|---|
| `orgs.editStudentDesc` | Update this student's details. Their username ({{username}}) and password are not changed. | حدّث بيانات هذا الطالب. لن يتغير اسم المستخدم ({{username}}) ولا كلمة المرور. |
| `orgs.editStudentUsernameHint` | Changing the name updates the student's record and the name shown here. It does not change their username or password. | تغيير الاسم يُحدّث سجل الطالب والاسم المعروض هنا، ولا يغيّر اسم المستخدم أو كلمة المرور. |

Both promise the student's username and password will **not** change. That reassurance
is what stops an administrator avoiding the form for fear of breaking a credential
they have already handed to a child. If the promise does not read clearly in Arabic,
the key has failed at its only job.

`editStudentDesc` interpolates `{{username}}` — a Latin-script credential inside an
RTL sentence. **Check it rendered, not just read** (§6).

### 3.5 Roster columns, and one deliberate removal

| key | EN | AR |
|---|---|---|
| `orgs.age` | Age | العمر |
| `orgs.gender` | Gender | الجنس |

**`الجنس` lost a parenthetical `(اختياري)` deliberately** and it must not come back.
Gender has been **required** at the student-create sink for some time, and the header
had been telling administrators the opposite. A sibling key that said "Select gender
(optional)" was deleted outright for the same reason.

### 3.6 Validation strings derived by shape, not translated

A batch of `admin.json` keys was produced by **mirroring the shape of neighbouring
entries** rather than by translating — the required-field and select-prompt messages
on the student-create and school forms (`genderRequired`, `selectGenderReq`,
`fieldRequired`, `countryRequired`, `selectCountryReq`, `dateOfBirthRequired`), plus
four shape-mirrors on the edit-student form (`updateStudentBtn`, `updatingStudent`,
`studentUpdateSuccess`, `studentUpdateError`).

Individually low-risk. Worth a **skim as a group** for house voice, since none of them
was written as Arabic — they were written as copies of the Arabic next to them.

---

## 4. Marketing and landing — lowest consequence, highest visibility

Wrong Arabic here costs credibility with a visitor, not comprehension for a child.
Two of these do carry a claim that must not soften.

### 4.1 The two claims that must not soften

**Where:** the feature cards on the public landing page.

> **`features.reportsDesc`** — **EN:** Download a comprehensive PDF report with your career roadmap — included with the paid assessment
>
> **AR:** حمّل تقريراً شاملاً بصيغة PDF يتضمن خارطة طريقك المهنية — متاح ضمن التقييم المدفوع

**The load-bearing clause is the last one.** It is what stops the page promising a free
download of a paid feature. A translation that softens `المدفوع` ("paid") reopens a
claim that was deliberately closed. Also check the em-dash construction reads naturally
in Arabic rather than as a carried-over English pattern — a comma or `و` may be the
native form.

> **`features.matchDesc`** — **EN:** Career matches ranked for you, from what you tell us about yourself
>
> **AR:** مطابقات مهنية مرتّبة خصيصاً لك، بناءً على ما تخبرنا به عن نفسك

**This string must name NO input.** The English was rewritten precisely because no
single input is true for both the free and paid tiers. An Arabic version that
helpfully restores `اهتماماتك` ("your interests") — the word the previous string used,
and the obvious thing for a translator to reach for — **puts back a false claim.**

`مطابقات` for "matches" is the term to check: it is used here in a product sense, not
a statistical one.

### 4.2 The three-stage heading and the step cards

| key | EN | AR |
|---|---|---|
| `howItWorks.subtitle` | Your journey to the perfect career, in three stages | رحلتك نحو المهنة المثالية، على ثلاث مراحل |
| `howItWorks.step1Title` | Share Your Profile | شارك ملفك الشخصي |
| `howItWorks.step2Title` | Find Alignment | اكتشف التوافق |
| `howItWorks.step3Title` | Get Your Path | احصل على مسارك |

**`مراحل` (stages) rather than `خطوات` (steps) is deliberate.** `خطوات` is the word the
pricing page uses for a literal 7-step count, and reusing it here would recreate a
numeric collision that was deliberately removed. Please preserve the distinction.

**The three step titles are unchanged in Arabic — and that is the point.** They never
carried ordinals. They are now **numbered for the first time**, by the component, so
read them with a leading numeral in front of them for the first time. See §5 and §6:
this construction was rendered and fixed twice this week, so the numerals themselves
have now been seen — but whether `1 شارك ملفك الشخصي` reads naturally as a numbered
card in Arabic is a judgement only you can make.

### 4.3 The research citations — deliberately mixed script

| key | EN | AR |
|---|---|---|
| `research.personalitySource` | Source: Holland's RIASEC model of vocational personality types, Making Vocational Choices (1997) | المصدر: نموذج هولاند (RIASEC) لأنماط الشخصية المهنية، Making Vocational Choices (1997) |
| `research.valuesSource` | Source: Schwartz Theory of Basic Human Values (1992) | المصدر: نظرية شوارتز للقيم الإنسانية الأساسية (1992) |
| `features.marketTitle` | Career Growth Outlook | نظرة النمو المهني |
| `features.marketDesc` | How fast each career is projected to grow, from US labour projections via O*NET | مدى النمو المتوقع لكل مهنة، وفق توقعات مكتب إحصاءات العمل الأمريكي (عبر O*NET) |

**The Latin script here is deliberate and is the opposite call from §2.10**, where the
same acronym was *removed*. The difference is audience, not consistency: a student's
report explains, a citation is evidence for an evaluator, and a transliterated work
title cannot be looked up. Please judge these as citations rather than as prose.

**These are the pack's clearest mixed-run rendering risks** (§6). `O*NET` is the
sharpest: the asterisk sits adjacent to an RTL run, and a bare punctuation mark beside
Arabic text is exactly the construction that failed on the step cards. **Eyeball these
in the rendered Arabic landing page, not in the file.**

`نظرة النمو المهني` deliberately reuses the report's own `نظرة النمو` so the landing
card and the report name the same thing. Preserve the link if you change either.

### 4.4 The five value domains — psychometric vocabulary

> **EN:** Adapted from Schwartz's Portrait Values Questionnaire for ages 13–18, measuring five value domains — achievement, benevolence, self-direction, security and power — for value-based career alignment
>
> **AR:** مُقتبَس من استبيان شوارتز للقيم الشخصية ومُكيَّف للأعمار 13–18، ويقيس خمسة مجالات قيمية — الإنجاز، والإحسان، والتوجّه الذاتي، والأمن، والسلطة — للتوافق المهني القائم على القيم

**The five domain terms are the part to check** — psychometric vocabulary, each one a
translation decision: `الإنجاز` (achievement), `الإحسان` (benevolence), `التوجّه الذاتي`
(self-direction), `الأمن` (security), `السلطة` (power).

**The last two are the least certain, and the reasoning is recorded so you can
overrule it:** `الأمن` and `الأمان` both render "security", and Schwartz's sense is
closer to safety-and-stability than to national security. `السلطة` was chosen over
`القوة` because Schwartz's power is social status and control over people rather than
strength — but `القوة` is the more common rendering in casual Arabic and a reader may
expect it.

**These five should agree with whatever the assessment UI itself calls them** if it
names them in Arabic. That was never checked and is worth checking in the same pass.

### 4.5 The hero counter — a structural choice, not a translation

| key | EN | AR |
|---|---|---|
| `hero.assessmentsCompleted` | {{count}} assessment completed | عدد التقييمات المكتملة: {{count}} |
| `hero.assessmentsCompletedPlural` | {{count}} assessments completed | عدد التقييمات المكتملة: {{count}} |

**The two Arabic strings are deliberately identical, and that needs confirming rather
than correcting.** Arabic inflects a counted noun differently at 1, 2, 3–10 and 11+.
The component chooses between exactly **two** keys, so no inflected phrasing can be
right across the whole range. `عدد التقييمات المكتملة: {{count}}` states the count as a
labelled quantity and is well-formed for every value, including 0 and the literal
`"..."` shown while the number is loading. The distinction is genuinely *absent* in
this construction, not missing.

**If you prefer a counted-noun phrasing, say so — but know that the component needs
restructuring too, not just the strings.** A two-key selector cannot express Arabic
plurals, and the count arrives as a pre-formatted string, so the library's own plural
resolution can never fire on it either.

Secondary: `عدد … :` is a stat-label register, flatter than the promotional phrasing it
replaced. That was unavoidable given the above; if the hero wants promotional voice in
Arabic the sentence has to be rebuilt around an uncounted noun.

Also here, a deletion rather than a translation — confirm the remaining clause does not
read as truncated:

> **`features.progressDesc`** — **EN:** Monitor your journey with visual progress indicators
>
> **AR:** راقب رحلتك بمؤشرات تقدم بصرية

---

## 5. `legal.json` — ordinals baked into the Arabic section titles, never rendered

**Flagged as a known instance of a bidi class we hit twice this week, and unverified.**

The Arabic privacy, terms and disclaimer documents carry their section numbers **inside
the translated strings**:

| document | Arabic section titles |
|---|---|
| privacy `s1Title`–`s8Title` | `1. الغرض` · `2. البيانات التي نجمعها` · `3. الغرض من جمع البيانات` · `4. الاحتفاظ بالبيانات وحذفها` · `5. خصوصية الأطفال` · `6. أمان البيانات` · `7. مشاركة البيانات` · `8. حقوقك` |
| terms `s1Title`–`s7Title` | `1. قبول الشروط` · `2. الأهلية` · `3. الاستخدام المسموح` · `4. الملكية الفكرية` · `5. حسابات المستخدمين` · `6. التعليق أو الإنهاء` · `7. القانون الحاكم` |
| disclaimer `s1Title`–`s5Title` | `1. للأغراض التعليمية فقط` · `2. إخلاء المسؤولية` · `3. مسؤولية المؤسسة` · `4. الروابط الخارجية` · `5. التوجيه القائم على البحث` |

**Why this is on the list.** A Latin digit followed by a period, followed by Arabic
text, inside an RTL paragraph, with **no isolation**. The period is a bidi-neutral
character with no direction of its own, so it takes the direction of what surrounds
it. This is precisely the construction that shipped wrong on the landing step cards
and was fixed there this week — except these are unisolated, which puts the period on
the *opposite* side from the landing bug, and **nobody has ever looked at these
rendered.**

**What to check:** open the Arabic privacy, terms and disclaimer pages and look at
where the period sits relative to its numeral in each heading, and whether the numbers
read in the right order down the page.

**And the wording question underneath it:** the period is a Latin list convention.
Arabic ordered lists conventionally use a dash (`١- `) or no separator at all. **If the
period should not be there in Arabic, say so** — that is a wording judgement and it is
yours, not a rendering workaround. Note these are legal section numbers that may be
cross-referenced, so the numbering itself must survive whatever the separator becomes.

---

## 6. What has actually been SEEN rendered — read this before trusting the text

**Five constructions this week were correct by reasoning and wrong on screen in
Arabic**, and the ones that looked safest were the ones that failed: a bare digit, a
single punctuation mark, an interpolated Latin value. Two came from the landing step
cards alone — a `<bdi>`-isolated `1.` put the period on the far side of the numeral,
and `me-2` (a *logical* margin, the supposedly RTL-safe kind) computed to
`margin-right` on an RTL page and left no gap at all.

**So: for anything in the "not seen" list below, reading the Arabic is not sufficient
to clear it.** The text can be perfect and the screen still wrong.

### Seen rendered in Arabic

- **The landing step cards** (§4.2) — rendered in Arabic this week, at the character
  level. Two defects found and fixed. The numerals and their spacing are now verified;
  the *wording* of the three titles is still unreviewed.
- **The Arabic PDF report labels** — verified in production via a real Arabic PDF: the
  labels render Arabic and the report is not falling back to English.
- **Parts of the Arabic report body** — Work Style Fit, Strengths, Action Steps and
  Education Path were confirmed Arabic in a real generated PDF.

### NOT seen rendered — text-only review is insufficient

Everything else in this pack. The ones where that matters most, because the risk is
in the rendering and not the words:

| what | the specific risk |
|---|---|
| `O*NET` in `features.marketDesc` (§4.3) | an asterisk adjacent to an RTL run — the sharpest untested case in the pack |
| `Making Vocational Choices (1997)` in `research.personalitySource` (§4.3) | a Latin work title plus parenthesised year inside an Arabic sentence |
| `YYYY-MM-DD` and `2010-03-14` in `csvDateFormatNote` (§3.1) | if the example reorders, schools are told to produce files the server rejects |
| `{{username}}` in `editStudentDesc` (§3.4) | a Latin credential inside an RTL sentence |
| `{{age}}` in `dateOfBirthAgeToday` (§3.2) | a bare digit after a colon — the exact shape that failed on the step cards |
| `{{completed}} من {{cap}}` (§2.6) | two digits either side of an Arabic word |
| `{{school}}` in both attestations (§1) and the consent notice (§2.1) | a school name that may be Latin script, inside the legally weighted sentences |
| `{{columns}}` in `csvMissingColumns` (§3.1) | a comma-separated list of Latin field names |
| all of `legal.json`'s numbered headings (§5) | never rendered at all, by anyone |
| the em-dashes in `schoolOwnedNote` (§2.2), `reportsDesc` and `valuesDesc` (§4) | a dash between two RTL clauses can render ambiguously depending on the font |
| the native date picker (§3.2) | not ours at all — the browser supplies month names and ordering |

**How to see them.** The app can be run locally and rendered in Arabic with headless
Chrome — the recipe, including the system libraries and how to force the Arabic locale,
is in `FOLLOWUP.md` under the Arabic / RTL audit entry. **Read the boot-writes warning
at the top of that file first**: starting this app runs migrations and re-runs every
content seeder against whatever database is in scope, so "start the server to look at a
page" is a write.

**A rendered pass over the strings in the table above has not been done and is worth
doing before or alongside this review** — ideally producing screenshots to sit beside
this document, so you are judging Arabic as a reader will meet it rather than as JSON.

---

## Appendix — what this pack does not cover

- **`premiumNarratives.ts`** — 106 hand-written Arabic literals (action-step and
  narrative templates), student-facing, never in any review path. Needs its own pass.
- **`email.ts`** — a complete bilingual password-reset email, subject and body,
  hardcoded. Never reviewed.
- **Content data** — the Arabic quiz banks and career content (career titles,
  descriptions, education levels) are a separate and much larger body, reviewed
  through their own migrations rather than here.
- **Terms not yet localized at all** — curriculum names ("MOE National", "British",
  "American", "IB") render in English inside Arabic reports because no Arabic exists
  for them. That is a data gap, not a translation to review.
