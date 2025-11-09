import { sql } from "drizzle-orm";
import {
  index,
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  assessments: many(assessments),
}));

// Countries with mission/vision data
export const countries = pgTable("countries", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  code: varchar("code", { length: 3 }).notNull().unique(),
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
  createdAt: timestamp("created_at").defaultNow(),
});

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
  favoriteSubjects: text("favorite_subjects").array().notNull(),
  interests: text("interests").array().notNull(),
  personalityTraits: jsonb("personality_traits"),
  careerAspirations: text("career_aspirations").array(),
  strengths: text("strengths").array(),
  workPreferences: jsonb("work_preferences"),
  
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
});
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;

export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = typeof recommendations.$inferInsert;
