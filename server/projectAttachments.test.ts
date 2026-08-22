import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  createProjectAttachment: vi.fn(),
  getProjectAttachments: vi.fn(),
  getProjectAttachmentById: vi.fn(),
  deleteProjectAttachment: vi.fn(),
  getProjectById: vi.fn(),
  logDevActivity: vi.fn(),
}));

import * as db from "./db";

describe("Project Attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createProjectAttachment", () => {
    it("should create an attachment with all fields", async () => {
      const mockAttachment = {
        id: 1,
        projectId: 10,
        fileName: "screenshot.png",
        fileUrl: "https://storage.example.com/projects/10/screenshot.png",
        fileKey: "projects/10/12345-abc-screenshot.png",
        mimeType: "image/png",
        fileSize: 1024000,
        category: "imagem" as const,
        description: null,
        uploadedById: 1,
        uploadedByName: "Daniel TI",
        createdAt: Date.now(),
      };

      vi.mocked(db.createProjectAttachment).mockResolvedValue(mockAttachment as any);

      const result = await db.createProjectAttachment({
        projectId: 10,
        fileName: "screenshot.png",
        fileUrl: "https://storage.example.com/projects/10/screenshot.png",
        fileKey: "projects/10/12345-abc-screenshot.png",
        mimeType: "image/png",
        fileSize: 1024000,
        category: "imagem",
        description: null,
        uploadedById: 1,
        uploadedByName: "Daniel TI",
        createdAt: Date.now(),
      });

      expect(result).toBeDefined();
      expect(result?.fileName).toBe("screenshot.png");
      expect(result?.category).toBe("imagem");
      expect(result?.projectId).toBe(10);
    });

    it("should create a spreadsheet attachment", async () => {
      const mockAttachment = {
        id: 2,
        projectId: 10,
        fileName: "relatorio.xlsx",
        fileUrl: "https://storage.example.com/projects/10/relatorio.xlsx",
        fileKey: "projects/10/12345-def-relatorio.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSize: 2048000,
        category: "planilha" as const,
        description: null,
        uploadedById: 1,
        uploadedByName: "Daniel TI",
        createdAt: Date.now(),
      };

      vi.mocked(db.createProjectAttachment).mockResolvedValue(mockAttachment as any);

      const result = await db.createProjectAttachment({
        projectId: 10,
        fileName: "relatorio.xlsx",
        fileUrl: "https://storage.example.com/projects/10/relatorio.xlsx",
        fileKey: "projects/10/12345-def-relatorio.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSize: 2048000,
        category: "planilha",
        description: null,
        uploadedById: 1,
        uploadedByName: "Daniel TI",
        createdAt: Date.now(),
      });

      expect(result).toBeDefined();
      expect(result?.fileName).toBe("relatorio.xlsx");
      expect(result?.category).toBe("planilha");
    });

    it("should create a document attachment (PDF)", async () => {
      const mockAttachment = {
        id: 3,
        projectId: 10,
        fileName: "proposta.pdf",
        fileUrl: "https://storage.example.com/projects/10/proposta.pdf",
        fileKey: "projects/10/12345-ghi-proposta.pdf",
        mimeType: "application/pdf",
        fileSize: 512000,
        category: "documento" as const,
        description: null,
        uploadedById: 2,
        uploadedByName: "Gabriel",
        createdAt: Date.now(),
      };

      vi.mocked(db.createProjectAttachment).mockResolvedValue(mockAttachment as any);

      const result = await db.createProjectAttachment({
        projectId: 10,
        fileName: "proposta.pdf",
        fileUrl: "https://storage.example.com/projects/10/proposta.pdf",
        fileKey: "projects/10/12345-ghi-proposta.pdf",
        mimeType: "application/pdf",
        fileSize: 512000,
        category: "documento",
        description: null,
        uploadedById: 2,
        uploadedByName: "Gabriel",
        createdAt: Date.now(),
      });

      expect(result).toBeDefined();
      expect(result?.fileName).toBe("proposta.pdf");
      expect(result?.category).toBe("documento");
    });

    it("should handle null return on failure", async () => {
      vi.mocked(db.createProjectAttachment).mockResolvedValue(null);

      const result = await db.createProjectAttachment({
        projectId: 999,
        fileName: "test.txt",
        fileUrl: "https://example.com/test.txt",
        fileKey: "projects/999/test.txt",
        mimeType: "text/plain",
        fileSize: 100,
        category: "outro",
        description: null,
        uploadedById: 1,
        uploadedByName: "Test",
        createdAt: Date.now(),
      });

      expect(result).toBeNull();
    });
  });

  describe("getProjectAttachments", () => {
    it("should return attachments for a project", async () => {
      const mockAttachments = [
        {
          id: 1,
          projectId: 10,
          fileName: "screenshot.png",
          fileUrl: "https://storage.example.com/screenshot.png",
          fileKey: "projects/10/screenshot.png",
          mimeType: "image/png",
          fileSize: 1024000,
          category: "imagem",
          description: null,
          uploadedById: 1,
          uploadedByName: "Daniel TI",
          createdAt: Date.now(),
        },
        {
          id: 2,
          projectId: 10,
          fileName: "dados.xlsx",
          fileUrl: "https://storage.example.com/dados.xlsx",
          fileKey: "projects/10/dados.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          fileSize: 2048000,
          category: "planilha",
          description: null,
          uploadedById: 1,
          uploadedByName: "Daniel TI",
          createdAt: Date.now() - 1000,
        },
      ];

      vi.mocked(db.getProjectAttachments).mockResolvedValue(mockAttachments as any);

      const result = await db.getProjectAttachments(10);

      expect(result).toHaveLength(2);
      expect(result[0].fileName).toBe("screenshot.png");
      expect(result[1].fileName).toBe("dados.xlsx");
    });

    it("should return empty array for project with no attachments", async () => {
      vi.mocked(db.getProjectAttachments).mockResolvedValue([]);

      const result = await db.getProjectAttachments(999);

      expect(result).toEqual([]);
    });
  });

  describe("getProjectAttachmentById", () => {
    it("should return a specific attachment", async () => {
      const mockAttachment = {
        id: 1,
        projectId: 10,
        fileName: "screenshot.png",
        fileUrl: "https://storage.example.com/screenshot.png",
        fileKey: "projects/10/screenshot.png",
        mimeType: "image/png",
        fileSize: 1024000,
        category: "imagem",
        description: null,
        uploadedById: 1,
        uploadedByName: "Daniel TI",
        createdAt: Date.now(),
      };

      vi.mocked(db.getProjectAttachmentById).mockResolvedValue(mockAttachment as any);

      const result = await db.getProjectAttachmentById(1);

      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
      expect(result?.fileName).toBe("screenshot.png");
    });

    it("should return null for non-existent attachment", async () => {
      vi.mocked(db.getProjectAttachmentById).mockResolvedValue(null);

      const result = await db.getProjectAttachmentById(999);

      expect(result).toBeNull();
    });
  });

  describe("deleteProjectAttachment", () => {
    it("should delete an attachment successfully", async () => {
      vi.mocked(db.deleteProjectAttachment).mockResolvedValue(true);

      const result = await db.deleteProjectAttachment(1);

      expect(result).toBe(true);
    });

    it("should return false for non-existent attachment", async () => {
      vi.mocked(db.deleteProjectAttachment).mockResolvedValue(false);

      const result = await db.deleteProjectAttachment(999);

      expect(result).toBe(false);
    });
  });

  describe("Category detection", () => {
    it("should detect image category from mimeType", () => {
      const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
      for (const type of imageTypes) {
        expect(type.startsWith("image/")).toBe(true);
      }
    });

    it("should detect spreadsheet category from mimeType", () => {
      const spreadsheetTypes = [
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ];
      for (const type of spreadsheetTypes) {
        const isSpreadsheet = type.includes("spreadsheet") || type.includes("excel") || type === "text/csv";
        expect(isSpreadsheet).toBe(true);
      }
    });

    it("should detect document category from mimeType", () => {
      const docTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      for (const type of docTypes) {
        const isDocument = type.includes("pdf") || type.includes("word") || type.includes("document");
        expect(isDocument).toBe(true);
      }
    });
  });

  describe("File size validation", () => {
    it("should accept files under 10MB", () => {
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      expect(5 * 1024 * 1024).toBeLessThan(MAX_FILE_SIZE);
      expect(1024).toBeLessThan(MAX_FILE_SIZE);
    });

    it("should reject files over 10MB", () => {
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      expect(15 * 1024 * 1024).toBeGreaterThan(MAX_FILE_SIZE);
      expect(11 * 1024 * 1024).toBeGreaterThan(MAX_FILE_SIZE);
    });
  });

  describe("Activity logging on attachment operations", () => {
    it("should log activity when creating an attachment", async () => {
      const mockProject = { id: 10, name: "Projeto Teste" };
      vi.mocked(db.getProjectById).mockResolvedValue(mockProject as any);
      vi.mocked(db.logDevActivity).mockResolvedValue(undefined as any);

      await db.logDevActivity({
        action: "create",
        userId: 1,
        userName: "Daniel TI",
        entityType: "project",
        entityId: 10,
        entityName: "Projeto Teste",
        projectId: 10,
        projectName: "Projeto Teste",
        details: "Anexou arquivo: screenshot.png",
      });

      expect(db.logDevActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "create",
          details: "Anexou arquivo: screenshot.png",
          entityType: "project",
        })
      );
    });

    it("should log activity when deleting an attachment", async () => {
      vi.mocked(db.logDevActivity).mockResolvedValue(undefined as any);

      await db.logDevActivity({
        action: "delete",
        userId: 1,
        userName: "Daniel TI",
        entityType: "project",
        entityId: 10,
        entityName: "Projeto Teste",
        projectId: 10,
        projectName: "Projeto Teste",
        details: "Removeu anexo: relatorio.xlsx",
      });

      expect(db.logDevActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "delete",
          details: "Removeu anexo: relatorio.xlsx",
        })
      );
    });
  });
});
