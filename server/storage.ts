import {
  encryptAndSerialize,
  deserializeAndDecrypt,
  isEncryptedFormat,
} from "./utils/encryption";
import {
  users,
  countries,
  subjects,
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
  wefSkills,
  careerWefSkillAffinities,
  wefCompetencyResults,
  organizations,
  organizationMembers,
  countryPrioritySectors,
  countrySectorWefSkills,
  files,
  organizationEvents,
  scoringTiers,
  tierComponentWeights,
  componentParameters,
  llmPromptTemplates,
  apiCredentials,
  scoringConfigChangeLog,
  contributionSubmissions,
  contributionRewards,
  systemConfig,
  systemAnnouncements,
  llmNarrativeCache,
  type LlmNarrativeCache,
  type User,
  type UpsertUser,
  type Country,
  type InsertCountry,
  type Subject,
  type InsertSubject,
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
  type WefSkill,
  type InsertWefSkill,
  type CareerWefSkillAffinity,
  type InsertCareerWefSkillAffinity,
  type WefCompetencyResult,
  type InsertWefCompetencyResult,
  type Organization,
  type InsertOrganization,
  type OrganizationMember,
  type InsertOrganizationMember,
  type CountryPrioritySector,
  type InsertCountryPrioritySector,
  type ContributionSubmission,
  type InsertContributionSubmission,
  type ContributionReward,
  type InsertContributionReward,
  type SystemConfig,
  type InsertSystemConfig,
  type CountrySectorWefSkill,
  type InsertCountrySectorWefSkill,
  type File,
  type InsertFile,
  type OrganizationEvent,
  type InsertOrganizationEvent,
  type ScoringTier,
  type InsertScoringTier,
  type TierComponentWeight,
  type InsertTierComponentWeight,
  type ComponentParameter,
  type InsertComponentParameter,
  type LlmPromptTemplate,
  type InsertLlmPromptTemplate,
  type ApiCredential,
  type InsertApiCredential,
  type ScoringConfigChangeLog,
  type InsertScoringConfigChangeLog,
  type SystemAnnouncement,
  type InsertSystemAnnouncement,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, count, avg, sql, inArray, isNotNull, gte, type SQL } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByOAuthProvider(provider: string, providerId: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(userData: {
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    passwordHash: string;
    accountType: string;
    grade?: string;
  }): Promise<User>;
  updateUserRole(targetUserId: string, newRole: 'user' | 'superadmin', newAccountType?: 'individual' | 'org_admin' | 'org_student' | null): Promise<User>;
  updateUserPremiumStatus(userId: string, stripeCustomerId: string | null): Promise<User>;
  createStandaloneUser(userData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    isPremium?: boolean;
    purchasedLicenses?: number;
    stripeCustomerId?: string | null;
  }): Promise<{ user: User; username: string; password: string }>;
  updateUserFields(userId: string, fields: {
    phone?: string;
    isPremium?: boolean;
    purchasedLicenses?: number;
    stripeCustomerId?: string | null;
  }): Promise<User>;
  updateUser(userId: string, data: Partial<{ firstName: string; lastName: string; lastLoginAt: Date; profileImageUrl: string; oauthProvider: string; oauthProviderId: string; failedLoginAttempts: number; lockedUntil: Date | null; role: string }>): Promise<User>;

  // Country operations
  getAllCountries(): Promise<Country[]>;
  getCountryById(id: string): Promise<Country | undefined>;
  createCountry(country: InsertCountry): Promise<Country>;
  updateCountry(id: string, data: Partial<InsertCountry>): Promise<Country>;
  deleteCountry(id: string): Promise<boolean>;

  // Subject operations (curriculum-scoped)
  getAllSubjects(): Promise<Subject[]>;
  getSubjectById(id: string): Promise<Subject | undefined>;
  getSubjectsByCurriculum(countryId: string, curriculum: string): Promise<Subject[]>;
  getSubjectsByCountry(countryId: string): Promise<Subject[]>;
  createSubject(subject: InsertSubject): Promise<Subject>;
  updateSubject(id: string, data: Partial<InsertSubject>): Promise<Subject>;
  deleteSubject(id: string): Promise<boolean>;
  getSubjectByCode(countryId: string, curriculum: string, code: string): Promise<Subject | undefined>;
  renameCurriculumInSubjects(countryId: string, oldName: string, newName: string): Promise<number>;
  renameCurriculumInQuizQuestions(countryId: string, oldName: string, newName: string): Promise<number>;

  // Skills operations
  getAllSkills(): Promise<Skill[]>;
  getSkillsByCategory(category: string): Promise<Skill[]>;

  // Career operations
  createCareer(career: InsertCareer): Promise<Career>;
  getAllCareers(): Promise<Career[]>;
  getCareerById(id: string): Promise<Career | undefined>;
  updateCareer(id: string, data: Partial<InsertCareer>): Promise<Career>;
  deleteCareer(id: string): Promise<boolean>;

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
  deleteRecommendationsByAssessment(assessmentId: string): Promise<number>;

  // Quiz operations
  createQuizQuestion(question: InsertQuizQuestion): Promise<QuizQuestion>;
  getAllQuizQuestions(): Promise<QuizQuestion[]>;
  getQuizQuestionsByGradeAndCountry(gradeBand: string, countryId: string | null): Promise<QuizQuestion[]>;
  getQuizQuestionsByFilters(filters: {
    countryId?: string | null;
    subject?: string;
    grade?: number;
    gradeBand?: string;
    curriculum?: string;
    limit?: number;
    offset?: number;
  }): Promise<QuizQuestion[]>;
  getQuizQuestions(filters: {
    countryId?: string;
    subject?: string;
    grade?: number;
    gradeBand?: string;
    limit?: number;
    offset?: number;
  }): Promise<QuizQuestion[]>;
  updateQuizQuestion(id: string, data: Partial<InsertQuizQuestion>): Promise<QuizQuestion | undefined>;
  deleteQuizQuestion(id: string): Promise<boolean>;
  getQuizQuestionCountsBySubject(countryId?: string, curriculum?: string): Promise<Array<{ subject: string; curriculum: string; count: number }>>;
  createAssessmentQuiz(assessmentQuiz: InsertAssessmentQuiz): Promise<AssessmentQuiz>;
  getAssessmentQuizByAssessmentId(assessmentId: string): Promise<AssessmentQuiz | undefined>;
  createQuizResponse(response: InsertQuizResponse): Promise<QuizResponse>;
  getQuizResponsesByQuizId(assessmentQuizId: string): Promise<QuizResponse[]>;
  updateQuizResponse(id: string, data: Partial<InsertQuizResponse>): Promise<QuizResponse>;
  updateAssessmentQuiz(id: string, data: Partial<InsertAssessmentQuiz>): Promise<AssessmentQuiz>;

  // Analytics operations
  getAnalyticsOverview(countryId?: string, organizationId?: string): Promise<{
    totalStudents: number;
    completedAssessments: number;
    countriesBreakdown: Array<{ countryId: string; countryName: string; count: number }>;
    gradeDistribution: Array<{ grade: string; count: number }>;
  }>;
  getCountryAnalytics(countryId: string, organizationId?: string): Promise<{
    totalStudents: number;
    topCareers: Array<{ careerId: string; careerTitle: string; count: number }>;
    avgVisionAlignment: number;
    popularSubjects: Array<{ subject: string; count: number }>;
  }>;
  getCareerTrends(countryId?: string, organizationId?: string): Promise<Array<{
    careerId: string;
    careerTitle: string;
    recommendationCount: number;
    avgMatchScore: number;
  }>>;
  getSectorPipeline(countryId?: string, organizationId?: string): Promise<Array<{
    sector: string;
    sectorAr: string | null;
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
  
  // WEF Skills operations
  createWefSkill(skill: InsertWefSkill): Promise<WefSkill>;
  upsertWefSkillByName(skill: InsertWefSkill): Promise<WefSkill>;
  getAllWefSkills(version?: string): Promise<WefSkill[]>;
  getWefSkillById(id: string): Promise<WefSkill | undefined>;
  getWefSkillByName(name: string): Promise<WefSkill | undefined>;
  
  // Career WEF Skill Affinity operations
  createCareerWefSkillAffinity(affinity: InsertCareerWefSkillAffinity): Promise<CareerWefSkillAffinity>;
  createOrUpdateCareerWefSkillAffinity(careerId: string, wefSkillId: string, affinityData: Omit<InsertCareerWefSkillAffinity, 'careerId' | 'wefSkillId'>): Promise<CareerWefSkillAffinity>;
  getCareerWefSkillAffinity(careerId: string, wefSkillId: string): Promise<CareerWefSkillAffinity | undefined>;
  getCareerWefSkillAffinitiesByCareer(careerId: string): Promise<CareerWefSkillAffinity[]>;
  getCareerWefSkillAffinitiesBulk(careerIds: string[]): Promise<CareerWefSkillAffinity[]>;
  getCareerWefSkillAffinityCount(): Promise<number>;
  getWefSkillsForCareers(careerIds: string[]): Promise<Array<{ careerId: string; name: string; nameAr: string | null; description: string; descriptionAr: string | null; affinityScore: number }>>;
  
  // WEF Competency Results operations
  createWefCompetencyResult(result: InsertWefCompetencyResult): Promise<WefCompetencyResult>;
  upsertWefCompetencyResult(assessmentId: string, userId: string | null, skillScores: Record<string, number>, sourceAttribution: string, isGuest?: boolean, guestSessionId?: string | null): Promise<WefCompetencyResult>;
  getWefCompetencyResultByAssessmentId(assessmentId: string): Promise<WefCompetencyResult | undefined>;
  getWefCompetencyResultByUserId(userId: string): Promise<WefCompetencyResult | undefined>;

  // Country Priority Sectors operations
  getCountryPrioritySectorsByCountry(countryId: string): Promise<CountryPrioritySector[]>;
  createOrUpdateCountryPrioritySector(countryId: string, name: string, displayOrder: number, description?: string): Promise<CountryPrioritySector>;
  createOrUpdateCountrySectorWefSkill(sectorId: string, wefSkillId: string, importance: number): Promise<CountrySectorWefSkill>;
  
  // Bulk loading operations for matching service
  getAssessmentWithCompetencies(assessmentId: string): Promise<{
    assessment: Assessment;
    quiz?: AssessmentQuiz;
    responses: QuizResponse[];
    competencyScores: Record<string, number>;
  }>;

  // Organization operations
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  createGroupPurchaseTransaction(params: {
    userId: string;
    organizationName: string;
    studentCount: number;
    paymentIntentId: string;
    amountPaid: number;
  }): Promise<{ user: User; organization: Organization }>;
  getAllOrganizations(): Promise<Organization[]>;
  getOrganizationsWithLogos(): Promise<Array<{ id: string; name: string; logoUrl: string | null }>>;
  getOrganizationById(id: string): Promise<Organization | undefined>;
  getOrganizationByAdminUserId(adminUserId: string): Promise<Organization | undefined>;
  updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization>;
  updateOrganizationQuota(id: string, increment: number): Promise<Organization>;
  deleteOrganization(id: string): Promise<boolean>;
  deleteOrganizationEventsByOrgId(organizationId: string): Promise<number>;
  deleteFilesByOrganizationId(organizationId: string): Promise<number>;

  // Organization Member operations
  createOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember>;
  getOrganizationMemberById(id: string): Promise<OrganizationMember | undefined>;
  getOrganizationMemberByUserId(userId: string): Promise<OrganizationMember | undefined>;
  getOrganizationMembersByOrganizationId(organizationId: string): Promise<OrganizationMember[]>;
  deleteOrganizationMember(memberId: string): Promise<boolean>;
  bulkDeleteOrganizationMembers(memberIds: string[]): Promise<number>;
  getOrganizationStats(organizationId: string): Promise<{
    totalMembers: number;
    completedAssessments: number;
    pendingAssessments: number;
  }>;
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
    studentName?: string;
    studentAge?: number;
    studentGender?: string;
    passwordComplexity?: 'medium' | 'strong';
  }): Promise<{
    user: User;
    member: OrganizationMember;
    password: string;
  }>;

  // File management operations
  createFile(file: InsertFile): Promise<File>;
  getFileById(id: string): Promise<File | undefined>;
  getFilesByOrganization(organizationId: string): Promise<File[]>;
  getFilesByUploader(userId: string): Promise<File[]>;
  getAllFiles(): Promise<File[]>;
  getFileByShareToken(shareToken: string): Promise<File | undefined>;
  updateFile(id: string, data: Partial<InsertFile>): Promise<File>;
  updateFileProcessingStatus(id: string, status: 'pending' | 'processing' | 'completed' | 'failed', error?: string, processedRecords?: number, failedRecords?: number): Promise<File>;
  deleteFile(id: string): Promise<boolean>;
  generateShareToken(fileId: string, expiryHours?: number): Promise<{ shareToken: string; expiry: Date }>;
  invalidateShareToken(fileId: string): Promise<void>;
  incrementDownloadCount(id: string): Promise<File>;

  // Organization events (audit logging)
  createOrganizationEvent(event: InsertOrganizationEvent): Promise<OrganizationEvent>;
  getOrganizationEvents(organizationId: string, limit?: number): Promise<OrganizationEvent[]>;
  getAllOrganizationEvents(limit?: number): Promise<OrganizationEvent[]>;
  getOrganizationEventsByType(organizationId: string, eventType: string): Promise<OrganizationEvent[]>;

  // Scoring Configuration operations
  getAllScoringTiers(): Promise<ScoringTier[]>;
  getScoringTierByKey(key: string): Promise<ScoringTier | undefined>;
  createScoringTier(tier: InsertScoringTier): Promise<ScoringTier>;
  updateScoringTier(id: string, tier: Partial<InsertScoringTier>): Promise<ScoringTier>;
  
  // Tier Component Weights operations
  getTierComponentWeights(tierId: string): Promise<TierComponentWeight[]>;
  getAllTierComponentWeights(): Promise<TierComponentWeight[]>;
  upsertTierComponentWeight(data: InsertTierComponentWeight): Promise<TierComponentWeight>;
  updateTierComponentWeight(id: string, data: Partial<InsertTierComponentWeight>): Promise<TierComponentWeight>;
  
  // Component Parameters operations
  getComponentParameters(componentId: string): Promise<ComponentParameter[]>;
  getAllComponentParameters(): Promise<ComponentParameter[]>;
  upsertComponentParameter(data: InsertComponentParameter): Promise<ComponentParameter>;
  updateComponentParameter(id: string, data: Partial<InsertComponentParameter>): Promise<ComponentParameter>;
  deleteComponentParameter(id: string): Promise<boolean>;
  
  // LLM Prompt Templates operations
  getAllLlmPromptTemplates(): Promise<LlmPromptTemplate[]>;
  getLlmPromptTemplateByKey(key: string): Promise<LlmPromptTemplate | undefined>;
  createLlmPromptTemplate(template: InsertLlmPromptTemplate): Promise<LlmPromptTemplate>;
  updateLlmPromptTemplate(id: string, template: Partial<InsertLlmPromptTemplate>): Promise<LlmPromptTemplate>;
  
  // API Credentials operations
  getApiCredential(provider: string): Promise<ApiCredential | undefined>;
  getAllApiCredentials(): Promise<ApiCredential[]>;
  upsertApiCredential(data: InsertApiCredential): Promise<ApiCredential>;
  updateApiCredentialTestResult(provider: string, result: string): Promise<ApiCredential>;
  deleteApiCredential(provider: string): Promise<boolean>;
  
  // Scoring Config Change Log operations
  createScoringConfigChangeLog(log: InsertScoringConfigChangeLog): Promise<ScoringConfigChangeLog>;
  getScoringConfigChangeLogs(limit?: number): Promise<ScoringConfigChangeLog[]>;

  // Contribution Submission operations
  createContributionSubmission(submission: InsertContributionSubmission): Promise<ContributionSubmission>;
  getContributionSubmission(id: string): Promise<ContributionSubmission | undefined>;
  getContributionSubmissionsByOrg(organizationId: string): Promise<ContributionSubmission[]>;
  getAllPendingContributionSubmissions(): Promise<ContributionSubmission[]>;
  updateContributionSubmission(id: string, data: Partial<ContributionSubmission>): Promise<ContributionSubmission>;
  getOrganizationDailySubmissionCount(organizationId: string): Promise<number>;
  
  // Contribution Reward operations
  createContributionReward(reward: InsertContributionReward): Promise<ContributionReward>;
  getContributionRewardsByOrg(organizationId: string): Promise<ContributionReward[]>;
  getContributionStats(): Promise<{
    totalSubmissions: number;
    pendingSubmissions: number;
    approvedSubmissions: number;
    totalQuestionsApproved: number;
    totalCreditsAwarded: number;
    topContributors: Array<{ organizationId: string; organizationName: string; questionsApproved: number; creditsEarned: number }>;
  }>;
  getOrganizationsWithPendingRewards(): Promise<Organization[]>;

  // Quiz questions by country/grade (for duplicate detection)
  getQuizQuestionsByCountryAndGrade(countryId: string, grade: number, subject: string): Promise<QuizQuestion[]>;

  // System Configuration operations
  getSystemConfig(key: string): Promise<SystemConfig | undefined>;
  getAllSystemConfigs(category?: string): Promise<SystemConfig[]>;
  upsertSystemConfig(key: string, value: string, updatedByUserId?: string): Promise<SystemConfig>;
  deleteSystemConfig(key: string): Promise<boolean>;
  
  // System Announcements operations
  createSystemAnnouncement(announcement: InsertSystemAnnouncement): Promise<SystemAnnouncement>;
  getSystemAnnouncement(id: string): Promise<SystemAnnouncement | undefined>;
  getAllSystemAnnouncements(): Promise<SystemAnnouncement[]>;
  getActiveSystemAnnouncements(targetAudience?: string): Promise<SystemAnnouncement[]>;
  updateSystemAnnouncement(id: string, data: Partial<InsertSystemAnnouncement>): Promise<SystemAnnouncement>;
  deleteSystemAnnouncement(id: string): Promise<boolean>;
  
  // LLM Narrative Cache operations
  getLlmNarrativeCache(assessmentId: string, careerId: string, promptKey: string, language: string): Promise<string | null>;
  setLlmNarrativeCache(assessmentId: string, careerId: string, promptKey: string, language: string, narrative: string): Promise<void>;
  invalidateLlmNarrativeCacheForAssessment(assessmentId: string): Promise<void>;
  invalidateLlmNarrativeCacheForPromptKey(promptKey: string): Promise<void>;

  // Global user search (for superadmin)
  searchAllUsers(query: string, limit?: number): Promise<User[]>;
  getAllStudentsWithAssessments(): Promise<Array<{
    user: User;
    organizationName: string | null;
    assessmentCount: number;
    latestAssessmentDate: Date | null;
  }>>;
  
  // Multi-grade progress tracking
  getStudentAssessmentProgression(userId: string): Promise<Array<{
    assessment: Assessment;
    recommendations: Recommendation[];
    careerNames: string[];
  }>>;
  getStudentCareerEvolution(userId: string): Promise<Array<{
    grade: string;
    completedAt: Date | null;
    topCareers: Array<{ careerId: string; careerName: string; matchScore: number }>;
    riasecScores: any;
    interests: string[];
  }>>;
  getOrganizationGradeProgress(organizationId: string): Promise<{
    gradeStats: Array<{
      grade: string;
      totalStudents: number;
      completedAssessments: number;
      avgMatchScore: number;
    }>;
    studentProgress: Array<{
      userId: string;
      studentName: string;
      assessmentsByGrade: Array<{ grade: string; completedAt: Date | null; topCareer: string | null }>;
    }>;
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    return user;
  }

  async getUserByOAuthProvider(provider: string, providerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(
        eq(users.oauthProvider, provider),
        eq(users.oauthProviderId, providerId)
      )
    );
    return user;
  }

  async createStandaloneUser(userData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    isPremium?: boolean;
    purchasedLicenses?: number;
    stripeCustomerId?: string | null;
  }): Promise<{ user: User; username: string; password: string }> {
    const { generateUsername, generatePassword } = await import("./utils/passwordGenerator");
    const { hashPassword } = await import("./utils/passwordHash");
    
    // Generate username with collision handling
    let username = generateUsername(userData.firstName, userData.lastName);
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      const existing = await this.getUserByUsername(username);
      if (!existing) break;
      
      // Collision detected - add random suffix
      username = generateUsername(userData.firstName, userData.lastName, Math.random().toString(36).substring(2, 6));
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      throw new Error("Failed to generate unique username after 10 attempts");
    }
    
    // Generate and hash password
    const password = generatePassword('medium');
    const passwordHash = await hashPassword(password);
    
    // Create user
    const [user] = await db.insert(users).values({
      username,
      passwordHash,
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      phone: userData.phone,
      role: 'user',
      accountType: 'individual',
      isOrgGenerated: false,
      isPremium: userData.isPremium ?? false,
      purchasedLicenses: userData.purchasedLicenses ?? 0,
      stripeCustomerId: userData.stripeCustomerId ?? null
    }).returning();
    
    return { user, username, password };
  }

  async updateUserFields(userId: string, fields: {
    phone?: string;
    isPremium?: boolean;
    purchasedLicenses?: number; // This is incremental - will be added to existing
    stripeCustomerId?: string | null;
  }): Promise<User> {
    // If purchasedLicenses is provided, increment it (don't replace)
    const updates: any = { ...fields, updatedAt: new Date() };
    
    if (fields.purchasedLicenses !== undefined) {
      const currentUser = await this.getUser(userId);
      if (!currentUser) {
        throw new Error(`User ${userId} not found`);
      }
      updates.purchasedLicenses = (currentUser.purchasedLicenses || 0) + fields.purchasedLicenses;
    }
    
    const [user] = await db.update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // SECURITY: Filter out sensitive fields to prevent privilege escalation
    // role and accountType should only be updated via dedicated admin methods
    const SAFE_UPDATE_FIELDS = [
      'email', 'firstName', 'lastName', 'phone', 'profileImageUrl',
      'passwordHash', 'isPremium', 'purchasedLicenses', 'usedLicenses',
      'stripeCustomerId', 'paymentDate', 'lastLoginAt', 'username'
    ];
    
    const safeUpdateData: Record<string, any> = { updatedAt: new Date() };
    for (const key of SAFE_UPDATE_FIELDS) {
      if (key in userData && (userData as any)[key] !== undefined) {
        safeUpdateData[key] = (userData as any)[key];
      }
    }
    
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: safeUpdateData,
      })
      .returning();
    return user;
  }

  async createUser(userData: {
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    passwordHash: string;
    accountType: string;
    grade?: string;
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  // Admin-only method to update user role (requires superadmin verification at route level)
  async updateUserRole(
    targetUserId: string,
    newRole: 'user' | 'superadmin',
    newAccountType?: 'individual' | 'org_admin' | 'org_student' | null
  ): Promise<User> {
    const updates: Record<string, any> = {
      role: newRole,
      updatedAt: new Date(),
    };
    
    if (newAccountType !== undefined) {
      updates.accountType = newAccountType;
    }
    
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, targetUserId))
      .returning();
    
    if (!user) {
      throw new Error(`User not found: ${targetUserId}`);
    }
    
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

  async updateUser(userId: string, data: Partial<{ firstName: string; lastName: string; lastLoginAt: Date; profileImageUrl: string; oauthProvider: string; oauthProviderId: string; failedLoginAttempts: number; lockedUntil: Date | null; role: string }>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...data,
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

  async updateCountry(id: string, data: Partial<InsertCountry>): Promise<Country> {
    const [country] = await db
      .update(countries)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(countries.id, id))
      .returning();
    
    if (!country) {
      throw new Error(`Country not found: ${id}`);
    }
    
    return country;
  }

  async deleteCountry(id: string): Promise<boolean> {
    const result = await db.delete(countries).where(eq(countries.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Subject operations (curriculum-scoped)
  async getAllSubjects(): Promise<Subject[]> {
    return await db.select().from(subjects).orderBy(subjects.displayOrder);
  }

  async getSubjectById(id: string): Promise<Subject | undefined> {
    const [subject] = await db.select().from(subjects).where(eq(subjects.id, id));
    return subject;
  }

  async getSubjectsByCurriculum(countryId: string, curriculum: string): Promise<Subject[]> {
    return await db
      .select()
      .from(subjects)
      .where(
        and(
          eq(subjects.countryId, countryId),
          eq(subjects.curriculum, curriculum),
          eq(subjects.isActive, true)
        )
      )
      .orderBy(subjects.displayOrder);
  }

  async getSubjectsByCountry(countryId: string): Promise<Subject[]> {
    return await db
      .select()
      .from(subjects)
      .where(eq(subjects.countryId, countryId))
      .orderBy(subjects.displayOrder);
  }

  async createSubject(subjectData: InsertSubject): Promise<Subject> {
    const [subject] = await db.insert(subjects).values(subjectData).returning();
    return subject;
  }

  async updateSubject(id: string, data: Partial<InsertSubject>): Promise<Subject> {
    const [subject] = await db
      .update(subjects)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(subjects.id, id))
      .returning();
    
    if (!subject) {
      throw new Error(`Subject not found: ${id}`);
    }
    
    return subject;
  }

  async deleteSubject(id: string): Promise<boolean> {
    const result = await db.delete(subjects).where(eq(subjects.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSubjectByCode(countryId: string, curriculum: string, code: string): Promise<Subject | undefined> {
    const [subject] = await db
      .select()
      .from(subjects)
      .where(
        and(
          eq(subjects.countryId, countryId),
          eq(subjects.curriculum, curriculum),
          eq(subjects.code, code)
        )
      );
    return subject;
  }

  async renameCurriculumInSubjects(countryId: string, oldName: string, newName: string): Promise<number> {
    const result = await db
      .update(subjects)
      .set({ 
        curriculum: newName,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(subjects.countryId, countryId),
          eq(subjects.curriculum, oldName)
        )
      );
    return result.rowCount ?? 0;
  }

  async renameCurriculumInQuizQuestions(countryId: string, oldName: string, newName: string): Promise<number> {
    const result = await db
      .update(quizQuestions)
      .set({ curriculum: newName })
      .where(
        and(
          eq(quizQuestions.countryId, countryId),
          eq(quizQuestions.curriculum, oldName)
        )
      );
    return result.rowCount ?? 0;
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
      .where(eq(assessments.guestSessionId, guestToken))
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

  async deleteRecommendationsByAssessment(assessmentId: string): Promise<number> {
    const result = await db
      .delete(recommendations)
      .where(eq(recommendations.assessmentId, assessmentId));
    return result.rowCount || 0;
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
            sql`${quizQuestions.countryId} IS NULL`
          )
        );
      
      return [...countrySpecific, ...globalQuestions];
    } else {
      return await db
        .select()
        .from(quizQuestions)
        .where(
          and(
            eq(quizQuestions.gradeBand, gradeBand),
            sql`${quizQuestions.countryId} IS NULL`
          )
        );
    }
  }

  async getQuizQuestionsByFilters(filters: {
    countryId?: string | null;
    subject?: string;
    grade?: number;
    gradeBand?: string;
    curriculum?: string;
    limit?: number;
    offset?: number;
  }): Promise<QuizQuestion[]> {
    const conditions: any[] = [];
    
    if (filters.countryId !== undefined) {
      if (filters.countryId === null) {
        conditions.push(sql`${quizQuestions.countryId} IS NULL`);
      } else {
        conditions.push(
          or(
            eq(quizQuestions.countryId, filters.countryId),
            sql`${quizQuestions.countryId} IS NULL`
          )
        );
      }
    }
    
    if (filters.subject) {
      conditions.push(eq(quizQuestions.subject, filters.subject));
    }
    
    if (filters.grade !== undefined) {
      conditions.push(eq(quizQuestions.grade, filters.grade));
    } else if (filters.gradeBand) {
      conditions.push(eq(quizQuestions.gradeBand, filters.gradeBand));
    }
    
    if (filters.curriculum) {
      conditions.push(eq(quizQuestions.curriculum, filters.curriculum));
    }
    
    let query = db.select().from(quizQuestions);
    
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

  async getQuizQuestions(filters: {
    countryId?: string;
    curriculum?: string;
    subject?: string;
    grade?: number;
    gradeBand?: string;
    limit?: number;
    offset?: number;
  }): Promise<QuizQuestion[]> {
    let query = db.select().from(quizQuestions);
    
    const conditions: any[] = [];
    if (filters.countryId) {
      conditions.push(eq(quizQuestions.countryId, filters.countryId));
    }
    if (filters.curriculum) {
      conditions.push(eq(quizQuestions.curriculum, filters.curriculum));
    }
    if (filters.subject) {
      conditions.push(eq(quizQuestions.subject, filters.subject));
    }
    if (filters.grade !== undefined) {
      conditions.push(eq(quizQuestions.grade, filters.grade));
    } else if (filters.gradeBand) {
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

  async getQuizQuestionCountsBySubject(countryId?: string, curriculum?: string): Promise<Array<{ subject: string; curriculum: string; count: number }>> {
    const conditions: any[] = [];
    if (countryId) conditions.push(eq(quizQuestions.countryId, countryId));
    if (curriculum) conditions.push(eq(quizQuestions.curriculum, curriculum));

    const rows = await db
      .select({
        subject: quizQuestions.subject,
        curriculum: quizQuestions.curriculum,
        count: count(),
      })
      .from(quizQuestions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(quizQuestions.subject, quizQuestions.curriculum);

    return rows.map(r => ({ subject: r.subject, curriculum: r.curriculum ?? "", count: Number(r.count) }));
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
    // Delete quiz responses that reference this question first (FK cascade)
    await db.delete(quizResponses).where(eq(quizResponses.questionId, id));
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
  
  // OPTIMIZED: Uses JOIN and aggregations to eliminate N+1 queries
  async getAnalyticsOverview(countryId?: string, organizationId?: string) {
    // Only count completed assessments for accurate analytics
    const conditions = [eq(assessments.isCompleted, true)];
    
    // Filter by country if specified
    if (countryId) {
      conditions.push(eq(assessments.countryId, countryId));
    }
    
    // Filter by organization if specified (for org_admin access)
    if (organizationId) {
      conditions.push(
        sql`${assessments.userId} IN (SELECT ${organizationMembers.userId} FROM ${organizationMembers} WHERE ${organizationMembers.organizationId} = ${organizationId})`
      );
    }
    
    // Get total counts with a single query
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assessments)
      .where(and(...conditions));
    const totalStudents = totalResult[0]?.count || 0;
    const completedAssessments = totalStudents; // All are completed due to filter

    // Get countries breakdown with JOIN in a single query
    const countriesData = await db
      .select({
        countryId: assessments.countryId,
        countryName: countries.name,
        count: sql<number>`count(*)::int`
      })
      .from(assessments)
      .leftJoin(countries, eq(assessments.countryId, countries.id))
      .where(and(...conditions, isNotNull(assessments.countryId)))
      .groupBy(assessments.countryId, countries.name);

    // Get grade distribution with aggregation
    const gradesData = await db
      .select({
        grade: assessments.grade,
        count: sql<number>`count(*)::int`
      })
      .from(assessments)
      .where(and(...conditions, isNotNull(assessments.grade)))
      .groupBy(assessments.grade);

    return {
      totalStudents,
      completedAssessments,
      countriesBreakdown: countriesData.map(row => ({
        countryId: row.countryId!,
        countryName: row.countryName || 'Unknown',
        count: row.count
      })),
      gradeDistribution: gradesData.map(row => ({
        grade: row.grade!,
        count: row.count
      }))
    };
  }

  // OPTIMIZED: Uses JOINs and aggregations to eliminate N+1 queries
  async getCountryAnalytics(countryId: string, organizationId?: string) {
    // Build conditions for filtering
    const conditions = [eq(assessments.countryId, countryId), eq(assessments.isCompleted, true)];
    
    // Filter by organization if specified (for org_admin access)
    if (organizationId) {
      conditions.push(
        sql`${assessments.userId} IN (SELECT ${organizationMembers.userId} FROM ${organizationMembers} WHERE ${organizationMembers.organizationId} = ${organizationId})`
      );
    }
    
    // Get total students count with a single query
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assessments)
      .where(and(...conditions));
    const totalStudents = totalResult[0]?.count || 0;

    // Get top careers with JOIN in a single query
    const careersData = await db
      .select({
        careerId: recommendations.careerId,
        careerTitle: careers.title,
        count: sql<number>`count(*)::int`
      })
      .from(assessments)
      .innerJoin(recommendations, eq(assessments.id, recommendations.assessmentId))
      .leftJoin(careers, eq(recommendations.careerId, careers.id))
      .where(and(...conditions))
      .groupBy(recommendations.careerId, careers.title)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // Get average vision alignment with a single query
    const alignmentResult = await db
      .select({ avg: sql<number>`avg(${recommendations.countryVisionAlignment})::float` })
      .from(assessments)
      .innerJoin(recommendations, eq(assessments.id, recommendations.assessmentId))
      .where(and(...conditions));
    const avgVisionAlignment = alignmentResult[0]?.avg || 0;

    // Get popular subjects - need to fetch and process since it's an array column
    const subjectsResult = await db
      .select({ favoriteSubjects: assessments.favoriteSubjects })
      .from(assessments)
      .where(and(...conditions, isNotNull(assessments.favoriteSubjects)));

    const subjectsMap = new Map<string, number>();
    for (const row of subjectsResult) {
      if (row.favoriteSubjects) {
        for (const subject of row.favoriteSubjects) {
          subjectsMap.set(subject, (subjectsMap.get(subject) || 0) + 1);
        }
      }
    }

    return {
      totalStudents,
      topCareers: careersData.map(row => ({
        careerId: row.careerId,
        careerTitle: row.careerTitle || 'Unknown',
        count: row.count
      })),
      avgVisionAlignment,
      popularSubjects: Array.from(subjectsMap.entries())
        .map(([subject, count]) => ({ subject, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
  }

  // OPTIMIZED: Uses JOIN and aggregations to eliminate N+1 queries
  async getCareerTrends(countryId?: string, organizationId?: string) {
    // Build conditions for filtering
    const conditions = [eq(assessments.isCompleted, true)];
    if (countryId) {
      conditions.push(eq(assessments.countryId, countryId));
    }
    
    // Filter by organization if specified (for org_admin access)
    if (organizationId) {
      conditions.push(
        sql`${assessments.userId} IN (SELECT ${organizationMembers.userId} FROM ${organizationMembers} WHERE ${organizationMembers.organizationId} = ${organizationId})`
      );
    }

    // Get career trends with JOIN in a single query
    const trendsData = await db
      .select({
        careerId: recommendations.careerId,
        careerTitle: careers.title,
        recommendationCount: sql<number>`count(*)::int`,
        avgMatchScore: sql<number>`avg(${recommendations.overallMatchScore})::float`
      })
      .from(assessments)
      .innerJoin(recommendations, eq(assessments.id, recommendations.assessmentId))
      .leftJoin(careers, eq(recommendations.careerId, careers.id))
      .where(and(...conditions))
      .groupBy(recommendations.careerId, careers.title)
      .orderBy(sql`count(*) desc`)
      .limit(20);

    return trendsData.map(row => ({
      careerId: row.careerId,
      careerTitle: row.careerTitle || 'Unknown',
      recommendationCount: row.recommendationCount,
      avgMatchScore: row.avgMatchScore
    }));
  }

  // OPTIMIZED: Uses SQL-first approach with UNNEST to eliminate N+1 queries
  // Previous implementation had O(n*m*k) complexity from nested loops
  // New implementation uses single query with UNNEST and aggregation
  async getSectorPipeline(countryId?: string, organizationId?: string) {
    // Build SQL query that:
    // 1. JOINs countries, assessments, and recommendations
    // 2. Uses UNNEST to expand priority_sectors array into rows
    // 3. Groups by sector and aggregates counts/averages
    const conditions: SQL[] = [eq(assessments.isCompleted, true)];
    
    if (countryId) {
      conditions.push(eq(assessments.countryId, countryId));
    }
    if (organizationId) {
      conditions.push(
        sql`${assessments.userId} IN (SELECT ${organizationMembers.userId} FROM ${organizationMembers} WHERE ${organizationMembers.organizationId} = ${organizationId})`
      );
    }

    // Use optimized query with UNNEST for sector expansion.
    // English sectors (priority_sectors) are NOT NULL so they always drive row
    // generation. Arabic names are fetched by ordinal position from
    // priority_sectors_ar, which may be NULL — a LATERAL subquery returns NULL
    // safely in that case rather than dropping the row.
    const result = await db.execute(sql`
      WITH country_sectors AS (
        SELECT 
          c.id as country_id,
          s.sector,
          (
            SELECT ar.elem
            FROM unnest(c.priority_sectors_ar) WITH ORDINALITY AS ar(elem, pos)
            WHERE ar.pos = s.pos
            LIMIT 1
          ) AS sector_ar
        FROM countries c,
          LATERAL unnest(c.priority_sectors) WITH ORDINALITY AS s(sector, pos)
        ${countryId ? sql`WHERE c.id = ${countryId}` : sql``}
      ),
      filtered_assessments AS (
        SELECT a.*
        FROM assessments a
        WHERE a.is_completed = true
        ${countryId ? sql`AND a.country_id = ${countryId}` : sql``}
        ${organizationId ? sql`AND a.user_id IN (
          SELECT om.user_id FROM organization_members om WHERE om.organization_id = ${organizationId}
        )` : sql``}
      )
      SELECT 
        cs.sector,
        cs.sector_ar,
        COUNT(DISTINCT fa.id)::int as student_count,
        COALESCE(AVG(r.country_vision_alignment), 0)::float as avg_alignment
      FROM country_sectors cs
      LEFT JOIN filtered_assessments fa ON fa.country_id = cs.country_id
      LEFT JOIN recommendations r ON r.assessment_id = fa.id
      GROUP BY cs.sector, cs.sector_ar
      ORDER BY student_count DESC
    `);

    return (result.rows as any[]).map(row => ({
      sector: row.sector,
      sectorAr: row.sector_ar || null,
      studentCount: row.student_count || 0,
      avgAlignment: row.avg_alignment || 0
    }));
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

  // WEF Skills operations
  async createWefSkill(skillData: InsertWefSkill): Promise<WefSkill> {
    const [skill] = await db
      .insert(wefSkills)
      .values(skillData)
      .returning();
    return skill;
  }

  async upsertWefSkillByName(skillData: InsertWefSkill): Promise<WefSkill> {
    const existing = await this.getWefSkillByName(skillData.name);
    if (existing) {
      // Update existing skill - only set fields that are explicitly provided
      const updateData: Partial<InsertWefSkill> = {};
      
      if (skillData.competencyType !== undefined) updateData.competencyType = skillData.competencyType;
      if (skillData.category !== undefined) updateData.category = skillData.category;
      if (skillData.description !== undefined) updateData.description = skillData.description;
      if (skillData.displayOrder !== undefined) updateData.displayOrder = skillData.displayOrder;
      if (skillData.assessmentApplicable !== undefined) updateData.assessmentApplicable = skillData.assessmentApplicable;
      if (skillData.version !== undefined) updateData.version = skillData.version;
      if (skillData.relatedSubjects !== undefined) updateData.relatedSubjects = skillData.relatedSubjects;
      if (skillData.nameAr !== undefined) updateData.nameAr = skillData.nameAr;
      if (skillData.descriptionAr !== undefined) updateData.descriptionAr = skillData.descriptionAr;
      
      const [updated] = await db
        .update(wefSkills)
        .set(updateData)
        .where(eq(wefSkills.name, skillData.name))
        .returning();
      return updated;
    } else {
      // Create new skill
      return await this.createWefSkill(skillData);
    }
  }

  async getAllWefSkills(version?: string): Promise<WefSkill[]> {
    const query = db
      .select()
      .from(wefSkills)
      .orderBy(wefSkills.displayOrder);
    
    if (version) {
      return await query.where(eq(wefSkills.version, version));
    } else {
      return await query;
    }
  }

  async getWefSkillById(id: string): Promise<WefSkill | undefined> {
    const [skill] = await db
      .select()
      .from(wefSkills)
      .where(eq(wefSkills.id, id));
    return skill;
  }

  async getWefSkillByName(name: string): Promise<WefSkill | undefined> {
    const [skill] = await db
      .select()
      .from(wefSkills)
      .where(eq(wefSkills.name, name));
    return skill;
  }

  // Career WEF Skill Affinity operations
  async createCareerWefSkillAffinity(affinityData: InsertCareerWefSkillAffinity): Promise<CareerWefSkillAffinity> {
    const [affinity] = await db
      .insert(careerWefSkillAffinities)
      .values(affinityData)
      .returning();
    return affinity;
  }

  async createOrUpdateCareerWefSkillAffinity(
    careerId: string,
    wefSkillId: string,
    affinityData: Omit<InsertCareerWefSkillAffinity, 'careerId' | 'wefSkillId'>
  ): Promise<CareerWefSkillAffinity> {
    // Build update data with updatedAt and only provided fields
    const updateData: any = {
      affinityScore: affinityData.affinityScore,
      updatedAt: new Date(), // Always update timestamp
    };
    
    // Only set optional fields if explicitly provided (not undefined)
    if (affinityData.evidence !== undefined) {
      updateData.evidence = affinityData.evidence;
    }
    if (affinityData.source !== undefined) {
      updateData.source = affinityData.source;
    }
    
    // Try to insert, on conflict update
    const [affinity] = await db
      .insert(careerWefSkillAffinities)
      .values({
        careerId,
        wefSkillId,
        ...affinityData,
      })
      .onConflictDoUpdate({
        target: [careerWefSkillAffinities.careerId, careerWefSkillAffinities.wefSkillId],
        set: updateData,
      })
      .returning();
    return affinity;
  }

  async getCareerWefSkillAffinity(careerId: string, wefSkillId: string): Promise<CareerWefSkillAffinity | undefined> {
    const [affinity] = await db
      .select()
      .from(careerWefSkillAffinities)
      .where(and(
        eq(careerWefSkillAffinities.careerId, careerId),
        eq(careerWefSkillAffinities.wefSkillId, wefSkillId)
      ));
    return affinity;
  }

  async getCareerWefSkillAffinitiesByCareer(careerId: string): Promise<CareerWefSkillAffinity[]> {
    return await db
      .select()
      .from(careerWefSkillAffinities)
      .where(eq(careerWefSkillAffinities.careerId, careerId));
  }

  async getCareerWefSkillAffinitiesBulk(careerIds: string[]): Promise<CareerWefSkillAffinity[]> {
    if (careerIds.length === 0) return [];
    return await db
      .select()
      .from(careerWefSkillAffinities)
      .where(inArray(careerWefSkillAffinities.careerId, careerIds));
  }

  async getCareerWefSkillAffinityCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(careerWefSkillAffinities);
    return result[0]?.count || 0;
  }

  async getWefSkillsForCareers(careerIds: string[]): Promise<Array<{ careerId: string; name: string; nameAr: string | null; description: string; descriptionAr: string | null; affinityScore: number }>> {
    if (careerIds.length === 0) return [];
    return await db
      .select({
        careerId: careerWefSkillAffinities.careerId,
        name: wefSkills.name,
        nameAr: wefSkills.nameAr,
        description: wefSkills.description,
        descriptionAr: wefSkills.descriptionAr,
        affinityScore: careerWefSkillAffinities.affinityScore,
      })
      .from(careerWefSkillAffinities)
      .innerJoin(wefSkills, eq(careerWefSkillAffinities.wefSkillId, wefSkills.id))
      .where(inArray(careerWefSkillAffinities.careerId, careerIds))
      .orderBy(careerWefSkillAffinities.affinityScore);
  }

  // WEF Competency Results operations
  async createWefCompetencyResult(resultData: InsertWefCompetencyResult): Promise<WefCompetencyResult> {
    const [result] = await db
      .insert(wefCompetencyResults)
      .values(resultData)
      .returning();
    return result;
  }

  async upsertWefCompetencyResult(
    assessmentId: string,
    userId: string | null,
    skillScores: Record<string, number>,
    sourceAttribution: string,
    isGuest: boolean = false,
    guestSessionId?: string | null
  ): Promise<WefCompetencyResult> {
    // Fetch existing to preserve prior rawResponses data
    const existing = await this.getWefCompetencyResultByAssessmentId(assessmentId);
    
    // Merge new metadata with existing rawResponses
    const existingRaw = (existing?.rawResponses as Record<string, any>) || {};
    const existingMeta = (existingRaw._meta as Record<string, any>) || {};
    
    const rawResponses = {
      ...existingRaw,
      _meta: {
        ...existingMeta,
        sourceAttribution,
        calculatedAt: new Date().toISOString(),
      },
    };

    // Extract top 5 competencies
    const sortedSkills = Object.entries(skillScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([skill]) => skill);

    const values = {
      assessmentId,
      userId,
      isGuest,
      guestSessionId,
      rawResponses,
      normalizedScores: skillScores,
      topCompetencies: sortedSkills,
      submittedAt: new Date(),
    };

    const [result] = await db
      .insert(wefCompetencyResults)
      .values(values as any)
      .onConflictDoUpdate({
        target: wefCompetencyResults.assessmentId,
        set: {
          userId,
          isGuest,
          guestSessionId,
          rawResponses,
          normalizedScores: skillScores,
          topCompetencies: sortedSkills,
          submittedAt: new Date(),
        },
      })
      .returning();

    return result;
  }

  async getWefCompetencyResultByAssessmentId(assessmentId: string): Promise<WefCompetencyResult | undefined> {
    const [result] = await db
      .select()
      .from(wefCompetencyResults)
      .where(eq(wefCompetencyResults.assessmentId, assessmentId));
    return result;
  }

  async getWefCompetencyResultByUserId(userId: string): Promise<WefCompetencyResult | undefined> {
    const [result] = await db
      .select()
      .from(wefCompetencyResults)
      .where(eq(wefCompetencyResults.userId, userId))
      .orderBy(desc(wefCompetencyResults.submittedAt))
      .limit(1);
    return result;
  }

  // Country Priority Sectors operations
  async getCountryPrioritySectorsByCountry(countryId: string): Promise<CountryPrioritySector[]> {
    return await db
      .select()
      .from(countryPrioritySectors)
      .where(eq(countryPrioritySectors.countryId, countryId))
      .orderBy(countryPrioritySectors.displayOrder);
  }

  async createOrUpdateCountryPrioritySector(
    countryId: string,
    name: string,
    displayOrder: number,
    description?: string
  ): Promise<CountryPrioritySector> {
    const [sector] = await db
      .insert(countryPrioritySectors)
      .values({
        countryId,
        name,
        displayOrder,
        description,
      })
      .onConflictDoUpdate({
        target: [countryPrioritySectors.countryId, countryPrioritySectors.name],
        set: {
          displayOrder,
          description,
        },
      })
      .returning();
    return sector;
  }

  async createOrUpdateCountrySectorWefSkill(
    sectorId: string,
    wefSkillId: string,
    importance: number
  ): Promise<CountrySectorWefSkill> {
    const [mapping] = await db
      .insert(countrySectorWefSkills)
      .values({
        sectorId,
        wefSkillId,
        importance,
      })
      .onConflictDoUpdate({
        target: [countrySectorWefSkills.sectorId, countrySectorWefSkills.wefSkillId],
        set: {
          importance,
        },
      })
      .returning();
    return mapping;
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

  /**
   * Atomic transaction for group purchase: Promotes user to org_admin and creates organization
   * Uses SELECT ... FOR UPDATE to prevent concurrent purchases by same user
   * Rolls back both operations if either fails
   */
  async createGroupPurchaseTransaction(params: {
    userId: string;
    organizationName: string;
    studentCount: number;
    paymentIntentId: string;
    amountPaid: number;
  }): Promise<{ user: User; organization: Organization }> {
    const { userId, organizationName, studentCount, paymentIntentId, amountPaid } = params;

    return await db.transaction(async (tx) => {
      // Lock user row to prevent concurrent group purchases
      const [existingUser] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!existingUser) {
        throw new Error(`User ${userId} not found`);
      }

      // Check if user already has an organization
      const [existingOrg] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.adminUserId, userId));

      if (existingOrg) {
        throw new Error(`User already has an organization: ${existingOrg.name}. Cannot create multiple organizations.`);
      }

      // Promote user to org_admin and allocate licenses
      const [updatedUser] = await tx
        .update(users)
        .set({
          accountType: 'org_admin',
          role: 'admin',
          isPremium: true,
          purchasedLicenses: sql`COALESCE(${users.purchasedLicenses}, 0) + ${studentCount}`,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId))
        .returning();

      // Create organization
      const [organization] = await tx
        .insert(organizations)
        .values({
          name: organizationName,
          adminUserId: userId,
          totalLicenses: studentCount,
          usedLicenses: 0,
          stripePaymentId: paymentIntentId,
          amountPaid
        })
        .returning();

      // Enroll admin as organization member
      await tx
        .insert(organizationMembers)
        .values({
          userId: userId,
          organizationId: organization.id,
          role: 'admin', // Organization member role (not user role)
          hasCompletedAssessment: false,
          isLocked: false
        });

      return { user: updatedUser, organization };
    });
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(desc(organizations.createdAt));
  }

  async getOrganizationsWithLogos(): Promise<Array<{ id: string; name: string; logoUrl: string | null }>> {
    // Return all organizations for the public landing page marquee
    // Organizations without logos will show a placeholder icon with their name
    return db
      .select({
        id: organizations.id,
        name: organizations.name,
        logoUrl: organizations.logoUrl,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt));
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

    // Check if organization has unlimited licenses
    const org = await this.getOrganizationById(id);
    if (!org) {
      throw new Error(`Organization ${id} not found`);
    }

    // If unlimited licenses, just update the usedLicenses counter without checks
    if (org.isUnlimitedLicenses) {
      const [organization] = await db
        .update(organizations)
        .set({
          usedLicenses: sql`${organizations.usedLicenses} + ${increment}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizations.id, id),
            sql`${organizations.usedLicenses} + ${increment} >= 0` // Only check we don't go below 0
          )
        )
        .returning();

      if (!organization) {
        const wouldBe = org.usedLicenses + increment;
        if (wouldBe < 0) {
          throw new Error(`Cannot decrement quota below 0 (current: ${org.usedLicenses}, increment: ${increment})`);
        }
        throw new Error('Quota update failed for unknown reason');
      }
      return organization;
    }

    // Regular quota enforcement for limited licenses
    const [organization] = await db
      .update(organizations)
      .set({
        usedLicenses: sql`${organizations.usedLicenses} + ${increment}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizations.id, id),
          sql`${organizations.usedLicenses} + ${increment} >= 0`,
          sql`${organizations.usedLicenses} + ${increment} <= ${organizations.totalLicenses}`
        )
      )
      .returning();

    if (!organization) {
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

  /**
   * Consume a license for an organization with reward credits priority.
   * First tries to use available reward credits, falls back to paid licenses.
   * Returns which type of license was consumed.
   */
  async consumeLicenseWithRewardPriority(organizationId: string): Promise<{ type: 'reward' | 'paid'; organization: Organization }> {
    const org = await this.getOrganizationById(organizationId);
    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    // Calculate available reward credits
    const availableRewardCredits = (org.rewardCredits || 0) - (org.rewardCreditsUsed || 0);

    // Try to use reward credit first
    if (availableRewardCredits > 0) {
      const [organization] = await db
        .update(organizations)
        .set({
          rewardCreditsUsed: sql`COALESCE(${organizations.rewardCreditsUsed}, 0) + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizations.id, organizationId),
            sql`COALESCE(${organizations.rewardCredits}, 0) - COALESCE(${organizations.rewardCreditsUsed}, 0) >= 1`
          )
        )
        .returning();

      if (organization) {
        return { type: 'reward', organization };
      }
    }

    // Fall back to paid license
    const organization = await this.updateOrganizationQuota(organizationId, 1);
    return { type: 'paid', organization };
  }

  /**
   * Check if organization has available capacity (reward credits + paid licenses)
   */
  async getOrganizationAvailableCapacity(organizationId: string): Promise<{
    availableRewardCredits: number;
    availablePaidLicenses: number;
    totalAvailable: number;
    isUnlimited: boolean;
  }> {
    const org = await this.getOrganizationById(organizationId);
    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const availableRewardCredits = Math.max(0, (org.rewardCredits || 0) - (org.rewardCreditsUsed || 0));
    const availablePaidLicenses = org.isUnlimitedLicenses ? Infinity : Math.max(0, org.totalLicenses - org.usedLicenses);

    return {
      availableRewardCredits,
      availablePaidLicenses: org.isUnlimitedLicenses ? Infinity : availablePaidLicenses,
      totalAvailable: org.isUnlimitedLicenses ? Infinity : availableRewardCredits + availablePaidLicenses,
      isUnlimited: org.isUnlimitedLicenses || false,
    };
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

  async getOrganizationMembersByOrganizationId(organizationId: string): Promise<any[]> {
    const members = await db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
        studentId: organizationMembers.studentId,
        studentGender: organizationMembers.studentGender,
        grade: organizationMembers.grade,
        role: organizationMembers.role,
        hasCompletedAssessment: organizationMembers.hasCompletedAssessment,
        assessmentCompletedAt: organizationMembers.assessmentCompletedAt,
        isLocked: organizationMembers.isLocked,
        createdAt: organizationMembers.createdAt,
        updatedAt: organizationMembers.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          lastLoginAt: users.lastLoginAt,
        },
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, organizationId))
      .orderBy(desc(organizationMembers.createdAt));
    
    // Get assessment status for each member (to detect "in progress" assessments)
    const memberUserIds = members.map(m => m.userId);
    const memberAssessments = memberUserIds.length > 0 
      ? await db
          .select({
            userId: assessments.userId,
            isCompleted: assessments.isCompleted,
          })
          .from(assessments)
          .where(inArray(assessments.userId, memberUserIds))
      : [];
    
    // Create a map of userId -> hasStartedAssessment (has any assessment, completed or not)
    const assessmentStatusMap = new Map<string, { hasStarted: boolean; hasInProgress: boolean }>();
    for (const assessment of memberAssessments) {
      if (assessment.userId) {
        const existing = assessmentStatusMap.get(assessment.userId) || { hasStarted: false, hasInProgress: false };
        existing.hasStarted = true;
        if (!assessment.isCompleted) {
          existing.hasInProgress = true;
        }
        assessmentStatusMap.set(assessment.userId, existing);
      }
    }
    
    // Enrich members with assessment status
    return members.map(member => ({
      ...member,
      hasStartedAssessment: assessmentStatusMap.get(member.userId)?.hasStarted || false,
      hasInProgressAssessment: assessmentStatusMap.get(member.userId)?.hasInProgress || false,
    }));
  }

  async getOrganizationStats(organizationId: string): Promise<{
    totalMembers: number;
    completedAssessments: number;
    pendingAssessments: number;
  }> {
    // Get all members in this organization with their completion status
    const members = await db
      .select({
        hasCompletedAssessment: organizationMembers.hasCompletedAssessment,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));

    const totalMembers = members.length;
    const completedAssessments = members.filter(m => m.hasCompletedAssessment).length;

    return {
      totalMembers,
      completedAssessments,
      pendingAssessments: totalMembers - completedAssessments,
    };
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

  async bulkDeleteOrganizationMembers(memberIds: string[]): Promise<number> {
    if (memberIds.length === 0) return 0;
    
    const result = await db
      .delete(organizationMembers)
      .where(inArray(organizationMembers.id, memberIds));
    return result.rowCount ?? 0;
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
    studentName?: string;
    studentAge?: number;
    studentGender?: string;
    passwordComplexity?: 'medium' | 'strong';
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
            studentName: userData.studentName,
            studentAge: userData.studentAge,
            studentGender: userData.studentGender,
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

  // File management operations
  async createFile(fileData: InsertFile): Promise<File> {
    const [file] = await db.insert(files).values(fileData).returning();
    return file;
  }

  async getFileById(id: string): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }

  async getFilesByOrganization(organizationId: string): Promise<File[]> {
    return await db
      .select()
      .from(files)
      .where(eq(files.organizationId, organizationId))
      .orderBy(desc(files.createdAt));
  }

  async getFilesByUploader(userId: string): Promise<File[]> {
    return await db
      .select()
      .from(files)
      .where(eq(files.uploadedBy, userId))
      .orderBy(desc(files.createdAt));
  }

  async getAllFiles(): Promise<File[]> {
    return await db
      .select()
      .from(files)
      .orderBy(desc(files.createdAt));
  }

  async getFileByShareToken(shareToken: string): Promise<File | undefined> {
    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.shareToken, shareToken));
    
    // Check if share token is expired
    if (file && file.shareTokenExpiry && new Date() > file.shareTokenExpiry) {
      return undefined;
    }
    
    return file;
  }

  async updateFile(id: string, data: Partial<InsertFile>): Promise<File> {
    const [file] = await db
      .update(files)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(files.id, id))
      .returning();
    return file;
  }

  async updateFileProcessingStatus(
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string,
    processedRecords?: number,
    failedRecords?: number
  ): Promise<File> {
    const updateData: any = {
      processingStatus: status,
      updatedAt: new Date(),
    };
    
    if (error !== undefined) updateData.processingError = error;
    if (processedRecords !== undefined) updateData.processedRecords = processedRecords;
    if (failedRecords !== undefined) updateData.failedRecords = failedRecords;

    const [file] = await db
      .update(files)
      .set(updateData)
      .where(eq(files.id, id))
      .returning();
    return file;
  }

  async deleteFile(id: string): Promise<boolean> {
    const result = await db.delete(files).where(eq(files.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async generateShareToken(fileId: string, expiryHours: number = 72): Promise<{ shareToken: string; expiry: Date }> {
    const crypto = await import('crypto');
    const shareToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + expiryHours);

    await db
      .update(files)
      .set({
        shareToken,
        shareTokenExpiry: expiry,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId));

    return { shareToken, expiry };
  }

  async invalidateShareToken(fileId: string): Promise<void> {
    await db
      .update(files)
      .set({
        shareToken: null,
        shareTokenExpiry: null,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId));
  }

  async incrementDownloadCount(id: string): Promise<File> {
    const [file] = await db
      .update(files)
      .set({
        downloadCount: sql`${files.downloadCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(files.id, id))
      .returning();
    return file;
  }

  // Organization events (audit logging)
  async createOrganizationEvent(event: InsertOrganizationEvent): Promise<OrganizationEvent> {
    const [created] = await db.insert(organizationEvents).values(event).returning();
    return created;
  }

  async getOrganizationEvents(organizationId: string, limit: number = 50): Promise<OrganizationEvent[]> {
    return db
      .select()
      .from(organizationEvents)
      .where(eq(organizationEvents.organizationId, organizationId))
      .orderBy(desc(organizationEvents.createdAt))
      .limit(limit);
  }

  async getAllOrganizationEvents(limit: number = 100): Promise<OrganizationEvent[]> {
    return db
      .select()
      .from(organizationEvents)
      .orderBy(desc(organizationEvents.createdAt))
      .limit(limit);
  }

  async getOrganizationEventsByType(organizationId: string, eventType: string): Promise<OrganizationEvent[]> {
    return db
      .select()
      .from(organizationEvents)
      .where(and(
        eq(organizationEvents.organizationId, organizationId),
        eq(organizationEvents.eventType, eventType)
      ))
      .orderBy(desc(organizationEvents.createdAt));
  }

  // Scoring Configuration operations
  async getAllScoringTiers(): Promise<ScoringTier[]> {
    return db.select().from(scoringTiers).orderBy(scoringTiers.displayOrder);
  }

  async getScoringTierByKey(key: string): Promise<ScoringTier | undefined> {
    const [tier] = await db.select().from(scoringTiers).where(eq(scoringTiers.key, key));
    return tier;
  }

  async createScoringTier(tier: InsertScoringTier): Promise<ScoringTier> {
    const [created] = await db.insert(scoringTiers).values(tier).returning();
    return created;
  }

  async updateScoringTier(id: string, tier: Partial<InsertScoringTier>): Promise<ScoringTier> {
    const [updated] = await db
      .update(scoringTiers)
      .set({ ...tier, updatedAt: new Date() })
      .where(eq(scoringTiers.id, id))
      .returning();
    return updated;
  }

  // Tier Component Weights operations
  async getTierComponentWeights(tierId: string): Promise<TierComponentWeight[]> {
    return db.select().from(tierComponentWeights).where(eq(tierComponentWeights.tierId, tierId));
  }

  async getAllTierComponentWeights(): Promise<TierComponentWeight[]> {
    return db.select().from(tierComponentWeights);
  }

  async upsertTierComponentWeight(data: InsertTierComponentWeight): Promise<TierComponentWeight> {
    const [result] = await db
      .insert(tierComponentWeights)
      .values(data)
      .onConflictDoUpdate({
        target: [tierComponentWeights.tierId, tierComponentWeights.componentId],
        set: { weight: data.weight, isEnabled: data.isEnabled, updatedAt: new Date() },
      })
      .returning();
    return result;
  }

  async updateTierComponentWeight(id: string, data: Partial<InsertTierComponentWeight>): Promise<TierComponentWeight> {
    const [updated] = await db
      .update(tierComponentWeights)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tierComponentWeights.id, id))
      .returning();
    return updated;
  }

  // Component Parameters operations
  async getComponentParameters(componentId: string): Promise<ComponentParameter[]> {
    return db.select().from(componentParameters).where(eq(componentParameters.componentId, componentId));
  }

  async getAllComponentParameters(): Promise<ComponentParameter[]> {
    return db.select().from(componentParameters);
  }

  async upsertComponentParameter(data: InsertComponentParameter): Promise<ComponentParameter> {
    const [result] = await db
      .insert(componentParameters)
      .values(data)
      .onConflictDoUpdate({
        target: [componentParameters.componentId, componentParameters.parameterKey],
        set: { parameterValue: data.parameterValue, parameterType: data.parameterType, description: data.description, updatedAt: new Date() },
      })
      .returning();
    return result;
  }

  async updateComponentParameter(id: string, data: Partial<InsertComponentParameter>): Promise<ComponentParameter> {
    const [updated] = await db
      .update(componentParameters)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(componentParameters.id, id))
      .returning();
    return updated;
  }

  async deleteComponentParameter(id: string): Promise<boolean> {
    const result = await db.delete(componentParameters).where(eq(componentParameters.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // LLM Prompt Templates operations
  async getAllLlmPromptTemplates(): Promise<LlmPromptTemplate[]> {
    return db.select().from(llmPromptTemplates).orderBy(llmPromptTemplates.key);
  }

  async getLlmPromptTemplateByKey(key: string): Promise<LlmPromptTemplate | undefined> {
    const [template] = await db.select().from(llmPromptTemplates).where(eq(llmPromptTemplates.key, key));
    return template;
  }

  async createLlmPromptTemplate(template: InsertLlmPromptTemplate): Promise<LlmPromptTemplate> {
    const [created] = await db.insert(llmPromptTemplates).values(template).returning();
    return created;
  }

  async updateLlmPromptTemplate(id: string, template: Partial<InsertLlmPromptTemplate>): Promise<LlmPromptTemplate> {
    const [updated] = await db
      .update(llmPromptTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(llmPromptTemplates.id, id))
      .returning();
    return updated;
  }

  // API Credentials operations
  async getApiCredential(provider: string): Promise<ApiCredential | undefined> {
    const [credential] = await db.select().from(apiCredentials).where(eq(apiCredentials.provider, provider));
    if (!credential) return undefined;
    
    // Decrypt API key if it's in encrypted format
    if (credential.apiKey && isEncryptedFormat(credential.apiKey)) {
      try {
        const decryptedKey = deserializeAndDecrypt(credential.apiKey);
        return { ...credential, apiKey: decryptedKey };
      } catch (error) {
        console.error(`Failed to decrypt API key for provider ${provider}:`, error);
        return undefined;
      }
    }
    
    // Return as-is for legacy plaintext keys (will be migrated)
    return credential;
  }

  async getAllApiCredentials(): Promise<ApiCredential[]> {
    const credentials = await db.select().from(apiCredentials);
    
    // Decrypt all API keys
    return credentials.map(credential => {
      if (credential.apiKey && isEncryptedFormat(credential.apiKey)) {
        try {
          const decryptedKey = deserializeAndDecrypt(credential.apiKey);
          return { ...credential, apiKey: decryptedKey };
        } catch (error) {
          console.error(`Failed to decrypt API key for provider ${credential.provider}:`, error);
          return { ...credential, apiKey: '' }; // Return empty for failed decryption
        }
      }
      return credential;
    });
  }

  async upsertApiCredential(data: InsertApiCredential): Promise<ApiCredential> {
    // Encrypt the API key before storing
    const encryptedApiKey = encryptAndSerialize(data.apiKey);
    
    const [result] = await db
      .insert(apiCredentials)
      .values({ ...data, apiKey: encryptedApiKey })
      .onConflictDoUpdate({
        target: [apiCredentials.provider],
        set: { apiKey: encryptedApiKey, isActive: data.isActive, updatedAt: new Date() },
      })
      .returning();
    
    // Return with decrypted key for immediate use
    return { ...result, apiKey: data.apiKey };
  }

  async updateApiCredentialTestResult(provider: string, result: string): Promise<ApiCredential> {
    const [updated] = await db
      .update(apiCredentials)
      .set({ lastTestedAt: new Date(), lastTestResult: result, updatedAt: new Date() })
      .where(eq(apiCredentials.provider, provider))
      .returning();
    return updated;
  }

  async deleteApiCredential(provider: string): Promise<boolean> {
    const result = await db.delete(apiCredentials).where(eq(apiCredentials.provider, provider));
    return (result.rowCount ?? 0) > 0;
  }

  // Scoring Config Change Log operations
  async createScoringConfigChangeLog(log: InsertScoringConfigChangeLog): Promise<ScoringConfigChangeLog> {
    const [created] = await db.insert(scoringConfigChangeLog).values(log).returning();
    return created;
  }

  async getScoringConfigChangeLogs(limit: number = 100): Promise<ScoringConfigChangeLog[]> {
    return db
      .select()
      .from(scoringConfigChangeLog)
      .orderBy(desc(scoringConfigChangeLog.createdAt))
      .limit(limit);
  }

  // ============================================
  // Contribution Submission operations
  // ============================================

  async createContributionSubmission(submission: InsertContributionSubmission): Promise<ContributionSubmission> {
    const [created] = await db.insert(contributionSubmissions).values(submission).returning();
    return created;
  }

  async getContributionSubmission(id: string): Promise<ContributionSubmission | undefined> {
    const [submission] = await db.select().from(contributionSubmissions).where(eq(contributionSubmissions.id, id));
    return submission;
  }

  async getContributionSubmissionsByOrg(organizationId: string): Promise<ContributionSubmission[]> {
    return db
      .select()
      .from(contributionSubmissions)
      .where(eq(contributionSubmissions.organizationId, organizationId))
      .orderBy(desc(contributionSubmissions.createdAt));
  }

  async getAllPendingContributionSubmissions(): Promise<ContributionSubmission[]> {
    // Include submissions that need superadmin attention:
    // - llm_verified: ready for review
    // - approved: reviewed and waiting to be claimed (reward given on claim)
    // Note: rejected submissions are removed immediately (no claim needed)
    return db
      .select()
      .from(contributionSubmissions)
      .where(
        or(
          eq(contributionSubmissions.status, "pending"),
          eq(contributionSubmissions.status, "in_review"),
          eq(contributionSubmissions.status, "llm_verified"),
          eq(contributionSubmissions.status, "approved")
        )
      )
      .orderBy(contributionSubmissions.createdAt);
  }

  async updateContributionSubmission(id: string, data: Partial<ContributionSubmission>): Promise<ContributionSubmission> {
    const [updated] = await db
      .update(contributionSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contributionSubmissions.id, id))
      .returning();
    return updated;
  }

  async getOrganizationDailySubmissionCount(organizationId: string): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contributionSubmissions)
      .where(
        and(
          eq(contributionSubmissions.organizationId, organizationId),
          gte(contributionSubmissions.createdAt, oneDayAgo)
        )
      );
    return result[0]?.count || 0;
  }

  // ============================================
  // Contribution Reward operations
  // ============================================

  async createContributionReward(reward: InsertContributionReward): Promise<ContributionReward> {
    const [created] = await db.insert(contributionRewards).values(reward).returning();
    return created;
  }

  async getContributionRewardsByOrg(organizationId: string): Promise<ContributionReward[]> {
    return db
      .select()
      .from(contributionRewards)
      .where(eq(contributionRewards.organizationId, organizationId))
      .orderBy(desc(contributionRewards.createdAt));
  }

  async getContributionStats(): Promise<{
    totalSubmissions: number;
    pendingSubmissions: number;
    approvedSubmissions: number;
    totalQuestionsApproved: number;
    totalCreditsAwarded: number;
    topContributors: Array<{ organizationId: string; organizationName: string; questionsApproved: number; creditsEarned: number }>;
  }> {
    const allSubmissions = await db.select().from(contributionSubmissions);
    const allRewards = await db.select().from(contributionRewards);
    const allOrgs = await db.select().from(organizations);
    
    const orgMap = new Map(allOrgs.map(org => [org.id, org.name]));
    
    const totalSubmissions = allSubmissions.length;
    const pendingSubmissions = allSubmissions.filter(s => s.status === "pending" || s.status === "in_review").length;
    const approvedSubmissions = allSubmissions.filter(s => s.status === "approved").length;
    const totalQuestionsApproved = allSubmissions.reduce((sum, s) => sum + (s.approvedCount || 0), 0);
    const totalCreditsAwarded = allRewards.reduce((sum, r) => sum + r.creditsAwarded, 0);
    
    // Calculate top contributors
    const orgStats = new Map<string, { questionsApproved: number; creditsEarned: number }>();
    for (const submission of allSubmissions) {
      const current = orgStats.get(submission.organizationId) || { questionsApproved: 0, creditsEarned: 0 };
      current.questionsApproved += submission.approvedCount || 0;
      current.creditsEarned += submission.creditsAwarded || 0;
      orgStats.set(submission.organizationId, current);
    }
    
    const topContributors = Array.from(orgStats.entries())
      .map(([orgId, stats]) => ({
        organizationId: orgId,
        organizationName: orgMap.get(orgId) || "Unknown",
        questionsApproved: stats.questionsApproved,
        creditsEarned: stats.creditsEarned,
      }))
      .sort((a, b) => b.questionsApproved - a.questionsApproved)
      .slice(0, 10);

    return {
      totalSubmissions,
      pendingSubmissions,
      approvedSubmissions,
      totalQuestionsApproved,
      totalCreditsAwarded,
      topContributors,
    };
  }

  async getOrganizationsWithPendingRewards(): Promise<Organization[]> {
    // Get all organizations that have pending reward credits > 0
    return db
      .select()
      .from(organizations)
      .where(sql`${organizations.pendingRewardCredits} > 0`);
  }

  // ============================================
  // Quiz questions by country/grade (for duplicate detection)
  // ============================================

  async getQuizQuestionsByCountryAndGrade(countryId: string, grade: number, subject: string): Promise<QuizQuestion[]> {
    return db
      .select()
      .from(quizQuestions)
      .where(
        and(
          eq(quizQuestions.countryId, countryId),
          eq(quizQuestions.grade, grade),
          eq(quizQuestions.subject, subject)
        )
      );
  }

  // ============================================
  // System Configuration operations
  // ============================================

  async getSystemConfig(key: string): Promise<SystemConfig | undefined> {
    const [config] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, key));
    return config;
  }

  async getAllSystemConfigs(category?: string): Promise<SystemConfig[]> {
    if (category) {
      return db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.category, category))
        .orderBy(systemConfig.key);
    }
    return db
      .select()
      .from(systemConfig)
      .orderBy(systemConfig.category, systemConfig.key);
  }

  async upsertSystemConfig(key: string, value: string, updatedByUserId?: string): Promise<SystemConfig> {
    const existing = await this.getSystemConfig(key);
    
    if (existing) {
      const [updated] = await db
        .update(systemConfig)
        .set({
          value,
          updatedByUserId,
          updatedAt: new Date(),
        })
        .where(eq(systemConfig.key, key))
        .returning();
      return updated;
    }
    
    const [created] = await db
      .insert(systemConfig)
      .values({
        key,
        value,
        updatedByUserId,
      })
      .returning();
    return created;
  }

  async deleteSystemConfig(key: string): Promise<boolean> {
    const result = await db
      .delete(systemConfig)
      .where(eq(systemConfig.key, key));
    return (result.rowCount ?? 0) > 0;
  }

  // ============================================
  // Career CRUD operations
  // ============================================

  async updateCareer(id: string, data: Partial<InsertCareer>): Promise<Career> {
    const [updated] = await db
      .update(careers)
      .set(data)
      .where(eq(careers.id, id))
      .returning();
    return updated;
  }

  async deleteCareer(id: string): Promise<boolean> {
    // Delete recommendations that reference this career first (FK cascade)
    await db.delete(recommendations).where(eq(recommendations.careerId, id));
    const result = await db
      .delete(careers)
      .where(eq(careers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============================================
  // Organization deletion
  // ============================================

  async deleteOrganization(id: string): Promise<boolean> {
    const result = await db
      .delete(organizations)
      .where(eq(organizations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteOrganizationEventsByOrgId(organizationId: string): Promise<number> {
    const result = await db
      .delete(organizationEvents)
      .where(eq(organizationEvents.organizationId, organizationId));
    return result.rowCount ?? 0;
  }

  async deleteFilesByOrganizationId(organizationId: string): Promise<number> {
    const result = await db
      .delete(files)
      .where(eq(files.organizationId, organizationId));
    return result.rowCount ?? 0;
  }

  // ============================================
  // System Announcements operations
  // ============================================

  async createSystemAnnouncement(announcement: InsertSystemAnnouncement): Promise<SystemAnnouncement> {
    const [created] = await db
      .insert(systemAnnouncements)
      .values(announcement)
      .returning();
    return created;
  }

  async getSystemAnnouncement(id: string): Promise<SystemAnnouncement | undefined> {
    const [announcement] = await db
      .select()
      .from(systemAnnouncements)
      .where(eq(systemAnnouncements.id, id));
    return announcement;
  }

  async getAllSystemAnnouncements(): Promise<SystemAnnouncement[]> {
    return db
      .select()
      .from(systemAnnouncements)
      .orderBy(desc(systemAnnouncements.isPinned), desc(systemAnnouncements.createdAt));
  }

  async getActiveSystemAnnouncements(targetAudience?: string): Promise<SystemAnnouncement[]> {
    const now = new Date();
    const conditions = [
      eq(systemAnnouncements.isActive, true),
      // Only show if not expired (or no expiry set)
      or(
        sql`${systemAnnouncements.expiresAt} IS NULL`,
        gte(systemAnnouncements.expiresAt, now)
      ),
      // Only show if publish date has passed (or no publish date set)
      or(
        sql`${systemAnnouncements.publishAt} IS NULL`,
        sql`${systemAnnouncements.publishAt} <= ${now}`
      )
    ];
    
    if (targetAudience && targetAudience !== 'all') {
      conditions.push(
        or(
          eq(systemAnnouncements.targetAudience, 'all'),
          eq(systemAnnouncements.targetAudience, targetAudience)
        )
      );
    }
    
    return db
      .select()
      .from(systemAnnouncements)
      .where(and(...conditions))
      .orderBy(desc(systemAnnouncements.isPinned), desc(systemAnnouncements.createdAt));
  }

  async updateSystemAnnouncement(id: string, data: Partial<InsertSystemAnnouncement>): Promise<SystemAnnouncement> {
    const [updated] = await db
      .update(systemAnnouncements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(systemAnnouncements.id, id))
      .returning();
    return updated;
  }

  async deleteSystemAnnouncement(id: string): Promise<boolean> {
    const result = await db
      .delete(systemAnnouncements)
      .where(eq(systemAnnouncements.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============================================
  // Global user search (for superadmin)
  // ============================================

  async searchAllUsers(query: string, limit: number = 50): Promise<User[]> {
    const searchPattern = `%${query.toLowerCase()}%`;
    return db
      .select()
      .from(users)
      .where(
        or(
          sql`LOWER(${users.username}) LIKE ${searchPattern}`,
          sql`LOWER(${users.email}) LIKE ${searchPattern}`,
          sql`LOWER(${users.firstName}) LIKE ${searchPattern}`,
          sql`LOWER(${users.lastName}) LIKE ${searchPattern}`
        )
      )
      .limit(limit);
  }

  async getAllStudentsWithAssessments(): Promise<Array<{
    user: User;
    organizationName: string | null;
    assessmentCount: number;
    latestAssessmentDate: Date | null;
  }>> {
    const results = await db
      .select({
        user: users,
        organizationName: organizations.name,
        assessmentCount: count(assessments.id),
        latestAssessmentDate: sql<Date | null>`MAX(${assessments.createdAt})`,
      })
      .from(users)
      .leftJoin(organizationMembers, eq(users.id, organizationMembers.userId))
      .leftJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .leftJoin(assessments, eq(users.id, assessments.userId))
      .where(
        or(
          eq(users.accountType, 'org_student'),
          eq(users.accountType, 'org_admin'),
          and(eq(users.accountType, 'individual'), eq(users.isPremium, true))
        )
      )
      .groupBy(users.id, organizations.name)
      .orderBy(desc(sql`MAX(${assessments.createdAt})`));
    
    return results.map(r => ({
      user: r.user,
      organizationName: r.organizationName,
      assessmentCount: Number(r.assessmentCount),
      latestAssessmentDate: r.latestAssessmentDate,
    }));
  }

  // ============================================
  // Multi-grade progress tracking
  // ============================================

  async getStudentAssessmentProgression(userId: string): Promise<Array<{
    assessment: Assessment;
    recommendations: Recommendation[];
    careerNames: string[];
  }>> {
    // Get all completed assessments for the user, ordered by grade
    const userAssessments = await db
      .select()
      .from(assessments)
      .where(and(
        eq(assessments.userId, userId),
        eq(assessments.isCompleted, true)
      ))
      .orderBy(assessments.grade, assessments.completedAt);

    const result: Array<{
      assessment: Assessment;
      recommendations: Recommendation[];
      careerNames: string[];
    }> = [];

    for (const assessment of userAssessments) {
      const recs = await db
        .select()
        .from(recommendations)
        .where(eq(recommendations.assessmentId, assessment.id))
        .orderBy(desc(recommendations.overallMatchScore))
        .limit(5);

      const careerIds = recs.map(r => r.careerId);
      let careerNames: string[] = [];
      
      if (careerIds.length > 0) {
        const careerData = await db
          .select({ id: careers.id, title: careers.title })
          .from(careers)
          .where(inArray(careers.id, careerIds));
        
        careerNames = recs.map(r => 
          careerData.find(c => c.id === r.careerId)?.title || 'Unknown'
        );
      }

      result.push({
        assessment,
        recommendations: recs,
        careerNames,
      });
    }

    return result;
  }

  async getStudentCareerEvolution(userId: string): Promise<Array<{
    grade: string;
    completedAt: Date | null;
    topCareers: Array<{ careerId: string; careerName: string; matchScore: number }>;
    riasecScores: any;
    interests: string[];
  }>> {
    const progression = await this.getStudentAssessmentProgression(userId);
    
    return progression.map(({ assessment, recommendations, careerNames }) => ({
      grade: assessment.grade || 'Unknown',
      completedAt: assessment.completedAt,
      topCareers: recommendations.slice(0, 3).map((rec, i) => ({
        careerId: rec.careerId,
        careerName: careerNames[i] || 'Unknown',
        matchScore: rec.overallMatchScore,
      })),
      riasecScores: assessment.riasecScores,
      interests: assessment.interests || [],
    }));
  }

  async getOrganizationGradeProgress(organizationId: string): Promise<{
    gradeStats: Array<{
      grade: string;
      totalStudents: number;
      completedAssessments: number;
      avgMatchScore: number;
    }>;
    studentProgress: Array<{
      userId: string;
      studentName: string;
      assessmentsByGrade: Array<{ grade: string; completedAt: Date | null; topCareer: string | null }>;
    }>;
  }> {
    // Get all members of the organization
    const members = await db
      .select({
        userId: organizationMembers.userId,
        studentName: organizationMembers.studentName,
        grade: organizationMembers.grade,
      })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.role, 'student')
      ));

    // Get completed assessments for all members
    const memberIds = members.map(m => m.userId);
    
    if (memberIds.length === 0) {
      return { gradeStats: [], studentProgress: [] };
    }

    const memberAssessments = await db
      .select()
      .from(assessments)
      .where(and(
        inArray(assessments.userId, memberIds),
        eq(assessments.isCompleted, true)
      ))
      .orderBy(assessments.grade, assessments.completedAt);

    // Calculate grade stats
    const gradeMap = new Map<string, { students: Set<string>; assessments: number; totalScore: number }>();
    
    for (const assessment of memberAssessments) {
      const grade = assessment.grade || 'Unknown';
      if (!gradeMap.has(grade)) {
        gradeMap.set(grade, { students: new Set(), assessments: 0, totalScore: 0 });
      }
      const stats = gradeMap.get(grade)!;
      if (assessment.userId) {
        stats.students.add(assessment.userId);
      }
      stats.assessments++;
    }

    // Get recommendations for avg match scores
    const assessmentIds = memberAssessments.map(a => a.id);
    let recsMap = new Map<string, number>();
    
    if (assessmentIds.length > 0) {
      const allRecs = await db
        .select({
          assessmentId: recommendations.assessmentId,
          avgScore: sql<number>`AVG(${recommendations.overallMatchScore})`,
        })
        .from(recommendations)
        .where(inArray(recommendations.assessmentId, assessmentIds))
        .groupBy(recommendations.assessmentId);
      
      for (const rec of allRecs) {
        recsMap.set(rec.assessmentId, Number(rec.avgScore));
      }
    }

    // Recalculate with actual avg scores
    for (const assessment of memberAssessments) {
      const grade = assessment.grade || 'Unknown';
      const stats = gradeMap.get(grade)!;
      const avgScore = recsMap.get(assessment.id) || 0;
      stats.totalScore += avgScore;
    }

    const gradeStats = Array.from(gradeMap.entries()).map(([grade, stats]) => ({
      grade,
      totalStudents: stats.students.size,
      completedAssessments: stats.assessments,
      avgMatchScore: stats.assessments > 0 ? stats.totalScore / stats.assessments : 0,
    })).sort((a, b) => a.grade.localeCompare(b.grade));

    // Build student progress with top career per grade
    const studentProgressMap = new Map<string, {
      userId: string;
      studentName: string;
      assessmentsByGrade: Array<{ grade: string; completedAt: Date | null; topCareer: string | null }>;
    }>();

    for (const member of members) {
      studentProgressMap.set(member.userId, {
        userId: member.userId,
        studentName: member.studentName || 'Unknown',
        assessmentsByGrade: [],
      });
    }

    // Get top career for each assessment
    for (const assessment of memberAssessments) {
      if (!assessment.userId) continue;
      
      const topRec = await db
        .select({
          careerId: recommendations.careerId,
          careerTitle: careers.title,
        })
        .from(recommendations)
        .leftJoin(careers, eq(recommendations.careerId, careers.id))
        .where(eq(recommendations.assessmentId, assessment.id))
        .orderBy(desc(recommendations.overallMatchScore))
        .limit(1);

      const student = studentProgressMap.get(assessment.userId);
      if (student) {
        student.assessmentsByGrade.push({
          grade: assessment.grade || 'Unknown',
          completedAt: assessment.completedAt,
          topCareer: topRec[0]?.careerTitle || null,
        });
      }
    }

    const studentProgress = Array.from(studentProgressMap.values())
      .filter(s => s.assessmentsByGrade.length > 0);

    return { gradeStats, studentProgress };
  }

  // ── LLM Narrative Cache ───────────────────────────────────────────────────

  async getLlmNarrativeCache(
    assessmentId: string,
    careerId: string,
    promptKey: string,
    language: string
  ): Promise<string | null> {
    const [row] = await db
      .select({ narrative: llmNarrativeCache.narrative })
      .from(llmNarrativeCache)
      .where(
        and(
          eq(llmNarrativeCache.assessmentId, assessmentId),
          eq(llmNarrativeCache.careerId, careerId),
          eq(llmNarrativeCache.promptKey, promptKey),
          eq(llmNarrativeCache.language, language)
        )
      )
      .limit(1);
    return row?.narrative ?? null;
  }

  async setLlmNarrativeCache(
    assessmentId: string,
    careerId: string,
    promptKey: string,
    language: string,
    narrative: string
  ): Promise<void> {
    await db
      .insert(llmNarrativeCache)
      .values({ assessmentId, careerId, promptKey, language, narrative })
      .onConflictDoUpdate({
        target: [
          llmNarrativeCache.assessmentId,
          llmNarrativeCache.careerId,
          llmNarrativeCache.promptKey,
          llmNarrativeCache.language,
        ],
        set: { narrative, createdAt: new Date() },
      });
  }

  async invalidateLlmNarrativeCacheForAssessment(assessmentId: string): Promise<void> {
    await db
      .delete(llmNarrativeCache)
      .where(eq(llmNarrativeCache.assessmentId, assessmentId));
  }

  async invalidateLlmNarrativeCacheForPromptKey(promptKey: string): Promise<void> {
    await db
      .delete(llmNarrativeCache)
      .where(eq(llmNarrativeCache.promptKey, promptKey));
  }
}

export const storage = new DatabaseStorage();
