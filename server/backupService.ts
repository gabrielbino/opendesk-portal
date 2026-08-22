import { db as dbInstance } from "./db";
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { ENV } from './_core/env';

const connection = mysql.createPool(ENV.databaseUrl);
const db = drizzle(connection);
import { users, departments, tickets, projects, suppliers, products, purchaseOrders, purchaseOrderItems, quotations, permissionGroups, announcements, attachments, comments, projectComments, dailyTasks, activities, projectPhases } from "../drizzle/schema";
import * as schema from "../drizzle/schema";
const backups = (schema as any).backups;
import { storagePut } from "./storage";
import crypto from "crypto";
import { eq, lt, desc } from "drizzle-orm";

const BACKUP_RETENTION_DAYS = 7;

interface BackupData {
  users: any[];
  departments: any[];
  tickets: any[];
  projects: any[];
  suppliers: any[];
  products: any[];
  purchaseOrders: any[];
  purchaseOrderItems: any[];
  quotations: any[];
  permissionGroups: any[];
  announcements: any[];
  attachments: any[];
  comments: any[];
  projectComments: any[];
  dailyTasks: any[];
  activities: any[];
  projectPhases: any[];
}

/**
 * Creates a full database backup
 * Exports all tables to JSON, uploads to S3, and records metadata
 */
export async function createBackup(createdBy: string): Promise<{ success: boolean; backupId?: number; error?: string }> {
  try {
    console.log("[Backup] Starting database backup...");
    
    // Export all tables
    const backupData: BackupData = {
      users: await db.select().from(users),
      departments: await db.select().from(departments),
      tickets: await db.select().from(tickets),
      projects: await db.select().from(projects),
      suppliers: await db.select().from(suppliers),
      products: await db.select().from(products),
      purchaseOrders: await db.select().from(purchaseOrders),
      purchaseOrderItems: await db.select().from(purchaseOrderItems),
      quotations: await db.select().from(quotations),
      permissionGroups: await db.select().from(permissionGroups),
      announcements: await db.select().from(announcements),
      attachments: await db.select().from(attachments),
      comments: await db.select().from(comments),
      projectComments: await db.select().from(projectComments),
      dailyTasks: await db.select().from(dailyTasks),
      activities: await db.select().from(activities),
      projectPhases: await db.select().from(projectPhases),
    };

    // Calculate total record count
    const recordCount = Object.values(backupData).reduce((sum, table) => sum + table.length, 0);
    
    // Convert to JSON
    const jsonData = JSON.stringify(backupData, null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    const fileSize = buffer.length;
    
    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const s3Key = `backups/${filename}`;
    
    // Upload to S3
    console.log("[Backup] Uploading to S3...");
    const { url: s3Url } = await storagePut(s3Key, buffer, 'application/json');
    
    // Record backup metadata
    const [backup] = await db.insert(backups).values({
      filename,
      fileSize,
      checksum,
      status: "completed",
      s3Key,
      s3Url,
      tablesBackedUp: Object.keys(backupData),
      recordCount,
      createdAt: Date.now(),
      createdBy,
    });
    
    console.log(`[Backup] Backup created successfully: ${filename} (${recordCount} records)`);
    
    // Rotate old backups
    await rotateBackups();
    
    return { success: true, backupId: backup.insertId };
  } catch (error) {
    console.error("[Backup] Error creating backup:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Deletes backups older than BACKUP_RETENTION_DAYS
 */
async function rotateBackups(): Promise<void> {
  try {
    const cutoffDate = Date.now() - (BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    
    // Find old backups
    const oldBackups = await db
      .select()
      .from(backups)
      .where(lt(backups.createdAt, cutoffDate));
    
    if (oldBackups.length === 0) {
      console.log("[Backup] No old backups to rotate");
      return;
    }
    
    console.log(`[Backup] Rotating ${oldBackups.length} old backup(s)...`);
    
    // Delete old backup records
    await db.delete(backups).where(lt(backups.createdAt, cutoffDate));
    
    // Note: S3 files remain for additional safety
    // They can be manually cleaned up if needed
    
    console.log(`[Backup] Rotated ${oldBackups.length} backup(s)`);
  } catch (error) {
    console.error("[Backup] Error rotating backups:", error);
  }
}

/**
 * Lists all available backups
 */
export async function listBackups(): Promise<typeof backups.$inferSelect[]> {
  return await db.select().from(backups).orderBy(desc(backups.createdAt));
}

/**
 * Verifies backup integrity by checking checksum
 */
export async function verifyBackup(backupId: number): Promise<{ valid: boolean; error?: string }> {
  try {
    const [backup] = await db.select().from(backups).where(eq(backups.id, backupId));
    
    if (!backup) {
      return { valid: false, error: "Backup not found" };
    }
    
    // Fetch backup file from S3
    const response = await fetch(backup.s3Url);
    if (!response.ok) {
      return { valid: false, error: "Failed to fetch backup file" };
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const calculatedChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
    
    if (calculatedChecksum !== backup.checksum) {
      return { valid: false, error: "Checksum mismatch - backup file may be corrupted" };
    }
    
    return { valid: true };
  } catch (error) {
    console.error("[Backup] Error verifying backup:", error);
    return { valid: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Restores database from backup
 * WARNING: This will replace all current data!
 */
export async function restoreBackup(backupId: number): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Backup] Starting restore from backup ID ${backupId}...`);
    
    // Verify backup first
    const verification = await verifyBackup(backupId);
    if (!verification.valid) {
      return { success: false, error: verification.error };
    }
    
    // Fetch backup
    const [backup] = await db.select().from(backups).where(eq(backups.id, backupId));
    if (!backup) {
      return { success: false, error: "Backup not found" };
    }
    
    // Download backup file
    const response = await fetch(backup.s3Url);
    const backupData: BackupData = await response.json();
    
    console.log("[Backup] Clearing existing data...");
    
    // Clear all tables (in reverse order to avoid FK constraints)
    await db.delete(projectPhases);
    await db.delete(activities);
    await db.delete(dailyTasks);
    await db.delete(projectComments);
    await db.delete(comments);
    await db.delete(attachments);
    await db.delete(announcements);
    await db.delete(purchaseOrderItems);
    await db.delete(purchaseOrders);
    await db.delete(quotations);
    await db.delete(products);
    await db.delete(suppliers);
    await db.delete(projects);
    await db.delete(tickets);
    await db.delete(permissionGroups);
    await db.delete(departments);
    // Don't delete users table to preserve admin access
    
    console.log("[Backup] Restoring data...");
    
    // Restore data (skip users to preserve current admin access)
    if (backupData.departments.length > 0) await db.insert(departments).values(backupData.departments);
    if (backupData.permissionGroups.length > 0) await db.insert(permissionGroups).values(backupData.permissionGroups);
    if (backupData.tickets.length > 0) await db.insert(tickets).values(backupData.tickets);
    if (backupData.projects.length > 0) await db.insert(projects).values(backupData.projects);
    if (backupData.suppliers.length > 0) await db.insert(suppliers).values(backupData.suppliers);
    if (backupData.products.length > 0) await db.insert(products).values(backupData.products);
    if (backupData.quotations.length > 0) await db.insert(quotations).values(backupData.quotations);
    if (backupData.purchaseOrders.length > 0) await db.insert(purchaseOrders).values(backupData.purchaseOrders);
    if (backupData.purchaseOrderItems.length > 0) await db.insert(purchaseOrderItems).values(backupData.purchaseOrderItems);
    if (backupData.announcements.length > 0) await db.insert(announcements).values(backupData.announcements);
    if (backupData.attachments.length > 0) await db.insert(attachments).values(backupData.attachments);
    if (backupData.comments.length > 0) await db.insert(comments).values(backupData.comments);
    if (backupData.projectComments.length > 0) await db.insert(projectComments).values(backupData.projectComments);
    if (backupData.dailyTasks.length > 0) await db.insert(dailyTasks).values(backupData.dailyTasks);
    if (backupData.activities.length > 0) await db.insert(activities).values(backupData.activities);
    if (backupData.projectPhases.length > 0) await db.insert(projectPhases).values(backupData.projectPhases);
    
    console.log("[Backup] Restore completed successfully");
    
    return { success: true };
  } catch (error) {
    console.error("[Backup] Error restoring backup:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
