const fs = require('fs');
const filePath = 'admin panel/src/pages/Summary/CompanySummary.jsx';
let c = fs.readFileSync(filePath, 'utf8');

const t1 = '<td className="fw-bold text-dark">{row.challanNo}</td>';
const r1 = '<td className="fw-bold text-dark">{row.challanNo}{row.isImported && <span className="badge bg-secondary-subtle text-secondary border ms-1" style={{ fontSize: 10 }}>Imported</span>}</td>';

const t2 = '<td className="fw-bold text-dark">{row.gatePassNo || row.dcNo || \'-\'}</td>';
const r2 = '<td className="fw-bold text-dark">{row.gatePassNo || row.dcNo || \'-\'}{row.isImported && <span className="badge bg-secondary-subtle text-secondary border ms-1" style={{ fontSize: 10 }}>Imported</span>}</td>';

if (!c.includes(t1)) console.warn('Could not find t1');
if (!c.includes(t2)) console.warn('Could not find t2');

c = c.replace(t1, r1);
c = c.replace(t2, r2);

fs.writeFileSync(filePath, c, 'utf8');
console.log('Successfully patched CompanySummary.jsx');
