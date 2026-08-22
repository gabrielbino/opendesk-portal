/**
 * GitHub Backup Service
 * Exports database data to JSON and pushes to GitHub repository
 * Uses GitHub REST API (no git CLI dependency) for production compatibility
 * Runs alongside the existing S3 backup for redundancy
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
const GITHUB_BRANCH = 'main';

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
const backups = (schema as any).backups;

interface BackupResult {
  success: boolean;
  message: string;
  timestamp?: string;
  recordCount?: number;
}

/**
 * Helper to make authenticated GitHub API requests
 */
async function githubFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpenDesk-Backup-System',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

/**
 * Export all database tables to in-memory JSON objects
 */
async function exportDatabaseToMemory(): Promise<{ files: Record<string, string>; recordCount: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  let totalRecords = 0;
  const files: Record<string, string> = {};

  // Define all tables to export
  const tables: Record<string, any> = {
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

  // Add dynamic tables if they exist
  const dynamicTables: Record<string, any> = {
    chatRatings,
    conversations,
    conversationMessages,
    conversationParticipants,
    operatorAvailability,
    chatQueue,
    notifications,
    purchasingTasks,
    kanbanColumnSettings,
    backups,
  };

  for (const [name, table] of Object.entries(dynamicTables)) {
    if (table) {
      tables[name] = table;
    }
  }

  // Export each table to JSON string
  for (const [name, table] of Object.entries(tables)) {
    try {
      const data = await db.select().from(table);
      files[`backups-data/${name}.json`] = JSON.stringify(data, null, 2);
      totalRecords += data.length;
      console.log(`[GitHub Backup] Exported ${name}: ${data.length} records`);
    } catch (error) {
      console.warn(`[GitHub Backup] Warning: Could not export table ${name}:`, error instanceof Error ? error.message : error);
    }
  }

  // Write metadata
  const metadata = {
    exportedAt: new Date().toISOString(),
    tables: Object.keys(tables),
    totalRecords,
    version: '1.0',
  };
  files['backups-data/_metadata.json'] = JSON.stringify(metadata, null, 2);

  return { files, recordCount: totalRecords };
}

/**
 * Get the SHA of the latest commit on the branch
 */
async function getLatestCommitSha(): Promise<string> {
  const response = await githubFetch(`${GITHUB_API_BASE}/git/ref/heads/${GITHUB_BRANCH}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get branch ref: ${response.status} ${await response.text()}`);
  }
  
  const data = await response.json();
  return data.object.sha;
}

/**
 * Get the tree SHA from a commit
 */
async function getTreeSha(commitSha: string): Promise<string> {
  const response = await githubFetch(`${GITHUB_API_BASE}/git/commits/${commitSha}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get commit: ${response.status}`);
  }
  
  const data = await response.json();
  return data.tree.sha;
}

/**
 * Create a blob for a file content
 */
async function createBlob(content: string): Promise<string> {
  const response = await githubFetch(`${GITHUB_API_BASE}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create blob: ${response.status}`);
  }
  
  const data = await response.json();
  return data.sha;
}

/**
 * Create a new tree with the backup files
 */
async function createTree(baseTreeSha: string, files: Record<string, string>): Promise<string> {
  const tree = [];
  
  for (const [filePath, content] of Object.entries(files)) {
    const blobSha = await createBlob(content);
    tree.push({
      path: filePath,
      mode: '100644',
      type: 'blob',
      sha: blobSha,
    });
  }
  
  const response = await githubFetch(`${GITHUB_API_BASE}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create tree: ${response.status}`);
  }
  
  const data = await response.json();
  return data.sha;
}

/**
 * Create a new commit
 */
async function createCommit(treeSha: string, parentSha: string, message: string): Promise<string> {
  const response = await githubFetch(`${GITHUB_API_BASE}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
      author: {
        name: 'OpenDesk Backup',
        email: 'backup@opendesk.com.br',
        date: new Date().toISOString(),
      },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create commit: ${response.status}`);
  }
  
  const data = await response.json();
  return data.sha;
}

/**
 * Update the branch reference to point to the new commit
 */
async function updateBranchRef(commitSha: string): Promise<void> {
  const response = await githubFetch(`${GITHUB_API_BASE}/git/refs/heads/${GITHUB_BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: commitSha,
      force: true,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update branch ref: ${response.status}`);
  }
}

/**
 * Push backup data to GitHub using the Git Data API
 * This replaces the git CLI approach for production compatibility
 */
async function pushToGitHubAPI(files: Record<string, string>): Promise<void> {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  
  console.log('[GitHub Backup] Getting latest commit...');
  const latestCommitSha = await getLatestCommitSha();
  
  console.log('[GitHub Backup] Getting base tree...');
  const baseTreeSha = await getTreeSha(latestCommitSha);
  
  console.log(`[GitHub Backup] Creating blobs for ${Object.keys(files).length} files...`);
  const newTreeSha = await createTree(baseTreeSha, files);
  
  console.log('[GitHub Backup] Creating commit...');
  const commitMessage = `Backup automático - ${timestamp}`;
  const newCommitSha = await createCommit(newTreeSha, latestCommitSha, commitMessage);
  
  console.log('[GitHub Backup] Updating branch reference...');
  await updateBranchRef(newCommitSha);
  
  console.log(`[GitHub Backup] Successfully pushed to GitHub at ${timestamp} (commit: ${newCommitSha.substring(0, 7)})`);
}

/**
 * Run full backup: export database + push to GitHub via API
 */
export async function runGitHubBackup(): Promise<BackupResult> {
  const timestamp = new Date().toISOString();
  
  try {
    console.log('[GitHub Backup] Starting full backup to GitHub...');
    
    // Step 1: Export database to in-memory JSON
    console.log('[GitHub Backup] Exporting database...');
    const { files, recordCount } = await exportDatabaseToMemory();
    
    // Step 2: Push to GitHub via API
    console.log('[GitHub Backup] Pushing to GitHub via API...');
    await pushToGitHubAPI(files);
    
    const message = `Backup completo: ${recordCount} registros exportados e enviados ao GitHub`;
    console.log(`[GitHub Backup] ${message}`);
    
    return {
      success: true,
      message,
      timestamp,
      recordCount,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GitHub Backup] Backup failed: ${errorMsg}`);
    
    return {
      success: false,
      message: `Falha no backup: ${errorMsg}`,
      timestamp,
    };
  }
}

/**
 * Run only the database export (without GitHub push)
 * Useful for manual backups or testing
 */
export async function runDatabaseExport(): Promise<BackupResult> {
  try {
    const { recordCount } = await exportDatabaseToMemory();
    return {
      success: true,
      message: `Exportação concluída: ${recordCount} registros`,
      timestamp: new Date().toISOString(),
      recordCount,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}
