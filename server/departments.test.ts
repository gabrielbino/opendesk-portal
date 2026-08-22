import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';

describe('Departments', () => {
  let testDepartmentId: number;

  beforeAll(async () => {
    // Clean up any existing test departments
    const departments = await db.getAllDepartments();
    for (const dept of departments) {
      if (dept.name.includes('Test Department')) {
        await db.deleteDepartment(dept.id);
      }
    }
  });

  afterAll(async () => {
    // Clean up test department
    if (testDepartmentId) {
      await db.deleteDepartment(testDepartmentId);
    }
  });

  it('should create a new department', async () => {
    const department = await db.createDepartment({
      name: 'Test Department',
      description: 'This is a test department',
    });

    expect(department).toBeDefined();
    expect(department?.name).toBe('Test Department');
    expect(department?.description).toBe('This is a test department');
    
    if (department) {
      testDepartmentId = department.id;
    }
  });

  it('should list all departments', async () => {
    const departments = await db.getAllDepartments();
    expect(departments).toBeDefined();
    expect(Array.isArray(departments)).toBe(true);
    expect(departments.length).toBeGreaterThan(0);
  });

  it('should get department by id', async () => {
    const department = await db.getDepartmentById(testDepartmentId);
    expect(department).toBeDefined();
    expect(department?.id).toBe(testDepartmentId);
    expect(department?.name).toBe('Test Department');
  });

  it('should update department', async () => {
    const updated = await db.updateDepartment(testDepartmentId, {
      name: 'Test Department Updated',
      description: 'Updated description',
    });

    expect(updated).toBeDefined();
    expect(updated?.name).toBe('Test Department Updated');
    expect(updated?.description).toBe('Updated description');
  });

  it('should assign department to user', async () => {
    // Create a test user first
    const testUser = await db.createUser({
      name: 'Test User for Department',
      email: `test-dept-${Date.now()}@example.com`,
      passwordHash: 'hashedpassword',
      role: 'user',
      approvalStatus: 'approved',
    });

    expect(testUser).toBeDefined();

    if (testUser) {
      // Assign department to user
      const userWithDept = await db.assignDepartmentToUser(testUser.id, testDepartmentId);
      expect(userWithDept).toBeDefined();
      expect(userWithDept?.departmentId).toBe(testDepartmentId);

      // Clean up test user
      await db.deleteUser(testUser.id);
    }
  });

  it('should delete department', async () => {
    // Create a department to delete
    const deptToDelete = await db.createDepartment({
      name: 'Test Department To Delete',
      description: 'Will be deleted',
    });

    expect(deptToDelete).toBeDefined();

    if (deptToDelete) {
      const deleted = await db.deleteDepartment(deptToDelete.id);
      expect(deleted).toBe(true);

      // Verify it's deleted
      const found = await db.getDepartmentById(deptToDelete.id);
      expect(found).toBeNull();
    }
  });

  it('should remove department assignment when department is deleted', async () => {
    // Create department and user
    const dept = await db.createDepartment({
      name: 'Test Department For Deletion',
    });

    const user = await db.createUser({
      name: 'Test User For Department Deletion',
      email: `test-dept-del-${Date.now()}@example.com`,
      passwordHash: 'hashedpassword',
      role: 'user',
      approvalStatus: 'approved',
    });

    expect(dept).toBeDefined();
    expect(user).toBeDefined();

    if (dept && user) {
      // Assign department to user
      await db.assignDepartmentToUser(user.id, dept.id);

      // Delete department
      await db.deleteDepartment(dept.id);

      // Check that user's departmentId is now null
      const updatedUser = await db.getUserById(user.id);
      expect(updatedUser?.departmentId).toBeNull();

      // Clean up
      await db.deleteUser(user.id);
    }
  });
});
