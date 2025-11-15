# Career Matching Calculation Examples
## Future Pathways - Free vs Paid Tier Comparison

---

## 🆓 **FREE TIER CALCULATIONS**

### Component Weights (Basic Tier)
- **Subject Match**: 30% weight
- **Interest Match**: 30% weight  
- **Vision Alignment**: 20% weight
- **Market Demand**: 20% weight (0% contribution - disabled in basic tier)

**After normalization** (removing 0% components):
- **Subject Match**: 37.5% effective weight (30/80)
- **Interest Match**: 37.5% effective weight (30/80)
- **Vision Alignment**: 25% effective weight (20/80)

---

## 📊 **SUBJECT MATCH CALCULATIONS (Free Tier)**

**Formula**: `(Preference % × 0.4) + (Competency % × 0.6)`

### Example Career: **Software Engineer**
Required Subjects: Computer Science, Mathematics, Physics (3 subjects)

#### **Scenario 1: 1 Subject Selected (Mathematics), 100% Quiz**
- **Preference Score**: 1/3 = 33.33%
- **Competency Score**: 100% (Mathematics quiz)
- **Calculation**: (33.33% × 0.4) + (100% × 0.6)
- **Subject Match**: 13.33% + 60% = **73.33%**

#### **Scenario 2: 2 Subjects Selected (Mathematics + Computer Science), 100% Quiz**
- **Preference Score**: 2/3 = 66.67%
- **Competency Score**: 100% (both quizzes)
- **Calculation**: (66.67% × 0.4) + (100% × 0.6)
- **Subject Match**: 26.67% + 60% = **86.67%**

#### **Scenario 3: 3 Subjects Selected (Math + CS + Physics), 100% Quiz**
- **Preference Score**: 3/3 = 100%
- **Competency Score**: 100% (all quizzes)
- **Calculation**: (100% × 0.4) + (100% × 0.6)
- **Subject Match**: 40% + 60% = **100%**

#### **Scenario 4: 4 Subjects (Math + CS + Physics + English), 100% Quiz**
- **Preference Score**: 3/3 = 100% (only 3 match career requirements)
- **Competency Score**: 100% (weighted average across all 4 subjects)
- **Calculation**: (100% × 0.4) + (100% × 0.6)
- **Subject Match**: 40% + 60% = **100%**

#### **Scenario 5: 1 Subject (Mathematics), 50% Quiz**
- **Preference Score**: 33.33%
- **Competency Score**: 50%
- **Calculation**: (33.33% × 0.4) + (50% × 0.6)
- **Subject Match**: 13.33% + 30% = **43.33%**

#### **Scenario 6: 1 Subject (Mathematics), 75% Quiz**
- **Preference Score**: 33.33%
- **Competency Score**: 75%
- **Calculation**: (33.33% × 0.4) + (75% × 0.6)
- **Subject Match**: 13.33% + 45% = **58.33%**

### Summary Table: Subject Match vs Selection

| Subjects Selected | Preference | Quiz Score | Subject Match |
|-------------------|------------|------------|---------------|
| 1/3 match         | 33.33%     | 100%       | **73.33%**    |
| 1/3 match         | 33.33%     | 75%        | **58.33%**    |
| 1/3 match         | 33.33%     | 50%        | **43.33%**    |
| 2/3 match         | 66.67%     | 100%       | **86.67%**    |
| 2/3 match         | 66.67%     | 75%        | **71.67%**    |
| 2/3 match         | 66.67%     | 50%        | **56.67%**    |
| 3/3 match         | 100%       | 100%       | **100%**      |
| 3/3 match         | 100%       | 75%        | **85%**       |
| 3/3 match         | 100%       | 50%        | **70%**       |

---

## 🎯 **INTEREST MATCH CALCULATIONS (Free Tier)**

**Multi-Channel Weighted Matching**:
- **Category Match**: 0.6 weight (60%)
- **Description Match**: 0.3 weight (30%)
- **Skill Match**: 0.1 weight (10%)

### Example Career: **Software Engineer**
- **Category**: Technology
- **Description**: "Design, develop, and maintain software applications and systems"
- **Required Skills**: Programming, Problem Solving, Data Structures, Algorithms

#### **Scenario 1: 1 Interest (Technology)**
**Technology Lexicon Matches**:
- Category Match: "Technology" → 0.6
- Description Match: "develop", "software", "applications" → 0.3
- Skill Match: "Programming" → 0.1
- **Total Score**: 1.0

**Calculation**: 1.0 / (1 × 1.0) × 100 = **100%**

#### **Scenario 2: 2 Interests (Technology + Problem Solving)**
**Technology**: 1.0 (all channels match)
**Problem Solving**:
- Category Match: "Technology" → 0.6
- Description Match: "problem" (implied) → 0.0
- Skill Match: "Problem Solving" → 0.1
- **Total Score**: 0.7

**Calculation**: (1.0 + 0.7) / (2 × 1.0) × 100 = **85%**

#### **Scenario 3: 2 Interests (Technology + Creative)**
**Technology**: 1.0
**Creative**:
- Category Match: No match → 0.0
- Description Match: "design" → 0.3
- Skill Match: No match → 0.0
- **Total Score**: 0.3

**Calculation**: (1.0 + 0.3) / (2 × 1.0) × 100 = **65%**

#### **Scenario 4: 3 Interests (Tech + Problem Solving + Leadership)**
**Technology**: 1.0
**Problem Solving**: 0.7
**Leadership**:
- Category Match: No match → 0.0
- Description Match: No match → 0.0
- Skill Match: No match → 0.0
- **Total Score**: 0.0

**Calculation**: (1.0 + 0.7 + 0.0) / (3 × 1.0) × 100 = **56.67%**

### Summary Table: Interest Match vs Selection

| Interests Selected | Matching Interests | Interest Match Score |
|-------------------|-------------------|---------------------|
| 1 (Technology)    | 1 perfect         | **100%**            |
| 2 (Tech + Problem)| 2 high            | **85%**             |
| 2 (Tech + Creative)| 1 perfect, 1 partial | **65%**        |
| 3 (Tech + Problem + Leadership) | 2 high, 1 none | **56.67%** |
| 2 (Helping + Physical) | 0 matches    | **0-15%**           |

### Example: **Healthcare Professional (Nurse)**
- **Category**: Healthcare
- **Required Skills**: Patient Care, Medical Knowledge, Clinical Skills

#### **Scenario 1: 2 Interests (Helping + Physical)**
**Helping**:
- Category Match: "Healthcare" → 0.6
- Description Match: "patient", "care" → 0.3
- Skill Match: "Patient Care" → 0.1
- **Total Score**: 1.0

**Physical**:
- Category Match: "Healthcare" → 0.6
- Description Match: "physical" → 0.3
- Skill Match: "physical therapy" → 0.0
- **Total Score**: 0.9

**Calculation**: (1.0 + 0.9) / (2 × 1.0) × 100 = **95%**

---

## 💰 **OVERALL MATCH SCORE (Free Tier)**

### Example: **Software Engineer**
Inputs:
- Subject Match: 73% (1 subject, 100% quiz)
- Interest Match: 85% (Tech + Problem Solving)
- Vision Alignment: 90% (UAE - Technology sector)

**Calculation**:
- Subject: 73% × 0.375 = 27.4%
- Interest: 85% × 0.375 = 31.9%
- Vision: 90% × 0.25 = 22.5%

**Overall Match**: 27.4% + 31.9% + 22.5% = **81.8%**

### Variations with Different Selections:

#### **Variation 1: 3 subjects, 2 interests**
- Subject Match: 100% × 0.375 = 37.5%
- Interest Match: 85% × 0.375 = 31.9%
- Vision: 90% × 0.25 = 22.5%
- **Overall**: **91.9%**

#### **Variation 2: 1 subject, 1 interest**
- Subject Match: 73% × 0.375 = 27.4%
- Interest Match: 100% × 0.375 = 37.5%
- Vision: 90% × 0.25 = 22.5%
- **Overall**: **87.4%**

#### **Variation 3: 2 subjects (50% quiz), 3 interests**
- Subject Match: 56.67% × 0.375 = 21.3%
- Interest Match: 56.67% × 0.375 = 21.3%
- Vision: 90% × 0.25 = 22.5%
- **Overall**: **65.1%**

---

## 💎 **PAID TIER CALCULATIONS**

### Component Weights (Premium Tier)
- **Subject Match**: 35% weight
- **Interest Match**: 35% weight (NOT USED - replaced by Kolb/RIASEC)
- **Vision Alignment**: 30% weight
- **Kolb Learning Style**: 10% weight
- **RIASEC (Holland Code)**: 30% weight
- **CVQ (Cultural Values)**: 20% weight
- **WEF Skills**: 0% weight (analysis only, not scored)
- **Market Demand**: 0% weight (disabled)

**After normalization** (active components):
- **Subject Match**: ~27% effective weight (35/130)
- **Vision Alignment**: ~23% effective weight (30/130)
- **Kolb**: ~7.7% effective weight (10/130)
- **RIASEC**: ~23% effective weight (30/130)
- **CVQ**: ~15.4% effective weight (20/130)

---

## 📊 **SUBJECT MATCH (Paid Tier)**

**Formula**: Same as Free Tier
`(Preference % × 0.4) + (Competency % × 0.6)`

### Same Results as Free Tier

| Subjects Selected | Quiz Score | Subject Match |
|-------------------|------------|---------------|
| 1/3 match         | 100%       | **73.33%**    |
| 2/3 match         | 100%       | **86.67%**    |
| 3/3 match         | 100%       | **100%**      |
| 1/3 match         | 75%        | **58.33%**    |
| 1/3 match         | 50%        | **43.33%**    |

---

## 🎓 **KOLB LEARNING STYLE MATCH (Paid Tier Only)**

Premium users take 24-question Kolb assessment → produces learning style scores:
- **Diverging** (Concrete Experience + Reflective Observation)
- **Assimilating** (Abstract Conceptualization + Reflective Observation)
- **Converging** (Abstract Conceptualization + Active Experimentation)
- **Accommodating** (Concrete Experience + Active Experimentation)

### Career Affinity Matching

Each career has affinity scores for each learning style (stored in database).

#### **Example: Software Engineer**
Learning Style Affinities:
- Converging: 0.9 (90%)
- Assimilating: 0.8 (80%)
- Accommodating: 0.3 (30%)
- Diverging: 0.2 (20%)

#### **Scenario 1: Student is Converging (85%)**
- Student Scores: {Converging: 85, Assimilating: 60, Accommodating: 40, Diverging: 30}
- Dominant Style: Converging (85%)
- Career Affinity for Converging: 0.9

**Kolb Match**: 85% × 0.9 = **76.5%**

#### **Scenario 2: Student is Diverging (80%)**
- Student Scores: {Diverging: 80, Assimilating: 55, Converging: 45, Accommodating: 35}
- Dominant Style: Diverging (80%)
- Career Affinity for Diverging: 0.2

**Kolb Match**: 80% × 0.2 = **16%**

---

## 🧠 **RIASEC PERSONALITY MATCH (Paid Tier Only)**

Premium users take 30-question RIASEC assessment → produces Holland Code scores:
- **Realistic** (R) - Hands-on, practical, mechanical
- **Investigative** (I) - Analytical, scientific, intellectual
- **Artistic** (A) - Creative, expressive, original
- **Social** (S) - Helpful, collaborative, empathetic
- **Enterprising** (E) - Persuasive, leadership, entrepreneurial
- **Conventional** (C) - Organized, detail-oriented, structured

### Career Affinity Matching

Each career has RIASEC affinity scores (stored in database).

#### **Example: Software Engineer**
RIASEC Affinities:
- Investigative (I): 0.9 (90%)
- Realistic (R): 0.7 (70%)
- Conventional (C): 0.6 (60%)
- Artistic (A): 0.4 (40%)
- Enterprising (E): 0.3 (30%)
- Social (S): 0.2 (20%)

#### **Scenario 1: Student Profile (I-R-C)**
Student Normalized Scores:
- Investigative: 85%
- Realistic: 75%
- Conventional: 60%
- Others: <50%

**RIASEC Match Calculation**:
- Weighted correlation: (0.85 × 0.9) + (0.75 × 0.7) + (0.60 × 0.6) + (low scores × low affinities)
- Total: 0.765 + 0.525 + 0.36 + ~0.1 = 1.75
- Normalized: 1.75 / 2.0 = **87.5%**

#### **Scenario 2: Student Profile (S-A-E)**
Student Normalized Scores:
- Social: 90%
- Artistic: 80%
- Enterprising: 70%
- Others: <50%

**RIASEC Match Calculation**:
- Weighted correlation: (0.90 × 0.2) + (0.80 × 0.4) + (0.70 × 0.3) + (low scores × high affinities)
- Total: 0.18 + 0.32 + 0.21 + ~0.3 = 1.01
- Normalized: 1.01 / 2.0 = **50.5%**

---

## 🌍 **CVQ (CULTURAL VALUES) MATCH (Paid Tier Only)**

Premium users complete CVQ questionnaire → produces values scores across 21 items:
- Achievement, Benevolence, Universalism, Self-Direction, etc.

### Alignment with Country Vision

#### **Example: UAE Vision + Software Engineer**

Student CVQ Results (normalized):
- Achievement: 85%
- Self-Direction: 80%
- Universalism: 70%
- Benevolence: 65%

UAE Priority Values for Technology Sector:
- Achievement: High priority (0.9)
- Self-Direction: High priority (0.9)
- Innovation: High priority (1.0)
- Tradition: Medium priority (0.5)

**CVQ Match**: Weighted average of student values × country priorities
**Result**: ~**75-85%** for technology careers in UAE

---

## 💰 **OVERALL MATCH SCORE (Paid Tier)**

### Example: **Software Engineer** (Premium User)

Inputs:
- **Subject Match**: 73% (1 subject, 100% quiz)
- **Vision Alignment**: 90% (UAE - Technology)
- **Kolb Match**: 76.5% (Converging style)
- **RIASEC Match**: 87.5% (I-R-C profile)
- **CVQ Match**: 80% (Achievement/Innovation values)

**Calculation** (normalized weights):
- Subject: 73% × 0.27 = 19.7%
- Vision: 90% × 0.23 = 20.7%
- Kolb: 76.5% × 0.077 = 5.9%
- RIASEC: 87.5% × 0.23 = 20.1%
- CVQ: 80% × 0.154 = 12.3%

**Overall Match**: 19.7% + 20.7% + 5.9% + 20.1% + 12.3% = **78.7%**

### Variations:

#### **Variation 1: Perfect Subject Match (3 subjects, 100%)**
- Subject: 100% × 0.27 = 27%
- Vision: 90% × 0.23 = 20.7%
- Kolb: 76.5% × 0.077 = 5.9%
- RIASEC: 87.5% × 0.23 = 20.1%
- CVQ: 80% × 0.154 = 12.3%
- **Overall**: **86%**

#### **Variation 2: Mismatched Personality (S-A-E profile)**
- Subject: 73% × 0.27 = 19.7%
- Vision: 90% × 0.23 = 20.7%
- Kolb: 16% × 0.077 = 1.2%
- RIASEC: 50.5% × 0.23 = 11.6%
- CVQ: 80% × 0.154 = 12.3%
- **Overall**: **65.5%**

---

## 📈 **COMPARISON SUMMARY**

### Free Tier: Top Score Scenario
- 3 subjects (100% quiz) + 2 perfect interests + high vision
- **Overall Match**: ~**91-93%**

### Paid Tier: Top Score Scenario  
- 3 subjects (100% quiz) + matching Kolb/RIASEC + aligned CVQ + high vision
- **Overall Match**: ~**85-90%**

### Key Differences:
1. **Free Tier** relies heavily on self-reported interests (can reach higher scores more easily)
2. **Paid Tier** uses scientifically-validated assessments (more accurate but harder to achieve perfect matches)
3. **Paid Tier** provides deeper insights through personality and values assessment
4. **Free Tier** simpler but less predictive
5. **Paid Tier** more comprehensive and professionally validated

---

**Last Updated**: November 15, 2025
