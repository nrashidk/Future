# Corrected Career → O*NET-SOC Crosswalk (DRAFT — for review)

**Status:** Draft for review. **Nothing here has been applied** to the database, `scripts/parse-onet-values.ts`, or `scripts/career-values-update.sql`.

This table corrects the existing 36-entry `CAREER_ONET_CROSSWALK` (`scripts/parse-onet-values.ts:41`) and adds the 37th career (`web developer`) that was previously unmapped.

**Summary of changes:** 3 real fixes (wrong occupation), 2 precision/differentiation fixes, 1 addition, 3 approximations left as-is (flagged), remaining 28 unchanged.

| Career title | Current SOC code | Corrected SOC code | O*NET occupation name (corrected) | Change type | Note |
|---|---|---|---|---|---|
| Software Engineer | 15-1251.00 | **15-1252.00** | Software Developers | Real fix | Was Computer Programmers — outdated/narrow occupation. |
| Data Scientist | 15-2051.01 | 15-2051.01 | Data Scientists | Unchanged | |
| Renewable Energy Engineer | 17-2199.03 | 17-2199.03 | Energy Engineers, Except Wind and Solar | Unchanged | |
| Healthcare Professional (Nurse) | 29-1141.00 | 29-1141.00 | Registered Nurses | Unchanged | |
| Digital Marketing Specialist | 13-1161.00 | 13-1161.00 | Market Research Analysts | Unchanged | Approximation — no clean O*NET match (imperfect). |
| Graphic Designer | 27-1024.00 | 27-1024.00 | Graphic Designers | Unchanged | |
| Mechanical Engineer | 17-2141.00 | 17-2141.00 | Mechanical Engineers | Unchanged | |
| Financial Analyst | 13-2052.00 | **13-2051.00** | Financial and Investment Analysts | Real fix | Was Personal Financial Advisors — a different occupation. |
| Teacher (Secondary Education) | 25-2031.00 | 25-2031.00 | Secondary School Teachers | Unchanged | |
| Environmental Scientist | 19-2041.00 | 19-2041.00 | Environmental Scientists | Unchanged | |
| Civil Engineer | 17-2051.00 | 17-2051.00 | Civil Engineers | Unchanged | |
| Architect | 17-1011.00 | 17-1011.00 | Architects | Unchanged | |
| Electrical Engineer | 17-2071.00 | 17-2071.00 | Electrical Engineers | Unchanged | |
| Biomedical Engineer | 17-2031.00 | 17-2031.00 | Biomedical Engineers | Unchanged | |
| Pharmacist | 29-1051.00 | 29-1051.00 | Pharmacists | Unchanged | |
| Doctor (General Practitioner) | 29-1216.00 | **29-1215.00** | Family Medicine Physicians | Precision fix | GP is closer to Family Medicine than the previous Internal Medicine code. |
| Dentist | 29-1021.00 | 29-1021.00 | Dentists, General | Unchanged | |
| Physical Therapist | 29-1123.00 | 29-1123.00 | Physical Therapists | Unchanged | |
| Psychologist | 19-3032.00 | **19-3033.00** | Clinical and Counseling Psychologists | Real fix | Was Industrial-Organizational; career description is therapy/counseling. |
| Social Worker | 21-1022.00 | 21-1022.00 | Healthcare Social Workers | Unchanged | |
| Lawyer | 23-1011.00 | 23-1011.00 | Lawyers | Unchanged | |
| Accountant | 13-2011.00 | 13-2011.00 | Accountants and Auditors | Unchanged | |
| Human Resources Manager | 11-3121.00 | 11-3121.00 | Human Resources Managers | Unchanged | |
| Management Consultant | 13-1111.00 | 13-1111.00 | Management Analysts | Unchanged | |
| Entrepreneur | 11-1021.00 | 11-1021.00 | General and Operations Managers | Unchanged | Approximation — no clean O*NET match (proxy). |
| Sales Manager | 11-2022.00 | 11-2022.00 | Sales Managers | Unchanged | |
| Marketing Manager | 11-2021.00 | 11-2021.00 | Marketing Managers | Unchanged | |
| Product Manager | 11-2021.00 | **13-1082.00** | Project Management Specialists | Precision fix | Was a duplicate of Marketing Manager; now differentiated. |
| UX/UI Designer | 15-1255.01 | 15-1255.01 | Web and Digital Interface Designers | Unchanged | |
| Video Game Designer | 27-1014.00 | 27-1014.00 | Special Effects Artists and Animators | Unchanged | Approximation — no clean O*NET match (acceptable). |
| Journalist | 27-3023.00 | 27-3023.00 | News Analysts, Reporters, and Journalists | Unchanged | |
| Content Creator | 27-3043.00 | 27-3043.00 | Writers and Authors | Unchanged | |
| Photographer | 27-4021.00 | 27-4021.00 | Photographers | Unchanged | |
| Chef | 35-1011.00 | 35-1011.00 | Chefs and Head Cooks | Unchanged | |
| Fashion Designer | 27-1022.00 | 27-1022.00 | Fashion Designers | Unchanged | |
| Interior Designer | 27-1025.00 | 27-1025.00 | Interior Designers | Unchanged | |
| web developer | (none) | **15-1254.00** | Web Developers | Addition | Previously unmapped (37th career). See casing note below. |

## Notes

### Title casing inconsistency (data-normalization decision needed — NOT changed here)
The seed career title `web developer` (`server/seed.ts:602`) is **lowercase**, inconsistent with all other titles, which use Title Case (e.g. `Software Engineer`, `UX/UI Designer`). Because the populating SQL matches on `WHERE title = '<title>'` (exact, case-sensitive), the crosswalk key for this career **must match the stored title byte-for-byte** or the update silently fails.

This is a separate data-normalization decision and is intentionally **not** changed in this draft:
- **Option A:** Normalize the seed/DB title to `Web Developer` (consistent casing) — then the crosswalk key must also be `Web Developer`.
- **Option B:** Leave the title as `web developer` and make the crosswalk key exactly `web developer`.

Decide casing first, then make the crosswalk key match the final stored value.

### Approximations (no clean O*NET match — carried forward unchanged)
- **Entrepreneur** → 11-1021.00 (General and Operations Managers) — proxy.
- **Digital Marketing Specialist** → 13-1161.00 (Market Research Analysts) — imperfect.
- **Video Game Designer** → 27-1014.00 (Special Effects Artists and Animators) — acceptable.

### Scope reminder
This file is a review artifact only. Applying it would require, as separate approved steps: updating the crosswalk in `scripts/parse-onet-values.ts`, regenerating `scripts/career-values-update.sql` (which also recomputes `values_profile`), and running that SQL against the database.
