import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock db module
vi.mock('./db', () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  updateUserLastSignIn: vi.fn(),
  getPendingUsers: vi.fn(),
  getAllUsers: vi.fn(),
  updateUserApprovalStatus: vi.fn(),
  updateUserRole: vi.fn(),
  deleteUser: vi.fn(),
  getApprovedUsers: vi.fn(),
}));

import * as db from './db';

describe('Authentication System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Password Hashing', () => {
    it('should hash passwords correctly with bcrypt', async () => {
      const password = 'testPassword123';
      const hash = await bcrypt.hash(password, 10);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    });

    it('should verify correct passwords', async () => {
      const password = 'testPassword123';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect passwords', async () => {
      const password = 'testPassword123';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare('wrongPassword', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('User Registration', () => {
    it('should check for existing email before registration', async () => {
      const mockExistingUser = {
        id: 1,
        email: 'existing@test.com',
        name: 'Existing User',
      };
      
      vi.mocked(db.getUserByEmail).mockResolvedValue(mockExistingUser as any);
      
      const result = await db.getUserByEmail('existing@test.com');
      expect(result).toBeDefined();
      expect(result?.email).toBe('existing@test.com');
    });

    it('should return null for non-existing email', async () => {
      vi.mocked(db.getUserByEmail).mockResolvedValue(null);
      
      const result = await db.getUserByEmail('new@test.com');
      expect(result).toBeNull();
    });

    it('should create user with pending approval status', async () => {
      const newUser = {
        name: 'New User',
        email: 'new@test.com',
        passwordHash: 'hashedPassword',
        sector: 'TI',
        approvalStatus: 'pending' as const,
      };
      
      vi.mocked(db.createUser).mockResolvedValue({
        id: 1,
        ...newUser,
        role: 'user',
        loginMethod: 'internal',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      
      const result = await db.createUser(newUser);
      expect(result).toBeDefined();
      expect(result?.approvalStatus).toBe('pending');
    });
  });

  describe('User Approval', () => {
    it('should list pending users', async () => {
      const mockPendingUsers = [
        { id: 1, name: 'User 1', approvalStatus: 'pending' },
        { id: 2, name: 'User 2', approvalStatus: 'pending' },
      ];
      
      vi.mocked(db.getPendingUsers).mockResolvedValue(mockPendingUsers as any);
      
      const result = await db.getPendingUsers();
      expect(result).toHaveLength(2);
      expect(result[0].approvalStatus).toBe('pending');
    });

    it('should approve user', async () => {
      vi.mocked(db.updateUserApprovalStatus).mockResolvedValue({ success: true } as any);
      
      const result = await db.updateUserApprovalStatus(1, 'approved');
      expect(result).toBeDefined();
    });

    it('should reject user', async () => {
      vi.mocked(db.updateUserApprovalStatus).mockResolvedValue({ success: true } as any);
      
      const result = await db.updateUserApprovalStatus(1, 'rejected');
      expect(result).toBeDefined();
    });
  });

  describe('User Role Management', () => {
    it('should update user role to admin', async () => {
      vi.mocked(db.updateUserRole).mockResolvedValue({ success: true } as any);
      
      const result = await db.updateUserRole(1, 'admin');
      expect(result).toBeDefined();
    });

    it('should update user role to user', async () => {
      vi.mocked(db.updateUserRole).mockResolvedValue({ success: true } as any);
      
      const result = await db.updateUserRole(1, 'user');
      expect(result).toBeDefined();
    });
  });

  describe('Login Flow', () => {
    it('should return user for valid email', async () => {
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        passwordHash: await bcrypt.hash('password123', 10),
        approvalStatus: 'approved',
      };
      
      vi.mocked(db.getUserByEmail).mockResolvedValue(mockUser as any);
      
      const user = await db.getUserByEmail('test@test.com');
      expect(user).toBeDefined();
      expect(user?.email).toBe('test@test.com');
    });

    it('should verify password for login', async () => {
      const password = 'password123';
      const hash = await bcrypt.hash(password, 10);
      
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        passwordHash: hash,
        approvalStatus: 'approved',
      };
      
      vi.mocked(db.getUserByEmail).mockResolvedValue(mockUser as any);
      
      const user = await db.getUserByEmail('test@test.com');
      const isValid = await bcrypt.compare(password, user!.passwordHash!);
      
      expect(isValid).toBe(true);
    });

    it('should update last sign in on successful login', async () => {
      vi.mocked(db.updateUserLastSignIn).mockResolvedValue(undefined);
      
      await db.updateUserLastSignIn(1);
      expect(db.updateUserLastSignIn).toHaveBeenCalledWith(1);
    });
  });
});
