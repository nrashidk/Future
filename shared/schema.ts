import { sql } from "drizzle-orm";
import {
  index,
  uniqueIndex,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - for PostgreSQL session store
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - supports OAuth and local authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phone: varchar("phone"), // Phone number for checkout/contact
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"), // 'user', 'admin'
  
  // OAuth provider tracking
  oauthProvider: varchar("oauth_provider"), // 'google', 'microsoft', or null for local auth
  oauthProviderId: varchar("oauth_provider_id"), // OAuth provider's user ID
  
  // Organization-generated student accounts
  username: varchar("username").unique(),
  passwordHash: varchar("password_hash"), // Hashed password (bcrypt/argon2)
  accountType: text("account_type").notNull().default("individual"), // 'individual', 'org_admin', 'org_student'
  isOrgGenerated: boolean("is_org_generated").notNull().default(false),
  
  // Premium subscription
  isPremium: boolean("is_premium").notNull().default(false),
  purchasedLicenses: integer("purchased_licenses").default(0), // Track purchased assessment licenses
  stripeCustomerId: varchar("stripe_customer_id"),
  paymentDate: timestamp("payment_date"),
  
  // Activity tracking
  lastLoginAt: timestamp("last_login_at"), // Track last login time for activity status
  
  // Language preference
  preferredLanguage: varchar("preferred_language", { length: 5 }).default("en"), // 'en' or 'ar'
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("users_oauth_provider_idx").on(table.oauthProvider, table.oauthProviderId),
]);

export const usersRelations = relations(users, ({ many, one }) => ({
  assessments: many(assessments),
  uploadedFiles: many(files),
  organizationMembership: one(organizationMembers, {
    fields: [users.id],
    references: [organizationMembers.userId],
  }),
  ownedOrganization: one(organizations, {
    fields: [users.id],
    references: [organizations.adminUserId],
  }),
  passwordResetTokens: many(passwordResetTokens),
}));

// Password Reset Tokens - for secure password reset flow
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(), // Cryptographically secure random token
  expiresAt: timestamp("expires_at").notNull(), // Token expiration (typically 1 hour)
  usedAt: timestamp("used_at"), // When the token was used (null if not used)
  createdAt: timestamp("created_at").defaultNow(),
});

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

// Organizations (Schools/Institutions)
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
  logoUrl: text("logo_url"), // School logo URL
  
  // License tracking
  totalLicenses: integer("total_licenses").notNull(),
  usedLicenses: integer("used_licenses").notNull().default(0),
  isUnlimitedLicenses: boolean("is_unlimited_licenses").notNull().default(false), // Superadmin can create orgs with unlimited licenses
  
  // Reward credits from quiz contributions (5 approved questions = 1 assessment credit)
  rewardCredits: integer("reward_credits").notNull().default(0), // Allocated by superadmin
  rewardCreditsUsed: integer("reward_credits_used").notNull().default(0),
  pendingRewardCredits: integer("pending_reward_credits").notNull().default(0), // Approved but not yet allocated
  yearlyContributionCount: integer("yearly_contribution_count").notNull().default(0), // Reset yearly, max 50/year
  lastContributionResetYear: integer("last_contribution_reset_year"), // Year of last reset (e.g., 2025)
  
  // Settings
  passwordComplexity: text("password_complexity").notNull().default("medium"), // 'easy', 'medium', 'strong'
  countryId: varchar("country_id"), // Optional pre-filled country for all students
  curriculum: text("curriculum"), // Selected curriculum for this school (e.g., 'MoE National', 'CBSE', 'IB', 'American')
  
  // Payment info
  purchaseDate: timestamp("purchase_date").defaultNow(),
  stripePaymentId: varchar("stripe_payment_id"),
  amountPaid: real("amount_paid"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  admin: one(users, {
    fields: [organizations.adminUserId],
    references: [users.id],
  }),
  country: one(countries, {
    fields: [organizations.countryId],
    references: [countries.id],
  }),
  members: many(organizationMembers),
  files: many(files),
}));

// Organization Members (Students in schools)
export const organizationMembers = pgTable("organization_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  userId: varchar("user_id").notNull().unique().references(() => users.id), // User can only belong to one organization
  
  // Student information (can be pre-filled by school admin)
  studentId: text("student_id"), // School's own student ID
  studentName: text("student_name"), // Pre-filled student name
  studentAge: integer("student_age"), // Pre-filled student age
  studentGender: text("student_gender"), // Pre-filled student gender ('male' or 'female')
  grade: text("grade"), // Pre-filled grade ('grade8', 'grade9', etc.)
  role: text("role").notNull().default("student"), // 'student' or 'admin'
  isPrimaryAdmin: boolean("is_primary_admin").notNull().default(false), // True for the original admin created with the organization
  
  // Quota tracking
  hasCompletedAssessment: boolean("has_completed_assessment").notNull().default(false),
  assessmentCompletedAt: timestamp("assessment_completed_at"),
  isLocked: boolean("is_locked").notNull().default(false),
  
  // Admin actions audit
  passwordLastResetBy: varchar("password_last_reset_by"),
  passwordLastResetAt: timestamp("password_last_reset_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

// Countries with mission/vision data
export const countries = pgTable("countries", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  code: varchar("code", { length: 3 }).notNull().unique(),
  abbreviation: text("abbreviation"), // Short name for display (UAE, USA, UK) - null means use full name
  mission: text("mission").notNull(),
  vision: text("vision").notNull(),
  visionPlan: text("vision_plan"),
  prioritySectors: text("priority_sectors").array().notNull(),
  nationalGoals: text("national_goals").array().notNull(),
  targets: jsonb("targets"),
  flag: text("flag"),
  
  // Enhanced country configuration for multi-country support
  educationSystem: text("education_system"), // Description of the country's education system
  universitiesLink: text("universities_link"), // Link to accredited universities (e.g., CAA for UAE)
  universitiesLinkLabel: text("universities_link_label"), // Display label for the link
  curricula: text("curricula").array(), // Available curricula (e.g., ['National', 'CBSE', 'IB', 'American'])
  subjects: text("subjects").array(), // Subjects taught in schools (country-specific names)
  gradeLevels: text("grade_levels").array(), // Supported grade levels (e.g., ['8', '9', '10', '11', '12'])
  logoUrl: text("logo_url"), // Country logo for reports
  reportTheme: jsonb("report_theme"), // Custom colors/branding for reports
  isActive: boolean("is_active").notNull().default(true), // Whether country is available for assessments
  llmPopulated: boolean("llm_populated").notNull().default(false), // Whether data was auto-populated by LLM
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const countriesRelations = relations(countries, ({ many }) => ({
  assessments: many(assessments),
  jobMarketTrends: many(jobMarketTrends),
  prioritySectors: many(countryPrioritySectors),
  subjects: many(subjects),
}));

// Curriculum-scoped subjects for quiz questions
// Each curriculum can have its own set of subjects with different content
export const subjects = pgTable("subjects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Display name (e.g., "Mathematics")
  code: varchar("code", { length: 50 }).notNull(), // Slug/key (e.g., "mathematics")
  countryId: varchar("country_id").notNull().references(() => countries.id),
  curriculum: text("curriculum").notNull(), // e.g., 'MoE National', 'British', 'IB', 'American'
  description: text("description"), // Brief description of the subject
  aliases: text("aliases").array(), // Alternative names that map to this subject (e.g., ['Math', 'Maths'])
  displayOrder: integer("display_order").notNull().default(0), // Order in UI
  isActive: boolean("is_active").notNull().default(true), // Whether subject is available
  icon: text("icon"), // Lucide icon name for UI
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("subjects_curriculum_code_idx").on(table.countryId, table.curriculum, table.code),
  index("subjects_country_curriculum_idx").on(table.countryId, table.curriculum),
]);

export const subjectsRelations = relations(subjects, ({ one }) => ({
  country: one(countries, {
    fields: [subjects.countryId],
    references: [countries.id],
  }),
}));

// Insert/Select types for subjects
export const insertSubjectSchema = createInsertSchema(subjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Subject = typeof subjects.$inferSelect;

// Future skills taxonomy (legacy - kept for backward compatibility)
// NOTE: WEF skills framework now uses wef_skills table for normalized WEF-specific data
export const skills = pgTable("skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  description: text("description"),
  relatedSubjects: text("related_subjects").array().notNull(),
  demandLevel: text("demand_level").notNull(),
  futureRelevance: integer("future_relevance").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// WEF (World Economic Forum) 16 Skills Framework
export const wefSkills = pgTable("wef_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  competencyType: text("competency_type").notNull(), // 'foundational_literacy' or 'competency'
  category: text("category").notNull(), // 'Literacy', 'Numeracy', 'Critical Thinking', etc.
  description: text("description").notNull(),
  displayOrder: integer("display_order").notNull(), // 1-16 for UI ordering
  assessmentApplicable: boolean("assessment_applicable").notNull().default(false), // true for competencies, false for literacies
  relatedSubjects: text("related_subjects").array(), // Links to subjects for literacy skills
  version: text("version").notNull().default("2025"), // WEF framework version
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("wef_skills_display_order_idx").on(table.displayOrder, table.version),
]);

export const wefSkillsRelations = relations(wefSkills, ({ many }) => ({
  careerAffinities: many(careerWefSkillAffinities),
  sectorMappings: many(countrySectorWefSkills),
}));

// Career-WEF Skill affinity scores
export const careerWefSkillAffinities = pgTable("career_wef_skill_affinities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  careerId: varchar("career_id").notNull().references(() => careers.id),
  wefSkillId: varchar("wef_skill_id").notNull().references(() => wefSkills.id),
  affinityScore: integer("affinity_score").notNull(), // 0-100
  evidence: jsonb("evidence"), // Optional: O*NET mapping, expert judgment, etc.
  source: text("source"), // 'O*NET', 'WEF', 'Expert Panel', etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("career_wef_skill_unique_idx").on(table.careerId, table.wefSkillId),
  index("career_wef_skill_career_idx").on(table.careerId),
  index("career_wef_skill_skill_idx").on(table.wefSkillId),
]);

export const careerWefSkillAffinitiesRelations = relations(careerWefSkillAffinities, ({ one }) => ({
  career: one(careers, {
    fields: [careerWefSkillAffinities.careerId],
    references: [careers.id],
  }),
  wefSkill: one(wefSkills, {
    fields: [careerWefSkillAffinities.wefSkillId],
    references: [wefSkills.id],
  }),
}));

// WEF Competency Assessment Results (for students)
export const wefCompetencyResults = pgTable("wef_competency_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").unique().notNull().references(() => assessments.id),
  userId: varchar("user_id").references(() => users.id), // Nullable for guest assessments
  isGuest: boolean("is_guest").notNull().default(false),
  guestSessionId: varchar("guest_session_id"),
  
  // Version tracking
  version: text("version").notNull().default("2025"),
  
  // Assessment data
  rawResponses: jsonb("raw_responses").notNull(), // { "critical_thinking_1": 4, "creativity_2": 5, ... }
  normalizedScores: jsonb("normalized_scores").notNull(), // { critical_thinking: 85, creativity: 92, ... } (0-100)
  topCompetencies: text("top_competencies").array().notNull(), // ["creativity", "critical_thinking", "collaboration"]
  
  // Quality metrics
  completionSeconds: integer("completion_seconds"),
  lowVariance: boolean("low_variance").notNull().default(false),
  rushedCompletion: boolean("rushed_completion").notNull().default(false),
  
  submittedAt: timestamp("submitted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("wef_competency_user_submitted_idx").on(table.userId, table.submittedAt),
]);

export const wefCompetencyResultsRelations = relations(wefCompetencyResults, ({ one }) => ({
  assessment: one(assessments, {
    fields: [wefCompetencyResults.assessmentId],
    references: [assessments.id],
  }),
  user: one(users, {
    fields: [wefCompetencyResults.userId],
    references: [users.id],
  }),
}));

// Country Priority Sectors (normalizing countries.prioritySectors array)
export const countryPrioritySectors = pgTable("country_priority_sectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryId: varchar("country_id").notNull().references(() => countries.id),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("country_sector_unique_idx").on(table.countryId, table.name),
  index("country_sector_country_idx").on(table.countryId),
]);

export const countryPrioritySectorsRelations = relations(countryPrioritySectors, ({ one, many }) => ({
  country: one(countries, {
    fields: [countryPrioritySectors.countryId],
    references: [countries.id],
  }),
  wefSkillMappings: many(countrySectorWefSkills),
}));

// Junction: Country Sectors ↔ WEF Skills
export const countrySectorWefSkills = pgTable("country_sector_wef_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectorId: varchar("sector_id").notNull().references(() => countryPrioritySectors.id),
  wefSkillId: varchar("wef_skill_id").notNull().references(() => wefSkills.id),
  importance: integer("importance").notNull(), // 0-100: how critical this skill is for this sector
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("sector_wef_skill_unique_idx").on(table.sectorId, table.wefSkillId),
  index("sector_wef_skill_sector_idx").on(table.sectorId),
  index("sector_wef_skill_skill_idx").on(table.wefSkillId),
]);

export const countrySectorWefSkillsRelations = relations(countrySectorWefSkills, ({ one }) => ({
  sector: one(countryPrioritySectors, {
    fields: [countrySectorWefSkills.sectorId],
    references: [countryPrioritySectors.id],
  }),
  wefSkill: one(wefSkills, {
    fields: [countrySectorWefSkills.wefSkillId],
    references: [wefSkills.id],
  }),
}));

// Careers/job roles
export const careers = pgTable("careers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  titleAr: text("title_ar"), // Arabic translation of title
  descriptionAr: text("description_ar"), // Arabic translation of description
  requiredSkills: text("required_skills").array().notNull(),
  relatedSubjects: text("related_subjects").array().notNull(),
  category: text("category").notNull(),
  educationLevel: text("education_level").notNull(),
  averageSalary: text("average_salary"),
  growthOutlook: text("growth_outlook").notNull(),
  icon: text("icon"),
  
  // Country-specific careers (null = global/available everywhere)
  countryId: varchar("country_id").references(() => countries.id),
  
  // CVQ (Personal Values) integration - O*NET derived
  valuesProfile: jsonb("values_profile"), // { achievement: 80, honesty: 90, kindness: 75, ... }
  onetCode: varchar("onet_code", { length: 15 }), // O*NET-SOC code (e.g., "17-2199.11")
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("careers_onet_code_idx").on(table.onetCode),
  index("careers_country_id_idx").on(table.countryId),
]);

export const careersRelations = relations(careers, ({ one, many }) => ({
  country: one(countries, {
    fields: [careers.countryId],
    references: [countries.id],
  }),
  jobMarketTrends: many(jobMarketTrends),
  wefSkillAffinities: many(careerWefSkillAffinities),
}));

// Job market trends by country
export const jobMarketTrends = pgTable("job_market_trends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryId: varchar("country_id").notNull().references(() => countries.id),
  careerId: varchar("career_id").notNull().references(() => careers.id),
  demandScore: real("demand_score").notNull(),
  growthRate: real("growth_rate").notNull(),
  averageSalaryLocal: text("average_salary_local"),
  openings: integer("openings"),
  nationalPriorityAlignment: real("national_priority_alignment").notNull(),
  year: integer("year").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const jobMarketTrendsRelations = relations(jobMarketTrends, ({ one }) => ({
  country: one(countries, {
    fields: [jobMarketTrends.countryId],
    references: [countries.id],
  }),
  career: one(careers, {
    fields: [jobMarketTrends.careerId],
    references: [careers.id],
  }),
}));

// Student assessments
export const assessments = pgTable("assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  isGuest: boolean("is_guest").notNull().default(false),
  guestSessionId: varchar("guest_session_id"),
  
  // Demographics
  name: text("name"),
  age: integer("age"),
  grade: text("grade"),
  gender: text("gender"),
  countryId: varchar("country_id").references(() => countries.id),
  curriculum: text("curriculum"), // Selected curriculum for this assessment (e.g., 'MoE National', 'CBSE', 'IB')
  
  // Assessment data
  assessmentType: text("assessment_type").notNull().default("basic"), // 'basic' or 'premium'
  favoriteSubjects: text("favorite_subjects").array().notNull(),
  prioritySubjects: text("priority_subjects").array(), // Up to 3 subjects marked as priority (get more quiz questions)
  interests: text("interests").array().notNull(),
  personalityTraits: jsonb("personality_traits"),
  careerAspirations: text("career_aspirations").array(),
  strengths: text("strengths").array(),
  workPreferences: jsonb("work_preferences"),
  
  // RIASEC Holland Code scores (premium only)
  riasecScores: jsonb("riasec_scores"), // { R, I, A, S, E, C, top3, ranking }
  
  // CVQ (Personal Values) scores (premium only)
  cvqScores: jsonb("cvq_scores"), // { achievement: 80, honesty: 90, ..., top3: ["honesty", "achievement", "kindness"] }
  
  // Quiz results
  quizScore: jsonb("quiz_score"),
  subjectCompetencies: jsonb("subject_competencies"),
  
  // Completion tracking
  currentStep: integer("current_step").notNull().default(1),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("assessments_user_id_idx").on(table.userId),
  index("assessments_country_id_idx").on(table.countryId),
  index("assessments_completed_idx").on(table.isCompleted),
]);

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  user: one(users, {
    fields: [assessments.userId],
    references: [users.id],
  }),
  country: one(countries, {
    fields: [assessments.countryId],
    references: [countries.id],
  }),
  recommendations: many(recommendations),
  assessmentQuizzes: many(assessmentQuizzes),
}));

// Career recommendations generated for students
export const recommendations = pgTable("recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").notNull().references(() => assessments.id),
  careerId: varchar("career_id").notNull().references(() => careers.id),
  
  // Matching scores
  overallMatchScore: real("overall_match_score").notNull(),
  subjectMatchScore: real("subject_match_score").notNull(),
  interestMatchScore: real("interest_match_score").notNull(),
  countryVisionAlignment: real("country_vision_alignment").notNull(),
  futureMarketDemand: real("future_market_demand").notNull(),
  
  // Recommendation details
  reasoning: text("reasoning").notNull(),
  actionSteps: text("action_steps").array().notNull(),
  requiredEducation: text("required_education").notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("recommendations_assessment_id_idx").on(table.assessmentId),
  index("recommendations_career_id_idx").on(table.careerId),
]);

export const recommendationsRelations = relations(recommendations, ({ one }) => ({
  assessment: one(assessments, {
    fields: [recommendations.assessmentId],
    references: [assessments.id],
  }),
  career: one(careers, {
    fields: [recommendations.careerId],
    references: [careers.id],
  }),
}));

// Quiz questions bank
export const quizQuestions = pgTable("quiz_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  questionType: text("question_type").notNull(), // multiple_choice
  options: jsonb("options"), // Array of answer options for multiple choice
  correctAnswer: text("correct_answer").notNull(), // Correct answer
  explanation: text("explanation"), // Explanation of correct answer
  questionAr: text("question_ar"), // Arabic translation of question
  optionsAr: jsonb("options_ar"), // Arabic translations of answer options
  explanationAr: text("explanation_ar"), // Arabic explanation
  
  // Subject-based metadata
  subject: text("subject").notNull(), // Mathematics, Science, English, Arabic, Social Studies, Computer Science
  gradeBand: text("grade_band"), // 8-9 or 10-12 (DEPRECATED - kept for legacy compatibility only, nullable)
  grade: integer("grade").notNull(), // Individual grade level (8, 9, 10, 11, 12) - primary field for targeting
  countryId: varchar("country_id").references(() => countries.id), // NULL = global questions, or country-specific
  curriculum: text("curriculum"), // Curriculum type (e.g., 'National', 'CBSE', 'IB', 'American') - null = applies to all
  topic: text("topic").notNull(), // Specific curriculum topic (e.g., "Algebra", "Photosynthesis")
  difficulty: text("difficulty").notNull(), // easy, medium, hard
  cognitiveLevel: text("cognitive_level").notNull(), // knowledge, comprehension, application, analysis
  
  // Source tracking
  sourceType: text("source_type").notNull().default("system"), // 'system', 'llm', 'school_contribution'
  contributedByOrgId: varchar("contributed_by_org_id").references(() => organizations.id), // Which school contributed this question
  contributionSubmissionId: varchar("contribution_submission_id"), // Link to the submission batch
  
  // LLM generation tracking
  isLlmGenerated: boolean("is_llm_generated").notNull().default(false), // Whether question was generated by LLM
  llmModel: text("llm_model"), // Which LLM model generated it (e.g., 'gpt-4o')
  
  // Academic year tracking (Sep-Jun cycle: e.g., "2025-2026" for Sep 2025 - Jun 2026)
  academicYear: text("academic_year"), // Format: "YYYY-YYYY" (e.g., "2025-2026")
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("quiz_questions_country_grade_idx").on(table.countryId, table.grade),
  index("quiz_questions_curriculum_idx").on(table.curriculum),
  index("quiz_questions_source_type_idx").on(table.sourceType),
  index("quiz_questions_contributed_by_idx").on(table.contributedByOrgId),
  index("quiz_questions_academic_year_idx").on(table.academicYear),
]);

export const quizQuestionsRelations = relations(quizQuestions, ({ many, one }) => ({
  responses: many(quizResponses),
  country: one(countries, {
    fields: [quizQuestions.countryId],
    references: [countries.id],
  }),
}));

// Assessment quiz attempts
export const assessmentQuizzes = pgTable("assessment_quizzes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").notNull().references(() => assessments.id),
  
  // Subject-based scoring results
  totalScore: real("total_score").notNull().default(0),
  subjectScores: jsonb("subject_scores"), // { "Mathematics": 85, "Science": 72, "English": 90 }
  
  // Quiz metadata
  questionsCount: integer("questions_count").notNull().default(12),
  completedAt: timestamp("completed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const assessmentQuizzesRelations = relations(assessmentQuizzes, ({ one, many }) => ({
  assessment: one(assessments, {
    fields: [assessmentQuizzes.assessmentId],
    references: [assessments.id],
  }),
  responses: many(quizResponses),
}));

// Individual quiz responses
export const quizResponses = pgTable("quiz_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentQuizId: varchar("assessment_quiz_id").notNull().references(() => assessmentQuizzes.id),
  questionId: varchar("question_id").notNull().references(() => quizQuestions.id),
  
  answer: text("answer").notNull(),
  isCorrect: boolean("is_correct"),
  score: real("score").notNull().default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("quiz_responses_assessment_quiz_id_idx").on(table.assessmentQuizId),
  index("quiz_responses_question_id_idx").on(table.questionId),
]);

export const quizResponsesRelations = relations(quizResponses, ({ one }) => ({
  assessmentQuiz: one(assessmentQuizzes, {
    fields: [quizResponses.assessmentQuizId],
    references: [assessmentQuizzes.id],
  }),
  question: one(quizQuestions, {
    fields: [quizResponses.questionId],
    references: [quizQuestions.id],
  }),
}));

// CVQ (Children's Values Questionnaire) - Question Items
export const cvqItems = pgTable("cvq_items", {
  id: varchar("id").primaryKey(), // CVQ-A1, CVQ-H1, etc.
  domain: text("domain").notNull(), // achievement, honesty, kindness, respect, responsibility, peacefulness, environment
  text: text("text").notNull(), // Question text
  textAr: text("text_ar"), // Arabic translation of question text
  isReverseScored: boolean("is_reverse_scored").notNull().default(false),
  position: integer("position").notNull(), // 1-3 within domain
  version: text("version").notNull().default("1.0.0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("cvq_items_version_active_idx").on(table.version, table.isActive),
  // Unique constraint to prevent duplicate items per domain/position/version
  uniqueIndex("cvq_items_unique_idx").on(table.domain, table.position, table.version),
]);

// CVQ Results - User responses and computed scores
export const cvqResults = pgTable("cvq_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").unique().references(() => assessments.id), // Unique: one canonical result per assessment
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Version tracking
  attemptVersion: text("attempt_version").notNull().default("1.0.0"),
  
  // Scoring data
  rawScores: jsonb("raw_scores").notNull(), // { achievement: 12, honesty: 15, ... } (3-15 range)
  normalizedScores: jsonb("normalized_scores").notNull(), // { achievement: 80, honesty: 100, ... } (0-100)
  topValues: text("top_values").array().notNull(), // ["honesty", "achievement", "kindness"]
  
  // Response data
  itemResponses: jsonb("item_responses").notNull(), // { "CVQ-A1": 5, "CVQ-H1": 4, ... }
  
  // Quality metrics
  completionSeconds: integer("completion_seconds"),
  avgResponseVariance: real("avg_response_variance"),
  lowVariance: boolean("low_variance").notNull().default(false), // 80%+ same response
  rushedCompletion: boolean("rushed_completion").notNull().default(false), // < 2.5s per item
  incomplete: boolean("incomplete").notNull().default(false), // Missing responses
  
  submittedAt: timestamp("submitted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("cvq_results_user_submitted_idx").on(table.userId, table.submittedAt),
]);

export const cvqResultsRelations = relations(cvqResults, ({ one }) => ({
  assessment: one(assessments, {
    fields: [cvqResults.assessmentId],
    references: [assessments.id],
  }),
  user: one(users, {
    fields: [cvqResults.userId],
    references: [users.id],
  }),
}));

// Dynamic assessment components configuration (for super admin)
export const assessmentComponents = pgTable("assessment_components", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // "Subject Match", "Interest Match", etc.
  key: text("key").notNull().unique(), // "subject", "interest", "vision", "market", "riasec", "cvq"
  description: text("description"), // Explanation of what this component measures
  weight: real("weight").notNull().default(0), // Percentage weight (0-100)
  isActive: boolean("is_active").notNull().default(true),
  requiresPremium: boolean("requires_premium").notNull().default(false), // true for RIASEC & CVQ
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const assessmentComponentsRelations = relations(assessmentComponents, ({ many }) => ({
  careerAffinities: many(careerComponentAffinities),
}));

// Career affinity scores for each component (replaces hardcoded affinity functions)
export const careerComponentAffinities = pgTable("career_component_affinities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  careerId: varchar("career_id").notNull().references(() => careers.id),
  componentId: varchar("component_id").notNull().references(() => assessmentComponents.id),
  affinityData: jsonb("affinity_data").notNull(), // Flexible structure depending on component type
  // For RIASEC: { R: 45, I: 90, A: 40, S: 30, E: 35, C: 60 }
  // For others: can be null or custom structure
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const careerComponentAffinitiesRelations = relations(careerComponentAffinities, ({ one }) => ({
  career: one(careers, {
    fields: [careerComponentAffinities.careerId],
    references: [careers.id],
  }),
  component: one(assessmentComponents, {
    fields: [careerComponentAffinities.componentId],
    references: [assessmentComponents.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

export type Country = typeof countries.$inferSelect;
export type InsertCountry = typeof countries.$inferInsert;

export type Skill = typeof skills.$inferSelect;
export type InsertSkill = typeof skills.$inferInsert;

export type Career = typeof careers.$inferSelect;
export type InsertCareer = typeof careers.$inferInsert;

export type JobMarketTrend = typeof jobMarketTrends.$inferSelect;
export type InsertJobMarketTrend = typeof jobMarketTrends.$inferInsert;

export type Assessment = typeof assessments.$inferSelect;
export const insertAssessmentSchema = createInsertSchema(assessments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  riasecResponses: z.record(z.string(), z.number().min(1).max(5)).optional().refine(
    (data) => !data || Object.keys(data).length === 30,
    { message: "RIASEC assessment requires exactly 30 responses (5 per theme)" }
  ), // Transient field: question ID -> response (1-5)
});
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;

export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = typeof recommendations.$inferInsert;

export type QuizQuestion = typeof quizQuestions.$inferSelect;
export const insertQuizQuestionSchema = createInsertSchema(quizQuestions).omit({
  id: true,
  createdAt: true,
});
export type InsertQuizQuestion = z.infer<typeof insertQuizQuestionSchema>;

export type AssessmentQuiz = typeof assessmentQuizzes.$inferSelect;
export const insertAssessmentQuizSchema = createInsertSchema(assessmentQuizzes).omit({
  id: true,
  createdAt: true,
});
export type InsertAssessmentQuiz = z.infer<typeof insertAssessmentQuizSchema>;

export type QuizResponse = typeof quizResponses.$inferSelect;
export const insertQuizResponseSchema = createInsertSchema(quizResponses).omit({
  id: true,
  createdAt: true,
});
export type InsertQuizResponse = z.infer<typeof insertQuizResponseSchema>;

export type AssessmentComponent = typeof assessmentComponents.$inferSelect;
export const insertAssessmentComponentSchema = createInsertSchema(assessmentComponents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAssessmentComponent = z.infer<typeof insertAssessmentComponentSchema>;

export type CareerComponentAffinity = typeof careerComponentAffinities.$inferSelect;
export const insertCareerComponentAffinitySchema = createInsertSchema(careerComponentAffinities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCareerComponentAffinity = z.infer<typeof insertCareerComponentAffinitySchema>;

export type Organization = typeof organizations.$inferSelect;
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;

// CVQ type exports
export type CvqItem = typeof cvqItems.$inferSelect;
export const insertCvqItemSchema = createInsertSchema(cvqItems).omit({
  id: true,
  createdAt: true,
});
export type InsertCvqItem = z.infer<typeof insertCvqItemSchema>;

export type CvqResult = typeof cvqResults.$inferSelect;
export const insertCvqResultSchema = createInsertSchema(cvqResults).omit({
  id: true,
  submittedAt: true,
  createdAt: true,
});
export type InsertCvqResult = z.infer<typeof insertCvqResultSchema>;

// WEF Skills Framework type exports
export type WefSkill = typeof wefSkills.$inferSelect;
export const insertWefSkillSchema = createInsertSchema(wefSkills).omit({
  id: true,
  createdAt: true,
});
export type InsertWefSkill = z.infer<typeof insertWefSkillSchema>;

export type CareerWefSkillAffinity = typeof careerWefSkillAffinities.$inferSelect;
export const insertCareerWefSkillAffinitySchema = createInsertSchema(careerWefSkillAffinities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCareerWefSkillAffinity = z.infer<typeof insertCareerWefSkillAffinitySchema>;

export type WefCompetencyResult = typeof wefCompetencyResults.$inferSelect;
export const insertWefCompetencyResultSchema = createInsertSchema(wefCompetencyResults).omit({
  id: true,
  submittedAt: true,
  createdAt: true,
});
export type InsertWefCompetencyResult = z.infer<typeof insertWefCompetencyResultSchema>;

export type CountryPrioritySector = typeof countryPrioritySectors.$inferSelect;
export const insertCountryPrioritySectorSchema = createInsertSchema(countryPrioritySectors).omit({
  id: true,
  createdAt: true,
});
export type InsertCountryPrioritySector = z.infer<typeof insertCountryPrioritySectorSchema>;

export type CountrySectorWefSkill = typeof countrySectorWefSkills.$inferSelect;
export const insertCountrySectorWefSkillSchema = createInsertSchema(countrySectorWefSkills).omit({
  id: true,
  createdAt: true,
});
export type InsertCountrySectorWefSkill = z.infer<typeof insertCountrySectorWefSkillSchema>;

// Files table for data import/export and file sharing
export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // File metadata
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(), // Size in bytes
  filePath: text("file_path").notNull(), // Server path to file
  
  // File categorization
  fileType: text("file_type").notNull(), // 'import_data', 'export_data', 'analytics_report', 'shared_document'
  category: text("category"), // Additional categorization (e.g., 'student_import', 'assessment_export', 'monthly_report')
  description: text("description"),
  
  // Ownership and association
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  organizationId: varchar("organization_id").references(() => organizations.id), // Null for system-wide files
  
  // Access control
  isPublic: boolean("is_public").notNull().default(false),
  shareToken: varchar("share_token").unique(), // For secure sharing links
  shareTokenExpiry: timestamp("share_token_expiry"),
  downloadCount: integer("download_count").notNull().default(0),
  
  // Processing status (for imports)
  processingStatus: text("processing_status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed'
  processingError: text("processing_error"),
  processedRecords: integer("processed_records").default(0),
  failedRecords: integer("failed_records").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_files_uploaded_by").on(table.uploadedBy),
  index("idx_files_organization").on(table.organizationId),
  index("idx_files_type").on(table.fileType),
  index("idx_files_share_token").on(table.shareToken),
]);

export const filesRelations = relations(files, ({ one }) => ({
  uploader: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [files.organizationId],
    references: [organizations.id],
  }),
}));

export type File = typeof files.$inferSelect;
export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  downloadCount: true,
  processingStatus: true,
  processedRecords: true,
  failedRecords: true,
});
export type InsertFile = z.infer<typeof insertFileSchema>;

// Organization Events (Audit Trail for License Changes, Admin Actions)
export const organizationEvents = pgTable("organization_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  
  // Event metadata
  eventType: text("event_type").notNull(), // 'license_added', 'license_removed', 'unlimited_enabled', 'unlimited_disabled', 'admin_added', 'admin_removed', 'admin_promoted', 'student_created', 'student_deleted', 'password_reset'
  eventDescription: text("event_description").notNull(),
  
  // Actor information
  performedBy: varchar("performed_by").notNull().references(() => users.id),
  performedByRole: text("performed_by_role").notNull(), // 'superadmin', 'org_admin', 'primary_admin'
  
  // Change details (JSON for flexibility)
  previousValue: jsonb("previous_value"), // e.g., { licenses: 50 }
  newValue: jsonb("new_value"), // e.g., { licenses: 75 }
  affectedUserId: varchar("affected_user_id").references(() => users.id), // For admin/student actions
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_org_events_organization").on(table.organizationId),
  index("idx_org_events_type").on(table.eventType),
  index("idx_org_events_performed_by").on(table.performedBy),
  index("idx_org_events_created_at").on(table.createdAt),
]);

export const organizationEventsRelations = relations(organizationEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationEvents.organizationId],
    references: [organizations.id],
  }),
  performer: one(users, {
    fields: [organizationEvents.performedBy],
    references: [users.id],
  }),
}));

export type OrganizationEvent = typeof organizationEvents.$inferSelect;
export const insertOrganizationEventSchema = createInsertSchema(organizationEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertOrganizationEvent = z.infer<typeof insertOrganizationEventSchema>;

// =============================================================================
// SCORING METHODOLOGY CONFIGURATION (Superadmin-managed)
// =============================================================================

// Scoring Tiers - defines Free vs Premium tier configurations
export const scoringTiers = pgTable("scoring_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // 'basic', 'premium', 'group'
  name: text("name").notNull(), // 'Free Assessment', 'Premium Assessment', etc.
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tier Component Weights - per-tier weight configuration for each component
export const tierComponentWeights = pgTable("tier_component_weights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tierId: varchar("tier_id").notNull().references(() => scoringTiers.id, { onDelete: "cascade" }),
  componentId: varchar("component_id").notNull().references(() => assessmentComponents.id, { onDelete: "cascade" }),
  weight: real("weight").notNull().default(0), // Percentage weight (0-100)
  isEnabled: boolean("is_enabled").notNull().default(true), // Whether this component is active for this tier
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_tier_component_unique").on(table.tierId, table.componentId),
]);

export const tierComponentWeightsRelations = relations(tierComponentWeights, ({ one }) => ({
  tier: one(scoringTiers, {
    fields: [tierComponentWeights.tierId],
    references: [scoringTiers.id],
  }),
  component: one(assessmentComponents, {
    fields: [tierComponentWeights.componentId],
    references: [assessmentComponents.id],
  }),
}));

// Component Parameters - fine-tuning parameters for each component (thresholds, multipliers, etc.)
export const componentParameters = pgTable("component_parameters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  componentId: varchar("component_id").notNull().references(() => assessmentComponents.id, { onDelete: "cascade" }),
  parameterKey: text("parameter_key").notNull(), // e.g., 'threshold', 'multiplier', 'minScore'
  parameterValue: text("parameter_value").notNull(), // Stored as string, parsed based on type
  parameterType: text("parameter_type").notNull().default("number"), // 'number', 'string', 'boolean', 'json'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_component_parameter_unique").on(table.componentId, table.parameterKey),
]);

export const componentParametersRelations = relations(componentParameters, ({ one }) => ({
  component: one(assessmentComponents, {
    fields: [componentParameters.componentId],
    references: [assessmentComponents.id],
  }),
}));

// LLM Prompt Templates - configurable prompts for premium narrative generation
export const llmPromptTemplates = pgTable("llm_prompt_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // 'career_reasoning', 'work_style_fit', 'strengths_growth', 'action_steps', 'education_pathways'
  name: text("name").notNull(), // User-friendly name
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(), // System context for LLM
  userPromptTemplate: text("user_prompt_template").notNull(), // Template with {{placeholders}}
  model: text("model").notNull().default("claude-sonnet-4-6"), // LLM model to use
  maxTokens: integer("max_tokens").notNull().default(1000),
  temperature: real("temperature").notNull().default(0.7),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// API Credentials - secure storage for external API keys
export const apiCredentials = pgTable("api_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull().unique(), // 'openai', 'anthropic', etc.
  apiKey: text("api_key").notNull(), // Encrypted API key
  isActive: boolean("is_active").notNull().default(true),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestResult: text("last_test_result"), // 'success', 'failed', error message
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Scoring Configuration Change Log - audit trail
export const scoringConfigChangeLog = pgTable("scoring_config_change_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  changedBy: varchar("changed_by").notNull().references(() => users.id),
  changeType: text("change_type").notNull(), // 'tier_weight', 'component_parameter', 'prompt_template', 'api_credential'
  entityType: text("entity_type").notNull(), // 'tier_component_weight', 'component_parameter', 'llm_prompt_template', 'api_credential'
  entityId: varchar("entity_id").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  changeDescription: text("change_description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_scoring_change_log_changed_by").on(table.changedBy),
  index("idx_scoring_change_log_entity").on(table.entityType, table.entityId),
  index("idx_scoring_change_log_created_at").on(table.createdAt),
]);

export const scoringConfigChangeLogRelations = relations(scoringConfigChangeLog, ({ one }) => ({
  changer: one(users, {
    fields: [scoringConfigChangeLog.changedBy],
    references: [users.id],
  }),
}));

// Type exports for new tables
export type ScoringTier = typeof scoringTiers.$inferSelect;
export const insertScoringTierSchema = createInsertSchema(scoringTiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertScoringTier = z.infer<typeof insertScoringTierSchema>;

export type TierComponentWeight = typeof tierComponentWeights.$inferSelect;
export const insertTierComponentWeightSchema = createInsertSchema(tierComponentWeights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTierComponentWeight = z.infer<typeof insertTierComponentWeightSchema>;

export type ComponentParameter = typeof componentParameters.$inferSelect;
export const insertComponentParameterSchema = createInsertSchema(componentParameters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertComponentParameter = z.infer<typeof insertComponentParameterSchema>;

export type LlmPromptTemplate = typeof llmPromptTemplates.$inferSelect;
export const insertLlmPromptTemplateSchema = createInsertSchema(llmPromptTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLlmPromptTemplate = z.infer<typeof insertLlmPromptTemplateSchema>;

export type ApiCredential = typeof apiCredentials.$inferSelect;
export const insertApiCredentialSchema = createInsertSchema(apiCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastTestedAt: true,
  lastTestResult: true,
});
export type InsertApiCredential = z.infer<typeof insertApiCredentialSchema>;

export type ScoringConfigChangeLog = typeof scoringConfigChangeLog.$inferSelect;
export const insertScoringConfigChangeLogSchema = createInsertSchema(scoringConfigChangeLog).omit({
  id: true,
  createdAt: true,
});
export type InsertScoringConfigChangeLog = z.infer<typeof insertScoringConfigChangeLogSchema>;

// ============================================
// School Rewards System - Quiz Contributions
// ============================================

// Contribution Submissions - schools submit batches of quiz questions for review
export const contributionSubmissions = pgTable("contribution_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  submittedByUserId: varchar("submitted_by_user_id").notNull().references(() => users.id),
  
  // Content metadata
  countryId: varchar("country_id").notNull().references(() => countries.id),
  curriculum: text("curriculum").notNull(),
  subject: text("subject").notNull(),
  grade: integer("grade").notNull(), // 8-12
  
  // Submitted questions (JSON array before approval)
  questions: jsonb("questions").notNull(), // Array of question objects
  totalQuestions: integer("total_questions").notNull(),
  
  // LLM Pre-verification (automatic quality check)
  llmVerificationStatus: text("llm_verification_status").default("pending"), // pending, verified, failed
  llmVerificationScore: integer("llm_verification_score"), // 0-100 quality score
  llmVerificationFeedback: jsonb("llm_verification_feedback"), // Per-question feedback from LLM
  llmVerifiedAt: timestamp("llm_verified_at"),
  
  // Review status (manual superadmin review after LLM verification)
  status: text("status").notNull().default("pending"), // pending, llm_verified, in_review, approved, rejected, needs_changes
  reviewedByUserId: varchar("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewFeedback: text("review_feedback"), // Reviewer comments
  
  // Approval tracking
  approvedCount: integer("approved_count").default(0),
  rejectedCount: integer("rejected_count").default(0),
  creditsAwarded: integer("credits_awarded").default(0), // Assessment credits earned (approved / 5)
  rewardAllocated: boolean("reward_allocated").notNull().default(false), // Has superadmin allocated the reward?
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("contribution_submissions_org_idx").on(table.organizationId),
  index("contribution_submissions_status_idx").on(table.status),
  index("contribution_submissions_country_idx").on(table.countryId),
]);

export const contributionSubmissionsRelations = relations(contributionSubmissions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contributionSubmissions.organizationId],
    references: [organizations.id],
  }),
  submittedBy: one(users, {
    fields: [contributionSubmissions.submittedByUserId],
    references: [users.id],
  }),
  reviewedBy: one(users, {
    fields: [contributionSubmissions.reviewedByUserId],
    references: [users.id],
  }),
  country: one(countries, {
    fields: [contributionSubmissions.countryId],
    references: [countries.id],
  }),
  rewards: many(contributionRewards),
}));

// Contribution Rewards - log of credits awarded to organizations
export const contributionRewards = pgTable("contribution_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  submissionId: varchar("submission_id").notNull().references(() => contributionSubmissions.id, { onDelete: "cascade" }),
  
  creditsAwarded: integer("credits_awarded").notNull(),
  approvedQuestions: integer("approved_questions").notNull(),
  reason: text("reason").notNull(), // e.g., "5 approved questions = 1 credit"
  
  awardedByUserId: varchar("awarded_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("contribution_rewards_org_idx").on(table.organizationId),
  index("contribution_rewards_submission_idx").on(table.submissionId),
]);

export const contributionRewardsRelations = relations(contributionRewards, ({ one }) => ({
  organization: one(organizations, {
    fields: [contributionRewards.organizationId],
    references: [organizations.id],
  }),
  submission: one(contributionSubmissions, {
    fields: [contributionRewards.submissionId],
    references: [contributionSubmissions.id],
  }),
  awardedBy: one(users, {
    fields: [contributionRewards.awardedByUserId],
    references: [users.id],
  }),
}));

// Type exports for contribution system
export type ContributionSubmission = typeof contributionSubmissions.$inferSelect;
export const insertContributionSubmissionSchema = createInsertSchema(contributionSubmissions).omit({
  id: true,
  status: true,
  reviewedByUserId: true,
  reviewedAt: true,
  reviewFeedback: true,
  approvedCount: true,
  rejectedCount: true,
  creditsAwarded: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContributionSubmission = z.infer<typeof insertContributionSubmissionSchema>;

export type ContributionReward = typeof contributionRewards.$inferSelect;
export const insertContributionRewardSchema = createInsertSchema(contributionRewards).omit({
  id: true,
  createdAt: true,
});
export type InsertContributionReward = z.infer<typeof insertContributionRewardSchema>;

// System Configuration - superadmin-managed settings
export const systemConfig = pgTable("system_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  dataType: varchar("data_type", { length: 20 }).notNull().default("string"), // string, number, boolean, json
  updatedByUserId: varchar("updated_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("system_config_key_idx").on(table.key),
  index("system_config_category_idx").on(table.category),
]);

export type SystemConfig = typeof systemConfig.$inferSelect;
export const insertSystemConfigSchema = createInsertSchema(systemConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;

// System Announcements - broadcast messages to all users/schools
export const systemAnnouncements = pgTable("system_announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("info"), // info, warning, success, error
  targetAudience: varchar("target_audience", { length: 30 }).notNull().default("all"), // all, org_admins, students, premium
  isActive: boolean("is_active").notNull().default(true),
  isPinned: boolean("is_pinned").notNull().default(false), // Pinned announcements show at top
  backgroundColor: varchar("background_color", { length: 20 }).default("#ffffff"), // Custom background color for sticky note style
  publishAt: timestamp("publish_at"), // Optional scheduled publish date (announcement goes live on this date)
  expiresAt: timestamp("expires_at"), // Optional expiration date
  titleAr: text("title_ar"), // Arabic translation of title
  contentAr: text("content_ar"), // Arabic translation of content
  createdByUserId: varchar("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("system_announcements_active_idx").on(table.isActive),
  index("system_announcements_target_idx").on(table.targetAudience),
]);

export const systemAnnouncementsRelations = relations(systemAnnouncements, ({ one }) => ({
  createdBy: one(users, {
    fields: [systemAnnouncements.createdByUserId],
    references: [users.id],
  }),
}));

export type SystemAnnouncement = typeof systemAnnouncements.$inferSelect;
export const insertSystemAnnouncementSchema = createInsertSchema(systemAnnouncements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSystemAnnouncement = z.infer<typeof insertSystemAnnouncementSchema>;
