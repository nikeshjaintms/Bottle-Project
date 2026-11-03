const fs = require('fs');

function replaceInFile(filePath, searchStr, replaceStr) {
  let content = fs.readFileSync(filePath, 'utf8');
  const isCRLF = content.includes('\r\n');
  const normContent = content.replace(/\r\n/g, '\n');
  const normSearch = searchStr.replace(/\r\n/g, '\n');
  const normReplace = replaceStr.replace(/\r\n/g, '\n');

  if (!normContent.includes(normSearch)) {
    console.log(`[SKIP/WARN] Target not found in ${filePath} (may already be patched)`);
    return;
  }

  const updatedNorm = normContent.replace(normSearch, normReplace);
  const finalContent = isCRLF ? updatedNorm.replace(/\n/g, '\r\n') : updatedNorm;
  fs.writeFileSync(filePath, finalContent, 'utf8');
  console.log(`[SUCCESS] Patched ${filePath}`);
}

console.log('--- Applying Frontend Badges (Shreno & Summary) ---');

// 3. ShrenoIncomingList.jsx
const shrenoListPath = 'admin panel/src/pages/ShrenoIncoming/ShrenoIncomingList.jsx';
replaceInFile(
  shrenoListPath,
`                                <td rowSpan={inc.items.length} className="fw-bold text-primary border-bottom">
                                  {inc.challanNo}
                                </td>`,
`                                <td rowSpan={inc.items.length} className="fw-bold text-primary border-bottom">
                                  {inc.challanNo}
                                  {inc.isImported && (
                                    <span className="badge bg-secondary-subtle text-secondary border ms-1" style={{ fontSize: 10 }}>Imported</span>
                                  )}
                                </td>`
);

// 4. CompanySummary.jsx
const summaryPath = 'admin panel/src/pages/Summary/CompanySummary.jsx';
replaceInFile(
  summaryPath,
`                          <td className="fw-bold text-dark">{row.challanNo}</td>`,
`                          <td className="fw-bold text-dark">
                            {row.challanNo}
                            {row.isImported && (
                              <span className="badge bg-secondary-subtle text-secondary border ms-1" style={{ fontSize: 10 }}>Imported</span>
                            )}
                          </td>`
);

replaceInFile(
  summaryPath,
`                          <td className="fw-bold text-dark">{row.gatePassNo || row.dcNo || '-'}</td>`,
`                          <td className="fw-bold text-dark">
                            {row.gatePassNo || row.dcNo || '-'}
                            {row.isImported && (
                              <span className="badge bg-secondary-subtle text-secondary border ms-1" style={{ fontSize: 10 }}>Imported</span>
                            )}
                          </td>`
);

console.log('--- All Frontend Badges Applied! ---');
