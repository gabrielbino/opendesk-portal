import { describe, it, expect, beforeEach, vi } from "vitest";
import { tasksManagementRouter } from "./tasksManagement";
import { getDb } from "../db";

// Mock da função getDb
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

describe("tasksManagementRouter", () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb);
  });

  describe("create", () => {
    it("should create a task with valid input", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).create;

      const result = await procedure({
        title: "Test Task",
        description: "Test Description",
        type: "daily",
        priority: "Média",
        difficulty: "Normal",
        points: 10,
      });

      expect(result).toEqual({ id: 1 });
    });

    it("should create a task with recurrence pattern", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).create;

      const result = await procedure({
        title: "Recurring Task",
        type: "weekly",
        priority: "Alta",
        difficulty: "Dificil",
        recurrencePattern: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      });

      expect(result).toEqual({ id: 1 });
    });

    it("should throw error when database is unavailable", async () => {
      vi.mocked(getDb).mockResolvedValue(null);

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).create;

      await expect(
        procedure({
          title: "Test Task",
          type: "daily",
          priority: "Baixa",
          difficulty: "Facil",
        })
      ).rejects.toThrow("Database connection failed");
    });
  });

  describe("list", () => {
    it("should list all tasks", async () => {
      const mockTasks = [
        {
          id: 1,
          title: "Task 1",
          type: "daily",
          status: "pending",
          priority: "Média",
          difficulty: "Normal",
          tags: null,
        },
        {
          id: 2,
          title: "Task 2",
          type: "weekly",
          status: "completed",
          priority: "Alta",
          difficulty: "Dificil",
          tags: null,
        },
      ];

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockTasks),
          }),
          orderBy: vi.fn().mockResolvedValue(mockTasks),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).list;

      const result = await procedure({});

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Task 1");
    });

    it("should filter tasks by type", async () => {
      const mockTasks = [
        {
          id: 1,
          title: "Daily Task",
          type: "daily",
          status: "pending",
          priority: "Média",
          difficulty: "Normal",
          tags: null,
        },
      ];

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockTasks),
          }),
          orderBy: vi.fn().mockResolvedValue(mockTasks),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).list;

      const result = await procedure({ type: "daily" });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("daily");
    });

    it("should filter tasks by status", async () => {
      const mockTasks = [
        {
          id: 1,
          title: "Completed Task",
          type: "daily",
          status: "completed",
          priority: "Média",
          difficulty: "Normal",
          tags: null,
        },
      ];

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockTasks),
          }),
          orderBy: vi.fn().mockResolvedValue(mockTasks),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).list;

      const result = await procedure({ status: "completed" });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("completed");
    });
  });

  describe("get", () => {
    it("should get a task by id", async () => {
      const mockTask = {
        id: 1,
        title: "Test Task",
        type: "daily",
        status: "pending",
        priority: "Média",
        difficulty: "Normal",
        tags: null,
      };

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTask]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).get;

      const result = await procedure({ id: 1 });

      expect(result.id).toBe(1);
      expect(result.title).toBe("Test Task");
    });

    it("should throw error when task not found", async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).get;

      await expect(procedure({ id: 999 })).rejects.toThrow("Task not found");
    });
  });

  describe("update", () => {
    it("should update a task", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).update;

      const result = await procedure({
        id: 1,
        title: "Updated Task",
        status: "in_progress",
      });

      expect(result).toEqual({ success: true });
    });

    it("should update task priority", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).update;

      const result = await procedure({
        id: 1,
        priority: "Crítica",
      });

      expect(result).toEqual({ success: true });
    });

    it("should update task with tags", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).update;

      const result = await procedure({
        id: 1,
        tags: ["urgent", "important"],
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe("delete", () => {
    it("should delete a task created by the user", async () => {
      const mockTask = {
        id: 1,
        title: "My Task",
        createdById: 1,
        type: "daily",
        status: "pending",
        priority: "Média",
        difficulty: "Normal",
      };

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTask]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).delete;

      const result = await procedure({ id: 1 });

      expect(result).toEqual({ success: true });
    });

    it("should allow admin to delete any task", async () => {
      const mockTask = {
        id: 1,
        title: "Other User Task",
        createdById: 2,
        type: "daily",
        status: "pending",
        priority: "Média",
        difficulty: "Normal",
      };

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTask]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Admin User", role: "admin" },
      }).delete;

      const result = await procedure({ id: 1 });

      expect(result).toEqual({ success: true });
    });

    it("should prevent non-creator from deleting task", async () => {
      const mockTask = {
        id: 1,
        title: "Other User Task",
        createdById: 2,
        type: "daily",
        status: "pending",
        priority: "Média",
        difficulty: "Normal",
      };

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTask]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).delete;

      await expect(procedure({ id: 1 })).rejects.toThrow(
        "You can only delete your own tasks"
      );
    });

    it("should throw error when task not found", async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).delete;

      await expect(procedure({ id: 999 })).rejects.toThrow("Task not found");
    });
  });

  describe("reorder", () => {
    it("should update task status to in_progress", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).reorder;

      const result = await procedure({
        taskId: 1,
        newStatus: "in_progress",
      });

      expect(result).toEqual({ success: true });
    });

    it("should update task status to completed with timestamp", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).reorder;

      const result = await procedure({
        taskId: 1,
        newStatus: "completed",
      });

      expect(result).toEqual({ success: true });
    });

    it("should update task status back to pending", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).reorder;

      const result = await procedure({
        taskId: 1,
        newStatus: "pending",
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe("addComment", () => {
    it("should add a comment to a task", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).addComment;

      const result = await procedure({
        taskId: 1,
        content: "This is a comment",
      });

      expect(result).toEqual({ id: 1 });
    });

    it("should add a comment with mentions", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).addComment;

      const result = await procedure({
        taskId: 1,
        content: "Hey @User2, please check this",
        mentionedUserIds: [2],
      });

      expect(result).toEqual({ id: 1 });
    });

    it("should reject empty comment", async () => {
      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).addComment;

      await expect(
        procedure({
          taskId: 1,
          content: "",
        })
      ).rejects.toThrow();
    });
  });

  describe("getComments", () => {
    it("should get comments for a task", async () => {
      const mockComments = [
        {
          id: 1,
          taskId: 1,
          userId: 1,
          userName: "User 1",
          content: "First comment",
          mentionedUserIds: null,
          createdAt: Date.now(),
        },
        {
          id: 2,
          taskId: 1,
          userId: 2,
          userName: "User 2",
          content: "Second comment",
          mentionedUserIds: null,
          createdAt: Date.now(),
        },
      ];

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockComments),
          }),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).getComments;

      const result = await procedure({ taskId: 1 });

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("First comment");
    });

    it("should parse mentioned user IDs in comments", async () => {
      const mockComments = [
        {
          id: 1,
          taskId: 1,
          userId: 1,
          userName: "User 1",
          content: "@User2 please check",
          mentionedUserIds: "[2]",
          createdAt: Date.now(),
        },
      ];

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockComments),
          }),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).getComments;

      const result = await procedure({ taskId: 1 });

      expect(result[0].mentionedUserIds).toEqual([2]);
    });
  });

  describe("deleteComment", () => {
    it("should delete own comment", async () => {
      const mockComment = {
        id: 1,
        userId: 1,
        taskId: 1,
        content: "My comment",
      };

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockComment]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).deleteComment;

      const result = await procedure({ commentId: 1 });

      expect(result).toEqual({ success: true });
    });

    it("should allow admin to delete any comment", async () => {
      const mockComment = {
        id: 1,
        userId: 2,
        taskId: 1,
        content: "Other user comment",
      };

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockComment]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Admin User", role: "admin" },
      }).deleteComment;

      const result = await procedure({ commentId: 1 });

      expect(result).toEqual({ success: true });
    });

    it("should prevent non-creator from deleting comment", async () => {
      const mockComment = {
        id: 1,
        userId: 2,
        taskId: 1,
        content: "Other user comment",
      };

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockComment]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).deleteComment;

      await expect(procedure({ commentId: 1 })).rejects.toThrow(
        "You can only delete your own comments"
      );
    });

    it("should throw error when comment not found", async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).deleteComment;

      await expect(procedure({ commentId: 999 })).rejects.toThrow(
        "Comment not found"
      );
    });
  });

  describe("getStats", () => {
    it("should return task statistics", async () => {
      const mockTasks = [
        {
          id: 1,
          title: "Task 1",
          type: "daily",
          status: "pending",
          assignedToId: 1,
        },
        {
          id: 2,
          title: "Task 2",
          type: "daily",
          status: "completed",
          assignedToId: 1,
        },
        {
          id: 3,
          title: "Task 3",
          type: "weekly",
          status: "in_progress",
          assignedToId: 2,
        },
        {
          id: 4,
          title: "Task 4",
          type: "monthly",
          status: "pending",
          assignedToId: 1,
        },
      ];

      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue(mockTasks),
      });

      const procedure = tasksManagementRouter.createCaller({
        user: { id: 1, name: "Test User", role: "user" },
      }).getStats;

      const result = await procedure();

      expect(result.total).toBe(4);
      expect(result.completed).toBe(1);
      expect(result.pending).toBe(2);
      expect(result.inProgress).toBe(1);
      expect(result.userTotal).toBe(3);
      expect(result.userCompleted).toBe(1);
      expect(result.byType.daily).toBe(2);
      expect(result.byType.weekly).toBe(1);
      expect(result.byType.monthly).toBe(1);
    });
  });
});
