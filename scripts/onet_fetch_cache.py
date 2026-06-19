#!/usr/bin/env python3
"""
O*NET v2.0 CACHE-FIRST fetcher for the 37 futurepath careers.

Pulls work_styles + work_activities + interests for each career ONCE, with
delays, and saves raw JSON to ./onet_cache/<soc>_<report>.json. Resumable:
skips files already on disk, so a rate-limit interruption just means re-run
and it picks up where it left off. NEVER re-fetches a cached file.

After caching, compute profiles OFFLINE from the cached files (zero API calls)
using compute_profiles.py.

Usage:  ONET_KEY=xxxx python3 onet_fetch_cache.py
        (add --soc 21-1022.00 to fetch a single career)

Rate-limit hygiene:
- 2s delay between every request
- on 403/429: exponential backoff (10s, 30s, 90s), then give up that career
  (it stays uncached and is retried on next run)
- ONE request at a time, never bursts
"""
import sys, os, json, time, urllib.request, urllib.error

KEY = os.environ.get("ONET_KEY")
BASE = "https://api-v2.onetcenter.org/online/occupations"
CACHE = "onet_cache"
REPORTS = ["work_styles", "work_activities", "interests"]
DELAY = 2.0          # seconds between requests
BACKOFFS = [10, 30, 90]

# The 37 careers: SOC code -> label. Keep in sync with CAREER_ONET_CROSSWALK.
CAREERS = {
    "15-1252.00": "Software Engineer",
    "15-2051.01": "Data Scientist",
    "17-2199.03": "Renewable Energy Engineer",
    "29-1141.00": "Healthcare Professional (Nurse)",
    "13-1161.00": "Digital Marketing Specialist",
    "27-1024.00": "Graphic Designer",
    "17-2141.00": "Mechanical Engineer",
    "13-2051.00": "Financial Analyst",
    "25-2031.00": "Teacher (Secondary Education)",
    "19-2041.00": "Environmental Scientist",
    "17-2051.00": "Civil Engineer",
    "17-1011.00": "Architect",
    "17-2071.00": "Electrical Engineer",
    "17-2031.00": "Biomedical Engineer",
    "29-1051.00": "Pharmacist",
    "29-1215.00": "Doctor (General Practitioner)",
    "29-1021.00": "Dentist",
    "29-1123.00": "Physical Therapist",
    "19-3033.00": "Psychologist",
    "21-1022.00": "Social Worker",
    "23-1011.00": "Lawyer",
    "13-2011.00": "Accountant",
    "11-3121.00": "Human Resources Manager",
    "13-1111.00": "Management Consultant",
    "11-1021.00": "Entrepreneur",
    "11-2022.00": "Sales Manager",
    "11-2021.00": "Marketing Manager",
    "13-1082.00": "Product Manager",
    "15-1255.01": "UX/UI Designer",
    "27-1014.00": "Video Game Designer",
    "27-3023.00": "Journalist",
    "27-3043.00": "Content Creator",
    "27-4021.00": "Photographer",
    "35-1011.00": "Chef",
    "27-1022.00": "Fashion Designer",
    "27-1025.00": "Interior Designer",
    "15-1254.00": "Web Developer",
}

def fetch(soc, report):
    url = f"{BASE}/{soc}/details/{report}?start=1&end=50"
    req = urllib.request.Request(url, headers={
        "X-API-Key": KEY,
        "Accept": "application/json",
        "User-Agent": "futurepath-cache/1.0",
    })
    for i, back in enumerate([0] + BACKOFFS):
        if back:
            print(f"      backoff {back}s (attempt {i})...")
            time.sleep(back)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) and i < len(BACKOFFS):
                continue
            print(f"      HTTP {e.code} for {soc}/{report} — giving up this one")
            return None
        except Exception as e:
            print(f"      error {e} for {soc}/{report}")
            return None
    return None

def main():
    if not KEY:
        print("ERROR: set ONET_KEY"); sys.exit(1)
    os.makedirs(CACHE, exist_ok=True)
    single = None
    if "--soc" in sys.argv:
        single = sys.argv[sys.argv.index("--soc") + 1]
    targets = {single: CAREERS.get(single, single)} if single else CAREERS

    fetched, skipped, failed = 0, 0, 0
    for soc, label in targets.items():
        print(f"[{label}] {soc}")
        for report in REPORTS:
            path = os.path.join(CACHE, f"{soc}_{report}.json")
            if os.path.exists(path):
                skipped += 1
                continue
            data = fetch(soc, report)
            if data is None:
                failed += 1
                print(f"   ! {report} FAILED (will retry next run)")
                continue
            with open(path, "w") as f:
                json.dump(data, f)
            fetched += 1
            print(f"   + {report} cached")
            time.sleep(DELAY)
    print(f"\nDone. fetched={fetched} skipped(cached)={skipped} failed={failed}")
    if failed:
        print("Re-run to retry failed ones (cached files are skipped).")

if __name__ == "__main__":
    main()
