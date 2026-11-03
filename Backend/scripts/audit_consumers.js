const fs = require('fs');
const path = require('path');

function walk(dir, extFilter) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'build' && file !== 'backup' && file !== '_backups') {
        results = results.concat(walk(fullPath, extFilter));
      }
    } else {
      if (extFilter.some(ext => file.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const backendFiles = walk('Backend', ['.js', '.json']);
const frontendFiles = walk('admin panel', ['.jsx', '.js', '.tsx', '.ts']);

console.log(`Backend files: ${backendFiles.length}, Frontend files: ${frontendFiles.length}`);

const keywords = ['Incoming', 'Dispatch', 'ShrenoIncoming', 'incomings', 'dispatches', 'shrenoincomings'];

const hits = [];

backendFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
      hits.push({ file: f, keyword: kw, index: match.index });
    }
  });
});

console.log(`Total Backend keyword hits: ${hits.length}`);
const fileHits = {};
hits.forEach(h => {
  fileHits[h.file] = (fileHits[h.file] || 0) + 1;
});
console.log('Hits per file in Backend:');
console.log(JSON.stringify(fileHits, null, 2));
