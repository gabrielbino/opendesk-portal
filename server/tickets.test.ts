import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from './db';

// Mock the database module
vi.mock('./db', () => ({
  db: {
    getTickets: vi.fn(),
    getTicketById: vi.fn(),
    createTicket: vi.fn(),
    updateTicket: vi.fn(),
  },
}));

describe('Tickets Database Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTickets', () => {
    it('should return all tickets when no filters are provided', async () => {
      const mockTickets = [
        {
          id: 1,
          ticketId: 'bilhete_1',
          title: 'Test Ticket',
          description: 'Test description',
          status: 'Aberto',
          priority: 'Média',
          category: 'Técnico',
          sector: 'TI',
          createdById: 1,
          createdByName: 'Test User',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      vi.mocked(db.getTickets).mockResolvedValue(mockTickets as any);

      const result = await db.getTickets();
      
      expect(db.getTickets).toHaveBeenCalled();
      expect(result).toEqual(mockTickets);
    });

    it('should filter tickets by status', async () => {
      const mockTickets = [
        {
          id: 1,
          ticketId: 'bilhete_1',
          title: 'Open Ticket',
          status: 'Aberto',
        },
      ];

      vi.mocked(db.getTickets).mockResolvedValue(mockTickets as any);

      const result = await db.getTickets({ status: 'Aberto' });
      
      expect(db.getTickets).toHaveBeenCalledWith({ status: 'Aberto' });
      expect(result).toEqual(mockTickets);
    });
  });

  describe('getTicketById', () => {
    it('should return a ticket by id', async () => {
      const mockTicket = {
        id: 1,
        ticketId: 'bilhete_1',
        title: 'Test Ticket',
        description: 'Test description',
        status: 'Aberto',
        priority: 'Média',
        category: 'Técnico',
        sector: 'TI',
        createdById: 1,
        createdByName: 'Test User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(db.getTicketById).mockResolvedValue(mockTicket as any);

      const result = await db.getTicketById(1);
      
      expect(db.getTicketById).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockTicket);
    });

    it('should return undefined for non-existent ticket', async () => {
      vi.mocked(db.getTicketById).mockResolvedValue(undefined);

      const result = await db.getTicketById(999);
      
      expect(db.getTicketById).toHaveBeenCalledWith(999);
      expect(result).toBeUndefined();
    });
  });

  describe('createTicket', () => {
    it('should create a new ticket', async () => {
      const newTicket = {
        title: 'New Ticket',
        description: 'New ticket description',
        category: 'Técnico' as const,
        priority: 'Alta' as const,
        sector: 'TI' as const,
        createdById: 1,
        createdByName: 'Test User',
      };

      const createdTicket = {
        id: 1,
        ticketId: 'bilhete_1',
        ...newTicket,
        status: 'Aberto',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(db.createTicket).mockResolvedValue(createdTicket as any);

      const result = await db.createTicket(newTicket);
      
      expect(db.createTicket).toHaveBeenCalledWith(newTicket);
      expect(result).toEqual(createdTicket);
      expect(result.status).toBe('Aberto');
    });
  });

  describe('updateTicket', () => {
    it('should update ticket status', async () => {
      const updatedTicket = {
        id: 1,
        ticketId: 'bilhete_1',
        title: 'Test Ticket',
        status: 'Em Progresso',
        updatedAt: Date.now(),
      };

      vi.mocked(db.updateTicket).mockResolvedValue(updatedTicket as any);

      const result = await db.updateTicket(1, { status: 'Em Progresso' });
      
      expect(db.updateTicket).toHaveBeenCalledWith(1, { status: 'Em Progresso' });
      expect(result.status).toBe('Em Progresso');
    });

    it('should update ticket assignment', async () => {
      const updatedTicket = {
        id: 1,
        ticketId: 'bilhete_1',
        assignedToId: 2,
        assignedToName: 'Support Agent',
        updatedAt: Date.now(),
      };

      vi.mocked(db.updateTicket).mockResolvedValue(updatedTicket as any);

      const result = await db.updateTicket(1, { 
        assignedToId: 2, 
        assignedToName: 'Support Agent' 
      });
      
      expect(db.updateTicket).toHaveBeenCalledWith(1, { 
        assignedToId: 2, 
        assignedToName: 'Support Agent' 
      });
      expect(result.assignedToId).toBe(2);
      expect(result.assignedToName).toBe('Support Agent');
    });
  });
});
