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
  childProfiles,
  licenseConsumptions,
  licenseGrants,
  stripeWebhookEvents,
  schoolSetupTokens,
  invoices,
  type Invoice,
  contributionReviews,
  REVIEW_MAJORITY,
  childGuardianConsents,
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
  type ChildProfile,
  type InsertChildProfile,
  type ChildGuardianConsent,
  type InsertChildGuardianConsent,
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
import { assessmentIsChildOwned } from "@shared/childOwnership";
import { decideGrantMoney } from "@shared/licenseGrants";
import { blockingStatuses, type EmailDeliveryStatus } from "@shared/emailDelivery";
import { invoiceTotals, formatInvoiceNumber, canTransition, grantAmountMajor } from "@shared/invoice";
import { splitStudentName } from "@shared/studentName";
import { SUBJECT_IDS } from "@shared/subjects";
import { eq, ne, and, or, desc, count, avg, sql, inArray, notInArray, isNotNull, isNull, gt, gte, lt, type SQL } from "drizzle-orm";

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
  /**
   * Email is deliberately NOT a field on updateUser or updateUserFields, and
   * this method exists instead of widening either of them.
   *
   * Email is an authentication identity here, not a profile attribute: the
   * local strategy falls back to it when a username does not match
   * (auth.ts:166), password reset delivers to it, and superadmin status is
   * decided by testing it against SUPERADMIN_EMAILS (auth.middleware.ts:7).
   * A field with those three properties must never be settable by a spread
   * that happens to carry an `email` key. Callers have to ask for it by name,
   * and the one caller that does runs the escalation and uniqueness guards
   * first.
   */
  updateUserEmail(userId: string, normalizedEmail: string): Promise<User>;

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
  // Deliberately NARROWER than the above — see the impl for why.
  getOrganizationOwnedByUser(userId: string): Promise<Organization | undefined>;
  updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization>;
  // Replaces updateOrganizationQuota and consumeLicenseWithRewardPriority. The
  // licence counters are SET from the roster, never adjusted — see the impl.
  recomputeOrganizationLicenseUsage(
    organizationId: string,
    tx?: any,
  ): Promise<{ usedLicenses: number; rewardCreditsUsed: number }>;
  // NO deleteOrganization here, deliberately. A school is deleted only by
  // services/organizationDeletion.ts, which refuses while students are enrolled
  // and clears what holds the school open in one transaction. The bare DELETE
  // that used to sit here is what the bulk endpoint called, and it failed for
  // every real school and misreported the rest.

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
  createOrganizationEvent(event: InsertOrganizationEvent, tx?: any): Promise<OrganizationEvent>;
  createOrganizationConsent(consent: InsertOrganizationConsent): Promise<OrganizationConsent>;
  /** Most recent attestation for an organization, or undefined. See shared/schema.ts. */
  getCurrentOrganizationConsent(organizationId: string): Promise<OrganizationConsent | undefined>;

  // Child profile (parent-registers accounts) — see shared/schema.ts.
  getChildProfileByGuardianUserId(userId: string): Promise<ChildProfile | undefined>;
  createChildProfile(profile: InsertChildProfile, tx?: any): Promise<ChildProfile>;
  createChildGuardianConsent(consent: InsertChildGuardianConsent, tx?: any): Promise<ChildGuardianConsent>;
  createParentRegistration(params: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: string;
    child: Omit<InsertChildProfile, "guardianUserId">;
    consent: Omit<InsertChildGuardianConsent, "performedBy">;
  }): Promise<{ user: User; childProfile: ChildProfile; consent: ChildGuardianConsent }>;
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
  claimContributionRecheck(id: string, staleBefore: Date): Promise<ContributionSubmission | undefined>;
  claimApprovedContribution(id: string, cap: { maxYearlyCredits: number; currentYear: number }): Promise<{ creditsMoved: number; alreadyPaid: boolean; capped: number } | { refused: "yearly_cap" } | null>;
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
    completedAssessmentCount: number;
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
    const { generatePassword } = await import("./utils/passwordGenerator");
    const { resolveUsername } = await import("@shared/username");
    const { hashPassword } = await import("./utils/passwordHash");

    // One helper, one definition of the rule. This used to be a hand-rolled
    // loop that answered a collision with a FRESH RANDOM SUFFIX — which is no
    // more unique than numbering and unreadable to the person who has to sign
    // in with it.
    const username = await resolveUsername(
      userData.firstName,
      userData.lastName,
      async (candidate) => !!(await this.getUserByUsername(candidate)),
    );
    
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

  async updateUserEmail(userId: string, normalizedEmail: string): Promise<User> {
    // Takes the email ALREADY normalized. Normalizing here instead would hide
    // the fact that the caller's uniqueness and superadmin-escalation checks
    // have to run against the same normalized form this row ends up storing —
    // if the two ever diverged, a check could pass on one spelling while the
    // row was written with another.
    const [user] = await db
      .update(users)
      .set({ email: normalizedEmail, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
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

  /**
   * Give a curriculum the six subject rows that make it usable.
   *
   * WHY THIS IS NOT AN LLM JOB, which is the counter-intuitive part. A country
   * can be researched and populated by the model -- its vision, priority
   * sectors, national goals, curricula and sector map all come back from a
   * prompt -- so it reads as though subjects should too. They must not.
   *
   * The student-facing subject vocabulary is SIX FIXED SUBJECTS, hard-coded in
   * shared/subjects.ts and depended on by the assessment's subject tiles, the
   * admin question form, the quiz pool lookup, the report pages, the Arabic
   * prose templates, and -- decisively -- career matching, whose umbrella map
   * in server/utils/subjectMap.ts is not country-aware at all. A student in
   * every country picks from the same six tiles.
   *
   * So a model inventing a seventh subject for a curriculum would produce a
   * row that no career can ever project onto. Every career would return the
   * flat non-match score for any student who picked it, and nothing would
   * report an error: the submission succeeds, the row is real, and only the
   * intersection is empty. That is the same shape as the contributed-question
   * vocabulary defect already pinned in contribution.subjectVocabulary.test.ts.
   *
   * What genuinely varies between curricula is the NAMING, and that is what
   * aliases are for: a curriculum that teaches "Islamic Studies" gets it as an
   * alias of Social Studies -- which is exactly how the UAE seed treats it --
   * never as a row of its own.
   *
   * ALIASES COME FROM THE UMBRELLA MAP, inverted, rather than being retyped
   * here. DEFAULT_SUBJECT_MAP already states which local names belong to which
   * umbrella subject, and it is the map career matching itself uses, so
   * deriving the aliases from it is what keeps the alias resolution and the
   * matching projection from drifting apart. Hand-copied lists are how they
   * drift.
   *
   * Idempotent: the unique index on (country, curriculum, code) means calling
   * this again adds nothing, so it is safe on every country create, on every
   * repopulate, and whenever a curriculum is added.
   */
  async ensureCurriculumSubjects(
    countryId: string,
    curriculum: string,
  ): Promise<{ created: number; alreadyPresent: number }> {
    // umbrella subject -> the local names that mean it
    const aliasesFor: Record<string, string[]> = {};
    for (const [variant, umbrella] of Object.entries(DEFAULT_SUBJECT_MAP)) {
      if (variant === umbrella) continue;
      (aliasesFor[umbrella] ??= []).push(variant);
    }

    const existing = await db
      .select({ name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.countryId, countryId), eq(subjects.curriculum, curriculum)));
    const had = existing.length;

    /**
     * SKIP BY NAME, not only by the unique index.
     *
     * The index is on (country, curriculum, code), so an existing row called
     * "Mathematics" under a hand-written code would not conflict with this
     * one's "mathematics" -- the insert would succeed and the curriculum would
     * then hold two subjects with the SAME NAME. Since the name is the
     * vocabulary everything else matches on (the assessment stores it, the
     * quiz pool compares it, the alias map resolves to it), a duplicate name
     * is worse than a missing row: the alias map would collapse both to one
     * canonical and which row a student's pick resolved to would depend on
     * ordering.
     *
     * So an already-curated curriculum is left as it is and only the genuinely
     * missing umbrella subjects are added. Readiness still reports the result.
     */
    const present = new Set(existing.map((s) => s.name.toLowerCase()));

    /**
     * AN ALIAS MUST NOT SHADOW A SUBJECT THAT ALREADY EXISTS BY NAME.
     *
     * The umbrella map lists "Biology" as a variant of Science and "Economics"
     * as one of Social Studies. If a curriculum already carries a subject
     * actually NAMED "Biology", seeding Science with that alias puts two
     * entries for "biology" into the alias map -- one from the Biology row's
     * own name, one from Science's alias list -- and buildSubjectAliasMap
     * keeps whichever it writes last. A student picking Biology would then
     * resolve to Science, and the question pool for Biology would come back
     * empty with nothing reporting an error.
     *
     * This is not hypothetical: it is what happened the first time this
     * seeding ran. A country with a hand-curated Biology subject stopped
     * drawing its own Biology questions, and only a test that counted whose
     * questions ended up in the quiz noticed.
     *
     * So a curator's subject wins. The umbrella row is still created -- the
     * six must exist -- but it gives up the alias that would have swallowed
     * an existing name.
     */
    const rows = SUBJECT_IDS.map((name, i) => ({
      name,
      // Same slug form the UAE seed uses, so a country added through this path
      // and one added by the seed are indistinguishable.
      code: name.toLowerCase().replace(/\s+/g, "_"),
      countryId,
      curriculum,
      aliases: (aliasesFor[name] ?? []).filter((a) => !present.has(a.toLowerCase())),
      displayOrder: i + 1,
      isActive: true,
    })).filter((r) => !present.has(r.name.toLowerCase()));

    if (rows.length > 0) {
      await db.insert(subjects).values(rows).onConflictDoNothing();
    }

    const after = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(subjects)
      .where(and(eq(subjects.countryId, countryId), eq(subjects.curriculum, curriculum)));
    const now = after[0]?.n ?? 0;

    return { created: now - had, alreadyPresent: had };
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
    // THE CHOKE POINT. Every write to quiz_questions.subject passes through here
    // or through updateQuizQuestion below — the four raw db.update(quizQuestions)
    // callers elsewhere (the curriculum rename at :1048, superadmin's
    // contributedByOrgId and questionAr writes, the two Arabic-content
    // migrations) all set other columns. Enforcing the vocabulary here is what
    // makes six writers agree by construction instead of by six guards that have
    // to be kept in step, which is exactly what they were not.
    const subject = await this.resolveSubjectName(
      questionData.countryId,
      questionData.curriculum,
      questionData.subject,
    );
    const permuted = permuteOptionsForStorage(questionData.options, questionData.optionsAr);
    const values: InsertQuizQuestion = { ...questionData, subject, options: permuted.options as any };
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
    // A PARTIAL UPDATE CAN BREAK THE INVARIANT WITHOUT NAMING THE FIELD. Sending
    // only `curriculum` moves the row into a different catalogue, under which its
    // untouched subject may resolve to nothing — the same defect one field along.
    // So the scope is read from the existing row whenever the payload changes
    // scope without restating the subject.
    const touchesSubject = data.subject !== undefined;
    const touchesScope = data.countryId !== undefined || data.curriculum !== undefined;

    let values = data;
    if (touchesSubject || touchesScope) {
      const [existing] = touchesSubject && !touchesScope
        ? [undefined]
        : await db.select().from(quizQuestions).where(eq(quizQuestions.id, id));
      if (touchesScope && !existing) return undefined; // 404, decided below by the caller

      const countryId = data.countryId !== undefined ? data.countryId : existing?.countryId;
      const curriculum = data.curriculum !== undefined ? data.curriculum : existing?.curriculum;
      const input = touchesSubject ? data.subject : existing?.subject;

      values = { ...data, subject: await this.resolveSubjectName(countryId, curriculum, input) };
    }

    const [question] = await db
      .update(quizQuestions)
      .set(values)
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
    /**
     * WHAT WAS ACTUALLY CHARGED. Previously assumed to be USD, which stopped
     * being true the moment a country could set its own price — the ledger
     * would have recorded dirhams as dollars and overstated revenue roughly
     * fourfold.
     */
    currency?: string;
    /**
     * The country the buyer chose at checkout, which decided the price.
     *
     * Also the country the school is created with. Before this, the Stripe
     * path made an organization with no country at all, so the setup gate
     * blocked its enrolment until somebody noticed — and a school that paid in
     * dirhams and then had its country set to somewhere else would have left
     * the price it paid unexplainable.
     */
    countryId?: string | null;
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
          amountPaid,
          /**
           * The country the buyer chose, which is also the country whose price
           * they just paid. Carried onto the school so the two cannot drift
           * apart, and so this path stops creating schools with no country at
           * all — which the setup gate then blocked until somebody noticed.
           *
           * Still nullable: an older client that sends no country must not
           * roll back a payment Stripe has taken.
           */
          countryId: params.countryId ?? null,
        })
        .returning();

      /**
       * THE GRANT ROW, in this same transaction.
       *
       * Recorded here rather than by the caller so it cannot be written while
       * the purchase rolls back. The three payment columns above are kept as
       * they were -- they are what the old code reads -- but they hold one
       * payment for ever, which is why this row exists.
       *
       * The unique Stripe id makes a webhook redelivery a no-op; a redelivery
       * that got this far would already have failed on the "user already has
       * an organization" check above, and this is the second guard.
       */
      /**
       * NEVER LET THIS FAIL THE PURCHASE.
       *
       * recordLicenseGrant refuses a purchase without an amount, and the check
       * constraint refuses it at the database. Either would throw INSIDE this
       * transaction and roll back a payment Stripe has already taken -- the
       * same hazard that keeps country and curriculum nullable on this path.
       * A try/catch is not enough: in Postgres a failed statement aborts the
       * surrounding transaction regardless.
       *
       * So the amount decides the kind BEFORE the insert, in one shared pure
       * function with its own tests (shared/licenseGrants.ts). An amount that
       * is not a finite number — a Stripe payload without `amount` makes this
       * NaN — is recorded as a grant with no money and a note saying so,
       * rather than as a purchase that cannot be written. An unexplained
       * licence count is recoverable from Stripe; a lost sale is not.
       */
      // The charged currency, not an assumption about it.
      const money = decideGrantMoney(amountPaid, params.currency ?? "USD");

      await this.recordLicenseGrant({
        organizationId: organization.id,
        kind: money.kind,
        licensesDelta: studentCount,
        amountPaid: money.amountPaid,
        // The currency actually charged, passed in by the caller that created
        // the PaymentIntent. Assuming USD here would have recorded a dirham
        // sale as a dollar one and overstated revenue roughly fourfold.
        currency: money.currency,
        // Kept on the row either way: it is the link back to Stripe, and it is
        // what makes a webhook redelivery a no-op.
        stripePaymentId: paymentIntentId,
        note: money.kind === "purchase"
          ? "Group purchase through Stripe"
          : `Group purchase through Stripe ${paymentIntentId}, but the amount was missing or unreadable — NOT counted as revenue. Reconcile against Stripe.`,
      }, tx);

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

  /**
   * The organization this user administers, whether they are its primary
   * admin or one added later.
   *
   * Every admin-scoped route resolves the caller's school through here, and
   * this used to match only organizations.adminUserId -- a single column, so
   * a single user. But a school can have more than one admin: the add-admin
   * endpoint (superadmin.routes.ts) writes an organization_members row with
   * role "admin" and isPrimaryAdmin false and never touches that column. The
   * result was an account that was created successfully, could log in, and
   * then got 404 from /api/my-organization and 403 from everything else --
   * a feature that produced a dead account.
   *
   * Fixed here rather than at the 27 call sites, and by reading membership
   * rather than by writing adminUserId: overwriting that column would
   * silently demote the primary admin, who is the one the delete guard in
   * superadmin.routes.ts protects.
   *
   * THE ROLE CHECK IS LOAD-BEARING. organization_members holds students in
   * the same table, so matching a membership without eq(role, "admin") would
   * hand every student their school's full admin surface. The primary-admin
   * column is tried first so existing behaviour is unchanged for them.
   */
  /**
   * The organization this user OWNS, matching organizations.admin_user_id and
   * nothing else.
   *
   * NOT a duplicate of getOrganizationByAdminUserId, and the difference is the
   * point. That one also matches an "admin" membership row, because 27
   * admin-scoped routes need a secondary admin to resolve their school. This
   * one exists to answer one narrower question: would
   * createGroupPurchaseTransaction refuse this user? That transaction checks
   * admin_user_id ALONE, so this must too.
   *
   * Using the broader method here would refuse a group purchase the
   * transaction would in fact allow — a secondary admin of some school, whose
   * card we would decline for a reason that does not apply to them. Whether a
   * secondary admin SHOULD be able to buy a second school is a real question
   * and not one this method decides; it is flagged for review rather than
   * settled here.
   */
  async getOrganizationOwnedByUser(userId: string): Promise<Organization | undefined> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.adminUserId, userId));
    return organization;
  }

  async getOrganizationByAdminUserId(adminUserId: string): Promise<Organization | undefined> {
    const [byPrimaryColumn] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.adminUserId, adminUserId));
    if (byPrimaryColumn) return byPrimaryColumn;

    const [adminMembership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, adminUserId),
          eq(organizationMembers.role, "admin"),
        ),
      );
    if (!adminMembership) return undefined;

    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, adminMembership.organizationId));
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
   * WHAT IS COUNTED CHANGED; THE "SET FROM A COUNT" PROPERTY DID NOT.
   * This used to count ENROLMENTS — student rows on the roster, split by
   * organization_members.license_source. A licence was therefore spent the
   * moment a student was added, whether or not they ever finished, and the
   * school could never buy a second year for them.
   *
   * It now counts SPENT LICENCES: rows in license_consumptions, written when a
   * report is generated. Enrolling is free, abandoning is free, and a student
   * who leaves returns their unspent licence to the pool automatically, because
   * the licence was never attached to them in the first place.
   *
   * The reason this function exists is unchanged and still load-bearing: a
   * counter SET from a COUNT cannot drift, so there is still no path anywhere
   * that adds to or subtracts from these two columns.
   */
  /**
   * RECORD A CHANGE TO A SCHOOL'S ENTITLEMENT. One row, every time.
   *
   * Takes `tx` so the row lands in the SAME transaction as the entitlement
   * change that earned it. A grant recorded outside that transaction can be
   * written while the change it describes rolls back, which is worse than not
   * recording it: the ledger would then disagree with total_licenses and the
   * reconciliation report would blame a school that is fine.
   *
   * RETURNS null ON A DUPLICATE STRIPE PAYMENT rather than throwing. Stripe
   * redelivers webhooks, and a redelivery is a normal event, not an error --
   * the partial unique index refuses the second row and the caller carries on.
   * The pg code is matched, not the message: drizzle wraps the error, so
   * message matching silently never fires. The duplicate-vote check in
   * recordContributionReview learned this the same way.
   */
  /**
   * CLAIM A STRIPE DELIVERY. Returns true if THIS call claimed it, false if it
   * was already claimed by an earlier delivery.
   *
   * The whole guarantee is in `ON CONFLICT DO NOTHING ... RETURNING`: the
   * insert either creates the row or does not, decided by the primary key
   * inside one statement. A read-then-insert would let two concurrent retries
   * both see "absent" and both proceed — the check-then-act trap this codebase
   * has produced before, here with money attached.
   *
   * RETURNING is what makes the outcome legible. Without it the caller cannot
   * tell "inserted" from "conflicted", and `rowCount` across drivers is not
   * something to stake a double-charge on.
   */
  /**
   * THE FIRST-SIGN-IN LINK for an account whose password nobody chose.
   *
   * IDEMPOTENT BY DESIGN: a buyer gets ONE live token, not one per code path.
   * Both /api/checkout/complete and the Stripe webhook act on the same
   * payment, and on a raced purchase both reach this — minting a second token
   * would mail the buyer two links, invalidate neither, and make `sentCount`
   * meaningless. So an unused, unexpired token is RETURNED rather than
   * replaced, and the caller decides whether to send it again.
   *
   * Returns `{ token, created }`: `created` false means a live token already
   * existed, which is how the caller avoids sending a second mail for one
   * purchase.
   */
  async issueSchoolSetupToken(
    userId: string,
    organizationId: string | null,
    ttlDays = 7,
  ): Promise<{ token: string; created: boolean }> {
    const [live] = await db
      .select({ token: schoolSetupTokens.token })
      .from(schoolSetupTokens)
      .where(and(
        eq(schoolSetupTokens.userId, userId),
        isNull(schoolSetupTokens.usedAt),
        gt(schoolSetupTokens.expiresAt, new Date()),
      ))
      .limit(1);
    if (live) return { token: live.token, created: false };

    // Local import, matching generateShareToken below: the bare `crypto` in
    // this file's scope is the Web Crypto global, which has no randomBytes.
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await db.insert(schoolSetupTokens).values({ userId, organizationId, token, expiresAt });
    return { token, created: true };
  }

  /**
   * Records that the mail went to Resend. NOT that it arrived — whether it did
   * is written later, by the webhook, through recordSetupEmailDelivery below.
   *
   * `providerMessageId` is what joins the two. A resend OVERWRITES it and
   * clears the delivery columns: the status describes the message currently in
   * flight, and leaving a previous bounce in place would have the superadmin
   * surface report the old attempt's failure against the new attempt.
   */
  async markSchoolSetupTokenSent(token: string, providerMessageId?: string | null): Promise<void> {
    await db
      .update(schoolSetupTokens)
      .set({
        sentAt: new Date(),
        sentCount: sql`${schoolSetupTokens.sentCount} + 1`,
        providerMessageId: providerMessageId ?? null,
        deliveryStatus: null,
        deliveryStatusAt: null,
        deliveryDetail: null,
      })
      .where(eq(schoolSetupTokens.token, token));
  }

  /**
   * Applies one Resend delivery event, and returns whether it changed anything.
   *
   * ONE STATEMENT, deliberately. The rule "an event may only move a row
   * forward" needs the stored value to decide, and reading it first would
   * decide from a snapshot taken outside the write — the check-then-act family
   * that produced the checkout create race and that consumeLicense documents.
   * `blockingStatuses` turns the rule into a WHERE clause instead, so the
   * database arbitrates between two events arriving at once.
   *
   * Returns false for an unknown message id as well as for a stale event. The
   * caller answers 200 either way: an id we do not hold is another mail
   * entirely (a password reset), and a non-2xx has Svix retry for ever.
   */
  async recordSetupEmailDelivery(args: {
    providerMessageId: string;
    status: EmailDeliveryStatus;
    at: Date;
    detail?: string | null;
  }): Promise<boolean> {
    const blocked = blockingStatuses(args.status);
    const moved = await db
      .update(schoolSetupTokens)
      .set({
        deliveryStatus: args.status,
        deliveryStatusAt: args.at,
        deliveryDetail: args.detail ?? null,
      })
      .where(and(
        eq(schoolSetupTokens.providerMessageId, args.providerMessageId),
        // NULL must pass: a column with no event yet is not "not in the list",
        // because NOT IN against NULL is NULL and would exclude the row.
        or(
          isNull(schoolSetupTokens.deliveryStatus),
          notInArray(schoolSetupTokens.deliveryStatus, blocked),
        ),
      ))
      .returning({ id: schoolSetupTokens.id });
    return moved.length > 0;
  }

  /**
   * The token's bearer, if the token is live. Unused AND unexpired both
   * checked HERE rather than by the caller, so no route can forget one.
   */
  async getLiveSchoolSetupToken(token: string) {
    const [row] = await db
      .select()
      .from(schoolSetupTokens)
      .where(and(
        eq(schoolSetupTokens.token, token),
        isNull(schoolSetupTokens.usedAt),
        gt(schoolSetupTokens.expiresAt, new Date()),
      ))
      .limit(1);
    return row ?? null;
  }

  /**
   * Spends the token. The WHERE repeats `usedAt IS NULL` so a replay cannot
   * win: two requests carrying the same link produce one update, and the
   * second gets zero rows back rather than a second session.
   */
  async consumeSchoolSetupToken(token: string): Promise<boolean> {
    const spent = await db
      .update(schoolSetupTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(schoolSetupTokens.token, token), isNull(schoolSetupTokens.usedAt)))
      .returning({ id: schoolSetupTokens.id });
    return spent.length > 0;
  }

  /** The newest setup token for a school, for the superadmin setup column. */
  async getSchoolSetupTokenForOrganization(organizationId: string) {
    const [row] = await db
      .select()
      .from(schoolSetupTokens)
      .where(eq(schoolSetupTokens.organizationId, organizationId))
      .orderBy(desc(schoolSetupTokens.createdAt))
      .limit(1);
    return row ?? null;
  }

  // ===========================================================================
  // INVOICES
  // ===========================================================================

  /**
   * Raises a draft invoice, allocating the next number for the year.
   *
   * THE SEQUENCE IS ALLOCATED BY INSERTING AND ACCEPTING THE INDEX'S VERDICT,
   * not by reading a maximum and trusting it. `SELECT MAX(sequence) + 1` is
   * check-then-act: two requests a millisecond apart read the same maximum and
   * one of them produces a duplicate invoice number, which is the single
   * defect a finance department cannot work around. The unique constraint on
   * (year, sequence) is the real arbiter, so a collision is RETRIED rather
   * than prevented — the same shape as grantIndividualPremium accepting
   * `users_email_unique`'s verdict instead of checking first.
   *
   * Bounded at five attempts. An unbounded retry against a genuinely broken
   * constraint would spin; five covers any realistic contention on a route
   * only superadmins can reach.
   */
  async createInvoice(params: {
    organizationId: string | null;
    billToName: string;
    billToEmail?: string | null;
    billToAddress?: string | null;
    studentCount: number;
    unitPriceMinor?: number;
    currency?: string;
    vatRateBp?: number;
    supplierTrn?: string | null;
    dueAt?: Date | null;
    notes?: string | null;
    /** The school's own PO reference, printed on the document (migration 039). */
    purchaseOrderRef?: string | null;
    createdBy?: string | null;
  }): Promise<Invoice> {
    const totals = invoiceTotals({
      studentCount: params.studentCount,
      unitPriceMinor: params.unitPriceMinor,
      currency: params.currency,
      vatRateBp: params.vatRateBp,
    });
    const year = new Date().getUTCFullYear();

    let lastError: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const [{ next }] = await db
        .select({ next: sql<number>`COALESCE(MAX(${invoices.sequence}), 0) + 1` })
        .from(invoices)
        .where(eq(invoices.year, year));
      const sequence = Number(next);
      try {
        const [row] = await db
          .insert(invoices)
          .values({
            number: formatInvoiceNumber(year, sequence),
            year,
            sequence,
            organizationId: params.organizationId,
            billToName: params.billToName,
            billToEmail: params.billToEmail ?? null,
            billToAddress: params.billToAddress ?? null,
            studentCount: totals.studentCount,
            unitPriceMinor: totals.unitPriceMinor,
            perStudentMinor: totals.perStudentMinor,
            discountPercent: totals.discountPercent,
            subtotalMinor: totals.subtotalMinor,
            vatRateBp: totals.vatRateBp,
            vatMinor: totals.vatMinor,
            totalMinor: totals.totalMinor,
            currency: totals.currency,
            supplierTrn: params.supplierTrn ?? null,
            status: "draft",
            dueAt: params.dueAt ?? null,
            notes: params.notes ?? null,
            purchaseOrderRef: params.purchaseOrderRef ?? null,
            createdBy: params.createdBy ?? null,
          })
          .returning();
        return row;
      } catch (e: any) {
        // 23505 on (year, sequence) means someone took this number between
        // the read and the write. Anything else is a real failure.
        const code = e?.code ?? e?.cause?.code;
        if (code !== "23505") throw e;
        lastError = e;
      }
    }
    throw lastError ?? new Error("Could not allocate an invoice number");
  }

  async getInvoiceById(id: string): Promise<Invoice | null> {
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return row ?? null;
  }

  async listInvoices(
    filters: { organizationId?: string; status?: string; statuses?: string[] } = {},
  ): Promise<Invoice[]> {
    const conds = [];
    if (filters.organizationId) conds.push(eq(invoices.organizationId, filters.organizationId));
    if (filters.status) conds.push(eq(invoices.status, filters.status));
    /**
     * `statuses` is what the SCHOOL-FACING listing uses, to exclude drafts.
     * An empty array would be a WHERE that matches nothing, and drizzle's
     * inArray with one is a runtime error rather than an empty result — so a
     * caller that computed an empty list gets every row, which is the wrong
     * direction. Refused explicitly instead.
     */
    if (filters.statuses) {
      if (filters.statuses.length === 0) {
        throw new Error("listInvoices: an empty `statuses` filter is never what the caller meant");
      }
      conds.push(inArray(invoices.status, filters.statuses));
    }
    const q = db.select().from(invoices);
    const rows = conds.length ? await q.where(and(...conds)) : await q;
    // Newest first, and by SEQUENCE rather than createdAt: two invoices raised
    // in the same second must still read in the order they were numbered.
    return rows.sort((a, b) => (b.year - a.year) || (b.sequence - a.sequence));
  }

  /**
   * Moves an invoice between the states shared/invoice.ts permits, for every
   * transition EXCEPT payment — which is markInvoicePaid below, because it
   * also changes what a school is entitled to.
   *
   * THE CURRENT STATUS IS IN THE WHERE CLAUSE, not read first. A status read
   * and then written is check-then-act, and this route is reachable by a
   * double-click: two requests would both see `issued`, both pass
   * canTransition, and both write. Letting the UPDATE decide means the second
   * one changes zero rows and is told so.
   */
  async setInvoiceStatus(
    id: string,
    from: string,
    to: "issued" | "cancelled",
    extra: { issuedAt?: Date | null } = {},
  ): Promise<Invoice | null> {
    if (!canTransition(from, to)) return null;
    const [row] = await db
      .update(invoices)
      .set({
        status: to,
        // A CHECK constraint refuses an issued invoice with no issued_at, so
        // this is not merely tidy — omitting it aborts the statement.
        ...(to === "issued" ? { issuedAt: extra.issuedAt ?? new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, id), eq(invoices.status, from)))
      .returning();
    return row ?? null;
  }

  /**
   * SETTLES AN INVOICE AND GRANTS THE LICENCES, in one transaction.
   *
   * This is the only place the two meet, and it is deliberately not two
   * routes. A school that has paid and holds no licences, or holds licences
   * against an invoice still showing unpaid, are both states somebody has to
   * untangle by hand — and the second one is invisible to every report.
   *
   * THE INVOICE IS CLAIMED BY THE UPDATE'S OWN WHERE CLAUSE, before the grant
   * is written. `WHERE id = ? AND status = 'issued'` returning zero rows means
   * another request already settled it, and the transaction is abandoned
   * having granted nothing. Reading the status first and deciding would leave
   * the window that lets a double-click grant twice — the check-then-act
   * family that produced the checkout create race.
   *
   * EVERYTHING READS ON `tx`. A balance read on the pooled handle and written
   * inside a transaction decides from a snapshot taken outside it, and takes a
   * second connection while one is held. storage.consumeLicense documents the
   * same rule.
   *
   * The grant records the SUBTOTAL, not the total: VAT is collected for the
   * tax authority and is not revenue, so booking it as licence revenue would
   * overstate every figure reconciliation produces.
   */
  async markInvoicePaid(params: {
    id: string;
    paymentReference?: string | null;
    paidAt?: Date | null;
    performedBy?: string | null;
  }): Promise<
    | { ok: true; invoice: Invoice }
    | { ok: false; reason: "not_found" | "wrong_status" | "no_organization" | "unlimited" }
  > {
    return await db.transaction(async (tx: any) => {
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, params.id)).limit(1);
      if (!invoice) return { ok: false as const, reason: "not_found" as const };
      if (!canTransition(invoice.status, "paid")) {
        return { ok: false as const, reason: "wrong_status" as const };
      }
      // An invoice raised against no school has nowhere to put the licences.
      // Refused rather than marked paid: a settled invoice that granted
      // nothing is the invisible half of the problem this method exists for.
      if (!invoice.organizationId) {
        return { ok: false as const, reason: "no_organization" as const };
      }

      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, invoice.organizationId))
        .limit(1);
      if (!org) return { ok: false as const, reason: "no_organization" as const };
      // An unlimited school's total is a number with no meaning, and adding to
      // it would make reconciliation report a difference that is not real.
      if (org.isUnlimitedLicenses) return { ok: false as const, reason: "unlimited" as const };

      // THE CLAIM. Zero rows means someone else settled it first.
      const [claimed] = await tx
        .update(invoices)
        .set({
          status: "paid",
          paidAt: params.paidAt ?? new Date(),
          paymentReference: params.paymentReference ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, params.id), eq(invoices.status, invoice.status)))
        .returning();
      if (!claimed) return { ok: false as const, reason: "wrong_status" as const };

      const grant = await this.recordLicenseGrant({
        organizationId: invoice.organizationId,
        kind: "purchase",
        licensesDelta: invoice.studentCount,
        amountPaid: grantAmountMajor(invoice.subtotalMinor, invoice.currency),
        currency: invoice.currency,
        performedBy: params.performedBy ?? null,
        note: `Invoice ${invoice.number}${params.paymentReference ? ` (ref ${params.paymentReference})` : ""}`,
      }, tx);

      await tx
        .update(organizations)
        .set({
          totalLicenses: (org.totalLicenses ?? 0) + invoice.studentCount,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, invoice.organizationId));

      const [final] = await tx
        .update(invoices)
        .set({ licenseGrantId: grant?.id ?? null })
        .where(eq(invoices.id, params.id))
        .returning();

      return { ok: true as const, invoice: final ?? claimed };
    });
  }

  /**
   * Records that the invoice was emailed, and to which provider message.
   *
   * SAME SHAPE AS markSchoolSetupTokenSent, for the same reason: a resend
   * OVERWRITES the message id and CLEARS the delivery columns. The status
   * describes the message currently in flight, so leaving the previous
   * attempt's bounce in place would have the superadmin surface report an old
   * failure against a new mail and send someone chasing a problem that has
   * already been dealt with.
   *
   * `emailSentCount` increments in SQL rather than from a read: two sends
   * racing would otherwise both write 1.
   */
  async markInvoiceEmailed(id: string, providerMessageId?: string | null): Promise<void> {
    await db
      .update(invoices)
      .set({
        emailSentAt: new Date(),
        emailSentCount: sql`${invoices.emailSentCount} + 1`,
        providerMessageId: providerMessageId ?? null,
        deliveryStatus: null,
        deliveryStatusAt: null,
        deliveryDetail: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id));
  }

  /**
   * Applies one Resend delivery event to an INVOICE.
   *
   * Identical rule and identical single-statement shape as
   * recordSetupEmailDelivery — the forward-only WHERE clause, not a read
   * before the write — because `email.sent` and `email.delivered` travel
   * separately and either order is ordinary. Two tables rather than one
   * because an invoice and a setup link are different things with different
   * lifecycles; the RULE is shared in shared/emailDelivery.ts, which is the
   * part that must not drift.
   */
  async recordInvoiceEmailDelivery(args: {
    providerMessageId: string;
    status: EmailDeliveryStatus;
    at: Date;
    detail?: string | null;
  }): Promise<boolean> {
    const blocked = blockingStatuses(args.status);
    const moved = await db
      .update(invoices)
      .set({
        deliveryStatus: args.status,
        deliveryStatusAt: args.at,
        deliveryDetail: args.detail ?? null,
      })
      .where(and(
        eq(invoices.providerMessageId, args.providerMessageId),
        or(
          isNull(invoices.deliveryStatus),
          notInArray(invoices.deliveryStatus, blocked),
        ),
      ))
      .returning({ id: invoices.id });
    return moved.length > 0;
  }

  async claimStripeWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
    const claimed = await db
      .insert(stripeWebhookEvents)
      .values({ eventId, eventType })
      .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
      .returning({ eventId: stripeWebhookEvents.eventId });

    return claimed.length > 0;
  }

  /** Stamp a claim as finished. Called only after the handler succeeded. */
  async markStripeWebhookEventProcessed(eventId: string): Promise<void> {
    await db
      .update(stripeWebhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(stripeWebhookEvents.eventId, eventId));
  }

  /**
   * Give the claim back after a failed handler, so Stripe's retry can run.
   *
   * Keeping it would mean the retry is skipped and a paid grant is lost for
   * ever. Releasing it risks a retry re-running a handler that partly
   * succeeded — which the inner guards already cover: the unique assessment id
   * on the consumption ledger, the unique Stripe payment id on the grants
   * ledger, and already_premium. An unexplained licence count is recoverable
   * from Stripe; a lost sale is not.
   */
  async releaseStripeWebhookEventClaim(eventId: string): Promise<void> {
    await db.delete(stripeWebhookEvents).where(eq(stripeWebhookEvents.eventId, eventId));
  }

  async recordLicenseGrant(
    params: {
      organizationId: string;
      kind: "purchase" | "comp" | "adjustment";
      licensesDelta: number;
      amountPaid?: number | null;
      currency?: string | null;
      stripePaymentId?: string | null;
      performedBy?: string | null;
      note?: string | null;
    },
    // Defaults to the pooled handle, like recomputeOrganizationLicenseUsage.
    // Callers inside a transaction MUST pass their tx — see above.
    tx: any = db,
  ): Promise<{ id: string } | null> {
    // The check constraint refuses money on anything but a purchase, and
    // refuses a purchase without it. Normalising here means a caller that
    // passes an amount with the wrong kind gets a clear refusal rather than a
    // constraint violation from three layers down.
    const isPurchase = params.kind === "purchase";
    if (isPurchase && (params.amountPaid == null || !params.currency)) {
      throw new Error("A purchase grant must carry both an amount and a currency");
    }

    try {
      const [row] = await tx
        .insert(licenseGrants)
        .values({
          organizationId: params.organizationId,
          kind: params.kind,
          licensesDelta: params.licensesDelta,
          amountPaid: isPurchase ? params.amountPaid : null,
          currency: isPurchase ? params.currency : null,
          stripePaymentId: params.stripePaymentId ?? null,
          performedBy: params.performedBy ?? null,
          note: params.note ?? null,
        })
        .returning({ id: licenseGrants.id });
      return row ?? null;
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? e?.originalError?.code;
      if (code === "23505" && params.stripePaymentId) {
        console.log(
          `[Licences] Stripe payment ${params.stripePaymentId} already recorded; ignoring redelivery.`,
        );
        return null;
      }
      throw e;
    }
  }

  /**
   * SCHOOLS WHOSE LEDGER DISAGREES WITH THEIR LICENCE TOTAL.
   *
   * The whole reason the grants ledger is worth having while total_licenses
   * remains authoritative. A school appears here when some code path changed
   * its entitlement without recording a row -- the accepted-at-creation,
   * visible-nowhere family, which in this codebase is found by making the
   * invisible state reportable rather than by hoping to notice it.
   *
   * UNLIMITED SCHOOLS ARE EXCLUDED. Their total_licenses is a number with no
   * meaning, so comparing it to anything produces a mismatch that is not one.
   */
  async getLicenseGrantReconciliation(): Promise<Array<{
    organizationId: string;
    name: string;
    countryId: string | null;
    totalLicenses: number;
    ledgerTotal: number;
    difference: number;
  }>> {
    const rows = await db
      .select({
        organizationId: organizations.id,
        name: organizations.name,
        countryId: organizations.countryId,
        totalLicenses: organizations.totalLicenses,
        ledgerTotal: sql<number>`COALESCE(SUM(${licenseGrants.licensesDelta}), 0)::int`,
      })
      .from(organizations)
      .leftJoin(licenseGrants, eq(licenseGrants.organizationId, organizations.id))
      .where(eq(organizations.isUnlimitedLicenses, false))
      .groupBy(organizations.id, organizations.name, organizations.countryId, organizations.totalLicenses)
      .having(sql`COALESCE(SUM(${licenseGrants.licensesDelta}), 0) <> ${organizations.totalLicenses}`);

    return rows.map((r: any) => ({
      ...r,
      ledgerTotal: Number(r.ledgerTotal),
      difference: Number(r.ledgerTotal) - Number(r.totalLicenses),
    }));
  }

  /**
   * PAID VERSUS CONSUMED, per school and per country.
   *
   * Reads both ledgers: license_grants for what a school was given and what
   * was paid, license_consumptions for what it has spent. Neither number comes
   * from a counter that could have drifted.
   *
   * THREE PLAIN AGGREGATES, MERGED IN CODE. Not one clever query, for two
   * separate reasons, both of which produced a wrong number here first:
   *
   * 1. JOINING organizations to both ledgers at once MULTIPLIES rows. A school
   *    with 3 grants and 40 consumptions becomes 120 rows and reports 120 of
   *    each.
   * 2. CORRELATED SUBQUERIES looked like the fix and were worse. Drizzle
   *    renders an embedded outer column UNQUALIFIED inside a sql`` subquery:
   *    `WHERE g.organization_id = ${organizations.id}` emits
   *    `WHERE g.organization_id = "id"`, and Postgres resolves a bare "id"
   *    against the INNERMOST table — so it compared each grant's own primary
   *    key to an organization id. Valid SQL, no error, every figure silently
   *    zero. Spelling the table name into the subquery would fix it and would
   *    break the same silent way if the table were ever renamed.
   *
   * Grouping each ledger by organization_id on its own cannot multiply and has
   * no outer column to mis-resolve, and each query is verifiable by reading it.
   *
   * COUNTRY TOTALS ARE SUMMED FROM THE SCHOOL ROWS, in code, rather than by a
   * second query. A second aggregate can disagree with the first after any
   * later edit; summing the rows that are already being returned cannot.
   *
   * WHAT THIS DOES NOT COVER, and says so in its own payload: a parent's own
   * licence pool. license_grants is keyed to an organization, and a parent
   * buying for one child has no organization, so parent purchases are not in
   * it. Their CONSUMPTION is counted and reported on its own line, because
   * leaving it out would make platform consumption quietly too low. Reporting
   * school revenue as platform revenue is the kind of plausible wrong number
   * this whole change exists to stop.
   */
  async getLicenseAnalytics(): Promise<{
    perSchool: Array<any>;
    perCountry: Array<any>;
    platform: any;
    revenueByCurrency: Array<{ currency: string; amount: number; purchases: number }>;
    guardianPools: { consumed: number; consumedPaid: number; consumedReward: number };
    caveats: string[];
  }> {
    const schoolRows = await db
      .select({
        organizationId: organizations.id,
        name: organizations.name,
        countryId: organizations.countryId,
        curriculum: organizations.curriculum,
        isUnlimited: organizations.isUnlimitedLicenses,
        totalLicenses: organizations.totalLicenses,
      })
      .from(organizations)
      .orderBy(organizations.name);

    // Grants per school. FILTER rather than extra passes, so every figure here
    // comes from one scan of the same rows and cannot disagree with its total.
    const grantRows = await db
      .select({
        organizationId: licenseGrants.organizationId,
        granted: sql<number>`COALESCE(SUM(${licenseGrants.licensesDelta}), 0)::int`,
        purchases: sql<number>`count(*) FILTER (WHERE ${licenseGrants.kind} = 'purchase')::int`,
        grantedFree: sql<number>`COALESCE(SUM(${licenseGrants.licensesDelta}) FILTER (WHERE ${licenseGrants.kind} IN ('comp', 'backfill')), 0)::int`,
      })
      .from(licenseGrants)
      .groupBy(licenseGrants.organizationId);

    /**
     * REVENUE PER SCHOOL **PER CURRENCY**, as its own grouping.
     *
     * Summing amount_paid for a school without grouping by currency adds AED to
     * USD and produces a number that is money in neither — the exact mistake
     * the platform figure is grouped to avoid, made one level down where a
     * platform-level test would not see it. A school realistically pays in one
     * currency, so this is almost always a single entry; the shape is what
     * stops it being wrong in the case where it is not.
     */
    const schoolRevenueRows = await db
      .select({
        organizationId: licenseGrants.organizationId,
        currency: licenseGrants.currency,
        amount: sql<number>`COALESCE(SUM(${licenseGrants.amountPaid}), 0)::double precision`,
      })
      .from(licenseGrants)
      .where(eq(licenseGrants.kind, "purchase"))
      .groupBy(licenseGrants.organizationId, licenseGrants.currency);

    // Consumption per school. Guardian-pool rows carry no organization and are
    // counted on their own below.
    const consumptionRows = await db
      .select({
        organizationId: licenseConsumptions.organizationId,
        consumed: sql<number>`count(*)::int`,
        consumedPaid: sql<number>`count(*) FILTER (WHERE ${licenseConsumptions.currency} = 'paid')::int`,
        consumedReward: sql<number>`count(*) FILTER (WHERE ${licenseConsumptions.currency} = 'reward')::int`,
      })
      .from(licenseConsumptions)
      .where(eq(licenseConsumptions.poolOwnerType, "organization"))
      .groupBy(licenseConsumptions.organizationId);

    const grantsBy = new Map(grantRows.map((g: any) => [g.organizationId, g]));
    const consBy = new Map(consumptionRows.map((c: any) => [c.organizationId, c]));

    const revenueBySchool = new Map<string, Array<{ currency: string; amount: number }>>();
    for (const r of schoolRevenueRows as any[]) {
      if (!r.currency) continue;
      const list = revenueBySchool.get(r.organizationId) ?? [];
      list.push({ currency: r.currency, amount: Number(r.amount) });
      revenueBySchool.set(r.organizationId, list);
    }

    const perSchoolRows = schoolRows.map((s: any) => {
      const g = grantsBy.get(s.organizationId);
      const c = consBy.get(s.organizationId);
      return {
        ...s,
        granted: Number(g?.granted ?? 0),
        revenue: revenueBySchool.get(s.organizationId) ?? [],
        purchases: Number(g?.purchases ?? 0),
        grantedFree: Number(g?.grantedFree ?? 0),
        consumed: Number(c?.consumed ?? 0),
        consumedPaid: Number(c?.consumedPaid ?? 0),
        consumedReward: Number(c?.consumedReward ?? 0),
      };
    });

    const perSchool = perSchoolRows.map((r: any) => {
      return {
        ...r,
        /**
         * null, not a number, for an unlimited school. Its entitlement has no
         * value, so "remaining" has no answer — and 0 would read as exhausted,
         * which is the opposite of the truth.
         *
         * Only PAID consumption is subtracted: reward credits are a separate
         * pool earned by contributing questions, so counting them here would
         * charge a school twice for the same assessment.
         */
        remaining: r.isUnlimited ? null : r.granted - r.consumedPaid,
      };
    });

    // Summed from the rows above, so the two can never disagree.
    const byCountry = new Map<string, any>();
    for (const s of perSchool) {
      const key = s.countryId ?? "__unassigned__";
      if (!byCountry.has(key)) {
        byCountry.set(key, {
          countryId: s.countryId, countryName: null, countryNameAr: null,
          schools: 0, unlimitedSchools: 0,
          granted: 0, grantedFree: 0, revenue: [] as Array<{ currency: string; amount: number }>,
          purchases: 0,
          consumed: 0, consumedPaid: 0, consumedReward: 0, remaining: 0,
        });
      }
      const c = byCountry.get(key);
      c.schools += 1;
      if (s.isUnlimited) c.unlimitedSchools += 1;
      c.granted += s.granted;
      c.grantedFree += s.grantedFree;
      // Per currency here too, for the same reason: a country can hold schools
      // that paid in different currencies, and one total would be money in
      // neither.
      for (const r of s.revenue) {
        const hit = c.revenue.find((x: any) => x.currency === r.currency);
        if (hit) hit.amount += r.amount; else c.revenue.push({ ...r });
      }
      c.purchases += s.purchases;
      c.consumed += s.consumed;
      c.consumedPaid += s.consumedPaid;
      c.consumedReward += s.consumedReward;
      // Unlimited schools contribute nothing to a remaining balance, because
      // they have none to contribute.
      if (s.remaining !== null) c.remaining += s.remaining;
    }

    // Names from the controlled vocabulary, in both languages, rather than
    // echoing the id — the same reason GET /api/reference exists.
    const countryRows = await db
      .select({ id: countries.id, name: countries.name, nameAr: countries.nameAr })
      .from(countries);
    const nameById = new Map(countryRows.map((c: any) => [c.id, c]));
    for (const c of byCountry.values()) {
      const match = c.countryId ? nameById.get(c.countryId) : null;
      // NULL for a school with no country, not an English sentence. The client
      // writes that in the reader's language; prose from here arrives in
      // English on the Arabic side, which is how "No country set" sat
      // untranslated in the middle of an otherwise Arabic table.
      c.countryName = match?.name ?? c.countryId ?? null;
      c.countryNameAr = match?.nameAr ?? null;
    }

    const perCountry = [...byCountry.values()].sort((a, b) => b.consumed - a.consumed);

    /**
     * REVENUE GROUPED BY CURRENCY, never summed across them. Stripe is on USD
     * today and the column exists so a switch to AED is possible; adding the
     * two together would produce a number that is not money in any currency.
     */
    const revenueRows = await db
      .select({
        currency: licenseGrants.currency,
        amount: sql<number>`COALESCE(SUM(${licenseGrants.amountPaid}), 0)::double precision`,
        purchases: sql<number>`count(*)::int`,
      })
      .from(licenseGrants)
      .where(eq(licenseGrants.kind, "purchase"))
      .groupBy(licenseGrants.currency);

    const revenueByCurrency = revenueRows
      .filter((r: any) => r.currency)
      .map((r: any) => ({ currency: r.currency, amount: Number(r.amount), purchases: Number(r.purchases) }));

    // A parent's own pool: counted, attributed to no school, reported apart.
    const [guardian] = await db
      .select({
        consumed: sql<number>`count(*)::int`,
        consumedPaid: sql<number>`count(*) FILTER (WHERE ${licenseConsumptions.currency} = 'paid')::int`,
        consumedReward: sql<number>`count(*) FILTER (WHERE ${licenseConsumptions.currency} = 'reward')::int`,
      })
      .from(licenseConsumptions)
      .where(eq(licenseConsumptions.poolOwnerType, "user"));

    const platform = {
      schools: perSchool.length,
      unlimitedSchools: perSchool.filter((s) => s.isUnlimited).length,
      granted: perSchool.reduce((a, s) => a + s.granted, 0),
      grantedFree: perSchool.reduce((a, s) => a + s.grantedFree, 0),
      purchases: perSchool.reduce((a, s) => a + s.purchases, 0),
      schoolConsumed: perSchool.reduce((a, s) => a + s.consumed, 0),
      schoolConsumedPaid: perSchool.reduce((a, s) => a + s.consumedPaid, 0),
      schoolConsumedReward: perSchool.reduce((a, s) => a + s.consumedReward, 0),
      guardianConsumed: Number(guardian?.consumed ?? 0),
      // Every report generated on the platform, from either kind of pool.
      totalConsumed: perSchool.reduce((a, s) => a + s.consumed, 0) + Number(guardian?.consumed ?? 0),
      remainingAtCappedSchools: perSchool.reduce((a, s) => a + (s.remaining ?? 0), 0),
    };

    return {
      perSchool,
      perCountry,
      platform,
      revenueByCurrency,
      guardianPools: {
        consumed: Number(guardian?.consumed ?? 0),
        consumedPaid: Number(guardian?.consumedPaid ?? 0),
        consumedReward: Number(guardian?.consumedReward ?? 0),
      },
      /**
       * CODES, NOT PROSE. The limits of these figures matter as much as the
       * figures, so they travel with them — but as codes the client turns into
       * a sentence in the reader's own language, the same arrangement
       * ERASURE_BLOCK_CODES uses.
       *
       * Sending English sentences from here had two faults: the Arabic half of
       * a bilingual product got English, and the wording named response fields
       * — guardianPools, grantedFree — which mean nothing to the person
       * reading a dashboard.
       */
      caveats: [
        "parentPoolsNotInRevenue",
        "backfilledGrantsHaveNoAmount",
        "unlimitedHasNoBalance",
        "rewardCreditsAreNotRevenue",
      ],
    };
  }

  async recomputeOrganizationLicenseUsage(
    organizationId: string,
    tx: any = db,
  ): Promise<{ usedLicenses: number; rewardCreditsUsed: number }> {
    const [counts] = await tx
      .select({
        paid: sql<number>`count(*) FILTER (WHERE ${licenseConsumptions.currency} = 'paid')::int`,
        reward: sql<number>`count(*) FILTER (WHERE ${licenseConsumptions.currency} = 'reward')::int`,
      })
      .from(licenseConsumptions)
      .where(eq(licenseConsumptions.organizationId, organizationId));

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

  /**
   * How much a given student can still spend, whoever is paying for them.
   *
   * ONE FUNCTION FOR BOTH POPULATIONS, which is the point of the whole change.
   * A school pool and a parent pool now differ only in which row holds the
   * total; the rule, the ledger and the arithmetic are identical. Callers do
   * not branch on population any more.
   *
   * Returns null for anyone who is not on a pool at all — free accounts and
   * guests. They are bounded by the free-tier cap instead, which counts
   * completed assessments directly and is untouched by any of this.
   */
  async getLicenseCapacityForStudent(userId: string): Promise<{
    poolOwnerType: 'organization' | 'user';
    organizationId?: string;
    guardianUserId?: string;
    availableRewardCredits: number;
    availablePaidLicenses: number;
    totalAvailable: number;
    isUnlimited: boolean;
  } | null> {
    const orgMember = await this.getOrganizationMemberByUserId(userId);
    if (orgMember?.role === 'student') {
      const capacity = await this.getOrganizationAvailableCapacity(orgMember.organizationId);
      return {
        poolOwnerType: 'organization',
        organizationId: orgMember.organizationId,
        ...capacity,
      };
    }

    // A parent account paying for its own child. child_profiles.guardian_user_id
    // is .unique(), so the guardian account and the student account are the same
    // row here by construction -- one account, one child.
    const [child] = await db
      .select({ guardianUserId: childProfiles.guardianUserId })
      .from(childProfiles)
      .where(eq(childProfiles.guardianUserId, userId));
    if (!child) return null;

    const user = await this.getUser(userId);
    const purchased = user?.purchasedLicenses ?? 0;

    const [spent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(licenseConsumptions)
      .where(eq(licenseConsumptions.guardianUserId, userId));

    const availablePaidLicenses = Math.max(0, purchased - (spent?.n ?? 0));
    return {
      poolOwnerType: 'user',
      guardianUserId: userId,
      // Reward credits are a school mechanism; a parent pool has none.
      availableRewardCredits: 0,
      availablePaidLicenses,
      totalAvailable: availablePaidLicenses,
      isUnlimited: false,
    };
  }

  /**
   * Has this student already been charged for this grade?
   *
   * Drives the warning before a repeat, not a refusal: repeating a year is a
   * real thing that happens to real students, and the product's job is to say
   * "this will cost another licence" rather than to decide they may not.
   *
   * Reads the grade RECORDED ON THE CHARGE, never the student's current grade,
   * so advancing a year does not retroactively make last year's charge look
   * like this year's.
   */
  async hasConsumedLicenseForGrade(
    studentUserId: string,
    grade: string | null | undefined,
  ): Promise<boolean> {
    if (!grade) return false;
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(licenseConsumptions)
      .where(
        and(
          eq(licenseConsumptions.studentUserId, studentUserId),
          eq(licenseConsumptions.grade, grade),
        ),
      );
    return (row?.n ?? 0) > 0;
  }

  /**
   * Spend one licence, at the moment a report is generated.
   *
   * MUST be called inside the transaction that marks the assessment complete,
   * so a report can never exist without its charge.
   *
   * REWARD CREDITS FIRST. A school that has earned credits by contributing
   * questions spends those before its paid licences, so the reward is visible
   * in the balance rather than theoretical.
   *
   * RE-RUNNING A REPORT IS FREE. The generate endpoint is re-runnable by
   * design, and assessment_id is unique on the ledger, so a second run hits
   * ON CONFLICT DO NOTHING and charges nothing. This is also what makes the
   * call safe under concurrency: two simultaneous generations settle on one row.
   *
   * Returns null when nobody is on a pool (free tier, guest) -- those are
   * bounded by the free cap, not by licences.
   */
  async consumeLicense(
    tx: any,
    params: { studentUserId: string; assessmentId: string; grade?: string | null },
  ): Promise<{ currency: 'paid' | 'reward'; poolOwnerType: 'organization' | 'user' } | null> {
    /**
     * EVERY READ HERE IS ON `tx`, NOT ON `db`.
     *
     * This deliberately does NOT call getLicenseCapacityForStudent, which is
     * the obvious thing to do and is wrong twice over. That function reads on
     * the pooled `db` handle, so calling it from inside a transaction would:
     *
     *   1. decide the currency from a snapshot taken OUTSIDE the transaction
     *      that is about to spend it -- the check-then-act gap that
     *      recomputeOrganizationLicenseUsage's docblock exists to close, and
     *      that this would have quietly reopened one layer up; and
     *   2. take a second connection while this one is held, which deadlocks
     *      outright on a single-connection pool and merely races on a larger
     *      one. The offline harness caught this as a hang; production would
     *      have shown nothing until two reports were generated at once.
     *
     * So the capacity read is written out against `tx` instead. It is three
     * small selects, which is a fair price for the charge and the balance it
     * was computed from being the same atomic fact.
     */
    const [member] = await tx
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, params.studentUserId));

    let poolOwnerType: 'organization' | 'user';
    let organizationId: string | null = null;
    let guardianUserId: string | null = null;
    let availableRewardCredits = 0;

    if (member?.role === 'student') {
      poolOwnerType = 'organization';
      organizationId = member.organizationId;

      const [org] = await tx
        .select({
          rewardCredits: organizations.rewardCredits,
          rewardCreditsUsed: organizations.rewardCreditsUsed,
        })
        .from(organizations)
        .where(eq(organizations.id, member.organizationId));
      availableRewardCredits = Math.max(
        0,
        (org?.rewardCredits ?? 0) - (org?.rewardCreditsUsed ?? 0),
      );
    } else {
      const [child] = await tx
        .select({ guardianUserId: childProfiles.guardianUserId })
        .from(childProfiles)
        .where(eq(childProfiles.guardianUserId, params.studentUserId));
      // Free tier and guests are on no pool at all; they are bounded by the
      // free cap, which counts completed assessments directly.
      if (!child) return null;
      poolOwnerType = 'user';
      guardianUserId = params.studentUserId;
    }

    // Reward credits first, so a school that earned them by contributing
    // questions sees the reward in its balance rather than in theory.
    const currency: 'paid' | 'reward' = availableRewardCredits > 0 ? 'reward' : 'paid';

    await tx
      .insert(licenseConsumptions)
      .values({
        poolOwnerType,
        organizationId,
        guardianUserId,
        studentUserId: params.studentUserId,
        assessmentId: params.assessmentId,
        grade: params.grade ?? null,
        currency,
      })
      .onConflictDoNothing({ target: licenseConsumptions.assessmentId });

    if (poolOwnerType === 'organization' && organizationId) {
      await this.recomputeOrganizationLicenseUsage(organizationId, tx);
    }

    return { currency, poolOwnerType };
  }

  /**
   * IS THIS COUNTRY ACTUALLY USABLE?
   *
   * A country can be created, saved, listed and selected while being unable to
   * produce a usable report, and nothing anywhere said so. Every gap below was
   * reachable, silent, and permanent once a country was set up wrong:
   *
   *   NO SECTOR MAP. country_sector_categories is what turns a student's
   *   career matches into national-vision alignment. With no rows, matching
   *   falls back to VISION_FLOOR -- every career scores the same 40 for
   *   vision, so the column is dead weight and the report quietly says nothing
   *   about the country it is supposedly tailored to. Only the LLM
   *   auto-populate path ever wrote this table, so a country added by hand had
   *   no map and no warning.
   *
   *   FEWER THAN THREE SUBJECTS IN A CURRICULUM. The assessment makes a
   *   student choose three (MIN_SUBJECTS in SubjectsStep), so a curriculum
   *   with one or two subjects is not degraded, it is a dead end: the student
   *   cannot advance past the first step. A hard blocker, not a warning.
   *
   *   TOO FEW QUESTIONS. Below MIN_QUIZ_QUESTIONS the quiz borrows from other
   *   countries to fill the paper. It works, which is the problem -- a report
   *   comes out looking fine while the questions were another curriculum's.
   *
   * Reported per curriculum, because that is the grain a student actually
   * meets: a country can be ready for its national curriculum and a dead end
   * for IB, and one number for the whole country would hide it.
   */
  async getCountryReadiness(countryId: string): Promise<{
    countryId: string;
    ready: boolean;
    blockers: string[];
    warnings: string[];
    checks: {
      hasVision: boolean;
      hasCurricula: boolean;
      sectorMapRows: number;
      curricula: Array<{
        curriculum: string;
        subjectCount: number;
        questionCount: number;
        ready: boolean;
      }>;
    };
  } | null> {
    const country = await this.getCountryById(countryId);
    if (!country) return null;

    const MIN_SUBJECTS_PER_CURRICULUM = 3; // SubjectsStep's MIN_SUBJECTS
    const MIN_QUESTIONS_PER_CURRICULUM = 6; // quiz.routes.ts MIN_QUIZ_QUESTIONS

    const hasVision =
      (country.prioritySectors?.length ?? 0) > 0 && (country.nationalGoals?.length ?? 0) > 0;
    const curriculaList = country.curricula ?? [];
    const hasCurricula = curriculaList.length > 0;

    // The sector map is reached through this country's priority sectors; the
    // mapping rows themselves carry no country column.
    const [sectorMap] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(countrySectorCategories)
      .innerJoin(
        countryPrioritySectors,
        eq(countrySectorCategories.sectorId, countryPrioritySectors.id),
      )
      .where(eq(countryPrioritySectors.countryId, countryId));
    const sectorMapRows = sectorMap?.n ?? 0;

    const curricula = [];
    for (const curriculum of curriculaList) {
      const [subj] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(subjects)
        .where(
          and(
            eq(subjects.countryId, countryId),
            eq(subjects.curriculum, curriculum),
            eq(subjects.isActive, true),
          ),
        );
      // A question with a NULL curriculum applies to every curriculum in the
      // country, so it counts toward each one.
      const [qs] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(quizQuestions)
        .where(
          and(
            eq(quizQuestions.countryId, countryId),
            or(eq(quizQuestions.curriculum, curriculum), isNull(quizQuestions.curriculum)),
          ),
        );
      const subjectCount = subj?.n ?? 0;
      const questionCount = qs?.n ?? 0;
      curricula.push({
        curriculum,
        subjectCount,
        questionCount,
        ready: subjectCount >= MIN_SUBJECTS_PER_CURRICULUM,
      });
    }

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!hasVision) blockers.push("No priority sectors or national goals set.");
    if (!hasCurricula) blockers.push("No curricula defined, so no school can be created.");
    if (sectorMapRows === 0) {
      blockers.push(
        "No sector map. Every career will score the same for national-vision alignment, " +
        "so reports will not reflect this country. Run Repopulate to generate it.",
      );
    }
    for (const c of curricula) {
      if (c.subjectCount < MIN_SUBJECTS_PER_CURRICULUM) {
        blockers.push(
          `${c.curriculum}: only ${c.subjectCount} subject(s). A student must choose ` +
          `${MIN_SUBJECTS_PER_CURRICULUM}, so the assessment cannot be started.`,
        );
      }
      if (c.questionCount < MIN_QUESTIONS_PER_CURRICULUM) {
        warnings.push(
          `${c.curriculum}: only ${c.questionCount} question(s). The quiz will borrow ` +
          `from other countries to fill the paper.`,
        );
      }
    }

    return {
      countryId,
      ready: blockers.length === 0,
      blockers,
      warnings,
      checks: { hasVision, hasCurricula, sectorMapRows, curricula },
    };
  }

  /**
   * WHERE THE QUESTION BANK IS THIN, cell by cell.
   *
   * A cell is one (country, curriculum, subject, grade). It is the real unit
   * because that is what the quiz draws from: a student picking three subjects
   * gets FIVE questions per subject at THEIR grade
   * (QUIZ_DISTRIBUTION_BY_SUBJECT_COUNT in quiz.routes.ts). So a country can
   * hold hundreds of questions and still fail a particular student, if the
   * three cells they land on are empty.
   *
   * WHY THIS EXISTS. Questions arrive two ways -- generated, or contributed by
   * schools -- and both were pointed wherever the person happened to choose.
   * Left to a free choice a school contributes what it is strongest at, which
   * is the cell least likely to be empty, and the weak cells stay weak.
   * Nothing reported which they were: the country readiness check counts
   * questions per CURRICULUM, one total, which is enough to say "this
   * curriculum is thin" and not enough to say "Arabic grade 11 is empty".
   *
   * BELOW TARGET IS NOT A FAILURE, IT IS A BORROW. When a cell cannot fill its
   * share the quiz tops up from other countries, so the student still gets a
   * paper -- assessed partly on a curriculum that is not theirs, with nothing
   * surfacing that. That cost is what this table makes visible.
   *
   * A question with a NULL curriculum applies to every curriculum in the
   * country, so it counts toward each -- the same rule the readiness check uses.
   */
  async getQuestionGaps(
    countryId: string,
    curriculum: string,
  ): Promise<{
    countryId: string;
    curriculum: string;
    target: number;
    cells: Array<{
      subject: string;
      grade: string;
      count: number;
      shortfall: number;
      status: "empty" | "short" | "thin" | "ok";
    }>;
    summary: { empty: number; short: number; thin: number; ok: number; totalShortfall: number };
  } | null> {
    const country = await this.getCountryById(countryId);
    if (!country) return null;

    // What ONE student needs from one cell. Not a target for the bank as a
    // whole -- a cell holding exactly this serves every student at that grade
    // the same five questions, which is why `thin` sits above it.
    const TARGET_PER_CELL = 5;
    const HEALTHY_PER_CELL = 10;

    const subjectRows = await this.getSubjectsByCurriculum(countryId, curriculum);
    const subjects = subjectRows.filter((s) => s.isActive).map((s) => s.name);
    const grades = country.gradeLevels ?? [];

    const counts = await db
      .select({
        subject: quizQuestions.subject,
        grade: quizQuestions.grade,
        n: sql<number>`count(*)::int`,
      })
      .from(quizQuestions)
      .where(
        and(
          eq(quizQuestions.countryId, countryId),
          or(eq(quizQuestions.curriculum, curriculum), isNull(quizQuestions.curriculum)),
        ),
      )
      .groupBy(quizQuestions.subject, quizQuestions.grade);

    const byCell = new Map<string, number>();
    for (const row of counts) byCell.set(`${row.subject}|${row.grade}`, row.n);

    const cells: Array<{
      subject: string; grade: string; count: number; shortfall: number;
      status: "empty" | "short" | "thin" | "ok";
    }> = [];

    for (const subject of subjects) {
      for (const grade of grades) {
        // grade is an INTEGER column while gradeLevels is text; compare on the
        // number, not the string.
        const gradeNum = parseInt(String(grade).replace(/[^0-9]/g, ""), 10);
        const count = byCell.get(`${subject}|${gradeNum}`) ?? 0;
        const status =
          count === 0 ? "empty"
            : count < TARGET_PER_CELL ? "short"
              : count < HEALTHY_PER_CELL ? "thin"
                : "ok";
        cells.push({
          subject, grade: String(grade), count,
          shortfall: Math.max(0, TARGET_PER_CELL - count),
          status,
        });
      }
    }

    // Worst first: this list is meant to be acted on from the top, by a school
    // deciding what to write or a generator deciding what to fill.
    const rank = { empty: 0, short: 1, thin: 2, ok: 3 };
    cells.sort((a, b) => rank[a.status] - rank[b.status] || a.count - b.count);

    const summary = {
      empty: cells.filter((c) => c.status === "empty").length,
      short: cells.filter((c) => c.status === "short").length,
      thin: cells.filter((c) => c.status === "thin").length,
      ok: cells.filter((c) => c.status === "ok").length,
      totalShortfall: cells.reduce((n, c) => n + c.shortfall, 0),
    };

    return { countryId, curriculum, target: TARGET_PER_CELL, cells, summary };
  }


  /**
   * Submissions this school may review: awaiting peer review, not its own, not
   * already voted on by it.
   *
   * BLIND BY OMISSION, NOT BY CONVENTION. The author's organization and user
   * are not selected at all. Returning them and trusting the client not to
   * render them would be a disclosure either way -- a field that reaches the
   * browser has been disclosed, whatever the interface does with it.
   *
   * The two exclusions below do different jobs and both are needed. The author
   * check keeps a school off its own submission; the NOT EXISTS keeps it from
   * seeing one it has already voted on. The unique index is the backstop for
   * the second, but a queue that kept offering an already-reviewed item would
   * be useless even with the write refused.
   *
   * ONLY THE REVIEWER'S OWN COUNTRY AND CURRICULUM, in that order.
   *
   * A school teaching MOE National is not placed to judge whether an IB
   * question is correct at that grade, and a reviewer who cannot judge votes on
   * presentation or votes to collect the credit.
   *
   * COUNTRY IS MATCHED TOO, and that is the deliberate choice. The same
   * curriculum is not the same syllabus across borders: a British-curriculum
   * school in Saudi Arabia teaches it inside Saudi requirements, with national
   * content, local examination arrangements and a different context in the
   * questions themselves. A UAE reviewer judging it would be marking against a
   * syllabus it does not teach while believing it shares one. Matching country
   * first removes that class of disagreement rather than relying on reviewers
   * to notice it.
   *
   * THE COST, accepted: a country whose first school has just been created has
   * nobody to review its submissions, so they sit at `peer_review`
   * indefinitely. Superadmin override is what makes that survivable -- it is
   * also why superadmins must keep seeing `peer_review` submissions.
   *
   * Both values are read in the same statement as subselects rather than
   * fetched first and passed in. A caller cannot hand in the wrong ones, and
   * there is no window between reading them and filtering on them. A school
   * missing either compares against NULL and matches nothing, so the gate's
   * absence cannot open the queue.
   */
  async getPeerReviewQueue(reviewerOrgId: string, limit = 20): Promise<Array<{
    id: string;
    countryId: string;
    curriculum: string;
    subject: string;
    grade: number;
    questions: unknown;
    totalQuestions: number;
    llmVerificationScore: number | null;
    reviewsSoFar: number;
    createdAt: Date | null;
  }>> {
    const rows = await db
      .select({
        id: contributionSubmissions.id,
        countryId: contributionSubmissions.countryId,
        curriculum: contributionSubmissions.curriculum,
        subject: contributionSubmissions.subject,
        grade: contributionSubmissions.grade,
        questions: contributionSubmissions.questions,
        totalQuestions: contributionSubmissions.totalQuestions,
        llmVerificationScore: contributionSubmissions.llmVerificationScore,
        createdAt: contributionSubmissions.createdAt,
        reviewsSoFar: sql<number>`(
          SELECT count(*)::int FROM ${contributionReviews}
          WHERE ${contributionReviews.submissionId} = ${contributionSubmissions.id}
        )`,
      })
      .from(contributionSubmissions)
      .where(
        and(
          eq(contributionSubmissions.status, "peer_review"),
          // Never your own -- in any country.
          ne(contributionSubmissions.organizationId, reviewerOrgId),
          // Only this school's own country, and only the curriculum it teaches.
          sql`${contributionSubmissions.countryId} = (
            SELECT ${organizations.countryId} FROM ${organizations}
            WHERE ${organizations.id} = ${reviewerOrgId}
          )`,
          sql`${contributionSubmissions.curriculum} = (
            SELECT ${organizations.curriculum} FROM ${organizations}
            WHERE ${organizations.id} = ${reviewerOrgId}
          )`,
          sql`NOT EXISTS (
            SELECT 1 FROM ${contributionReviews}
            WHERE ${contributionReviews.submissionId} = ${contributionSubmissions.id}
              AND ${contributionReviews.reviewerOrgId} = ${reviewerOrgId}
          )`,
        ),
      )
      // Oldest first, so nothing waits indefinitely behind newer arrivals.
      .orderBy(contributionSubmissions.createdAt)
      .limit(limit);

    return rows as any;
  }

  /**
   * Record one school's vote and, if that completes the quorum, settle it.
   *
   * ALL IN ONE TRANSACTION. The vote, the tally and the decision have to be a
   * single atomic fact: two schools voting simultaneously would otherwise both
   * read two prior votes, both believe they are the third, and both settle the
   * submission -- awarding its credits twice.
   *
   * The unique index on (submission, reviewer org) is what makes a double vote
   * impossible rather than merely unlikely, and the status check below means
   * only the transaction that finds it still `peer_review` does the settling.
   */
  async recordContributionReview(params: {
    submissionId: string;
    reviewerOrgId: string;
    reviewerUserId: string;
    vote: "approve" | "reject";
    comment?: string | null;
  }): Promise<{
    recorded: boolean;
    reason?: string;
    reviewsSoFar: number;
    decided: boolean;
    outcome?: "approved" | "rejected";
  }> {
    return await db.transaction(async (tx) => {
      const [submission] = await tx
        .select()
        .from(contributionSubmissions)
        .where(eq(contributionSubmissions.id, params.submissionId))
        .for("update");

      if (!submission) {
        return { recorded: false, reason: "NOT_FOUND", reviewsSoFar: 0, decided: false };
      }
      if (submission.status !== "peer_review") {
        // Already settled, or never reached review. Not an error worth an
        // exception: a reviewer whose queue was a moment stale lands here.
        return { recorded: false, reason: "NOT_IN_REVIEW", reviewsSoFar: 0, decided: false };
      }
      if (submission.organizationId === params.reviewerOrgId) {
        // The queue already excludes this, so reaching it means a crafted
        // request. Refused here because the queue is a convenience and this is
        // the control.
        return { recorded: false, reason: "OWN_SUBMISSION", reviewsSoFar: 0, decided: false };
      }

      /**
       * THE REVIEWER MUST SHARE THE COUNTRY AND TEACH THE CURRICULUM.
       *
       * Read on `tx`, not on the pooled `db` handle: deciding from a snapshot
       * taken outside the transaction holding the submission is the
       * check-then-act mistake this codebase keeps producing, and it takes a
       * second connection while one is held.
       *
       * TWO DISTINCT REASONS, not one. With a single code a test cannot tell
       * which guard refused -- the same mistake as "verifying" an upload
       * allowlist that was never reached because the role check refused first.
       *
       * Fails closed. A school missing either value is refused rather than
       * admitted — the setup gate should have stopped it at the route, and if
       * that gate is ever bypassed this must not be the thing that lets it
       * through.
       */
      const [reviewerOrg] = await tx
        .select({
          countryId: organizations.countryId,
          curriculum: organizations.curriculum,
        })
        .from(organizations)
        .where(eq(organizations.id, params.reviewerOrgId));

      const reviewerCountry = reviewerOrg?.countryId?.trim();
      if (!reviewerCountry || reviewerCountry !== submission.countryId) {
        return { recorded: false, reason: "COUNTRY_MISMATCH", reviewsSoFar: 0, decided: false };
      }

      const reviewerCurriculum = reviewerOrg?.curriculum?.trim();
      if (!reviewerCurriculum || reviewerCurriculum !== submission.curriculum) {
        return { recorded: false, reason: "CURRICULUM_MISMATCH", reviewsSoFar: 0, decided: false };
      }

      /**
       * ASKED BEFORE INSERTING, with the unique index still behind it.
       *
       * Relying on the constraint violation alone meant the caller had to
       * recognise a Postgres error to tell "you already voted" from "the
       * server broke" -- and it could not: drizzle wraps the error, so a
       * second vote surfaced as a 500. A 500 tells an administrator to try
       * again later, which is the opposite of the truth.
       *
       * The check does not replace the index. The index is what makes two
       * simultaneous votes from one school impossible; this is what makes the
       * ordinary case answerable.
       */
      const [already] = await tx
        .select({ id: contributionReviews.id })
        .from(contributionReviews)
        .where(
          and(
            eq(contributionReviews.submissionId, params.submissionId),
            eq(contributionReviews.reviewerOrgId, params.reviewerOrgId),
          ),
        );
      if (already) {
        return { recorded: false, reason: "ALREADY_REVIEWED", reviewsSoFar: 0, decided: false };
      }

      await tx.insert(contributionReviews).values({
        submissionId: params.submissionId,
        reviewerOrgId: params.reviewerOrgId,
        reviewerUserId: params.reviewerUserId,
        vote: params.vote,
        comment: params.comment ?? null,
      });

      const votes = await tx
        .select({ vote: contributionReviews.vote, orgId: contributionReviews.reviewerOrgId })
        .from(contributionReviews)
        .where(eq(contributionReviews.submissionId, params.submissionId));

      const approvals = votes.filter((v) => v.vote === "approve").length;
      const rejections = votes.filter((v) => v.vote === "reject").length;

      // Settle as soon as an outcome is MATHEMATICALLY DECIDED, rather than
      // waiting for the third vote. Two approvals out of three cannot be
      // overturned by the vote still outstanding, so holding the submission
      // open for it would only delay the author and waste a reviewer's time.
      let decided: "approved" | "rejected" | null = null;
      if (approvals >= REVIEW_MAJORITY) decided = "approved";
      else if (rejections >= REVIEW_MAJORITY) decided = "rejected";

      if (decided) {
        await tx
          .update(contributionSubmissions)
          .set({
            status: decided,
            approvedCount: decided === "approved" ? submission.totalQuestions : 0,
            rejectedCount: decided === "rejected" ? submission.totalQuestions : 0,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contributionSubmissions.id, params.submissionId));
      }

      return {
        recorded: true,
        reviewsSoFar: votes.length,
        decided: !!decided,
        outcome: decided ?? undefined,
      };
    });
  }

  /**
   * Which schools voted with the outcome -- the ones a review credit is owed to.
   *
   * CREDIT FOLLOWS THE MAJORITY, deliberately. Crediting every review whatever
   * it said would pay a school to approve everything unread as fast as it
   * could click: the cheapest possible way to earn, and one that would quietly
   * fill the bank with whatever the automatic check happened to let through.
   * Being paid only when you agreed with the other reviewers makes careless
   * voting worthless rather than merely frowned upon.
   */
  async getReviewersOnMajoritySide(
    submissionId: string,
    outcome: "approved" | "rejected",
  ): Promise<string[]> {
    const want = outcome === "approved" ? "approve" : "reject";
    const rows = await db
      .select({ orgId: contributionReviews.reviewerOrgId })
      .from(contributionReviews)
      .where(
        and(
          eq(contributionReviews.submissionId, submissionId),
          eq(contributionReviews.vote, want),
        ),
      );
    return rows.map((r) => r.orgId);
  }

  /**
   * The reviews on one submission, for its AUTHOR -- outcome and comments,
   * never who wrote them. Blind runs both ways.
   */
  async getReviewFeedbackForAuthor(submissionId: string): Promise<Array<{
    vote: string; comment: string | null; createdAt: Date;
  }>> {
    const rows = await db
      .select({
        vote: contributionReviews.vote,
        comment: contributionReviews.comment,
        createdAt: contributionReviews.createdAt,
      })
      .from(contributionReviews)
      .where(eq(contributionReviews.submissionId, submissionId))
      .orderBy(contributionReviews.createdAt);
    return rows;
  }


  /**
   * Add to a school's PENDING reward credits, atomically.
   *
   * `x = x + n` IN SQL, not read-then-write. The existing reward paths read
   * the organization, add in JavaScript and write the sum back, which is the
   * check-then-act shape this codebase keeps producing: two credits landing
   * together both read the same starting value and one is lost.
   *
   * That race is theoretical for authoring rewards, which a superadmin grants
   * one at a time. It is not theoretical here: settling one submission credits
   * up to three schools in a loop, and several submissions can settle at once.
   */
  async incrementPendingRewardCredits(organizationId: string, credits: number): Promise<void> {
    if (credits <= 0) return;
    await db
      .update(organizations)
      .set({
        pendingRewardCredits: sql`COALESCE(${organizations.pendingRewardCredits}, 0) + ${credits}`,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));
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
        /**
         * OMITTED FROM THIS LIST UNTIL 2026-11-09, and four callers read it
         * off these rows — so each got `undefined` and the branch it guarded
         * never ran. None of them errored and none logged:
         *
         *   - the promote route's demote (`superadmin.routes.ts:692`): the
         *     previous primary was never cleared, so each promotion ADDED a
         *     primary instead of moving it. The route still answered 200 and
         *     the promoted admin really was primary, so it looked like it
         *     worked.
         *   - the remove-admin guard (`:644`): `if (adminToRemove.isPrimaryAdmin)`
         *     was always false, so "Cannot remove primary admin. Transfer
         *     primary admin role first." could not fire and a school's primary
         *     admin was deletable.
         *   - the admins listing (`:506`) returned `isPrimaryAdmin: undefined`,
         *     so the superadmin UI showed no admin as primary and offered
         *     Promote on every one of them.
         *   - two `admins.find(a => a.isPrimaryAdmin) || admins[0]` fallbacks
         *     (`:429`, `:1253`) always took the fallback and displayed an
         *     arbitrary admin. That `|| admins[0]` is also why this survived:
         *     it made the most visible symptom look plausible.
         *
         * Found by running the promote route and reading the rows back
         * (`superadmin-writes.mjs` P-05/P-07), not by reading the handler —
         * the handler is correct, and it is this list that was wrong.
         */
        isPrimaryAdmin: organizationMembers.isPrimaryAdmin,
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

  // Child profile (parent-registers accounts)
  async getChildProfileByGuardianUserId(userId: string): Promise<ChildProfile | undefined> {
    const [profile] = await db
      .select()
      .from(childProfiles)
      .where(eq(childProfiles.guardianUserId, userId));
    return profile;
  }

  // tx defaults to db, matching createOrganizationEvent — the registration
  // endpoint (POST /api/register/parent) inserts the user, this row and the
  // consent row in one transaction so a failure partway leaves no account.
  async createChildProfile(profile: InsertChildProfile, tx: any = db): Promise<ChildProfile> {
    const [created] = await tx.insert(childProfiles).values(profile).returning();
    return created;
  }

  async createChildGuardianConsent(consent: InsertChildGuardianConsent, tx: any = db): Promise<ChildGuardianConsent> {
    const [created] = await tx.insert(childGuardianConsents).values(consent).returning();
    return created;
  }

  /**
   * The whole parent-registers act — account, child profile, consent — in one
   * transaction, mirroring createGroupPurchaseTransaction's shape. A failure
   * partway (a duplicate email slipping past the route's own check under
   * concurrent requests, a DB constraint) must leave no account at all rather
   * than a user row with no child profile or consent behind it.
   *
   * Plain insert, not upsertUser: the caller already checked the email is
   * unique, this account is never an OAuth upgrade target, and there is no
   * conflict target to upsert against.
   */
  async createParentRegistration(params: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: string;
    child: Omit<InsertChildProfile, "guardianUserId">;
    consent: Omit<InsertChildGuardianConsent, "performedBy">;
  }): Promise<{ user: User; childProfile: ChildProfile; consent: ChildGuardianConsent }> {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: params.email,
          passwordHash: params.passwordHash,
          firstName: params.firstName,
          lastName: params.lastName,
          role: params.role,
          accountType: "public",
        })
        .returning();

      const childProfile = await this.createChildProfile(
        { ...params.child, guardianUserId: user.id },
        tx,
      );
      const consent = await this.createChildGuardianConsent(
        { ...params.consent, performedBy: user.id },
        tx,
      );

      return { user, childProfile, consent };
    });
  }

  async createOrganizationEvent(event: InsertOrganizationEvent, tx: any = db): Promise<OrganizationEvent> {
    const [created] = await tx.insert(organizationEvents).values(event).returning();
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
          // PEER REVIEW DOES NOT REMOVE SUPERADMIN OVERSIGHT, it just stops
          // being the only path. Routing verified submissions to peer review
          // took them out of this queue entirely, which is worse than the
          // bottleneck it replaced: one that no school chose to review would
          // sit there for ever with nobody able to see it, and a superadmin
          // could not step into one going wrong. The review route accepts a
          // decision on a peer_review submission at any point, and that
          // decision settles it whatever the votes said.
          eq(contributionSubmissions.status, "peer_review"),
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

  /**
   * Claims a submission for a re-run of the automatic check, in ONE statement.
   *
   * The conditions are in the WHERE clause rather than in a read before the
   * write, so two requests racing are arbitrated by the database: one gets
   * the row, the other gets nothing. Returns undefined when the submission
   * does not qualify -- already checked, checked moments ago and still in
   * flight, or no longer awaiting review.
   *
   * Setting the status back to "pending" and touching updated_at is what
   * makes the claim exclusive: a second caller sees a fresh in-flight check
   * and is refused until `staleBefore` has passed again.
   */
  async claimContributionRecheck(id: string, staleBefore: Date): Promise<ContributionSubmission | undefined> {
    const [claimed] = await db
      .update(contributionSubmissions)
      .set({ llmVerificationStatus: "pending", llmVerifiedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(contributionSubmissions.id, id),
          eq(contributionSubmissions.status, "pending"),
          or(
            eq(contributionSubmissions.llmVerificationStatus, "unavailable"),
            and(
              eq(contributionSubmissions.llmVerificationStatus, "pending"),
              isNull(contributionSubmissions.llmVerifiedAt),
              lt(contributionSubmissions.updatedAt, staleBefore),
            ),
          ),
        ),
      )
      .returning();
    return claimed;
  }

  /**
   * GIVES AN APPROVED SUBMISSION'S REWARD, ONCE.
   *
   * The route used to read the submission, read the school's three credit
   * figures, add to them in JavaScript and write them back, then mark the
   * submission claimed -- four statements with nothing joining them. Two
   * things followed. A second request arriving before the last write saw
   * `approved` again and paid again. And "Allocate reward" on the same school
   * pays the same credits and marks the submission `rewardAllocated` while
   * leaving it `approved`, so claiming it afterwards PAID IT A SECOND TIME:
   * the claim never looked at that flag. Reward credits are spent before paid
   * licences, so a double payment is free assessments.
   *
   * Now the CLAIM is the first statement and carries its own conditions, so
   * exactly one caller gets the row; the credits move in the same
   * transaction, as arithmetic in SQL rather than values read earlier. A
   * submission already paid through allocation is still closed, with nothing
   * moved.
   *
   * Returns null when the submission is not there to be claimed.
   */
  /**
   * THE YEARLY CEILING APPLIES HERE TOO. "Allocate reward" has always stopped
   * at the school's yearly maximum; this path did not, so the ceiling held
   * only for whoever used the other button. Same rule, same reset: the count
   * starts again when the calendar year changes.
   *
   * At the ceiling the claim is REFUSED and rolled back -- the submission
   * stays approved and unpaid, to be given next year -- rather than closed
   * with nothing paid, which would quietly forfeit a reward the school
   * earned. Part-way there, what fits is paid and the rest is dropped, which
   * is what allocation does.
   */
  async claimApprovedContribution(
    id: string,
    cap: { maxYearlyCredits: number; currentYear: number },
  ): Promise<{ creditsMoved: number; alreadyPaid: boolean; capped: number } | { refused: "yearly_cap" } | null> {
    const CAP_REACHED = Symbol("yearly cap reached");
    try {
      return await db.transaction(async (tx) => {
        const [paidNow] = await tx
          .update(contributionSubmissions)
          .set({ status: "claimed", rewardAllocated: true, updatedAt: new Date() })
          .where(and(
            eq(contributionSubmissions.id, id),
            eq(contributionSubmissions.status, "approved"),
            eq(contributionSubmissions.rewardAllocated, false),
          ))
          .returning();

        if (!paidNow) {
          // Approved and already paid by allocation: close it, move nothing.
          const [closed] = await tx
            .update(contributionSubmissions)
            .set({ status: "claimed", updatedAt: new Date() })
            .where(and(
              eq(contributionSubmissions.id, id),
              eq(contributionSubmissions.status, "approved"),
            ))
            .returning();
          return closed ? { creditsMoved: 0, alreadyPaid: true, capped: 0 } : null;
        }

        const credits = paidNow.creditsAwarded ?? 0;
        if (credits <= 0) return { creditsMoved: 0, alreadyPaid: false, capped: 0 };

        // Read on `tx`, after the claim, so the figure this decides from is
        // the one this transaction will write over.
        const [org] = await tx
          .select({
            yearly: organizations.yearlyContributionCount,
            resetYear: organizations.lastContributionResetYear,
          })
          .from(organizations)
          .where(eq(organizations.id, paidNow.organizationId));
        const yearlySoFar = org && org.resetYear === cap.currentYear ? (org.yearly ?? 0) : 0;
        const room = cap.maxYearlyCredits - yearlySoFar;
        if (room <= 0) throw CAP_REACHED; // rolls the claim back

        const pay = Math.min(credits, room);
        await tx
          .update(organizations)
          .set({
            pendingRewardCredits: sql`GREATEST(0, ${organizations.pendingRewardCredits} - ${credits})`,
            rewardCredits: sql`${organizations.rewardCredits} + ${pay}`,
            yearlyContributionCount: yearlySoFar + pay,
            lastContributionResetYear: cap.currentYear,
          })
          .where(eq(organizations.id, paidNow.organizationId));
        return { creditsMoved: pay, alreadyPaid: false, capped: credits - pay };
      });
    } catch (error) {
      if (error === CAP_REACHED) return { refused: "yearly_cap" };
      throw error;
    }
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
    totalPending: number;
    totalInReview: number;
    totalApproved: number;
    totalRejected: number;
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

    /**
     * THE FOUR FIGURES THE SUPERADMIN TILES READ, under the names they read.
     * The screen asked for totalPending / totalInReview / totalApproved /
     * totalRejected and this returned none of them, so `?? 0` drew four
     * confident zeros above a queue with submissions in it.
     *
     * "In review" is peer review (plus the legacy `in_review`): work that is
     * with reviewers rather than waiting on a superadmin. "Approved" includes
     * `claimed`, which is an approved submission whose reward has been given.
     */
    const countOf = (...statuses: string[]) =>
      allSubmissions.filter((s) => statuses.includes(s.status)).length;

    return {
      totalSubmissions,
      pendingSubmissions,
      approvedSubmissions,
      totalQuestionsApproved,
      totalCreditsAwarded,
      topContributors,
      totalPending: countOf("pending", "llm_verified"),
      totalInReview: countOf("peer_review", "in_review"),
      totalApproved: countOf("approved", "claimed"),
      totalRejected: countOf("rejected", "needs_changes"),
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
    completedAssessmentCount: number;
    latestAssessmentDate: Date | null;
  }>> {
    const results = await db
      .select({
        user: users,
        organizationName: organizations.name,
        assessmentCount: count(assessments.id),
        latestAssessmentDate: sql<Date | null>`MAX(${assessments.createdAt})`,
        // How many of those are FINISHED. The dashboard offers "view results"
        // from this, not from assessmentCount: a student with one assessment
        // still in progress has a count of 1 and no report to open, and the
        // link then answered a raw 404 in a new tab.
        completedAssessmentCount: sql<number>`COUNT(${assessments.id}) FILTER (WHERE ${assessments.isCompleted} = true)`,
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
      completedAssessmentCount: Number(r.completedAssessmentCount),
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
    /**
     * Ordered by grade NUMERICALLY, not alphabetically.
     *
     * assessments.grade is a text column, so ordering on it directly sorts
     * "10" < "11" < "12" < "9" and a four-year progression came back as
     * 10, 11, 12, 9 -- grade 9 last, after grade 12. Every consumer of this
     * trusts the order: the student's own progression view, the school's
     * grade-progress view, and any chart drawn from either. A parent looking
     * at four years of their child's results would have seen the first year
     * plotted at the end.
     *
     * Digits are extracted rather than cast, because the column holds both
     * "10" (a self-paying student, whose value comes from the request) and
     * "grade10" (a school student, whose value comes from the school record),
     * and a plain ::int would throw on the second. A row with no digits at
     * all sorts last rather than breaking the query.
     */
    const userAssessments = await db
      .select()
      .from(assessments)
      .where(and(
        eq(assessments.userId, userId),
        eq(assessments.isCompleted, true)
      ))
      .orderBy(
        sql`NULLIF(regexp_replace(${assessments.grade}, '\\D', '', 'g'), '')::int NULLS LAST`,
        assessments.completedAt,
      );

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

    // EXCLUDE A PARENT-REGISTERS ACCOUNT'S OWN PRE-REGISTRATION ASSESSMENTS
    // before the per-grade collapse below ever sees them. Without this, an
    // account that took an assessment as itself before ever registering a
    // child would have that assessment folded into the CHILD's Career
    // Journey the moment a later, genuinely-the-child's assessment landed on
    // the same grade — one taker's own attempt rendered as "the child retook
    // this grade." See shared/childOwnership.ts for the predicate and why it
    // is anchored on child_profiles.createdAt.
    //
    // A NO-OP FOR EVERY OTHER POPULATION. getChildProfileByGuardianUserId
    // returns undefined for a school student, a free user or an org admin,
    // and the ternary below returns `progression` unchanged.
    //
    // THE SAME RULE AS assessment.routes.ts's write-side lock, APPLIED
    // INDEPENDENTLY. That duplication — two implementations of "is this
    // record the child's," one filtering before a write and one before a
    // read, with no shared code beyond the predicate itself — is recorded as
    // a consolidation candidate in FOLLOWUP.md, not fixed here.
    const childProfile = await this.getChildProfileByGuardianUserId(userId);
    const eligible = childProfile
      ? progression.filter(entry => assessmentIsChildOwned(entry.assessment.createdAt, childProfile.createdAt))
      : progression;

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
      eligible.map(entry => ({
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
