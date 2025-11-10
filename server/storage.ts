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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, count, avg, sql as sqlFunc } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

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

  // Assessment operations
  createAssessment(assessment: InsertAssessment): Promise<Assessment>;
  getAssessmentById(id: string): Promise<Assessment | undefined>;
  getAssessmentsByUser(userId: string): Promise<Assessment[]>;
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
  getAnalyticsOverview(): Promise<{
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
  getCareerTrends(): Promise<Array<{
    careerId: string;
    careerTitle: string;
    recommendationCount: number;
    avgMatchScore: number;
  }>>;
  getSectorPipeline(): Promise<Array<{
    sector: string;
    studentCount: number;
    avgAlignment: number;
  }>>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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
  async getAnalyticsOverview() {
    const allAssessments = await db.select().from(assessments);
    const totalStudents = allAssessments.length;
    const completedAssessments = allAssessments.filter(a => a.isCompleted).length;

    const countriesMap = new Map<string, { countryId: string; countryName: string; count: number }>();
    const gradesMap = new Map<string, number>();

    for (const assessment of allAssessments) {
      if (assessment.countryId) {
        const existing = countriesMap.get(assessment.countryId);
        if (existing) {
          existing.count++;
        } else {
          // N+1 ISSUE: Calling getCountryById inside loop
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
    const countryAssessments = await db.select().from(assessments).where(eq(assessments.countryId, countryId));
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
  async getCareerTrends() {
    const allRecs = await db.select().from(recommendations);
    const careersMap = new Map<string, { careerId: string; careerTitle: string; count: number; totalScore: number }>();

    for (const rec of allRecs) {
      // N+1 ISSUE: Calling getCareerById inside loop
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
  async getSectorPipeline() {
    const allCountries = await this.getAllCountries();
    // N+1 ISSUE: Fetching all data globally then filtering in memory
    const allAssessments = await db.select().from(assessments).where(eq(assessments.isCompleted, true));
    const allRecs = await db.select().from(recommendations);

    const sectorsMap = new Map<string, { studentCount: number; totalAlignment: number; alignmentCount: number }>();

    // N+1 ISSUE: Nested loops with in-memory filters
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
}

export const storage = new DatabaseStorage();
