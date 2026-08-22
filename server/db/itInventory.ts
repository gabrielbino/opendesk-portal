import { getDb } from "../db";
import { eq, desc, and, sql, ne, like } from "drizzle-orm";
import {
  itInventoryCategories,
  itInventoryItems,
  itInventoryMovements,
  itInventoryWriteOffs,
  itInventoryMaintenance,
  InsertItInventoryCategory,
  InsertItInventoryItem,
  InsertItInventoryMovement,
  InsertItInventoryWriteOff,
  InsertItInventoryMaintenance,
  ItInventoryCategory,
  ItInventoryItem,
  ItInventoryMovement,
  ItInventoryWriteOff,
  ItInventoryMaintenance,
} from "../../drizzle/schema";

// ============ CATEGORY QUERIES ============

export async function createItInventoryCategory(
  category: InsertItInventoryCategory
): Promise<ItInventoryCategory | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(itInventoryCategories).values(category);
    const insertId = (result as any)[0]?.insertId;
    if (!insertId) return null;

    const [created] = await db
      .select()
      .from(itInventoryCategories)
      .where(eq(itInventoryCategories.id, Number(insertId)));
    return created || null;
  } catch (error) {
    console.error("[Database] Failed to create IT inventory category:", error);
    return null;
  }
}

export async function getAllItInventoryCategories(): Promise<ItInventoryCategory[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db.select().from(itInventoryCategories).orderBy(itInventoryCategories.name);
  } catch (error) {
    console.error("[Database] Failed to get IT inventory categories:", error);
    return [];
  }
}

// ============ ITEM QUERIES ============

export async function createItInventoryItem(
  item: InsertItInventoryItem
): Promise<ItInventoryItem | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(itInventoryItems).values(item);
    const insertId = (result as any)[0]?.insertId;
    if (!insertId) return null;

    const [created] = await db
      .select()
      .from(itInventoryItems)
      .where(eq(itInventoryItems.id, Number(insertId)));
    return created || null;
  } catch (error) {
    console.error("[Database] Failed to create IT inventory item:", error);
    return null;
  }
}

export async function getItInventoryItemById(id: number): Promise<ItInventoryItem | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const [item] = await db.select().from(itInventoryItems).where(eq(itInventoryItems.id, id));
    return item || null;
  } catch (error) {
    console.error("[Database] Failed to get IT inventory item:", error);
    return null;
  }
}

export async function getAllItInventoryItems(filters?: {
  status?: string;
  categoryId?: number;
  search?: string;
  tag?: string;
  sector?: string;
  responsible?: string;
}): Promise<ItInventoryItem[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const conditions: any[] = [];
    if (filters?.status) {
      conditions.push(eq(itInventoryItems.status, filters.status as any));
    }
    if (filters?.categoryId) {
      conditions.push(eq(itInventoryItems.categoryId, filters.categoryId));
    }
    if (filters?.tag) {
      const tagTerm = `%${filters.tag}%`;
      conditions.push(sql`${itInventoryItems.tag} LIKE ${tagTerm}`);
    }
    if (filters?.sector) {
      const sectorTerm = `%${filters.sector}%`;
      conditions.push(sql`${itInventoryItems.sector} LIKE ${sectorTerm}`);
    }
    if (filters?.responsible) {
      const responsibleTerm = `%${filters.responsible}%`;
      conditions.push(sql`${itInventoryItems.responsible} LIKE ${responsibleTerm}`);
    }
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        sql`(${itInventoryItems.name} LIKE ${searchTerm} OR ${itInventoryItems.tag} LIKE ${searchTerm} OR ${itInventoryItems.sector} LIKE ${searchTerm} OR ${itInventoryItems.responsible} LIKE ${searchTerm} OR ${itInventoryItems.serialNumber} LIKE ${searchTerm} OR ${itInventoryItems.model} LIKE ${searchTerm})`
      );
    }

    if (conditions.length > 0) {
      return await db.select().from(itInventoryItems).where(and(...conditions)).orderBy(desc(itInventoryItems.createdAt));
    }

    return await db.select().from(itInventoryItems).orderBy(desc(itInventoryItems.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get IT inventory items:", error);
    return [];
  }
}

export async function checkItInventoryTagExists(tag: string, excludeId?: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const conditions: any[] = [eq(itInventoryItems.tag, tag)];
    if (excludeId) {
      conditions.push(ne(itInventoryItems.id, excludeId));
    }

    const result = await db
      .select({ id: itInventoryItems.id })
      .from(itInventoryItems)
      .where(and(...conditions))
      .limit(1);

    return result.length > 0;
  } catch (error) {
    console.error("[Database] Failed to check tag existence:", error);
    return false;
  }
}

export async function updateItInventoryItem(
  id: number,
  data: Partial<InsertItInventoryItem>
): Promise<ItInventoryItem | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    await db
      .update(itInventoryItems)
      .set({
        ...data,
        updatedAt: Date.now(),
      })
      .where(eq(itInventoryItems.id, id));

    return await getItInventoryItemById(id);
  } catch (error) {
    console.error("[Database] Failed to update IT inventory item:", error);
    return null;
  }
}

export async function deleteItInventoryItem(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const result = await db.delete(itInventoryItems).where(eq(itInventoryItems.id, id));
    return result[0].affectedRows > 0;
  } catch (error) {
    console.error("[Database] Failed to delete IT inventory item:", error);
    return false;
  }
}

export async function getNextItInventoryItemNumber(): Promise<number> {
  const db = await getDb();
  if (!db) return 1;

  try {
    const result = await db.select({ count: sql<number>`COUNT(*)` }).from(itInventoryItems);
    return (result[0]?.count || 0) + 1;
  } catch (error) {
    console.error("[Database] Failed to get next item number:", error);
    return 1;
  }
}

// ============ MOVEMENT QUERIES ============

export async function createItInventoryMovement(
  movement: InsertItInventoryMovement
): Promise<ItInventoryMovement | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(itInventoryMovements).values(movement);
    const insertId = (result as any)[0]?.insertId;
    if (!insertId) return null;

    const [created] = await db
      .select()
      .from(itInventoryMovements)
      .where(eq(itInventoryMovements.id, Number(insertId)));
    return created || null;
  } catch (error) {
    console.error("[Database] Failed to create IT inventory movement:", error);
    return null;
  }
}

export async function getItInventoryMovementsByItemId(itemId: number): Promise<ItInventoryMovement[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(itInventoryMovements)
      .where(eq(itInventoryMovements.itemId, itemId))
      .orderBy(desc(itInventoryMovements.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get IT inventory movements:", error);
    return [];
  }
}

export async function getNextItInventoryMovementNumber(): Promise<number> {
  const db = await getDb();
  if (!db) return 1;

  try {
    const result = await db.select({ count: sql<number>`COUNT(*)` }).from(itInventoryMovements);
    return (result[0]?.count || 0) + 1;
  } catch (error) {
    console.error("[Database] Failed to get next movement number:", error);
    return 1;
  }
}

// ============ WRITE-OFF QUERIES ============

export async function createItInventoryWriteOff(
  writeOff: InsertItInventoryWriteOff
): Promise<ItInventoryWriteOff | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(itInventoryWriteOffs).values(writeOff);
    const insertId = (result as any)[0]?.insertId;
    if (!insertId) return null;

    const [created] = await db
      .select()
      .from(itInventoryWriteOffs)
      .where(eq(itInventoryWriteOffs.id, Number(insertId)));
    return created || null;
  } catch (error) {
    console.error("[Database] Failed to create IT inventory write-off:", error);
    return null;
  }
}

export async function getAllItInventoryWriteOffs(): Promise<ItInventoryWriteOff[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db.select().from(itInventoryWriteOffs).orderBy(desc(itInventoryWriteOffs.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get IT inventory write-offs:", error);
    return [];
  }
}

export async function getNextItInventoryWriteOffNumber(): Promise<number> {
  const db = await getDb();
  if (!db) return 1;

  try {
    const result = await db.select({ count: sql<number>`COUNT(*)` }).from(itInventoryWriteOffs);
    return (result[0]?.count || 0) + 1;
  } catch (error) {
    console.error("[Database] Failed to get next write-off number:", error);
    return 1;
  }
}

// ============ MAINTENANCE QUERIES ============

export async function createItInventoryMaintenance(
  maintenance: InsertItInventoryMaintenance
): Promise<ItInventoryMaintenance | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(itInventoryMaintenance).values(maintenance);
    const insertId = (result as any)[0]?.insertId;
    if (!insertId) return null;

    const [created] = await db
      .select()
      .from(itInventoryMaintenance)
      .where(eq(itInventoryMaintenance.id, Number(insertId)));
    return created || null;
  } catch (error) {
    console.error("[Database] Failed to create IT inventory maintenance:", error);
    return null;
  }
}

export async function getItInventoryMaintenanceByItemId(itemId: number): Promise<ItInventoryMaintenance[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(itInventoryMaintenance)
      .where(eq(itInventoryMaintenance.itemId, itemId))
      .orderBy(desc(itInventoryMaintenance.startDate));
  } catch (error) {
    console.error("[Database] Failed to get IT inventory maintenance:", error);
    return [];
  }
}

export async function updateItInventoryMaintenance(
  id: number,
  data: Partial<InsertItInventoryMaintenance>
): Promise<ItInventoryMaintenance | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    await db
      .update(itInventoryMaintenance)
      .set({
        ...data,
        updatedAt: Date.now(),
      })
      .where(eq(itInventoryMaintenance.id, id));

    const [updated] = await db
      .select()
      .from(itInventoryMaintenance)
      .where(eq(itInventoryMaintenance.id, id));
    return updated || null;
  } catch (error) {
    console.error("[Database] Failed to update IT inventory maintenance:", error);
    return null;
  }
}

export async function getNextItInventoryMaintenanceNumber(): Promise<number> {
  const db = await getDb();
  if (!db) return 1;

  try {
    const result = await db.select({ count: sql<number>`COUNT(*)` }).from(itInventoryMaintenance);
    return (result[0]?.count || 0) + 1;
  } catch (error) {
    console.error("[Database] Failed to get next maintenance number:", error);
    return 1;
  }
}
