# Superadmin — click verification (live, futurepath.ae)

Standard (owner, 2026-11-14): only a CLICK on the live site counts.
✅ clicked and works · ❌ clicked and broken · 🔧 broken, fixed, re-clicked live ·
⚠️ works, with a fault noted · ⏸ not clicked (reason)

"Tonight" = 2026-11-14 walk, builds 8557b68 → a0baeab. Earlier dates are the
live walks recorded in CLAUDE.md (2026-11-12/13/14). Clicks were made in the
page (mouse, or the page's own buttons fired from the console); a file import
was handed to the page's own Import input, since the browser tool cannot use
the OS file picker. Throwaway data was named `ZZ Click …` and removed.

## Header / navigation
| Item | Status | When | Notes |
|---|---|---|---|
| Super Admin / Schools / Quiz / Analytics / Profile | ✅ | tonight | |
| Language switch EN ↔ AR | ✅ | tonight | |
| Header tiles (schools, admins, students, utilisation) | ✅ | tonight | 3 / 3 / 8 (4 done, 50%) / 6% |

## Schools tab
| Create school (throwaway) | ✅ | 11-12 | |
| Manage licences (add/remove, amount, unlimited) | ✅ | 11-12/13 | |
| Manage admins: add | ✅ | tonight | credentials shown once |
| Manage admins: promote to primary | 🔧 | tonight | schools bought online had NO primary admin (Test High, AD School); fixed for new purchases, both put right by Promote |
| Manage admins: remove (asks first, primary protected) | ✅ | tonight | |
| View history | ✅ | 11-12 | |
| Resend setup | ⏸ | 2026-11-16 | NOT REACHABLE BY A CLICK. It shows only for an admin with no password; a superadmin-created school's admin has one, and so does an online buyer whose browser finishes checkout first (the screen shows the generated password). Only a buyer whose browser never comes back, with the webhook alone creating the school, reaches it. Tried both ways today; throwaway schools deleted |
| Bulk delete / delete school (typed name) | ✅ | 11-12/14 | |
| Export schools | ✅ | 11-12 | |

## Users tab
| Search / filters | ✅ | tonight, 11-12 | |
| Add Users / edit email / reset / bulk reset / give licences | ✅ | 11-12/13 | |
| View assessments / view results | ✅ | 11-12 | |
| Delete user (typed email) | ⚠️ | tonight | a removed admin cannot be deleted (audit rows about it, by design); the refusal says "actions it performed" — it is actions taken on it |
| Export CSV | ✅ | 11-13 | |

## Licences tab
| Revenue, granted, consumed, by country, by school | ✅ | tonight | figures reconcile with tonight's purchases |

## Invoices tab
| Raise / issue / send / mark paid / cancel | ✅ | 11-13, 11-14 | |
| View PDF | ✅ | tonight | 141 KB PDF |

## Recent Activity
| Shows events | ⚠️ | tonight | tonight's paid top-ups (+3 licences) and the invoice request are not listed; "Removed 1 licenses" |

## Files
| Tab | removed | 2026-11-15 | owner said remove: no source of files existed; tab, routes and the unused CSV import are gone |

## Announcements
| Create (EN + AR) | ✅ | tonight | |
| Shown as a banner, Arabic text in Arabic, dismiss | ✅ | tonight | seen as superadmin only; audience targeting needs the other roles |
| Edit | ✅ | tonight | |
| Delete (asks first) | ✅ | tonight | |

## Careers
| Create (all fields, Arabic) | ⚠️ | tonight | education level shows as the code "bachelors"; a new career has no personality/values mapping, so nothing recommends it (known) |
| Edit | ✅ | tonight | "Missing Arabic" clears when all four Arabic fields are filled |
| Delete (asks first) | ✅ | tonight | |
| Apply Arabic translations | ✅ | 11-13 | asks first |

## Countries / Subjects
| Add, edit, price, rename curriculum, generate questions, refresh, delete | ✅ | 11-13 (throwaway Malta) | not pressed on UAE: Refresh with AI |
| Subjects add / edit / delete / clone / register | ✅ | 11-12/13 | |

## Scoring
| Weights: ≠100% refused | ✅ | tonight | 105% refused |
| Weights: valid save | ✅ | tonight | |
| LLM: test key | ✅ | tonight | success |
| LLM: empty key refused | ✅ | tonight | button disabled |
| LLM: replace / delete key | ⏸ | — | cannot be re-entered by me |
| Prompt template: edit + save | ⚠️ | 2026-11-15 | saves; clears the narrative cache; the effect on a report SEEN (salm's five narratives rewritten after "Why This Career?" was saved). Flaw: the Narrative Cache tile does not refresh after a save |
| History | ⚠️ | tonight | records changes; Description column always "-" |

## Contributions
| Tiles | ✅ | tonight | |
| Review: approve / reject / needs changes / re-run / give reward | ✅ | 11-12/13/14 | needs a school submission to re-click |
| Yearly maximum edit (and −5 refused) | ✅ | tonight, 11-14 | |
| Allocate reward to a school | ✅ | 2026-11-16 | UAQ School (2 pending, from its peer review votes): Allocate Credits prefilled 2 -> Confirm -> "Rewards Allocated", the row left the list, reward credits 0 -> 2 (exactly the pending figure, not beyond). AD School left pending |

## Translations
| UI strings: namespace, search, missing only | ✅ | tonight | |
| UI strings: edit | ❌ | — | switched off by design (501) |
| Database: careers, CVQ, countries, questions — Arabic edit | ✅ | tonight | each edited and restored |
| Database: questions prev / next / missing only | ✅ | tonight | |

## Quiz page (/admin)
| Search, subject / grade / country filters | ✅ | tonight | |
| Create question: empty form | ❌ | tonight | no field errors, no message, nothing |
| Create question: valid | ⚠️ | tonight | no curriculum field (question applies to every curriculum); difficulty shows codes "easy" |
| Edit / delete (asks) | ✅ | tonight | |
| Export JSON / CSV | ✅ | tonight | content checked 11-12 |
| Import: not JSON | ✅ | tonight | clear message |
| Import: wrong shape | 🔧 | tonight | said "imported successfully" with 0 imported; now "0 imported, 1 refused …" |
| Import: valid | ✅ | tonight | 2 imported, then deleted |

## Analytics
| Totals | 🔧 | tonight | "12 students, 100%" vs dashboard 8 / 50%; now 8 / 50% |
| Talent pipeline by sector | 🔧 | tonight | every call was a 500 shown as "no data"; now UAE's sectors |
| Sector figures | ⚠️ | tonight | every sector shows the same count (all students counted under every sector) — needs a decision |
| Sector skills toggle | ✅ | tonight | |
| Export buttons | n/a | — | school admins only |

## Schools page as superadmin (/admin/organizations)
| Roster: add, edit, reset, repeat, bulk, export, delete | ✅ | 11-13 | |

## Profile
| Profile, data download | ✅ | tonight (view) | |


## Test purchase run, 2026-11-16 (build `e071d44`)

Signed out, `/checkout?students=5&country=uae`, buyer `+zzpurchase3`, school
"ZZ Third Purchase School"; the owner typed the test card both times.

| Item | Status | Notes |
|---|---|---|
| Group purchase, AED 200 for 5 | ✅ | school created, buyer signed in, 5 licences |
| ONE setup email | ✅ | one message, 10:16; second purchase in a row with one (not proof of the lock: the browser arrived first this time) |
| Terms opens in a new tab from the wizard | ✅ | step 3 "Terms of Use" opened `/terms` in a second tab; the wizard stayed on step 3 |
| Top-up of 1 by card | ✅ | AED 40; 5 -> 6 once; tiles updated with no reload; analytics: 6 granted, 2 purchases, AED 240, 0 free; reconciliation 0 |
| Which path granted the top-up | ⏸ | the ledger note `(browser)`/`(webhook)` is written but NO screen or route shows it, so it cannot be read by clicking. The live bundle awaits `/licences/confirm` before closing the dialog and the dialog closed, yet Resource Timing listed no confirm request (second time). Unresolved |
| ⚠️ Two instructions to one buyer | ⚠️ | when the browser wins, checkout shows a generated password ("save these"), and the email says "Choose a password" with a link that replaces it |
| Cleanup | ✅ | school deleted, admin account deleted by typed email, schools back to AD / UAQ / Test High, reconciliation 0 |

Also seen: the site was asleep at 10:15 and took about a minute on Render's
"Service waking up" page before `/group-pricing` drew.
