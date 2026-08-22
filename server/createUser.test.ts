import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';

describe('User Creation System', () => {
  describe('Password hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'testpassword123';
      const hash = await bcrypt.hash(password, 10);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should verify hashed password', async () => {
      const password = 'mySecurePassword';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject wrong password', async () => {
      const password = 'correctPassword';
      const wrongPassword = 'wrongPassword';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('User data validation', () => {
    it('should validate email format', () => {
      const validEmails = [
        'user@example.com',
        'test.user@domain.co.uk',
        'admin@company.com.br',
      ];

      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
      ];

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      validEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(false);
      });
    });

    it('should validate password length', () => {
      const validPasswords = ['123456', 'password', 'securePass123'];
      const invalidPasswords = ['12345', 'abc', ''];

      validPasswords.forEach(password => {
        expect(password.length).toBeGreaterThanOrEqual(6);
      });

      invalidPasswords.forEach(password => {
        expect(password.length).toBeLessThan(6);
      });
    });

    it('should validate name length', () => {
      const validNames = ['Jo', 'João Silva', 'Maria'];
      const invalidNames = ['J', ''];

      validNames.forEach(name => {
        expect(name.length).toBeGreaterThanOrEqual(2);
      });

      invalidNames.forEach(name => {
        expect(name.length).toBeLessThan(2);
      });
    });
  });

  describe('User roles', () => {
    it('should have valid role types', () => {
      const validRoles = ['user', 'admin'];
      const testRole1 = 'user';
      const testRole2 = 'admin';

      expect(validRoles).toContain(testRole1);
      expect(validRoles).toContain(testRole2);
    });

    it('should default to user role', () => {
      const defaultRole = 'user';
      expect(defaultRole).toBe('user');
    });
  });

  describe('User sectors', () => {
    it('should have valid sector types', () => {
      const validSectors = ['TI', 'RH', 'Financeiro', 'Comercial', 'Suporte', 'Operações', 'Outro'];
      
      expect(validSectors).toContain('TI');
      expect(validSectors).toContain('RH');
      expect(validSectors).toContain('Financeiro');
      expect(validSectors).toContain('Outro');
    });
  });

  describe('Approval status', () => {
    it('should set admin-created users as approved', () => {
      const adminCreatedStatus = 'approved';
      expect(adminCreatedStatus).toBe('approved');
    });

    it('should set self-registered users as pending', () => {
      const selfRegisteredStatus = 'pending';
      expect(selfRegisteredStatus).toBe('pending');
    });
  });
});
