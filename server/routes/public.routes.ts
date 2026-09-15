import type { Express } from "express";
import { storage } from "../storage";
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
    try {
      const { readSweepStatus } = await import("../services/guestAssessmentExpiry");
      const status = await readSweepStatus();
      guestSweep = {
        lastRunAt: status.lastRunAt,
        lastSuccessAt: status.lastSuccessAt,
        lastDeletedCount: status.lastDeletedCount,
        // Presence only, not the message — this route stays non-disclosing,
        // same reasoning as the seed failure message above.
        lastAttemptFailed: status.lastError !== null,
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
      });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({ status: "unhealthy", seed, guestSweep });
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
