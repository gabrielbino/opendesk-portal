import { getDb } from "../db";
import { sql } from "drizzle-orm";

/**
 * RESPONSIBILITY TAGS
 */

export async function createResponsibilityTag(data: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  createdById?: number;
  createdByName?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const now = Date.now();
    const result = await db.execute(
      sql`INSERT INTO responsabilidades_tags (name, description, color, icon, createdById, createdByName, createdAt, updatedAt) 
          VALUES (${data.name}, ${data.description || ''}, ${data.color || '#3b82f6'}, ${data.icon || ''}, ${data.createdById || 1}, ${data.createdByName || 'Sistema'}, ${now}, ${now})`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error creating responsibility tag:", error);
    throw error;
  }
}

export async function getResponsibilityTags() {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`SELECT id, name, description, color, icon, createdAt, updatedAt FROM responsabilidades_tags ORDER BY name`
    );
    return result || [];
  } catch (error) {
    console.error("[DB] Error getting responsibility tags:", error);
    throw error;
  }
}

export async function getResponsibilityTagById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`SELECT id, name, description, color, icon, createdAt, updatedAt FROM responsabilidades_tags WHERE id = ${id}`
    );
    return result || [];
  } catch (error) {
    console.error("[DB] Error getting responsibility tag:", error);
    throw error;
  }
}

export async function updateResponsibilityTag(id: number, data: Partial<{
  name: string;
  description: string;
  color: string;
  icon: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const updates: any[] = [];
    
    if (data.name !== undefined) updates.push(sql`name = ${data.name}`);
    if (data.description !== undefined) updates.push(sql`description = ${data.description}`);
    if (data.color !== undefined) updates.push(sql`color = ${data.color}`);
    if (data.icon !== undefined) updates.push(sql`icon = ${data.icon}`);
    
    if (updates.length === 0) return { changes: 0 };
    
    const setClause = updates.length === 1 
      ? updates[0] 
      : sql.join(updates, sql`, `);
    
    const result = await db.execute(
      sql`UPDATE responsabilidades_tags SET ${setClause} WHERE id = ${id}`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error updating responsibility tag:", error);
    throw error;
  }
}

export async function deleteResponsibilityTag(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`DELETE FROM responsabilidades_tags WHERE id = ${id}`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error deleting responsibility tag:", error);
    throw error;
  }
}

/**
 * PERSON RESPONSIBILITIES
 */

export async function assignResponsibilityToPerson(data: {
  userId: number;
  tagId: number;
  level?: "junior" | "pleno" | "senior" | "especialista";
  isPrimary?: boolean;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const now = Date.now();
    const result = await db.execute(
      sql`INSERT INTO responsabilidades_pessoas (userId, tagId, level, isActive, notes, createdAt, updatedAt) 
          VALUES (${data.userId}, ${data.tagId}, ${data.level || "pleno"}, ${data.isPrimary ? 1 : 1}, ${data.notes || null}, ${now}, ${now})`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error assigning responsibility to person:", error);
    throw error;
  }
}

export async function getPersonResponsibilities(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`SELECT 
        pr.id, pr.userId, pr.tagId, rt.name as tagName, rt.color as tagColor, rt.icon,
        pr.level, pr.isActive, pr.notes, pr.createdAt, pr.updatedAt
      FROM responsabilidades_pessoas pr
      LEFT JOIN responsabilidades_tags rt ON pr.tagId = rt.id
      WHERE pr.userId = ${userId}
      ORDER BY pr.createdAt DESC`
    );
    return result || [];
  } catch (error) {
    console.error("[DB] Error getting person responsibilities:", error);
    throw error;
  }
}

export async function updatePersonResponsibility(id: number, data: Partial<{
  level: "junior" | "pleno" | "senior" | "especialista";
  isPrimary: boolean;
  notes: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const updates: any[] = [];
    
    if (data.level !== undefined) updates.push(sql`level = ${data.level}`);
    if (data.isPrimary !== undefined) updates.push(sql`isActive = ${data.isPrimary}`);
    if (data.notes !== undefined) updates.push(sql`notes = ${data.notes}`);
    
    if (updates.length === 0) return { changes: 0 };
    
    const setClause = updates.length === 1 
      ? updates[0] 
      : sql.join(updates, sql`, `);
    
    const result = await db.execute(
      sql`UPDATE responsabilidades_pessoas SET ${setClause} WHERE id = ${id}`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error updating person responsibility:", error);
    throw error;
  }
}

export async function removeResponsibilityFromPerson(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`DELETE FROM responsabilidades_pessoas WHERE id = ${id}`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error removing responsibility from person:", error);
    throw error;
  }
}

export async function getUsersByResponsibility(tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`SELECT DISTINCT u.id, u.name, u.email
      FROM responsabilidades_pessoas pr
      JOIN users u ON pr.userId = u.id
      WHERE pr.tagId = ${tagId}
      ORDER BY u.name`
    );
    return result || [];
  } catch (error) {
    console.error("[DB] Error getting users by responsibility:", error);
    throw error;
  }
}

/**
 * TICKET RESPONSIBILITIES
 */

export async function assignResponsibilityToTicket(data: {
  ticketId: number;
  userId: number;
  role?: "primary" | "secondary" | "reviewer";
  estimatedHours?: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`INSERT INTO suporte_responsaveis (ticketId, userId, role, estimatedHours, notes) 
          VALUES (${data.ticketId}, ${data.userId}, ${data.role || "primary"}, ${data.estimatedHours || null}, ${data.notes || null})`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error assigning responsibility to ticket:", error);
    throw error;
  }
}

export async function getTicketResponsibilities(ticketId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`SELECT tr.id, tr.ticketId, tr.userId, u.name as userName, u.email,
        tr.role, tr.isActive, tr.estimatedHours, tr.actualHours, tr.notes, tr.completedAt
      FROM suporte_responsaveis tr
      LEFT JOIN users u ON tr.userId = u.id
      WHERE tr.ticketId = ${ticketId}
      ORDER BY tr.createdAt DESC`
    );
    return result || [];
  } catch (error) {
    console.error("[DB] Error getting ticket responsibilities:", error);
    throw error;
  }
}

export async function updateTicketResponsibility(id: number, data: Partial<{
  role: "primary" | "secondary" | "reviewer";
  isActive: boolean;
  estimatedHours: number;
  actualHours: number;
  notes: string;
  completedAt: Date;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const updates: any[] = [];
    
    if (data.role !== undefined) updates.push(sql`role = ${data.role}`);
    if (data.isActive !== undefined) updates.push(sql`isActive = ${data.isActive}`);
    if (data.estimatedHours !== undefined) updates.push(sql`estimatedHours = ${data.estimatedHours}`);
    if (data.actualHours !== undefined) updates.push(sql`actualHours = ${data.actualHours}`);
    if (data.notes !== undefined) updates.push(sql`notes = ${data.notes}`);
    if (data.completedAt !== undefined) updates.push(sql`completedAt = ${data.completedAt}`);
    
    if (updates.length === 0) return { changes: 0 };
    
    const setClause = updates.length === 1 
      ? updates[0] 
      : sql.join(updates, sql`, `);
    
    const result = await db.execute(
      sql`UPDATE suporte_responsaveis SET ${setClause} WHERE id = ${id}`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error updating ticket responsibility:", error);
    throw error;
  }
}

export async function removeResponsibilityFromTicket(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`DELETE FROM suporte_responsaveis WHERE id = ${id}`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error removing responsibility from ticket:", error);
    throw error;
  }
}

/**
 * TASK RESPONSIBILITIES
 */

export async function assignResponsibilityToTask(data: {
  taskId: number;
  userId: number;
  role?: "owner" | "collaborator";
  estimatedHours?: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`INSERT INTO tarefas_responsaveis (taskId, userId, role, estimatedHours, notes) 
          VALUES (${data.taskId}, ${data.userId}, ${data.role || "owner"}, ${data.estimatedHours || null}, ${data.notes || null})`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error assigning responsibility to task:", error);
    throw error;
  }
}

export async function getTaskResponsibilities(taskId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`SELECT tr.id, tr.taskId, tr.userId, u.name as userName, u.email,
        tr.role, tr.isActive, tr.estimatedHours, tr.actualHours, tr.notes, tr.completedAt
      FROM tarefas_responsaveis tr
      LEFT JOIN users u ON tr.userId = u.id
      WHERE tr.taskId = ${taskId}
      ORDER BY tr.createdAt DESC`
    );
    return result || [];
  } catch (error) {
    console.error("[DB] Error getting task responsibilities:", error);
    throw error;
  }
}

export async function updateTaskResponsibility(id: number, data: Partial<{
  role: "owner" | "collaborator";
  isActive: boolean;
  estimatedHours: number;
  actualHours: number;
  notes: string;
  completedAt: Date;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const updates: any[] = [];
    
    if (data.role !== undefined) updates.push(sql`role = ${data.role}`);
    if (data.isActive !== undefined) updates.push(sql`isActive = ${data.isActive}`);
    if (data.estimatedHours !== undefined) updates.push(sql`estimatedHours = ${data.estimatedHours}`);
    if (data.actualHours !== undefined) updates.push(sql`actualHours = ${data.actualHours}`);
    if (data.notes !== undefined) updates.push(sql`notes = ${data.notes}`);
    if (data.completedAt !== undefined) updates.push(sql`completedAt = ${data.completedAt}`);
    
    if (updates.length === 0) return { changes: 0 };
    
    const setClause = updates.length === 1 
      ? updates[0] 
      : sql.join(updates, sql`, `);
    
    const result = await db.execute(
      sql`UPDATE tarefas_responsaveis SET ${setClause} WHERE id = ${id}`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error updating task responsibility:", error);
    throw error;
  }
}

export async function removeResponsibilityFromTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`DELETE FROM tarefas_responsaveis WHERE id = ${id}`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error removing responsibility from task:", error);
    throw error;
  }
}

/**
 * RESPONSIBILITY HISTORY
 */

export async function logResponsibilityChange(data: {
  changeType: string;
  entityType: string;
  entityId: number;
  changedById: number;
  changedByName: string;
  oldValues?: any;
  newValues?: any;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`INSERT INTO responsabilidades_historico 
      (changeType, entityType, entityId, changedById, changedByName, oldValues, newValues, description)
      VALUES (${data.changeType}, ${data.entityType}, ${data.entityId}, ${data.changedById}, ${data.changedByName}, 
              ${data.oldValues ? JSON.stringify(data.oldValues) : null}, 
              ${data.newValues ? JSON.stringify(data.newValues) : null}, 
              ${data.description || null})`
    );
    return result;
  } catch (error) {
    console.error("[DB] Error logging responsibility change:", error);
    throw error;
  }
}

export async function getResponsibilityHistory(entityType: string, entityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const result = await db.execute(
      sql`SELECT id, changeType, entityType, entityId, changedById, changedByName, 
        oldValues, newValues, description, createdAt
      FROM responsabilidades_historico
      WHERE entityType = ${entityType} AND entityId = ${entityId}
      ORDER BY createdAt DESC`
    );
    return result || [];
  } catch (error) {
    console.error("[DB] Error getting responsibility history:", error);
    throw error;
  }
}

/**
 * DASHBOARD FUNCTIONS
 */

export async function getUserResponsibilityWorkload(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const query = `SELECT 
      u.id as userId, u.name as userName, u.email,
      COUNT(DISTINCT pr.id) as totalResponsibilities,
      (SELECT COUNT(DISTINCT id) FROM suporte_responsaveis WHERE userId = ? AND isActive = 1) as activeTickets,
      (SELECT COUNT(DISTINCT id) FROM tarefas_responsaveis WHERE userId = ? AND isActive = 1) as activeTasks,
      (SELECT COALESCE(SUM(estimatedHours), 0) FROM suporte_responsaveis WHERE userId = ? AND isActive = 1) as estimatedHours
    FROM sys_usuarios u
    LEFT JOIN responsabilidades_pessoas pr ON u.id = pr.userId
    WHERE u.id = ?
    GROUP BY u.id, u.name, u.email`;
    
    const result = await (db as any).execute(query, [userId, userId, userId, userId]);
    return result?.[0] || null;
  } catch (error) {
    console.error("[DB] Error getting user responsibility workload:", error);
    throw error;
  }
}

export async function getTeamResponsibilityOverview() {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  
  try {
    const query = `SELECT 
      u.id as userId, u.name as userName, u.email,
      0 as totalResponsibilities,
      0 as activeTickets,
      0 as activeTasks,
      0 as estimatedHours
    FROM sys_usuarios u
    ORDER BY u.name`;
    
    const result = await (db as any).execute(query);
    return result || [];
  } catch (error) {
    console.error("[DB] Error getting team responsibility overview:", error);
    throw error;
  }
}
