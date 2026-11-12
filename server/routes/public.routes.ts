import type { Express } from "express";
import { storage } from "../storage";
import { buildInfo } from "../utils/buildInfo";
import { db } from "../db";
import { sql } from "drizzle-orm";

export function registerPublicRoutes(app: Express) {
  // Lightweight liveness probe for external uptime monitoring (e.g. HetrixTools).
  // Intentionally touches NO database or downstream service, so frequent polling
  // does not keep the serverless DB awake. Always executed, never cached.
  app.get("/api/health", (req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.type("text/plain").status(200).send("ok");
  });

  // Health check endpoint for monitoring and load balancers
  // Returns minimal public response; internal details are not disclosed
  //
  // `seed` reports whether seedDatabase() completed on this process's boot, and
  // whether the content coverage gate at the end of it passed. An aborted or
  // incomplete seed leaves the server serving traffic with content missing — the
  // nine .ts content migrations run at the end of that function — and that state
  // was previously invisible until someone noticed English text in an Arabic PDF.
  // Both "failed" (it threw) and "incomplete" (it ran, the gate found gaps)
  // report degraded.
  //
  // A failed seed reports 200/degraded, NOT 503: this route is on the load
  // balancer path, and pulling a serving instance for stale content would be a
  // worse outcome for students than the stale content. Alert on the body.
  // Only the DB probe failing is genuinely unhealthy. The failure MESSAGE is
  // never returned here — it is in the boot log; this route stays non-disclosing.
  app.get("/health", async (req, res) => {
    const { getSeedStatus } = await import("../seedStatus");
    const seed = getSeedStatus().state;

    // guestSweep answers "has the sweep stopped running" (docs/
    // guest-ttl-option-c-recon.md §3) — it is request-triggered, not on a
    // fixed schedule, so silence here is the only signal something is
    // wrong: either no guest traffic has hit the trigger route in a long
    // time (fine) or the sweep has been failing every attempt (not fine —
    // check lastError). Read from system_config, not in-process memory, so
    // it reflects every instance's last attempt, not just this one's.
    let guestSweep: Record<string, unknown> = { state: "unavailable" };
    let sweepReadable = false;
    try {
      const { readSweepStatus, isSweepStale } = await import("../services/guestAssessmentExpiry");
      const status = await readSweepStatus();
      sweepReadable = true;
      guestSweep = {
        lastRunAt: status.lastRunAt,
        lastSuccessAt: status.lastSuccessAt,
        lastDeletedCount: status.lastDeletedCount,
        // Presence only, not the message — this route stays non-disclosing,
        // same reasoning as the seed failure message above.
        lastAttemptFailed: status.lastError !== null,
        // THE SUBTRACTION, DONE HERE RATHER THAN BY WHOEVER READS THIS.
        // lastRunAt was always reported and the comment above used to call a
        // long gap "fine". It is not fine: on 2026-11-10 the last run was
        // 2026-10-27, not failing, just never triggered — and the privacy
        // policy promises guest data is deleted within 72 hours. A boolean
        // is something a monitor can alert on; a timestamp is something a
        // human has to notice.
        stale: isSweepStale(status.lastSuccessAt, new Date()),
      };
    } catch {
      // Reading the status is best-effort for this endpoint; its own
      // failure must not make /health itself report unhealthy.
    }

    try {
      await db.execute(sql`SELECT 1`);
      res.json({
        status: seed === "failed" || seed === "incomplete" ? "degraded" : "ok",
        seed,
        guestSweep,
        // Which build is answering: see utils/buildInfo.ts.
        build: buildInfo(),
      });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({ status: "unhealthy", seed, guestSweep });
    }

    /**
     * THE SECOND TRIGGER, and the one that does not depend on strangers.
     *
     * POST /api/assessments still carries the primary trigger and keeps its
     * stated virtue — cleanup frequency tracking guest traffic. What that
     * design missed is the other half: NO traffic means NO cleanup, and the
     * 72-hour window is a promise in the privacy policy rather than a
     * nice-to-have. Production proved it, sitting fourteen days without a
     * sweep while reporting lastAttemptFailed: false.
     *
     * A health check is normally expected to be free of side effects, and
     * this one deliberately is not. The trade is explicit: /health is the one
     * request that arrives on a schedule whether or not anyone is using the
     * product — uptime monitoring, the load balancer, Render itself — which
     * is exactly the property a retention deadline needs and that guest
     * traffic does not have. The alternatives were a boot-time sweep (tracks
     * deploy cadence, no better) or external cron (infrastructure this repo
     * does not have).
     *
     * Costs this route nothing: it runs AFTER the response is sent, is never
     * awaited, never rejects, and the 30-minute throttle inside means a
     * monitor pinging every 60 seconds performs one sweep an hour at most.
     * It is also fired after the 503 branch on purpose — a failed `SELECT 1`
     * is the moment cleanup matters most, and the sweep has its own error
     * handling.
     */
    try {
      const { sweepExpiredGuestAssessmentsIfDue } = await import("../services/guestAssessmentExpiry");
      void sweepExpiredGuestAssessmentsIfDue();
    } catch {
      // Importing it must never turn a health check into a failure.
    }
  });

  // Get total completed assessments count for live counter on landing page
  app.get("/api/public/student-count", async (req, res) => {
    try {
      const analytics = await storage.getAnalyticsOverview();
      res.json({ totalStudents: analytics.totalStudents });
    } catch (error) {
      console.error("Error fetching student count:", error);
      res.status(500).json({ message: "Failed to fetch student count" });
    }
  });

  // Get organizations with logos for public display on landing page
  app.get("/api/public/organizations", async (req, res) => {
    try {
      const organizations = await storage.getOrganizationsWithLogos();
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });
}
