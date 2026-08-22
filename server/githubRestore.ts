/**
 * GitHub Restore Service
 * Lists backup commits from GitHub and restores database from a specific commit
 */

import { getDb } from './db';
import { 
  users, departments, tickets, projects, suppliers, products, 
  purchaseOrders, purchaseOrderItems, quotations, permissionGroups, 
  announcements, attachments, comments, projectComments, dailyTasks, 
  activities, projectPhases 
} from "../drizzle/schema";
import * as schema from "../drizzle/schema";

const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN || '';
const GITHUB_OWNER = 'opendesktecnologia';
const GITHUB_REPO = 'CHAMADOS';
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

// Access dynamic tables
const chatRatings = (schema as any).chatRatings;
const conversations = (schema as any).conversations;
const conversationMessages = (schema as any).conversationMessages;
const conversationParticipants = (schema as any).conversationParticipants;
const operatorAvailability = (schema as any).operatorAvailability;
const chatQueue = (schema as any).chatQueue;
const notifications = (schema as any).notifications;
const purchasingTasks = (schema as any).purchasingTasks;
const kanbanColumnSettings = (schema as any).kanbanColumnSettings;
const backupsTable = (schema as any).backups;

interface GitHubCommit {
  sha: string;
  message: string;
  date: string;
  author: string;
  hasBackupData: boolean;
}

interface RestoreResult {
  success: boolean;
  message: string;
  tablesRestored?: string[];
  totalRecords?: number;
}

/**
 * Helper to make authenticated GitHub API requests
 */
async function githubFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpenDesk-Backup-System',
    },
  });
}

/**
 * List commits from the GitHub repository that contain backup data
 * Returns the most recent commits with information about whether they contain backup data files
 * Optimized: checks backup-data existence on latest commit first, then marks backup commits by message pattern
 */
export async function listGitHubBackups(limit: number = 30): Promise<GitHubCommit[]> {
  try {
    console.log('[GitHub Restore] Fetching commits from GitHub...');
    
    const response = await githubFetch(
      `${GITHUB_API_BASE}/commits?per_page=${limit}&sha=main`
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${errorText}`);
    }
    
    const commits = await response.json();
    
    // First, check which commits actually modified backups-data by looking at commit messages
    // and verifying the first backup commit has valid data
    const result: GitHubCommit[] = [];
    let verifiedBackupExists = false;
    
    for (const commit of commits) {
      const message = commit.commit.message || '';
      // A commit is a backup commit if it matches the backup message pattern
      const isBackupCommit = message.includes('Backup automático') || message.includes('backup');
      
      let hasBackupData = false;
      
      if (isBackupCommit && !verifiedBackupExists) {
        // Verify the first backup commit actually has data
        try {
          const treeResponse = await githubFetch(
            `${GITHUB_API_BASE}/contents/backups-data/_metadata.json?ref=${commit.sha}`
          );
          if (treeResponse.ok) {
            hasBackupData = true;
            verifiedBackupExists = true;
          }
        } catch {
          // No backup data in this commit
        }
      } else if (isBackupCommit && verifiedBackupExists) {
        // If we already verified one backup commit has data, 
        // other backup commits likely do too - verify individually
        try {
          const treeResponse = await githubFetch(
            `${GITHUB_API_BASE}/contents/backups-data/_metadata.json?ref=${commit.sha}`
          );
          hasBackupData = treeResponse.ok;
        } catch {
          hasBackupData = false;
        }
      }
      
      result.push({
        sha: commit.sha,
        message,
        date: commit.commit.author.date,
        author: commit.commit.author.name,
        hasBackupData,
      });
    }
    
    console.log(`[GitHub Restore] Found ${result.length} commits, ${result.filter(c => c.hasBackupData).length} with backup data`);
    
    return result;
  } catch (error) {
    console.error('[GitHub Restore] Error listing commits:', error);
    throw error;
  }
}

/**
 * Get the metadata of a backup from a specific commit
 */
export async function getGitHubBackupMetadata(commitSha: string): Promise<any> {
  try {
    const response = await githubFetch(
      `${GITHUB_API_BASE}/contents/backups-data/_metadata.json?ref=${commitSha}`
    );
    
    if (!response.ok) {
      throw new Error(`No backup metadata found in commit ${commitSha}`);
    }
    
    const fileData = await response.json();
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[GitHub Restore] Error fetching metadata:', error);
    throw error;
  }
}

/**
 * Download a specific backup data file from a GitHub commit
 */
async function downloadBackupFile(commitSha: string, filename: string): Promise<any[]> {
  const response = await githubFetch(
    `${GITHUB_API_BASE}/contents/backups-data/${filename}?ref=${commitSha}`
  );
  
  if (!response.ok) {
    console.warn(`[GitHub Restore] File not found: ${filename} in commit ${commitSha}`);
    return [];
  }
  
  const fileData = await response.json();
  
  // GitHub API returns content base64 encoded for files up to 1MB
  // For larger files, we need to use the blob API
  let content: string;
  
  if (fileData.content) {
    content = Buffer.from(fileData.content, 'base64').toString('utf-8');
  } else if (fileData.git_url) {
    // File is too large, fetch via blob API
    const blobResponse = await githubFetch(fileData.git_url);
    if (!blobResponse.ok) {
      console.warn(`[GitHub Restore] Could not fetch blob for ${filename}`);
      return [];
    }
    const blobData = await blobResponse.json();
    content = Buffer.from(blobData.content, 'base64').toString('utf-8');
  } else {
    console.warn(`[GitHub Restore] No content available for ${filename}`);
    return [];
  }
  
  try {
    return JSON.parse(content);
  } catch {
    console.warn(`[GitHub Restore] Invalid JSON in ${filename}`);
    return [];
  }
}

/**
 * Restore database from a specific GitHub commit
 * Downloads all backup data files and restores them to the database
 * WARNING: This will replace all current data!
 */
export async function restoreFromGitHub(commitSha: string): Promise<RestoreResult> {
  try {
    console.log(`[GitHub Restore] Starting restore from commit ${commitSha}...`);
    
    const db = await getDb();
    if (!db) throw new Error("Database connection not available");
    
    // Step 1: Verify the commit has backup data
    let metadata: any;
    try {
      metadata = await getGitHubBackupMetadata(commitSha);
      console.log(`[GitHub Restore] Backup metadata: exported at ${metadata.exportedAt}, ${metadata.totalRecords} records`);
    } catch {
      return { success: false, message: 'Este commit não contém dados de backup válidos' };
    }
    
    // Step 2: Download all table data files
    console.log('[GitHub Restore] Downloading backup data files...');
    
    // Map of table names to their Drizzle table objects
    const tableMap: Record<string, any> = {
      users,
      departments,
      tickets,
      projects,
      projectPhases,
      projectComments,
      dailyTasks,
      activities,
      comments,
      attachments,
      announcements,
      permissionGroups,
      suppliers,
      products,
      quotations,
      purchaseOrders,
      purchaseOrderItems,
    };
    
    // Add dynamic tables
    const dynamicTableMap: Record<string, any> = {
      chatRatings,
      conversations,
      conversationMessages,
      conversationParticipants,
      operatorAvailability,
      chatQueue,
      notifications,
      purchasingTasks,
      kanbanColumnSettings,
      backups: backupsTable,
    };
    
    for (const [name, table] of Object.entries(dynamicTableMap)) {
      if (table) {
        tableMap[name] = table;
      }
    }
    
    // Download data for each table
    const tableData: Record<string, any[]> = {};
    const availableTables = metadata.tables || Object.keys(tableMap);
    
    for (const tableName of availableTables) {
      if (tableMap[tableName]) {
        try {
          const data = await downloadBackupFile(commitSha, `${tableName}.json`);
          tableData[tableName] = data;
          console.log(`[GitHub Restore] Downloaded ${tableName}: ${data.length} records`);
        } catch (error) {
          console.warn(`[GitHub Restore] Could not download ${tableName}:`, error);
          tableData[tableName] = [];
        }
      }
    }
    
    // Step 3: Clear existing data (in reverse dependency order)
    console.log('[GitHub Restore] Clearing existing data...');
    
    // Delete in reverse dependency order to avoid FK constraint issues
    const deleteOrder = [
      'chatRatings',
      'conversationMessages',
      'conversationParticipants',
      'chatQueue',
      'operatorAvailability',
      'conversations',
      'notifications',
      'kanbanColumnSettings',
      'purchasingTasks',
      'projectPhases',
      'activities',
      'dailyTasks',
      'projectComments',
      'comments',
      'attachments',
      'announcements',
      'purchaseOrderItems',
      'purchaseOrders',
      'quotations',
      'products',
      'suppliers',
      'projects',
      'tickets',
      'permissionGroups',
      'departments',
      'backups',
      // Don't delete users to preserve admin access
    ];
    
    for (const tableName of deleteOrder) {
      if (tableMap[tableName]) {
        try {
          await db.delete(tableMap[tableName]);
          console.log(`[GitHub Restore] Cleared table: ${tableName}`);
        } catch (error) {
          console.warn(`[GitHub Restore] Could not clear ${tableName}:`, error instanceof Error ? error.message : error);
        }
      }
    }
    
    // Step 4: Restore data (in dependency order)
    console.log('[GitHub Restore] Restoring data...');
    
    const insertOrder = [
      'departments',
      'permissionGroups',
      'tickets',
      'projects',
      'suppliers',
      'products',
      'quotations',
      'purchaseOrders',
      'purchaseOrderItems',
      'announcements',
      'attachments',
      'comments',
      'projectComments',
      'dailyTasks',
      'activities',
      'projectPhases',
      'purchasingTasks',
      'kanbanColumnSettings',
      'notifications',
      'conversations',
      'operatorAvailability',
      'chatQueue',
      'conversationParticipants',
      'conversationMessages',
      'chatRatings',
      'backups',
    ];
    
    let totalRecords = 0;
    const tablesRestored: string[] = [];
    
    for (const tableName of insertOrder) {
      const data = tableData[tableName];
      if (data && data.length > 0 && tableMap[tableName]) {
        try {
          // Insert in batches to avoid query size limits
          const batchSize = 100;
          for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            await db.insert(tableMap[tableName]).values(batch);
          }
          totalRecords += data.length;
          tablesRestored.push(tableName);
          console.log(`[GitHub Restore] Restored ${tableName}: ${data.length} records`);
        } catch (error) {
          console.warn(`[GitHub Restore] Error restoring ${tableName}:`, error instanceof Error ? error.message : error);
        }
      }
    }
    
    const message = `Restauração concluída: ${totalRecords} registros restaurados em ${tablesRestored.length} tabelas a partir do commit ${commitSha.substring(0, 7)}`;
    console.log(`[GitHub Restore] ${message}`);
    
    return {
      success: true,
      message,
      tablesRestored,
      totalRecords,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GitHub Restore] Restore failed: ${errorMsg}`);
    return {
      success: false,
      message: `Falha na restauração: ${errorMsg}`,
    };
  }
}
