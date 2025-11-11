import {
  users,
  countries,
  skills,
  careers,
  jobMarketTrends,
  assessments,
  recommendations,
  quizQuestions,
  assessmentQuizzes,
  quizResponses,
  assessmentComponents,
  careerComponentAffinities,
  cvqItems,
  cvqResults,
  organizations,
  organizationMembers,
  type User,
  type UpsertUser,
  type Country,
  type InsertCountry,
  type Skill,
  type InsertSkill,
  type Career,
  type InsertCareer,
  type JobMarketTrend,
  type InsertJobMarketTrend,
  type Assessment,
  type InsertAssessment,
  type Recommendation,
  type InsertRecommendation,
  type QuizQuestion,
  type InsertQuizQuestion,
  type AssessmentQuiz,
  type InsertAssessmentQuiz,
  type QuizResponse,
  type InsertQuizResponse,
  type AssessmentComponent,
  type InsertAssessmentComponent,
  type CareerComponentAffinity,
  type InsertCareerComponentAffinity,
  type CvqItem,
  type InsertCvqItem,
  type CvqResult,
  type InsertCvqResult,
  type Organization,
  type InsertOrganization,
  type OrganizationMember,
  type InsertOrganizationMember,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, count, avg, sql as sqlFunc, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserPremiumStatus(userId: string, stripeCustomerId: string | null): Promise<User>;

  // Country operations
  getAllCountries(): Promise<Country[]>;
  getCountryById(id: string): Promise<Country | undefined>;
  createCountry(country: InsertCountry): Promise<Country>;

  // Skills operations
  getAllSkills(): Promise<Skill[]>;
  getSkillsByCategory(category: string): Promise<Skill[]>;

  // Career operations
  createCareer(career: InsertCareer): Promise<Career>;
  getAllCareers(): Promise<Career[]>;
  getCareerById(id: string): Promise<Career | undefined>;

  // Job Market Trends operations
  createJobMarketTrend(trend: InsertJobMarketTrend): Promise<JobMarketTrend>;
  getTrendsByCountry(countryId: string): Promise<JobMarketTrend[]>;
  getTrendByCareerAndCountry(careerId: string, countryId: string): Promise<JobMarketTrend | undefined>;
  getJobTrendsByCareerIds(careerIds: string[], countryId?: string): Promise<JobMarketTrend[]>;

  // Assessment operations
  createAssessment(assessment: InsertAssessment): Promise<Assessment>;
  getAssessmentById(id: string): Promise<Assessment | undefined>;
  getAssessmentsByUser(userId: string): Promise<Assessment[]>;
  getAssessmentByGuestToken(guestToken: string): Promise<Assessment | undefined>;
  updateAssessment(id: string, assessment: Partial<InsertAssessment>): Promise<Assessment>;
  migrateGuestAssessments(guestAssessmentIds: string[], userId: string, guestSessionId: string): Promise<number>;

  // Recommendation operations
  createRecommendation(recommendation: InsertRecommendation): Promise<Recommendation>;
  getRecommendationsByAssessment(assessmentId: string): Promise<Recommendation[]>;

  // Quiz operations
  createQuizQuestion(question: InsertQuizQuestion): Promise<QuizQuestion>;
  getAllQuizQuestions(): Promise<QuizQuestion[]>;
  getQuizQuestionsByGradeAndCountry(gradeBand: string, countryId: string | null): Promise<QuizQuestion[]>;
  getQuizQuestions(filters: {
    countryId?: string;
    subject?: string;
    gradeBand?: string;
    limit?: number;
    offset?: number;
  }): Promise<QuizQuestion[]>;
  updateQuizQuestion(id: string, data: Partial<InsertQuizQuestion>): Promise<QuizQuestion | undefined>;
  deleteQuizQuestion(id: string): Promise<boolean>;
  createAssessmentQuiz(assessmentQuiz: InsertAssessmentQuiz): Promise<AssessmentQuiz>;
  getAssessmentQuizByAssessmentId(assessmentId: string): Promise<AssessmentQuiz | undefined>;
  createQuizResponse(response: InsertQuizResponse): Promise<QuizResponse>;
  getQuizResponsesByQuizId(assessmentQuizId: string): Promise<QuizResponse[]>;
  updateQuizResponse(id: string, data: Partial<InsertQuizResponse>): Promise<QuizResponse>;
  updateAssessmentQuiz(id: string, data: Partial<InsertAssessmentQuiz>): Promise<AssessmentQuiz>;

  // Analytics operations
  getAnalyticsOverview(countryId?: string): Promise<{
    totalStudents: number;
    completedAssessments: number;
    countriesBreakdown: Array<{ countryId: string; countryName: string; count: number }>;
    gradeDistribution: Array<{ grade: string; count: number }>;
  }>;
  getCountryAnalytics(countryId: string): Promise<{
    totalStudents: number;
    topCareers: Array<{ careerId: string; careerTitle: string; count: number }>;
    avgVisionAlignment: number;
    popularSubjects: Array<{ subject: string; count: number }>;
  }>;
  getCareerTrends(countryId?: string): Promise<Array<{
    careerId: string;
    careerTitle: string;
    recommendationCount: number;
    avgMatchScore: number;
  }>>;
  getSectorPipeline(countryId?: string): Promise<Array<{
    sector: string;
    studentCount: number;
    avgAlignment: number;
  }>>;

  // Assessment Component operations
  createAssessmentComponent(component: InsertAssessmentComponent): Promise<AssessmentComponent>;
  getAllAssessmentComponents(): Promise<AssessmentComponent[]>;
  getAssessmentComponentById(id: string): Promise<AssessmentComponent | undefined>;
  getAssessmentComponentByKey(key: string): Promise<AssessmentComponent | undefined>;
  updateAssessmentComponent(id: string, component: Partial<InsertAssessmentComponent>): Promise<AssessmentComponent>;
  deleteAssessmentComponent(id: string): Promise<boolean>;

  // Career Component Affinity operations
  createCareerComponentAffinity(affinity: InsertCareerComponentAffinity): Promise<CareerComponentAffinity>;
  getCareerComponentAffinity(careerId: string, componentId: string): Promise<CareerComponentAffinity | undefined>;
  getCareerComponentAffinitiesByComponent(componentId: string): Promise<CareerComponentAffinity[]>;
  getCareerComponentAffinitiesByCareer(careerId: string): Promise<CareerComponentAffinity[]>;
  getCareerAffinitiesBulk(careerIds: string[], componentIds?: string[]): Promise<CareerComponentAffinity[]>;
  updateCareerComponentAffinity(careerId: string, componentId: string, data: Partial<InsertCareerComponentAffinity>): Promise<CareerComponentAffinity>;
  deleteCareerComponentAffinity(careerId: string, componentId: string): Promise<boolean>;

  // CVQ operations
  getCvqItems(version?: string): Promise<CvqItem[]>;
  createCvqResult(result: InsertCvqResult): Promise<CvqResult>;
  getCvqResultByUserId(userId: string): Promise<CvqResult | undefined>;
  getCvqResultByAssessmentId(assessmentId: string): Promise<CvqResult | undefined>;
  
  // Bulk loading operations for matching service
  getAssessmentWithCompetencies(assessmentId: string): Promise<{
    assessment: Assessment;
    quiz?: AssessmentQuiz;
    responses: QuizResponse[];
    competencyScores: Record<string, number>;
  }>;

  // Organization operations
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  getAllOrganizations(): Promise<Organization[]>;
  getOrganizationById(id: string): Promise<Organization | undefined>;
  getOrganizationByAdminUserId(adminUserId: string): Promise<Organization | undefined>;
  updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization>;
  updateOrganizationQuota(id: string, increment: number): Promise<Organization>;

  // Organization Member operations
  createOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember>;
  getOrganizationMemberById(id: string): Promise<OrganizationMember | undefined>;
  getOrganizationMemberByUserId(userId: string): Promise<OrganizationMember | undefined>;
  getOrganizationMembersByOrganizationId(organizationId: string): Promise<OrganizationMember[]>;
  updateOrganizationMember(id: string, data: Partial<InsertOrganizationMember>): Promise<OrganizationMember>;
  deleteOrganizationMember(id: string): Promise<boolean>;
  lockOrganizationMember(id: string): Promise<OrganizationMember>;

  // Combined operations
  createUserWithCredentials(userData: {
    organizationId: string;
    fullName: string;
    grade?: string;
    username?: string;
    studentId?: string;
    passwordComplexity?: 'easy' | 'medium' | 'strong';
  }): Promise<{
    user: User;
    member: OrganizationMember;
    password: string;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserPremiumStatus(userId: string, stripeCustomerId: string | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        isPremium: true,
        stripeCustomerId: stripeCustomerId,
        paymentDate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    return user;
  }

  // Country operations
  async getAllCountries(): Promise<Country[]> {
    return await db.select().from(countries);
  }

  async getCountryById(id: string): Promise<Country | undefined> {
    const [country] = await db.select().from(countries).where(eq(countries.id, id));
    return country;
  }

  async createCountry(countryData: InsertCountry): Promise<Country> {
    const [country] = await db.insert(countries).values(countryData).returning();
    return country;
  }

  // Skills operations
  async getAllSkills(): Promise<Skill[]> {
    return await db.select().from(skills);
  }

  async getSkillsByCategory(category: string): Promise<Skill[]> {
    return await db.select().from(skills).where(eq(skills.category, category));
  }

  // Career operations
  async createCareer(careerData: InsertCareer): Promise<Career> {
    const [career] = await db.insert(careers).values(careerData).returning();
    return career;
  }

  async getAllCareers(): Promise<Career[]> {
    return await db.select().from(careers);
  }

  async getCareerById(id: string): Promise<Career | undefined> {
    const [career] = await db.select().from(careers).where(eq(careers.id, id));
    return career;
  }

  // Job Market Trends operations
  async createJobMarketTrend(trendData: InsertJobMarketTrend): Promise<JobMarketTrend> {
    const [trend] = await db.insert(jobMarketTrends).values(trendData).returning();
    return trend;
  }

  async getTrendsByCountry(countryId: string): Promise<JobMarketTrend[]> {
    return await db
      .select()
      .from(jobMarketTrends)
      .where(eq(jobMarketTrends.countryId, countryId));
  }

  async getTrendByCareerAndCountry(careerId: string, countryId: string): Promise<JobMarketTrend | undefined> {
    const [trend] = await db
      .select()
      .from(jobMarketTrends)
      .where(
        and(
          eq(jobMarketTrends.careerId, careerId),
          eq(jobMarketTrends.countryId, countryId)
        )
      );
    return trend;
  }

  async getJobTrendsByCareerIds(careerIds: string[], countryId?: string): Promise<JobMarketTrend[]> {
    if (careerIds.length === 0) return [];

    const conditions = [inArray(jobMarketTrends.careerId, careerIds)];
    if (countryId) {
      conditions.push(eq(jobMarketTrends.countryId, countryId));
    }

    return await db
      .select()
      .from(jobMarketTrends)
      .where(and(...conditions));
  }

  // Assessment operations
  async createAssessment(assessmentData: InsertAssessment): Promise<Assessment> {
    const [assessment] = await db.insert(assessments).values(assessmentData).returning();
    return assessment;
  }

  async getAssessmentById(id: string): Promise<Assessment | undefined> {
    const [assessment] = await db.select().from(assessments).where(eq(assessments.id, id));
    return assessment;
  }

  async getAssessmentsByUser(userId: string): Promise<Assessment[]> {
    return await db
      .select()
      .from(assessments)
      .where(eq(assessments.userId, userId))
      .orderBy(desc(assessments.createdAt));
  }

  async getAssessmentByGuestToken(guestToken: string): Promise<Assessment | undefined> {
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.guestToken, guestToken))
      .orderBy(desc(assessments.createdAt));
    return assessment;
  }

  async updateAssessment(id: string, assessmentData: Partial<InsertAssessment>): Promise<Assessment> {
    const [assessment] = await db
      .update(assessments)
      .set({ ...assessmentData, updatedAt: new Date() })
      .where(eq(assessments.id, id))
      .returning();
    return assessment;
  }

  async migrateGuestAssessments(guestAssessmentIds: string[], userId: string, guestSessionId: string): Promise<number> {
    let migratedCount = 0;
    
    for (const assessmentId of guestAssessmentIds) {
      const assessment = await this.getAssessmentById(assessmentId);
      
      // Only migrate if it's a guest assessment AND belongs to this guest session
      if (assessment && !assessment.userId && assessment.guestSessionId === guestSessionId) {
        await db
          .update(assessments)
          .set({ userId, updatedAt: new Date() })
          .where(eq(assessments.id, assessmentId));
        migratedCount++;
      }
    }
    
    return migratedCount;
  }

  // Recommendation operations
  async createRecommendation(recommendationData: InsertRecommendation): Promise<Recommendation> {
    const [recommendation] = await db.insert(recommendations).values(recommendationData).returning();
    return recommendation;
  }

  async getRecommendationsByAssessment(assessmentId: string): Promise<Recommendation[]> {
    return await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.assessmentId, assessmentId));
  }

  // Quiz operations
  async createQuizQuestion(questionData: InsertQuizQuestion): Promise<QuizQuestion> {
    const [question] = await db.insert(quizQuestions).values(questionData).returning();
    return question;
  }

  async getAllQuizQuestions(): Promise<QuizQuestion[]> {
    return await db.select().from(quizQuestions);
  }

  async getQuizQuestionsByGradeAndCountry(gradeBand: string, countryId: string | null): Promise<QuizQuestion[]> {
    if (countryId) {
      // Return both country-specific AND global questions for the given grade band
      const countrySpecific = await db
        .select()
        .from(quizQuestions)
        .where(
          and(
            eq(quizQuestions.gradeBand, gradeBand),
            eq(quizQuestions.countryId, countryId)
          )
        );
      
      const globalQuestions = await db
        .select()
        .from(quizQuestions)
        .where(
          and(
            eq(quizQuestions.gradeBand, gradeBand),
            sqlFunc`${quizQuestions.countryId} IS NULL`
          )
        );
      
      return [...countrySpecific, ...globalQuestions];
    } else {
      // Only return global questions if no country specified
      return await db
        .select()
        .from(quizQuestions)
        .where(
          and(
            eq(quizQuestions.gradeBand, gradeBand),
            sqlFunc`${quizQuestions.countryId} IS NULL`
          )
        );
    }
  }

  async getQuizQuestions(filters: {
    countryId?: string;
    subject?: string;
    gradeBand?: string;
    limit?: number;
    offset?: number;
  }): Promise<QuizQuestion[]> {
    let query = db.select().from(quizQuestions);
    
    const conditions: any[] = [];
    if (filters.countryId) {
      conditions.push(eq(quizQuestions.countryId, filters.countryId));
    }
    if (filters.subject) {
      conditions.push(eq(quizQuestions.subject, filters.subject));
    }
    if (filters.gradeBand) {
      conditions.push(eq(quizQuestions.gradeBand, filters.gradeBand));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    if (filters.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters.offset) {
      query = query.offset(filters.offset) as any;
    }
    
    return await query;
  }

  async updateQuizQuestion(id: string, data: Partial<InsertQuizQuestion>): Promise<QuizQuestion | undefined> {
    const [question] = await db
      .update(quizQuestions)
      .set(data)
      .where(eq(quizQuestions.id, id))
      .returning();
    return question;
  }

  async deleteQuizQuestion(id: string): Promise<boolean> {
    const result = await db
      .delete(quizQuestions)
      .where(eq(quizQuestions.id, id))
      .returning();
    return result.length > 0;
  }

  async createAssessmentQuiz(assessmentQuizData: InsertAssessmentQuiz): Promise<AssessmentQuiz> {
    const [quiz] = await db.insert(assessmentQuizzes).values(assessmentQuizData).returning();
    return quiz;
  }

  async getAssessmentQuizByAssessmentId(assessmentId: string): Promise<AssessmentQuiz | undefined> {
    const [quiz] = await db
      .select()
      .from(assessmentQuizzes)
      .where(eq(assessmentQuizzes.assessmentId, assessmentId));
    return quiz;
  }

  async createQuizResponse(responseData: InsertQuizResponse): Promise<QuizResponse> {
    const [response] = await db.insert(quizResponses).values(responseData).returning();
    return response;
  }

  async getQuizResponsesByQuizId(assessmentQuizId: string): Promise<QuizResponse[]> {
    return await db
      .select()
      .from(quizResponses)
      .where(eq(quizResponses.assessmentQuizId, assessmentQuizId));
  }

  async updateQuizResponse(id: string, data: Partial<InsertQuizResponse>): Promise<QuizResponse> {
    const [response] = await db
      .update(quizResponses)
      .set(data)
      .where(eq(quizResponses.id, id))
      .returning();
    return response;
  }

  async updateAssessmentQuiz(id: string, data: Partial<InsertAssessmentQuiz>): Promise<AssessmentQuiz> {
    const [quiz] = await db
      .update(assessmentQuizzes)
      .set(data)
      .where(eq(assessmentQuizzes.id, id))
      .returning();
    return quiz;
  }

  // Analytics operations
  
  // TODO: PERFORMANCE OPTIMIZATION NEEDED - N+1 Query Pattern
  // This function has a N+1 query issue: it fetches all assessments, then calls
  // getCountryById() for each unique country inside the loop (line 250).
  // RECOMMENDED FIX: Use Drizzle aggregations with JOIN to fetch country names in one query:
  // - Use .leftJoin(countries, eq(assessments.countryId, countries.id))
  // - Group by country and grade with COUNT() aggregation
  // - This will reduce database round-trips from O(n) to O(1)
  async getAnalyticsOverview(countryId?: string) {
    // Only count completed assessments for accurate analytics
    const conditions = [eq(assessments.isCompleted, true)];
    
    // Filter by country if specified
    if (countryId) {
      conditions.push(eq(assessments.countryId, countryId));
    }
    
    const completedAssessmentsList = await db
      .select()
      .from(assessments)
      .where(and(...conditions));
    const totalStudents = completedAssessmentsList.length;
    const completedAssessments = completedAssessmentsList.length; // All are completed due to filter

    const countriesMap = new Map<string, { countryId: string; countryName: string; count: number }>();
    const gradesMap = new Map<string, number>();

    for (const assessment of completedAssessmentsList) {
      if (assessment.countryId) {
        const existing = countriesMap.get(assessment.countryId);
        if (existing) {
          existing.count++;
        } else {
          const country = await this.getCountryById(assessment.countryId);
          if (country) {
            countriesMap.set(assessment.countryId, {
              countryId: assessment.countryId,
              countryName: country.name,
              count: 1
            });
          }
        }
      }

      if (assessment.grade) {
        gradesMap.set(assessment.grade, (gradesMap.get(assessment.grade) || 0) + 1);
      }
    }

    return {
      totalStudents,
      completedAssessments,
      countriesBreakdown: Array.from(countriesMap.values()),
      gradeDistribution: Array.from(gradesMap.entries()).map(([grade, count]) => ({ grade, count }))
    };
  }

  // TODO: PERFORMANCE OPTIMIZATION NEEDED - N+1 Query Pattern  
  // This function has multiple N+1 issues:
  // 1. Fetches ALL recommendations globally, then filters in memory (line 278-281)
  // 2. Calls getCareerById() for each recommendation inside loop (line 288)
  // RECOMMENDED FIX: 
  // - Join assessments with recommendations WHERE countryId = ?
  // - Left join with careers table to get titles
  // - Use GROUP BY careerId with COUNT() and AVG(countryVisionAlignment)
  // - This reduces O(n*m) complexity to O(1) with proper SQL aggregations
  async getCountryAnalytics(countryId: string) {
    // Only count completed assessments for accurate analytics
    const countryAssessments = await db
      .select()
      .from(assessments)
      .where(and(eq(assessments.countryId, countryId), eq(assessments.isCompleted, true)));
    const totalStudents = countryAssessments.length;

    // N+1 ISSUE: Fetching all recommendations globally instead of filtered query with JOIN
    const allRecs = await db.select().from(recommendations);
    const countryRecs = allRecs.filter(rec => 
      countryAssessments.some(a => a.id === rec.assessmentId)
    );

    const careersMap = new Map<string, { careerId: string; careerTitle: string; count: number }>();
    let totalAlignment = 0;
    
    for (const rec of countryRecs) {
      totalAlignment += rec.countryVisionAlignment;
      // N+1 ISSUE: Calling getCareerById inside loop
      const career = await this.getCareerById(rec.careerId);
      if (career) {
        const existing = careersMap.get(rec.careerId);
        if (existing) {
          existing.count++;
        } else {
          careersMap.set(rec.careerId, {
            careerId: rec.careerId,
            careerTitle: career.title,
            count: 1
          });
        }
      }
    }

    const subjectsMap = new Map<string, number>();
    for (const assessment of countryAssessments) {
      if (assessment.favoriteSubjects) {
        for (const subject of assessment.favoriteSubjects) {
          subjectsMap.set(subject, (subjectsMap.get(subject) || 0) + 1);
        }
      }
    }

    return {
      totalStudents,
      topCareers: Array.from(careersMap.values()).sort((a, b) => b.count - a.count).slice(0, 10),
      avgVisionAlignment: countryRecs.length > 0 ? totalAlignment / countryRecs.length : 0,
      popularSubjects: Array.from(subjectsMap.entries())
        .map(([subject, count]) => ({ subject, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
  }

  // TODO: PERFORMANCE OPTIMIZATION NEEDED - N+1 Query Pattern
  // This function has a N+1 query issue: it fetches all recommendations, then calls
  // getCareerById() for each recommendation inside the loop (line 348).
  // RECOMMENDED FIX: Use Drizzle JOIN with careers table:
  // - .leftJoin(careers, eq(recommendations.careerId, careers.id))
  // - Group by careerId with COUNT() and AVG(overallMatchScore)
  // - This eliminates per-recommendation queries, reducing from O(n) to O(1)
  async getCareerTrends(countryId?: string) {
    // Filter by country if specified - get completed assessments for that country
    let targetAssessmentIds: string[] | null = null;
    if (countryId) {
      const countryAssessments = await db
        .select()
        .from(assessments)
        .where(and(eq(assessments.countryId, countryId), eq(assessments.isCompleted, true)));
      targetAssessmentIds = countryAssessments.map(a => a.id);
    }

    const allRecs = await db.select().from(recommendations);
    
    // Filter recommendations by country if needed
    const filteredRecs = targetAssessmentIds 
      ? allRecs.filter(rec => targetAssessmentIds!.includes(rec.assessmentId))
      : allRecs;

    const careersMap = new Map<string, { careerId: string; careerTitle: string; count: number; totalScore: number }>();

    for (const rec of filteredRecs) {
      const career = await this.getCareerById(rec.careerId);
      if (career) {
        const existing = careersMap.get(rec.careerId);
        if (existing) {
          existing.count++;
          existing.totalScore += rec.overallMatchScore;
        } else {
          careersMap.set(rec.careerId, {
            careerId: rec.careerId,
            careerTitle: career.title,
            count: 1,
            totalScore: rec.overallMatchScore
          });
        }
      }
    }

    return Array.from(careersMap.values())
      .map(({ careerId, careerTitle, count, totalScore }) => ({
        careerId,
        careerTitle,
        recommendationCount: count,
        avgMatchScore: totalScore / count
      }))
      .sort((a, b) => b.recommendationCount - a.recommendationCount)
      .slice(0, 20);
  }

  // TODO: PERFORMANCE OPTIMIZATION NEEDED - N+1 Query Pattern
  // This function has nested loop N+1 issues:
  // 1. Fetches all assessments and all recommendations globally (line 378-379)
  // 2. Filters assessments and recommendations in memory for each sector (line 386-389)
  // 3. Nested loops over countries and their sectors create O(n*m*k) complexity
  // RECOMMENDED FIX: Use SQL-first approach:
  // - JOIN assessments with recommendations and countries
  // - UNNEST prioritySectors array to create one row per sector
  // - GROUP BY sector with COUNT(DISTINCT assessments.id) and AVG(countryVisionAlignment)
  // - This eliminates all in-memory filtering, reducing complexity to O(1) with proper indexing
  async getSectorPipeline(countryId?: string) {
    // Filter countries if countryId specified
    const allCountries = countryId 
      ? [await this.getCountryById(countryId)].filter(Boolean) as typeof this.getAllCountries extends () => Promise<infer T> ? Awaited<T> : never
      : await this.getAllCountries();

    // Fetch completed assessments (filtered by country if specified)
    const conditions = [eq(assessments.isCompleted, true)];
    if (countryId) {
      conditions.push(eq(assessments.countryId, countryId));
    }
    const allAssessments = await db.select().from(assessments).where(and(...conditions));
    const allRecs = await db.select().from(recommendations);

    const sectorsMap = new Map<string, { studentCount: number; totalAlignment: number; alignmentCount: number }>();

    for (const country of allCountries) {
      if (country.prioritySectors) {
        for (const sector of country.prioritySectors) {
          const countryAssessments = allAssessments.filter(a => a.countryId === country.id);
          const countryRecs = allRecs.filter(rec => 
            countryAssessments.some(a => a.id === rec.assessmentId)
          );

          const existing = sectorsMap.get(sector);
          if (existing) {
            existing.studentCount += countryAssessments.length;
            for (const rec of countryRecs) {
              existing.totalAlignment += rec.countryVisionAlignment;
              existing.alignmentCount++;
            }
          } else {
            let totalAlignment = 0;
            for (const rec of countryRecs) {
              totalAlignment += rec.countryVisionAlignment;
            }
            sectorsMap.set(sector, {
              studentCount: countryAssessments.length,
              totalAlignment,
              alignmentCount: countryRecs.length
            });
          }
        }
      }
    }

    return Array.from(sectorsMap.entries())
      .map(([sector, data]) => ({
        sector,
        studentCount: data.studentCount,
        avgAlignment: data.alignmentCount > 0 ? data.totalAlignment / data.alignmentCount : 0
      }))
      .sort((a, b) => b.studentCount - a.studentCount);
  }

  // Assessment Component operations
  async createAssessmentComponent(componentData: InsertAssessmentComponent): Promise<AssessmentComponent> {
    const [component] = await db.insert(assessmentComponents).values(componentData).returning();
    return component;
  }

  async getAllAssessmentComponents(): Promise<AssessmentComponent[]> {
    return await db.select().from(assessmentComponents).orderBy(assessmentComponents.displayOrder);
  }

  async getAssessmentComponentById(id: string): Promise<AssessmentComponent | undefined> {
    const [component] = await db.select().from(assessmentComponents).where(eq(assessmentComponents.id, id));
    return component;
  }

  async getAssessmentComponentByKey(key: string): Promise<AssessmentComponent | undefined> {
    const [component] = await db.select().from(assessmentComponents).where(eq(assessmentComponents.key, key));
    return component;
  }

  async updateAssessmentComponent(id: string, componentData: Partial<InsertAssessmentComponent>): Promise<AssessmentComponent> {
    const [component] = await db
      .update(assessmentComponents)
      .set({ ...componentData, updatedAt: new Date() })
      .where(eq(assessmentComponents.id, id))
      .returning();
    return component;
  }

  async deleteAssessmentComponent(id: string): Promise<boolean> {
    const result = await db.delete(assessmentComponents).where(eq(assessmentComponents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Career Component Affinity operations
  async createCareerComponentAffinity(affinityData: InsertCareerComponentAffinity): Promise<CareerComponentAffinity> {
    const [affinity] = await db.insert(careerComponentAffinities).values(affinityData).returning();
    return affinity;
  }

  async getCareerComponentAffinity(careerId: string, componentId: string): Promise<CareerComponentAffinity | undefined> {
    const [affinity] = await db
      .select()
      .from(careerComponentAffinities)
      .where(and(
        eq(careerComponentAffinities.careerId, careerId),
        eq(careerComponentAffinities.componentId, componentId)
      ));
    return affinity;
  }

  async getCareerComponentAffinitiesByComponent(componentId: string): Promise<CareerComponentAffinity[]> {
    return await db
      .select()
      .from(careerComponentAffinities)
      .where(eq(careerComponentAffinities.componentId, componentId));
  }

  async getCareerComponentAffinitiesByCareer(careerId: string): Promise<CareerComponentAffinity[]> {
    return await db
      .select()
      .from(careerComponentAffinities)
      .where(eq(careerComponentAffinities.careerId, careerId));
  }

  async getCareerAffinitiesBulk(careerIds: string[], componentIds?: string[]): Promise<CareerComponentAffinity[]> {
    if (careerIds.length === 0) return [];

    const conditions = [inArray(careerComponentAffinities.careerId, careerIds)];
    if (componentIds && componentIds.length > 0) {
      conditions.push(inArray(careerComponentAffinities.componentId, componentIds));
    }

    return await db
      .select()
      .from(careerComponentAffinities)
      .where(and(...conditions));
  }

  async updateCareerComponentAffinity(careerId: string, componentId: string, data: Partial<InsertCareerComponentAffinity>): Promise<CareerComponentAffinity> {
    const [affinity] = await db
      .update(careerComponentAffinities)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(careerComponentAffinities.careerId, careerId),
        eq(careerComponentAffinities.componentId, componentId)
      ))
      .returning();
    return affinity;
  }

  async deleteCareerComponentAffinity(careerId: string, componentId: string): Promise<boolean> {
    const result = await db
      .delete(careerComponentAffinities)
      .where(and(
        eq(careerComponentAffinities.careerId, careerId),
        eq(careerComponentAffinities.componentId, componentId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  // CVQ operations
  async getCvqItems(version?: string): Promise<CvqItem[]> {
    const query = db
      .select()
      .from(cvqItems)
      .orderBy(cvqItems.domain, cvqItems.position);
    
    if (version) {
      return await query.where(and(
        eq(cvqItems.isActive, true),
        eq(cvqItems.version, version)
      ));
    } else {
      return await query.where(eq(cvqItems.isActive, true));
    }
  }

  async createCvqResult(resultData: InsertCvqResult): Promise<CvqResult> {
    const [result] = await db
      .insert(cvqResults)
      .values(resultData)
      .returning();
    return result;
  }

  async getCvqResultByUserId(userId: string): Promise<CvqResult | undefined> {
    const [result] = await db
      .select()
      .from(cvqResults)
      .where(eq(cvqResults.userId, userId))
      .orderBy(desc(cvqResults.submittedAt))
      .limit(1);
    return result;
  }

  async getCvqResultByAssessmentId(assessmentId: string): Promise<CvqResult | undefined> {
    const [result] = await db
      .select()
      .from(cvqResults)
      .where(eq(cvqResults.assessmentId, assessmentId));
    return result;
  }

  // Bulk loading operations for matching service
  async getAssessmentWithCompetencies(assessmentId: string): Promise<{
    assessment: Assessment;
    quiz?: AssessmentQuiz;
    responses: QuizResponse[];
    competencyScores: Record<string, number>;
  }> {
    // Fetch assessment
    const assessment = await this.getAssessmentById(assessmentId);
    if (!assessment) {
      throw new Error(`Assessment ${assessmentId} not found`);
    }

    // Fetch quiz and responses if they exist
    const quiz = await this.getAssessmentQuizByAssessmentId(assessmentId);
    const responses = quiz ? await this.getQuizResponsesByQuizId(quiz.id) : [];

    // Calculate competency scores from quiz responses
    const competencyScores: Record<string, number> = {};
    
    if (quiz && responses.length > 0) {
      // Fetch quiz responses with question details (join with quizQuestions to get subject)
      const responsesWithQuestions = await db
        .select({
          response: quizResponses,
          question: quizQuestions,
        })
        .from(quizResponses)
        .innerJoin(quizQuestions, eq(quizResponses.questionId, quizQuestions.id))
        .where(eq(quizResponses.assessmentQuizId, quiz.id));

      // Group responses by subject
      const subjectResponses: Record<string, { correct: number; total: number }> = {};
      
      for (const { response, question } of responsesWithQuestions) {
        if (!question.subject) continue;
        
        if (!subjectResponses[question.subject]) {
          subjectResponses[question.subject] = { correct: 0, total: 0 };
        }
        
        subjectResponses[question.subject].total++;
        if (response.isCorrect) {
          subjectResponses[question.subject].correct++;
        }
      }
      
      // Calculate percentage scores for each subject
      for (const [subject, stats] of Object.entries(subjectResponses)) {
        competencyScores[subject] = stats.total > 0 
          ? Math.round((stats.correct / stats.total) * 100)
          : 0;
      }
    }

    return {
      assessment,
      quiz,
      responses,
      competencyScores,
    };
  }

  // Organization operations
  async createOrganization(organizationData: InsertOrganization): Promise<Organization> {
    const [organization] = await db
      .insert(organizations)
      .values(organizationData)
      .returning();
    return organization;
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(desc(organizations.createdAt));
  }

  async getOrganizationById(id: string): Promise<Organization | undefined> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id));
    return organization;
  }

  async getOrganizationByAdminUserId(adminUserId: string): Promise<Organization | undefined> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.adminUserId, adminUserId));
    return organization;
  }

  async updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization> {
    const [organization] = await db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return organization;
  }

  async updateOrganizationQuota(id: string, increment: number): Promise<Organization> {
    if (!Number.isInteger(increment)) {
      throw new Error('Quota increment must be an integer');
    }

    const [organization] = await db
      .update(organizations)
      .set({
        usedLicenses: sqlFunc`${organizations.usedLicenses} + ${increment}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizations.id, id),
          sqlFunc`${organizations.usedLicenses} + ${increment} >= 0`,
          sqlFunc`${organizations.usedLicenses} + ${increment} <= ${organizations.totalLicenses}`
        )
      )
      .returning();

    if (!organization) {
      const org = await this.getOrganizationById(id);
      if (!org) {
        throw new Error(`Organization ${id} not found`);
      }
      const wouldBe = org.usedLicenses + increment;
      if (wouldBe < 0) {
        throw new Error(`Cannot decrement quota below 0 (current: ${org.usedLicenses}, increment: ${increment})`);
      }
      if (wouldBe > org.totalLicenses) {
        throw new Error(`Quota exceeded: attempting to use ${wouldBe} licenses but only ${org.totalLicenses} available`);
      }
      throw new Error('Quota update failed for unknown reason');
    }

    return organization;
  }

  // Organization Member operations
  async createOrganizationMember(memberData: InsertOrganizationMember): Promise<OrganizationMember> {
    const [member] = await db
      .insert(organizationMembers)
      .values(memberData)
      .returning();
    return member;
  }

  async getOrganizationMemberById(id: string): Promise<OrganizationMember | undefined> {
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.id, id));
    return member;
  }

  async getOrganizationMemberByUserId(userId: string): Promise<OrganizationMember | undefined> {
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));
    return member;
  }

  async getOrganizationMembersByOrganizationId(organizationId: string): Promise<OrganizationMember[]> {
    return db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId))
      .orderBy(desc(organizationMembers.createdAt));
  }

  async updateOrganizationMember(id: string, data: Partial<InsertOrganizationMember>): Promise<OrganizationMember> {
    const [member] = await db
      .update(organizationMembers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizationMembers.id, id))
      .returning();
    return member;
  }

  async deleteOrganizationMember(id: string): Promise<boolean> {
    const result = await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async lockOrganizationMember(id: string): Promise<OrganizationMember> {
    const [member] = await db
      .update(organizationMembers)
      .set({
        isLocked: true,
        hasCompletedAssessment: true,
        assessmentCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationMembers.id, id))
      .returning();
    return member;
  }

  // Combined operations
  async createUserWithCredentials(userData: {
    organizationId: string;
    fullName: string;
    grade?: string;
    username?: string;
    studentId?: string;
    passwordComplexity?: 'easy' | 'medium' | 'strong';
  }): Promise<{
    user: User;
    member: OrganizationMember;
    password: string;
  }> {
    const { generatePassword } = await import("./utils/passwordGenerator");
    const { hashPassword } = await import("./utils/passwordHash");

    const nameParts = userData.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Student';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    const password = generatePassword(userData.passwordComplexity || 'medium');
    const passwordHash = await hashPassword(password);

    let username = userData.username;
    if (!username) {
      const baseUsername = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`.replace(/[^a-z.]/g, '');
      const suffix = userData.studentId || Math.random().toString(36).substring(2, 8);
      username = `${baseUsername}.${suffix}`;
    }

    let attempts = 0;
    while (attempts < 10) {
      try {
        const [user] = await db
          .insert(users)
          .values({
            firstName,
            lastName,
            username,
            passwordHash,
            accountType: 'org_student',
            isOrgGenerated: true,
            role: 'user',
          })
          .returning();

        const [member] = await db
          .insert(organizationMembers)
          .values({
            organizationId: userData.organizationId,
            userId: user.id,
            grade: userData.grade,
            studentId: userData.studentId,
            role: 'student',
          })
          .returning();

        return { user, member, password };
      } catch (error: any) {
        if (error.code === '23505') {
          username = `${username}.${Math.random().toString(36).substring(2, 5)}`;
          attempts++;
        } else {
          throw error;
        }
      }
    }

    throw new Error('Failed to generate unique username after 10 attempts');
  }
}

export const storage = new DatabaseStorage();
