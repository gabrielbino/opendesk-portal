import mysql from 'mysql2/promise';

const LEGACY_MODULE_NAMES = {
  'chamados': 'suporte',
  'ecommerce': 'compras',
  'projetos': 'desenvolvimento',
};

async function syncAllUserPermissions() {
  console.log('[Sync] Starting user permissions sync...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'helpdesk',
  });

  try {
    // Get all users with array permissions
    const [users] = await connection.query('SELECT id, name, permissions FROM users');
    console.log(`[Sync] Found ${users.length} users`);

    let updated = 0;
    let converted = 0;
    
    for (const user of users) {
      let perms = user.permissions;
      
      // Parse if string
      if (typeof perms === 'string') {
        try {
          perms = JSON.parse(perms);
        } catch {
          console.log(`[Sync] Skipping user ${user.id} - invalid JSON`);
          continue;
        }
      }
      
      // Check if permissions is an array (old format)
      if (Array.isArray(perms)) {
        console.log(`[Sync] Converting user ${user.id} (${user.name}) from array to object format`);
        
        // Convert array to object
        const permObj = {};
        for (const module of perms) {
          const mappedModule = LEGACY_MODULE_NAMES[module] || module;
          permObj[mappedModule] = true;
        }
        
        // Update user
        await connection.query(
          'UPDATE users SET permissions = ? WHERE id = ?',
          [JSON.stringify(permObj), user.id]
        );
        
        updated++;
        converted++;
      }
      // Check if permissions is an object with legacy module names
      else if (typeof perms === 'object' && perms !== null) {
        let hasLegacyNames = false;
        const permObj = {};
        
        for (const [key, value] of Object.entries(perms)) {
          const mappedModule = LEGACY_MODULE_NAMES[key] || key;
          if (mappedModule !== key) {
            hasLegacyNames = true;
          }
          permObj[mappedModule] = value;
        }
        
        if (hasLegacyNames) {
          console.log(`[Sync] Converting user ${user.id} (${user.name}) from legacy module names to current names`);
          
          // Update user
          await connection.query(
            'UPDATE users SET permissions = ? WHERE id = ?',
            [JSON.stringify(permObj), user.id]
          );
          
          updated++;
          converted++;
        }
      }
    }
    
    console.log(`[Sync] Completed! Updated ${updated} users, converted ${converted} legacy formats`);
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('[Sync] Error:', error);
    await connection.end();
    process.exit(1);
  }
}

syncAllUserPermissions();
