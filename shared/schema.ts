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

// Session storage table - mandatory for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - mandatory for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"), // 'user', 'admin'
  
  // Organization-generated student accounts
  username: varchar("username").unique(),
  passwordHash: varchar("password_hash"), // Hashed password (bcrypt/argon2)
  accountType: text("account_type").notNull().default("individual"), // 'individual', 'org_admin', 'org_student'
  isOrgGenerated: boolean("is_org_generated").notNull().default(false),
  
  // Premium subscription
  isPremium: boolean("is_premium").notNull().default(false),
  stripeCustomerId: varchar("stripe_customer_id"),
  paymentDate: timestamp("payment_date"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  assessments: many(assessments),
  organizationMembership: one(organizationMembers, {
    fields: [users.id],
    references: [organizationMembers.userId],
  }),
  ownedOrganization: one(organizations, {
    fields: [users.id],
    references: [organizations.adminUserId],
  }),
}));

// Organizations (Schools/Institutions)
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
  
  // License tracking
  totalLicenses: integer("total_licenses").notNull(),
  usedLicenses: integer("used_licenses").notNull().default(0),
  
  // Settings
  passwordComplexity: text("password_complexity").notNull().default("medium"), // 'easy', 'medium', 'strong'
  
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
  members: many(organizationMembers),
}));

// Organization Members (Students in schools)
export const organizationMembers = pgTable("organization_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  userId: varchar("user_id").notNull().unique().references(() => users.id), // User can only belong to one organization
  
  // Student information
  studentId: text("student_id"), // School's own student ID
  grade: text("grade"),
  role: text("role").notNull().default("student"), // 'student' or 'admin'
  
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
  code: varchar("code", { length: 3 }).notNull().unique(),
  abbreviation: text("abbreviation"), // Short name for display (UAE, USA, UK) - null means use full name
  mission: text("mission").notNull(),
  vision: text("vision").notNull(),
  visionPlan: text("vision_plan"),
  prioritySectors: text("priority_sectors").array().notNull(),
  nationalGoals: text("national_goals").array().notNull(),
  targets: jsonb("targets"),
  flag: text("flag"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const countriesRelations = relations(countries, ({ many }) => ({
  assessments: many(assessments),
  jobMarketTrends: many(jobMarketTrends),
}));

// Future skills taxonomy
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

// Careers/job roles
export const careers = pgTable("careers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requiredSkills: text("required_skills").array().notNull(),
  relatedSubjects: text("related_subjects").array().notNull(),
  category: text("category").notNull(),
  educationLevel: text("education_level").notNull(),
  averageSalary: text("average_salary"),
  growthOutlook: text("growth_outlook").notNull(),
  icon: text("icon"),
  
  // CVQ (Personal Values) integration - O*NET derived
  valuesProfile: jsonb("values_profile"), // { achievement: 80, honesty: 90, kindness: 75, ... }
  onetCode: varchar("onet_code", { length: 15 }), // O*NET-SOC code (e.g., "17-2199.11")
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("careers_onet_code_idx").on(table.onetCode),
]);

export const careersRelations = relations(careers, ({ many }) => ({
  jobMarketTrends: many(jobMarketTrends),
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
  
  // Assessment data
  assessmentType: text("assessment_type").notNull().default("basic"), // 'basic' or 'kolb'
  favoriteSubjects: text("favorite_subjects").array().notNull(),
  interests: text("interests").array().notNull(),
  personalityTraits: jsonb("personality_traits"),
  careerAspirations: text("career_aspirations").array(),
  strengths: text("strengths").array(),
  workPreferences: jsonb("work_preferences"),
  
  // Kolb's ELT scores (premium only)
  kolbScores: jsonb("kolb_scores"), // { CE, RO, AC, AE, X, Y, learningStyle }
  
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
});

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
});

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
  
  // Subject-based metadata
  subject: text("subject").notNull(), // Mathematics, Science, English, Arabic, Social Studies, Computer Science
  gradeBand: text("grade_band").notNull(), // 8-9 or 10-12
  countryId: varchar("country_id").references(() => countries.id), // NULL = global questions, or country-specific
  topic: text("topic").notNull(), // Specific curriculum topic (e.g., "Algebra", "Photosynthesis")
  difficulty: text("difficulty").notNull(), // easy, medium, hard
  cognitiveLevel: text("cognitive_level").notNull(), // knowledge, comprehension, application, analysis
  
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

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
  key: text("key").notNull().unique(), // "subject", "interest", "vision", "market", "kolb", "riasec"
  description: text("description"), // Explanation of what this component measures
  weight: real("weight").notNull().default(0), // Percentage weight (0-100)
  isActive: boolean("is_active").notNull().default(true),
  requiresPremium: boolean("requires_premium").notNull().default(false), // true for Kolb & RIASEC
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
  // For Kolb: { Diverging: 50, Assimilating: 85, Converging: 60, Accommodating: 35 }
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
  kolbResponses: z.record(z.string(), z.number()).optional(), // Transient field: question ID -> response (1-5)
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
