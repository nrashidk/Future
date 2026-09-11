import {
  encryptAndSerialize,
  deserializeAndDecrypt,
  isEncryptedFormat,
} from "./utils/encryption";
import { permuteOptionsForStorage } from "./utils/quiz";
// Storage-free by design (see the header of subjectMap.ts), so importing it here
// cannot pull db into the DB-free consumers. utils/subjects.ts is the module that
// must NOT be imported here: it imports storage, and the pair would cycle.
import { DEFAULT_SUBJECT_MAP } from "./utils/subjectMap";
import {
  users,
  countries,
  subjects,
  skills,
  careers,
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
  studentDemographicsSchema,
  countryPrioritySectors,
  countrySectorWefSkills,
  countrySectorCategories,
  files,
  organizationEvents,
  organizationConsents,
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
  SCORING_ESTATE_STATES,
  type ScoringEstateState,
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
  type CountrySectorCategory,
  type File,
  type InsertFile,
  type OrganizationEvent,
  type OrganizationConsent,
  type InsertOrganizationEvent,
  type InsertOrganizationConsent,
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
import { collapseToLatestPerGrade, gradeSortKey, mergeGradeCounts, toCanonicalGrade } from "@shared/grade";
import { splitStudentName } from "@shared/studentName";
import { SUBJECT_IDS } from "@shared/subjects";
import { eq, ne, and, or, desc, count, avg, sql, inArray, notInArray, isNotNull, gte, type SQL } from "drizzle-orm";

/**
 * One row of the VISION-ALIGNMENT sector <-> career-category map.
 *
 * Produced by getSectorCategoryMap with a LEFT JOIN, so a priority sector that
 * has no mapping rows yet still appears (with null category/career/relevance)
 * and therefore still contributes its display_order rank.
 */
export interface SectorCategoryRow {
  sectorId: string;
  sectorName: string;
  displayOrder: number;
  careerCategory: string | null;
  careerId: string | null;
  relevance: number | null;
}

/**
 * One row of the VISION-ALIGNMENT sector <-> WEF-skill map.
 *
 * LEFT JOIN, exactly like SectorCategoryRow: a priority sector with no skill
 * rows yet still appears (null skill/importance) and therefore still contributes
 * its display_order to the rank modifier. Dropping such a sector would renumber
 * every sector below it and silently change every career's vision score.
 */
export interface SectorWefSkillRow {
  sectorId: string;
  sectorName: string;
  displayOrder: number;
  wefSkillId: string | null;
  wefSkillName: string | null;
  importance: number | null; // 0-100
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByOAuthProvider(provider: string, providerId: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserRole(targetUserId: string, newRole: 'user' | 'superadmin', newAccountType?: 'individual' | 'org_admin' | 'org_student' | null): Promise<User>;
  updateUserPremiumStatus(userId: string, stripeCustomerId: string | null): Promise<User>;
  createStandaloneUser(userData: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    isPremium?: boolean;
    purchasedLicenses?: number;
    stripeCustomerId?: string | null;
    passwordComplexity?: 'medium' | 'strong';
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
  resolveSubjectName(countryId: string | null | undefined, curriculum: string | null | undefined, input: string | null | undefined): Promise<string>;
  renameCurriculum(countryId: string, oldName: string, newName: string): Promise<{ subjects: number; questions: number; organizations: number }>;

  // Skills operations
  getAllSkills(): Promise<Skill[]>;
  getSkillsByCategory(category: string): Promise<Skill[]>;

  // Career operations
  createCareer(career: InsertCareer): Promise<Career>;
  getAllCareers(): Promise<Career[]>;
  getCareerById(id: string): Promise<Career | undefined>;
  updateCareer(id: string, data: Partial<InsertCareer>): Promise<Career>;
  deleteCareer(id: string): Promise<boolean>;

  // Assessment operations
  createAssessment(assessment: InsertAssessment): Promise<Assessment>;
  getAssessmentById(id: string): Promise<Assessment | undefined>;
  getAssessmentsByUser(userId: string): Promise<Assessment[]>;
  countCompletedAssessmentsByUser(userId: string, excludeAssessmentId?: string): Promise<number>;
  getAssessmentByGuestToken(guestToken: string): Promise<Assessment | undefined>;
  updateAssessment(id: string, assessment: Partial<InsertAssessment>): Promise<Assessment>;
  migrateGuestAssessments(guestAssessmentIds: string[], userId: string, guestSessionId: string): Promise<number>;

  // Recommendation operations
  createRecommendation(recommendation: InsertRecommendation): Promise<Recommendation>;
  getRecommendationsByAssessment(assessmentId: string): Promise<Recommendation[]>;
  deleteRecommendationsByAssessment(assessmentId: string): Promise<number>;
  getScoringEstateCounts(
    currentRegimes: Array<{ tier: string; algorithm: number; configHash: string }>,
  ): Promise<Record<ScoringEstateState, number>>;

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
  deleteAssessmentQuiz(assessmentQuizId: string): Promise<boolean>;
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
    prioritySkills: Array<{ name: string; nameAr: string | null }>;
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
  createOrUpdateCareerComponentAffinity(affinity: InsertCareerComponentAffinity): Promise<CareerComponentAffinity>;
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
  upsertWefCompetencyResult(assessmentId: string, userId: string | null, skillScores: Record<string, number>, sourceAttribution: string, isGuest?: boolean, guestSessionId?: string | null): Promise<WefCompetencyResult>;
  getWefCompetencyResultByAssessmentId(assessmentId: string): Promise<WefCompetencyResult | undefined>;
  getWefCompetencyResultByUserId(userId: string): Promise<WefCompetencyResult | undefined>;

  // Country Priority Sectors operations
  getCountryPrioritySectorsByCountry(countryId: string): Promise<CountryPrioritySector[]>;
  createOrUpdateCountryPrioritySector(countryId: string, name: string, displayOrder: number, description?: string): Promise<CountryPrioritySector>;
  createOrUpdateCountrySectorWefSkill(sectorId: string, wefSkillId: string, importance: number): Promise<CountrySectorWefSkill>;
  deleteCountrySectorWefSkillsNotIn(sectorId: string, keepWefSkillIds: string[]): Promise<number>;
  createOrUpdateSectorCategoryRule(sectorId: string, careerCategory: string, relevance: number, notes?: string): Promise<CountrySectorCategory>;
  createOrUpdateSectorCareerOverride(sectorId: string, careerId: string, relevance: number, notes?: string): Promise<CountrySectorCategory>;
  getSectorCategoryMap(countryId: string): Promise<SectorCategoryRow[]>;
  getSectorWefSkillMap(countryId: string): Promise<SectorWefSkillRow[]>;
  
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
  // Replaces updateOrganizationQuota and consumeLicenseWithRewardPriority. The
  // licence counters are SET from the roster, never adjusted — see the impl.
  recomputeOrganizationLicenseUsage(
    organizationId: string,
    tx?: any,
  ): Promise<{ usedLicenses: number; rewardCreditsUsed: number }>;
  deleteOrganization(id: string): Promise<boolean>;
  deleteOrganizationEventsByOrgId(organizationId: string): Promise<number>;
  deleteFilesByOrganizationId(organizationId: string): Promise<number>;

  // Organization Member operations
  createOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember>;
  getOrganizationMemberById(id: string): Promise<OrganizationMember | undefined>;
  getOrganizationMemberByUserId(userId: string): Promise<OrganizationMember | undefined>;
  getOrganizationMembersByOrganizationId(organizationId: string): Promise<OrganizationMember[]>;
  countOrganizationStudents(organizationId: string): Promise<number>;
  updateStudentMemberProfile(
    memberId: string,
    userId: string,
    updates: {
      studentName?: string;
      grade?: string;
      studentGender?: string;
      studentId?: string | null;
      dateOfBirth?: string;
    },
  ): Promise<OrganizationMember>;
  deleteOrganizationMember(memberId: string): Promise<boolean>;
  bulkDeleteOrganizationMembers(memberIds: string[]): Promise<number>;
  getOrganizationStats(organizationId: string): Promise<{
    totalMembers: number;
    completedAssessments: number;
    pendingAssessments: number;
  }>;
  updateOrganizationMember(id: string, data: Partial<InsertOrganizationMember>): Promise<OrganizationMember>;
  deleteOrganizationMember(id: string): Promise<boolean>;

  // Combined operations
  createUserWithCredentials(userData: {
    organizationId: string;
    fullName: string;
    grade?: string;
    username?: string;
    studentId?: string;
    studentName?: string;
    studentGender?: string;
    /** Canonical 'YYYY-MM-DD'. Validated by the caller; see admin.routes.ts M1. */
    dateOfBirth?: string;
    passwordComplexity?: 'medium' | 'strong';
  }): Promise<{
    user: User;
    member: OrganizationMember;
    password: string;
    /** Which fund this enrolment spent. Decided and recorded inside the same
     *  transaction as the member row; the routes report it to the admin. */
    licenseSource: 'paid' | 'reward';
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
  createOrganizationConsent(consent: InsertOrganizationConsent): Promise<OrganizationConsent>;
  /** Most recent attestation for an organization, or undefined. See shared/schema.ts. */
  getCurrentOrganizationConsent(organizationId: string): Promise<OrganizationConsent | undefined>;
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
  getLlmNarrativeCacheStats(): Promise<{
    totalCached: number;
    cacheHits: number;
    promptBreakdown: Array<{ promptKey: string; count: number }>;
  }>;

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

/**
 * A curriculum rename rejected by its own preconditions.
 *
 * Carries the HTTP status the route should return, because the checks now live
 * inside the transaction (renameCurriculum) rather than in the handler, and the
 * three refusals are not interchangeable: a missing country is a 404, an unknown
 * old name is a 400, and a collision with an existing name is a 409. Collapsing
 * them into one status would tell a superadmin who mistyped the old name that
 * the country does not exist.
 *
 * Deliberately NOT AppError (middleware/errorHandler.middleware.ts): nothing in
 * server/routes uses it, and importing express-facing middleware into storage
 * would reverse the dependency direction for the sake of one class.
 */
export class CurriculumRenameError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "CurriculumRenameError";
  }
}

/**
 * A subject string that names nothing storable.
 *
 * Carries `status` for the same reason CurriculumRenameError does: the handler
 * maps it to a response rather than letting it reach the generic catch, which in
 * every one of these routes means a 500. A choke point that refuses where a
 * handler used to succeed is only an improvement if the refusal reaches the
 * caller as a refusal.
 */
export class SubjectNotInCatalogueError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly subject: string,
  ) {
    super(message);
    this.name = "SubjectNotInCatalogueError";
  }
}

/**
 * Unscoped half of resolveSubjectName: a question with no country or curriculum
 * has no catalogue row to match, so the umbrella-6 is the vocabulary.
 *
 * Accepts the canonical name, any casing of it, the code form the other writers
 * produce ("social_studies"), and the static aliases the reader already honours
 * (DEFAULT_SUBJECT_MAP). Aliases whose target is outside the six — Art, Music and
 * Business self-map there — are REFUSED rather than stored, because a global
 * question under a subject no student can pick is exactly the unservable row this
 * whole change exists to prevent. normalizeCareerSubjects (utils/subjectMap.ts)
 * drops them for the same reason.
 */
function resolveAgainstUmbrellaSix(raw: string, lower: string): string | undefined {
  const exact = SUBJECT_IDS.find(id => id === raw);
  if (exact) return exact;

  const insensitive = SUBJECT_IDS.find(
    id => id.toLowerCase() === lower || id.toLowerCase().replace(/\s+/g, "_") === lower,
  );
  if (insensitive) return insensitive;

  const aliasKey = Object.keys(DEFAULT_SUBJECT_MAP).find(k => k.toLowerCase() === lower);
  if (aliasKey) {
    const target = DEFAULT_SUBJECT_MAP[aliasKey];
    return SUBJECT_IDS.find(id => id === target);
  }
  return undefined;
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
    phone?: string;
    isPremium?: boolean;
    purchasedLicenses?: number;
    stripeCustomerId?: string | null;
    passwordComplexity?: 'medium' | 'strong';
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
    const password = generatePassword(userData.passwordComplexity ?? 'medium');
    const passwordHash = await hashPassword(password);
    
    // Create user
    const [user] = await db.insert(users).values({
      username,
      passwordHash,
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      ...(userData.phone ? { phone: userData.phone } : {}),
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

  /**
   * The one place a subject string becomes a storable subject value.
   *
   * WHY THIS EXISTS. `quiz_questions.subject` is free text with six writers, and
   * they did not agree. The seeded bank stored the NAME ("Mathematics"), the
   * contribution path stored the CODE ("mathematics"), the admin path stores the
   * name but validated it against `subjects.code` (a guard that only stayed
   * quiet because the admin form sends no curriculum), and the LLM importer
   * stored whatever the model echoed back. Serving compares the stored value
   * exactly and case-sensitively, so anything but the name is invisible to
   * students with no error anywhere. Resolving in ONE place is what makes the
   * writers agree by construction rather than by four separate guards that have
   * to be kept in step.
   *
   * TWO SCOPES, TWO CATALOGUES, and that is deliberate. `subjects.countryId` and
   * `.curriculum` are notNull (schema.ts:387-388) while the same columns on
   * `quiz_questions` are nullable (:946-947), so a question with either unset has
   * no addressable catalogue row at all — the catalogue invariant is not merely
   * unmet for it, it cannot be stated. Such a row is a GLOBAL question by the
   * schema's own comment, servable to any student regardless of country, and
   * students only ever pick from the umbrella-6 (SubjectsStep -> SUBJECT_IDS).
   * So the six is not a weaker fallback here; it is the only vocabulary a global
   * row can be matched against.
   *
   * ALIASES ARE ACCEPTED, so that the writer and the reader use one map. The
   * reader already resolves through `subjects.aliases` (utils/subjects.ts:65-69);
   * the writer not doing so is precisely the asymmetry that let the original
   * defect through. A rewrite is logged whenever the stored value differs from
   * what the caller passed, so it is traceable rather than silent.
   *
   * NOT getSubjectsByCurriculum, which filters isActive. The invariant is "names
   * a real catalogue subject", not "names one currently on offer" — and a choke
   * point stricter than the handler that already approved the write would turn
   * contribution approval's own 409-checked name into a 500 the moment a subject
   * were deactivated. Whether a subject may still be CHOSEN is a submit-time
   * question, decided above this layer.
   *
   * @throws SubjectNotInCatalogueError when nothing resolves.
   */
  async resolveSubjectName(
    countryId: string | null | undefined,
    curriculum: string | null | undefined,
    input: string | null | undefined,
  ): Promise<string> {
    const raw = (input ?? "").trim();
    if (!raw) {
      throw new SubjectNotInCatalogueError("A subject is required.", 400, "");
    }
    const lower = raw.toLowerCase();

    const resolved = countryId && curriculum
      ? await this.resolveAgainstCatalogue(countryId, curriculum, raw, lower)
      : resolveAgainstUmbrellaSix(raw, lower);

    if (!resolved) {
      const where = countryId && curriculum
        ? `the ${curriculum} catalogue for ${countryId}`
        : `the global subject list (a question with no country or curriculum is served to any student, so it must name one of: ${SUBJECT_IDS.join(", ")})`;
      throw new SubjectNotInCatalogueError(
        `Subject '${raw}' does not match anything in ${where}.`,
        400,
        raw,
      );
    }

    if (resolved !== raw) {
      console.log(
        `[subjects] resolved '${raw}' -> '${resolved}' (countryId=${countryId ?? "null"}, curriculum=${curriculum ?? "null"})`,
      );
    }
    return resolved;
  }

  /** Scoped half of resolveSubjectName. Exact name, exact code, then case-insensitively, then aliases. */
  private async resolveAgainstCatalogue(
    countryId: string,
    curriculum: string,
    raw: string,
    lower: string,
  ): Promise<string | undefined> {
    const rows = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.countryId, countryId), eq(subjects.curriculum, curriculum)));

    return (
      rows.find(r => r.name === raw)?.name ??
      rows.find(r => r.code === raw)?.name ??
      rows.find(r => r.name.toLowerCase() === lower || r.code.toLowerCase() === lower)?.name ??
      rows.find(r => (r.aliases ?? []).some(a => a.toLowerCase() === lower))?.name
    );
  }

  /**
   * Rename a curriculum across every table that stores its name, atomically.
   *
   * REPLACES renameCurriculumInSubjects / renameCurriculumInQuizQuestions, which
   * were two thirds of this cascade run as three unrelated statements from the
   * route. They are folded in rather than kept alongside: leaving a
   * non-transactional single-table rename in the API is the trap this method
   * exists to close, and the rename route was their only caller.
   *
   * ORGANIZATIONS IS THE WRITE THAT WAS MISSING, and it is the one that mattered.
   * organizations.curriculum is not a label — assessment.routes.ts:136 copies it
   * into every new assessment as a school-owned field, and that value scopes the
   * quiz bank. A rename that skipped it left the school holding a string no
   * longer in countries.curricula, and the quiz then fell through the four-tier
   * fallback cascade at quiz.routes.ts:292-331, each tier of which drops another
   * scope rather than failing: :301 drops the CURRICULUM, :309 drops the COUNTRY
   * too, :317 drops both and moves the grade by ±1, and only :330 returns a 400.
   * So the student sat a quiz from the wrong bank — at worst another country's,
   * another grade's — scored and stored as if it were right. Nothing errored;
   * the only trace was one console.log per tier (:306, :314, :324).
   *
   * EVERY WHERE CLAUSE IS SCOPED BY countryId. The same label legitimately
   * exists under more than one country — 'National' and 'IB' are not unique
   * strings — so an unscoped rewrite would relabel schools, subjects and
   * questions belonging to countries the superadmin never touched. The country
   * scope is what makes this a rename rather than a global find-and-replace.
   *
   * THE PRECONDITIONS MOVED INSIDE THE TRANSACTION, and the countries row is
   * taken FOR UPDATE. They used to run in the route, before any write, against a
   * row nothing held: two concurrent renames could both pass "newName does not
   * exist" and both proceed, leaving one of the two names silently lost. Same
   * check-then-act shape, and the same fix, as createGroupPurchaseTransaction
   * below.
   *
   * assessments.curriculum is deliberately NOT updated here. Re-scoping a
   * completed assessment is a decision about what it means, not a string
   * rewrite, and it is tracked as Phase 6 reconciliation in FOLLOWUP.md.
   * contribution_submissions.curriculum is also left alone, pending a decision
   * on which submission statuses should follow a rename — likewise FOLLOWUP.md.
   *
   * The caller is responsible for clearSubjectCache(), and must call it only
   * AFTER this resolves. Clearing inside the transaction would repopulate the
   * cache from uncommitted rows, and clearing on a rollback would discard a
   * cache that was still correct.
   */
  async renameCurriculum(
    countryId: string,
    oldName: string,
    newName: string,
  ): Promise<{ subjects: number; questions: number; organizations: number }> {
    return db.transaction(async (tx) => {
      const [country] = await tx
        .select()
        .from(countries)
        .where(eq(countries.id, countryId))
        .for('update');

      if (!country) {
        throw new CurriculumRenameError(`Country not found: ${countryId}`, 404);
      }

      const curricula = country.curricula ?? [];

      if (!curricula.includes(oldName)) {
        throw new CurriculumRenameError(
          `Curriculum '${oldName}' not found in this country`,
          400,
        );
      }

      if (curricula.includes(newName)) {
        throw new CurriculumRenameError(
          `Curriculum '${newName}' already exists in this country`,
          409,
        );
      }

      await tx
        .update(countries)
        .set({
          curricula: curricula.map((c) => (c === oldName ? newName : c)),
          updatedAt: new Date(),
        })
        .where(eq(countries.id, countryId));

      const subjectsResult = await tx
        .update(subjects)
        .set({ curriculum: newName, updatedAt: new Date() })
        .where(
          and(
            eq(subjects.countryId, countryId),
            eq(subjects.curriculum, oldName)
          )
        );

      const questionsResult = await tx
        .update(quizQuestions)
        .set({ curriculum: newName })
        .where(
          and(
            eq(quizQuestions.countryId, countryId),
            eq(quizQuestions.curriculum, oldName)
          )
        );

      const organizationsResult = await tx
        .update(organizations)
        .set({ curriculum: newName, updatedAt: new Date() })
        .where(
          and(
            eq(organizations.countryId, countryId),
            eq(organizations.curriculum, oldName)
          )
        );

      return {
        subjects: subjectsResult.rowCount ?? 0,
        questions: questionsResult.rowCount ?? 0,
        organizations: organizationsResult.rowCount ?? 0,
      };
    });
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

  /**
   * Completed-assessment count for one user, for the free-tier cap guard.
   *
   * A count query rather than getAssessmentsByUser(...).filter(): that method
   * selects every column of every row to answer a question about a number, and
   * this one runs on the create path of every free assessment. Served by
   * assessments_user_id_idx (shared/schema.ts:703).
   *
   * `excludeAssessmentId` exists for the generation-time guard: completion
   * happens when recommendations are generated, so the row being generated is
   * still isCompleted=false at check time on the first pass but must not be
   * counted twice on a retry. Callers ask "how many OTHER assessments has this
   * user completed", which is the question that stays correct either way.
   */
  async countCompletedAssessmentsByUser(
    userId: string,
    excludeAssessmentId?: string,
  ): Promise<number> {
    const conditions = [
      eq(assessments.userId, userId),
      eq(assessments.isCompleted, true),
    ];
    if (excludeAssessmentId) {
      conditions.push(ne(assessments.id, excludeAssessmentId));
    }
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assessments)
      .where(and(...conditions));
    return row?.count ?? 0;
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
      .where(eq(recommendations.assessmentId, assessmentId))
      .orderBy(desc(recommendations.overallMatchScore), recommendations.careerId);
  }

  async deleteRecommendationsByAssessment(assessmentId: string): Promise<number> {
    const result = await db
      .delete(recommendations)
      .where(eq(recommendations.assessmentId, assessmentId));
    return result.rowCount || 0;
  }

  /**
   * HOW MUCH OF THE STORED ESTATE STILL MATCHES TODAY'S SCORING, in one grouped
   * query. Feeds the card at the top of the superadmin scoring tab.
   *
   * `currentRegimes` is computed in Node (matching.currentScoringRegimes) and
   * injected as a three-row VALUES list. That is the whole reason this can be
   * SQL at all: configHash is a truncated encoding, but nothing here has to
   * RECOMPUTE it — the current value arrives as a parameter and the comparison
   * is string equality, which Postgres does as well as anything.
   *
   * Four details carry the correctness:
   *
   *   count(DISTINCT assessment_id), NOT count(*). recommendations holds ~5 rows
   *   per report; counting rows reports a number ~5x larger that means something
   *   else. The distinct count is well defined because all five rows of an
   *   assessment are written in one transaction from one activeComponents set,
   *   and regeneration deletes and re-inserts rather than mixing vintages — so a
   *   report cannot straddle two states.
   *
   *   LEFT JOIN, so an unmatched tier lands in its own branch. provenance.tier
   *   is free text and the regime list comes from scoring_tiers; a row naming a
   *   tier that no longer has a config joins to NULL. Getting this structurally
   *   right in SQL is worth more than it looks — in application code the
   *   unmatched case falls through into "drifted" by default, which is the false
   *   positive that teaches an operator to ignore the card.
   *
   *   The algorithm test compares JSONB, not (->>'algorithm')::int. The cast
   *   throws on any row whose algorithm is non-numeric; comparing
   *   `-> 'algorithm'` against to_jsonb() cannot. Identical result on every
   *   well-formed row, no failure mode on a malformed one.
   *
   *   BRANCH ORDER IS LOAD-BEARING. NULL provenance first (there is nothing to
   *   read), then unmatched tier (there is nothing to compare), then algorithm,
   *   then config. Reversing the last two would report a row as config-drifted
   *   when the calculator itself changed, which is the more serious finding and
   *   the one that needs the version history to explain.
   *
   * A full scan of a table in the tens of rows, on an admin-only endpoint. Not
   * worth indexing.
   */
  async getScoringEstateCounts(
    currentRegimes: Array<{ tier: string; algorithm: number; configHash: string }>,
  ): Promise<Record<ScoringEstateState, number>> {
    const counts = Object.fromEntries(
      SCORING_ESTATE_STATES.map((state) => [state, 0]),
    ) as Record<ScoringEstateState, number>;

    // No configured tiers means nothing to compare against — every scored row is
    // noCurrentRegime, and a zero-row VALUES list is a syntax error rather than
    // an empty set, so this case cannot go through the query below.
    const comparison = currentRegimes.length
      ? sql`
          WITH current_regime(tier, algorithm, config_hash) AS (
            VALUES ${sql.join(
              currentRegimes.map(
                (r) => sql`(${r.tier}::text, ${r.algorithm}::int, ${r.configHash}::text)`,
              ),
              sql`, `,
            )}
          )
          SELECT
            CASE
              WHEN r.scoring_provenance IS NULL THEN 'unknown'
              WHEN cr.tier IS NULL THEN 'noCurrentRegime'
              WHEN r.scoring_provenance->'algorithm' IS DISTINCT FROM to_jsonb(cr.algorithm)
                THEN 'algorithmDrifted'
              WHEN r.scoring_provenance->>'configHash' IS DISTINCT FROM cr.config_hash
                THEN 'configDrifted'
              ELSE 'current'
            END AS state,
            count(DISTINCT r.assessment_id)::int AS reports
          FROM recommendations r
          LEFT JOIN current_regime cr ON cr.tier = r.scoring_provenance->>'tier'
          GROUP BY 1
        `
      : sql`
          SELECT
            CASE WHEN r.scoring_provenance IS NULL THEN 'unknown' ELSE 'noCurrentRegime' END AS state,
            count(DISTINCT r.assessment_id)::int AS reports
          FROM recommendations r
          GROUP BY 1
        `;

    const result = await db.execute(comparison);
    for (const row of result.rows as Array<{ state: string; reports: number }>) {
      if (row.state in counts) counts[row.state as ScoringEstateState] = Number(row.reports);
    }
    return counts;
  }

  // Quiz operations
  /**
   * THE ONE PLACE OPTION ORDER ENTERS THE BANK. Every insert path routes through
   * here — the UAE seed (seed.ts:2741), contribution approval
   * (contribution.routes.ts:509), AI-generated country banks
   * (country.routes.ts:488) and admin create (admin.routes.ts:161, :238) — and
   * each of them passes the author's or the model's ordering straight through.
   * Authors and LLMs alike put the correct answer first; that is how 239 of the
   * bank's 240 questions came to have it at options[0].
   *
   * Normalising here rather than at those five call sites means a sixth cannot
   * reintroduce the bias, and means source files never have to be kept in
   * agreement with the database — their order simply stops being authoritative.
   */
  async createQuizQuestion(questionData: InsertQuizQuestion): Promise<QuizQuestion> {
    const permuted = permuteOptionsForStorage(questionData.options, questionData.optionsAr);
    const values: InsertQuizQuestion = { ...questionData, options: permuted.options as any };
    // Only set optionsAr when the caller supplied it — several callers omit the
    // key entirely and writing an explicit undefined would change that.
    if (questionData.optionsAr !== undefined) {
      values.optionsAr = permuted.optionsAr as any;
    }
    const [question] = await db.insert(quizQuestions).values(values).returning();
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
      conditions.push(
        or(
          eq(quizQuestions.curriculum, filters.curriculum),
          sql`${quizQuestions.curriculum} IS NULL`
        )
      );
    }
    
    let query = db.select().from(quizQuestions);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    /**
     * A TOTAL ORDER, BECAUSE THIS QUERY PAGES.
     *
     * LIMIT and OFFSET below were applied to a SELECT with no ORDER BY, and a
     * result set without one has no defined order. That is worse than an
     * arbitrary sort: LIMIT then decides WHICH ROWS COME BACK AT ALL, and OFFSET
     * paging over an undefined order can return one row on two pages and never
     * return another — with no error, and nothing in the response to notice it
     * from. It has to be in the query rather than left to the caller: by the time
     * the caller sees the rows, the ones LIMIT dropped are already gone.
     *
     * subject, then grade, then topic is the reviewer's mental model and the
     * shape of the filters above; topic also puts near-duplicate questions
     * adjacent, which is what someone checking a bank by hand needs to see.
     *
     * id LAST, and it is what makes the order TOTAL. All four columns are NOT
     * NULL, so there is no NULLS FIRST/LAST question to get wrong.
     *
     * A uuid is the right final key HERE and was the wrong one for the career
     * tie-break, for a reason worth keeping straight: that sort had to reproduce
     * ACROSS databases, so a per-database gen_random_uuid() was disqualifying and
     * it fell back to title. These rows live in exactly one database and nobody
     * compares this list between environments; the requirement is that the order
     * hold still WITHIN one, under edit. A uuid primary key is unique by
     * construction rather than by data — which is the guarantee careers.title
     * could not give — and immutable under UPDATE, so a question does not move
     * when it is edited. That last property is the live half of the defect: an
     * UPDATE appends a new tuple version to the end of the heap, so before this
     * the list reshuffled as it was reviewed.
     */
    query = query.orderBy(
      quizQuestions.subject,
      quizQuestions.grade,
      quizQuestions.topic,
      quizQuestions.id,
    ) as any;
    
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
      conditions.push(
        or(
          eq(quizQuestions.curriculum, filters.curriculum),
          sql`${quizQuestions.curriculum} IS NULL`
        )
      );
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

    // Total order before LIMIT/OFFSET — same reasoning as
    // getQuizQuestionsByFilters above, which this duplicates. Both feed the same
    // admin list and export.
    query = query.orderBy(
      quizQuestions.subject,
      quizQuestions.grade,
      quizQuestions.topic,
      quizQuestions.id,
    ) as any;
    
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

  /**
   * Delete a quiz attempt and everything it owns.
   *
   * RESPONSES FIRST, THEN THE ROW, IN ONE TRANSACTION. quiz_responses
   * .assessment_quiz_id has no ON DELETE CASCADE (schema.ts), so dropping the
   * quiz alone would violate the foreign key. Following deleteQuizQuestion,
   * which deletes the same child table first for the same reason — but inside a
   * transaction, which that one is not: a failure between the two statements
   * here would leave orphaned responses pointing at a quiz that no longer
   * exists, and this runs on a student's live assessment rather than on an
   * admin's question edit.
   *
   * Does NOT check completedAt. The caller owns that decision — this is the
   * mechanism, and the only current caller (the subjects-changed invalidation in
   * assessment.routes.ts) refuses to touch a submitted quiz.
   */
  async deleteAssessmentQuiz(assessmentQuizId: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      await tx.delete(quizResponses).where(eq(quizResponses.assessmentQuizId, assessmentQuizId));
      const result = await tx
        .delete(assessmentQuizzes)
        .where(eq(assessmentQuizzes.id, assessmentQuizId))
        .returning();
      return result.length > 0;
    });
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

    // Get grade distribution with aggregation.
    //
    // Grouped on a CANONICALIZED expression, not the raw column. This is the
    // "Grade 10 twice" bug: rows holding '10' and rows holding 'grade10' formed
    // two groups, and the client then stripped the 'grade' prefix off the label
    // so both bars rendered "Grade 10". Migration 013 canonicalizes the stored
    // values, but grouping defensively here means a single stray non-canonical
    // row can never split a bucket again.
    //
    // Mirrors shared/grade.ts toCanonicalGrade for the shapes that convert:
    // already-canonical passes through, a bare/embedded digit core of 8-12 gains
    // the prefix, and anything else is left as-is so it stays visible rather
    // than being silently merged into a grade it may not belong to.
    const canonicalGradeExpr = sql<string>`
      CASE
        WHEN ${assessments.grade} ~ '^grade(8|9|10|11|12)$' THEN ${assessments.grade}
        WHEN ${assessments.grade} = 'graduated' THEN 'graduated'
        WHEN regexp_replace(${assessments.grade}, '\D', '', 'g') IN ('8','9','10','11','12')
          THEN 'grade' || regexp_replace(${assessments.grade}, '\D', '', 'g')
        ELSE ${assessments.grade}
      END`;

    const gradesData = await db
      .select({
        grade: canonicalGradeExpr,
        count: sql<number>`count(*)::int`
      })
      .from(assessments)
      .where(and(...conditions, isNotNull(assessments.grade)))
      .groupBy(canonicalGradeExpr);

    return {
      totalStudents,
      completedAssessments,
      countriesBreakdown: countriesData.map(row => ({
        countryId: row.countryId!,
        countryName: row.countryName || 'Unknown',
        count: row.count
      })),
      // One bucket per grade, sorted by grade rather than by count or lexically
      // ('grade10' < 'grade8' and '10' < '8' both sort wrongly as strings).
      // The SQL above already groups canonically; merging again here is the
      // layer that is unit-testable without a database, and it keeps a stray
      // non-canonical row from ever splitting a bar again (shared/grade.ts).
      gradeDistribution: mergeGradeCounts(gradesData)
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
    // WEF skills are joined from country_priority_sectors → country_sector_wef_skills → wef_skills.
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
      sector_wef_skills AS (
        SELECT
          cps.country_id,
          cps.name AS sector_name,
          COALESCE(
            json_agg(
              json_build_object('name', ws.name, 'nameAr', ws.name_ar)
              ORDER BY csws.importance DESC
            ) FILTER (WHERE ws.id IS NOT NULL),
            '[]'::json
          ) AS skills
        FROM country_priority_sectors cps
        LEFT JOIN country_sector_wef_skills csws ON csws.sector_id = cps.id
        LEFT JOIN wef_skills ws ON ws.id = csws.wef_skill_id
        ${countryId ? sql`WHERE cps.country_id = ${countryId}` : sql``}
        GROUP BY cps.country_id, cps.name
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
        COALESCE(AVG(r.country_vision_alignment), 0)::float as avg_alignment,
        COALESCE(sws.skills, '[]'::json) as priority_skills
      FROM country_sectors cs
      LEFT JOIN sector_wef_skills sws ON sws.country_id = cs.country_id AND LOWER(TRIM(sws.sector_name)) = LOWER(TRIM(cs.sector))
      LEFT JOIN filtered_assessments fa ON fa.country_id = cs.country_id
      LEFT JOIN recommendations r ON r.assessment_id = fa.id
      GROUP BY cs.sector, cs.sector_ar, sws.skills
      ORDER BY student_count DESC
    `);

    return (result.rows as any[]).map(row => ({
      sector: row.sector,
      sectorAr: row.sector_ar || null,
      studentCount: row.student_count || 0,
      avgAlignment: row.avg_alignment || 0,
      prioritySkills: Array.isArray(row.priority_skills) ? row.priority_skills : (row.priority_skills ? JSON.parse(row.priority_skills) : []),
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

  /**
   * Idempotent write, keyed on (career_id, component_id).
   *
   * The seed re-runs on every boot, so a plain INSERT here appended a duplicate
   * row per career per boot — the table had no unique constraint until
   * migration 010, so the loop's `catch (23505)` guarded a violation that could
   * never be raised. This is the fix, and it mirrors
   * createOrUpdateCareerWefSkillAffinity, whose table has had its unique index
   * from the start and never duplicated.
   *
   * Requires career_component_affinity_unique_idx (migration 010) as its
   * ON CONFLICT target.
   */
  async createOrUpdateCareerComponentAffinity(affinityData: InsertCareerComponentAffinity): Promise<CareerComponentAffinity> {
    const [affinity] = await db
      .insert(careerComponentAffinities)
      .values(affinityData)
      .onConflictDoUpdate({
        target: [careerComponentAffinities.careerId, careerComponentAffinities.componentId],
        set: { affinityData: affinityData.affinityData, updatedAt: new Date() },
      })
      .returning();
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

  /**
   * Remove sector→skill rows for skills the seed vector no longer lists.
   *
   * createOrUpdateCountrySectorWefSkill is an upsert, so it can ADD a skill to a
   * sector and CHANGE an importance, but it can never REMOVE one — exactly the
   * same shape of gap as the sector-rename problem applySectorRenames exists to
   * close. Without this, dropping a skill from a vector in server/seed.ts is a
   * no-op on every database that has already been seeded: the stale row keeps
   * its importance and keeps contributing to skillAlignment, so the vector the
   * code describes and the vector the scorer uses quietly diverge.
   *
   * Phase 3 stage 3 is the first change that removes skills (Healthcare drops
   * Critical Thinking and Persistence and Grit; Education & Human Capital drops
   * Creativity), which is what surfaced this.
   */
  async deleteCountrySectorWefSkillsNotIn(sectorId: string, keepWefSkillIds: string[]): Promise<number> {
    const result = keepWefSkillIds.length
      ? await db.delete(countrySectorWefSkills).where(and(
          eq(countrySectorWefSkills.sectorId, sectorId),
          notInArray(countrySectorWefSkills.wefSkillId, keepWefSkillIds),
        ))
      : await db.delete(countrySectorWefSkills).where(eq(countrySectorWefSkills.sectorId, sectorId));
    return result.rowCount ?? 0;
  }

  /**
   * Upsert one VISION-ALIGNMENT category rule: (sector, career_category) -> relevance.
   *
   * The conflict target MUST repeat the partial index's WHERE predicate
   * (`sector_category_rule_unique_idx` is partial on `career_id IS NULL`).
   * Without `targetWhere` Postgres cannot match the index and the statement
   * fails with "no unique or exclusion constraint matching the ON CONFLICT
   * specification" - see the NULL-distinctness note in shared/schema.ts.
   */
  async createOrUpdateSectorCategoryRule(
    sectorId: string,
    careerCategory: string,
    relevance: number,
    notes?: string,
  ): Promise<CountrySectorCategory> {
    const [rule] = await db
      .insert(countrySectorCategories)
      .values({ sectorId, careerCategory, careerId: null, relevance, notes })
      .onConflictDoUpdate({
        target: [countrySectorCategories.sectorId, countrySectorCategories.careerCategory],
        targetWhere: sql`${countrySectorCategories.careerId} IS NULL`,
        set: { relevance, notes, updatedAt: new Date() },
      })
      .returning();
    return rule;
  }

  /**
   * Upsert one VISION-ALIGNMENT per-career override: (sector, career) -> relevance.
   *
   * OVERRIDE-EXCLUSIVE: writing any override row for a career makes overrides the
   * ONLY candidates for it - every category rule stops applying to that career
   * (calculateVisionScore in server/services/matching.ts). Conflict target carries
   * the `sector_category_override_unique_idx` predicate for the same reason as above.
   */
  async createOrUpdateSectorCareerOverride(
    sectorId: string,
    careerId: string,
    relevance: number,
    notes?: string,
  ): Promise<CountrySectorCategory> {
    const [override] = await db
      .insert(countrySectorCategories)
      .values({ sectorId, careerCategory: null, careerId, relevance, notes })
      .onConflictDoUpdate({
        target: [countrySectorCategories.sectorId, countrySectorCategories.careerId],
        targetWhere: sql`${countrySectorCategories.careerId} IS NOT NULL`,
        set: { relevance, notes, updatedAt: new Date() },
      })
      .returning();
    return override;
  }

  /**
   * Load the whole VISION-ALIGNMENT map for one country in a single query.
   *
   * LEFT JOIN on purpose: a priority sector with zero mapping rows must still
   * come back, because its display_order is what gives every OTHER sector its
   * rank position (rankFactor is computed from the sector's index within the
   * country's full ordered sector list).
   */
  async getSectorCategoryMap(countryId: string): Promise<SectorCategoryRow[]> {
    return await db
      .select({
        sectorId: countryPrioritySectors.id,
        sectorName: countryPrioritySectors.name,
        displayOrder: countryPrioritySectors.displayOrder,
        careerCategory: countrySectorCategories.careerCategory,
        careerId: countrySectorCategories.careerId,
        relevance: countrySectorCategories.relevance,
      })
      .from(countryPrioritySectors)
      .leftJoin(
        countrySectorCategories,
        eq(countrySectorCategories.sectorId, countryPrioritySectors.id),
      )
      .where(eq(countryPrioritySectors.countryId, countryId))
      .orderBy(countryPrioritySectors.displayOrder);
  }

  /**
   * Read the VISION-ALIGNMENT sector -> WEF-skill map for one country.
   *
   * Companion to getSectorCategoryMap. The category map answers WHICH sector a
   * career belongs to; this answers HOW WELL its skill profile fits that sector.
   * calculateVisionScore (server/services/matching.ts) uses both - see the HYBRID
   * note there.
   *
   * LEFT JOIN on both hops so a priority sector with no skill rows still appears
   * - see the note on SectorWefSkillRow.
   */
  async getSectorWefSkillMap(countryId: string): Promise<SectorWefSkillRow[]> {
    return await db
      .select({
        sectorId: countryPrioritySectors.id,
        sectorName: countryPrioritySectors.name,
        displayOrder: countryPrioritySectors.displayOrder,
        wefSkillId: countrySectorWefSkills.wefSkillId,
        wefSkillName: wefSkills.name,
        importance: countrySectorWefSkills.importance,
      })
      .from(countryPrioritySectors)
      .leftJoin(
        countrySectorWefSkills,
        eq(countrySectorWefSkills.sectorId, countryPrioritySectors.id),
      )
      .leftJoin(wefSkills, eq(wefSkills.id, countrySectorWefSkills.wefSkillId))
      .where(eq(countryPrioritySectors.countryId, countryId))
      .orderBy(countryPrioritySectors.displayOrder);
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

    // Calculate competency scores from quiz responses.
    //
    // ONLY A SUBMITTED QUIZ IS A MEASUREMENT. quiz_responses rows are created at
    // GENERATION time, one per selected question, with answer: "" and
    // isCorrect: null (quiz.routes.ts:350-358) — before the student has seen a
    // single question. Counting those into `total` while none of them can reach
    // `correct` produced a confident 0% for every subject of a quiz nobody had
    // submitted, and handed it to matching.ts:256 as a measured competency. A
    // fabricated zero is worse than no data: calculateSubjectsScore treats the
    // mere presence of a key as "competency data available" and switches to its
    // 40/60 blend (matching.ts:852-866), so a perfect subject match scored 40
    // instead of 100 and could fall under the overall-40 floor entirely.
    //
    // completedAt IS THE RULE, and it is the same rule everywhere else that has
    // to decide whether a quiz is real: quiz.routes.ts:581 (refusing a second
    // submit), :512 (refusing a partial save after submit) and
    // assessment.routes.ts:720 (discarding a quiz on a subject change only while
    // it is unsubmitted). This used to be the one place deciding it differently.
    //
    // The empty result is the CORRECT answer for an unsubmitted quiz, not a
    // degraded one: {} makes hasCompetencyData false and matching scores on
    // preference alone — exactly the path a student with no quiz at all takes.
    // The two "nothing is known" cases converge instead of diverging.
    //
    // WHAT MUST STILL WORK, and does: a submitted quiz answered entirely wrong
    // has completedAt set and isCorrect: false — not null — on every row, so it
    // still yields a genuine, measured 0%.
    const competencyScores: Record<string, number> = {};

    if (quiz?.completedAt && responses.length > 0) {
      // Fetch quiz responses with question details (join with quizQuestions to get subject)
      //
      // isCorrect IS NOT NULL handles what completedAt cannot: rows inside a
      // COMPLETED quiz that the submit handler skipped without marking — the two
      // `continue`s at quiz.routes.ts:608 and :610-612. Submit's own accumulator
      // (:625-632) increments its total AFTER those skips, so without this
      // filter the recompute here counts rows submit excluded and the two stored
      // copies of this number disagree by construction. This makes the recompute
      // reproduce the submit-time denominator.
      const responsesWithQuestions = await db
        .select({
          response: quizResponses,
          question: quizQuestions,
        })
        .from(quizResponses)
        .innerJoin(quizQuestions, eq(quizResponses.questionId, quizQuestions.id))
        .where(and(
          eq(quizResponses.assessmentQuizId, quiz.id),
          isNotNull(quizResponses.isCorrect),
        ));

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

  /**
   * SET THE LICENCE COUNTERS FROM THE ROSTER. Never increment, never decrement.
   *
   * used_licenses and reward_credits_used describe a set — the school's current
   * student enrolments, split by which fund paid for each. They were previously
   * maintained by arithmetic, and four independent paths could move them out of
   * agreement with that set: a reward-funded student's removal refunded a paid
   * seat (the fund was not recorded, so the -1 could not know), enrolment
   * committed before consumption ran, the capacity check was check-then-act, and
   * self-delete decremented nothing. Correcting any one of them leaves the other
   * three.
   *
   * A counter that is SET from a COUNT cannot drift, so this replaces
   * updateOrganizationQuota and consumeLicenseWithRewardPriority outright rather
   * than fixing their arithmetic. Both are gone; there is no longer any path that
   * adds to or subtracts from these columns.
   *
   * Call it inside the caller's transaction whenever the roster changes. Passing
   * `tx` is not optional in spirit: recomputing outside the transaction that
   * changed the roster reintroduces exactly the enrolment-then-consumption gap
   * this exists to close.
   *
   * role = 'student' because admin rows consume no licence
   * (superadmin.routes.ts:501, :903).
   */
  async recomputeOrganizationLicenseUsage(
    organizationId: string,
    tx: any = db,
  ): Promise<{ usedLicenses: number; rewardCreditsUsed: number }> {
    const [counts] = await tx
      .select({
        paid: sql<number>`count(*) FILTER (WHERE ${organizationMembers.licenseSource} = 'paid')::int`,
        reward: sql<number>`count(*) FILTER (WHERE ${organizationMembers.licenseSource} = 'reward')::int`,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.role, 'student'),
        ),
      );

    const usedLicenses = counts?.paid ?? 0;
    const rewardCreditsUsed = counts?.reward ?? 0;

    await tx
      .update(organizations)
      .set({ usedLicenses, rewardCreditsUsed, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));

    return { usedLicenses, rewardCreditsUsed };
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

  /**
   * How many STUDENT members a school has. Admin rows share this table (role
   * 'admin'), and they are not what the country/curriculum lock is about — an
   * admin has no assessment to invalidate.
   *
   * A count, not a filter over getOrganizationMembersByOrganizationId: that one
   * joins users and builds an assessment-status map per row, all of which the
   * caller would throw away to ask whether the number is zero.
   */
  async countOrganizationStudents(organizationId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.role, 'student'),
      ));
    return row?.count ?? 0;
  }

  async getOrganizationMembersByOrganizationId(organizationId: string): Promise<any[]> {
    const members = await db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
        studentId: organizationMembers.studentId,
        // The name as the school typed it. users.firstName/lastName below are a
        // split of the same string, and an edit form must prefill from this one:
        // the split is lossy (it cannot tell a two-word first name from a first
        // and last), so round-tripping through it would rewrite the name.
        studentName: organizationMembers.studentName,
        studentGender: organizationMembers.studentGender,
        // Needed by the edit form, which must prefill it: a DOB the admin cannot
        // see is one they cannot confirm, and an edit that resubmits the form
        // without it would look like a clear.
        dateOfBirth: organizationMembers.dateOfBirth,
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

  /**
   * Update a student member's profile — the demographics on the member row, and
   * the name copy on the users row, together.
   *
   * DUPLICATED STATE, deliberately kept in sync here. A student's name lives in
   * two places: organization_members.student_name holds it as the school typed
   * it, and users.firstName/users.lastName hold a split of the same string
   * (seeded by createUserWithCredentials). Nothing reconciles them, and they are
   * read by different screens — the admin members table renders the users copy
   * (AdminOrganizations.tsx:877) while the member row is what the CHECK
   * constrains — so writing one without the other shows the admin a rename that
   * appears not to have saved.
   *
   * The better long-term shape is a single canonical source: student_name as the
   * one name of record, with users.firstName/lastName either dropped for
   * org-generated students or derived at read time. That is a migration plus a
   * sweep of every users.firstName reader, so it is not this commit. Until then,
   * this function is the only place a student's name may be updated, and the two
   * writes share one transaction so a failure cannot leave the copies disagreeing.
   *
   * users.username is deliberately NOT recomputed. It is derived from the same
   * split at create time, but it is a login credential the student has been
   * given — on paper, in most cases. Rebuilding it on a rename would silently
   * lock the student out.
   */
  async updateStudentMemberProfile(
    memberId: string,
    userId: string,
    updates: {
      studentName?: string;
      grade?: string;
      studentGender?: string;
      studentId?: string | null;
      /** Canonical 'YYYY-MM-DD'. Validated by the caller; see the member PATCH. */
      dateOfBirth?: string;
    },
  ): Promise<OrganizationMember> {
    return db.transaction(async (tx) => {
      const [member] = await tx
        .update(organizationMembers)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(organizationMembers.id, memberId))
        .returning();

      if (updates.studentName !== undefined) {
        const { firstName, lastName } = splitStudentName(updates.studentName);
        await tx
          .update(users)
          .set({ firstName, lastName, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      return member;
    });
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

  async createUserWithCredentials(userData: {
    organizationId: string;
    fullName: string;
    grade?: string;
    username?: string;
    studentId?: string;
    studentName?: string;
    studentGender?: string;
    /**
     * Canonical 'YYYY-MM-DD'.
     *
     * REQUIRED IN PRACTICE, though still optional in this type. It is validated
     * by studentDemographicsSchema below, along with the other three demographic
     * fields, so omitting it throws a ZodError out of this function having
     * written nothing — which the routes turn into a 400. The type stays
     * optional to match studentName/studentGender/grade directly above, which
     * are equally required and equally typed `?`: the guard is the schema, and
     * making these four the only non-optional members of this object would imply
     * TypeScript were enforcing something it is not.
     *
     * A caller that has already validated (admin.routes.ts M1 does, so it can
     * reject before the capacity query and the password hash) passes the
     * normalized string and the schema simply agrees with it. Validating twice is
     * free here and produces the same sentence either way, because both sides
     * defer to validateDateOfBirth.
     */
    dateOfBirth?: string;
    passwordComplexity?: 'medium' | 'strong';
  }): Promise<{
    user: User;
    member: OrganizationMember;
    password: string;
    licenseSource: 'paid' | 'reward';
  }> {
    // Input guard, BEFORE any write and before the password hash. A rejection
    // here throws a ZodError out of this function having touched nothing — the
    // routes map it to a 400 (admin.routes.ts). Validating the member insert
    // object instead would have to happen inside the transaction, since that
    // object needs userId, which is the window this deliberately stays out of.
    //
    // studentName is derived once, here, and reused by the insert below.
    const studentName = userData.studentName?.trim() || userData.fullName.trim();
    studentDemographicsSchema.parse({
      studentName,
      studentGender: userData.studentGender,
      grade: userData.grade,
      dateOfBirth: userData.dateOfBirth,
    });

    // The owning school must have a country and a curriculum. Those two decide
    // which quiz bank the student's assessment draws from, so enrolling into a
    // school that has neither creates an account that cannot complete an
    // assessment — a failure that would otherwise surface much later, to the
    // student rather than the admin.
    //
    // Here rather than per-route for the same reason as the guard above: M1, M2
    // and M3 all funnel through this function, and M1 has no organization row in
    // hand (admin.routes.ts loads one inside getOrganizationAvailableCapacity
    // and discards it), so a per-route guard would cost an extra query and three
    // copies of this rule.
    //
    // Creation of a school WITH both fields is enforced at
    // superadmin.routes.ts (81ea920). This guard is what covers the schools that
    // predate it, plus the Stripe group-purchase path, which creates an
    // organization inside a payment transaction with neither value available and
    // so cannot be constrained at creation time.
    const organization = await this.getOrganizationById(userData.organizationId);
    if (!organization) {
      throw new Error(`Organization ${userData.organizationId} not found`);
    }

    const missingOrgFields = [
      !organization.countryId ? 'country' : null,
      !organization.curriculum ? 'curriculum' : null,
    ].filter((f): f is string => f !== null);

    if (missingOrgFields.length > 0) {
      // Prefixed so the routes can map it to a 400 rather than a 500: a school
      // that needs configuring is a client-fixable problem, not a server fault.
      throw new Error(
        `School setup incomplete: ${organization.name} has no ` +
          `${missingOrgFields.join(' and ')} set. Set ${missingOrgFields.length > 1 ? 'them' : 'it'} ` +
          `in the school's settings before adding students.`,
      );
    }

    const { generatePassword } = await import("./utils/passwordGenerator");
    const { hashPassword } = await import("./utils/passwordHash");

    // Shared with updateStudentMemberProfile: student_name and
    // users.firstName/lastName are two copies of the same name, and they only
    // stay in agreement while every writer splits identically.
    const { firstName, lastName } = splitStudentName(userData.fullName);

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
        // Both inserts in ONE transaction. They previously shared only a try
        // block, so a failure on the member insert left the users row COMMITTED:
        // a real passwordHash and accountType 'org_student' with no membership.
        // The retry loop below only recognises 23505; a CHECK violation is 23514
        // and rethrows, and the bulk route's per-row catch
        // (admin.routes.ts:688-694) swallows that and continues, so one paste
        // could mint up to 500 orphan accounts and still report partial success.
        //
        // The loop stays OUTSIDE the transaction on purpose: each attempt is its
        // own begin/commit, so a rolled-back attempt leaves nothing behind and
        // the next attempt starts clean. drizzle-orm/neon-serverless takes a
        // dedicated connection per transaction and releases it in a finally
        // (neon-serverless/session.js:179-193), so retrying does not leak one.
        const { user, member, licenseSource } = await db.transaction(async (tx) => {
          // LOCK THE SCHOOL ROW FIRST. Everything below reads the roster to
          // decide whether this enrolment is reward- or paid-funded and whether
          // it fits at all, and that decision must not be made on a snapshot two
          // concurrent bulk imports can both see. The capacity check in
          // admin.routes.ts is check-then-act and stays there as a fast 400; THIS
          // is the authoritative one, and it is the one that cannot race.
          const [orgRow] = await tx
            .select()
            .from(organizations)
            .where(eq(organizations.id, userData.organizationId))
            .for('update');

          if (!orgRow) {
            throw new Error(`Organization ${userData.organizationId} not found`);
          }

          // Counted from the roster rather than read from the counters, because
          // the counters are DERIVED from the roster (see
          // recomputeOrganizationLicenseUsage) and the roster is the thing under
          // lock. Reading the columns here would reintroduce the possibility of
          // deciding against a stale number.
          const [enrolled] = await tx
            .select({
              paid: sql<number>`count(*) FILTER (WHERE ${organizationMembers.licenseSource} = 'paid')::int`,
              reward: sql<number>`count(*) FILTER (WHERE ${organizationMembers.licenseSource} = 'reward')::int`,
            })
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, userData.organizationId),
                eq(organizationMembers.role, 'student'),
              ),
            );

          const paidUsed = enrolled?.paid ?? 0;
          const rewardUsed = enrolled?.reward ?? 0;
          const rewardAvailable = Math.max(0, (orgRow.rewardCredits || 0) - rewardUsed);
          const paidAvailable = orgRow.isUnlimitedLicenses
            ? Number.POSITIVE_INFINITY
            : Math.max(0, orgRow.totalLicenses - paidUsed);

          // Reward credits first, unchanged from consumeLicenseWithRewardPriority:
          // a school that earned credits by contributing questions spends those
          // before the seats it paid for.
          const licenseSource: 'paid' | 'reward' = rewardAvailable > 0 ? 'reward' : 'paid';

          if (licenseSource === 'paid' && paidAvailable < 1) {
            // Prefixed to match the sentence the routes already map to a 400
            // (admin.routes.ts:778) rather than a 500 — a full school is a
            // client-fixable state, not a server fault.
            throw new Error(
              `Quota exceeded: ${orgRow.name} has no available capacity. ` +
                `All ${orgRow.totalLicenses} licenses and any reward credits have been used.`,
            );
          }

          const [user] = await tx
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

          const [member] = await tx
            .insert(organizationMembers)
            .values({
              organizationId: userData.organizationId,
              userId: user.id,
              grade: userData.grade,
              studentId: userData.studentId,
              // Derived and validated at the top of this function.
              studentName,
              studentGender: userData.studentGender,
              dateOfBirth: userData.dateOfBirth,
              role: 'student',
              // THE FUND, RECORDED ON THE ROW THAT SPENDS IT, in the same
              // transaction. Previously consumption ran as a separate statement
              // after this function had already committed, and recorded which
              // fund it used nowhere — so removal could only guess, and guessed
              // 'paid' every time.
              licenseSource,
            })
            .returning();

          // Inside the transaction and after the insert: the counters are a
          // projection of the roster, so they are recomputed from the roster that
          // now includes this student. Nothing adds or subtracts.
          await this.recomputeOrganizationLicenseUsage(userData.organizationId, tx);

          return { user, member, licenseSource };
        });

        return { user, member, password, licenseSource };
      } catch (error: any) {
        // Unchanged, deliberately. The rollback path rethrows the ORIGINAL pg
        // error (neon-serverless/session.js:186-189), so error.code still reads
        // 23505 here and the retry behaves exactly as before.
        //
        // KNOWN, NOT FIXED HERE: a 23505 raised by the MEMBER insert (the
        // organization_members.user_id unique constraint, schema.ts:151) also
        // lands in this branch and retries the whole block, inserting another
        // users row. That was already the behaviour; the transaction makes it
        // harmless, because the failed attempt's user row is now rolled back
        // instead of accumulating. Left alone to keep this commit to one change.
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
  async createOrganizationConsent(consent: InsertOrganizationConsent): Promise<OrganizationConsent> {
    const [created] = await db.insert(organizationConsents).values(consent).returning();
    return created;
  }

  /**
   * The current attestation is simply the MOST RECENT row. There is no "current"
   * flag to keep in sync, because the table is append-only: re-attestation
   * inserts, and the older row stays as the record of what covered the students
   * enrolled before it.
   *
   * Filters on both claims being true so a row can never gate enrolment on a
   * partial assertion. The POST route rejects partials outright, so this is
   * defence in depth rather than the only guard — but it is the one that would
   * hold if a row were ever written directly.
   */
  async getCurrentOrganizationConsent(organizationId: string): Promise<OrganizationConsent | undefined> {
    const [consent] = await db
      .select()
      .from(organizationConsents)
      .where(
        and(
          eq(organizationConsents.organizationId, organizationId),
          eq(organizationConsents.consentsToProcessing, true),
          eq(organizationConsents.attestsGuardianConsent, true)
        )
      )
      .orderBy(desc(organizationConsents.createdAt))
      .limit(1);
    return consent;
  }

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
        // careerId is the tie-break, matching getRecommendationsByAssessment
        // (:1137). Score alone is not a total order, and this LIMITs — so an
        // exact tie at the boundary silently picks by heap order, and the route
        // then slices these five to three for the trajectory. Same rows, same
        // order, every load.
        .orderBy(desc(recommendations.overallMatchScore), recommendations.careerId)
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

    // ONE ENTRY PER GRADE, and the contract this method owes its callers.
    //
    // It used to be one entry per ASSESSMENT, which was the same thing only for
    // as long as a student could hold one assessment per grade. Free retakes
    // (261b85f) broke that without touching this file: three Grade 12
    // assessments produced three entries all labelled 'grade12', and every
    // consumer read them as three grades. The trajectory divided by the entry
    // count, so a career picked in all three scored 100% "consistency" across
    // one grade; the response field named totalGrades reported 3; the timeline
    // showed whichever one `find` reached first, which — progression is ordered
    // completedAt ASC — was the OLDEST, while the profile's history marks the
    // newest as current. Two pages, one grade, different answers.
    //
    // Collapsing HERE rather than in each consumer is deliberate: the callers
    // are a student page, an org-admin endpoint and anything added later, and
    // the rule they need is identical. Callers wanting the uncollapsed history
    // have getStudentAssessmentProgression, which still returns every row.
    //
    // NOT A FORMAT PROBLEM. An earlier comment here recorded canonicalization as
    // what "blocks the next-grade re-assessment path (plan L12) until it emits
    // one format" — the format half is done (canonical grade below, migration
    // 013 on the stored rows). What was left is CARDINALITY, and free retakes
    // made same-grade multiplicity reachable without L12 ever landing.
    //
    // Latest-per-grade is the product decision: the Career Journey asks how a
    // student's direction changed as they grew. Three assessments in Grade 12
    // are not a trajectory. Within-grade movement is a different feature and is
    // not smuggled in here. See collapseToLatestPerGrade.
    //
    // The three fields the collapse reads, lifted out explicitly so it is clear
    // what it decides on: which grade a row belongs to, and which row is latest.
    const perGrade = collapseToLatestPerGrade(
      progression.map(entry => ({
        grade: entry.assessment.grade,
        completedAt: entry.assessment.completedAt,
        isCompleted: entry.assessment.isCompleted,
        entry,
      })),
    );

    return perGrade.map(({ grade, record: { entry: { assessment, recommendations, careerNames } } }) => ({
      grade,
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
      // Canonical key, so a member stored as '10' and one stored as 'grade10'
      // are one bucket — the same double-bucketing that produced "Grade 10
      // twice" in the global analytics.
      const grade = toCanonicalGrade(assessment.grade) ?? assessment.grade ?? 'Unknown';
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

    // Recalculate with actual avg scores. Must derive the key exactly as the
    // loop above does, or gradeMap.get() misses and the non-null assertion throws.
    for (const assessment of memberAssessments) {
      const grade = toCanonicalGrade(assessment.grade) ?? assessment.grade ?? 'Unknown';
      const stats = gradeMap.get(grade)!;
      const avgScore = recsMap.get(assessment.id) || 0;
      stats.totalScore += avgScore;
    }

    const gradeStats = Array.from(gradeMap.entries()).map(([grade, stats]) => ({
      grade,
      totalStudents: stats.students.size,
      completedAssessments: stats.assessments,
      avgMatchScore: stats.assessments > 0 ? stats.totalScore / stats.assessments : 0,
    })).sort((a, b) => gradeSortKey(a.grade) - gradeSortKey(b.grade));

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
        // As above: LIMIT 1 on a score-only ordering means a tie at the top is
        // resolved by heap order, so the school could be shown a different "top
        // career" for the same student between loads.
        .orderBy(desc(recommendations.overallMatchScore), recommendations.careerId)
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

  async getLlmNarrativeCacheStats(): Promise<{
    totalCached: number;
    cacheHits: number;
    promptBreakdown: Array<{ promptKey: string; count: number }>;
  }> {
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(llmNarrativeCache);

    const breakdown = await db
      .select({
        promptKey: llmNarrativeCache.promptKey,
        count: sql<number>`count(*)::int`,
      })
      .from(llmNarrativeCache)
      .groupBy(llmNarrativeCache.promptKey)
      .orderBy(sql`count(*) desc`);

    // cacheHits is approximated by row count: each cached row represents
    // at least one saved LLM call (the first request that populated the cache).
    const totalCached = totalRow?.count ?? 0;
    return {
      totalCached,
      cacheHits: totalCached,
      promptBreakdown: breakdown,
    };
  }
}

export const storage = new DatabaseStorage();
