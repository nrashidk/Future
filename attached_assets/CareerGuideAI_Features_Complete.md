# Future Pathways (CareerGuideAI) - Complete Feature Documentation

## Overview
Future Pathways is a comprehensive career guidance platform for students aged 13-18. The system supports multiple user types with different access levels and features.

---

## User Roles & Features

### 1. Guest Users (Explore as Guest)
**Access:** No login required, limited exploration

| Feature | Description |
|---------|-------------|
| Basic Assessment (7 steps) | Complete free-tier assessment flow |
| Demographics Entry | Name, Age, Gender, Current Grade |
| Subject Selection | Select subjects they enjoy/excel at |
| Priority Subjects | If 3+ subjects selected, choose top 3 priorities |
| Interests Selection | "What Gets You Excited?" preferences |
| Personality Traits | Self-assessment of personality characteristics |
| Country Selection | Select country and curriculum |
| Aspirations | Share career goals and aspirations |
| Subject Competency Quiz | Curriculum-aligned MCQ quiz based on grade/subjects |
| Basic Career Recommendations | Top career matches based on interests & subjects |
| Results Page | View career matches with basic match scores |
| Session Persistence | Progress saved in browser session |

**Limitations:**
- Cannot save progress permanently
- No access to premium assessments (Kolb, RIASEC, CVQ)
- No personalized narratives or detailed insights
- Cannot download PDF reports
- No education pathway recommendations

---

### 2. Free Registered Users
**Access:** Login via Google, Microsoft, or email registration

| Feature | Description |
|---------|-------------|
| All Guest Features | Everything available to guests |
| Account Creation | Register with Google/Microsoft OAuth or email/password |
| Progress Saving | Assessment progress saved to account |
| Assessment History | View past completed assessments |
| Profile Management | Update personal information |
| Password Reset | Secure email-based password reset flow |
| Tier Selection | Choose to upgrade to Premium |
| Stripe Payment | Purchase individual premium assessment |

**Assessment Flow (7 Steps):**
1. Demographics
2. Subjects
3. Interests
4. Personality
5. Country
6. Aspirations
7. Subject Competency Quiz

**Results Include:**
- Top career matches with match percentages
- Subject alignment breakdown
- Country vision alignment
- Basic career descriptions
- UAE 2030/2071 vision relevance (if UAE selected)

---

### 3. Individual Premium Users
**Access:** Purchased premium assessment via Stripe

| Feature | Description |
|---------|-------------|
| All Free User Features | Everything available to free users |
| Premium Assessment (8 steps) | Full scientifically-validated assessment |
| Kolb Learning Style Assessment | Discover learning style (Diverging, Assimilating, Converging, Accommodating) |
| RIASEC/Holland Code Assessment | Career personality profiling (Realistic, Investigative, Artistic, Social, Enterprising, Conventional) |
| CVQ Personal Values Assessment | 21-question values inventory with pagination |
| Enhanced Career Matching | Additional scoring algorithms using Kolb, RIASEC, CVQ data |
| Personalized Learning Tips | Study strategies based on learning style |
| Work Style Fit Analysis | How personality matches each career |
| Strengths & Growth Areas | Personalized insights for each career match |
| Enhanced Action Steps | Detailed next steps for career preparation |
| Education Pathways | LLM-generated university/program recommendations with CAA-verified UAE institutions |
| PDF Report Download | Comprehensive printable career roadmap |
| Premium Narratives | AI-generated personalized career explanations |

**Premium Assessment Flow (8 Steps):**
1. Demographics
2. Subjects
3. Country
4. Subject Competency Quiz
5. Kolb Learning Style
6. RIASEC Career Personality
7. CVQ Personal Values
8. Review & Submit

**Premium Results Include:**
- Everything from Free tier PLUS:
- Learning Style badge and description
- Personalized study strategies
- RIASEC profile breakdown
- Top values from CVQ assessment
- "Why This Career?" LLM-generated narratives
- Work style compatibility
- Strengths matching each career
- Growth areas for improvement
- Enhanced action steps with timelines
- Education Pathways button (generates university recommendations)

---

### 4. School Students (org_student)
**Access:** Credentials provided by School Admin

| Feature | Description |
|---------|-------------|
| Dedicated Login Portal | Student-specific login page |
| Pre-filled Demographics | Grade level set by school admin |
| Pre-selected Country/Curriculum | Automatically use school's configured settings |
| Premium Assessment Access | Full 8-step premium assessment (if school has licenses) |
| All Premium Features | Kolb, RIASEC, CVQ, Education Pathways, PDF Reports |
| Multi-Grade Progress Tracking | Track career evolution across grades (9→10→11→12) |
| Assessment Consistency Analysis | See how career interests change over academic years |
| Results Sharing | Share results with school admin/counselors |

**School Student Login:**
- Username: Organization-generated username
- Password: School-provided or self-reset password
- Organization pre-selects country and curriculum

**Unique Features:**
- Assessments tagged with academic year and grade
- Progress visible to school administrators
- Credential download after account creation
- Password reset through school admin

---

### 5. School Administrators (org_admin)
**Access:** Admin credentials provided during school registration/purchase

| Feature | Description |
|---------|-------------|
| School Dashboard | Centralized management interface |
| School Profile Management | Edit school name, logo, default country, curriculum |
| Student Management | Add, edit, delete student accounts |
| Single Student Creation | Manual entry with auto-generated credentials |
| Bulk CSV Import | Upload student roster via CSV file |
| Credential Download | Export student usernames/passwords |
| Password Management | Reset individual or bulk student passwords |
| License Tracking | View total, used, and remaining licenses |
| Assessment Analytics | View student completion rates and statistics |
| Student Results Access | View any student's assessment results |
| PDF Report Export | Download student career reports |
| CSV Data Export | Export student data and assessment results |
| Contribute Questions | Submit quiz questions for reward credits |
| Single Question Entry | Manual MCQ creation form |
| Bulk Question Upload | CSV upload for multiple questions |
| Reward Credit Tracking | View earned, pending, and used credits |
| Announcement Viewing | See superadmin-published announcements |

**Student Management Actions:**
- Add single student (name, username, grade)
- Bulk add via CSV (columns: firstName, lastName, username, grade)
- Reset password (individual or bulk)
- Delete student accounts
- View student assessment status
- Export credentials as CSV

**Question Contribution Workflow:**
1. Submit questions (single or bulk)
2. AI pre-verification
3. Superadmin review
4. If approved: 5 questions = 1 assessment credit
5. Credits added to school's reward balance
6. Credits can be used like regular licenses

**CSV Format for Questions:**
```
question,optionA,optionB,optionC,optionD,correctAnswer,explanation,topic,difficulty,cognitiveLevel
```

---

### 6. Superadmin
**Access:** Email in SUPERADMIN_EMAILS environment variable

| Feature | Description |
|---------|-------------|
| Full System Access | All platform features and administrative controls |

**Dashboard Metrics:**
- Total schools count
- Total admins count
- Total students count
- License utilization rates
- Assessment completion statistics

**Schools Tab:**
| Feature | Description |
|---------|-------------|
| Create School | Manual creation with name, admin, licenses |
| Edit School Details | Modify name, logo, country, curriculum |
| Manage Licenses | Add/remove regular licenses |
| Unlimited License Toggle | Grant unlimited assessments |
| Assign Additional Admins | Add co-administrators |
| View School Statistics | Student count, completion rates |
| Delete School | With confirmation and cascade |
| Bulk School Deletion | Multi-select and delete |

**Students Tab:**
| Feature | Description |
|---------|-------------|
| View All Students | Across all organizations |
| Search & Filter | By name, school, status |
| Reset Password | Individual student passwords |
| Bulk Password Reset | Multi-select reset |
| View Assessment Results | Access any student's results |
| Impersonate User | Login as any user for debugging |
| Export Student Data | CSV export with all fields |

**Recent Activity Tab:**
| Feature | Description |
|---------|-------------|
| Activity Log | Recent school/admin actions |
| Event Types | License changes, admin changes, etc. |
| Timestamps | When events occurred |

**Files Tab:**
| Feature | Description |
|---------|-------------|
| File Management | View uploaded files system-wide |
| Secure File Sharing | Time-limited access tokens |
| File Tracking | Metadata and upload history |

**Announcements Tab:**
| Feature | Description |
|---------|-------------|
| Create Announcements | Title, content, background color |
| Schedule Publishing | Set future publish date |
| Target Audience | Visible to School Admins and Individual Users only |
| Edit/Delete | Modify or remove announcements |
| Color Customization | Choose banner background color |

**Careers Tab:**
| Feature | Description |
|---------|-------------|
| View All Careers | Complete career catalog (36 careers) |
| Add New Career | Create with full details |
| Edit Career Details | Title, description, required skills |
| Set Holland Codes | RIASEC affinity scores |
| Link to WEF Skills | Map careers to 16 WEF skills |
| Job Market Data | Demand trends, salaries |

**Countries Tab:**
| Feature | Description |
|---------|-------------|
| View Countries | All configured countries/curricula |
| Add Country | Manual or LLM-assisted creation |
| LLM Country Generation | Auto-generate country vision, mission, priorities |
| Configure Curricula | Add curriculum options per country |
| Generate Quiz Questions | LLM-based question generation by curriculum |

**Subjects Tab:**
| Feature | Description |
|---------|-------------|
| View All Subjects | Subject catalog |
| Add Subject | Create new subject |
| Edit Subject | Modify name, curriculum links |
| Delete Subject | Remove from system |
| Subject-Curriculum Mapping | Link subjects to specific curricula |

**Scoring Tab:**
| Feature | Description |
|---------|-------------|
| View Scoring Tiers | Free, Premium, School configurations |
| Modify Weights | Adjust scoring algorithm weights |
| Component Configuration | Subject match, Interest match, Vision alignment, etc. |
| LLM Prompt Management | Edit AI prompt templates |
| "Why This Career?" Prompt | Customize career explanation prompts |
| "Education Pathways" Prompt | Customize university recommendation prompts |

**Contributions Tab:**
| Feature | Description |
|---------|-------------|
| Pending Review Queue | Questions awaiting approval |
| AI Pre-verification Status | Auto-check results |
| Approve/Reject Questions | Manual quality control |
| Allocate Reward Credits | Add credits to school's balance |
| Track Yearly Limits | Monitor 50 questions/year cap |
| View Contribution History | Past submissions and approvals |

**Quiz Section:**
| Feature | Description |
|---------|-------------|
| View All Questions | System-wide question bank |
| Filter by Subject/Grade/Curriculum | Organized question browsing |
| Add Questions | Create new quiz questions |
| Edit Questions | Modify existing questions |
| Delete Questions | Remove from question bank |
| Contribution Integration | Approved questions auto-added here |

**Analytics Section:**
| Feature | Description |
|---------|-------------|
| Total Students | Platform-wide count |
| Completion Rate | Assessment completion percentage |
| Top Grades | Most active grade levels |
| Top Careers | Most matched career paths |
| Country Breakdown | Student distribution by country |
| Career Trends | Popular career choices over time |
| Organization Analytics | School-by-school statistics |

---

## Assessment Components Summary

| Component | Free | Premium | Description |
|-----------|------|---------|-------------|
| Demographics | Yes | Yes | Basic info (name, age, gender, grade) |
| Subject Selection | Yes | Yes | Choose subjects of interest |
| Priority Subjects | Yes | Yes | Top 3 if 3+ selected |
| Interests | Yes | No* | "What Gets You Excited?" |
| Personality | Yes | No* | Self-assessed traits |
| Country/Curriculum | Yes | Yes | Location and education system |
| Aspirations | Yes | No* | Career goals and dreams |
| Subject Quiz | Yes | Yes | Curriculum-aligned MCQs |
| Kolb Learning Style | No | Yes | 12-question scientifically-validated assessment |
| RIASEC/Holland Code | No | Yes | 48-question career personality test |
| CVQ Personal Values | No | Yes | 21-question values assessment (3 per page) |

*Premium users have these components integrated differently in the assessment flow.

---

## Technical Features

### Authentication
- Google OAuth 2.0
- Microsoft OAuth
- Email/Password with secure hashing (bcrypt)
- Session management with 24-hour timeout
- Password reset via email (Resend integration)
- Guest session with migration to registered account

### Security
- Rate limiting on sensitive endpoints
- Helmet security headers
- CSRF protection
- Input sanitization (DOMPurify)
- Role-based access control
- Cryptographic guest tokens
- Environment-based superadmin configuration

### Database
- PostgreSQL (Neon-backed)
- Drizzle ORM with migrations
- Indexed queries for performance
- N+1 query elimination

### Payment
- Stripe integration (test mode available)
- Individual assessment purchases
- Group/school license purchases
- Self-service checkout

### Reporting
- PDF generation (Puppeteer)
- CSV data export
- Bulk operations support
- File archiving (Archiver)

### LLM Integration
- OpenAI for narrative generation
- Configurable prompt templates
- Education pathway recommendations
- Question generation for curricula
- Country data generation

---

## Platform URLs

| URL | Description | Access |
|-----|-------------|--------|
| `/` | Landing page | Public |
| `/assessment` | Start assessment | All users |
| `/tier-selection` | Choose Free/Premium | Registered users |
| `/checkout` | Stripe payment | Registered users |
| `/results/:id` | View assessment results | Assessment owner |
| `/results/:id/print` | Printable PDF view | Premium users |
| `/login` | Login page | Public |
| `/register` | Registration page | Public |
| `/student-login` | School student login | Students |
| `/forgot-password` | Password reset request | Public |
| `/reset-password` | Complete password reset | With token |
| `/profile` | User profile | Logged in users |
| `/progress` | Multi-grade progress | Premium users |
| `/analytics` | Public analytics | Superadmin |
| `/admin` | Quiz management | Admins |
| `/admin/organizations` | School dashboard | Org admins |
| `/superadmin` | Superadmin dashboard | Superadmin only |
| `/group-pricing` | School license pricing | Public |
| `/privacy-policy` | Privacy policy | Public |
| `/terms-of-use` | Terms of use | Public |
| `/disclaimer` | Disclaimer | Public |

---

## Notes for Freelancer Testing

### Test Scenarios by User Type

**Guest User Testing:**
1. Click "Explore as Guest" on landing page
2. Complete 7-step assessment without login
3. Verify basic career recommendations display
4. Confirm cannot access premium features

**Free User Testing:**
1. Register with email or OAuth
2. Complete free assessment flow
3. Check assessment saved to profile
4. Attempt premium features (should be blocked)
5. Test password reset flow

**Premium User Testing:**
1. Complete Stripe payment (use test card: 4242 4242 4242 4242)
2. Complete full 8-step premium assessment
3. Verify Kolb, RIASEC, CVQ steps work
4. Check all premium insights display
5. Test Education Pathways generation
6. Download PDF report

**School Student Testing:**
1. Get credentials from school admin
2. Login at `/student-login`
3. Verify country/curriculum pre-filled
4. Complete premium assessment
5. Check multi-grade tracking (if applicable)

**School Admin Testing:**
1. Login with admin credentials
2. Add single student manually
3. Test bulk CSV import
4. Export student credentials
5. Reset student password
6. View student assessment results
7. Submit question contribution
8. Check reward credits

**Superadmin Testing:**
1. Login with superadmin email
2. Access `/superadmin` dashboard
3. Create new school
4. Manage licenses
5. Review pending contributions
6. Create announcement
7. Check analytics
8. Impersonate a user

---

*Document generated: December 2024*
*Version: 1.0*
