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
| Resend setup | ⏸ | — | only offered before an admin signs in; no school in that state |
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
| List / download / delete | ❌ | tonight | no upload control exists, so nothing can ever be listed |

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
| Prompt template: edit + save | ⚠️ | tonight | saves; clears the narrative cache; effect on a report not seen |
| History | ⚠️ | tonight | records changes; Description column always "-" |

## Contributions
| Tiles | ✅ | tonight | |
| Review: approve / reject / needs changes / re-run / give reward | ✅ | 11-12/13/14 | needs a school submission to re-click |
| Yearly maximum edit (and −5 refused) | ✅ | tonight, 11-14 | |
| Allocate reward to a school | ⏸ | — | only shown with pending rewards |

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
