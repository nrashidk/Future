> Archived design spec from Nov 2025 — predates the verified scoring model and O*NET work; reference only, not authoritative.

# Free vs Premium Report Tier Comparison

This document outlines the differences between the Free (Basic) and Premium (Individual) career report tiers, with suggestions for proper differentiation.

---

## Current Report Structure Overview

### Variable Report Length Factors

Report length varies between students due to:
1. **Number of subjects selected** - More subjects = larger competency section
2. **Quiz performance details** - Subject-by-subject breakdown scales with selections
3. **Career recommendation content** - Matched competencies and vision priorities vary per career
4. **Premium-only sections** - Additional 2-3 pages for learning style and values analysis

---

## Tier Comparison Matrix

| Feature Category | Free (Basic) | Premium (Individual) |
|------------------|--------------|----------------------|
| **Price** | $0 | $10/student |
| **Assessment Duration** | ~5-10 minutes | ~15-20 minutes |
| **Scoring Components** | 3 | 5 |
| **Report Sections** | 5 core sections | 7+ sections |
| **Scientific Depth** | Self-reported interests | Validated psychometric instruments |

---

## Scoring Algorithm Differences

### Free Tier Weights (Total: 100%)
| Component | Weight | Description |
|-----------|--------|-------------|
| Subject Match | 35% | Preferences + quiz competency |
| Interest Match | 35% | Self-reported interest keywords |
| Vision Alignment | 30% | Country priority alignment |

### Premium Tier Weights (Total: 100%)
| Component | Weight | Description |
|-----------|--------|-------------|
| Personality Profile | 30% | Scientific personality-career mapping |
| Subject Match | 20% | Preferences + quiz competency |
| Values Profile | 20% | Personal values-work values alignment |
| Vision Alignment | 20% | Country priority alignment |
| Learning Style | 10% | Learning approach-career fit |

**Key Insight**: Premium tier replaces self-reported interests (35%) with three scientifically-validated components (Personality 30% + Values 20% + Learning Style 10% = 60%), providing more accurate and predictive career matching.

---

## Report Content Comparison

### Section 1: Subject Competency Spotlight
**Both Tiers Include:**
- Overall competency percentage
- Subject-by-subject breakdown with progress bars
- Competency level label (Excellent/Strong/Good/Room to Grow)
- Insights on skill validation
- Connection to national vision priorities

**Variable Content:** Length scales with number of subjects selected (1-6+ subjects)

---

### Section 2: Learning Style Profile (PREMIUM ONLY)
**Premium Exclusive Content:**
- Identified learning style type (4 possible types)
- What This Means - personalized description
- Learning preferences visualization (4 dimensions with progress bars)
- Study Strategies - 4 customized study tips
- Career Connection - how learning style influences career matches
- Weight contribution explanation (10% of match score)

**Report Impact:** Adds approximately 1 full page to report

---

### Section 3: Personal Values Profile (PREMIUM ONLY)
**Premium Exclusive Content:**
- Top 3 Core Values with rankings and descriptions
- Complete Values Profile (7 value domains with scores)
- What Your Values Mean - personalized interpretations
- Career Connection - how values align with career work values
- Scientific methodology reference
- Weight contribution explanation (20% of match score)

**Report Impact:** Adds approximately 1 full page to report

---

### Section 4: Career Recommendations (Both Tiers)
**Both Tiers Include:**
- Top 5 career matches with overall match percentage
- Match breakdown showing component scores
- Salary and growth outlook information
- Validated competencies badges
- National vision alignment tags
- "Why This Career?" personalized reasoning
- Education path requirements
- Next Steps action items

**Differences:**
| Aspect | Free Tier | Premium Tier |
|--------|-----------|--------------|
| Match components shown | 4 (Subject, Interest, Vision, Market) | 4+ (varies by display) |
| Score accuracy | Based on self-reporting | Based on validated instruments |
| Typical match scores | 85-95% (easier to achieve) | 70-90% (more realistic) |
| Career reasoning | Interest-focused | Personality + Values + Learning focused |

---

### Section 5: Research Methodology (PREMIUM ONLY)
**Premium Report Footer Includes:**
- Scientific framework explanations
- Academic citation references
- Methodology transparency
- Data source attribution

---

## Suggested Tier Differentiation Strategies

### Strategy 1: Content Depth Differentiation

**Free Tier - "Discovery Report"**
- Focus: Career exploration and awareness
- Message: "Get started with your career journey"
- Content: Basic matching, general guidance
- Report length: 4-6 pages (varies by subjects)

**Premium Tier - "Comprehensive Career Analysis"**
- Focus: In-depth self-understanding and precise matching
- Message: "Know yourself deeply, match careers accurately"
- Content: Full psychological profiling, detailed insights
- Report length: 7-12 pages (varies by subjects)

---

### Strategy 2: Feature Gating Options

**Option A: Gate by Insight Depth**
| Feature | Free | Premium |
|---------|------|---------|
| Top 5 careers shown | Yes | Yes |
| Match percentages | Yes | Yes |
| Subject competency | Yes | Yes |
| Learning style profile | No | Yes |
| Values profile | No | Yes |
| Personalized study tips | No | Yes |
| Scientific citations | No | Yes |

**Option B: Gate by Career Detail Level**
| Feature | Free | Premium |
|---------|------|---------|
| Top careers shown | 3 | 5 |
| Match breakdown detail | Summary only | Full component view |
| Action steps | 2 per career | 4+ per career |
| Education paths | General | Detailed |
| Career reasoning | Brief | Comprehensive |

**Option C: Gate by Report Features**
| Feature | Free | Premium |
|---------|------|---------|
| View online | Yes | Yes |
| PDF download | Basic (no styling) | Full styled report |
| Save to account | With signup | Yes |
| Share results | No | Yes |
| Progress tracking | No | Yes |

---

### Strategy 3: Engagement-Based Differentiation

**Free Tier Experience:**
1. Quick assessment (~5-10 min)
2. Immediate results viewing
3. Teaser insights with upgrade prompts
4. "See what you're missing" previews

**Premium Tier Experience:**
1. Comprehensive assessment (~15-20 min)
2. Full profile analysis
3. Complete report with all sections
4. No upsell interruptions
5. Exportable/shareable content

---

## Recommended Implementation

### For Maximum Value Differentiation:

1. **Keep Free Tier Valuable**: Don't cripple the free experience. It should still provide genuine value (5 career matches, subject validation, basic reasoning).

2. **Make Premium Clearly Superior**: The premium additions should feel substantial:
   - Learning style = "How you work best"
   - Values profile = "What matters to you"
   - Combined = More accurate, more personal

3. **Communicate the Difference Clearly**:
   - Free: "Discover careers that match your interests and skills"
   - Premium: "Understand yourself deeply and find careers aligned with who you really are"

4. **Visual Upgrade Prompts**: In free reports, show:
   - Locked sections with previews
   - "Your Learning Style: [Unlock to discover]"
   - "Your Top Values: [Unlock to discover]"

---

## Technical Considerations

### Report Generation Variables

```
Free Report Pages =
  1 (Header) +
  1 (Subject Competency, scales with subjects) +
  N (Career pages, where N = number of recommendations, typically 5)

Premium Report Pages =
  Free Report Pages +
  1 (Learning Style Profile) +
  1 (Values Profile) +
  Optional (Research Methodology on each career page)
```

### Estimated Page Counts

| Student Profile | Free Report | Premium Report |
|-----------------|-------------|----------------|
| 2 subjects, standard results | 4-5 pages | 6-7 pages |
| 4 subjects, detailed results | 5-6 pages | 7-9 pages |
| 6 subjects, comprehensive | 6-8 pages | 9-12 pages |

---

## Summary

The key differentiation between tiers is not just **more content** but **deeper understanding**:

- **Free Tier**: "What careers might fit you" (based on interests)
- **Premium Tier**: "What careers truly align with who you are" (based on personality, values, and learning style)

This positions the premium tier as providing genuine additional value through scientific depth rather than simply gating basic features, which maintains trust with users while providing clear upgrade incentives.
