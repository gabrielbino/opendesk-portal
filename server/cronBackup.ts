/**
 * Daily backup cron job
 * This script runs daily at 2 AM to create automatic database backups
 */

import { createBackup } from './backupService';

async function runDailyBackup() {
  console.log('[Cron] Starting daily backup...');
  
  try {
    const result = await createBackup('System (Automated)');
    
    if (result.success) {
      console.log(`[Cron] Daily backup completed successfully. Backup ID: ${result.backupId}`);
    } else {
      console.error(`[Cron] Daily backup failed: ${result.error}`);
    }
  } catch (error) {
    console.error('[Cron] Error during daily backup:', error);
  }
}

// ESM-compatible check for direct execution
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  runDailyBackup()
    .then(() => {
      console.log('[Cron] Backup job finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Cron] Backup job failed:', error);
      process.exit(1);
    });
}

export { runDailyBackup };
