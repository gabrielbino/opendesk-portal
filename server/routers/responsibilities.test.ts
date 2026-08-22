import { describe, it, expect, afterAll } from "vitest";
import {
  createResponsibilityTag,
  getResponsibilityTags,
  assignResponsibilityToPerson,
  getPersonResponsibilities,
  removeResponsibilityFromPerson,
  updatePersonResponsibility,
  deleteResponsibilityTag,
} from "../db/responsibilities";

describe("Responsibilities Module", () => {
  let tagId: number;
  let personRespId: number;
  const testUserId = 1; // Usar um ID de usuário válido

  // Cleanup: remove todos os dados de teste ao final
  afterAll(async () => {
    try {
      // Remove person responsibility se ainda existir
      if (personRespId) {
        try {
          await removeResponsibilityFromPerson(personRespId);
        } catch {
          // Pode já ter sido removido no teste
        }
      }
      // Remove tag de teste
      if (tagId) {
        try {
          await deleteResponsibilityTag(tagId);
        } catch {
          // Pode já ter sido removida
        }
      }
    } catch (err) {
      console.warn("[Test Cleanup] Error during responsibilities cleanup:", err);
    }
  });

  describe("Responsibility Tags", () => {
    it("should create a responsibility tag", async () => {
      const result = await createResponsibilityTag({
        name: `Backend Dev Test ${Date.now()}`,
        description: "Backend development responsibilities",
        color: "#3b82f6",
        createdById: 1,
        createdByName: "Test User",
      });

      expect(result).toBeDefined();
      // mysql2 execute returns [ResultSetHeader, FieldPacket[]]
      // ResultSetHeader has insertId
      const resultHeader = Array.isArray(result) ? result[0] : result;
      tagId = (resultHeader as any).insertId;
      expect(tagId).toBeGreaterThan(0);
    });

    it("should retrieve all responsibility tags", async () => {
      const tags = await getResponsibilityTags();
      expect(Array.isArray(tags)).toBe(true);
      // Result from db.execute with sql template returns rows directly or [rows, fields]
      const rows = Array.isArray(tags) && tags.length > 0 && Array.isArray(tags[0]) ? tags[0] : tags;
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe("Person Responsibilities", () => {
    it("should assign a responsibility to a person", async () => {
      const result = await assignResponsibilityToPerson({
        userId: testUserId,
        tagId,
        level: "pleno",
        isPrimary: true,
      });

      expect(result).toBeDefined();
      const resultHeader = Array.isArray(result) ? result[0] : result;
      personRespId = (resultHeader as any).insertId;
      expect(personRespId).toBeGreaterThan(0);
    });

    it("should retrieve person responsibilities", async () => {
      const responsibilities = await getPersonResponsibilities(testUserId);
      expect(Array.isArray(responsibilities)).toBe(true);
      // Result may be [rows, fields] or just rows
      const rows: any[] = Array.isArray(responsibilities) && responsibilities.length > 0 && Array.isArray(responsibilities[0]) 
        ? responsibilities[0] as any[]
        : responsibilities as any[];
      expect(rows.length).toBeGreaterThan(0);

      const found = rows.find((r: any) => r.id === personRespId);
      expect(found).toBeDefined();
      expect(found?.level).toBe("pleno");
    });

    it("should update person responsibility level", async () => {
      const result = await updatePersonResponsibility(personRespId, {
        level: "senior",
      });

      expect(result).toBeDefined();

      const responsibilities = await getPersonResponsibilities(testUserId);
      const rows: any[] = Array.isArray(responsibilities) && responsibilities.length > 0 && Array.isArray(responsibilities[0]) 
        ? responsibilities[0] as any[]
        : responsibilities as any[];
      const updated = rows.find((r: any) => r.id === personRespId);
      expect(updated?.level).toBe("senior");
    });

    it("should remove responsibility from person", async () => {
      const result = await removeResponsibilityFromPerson(personRespId);
      expect(result).toBeDefined();

      const responsibilities = await getPersonResponsibilities(testUserId);
      const rows: any[] = Array.isArray(responsibilities) && responsibilities.length > 0 && Array.isArray(responsibilities[0]) 
        ? responsibilities[0] as any[]
        : responsibilities as any[];
      const removed = rows.find((r: any) => r.id === personRespId);
      expect(removed).toBeUndefined();
      // Mark as already removed so afterAll doesn't try again
      personRespId = 0;
    });
  });
});
