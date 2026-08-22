import { describe, it, expect, afterAll } from 'vitest';
import * as db from './db';

describe('User Editing', () => {
  // Track all test user IDs for cleanup
  const testUserIds: number[] = [];

  // Cleanup: remove all test users created during tests
  afterAll(async () => {
    for (const userId of testUserIds) {
      try {
        await db.deleteUser(userId);
      } catch (err) {
        console.warn(`[Test Cleanup] Failed to delete test user ${userId}:`, err);
      }
    }
  });

  it('should update user data (name and email)', async () => {
    const timestamp = Date.now();
    const testEmail = `test-update-${timestamp}@example.com`;
    const newEmail = `test-update-new-${timestamp}@example.com`;
    const newName = `Updated User ${timestamp}`;

    const user = await db.createUser({
      name: `Test User ${timestamp}`,
      email: testEmail,
      passwordHash: 'hashedpassword123',
      sector: 'TI',
      role: 'user',
      approvalStatus: 'approved',
    });

    expect(user).toBeDefined();
    expect(user?.id).toBeDefined();

    if (!user?.id) throw new Error('User creation failed');
    testUserIds.push(user.id);

    const updated = await db.updateUserData(user.id, {
      name: newName,
      email: newEmail,
    });

    expect(updated).toBeDefined();
    expect(updated?.name).toBe(newName);
    expect(updated?.email).toBe(newEmail);
  });

  it('should update only name without changing email', async () => {
    const timestamp = Date.now();
    const testEmail = `test-name-only-${timestamp}@example.com`;
    const newName = `Name Only Updated ${timestamp}`;

    const user = await db.createUser({
      name: `Test User ${timestamp}`,
      email: testEmail,
      passwordHash: 'hashedpassword123',
      sector: 'TI',
      role: 'user',
      approvalStatus: 'approved',
    });

    expect(user?.id).toBeDefined();
    if (!user?.id) throw new Error('User creation failed');
    testUserIds.push(user.id);

    const updated = await db.updateUserData(user.id, {
      name: newName,
    });

    expect(updated?.name).toBe(newName);
    expect(updated?.email).toBe(testEmail);
  });

  it('should update only email without changing name', async () => {
    const timestamp = Date.now();
    const testEmail = `test-email-only-${timestamp}@example.com`;
    const newEmail = `test-email-only-new-${timestamp}@example.com`;
    const testName = `Test User ${timestamp}`;

    const user = await db.createUser({
      name: testName,
      email: testEmail,
      passwordHash: 'hashedpassword123',
      sector: 'TI',
      role: 'user',
      approvalStatus: 'approved',
    });

    expect(user?.id).toBeDefined();
    if (!user?.id) throw new Error('User creation failed');
    testUserIds.push(user.id);

    const updated = await db.updateUserData(user.id, {
      email: newEmail,
    });

    expect(updated?.name).toBe(testName);
    expect(updated?.email).toBe(newEmail);
  });

  it('should update user password', async () => {
    const timestamp = Date.now();
    const testEmail = `test-password-${timestamp}@example.com`;
    const newPasswordHash = 'newhash123456';

    const user = await db.createUser({
      name: `Test User ${timestamp}`,
      email: testEmail,
      passwordHash: 'oldhash123456',
      sector: 'TI',
      role: 'user',
      approvalStatus: 'approved',
    });

    expect(user?.id).toBeDefined();
    if (!user?.id) throw new Error('User creation failed');
    testUserIds.push(user.id);

    const updated = await db.updateUserPassword(user.id, newPasswordHash);

    expect(updated).toBeDefined();
    expect(updated?.passwordHash).toBe(newPasswordHash);
  });

  it('should return null when updating with empty data', async () => {
    const timestamp = Date.now();
    const testEmail = `test-empty-${timestamp}@example.com`;

    const user = await db.createUser({
      name: `Test User ${timestamp}`,
      email: testEmail,
      passwordHash: 'hashedpassword123',
      sector: 'TI',
      role: 'user',
      approvalStatus: 'approved',
    });

    expect(user?.id).toBeDefined();
    if (!user?.id) throw new Error('User creation failed');
    testUserIds.push(user.id);

    const updated = await db.updateUserData(user.id, {});

    expect(updated).toBeNull();
  });
});
