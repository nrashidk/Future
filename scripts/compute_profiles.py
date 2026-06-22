#!/usr/bin/env python3
"""
Compute 5-domain Schwartz values_profiles from CACHED O*NET v2.0 data.
Zero API calls — reads ./onet_cache/*.json written by onet_fetch_cache.py.

Tune the blend weights here and re-run freely; no rate-limit risk.

Usage:  python3 compute_profiles.py            # all cached careers, table
        python3 compute_profiles.py --sql       # emit UPDATE statements
        python3 compute_profiles.py --json       # emit {soc: profile} json
"""
import sys, os, json

CACHE = "onet_cache"

CAREERS = {  # soc -> label (full 37, mirrors scripts/parse-onet-values.ts crosswalk)
    "15-1252.00": "Software Engineer", "15-2051.01": "Data Scientist",
    "17-2199.03": "Renewable Energy Engineer", "29-1141.00": "Healthcare Professional (Nurse)",
    "13-1161.00": "Digital Marketing Specialist", "27-1024.00": "Graphic Designer",
    "17-2141.00": "Mechanical Engineer", "13-2051.00": "Financial Analyst",
    "25-2031.00": "Teacher (Secondary Education)", "19-2041.00": "Environmental Scientist",
    "17-2051.00": "Civil Engineer", "17-1011.00": "Architect",
    "17-2071.00": "Electrical Engineer", "17-2031.00": "Biomedical Engineer",
    "29-1051.00": "Pharmacist", "29-1215.00": "Doctor (General Practitioner)",
    "29-1021.00": "Dentist", "29-1123.00": "Physical Therapist",
    "19-3033.00": "Psychologist", "21-1022.00": "Social Worker",
    "23-1011.00": "Lawyer", "13-2011.00": "Accountant",
    "11-3121.00": "Human Resources Manager", "13-1111.00": "Management Consultant",
    "11-1021.00": "Entrepreneur", "11-2022.00": "Sales Manager",
    "11-2021.00": "Marketing Manager", "13-1082.00": "Product Manager",
    "15-1255.01": "UX/UI Designer", "27-1014.00": "Video Game Designer",
    "27-3023.00": "Journalist", "27-3043.00": "Content Creator",
    "27-4021.00": "Photographer", "35-1011.00": "Chef",
    "27-1022.00": "Fashion Designer", "27-1025.00": "Interior Designer",
    "15-1254.00": "Web Developer",
}

def by_name(data):
    """Map element name -> score. work_styles/work_activities carry the score in
    'importance'; the interests endpoint carries it in 'occupational_interest'.
    Read 'importance' first, fall back to 'occupational_interest' (FIX 1: interest
    signals were silently None before, dropping them from self_direction/benevolence)."""
    out = {}
    for e in data.get("element", []):
        v = e.get("importance")
        if v is None:
            v = e.get("occupational_interest")
        out[e["name"]] = v
    return out

def load(soc, report):
    path = os.path.join(CACHE, f"{soc}_{report}.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        data = json.load(f)
    return by_name(data)

# --- missing-data semantics --------------------------------------------------
# An O*NET element ABSENT from the response is NOT the same as a low score.
# gp() returns None for an absent element (vs a real 0-100 number when present),
# and the aggregators below DROP None rather than treating it as 0 — so a domain
# is never deflated just because O*NET omitted an element.

def gp(d, name):
    """Importance score if the element is present, else None (absent)."""
    if d is None:
        return None
    return d.get(name)  # None when the key is absent

def mean_present(*vals):
    """Arithmetic mean over present (non-None) values; None if all absent."""
    present = [v for v in vals if v is not None]
    return sum(present) / len(present) if present else None

def max_present(*vals):
    """Max over present (non-None) values; None if all absent."""
    present = [v for v in vals if v is not None]
    return max(present) if present else None

def blend(*pairs):
    """Weighted blend of (value, weight) pairs. Drop pairs whose value is None
    and renormalize the surviving weights to sum to 1.0. None if all absent."""
    present = [(v, w) for v, w in pairs if v is not None]
    if not present:
        return None
    tw = sum(w for _, w in present)
    return sum(v * w for v, w in present) / tw

def _round(v):
    return None if v is None else round(v)

def profile(soc):
    styles = load(soc, "work_styles")
    acts   = load(soc, "work_activities")
    ints   = load(soc, "interests")
    if styles is None:
        return None  # not cached yet

    # achievement — primary: Achievement Orientation work style; secondary:
    # Enterprising interest (FIX 3: WS alone sat in a narrow 40-82 band; the
    # Enterprising blend widens discrimination). blend() renormalizes if
    # Enterprising is absent. Null only if Achievement Orientation (primary) is absent.
    ach_primary = gp(styles, "Achievement Orientation")
    achievement = None if ach_primary is None else _round(
        blend((ach_primary, 0.65), (gp(ints, "Enterprising"), 0.35)))

    # self_direction — primary: work-style cluster; secondary: I/A interest.
    sd_style = mean_present(gp(styles,"Initiative"), gp(styles,"Intellectual Curiosity"),
                            gp(styles,"Innovation"), gp(styles,"Tolerance for Ambiguity"))
    sd_interest = max_present(gp(ints,"Investigative"), gp(ints,"Artistic"))
    self_direction = None if sd_style is None else _round(
        blend((sd_style, 0.55), (sd_interest, 0.45)))

    # benevolence — primary: empathy/cooperation/social work-style cluster.
    ben_style = mean_present(gp(styles,"Empathy"), gp(styles,"Cooperation"),
                             gp(styles,"Social Orientation"))
    benevolence = None if ben_style is None else _round(blend(
        (ben_style, 0.7),
        (gp(acts,"Assisting and Caring for Others"), 0.2),
        (gp(ints,"Social"), 0.1)))

    # security — primary: dependability/self-control/cautiousness cluster.
    security = _round(mean_present(gp(styles,"Dependability"),
                                   gp(styles,"Self-Control"),
                                   gp(styles,"Cautiousness")))

    # power — primary: Leadership Orientation work style; secondary: directing
    # activities. FIX 2: when Leadership is absent but any directing activity is
    # present, compute power from the activities alone (blend() renormalizes the
    # surviving weights). Null only if BOTH Leadership AND all three activities
    # are absent (pow_act is None only when all three activities are absent, and
    # blend() returns None only when both pairs are dropped).
    pow_act = mean_present(gp(acts,"Coordinating the Work and Activities of Others"),
                           gp(acts,"Guiding, Directing, and Motivating Subordinates"),
                           gp(acts,"Developing and Building Teams"))
    lead = gp(styles, "Leadership Orientation")
    power = _round(blend((lead, 0.6), (pow_act, 0.4)))

    return {"achievement": achievement, "self_direction": self_direction,
            "benevolence": benevolence, "security": security, "power": power}

def discover_socs():
    """Find all SOCs that have at least a work_styles cache file."""
    socs = set()
    if not os.path.isdir(CACHE):
        return socs
    for fn in os.listdir(CACHE):
        if fn.endswith("_work_styles.json"):
            socs.add(fn[:-len("_work_styles.json")])
    return sorted(socs)

def main():
    socs = discover_socs()
    if not socs:
        print("No cached data found in ./onet_cache — run onet_fetch_cache.py first.")
        return
    results = {}
    for soc in socs:
        p = profile(soc)
        if p:
            results[soc] = p

    mode = "--sql" if "--sql" in sys.argv else ("--json" if "--json" in sys.argv else "table")

    def cell(v, w):
        return ("-" if v is None else str(v)).rjust(w)

    if mode == "table":
        print(f"{'SOC':<13} {'label':<28} ach sdir benv sec pow")
        for soc, p in results.items():
            label = CAREERS.get(soc, "")[:27]
            print(f"{soc:<13} {label:<28} {cell(p['achievement'],3)} {cell(p['self_direction'],4)} "
                  f"{cell(p['benevolence'],4)} {cell(p['security'],3)} {cell(p['power'],3)}")
        # quick outlier sanity flags
        print("\nSanity flags:")
        for soc, p in results.items():
            flags = []
            present = [v for v in p.values() if v is not None]
            nulls = [k for k, v in p.items() if v is None]
            if nulls: flags.append("null: " + ",".join(nulls))
            if present and all(v >= 80 for v in present): flags.append("all-high (no discrimination)")
            if present and all(v <= 30 for v in present): flags.append("all-low")
            if p['security'] is not None and p['security'] >= 90: flags.append("security ceiling")
            if flags:
                print(f"  {soc}: {', '.join(flags)}")
    elif mode == "--json":
        print(json.dumps(results, indent=2))
    elif mode == "--sql":
        for soc, p in results.items():
            j = json.dumps(p).replace("'", "''")
            print(f"UPDATE careers SET values_profile = '{j}'::jsonb WHERE onet_code = '{soc}';")

if __name__ == "__main__":
    main()
