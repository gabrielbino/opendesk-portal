import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';

describe('Ticket Deletion (Admin Only)', () => {
  let testTicketId: number;
  let adminUserId: number;
  let regularUserId: number;

  beforeAll(async () => {
    // Create admin user
    const adminUser = await db.createUser({
      name: 'Admin User',
      email: `admin-${Date.now()}@test.com`,
      passwordHash: 'hash',
      role: 'admin',
      approvalStatus: 'approved',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    adminUserId = adminUser.id;

    // Create regular user
    const regularUser = await db.createUser({
      name: 'Regular User',
      email: `user-${Date.now()}@test.com`,
      passwordHash: 'hash',
      role: 'user',
      approvalStatus: 'approved',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    regularUserId = regularUser.id;

    // Create test ticket - status must match the enum: "Novos", "Em Andamento", etc.
    const ticket = await db.createTicket({
      ticketId: `test-${Date.now()}`,
      title: 'Test Ticket for Deletion',
      description: 'This ticket will be deleted',
      category: 'Técnico',
      priority: 'Média',
      sector: 'TI',
      status: 'Novos',
      createdById: regularUserId,
      createdByName: 'Regular User',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    testTicketId = ticket.id;
  });

  afterAll(async () => {
    // Cleanup: delete test users
    try {
      await db.deleteUser(adminUserId);
      await db.deleteUser(regularUserId);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should allow admin to delete ticket', async () => {
    const caller = appRouter.createCaller({
      user: { id: adminUserId, name: 'Admin User', role: 'admin' },
      req: {} as any,
      res: {} as any,
    });

    const result = await caller.tickets.delete({ id: testTicketId });
    expect(result).toBeDefined();

    // Verify ticket was deleted
    const deletedTicket = await db.getTicketById(testTicketId);
    expect(deletedTicket).toBeNull();
  });

  it('should prevent regular user from deleting ticket', async () => {
    // Create another test ticket
    const ticket = await db.createTicket({
      ticketId: `test-${Date.now()}`,
      title: 'Test Ticket 2',
      description: 'This ticket should not be deleted',
      category: 'Técnico',
      priority: 'Média',
      sector: 'TI',
      status: 'Novos',
      createdById: regularUserId,
      createdByName: 'Regular User',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const caller = appRouter.createCaller({
      user: { id: regularUserId, name: 'Regular User', role: 'user' },
      req: {} as any,
      res: {} as any,
    });

    await expect(
      caller.tickets.delete({ id: ticket.id })
    ).rejects.toThrow('Apenas administradores podem excluir chamados');

    // Verify ticket still exists
    const existingTicket = await db.getTicketById(ticket.id);
    expect(existingTicket).toBeDefined();

    // Cleanup
    await db.deleteTicket(ticket.id);
  });

  it('should prevent unauthenticated user from deleting ticket', async () => {
    // Create another test ticket
    const ticket = await db.createTicket({
      ticketId: `test-${Date.now()}`,
      title: 'Test Ticket 3',
      description: 'This ticket should not be deleted',
      category: 'Técnico',
      priority: 'Média',
      sector: 'TI',
      status: 'Novos',
      createdById: regularUserId,
      createdByName: 'Regular User',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const caller = appRouter.createCaller({
      user: null,
      req: {} as any,
      res: {} as any,
    });

    await expect(
      caller.tickets.delete({ id: ticket.id })
    ).rejects.toThrow();

    // Verify ticket still exists
    const existingTicket = await db.getTicketById(ticket.id);
    expect(existingTicket).toBeDefined();

    // Cleanup
    await db.deleteTicket(ticket.id);
  });
});
