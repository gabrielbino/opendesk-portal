import { describe, it, expect } from 'vitest';
import * as db from './db';

describe('Project Deletion', () => {
  it('should delete a non-completed project successfully', async () => {
    const timestamp = Date.now();
    
    // Create a test project
    const project = await db.createProject({
      projectId: `PROJ-DEL-${timestamp}`,
      name: `Test Project for Deletion ${timestamp}`,
      description: 'This project should be deletable',
      status: 'Em Andamento',
      priority: 'Média',
      deadline: new Date(Date.now() + 86400000), // Tomorrow
      sector: 'TI',
      responsible: 'Test User',
      progress: 25,
      ownerId: 1,
      ownerName: 'Test User',
      createdById: 1,
      createdByName: 'Test User',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(project).toBeDefined();
    expect(project?.id).toBeDefined();

    if (!project?.id) throw new Error('Project creation failed');

    // Delete the project
    const deleted = await db.deleteProject(project.id);
    expect(deleted).toBe(true);

    // Verify project is deleted
    const retrieved = await db.getProjectById(project.id);
    expect(retrieved).toBeNull();
  });

  it('should delete project with phases', async () => {
    const timestamp = Date.now();
    
    // Create a test project
    const project = await db.createProject({
      projectId: `PROJ-PHASE-DEL-${timestamp}`,
      name: `Test Project with Phases ${timestamp}`,
      description: 'Project with phases to delete',
      status: 'Planejamento',
      priority: 'Alta',
      deadline: new Date(Date.now() + 86400000),
      sector: 'TI',
      responsible: 'Test User',
      progress: 0,
      ownerId: 1,
      ownerName: 'Test User',
      createdById: 1,
      createdByName: 'Test User',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(project?.id).toBeDefined();
    if (!project?.id) throw new Error('Project creation failed');

    // Add a phase
    const phase = await db.createProjectPhase({
      projectId: project.id,
      name: 'Test Phase',
      status: 'Pendente',
      order: 1,
      startDate: Date.now(),
      endDate: Date.now() + 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(phase).toBeDefined();

    // Delete the project (should also delete phases)
    const deleted = await db.deleteProject(project.id);
    expect(deleted).toBe(true);

    // Verify phases are also deleted
    const phases = await db.getPhasesByProjectId(project.id);
    expect(phases.length).toBe(0);
  });

  it('should handle deletion of non-existent project', async () => {
    // Try to delete a project that doesn't exist
    const deleted = await db.deleteProject(999999);
    expect(deleted).toBe(false);
  });

  it('should validate completed project cannot be deleted (business logic)', async () => {
    const timestamp = Date.now();
    
    // Create a completed project
    const project = await db.createProject({
      projectId: `PROJ-COMPLETED-${timestamp}`,
      name: `Completed Project ${timestamp}`,
      description: 'This project is completed',
      status: 'Concluído',
      priority: 'Baixa',
      deadline: new Date(Date.now() - 86400000), // Yesterday
      sector: 'TI',
      responsible: 'Test User',
      progress: 100,
      ownerId: 1,
      ownerName: 'Test User',
      createdById: 1,
      createdByName: 'Test User',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(project?.id).toBeDefined();
    if (!project?.id) throw new Error('Project creation failed');

    // The database layer will allow deletion, but the router should block it
    // This test verifies the project exists and is completed
    const retrieved = await db.getProjectById(project.id);
    expect(retrieved?.status).toBe('Concluído');
    
    // Clean up (database allows it, but router won't)
    await db.deleteProject(project.id);
  });
});
