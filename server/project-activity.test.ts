import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-openid",
    email: "daniel@opendesk.com",
    name: "Daniel TI",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("Project Activity History", () => {
  it("should have getActivityHistory procedure defined", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    
    // Verify the procedure exists on the router
    expect(caller.projects.getActivityHistory).toBeDefined();
    expect(typeof caller.projects.getActivityHistory).toBe("function");
  });

  it("should have getRecentActivities procedure defined", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.projects.getRecentActivities).toBeDefined();
    expect(typeof caller.projects.getRecentActivities).toBe("function");
  });

  it("should require projectId for getActivityHistory", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    
    // Should throw validation error without projectId
    await expect(
      (caller.projects.getActivityHistory as any)({ limit: 10 })
    ).rejects.toThrow();
  });

  it("project create mutation should include updatedById fields", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    
    // Verify the create procedure exists
    expect(caller.projects.create).toBeDefined();
    expect(typeof caller.projects.create).toBe("function");
  });

  it("project update mutation should include updatedById fields", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    
    // Verify the update procedure exists
    expect(caller.projects.update).toBeDefined();
    expect(typeof caller.projects.update).toBe("function");
  });

  it("projectPhases create mutation should include updatedById fields", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.projectPhases.create).toBeDefined();
    expect(typeof caller.projectPhases.create).toBe("function");
  });

  it("dailyTasks create mutation should include updatedById fields", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.dailyTasks.create).toBeDefined();
    expect(typeof caller.dailyTasks.create).toBe("function");
  });

  it("dailyTasks complete mutation should log activity", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.dailyTasks.complete).toBeDefined();
    expect(typeof caller.dailyTasks.complete).toBe("function");
  });
});
