const fs = require('fs');
const path = require('path');

function backupFile(filePath) {
  const rootDir = path.resolve(__dirname, '../..');
  const absPath = path.resolve(rootDir, filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found to back up: ${absPath}`);
  }
  const relPath = path.relative(rootDir, absPath);
  const backupDir = path.resolve(rootDir, 'Backend/backups/prompt_aw', path.dirname(relPath));
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.resolve(backupDir, path.basename(relPath));
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(absPath, backupPath);
    console.log(`[BACKUP] Saved ${relPath} -> ${backupPath}`);
  } else {
    console.log(`[BACKUP] Already backed up: ${backupPath}`);
  }
}

if (process.argv.length > 2) {
  for (let i = 2; i < process.argv.length; i++) {
    backupFile(process.argv[i]);
  }
}

module.exports = { backupFile };
