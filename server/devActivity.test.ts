import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as db from "./db";

describe("Dev Activity Log", () => {
  const testUserId = 99999;
  const testUserName = "Test DevActivity User";
  const createdActivityIds: number[] = [];

  afterAll(async () => {
    // Cleanup: delete test activities
    try {
      const { sql } = await import("drizzle-orm");
      const schema = await import("../drizzle/schema");
      const dbInstance = await (db as any).getDb?.();
      if (dbInstance) {
        await dbInstance.delete(schema.devActivityLog)
          .where(sql`${schema.devActivityLog.userId} = ${testUserId}`);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe("logDevActivity", () => {
    it("should log a project_created activity", async () => {
      await db.logDevActivity({
        action: "project_created",
        userId: testUserId,
        userName: testUserName,
        entityType: "project",
        entityId: 1,
        entityName: "Test Project",
      });
      // If no error thrown, it succeeded
      expect(true).toBe(true);
    });

    it("should log a task_created activity with project info", async () => {
      await db.logDevActivity({
        action: "task_created",
        userId: testUserId,
        userName: testUserName,
        entityType: "task",
        entityId: 100,
        entityName: "Test Task",
        projectId: 1,
        projectName: "Test Project",
      });
      expect(true).toBe(true);
    });

    it("should log a project_status_changed activity with old/new values", async () => {
      await db.logDevActivity({
        action: "project_status_changed",
        userId: testUserId,
        userName: testUserName,
        entityType: "project",
        entityId: 1,
        entityName: "Test Project",
        oldValue: "Planejamento",
        newValue: "Em Andamento",
      });
      expect(true).toBe(true);
    });

    it("should log a comment_added activity", async () => {
      await db.logDevActivity({
        action: "comment_added",
        userId: testUserId,
        userName: testUserName,
        entityType: "comment",
        entityId: 50,
        entityName: "Comentário de teste",
        projectId: 1,
        projectName: "Test Project",
      });
      expect(true).toBe(true);
    });

    it("should handle null optional fields gracefully", async () => {
      await db.logDevActivity({
        action: "phase_created",
        userId: testUserId,
        userName: testUserName,
        entityType: "phase",
        entityId: 10,
        entityName: "Test Phase",
        projectId: null,
        projectName: null,
        details: null,
        oldValue: null,
        newValue: null,
      });
      expect(true).toBe(true);
    });
  });

  describe("getRecentDevActivities", () => {
    it("should return an array of activities", async () => {
      const activities = await db.getRecentDevActivities(10);
      expect(Array.isArray(activities)).toBe(true);
    });

    it("should respect the limit parameter", async () => {
      const activities = await db.getRecentDevActivities(3);
      expect(activities.length).toBeLessThanOrEqual(3);
    });

    it("should return activities ordered by createdAt DESC", async () => {
      const activities = await db.getRecentDevActivities(10);
      if (activities.length >= 2) {
        for (let i = 0; i < activities.length - 1; i++) {
          expect(activities[i].createdAt).toBeGreaterThanOrEqual(activities[i + 1].createdAt);
        }
      }
    });

    it("should return activities with required fields", async () => {
      const activities = await db.getRecentDevActivities(5);
      for (const activity of activities) {
        expect(activity).toHaveProperty("id");
        expect(activity).toHaveProperty("action");
        expect(activity).toHaveProperty("userId");
        expect(activity).toHaveProperty("userName");
        expect(activity).toHaveProperty("entityType");
        expect(activity).toHaveProperty("entityId");
        expect(activity).toHaveProperty("entityName");
        expect(activity).toHaveProperty("createdAt");
      }
    });
  });

  describe("getDevActivitiesByProject", () => {
    it("should return an array for a valid projectId", async () => {
      const activities = await db.getDevActivitiesByProject(1, 10);
      expect(Array.isArray(activities)).toBe(true);
    });

    it("should return empty array for non-existent project", async () => {
      const activities = await db.getDevActivitiesByProject(999999, 10);
      expect(Array.isArray(activities)).toBe(true);
      expect(activities.length).toBe(0);
    });
  });

  describe("getDevModulePresence", () => {
    it("should return an array", async () => {
      const presence = await db.getDevModulePresence();
      expect(Array.isArray(presence)).toBe(true);
    });
  });
});
