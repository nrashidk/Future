import { Express } from "express";
import { storage } from "../storage";
import { isOrgAdmin } from "../middleware/auth.middleware";

export function registerProgressRoutes(app: Express) {
  
  app.get("/api/students/me/progression", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = req.user.userId;
      const progression = await storage.getStudentAssessmentProgression(userId);

      res.json({
        success: true,
        data: progression.map(p => ({
          assessmentId: p.assessment.id,
          grade: p.assessment.grade,
          completedAt: p.assessment.completedAt,
          assessmentType: p.assessment.assessmentType,
          kolbScores: p.assessment.kolbScores,
          riasecScores: p.assessment.riasecScores,
          interests: p.assessment.interests,
          topCareers: p.recommendations.slice(0, 3).map((rec, i) => ({
            careerId: rec.careerId,
            careerName: p.careerNames[i],
            matchScore: rec.overallMatchScore,
          })),
        })),
      });
    } catch (error) {
      console.error("Error fetching student progression:", error);
      res.status(500).json({ message: "Failed to fetch progression" });
    }
  });

  app.get("/api/students/me/career-evolution", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = req.user.userId;
      const evolution = await storage.getStudentCareerEvolution(userId);

      const careerTrajectory: Array<{
        careerId: string;
        careerName: string;
        gradesAppeared: string[];
        persistenceScore: number;
        avgMatchScore: number;
      }> = [];

      const careerMap = new Map<string, {
        careerId: string;
        careerName: string;
        grades: string[];
        totalScore: number;
        count: number;
      }>();

      for (const gradeData of evolution) {
        for (const career of gradeData.topCareers) {
          if (!careerMap.has(career.careerId)) {
            careerMap.set(career.careerId, {
              careerId: career.careerId,
              careerName: career.careerName,
              grades: [],
              totalScore: 0,
              count: 0,
            });
          }
          const c = careerMap.get(career.careerId)!;
          c.grades.push(gradeData.grade);
          c.totalScore += career.matchScore;
          c.count++;
        }
      }

      Array.from(careerMap.values()).forEach(data => {
        careerTrajectory.push({
          careerId: data.careerId,
          careerName: data.careerName,
          gradesAppeared: data.grades,
          persistenceScore: data.grades.length / evolution.length,
          avgMatchScore: data.count > 0 ? data.totalScore / data.count : 0,
        });
      });

      careerTrajectory.sort((a, b) => b.persistenceScore - a.persistenceScore);

      res.json({
        success: true,
        totalGrades: evolution.length,
        trajectory: careerTrajectory,
        gradeDetails: evolution,
      });
    } catch (error) {
      console.error("Error fetching career evolution:", error);
      res.status(500).json({ message: "Failed to fetch career evolution" });
    }
  });

  app.get("/api/students/:studentId/progression", isOrgAdmin, async (req: any, res) => {
    try {
      const { studentId } = req.params;
      const adminUserId = req.user.userId;

      const adminOrg = await storage.getOrganizationByAdminUserId(adminUserId);
      if (!adminOrg) {
        return res.status(403).json({ message: "Not an organization admin" });
      }

      const studentMember = await storage.getOrganizationMemberByUserId(studentId);
      if (!studentMember || studentMember.organizationId !== adminOrg.id) {
        return res.status(403).json({ message: "Student not in your organization" });
      }

      const evolution = await storage.getStudentCareerEvolution(studentId);

      res.json({
        success: true,
        studentId,
        data: evolution,
      });
    } catch (error) {
      console.error("Error fetching student progression:", error);
      res.status(500).json({ message: "Failed to fetch student progression" });
    }
  });

  app.get("/api/organizations/:orgId/grade-progress", isOrgAdmin, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const adminUserId = req.user.userId;

      const adminOrg = await storage.getOrganizationByAdminUserId(adminUserId);
      if (!adminOrg || adminOrg.id !== orgId) {
        const user = await storage.getUser(adminUserId);
        if (user?.role !== "superadmin") {
          return res.status(403).json({ message: "Not authorized for this organization" });
        }
      }

      const progress = await storage.getOrganizationGradeProgress(orgId);

      res.json({
        success: true,
        organizationId: orgId,
        ...progress,
      });
    } catch (error) {
      console.error("Error fetching organization grade progress:", error);
      res.status(500).json({ message: "Failed to fetch grade progress" });
    }
  });

  app.get("/api/organizations/:orgId/career-trends", isOrgAdmin, async (req: any, res) => {
    try {
      const { orgId } = req.params;
      const adminUserId = req.user.userId;

      const adminOrg = await storage.getOrganizationByAdminUserId(adminUserId);
      if (!adminOrg || adminOrg.id !== orgId) {
        const user = await storage.getUser(adminUserId);
        if (user?.role !== "superadmin") {
          return res.status(403).json({ message: "Not authorized for this organization" });
        }
      }

      const progress = await storage.getOrganizationGradeProgress(orgId);

      const careerByGrade = new Map<string, Map<string, number>>();
      
      for (const student of progress.studentProgress) {
        for (const assessment of student.assessmentsByGrade) {
          if (!assessment.topCareer) continue;
          
          if (!careerByGrade.has(assessment.grade)) {
            careerByGrade.set(assessment.grade, new Map());
          }
          const gradeMap = careerByGrade.get(assessment.grade)!;
          gradeMap.set(assessment.topCareer, (gradeMap.get(assessment.topCareer) || 0) + 1);
        }
      }

      const trendData: Array<{
        grade: string;
        topCareers: Array<{ career: string; count: number }>;
      }> = [];

      Array.from(careerByGrade.entries()).forEach(([grade, careers]) => {
        const sortedCareers = Array.from(careers.entries())
          .map(([career, count]: [string, number]) => ({ career, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        
        trendData.push({
          grade,
          topCareers: sortedCareers,
        });
      });

      trendData.sort((a, b) => a.grade.localeCompare(b.grade));

      res.json({
        success: true,
        organizationId: orgId,
        careerTrendsByGrade: trendData,
        gradeStats: progress.gradeStats,
      });
    } catch (error) {
      console.error("Error fetching organization career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });
}
