const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../admin panel/src/pages/LacquerPlan/LacquerPlan.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add "Import Previous Plan" button to the header actions panel if single date is selected
const headerSearch = `<Link to={\`/lacquer-plan/add?date=\${selectedDate}\`} className="btn-accent shadow-sm px-4 py-2 rounded-3">`;

const headerReplace = `{(!fromDate && !toDate) && (
                        <button
                          onClick={handleImportPrevious}
                          className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold"
                          disabled={importing}
                          title="Import Previous Plan into selected date"
                        >
                          {importing ? (
                            <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Importing...</>
                          ) : (
                            <><i className="bi bi-arrow-down-square me-2" /> Import Previous Plan</>
                          )}
                        </button>
                      )}
                      <Link to={\`/lacquer-plan/add?date=\${selectedDate}\`} className="btn-accent shadow-sm px-4 py-2 rounded-3">`;

if (content.includes(headerSearch) && !content.includes('title="Import Previous Plan into selected date"')) {
  content = content.replace(headerSearch, headerReplace);
}

// 2. In handleSendToReadyToDispatch: update coated <= 0 message
content = content.replace(
  `    if (coated <= 0) {
      Swal.fire({
        icon: 'info',
        title: 'Dispatch Unavailable',
        text: 'No coated quantity has been recorded for this row yet.',
        toast: true,
        position: 'top-end',
        timer: 3000,
        showConfirmButton: false
      });
      return;
    }`,
  `    if (coated <= 0) {
      Swal.fire({
        icon: 'info',
        title: 'No Coating Done Yet',
        text: 'No coating done yet, nothing to send.',
        confirmButtonText: 'OK'
      });
      return;
    }`
);

// 3. In handleSendToReadyToDispatch: handle post-dispatch navigation / modal
const postDispatchSearch = `      if (sheetId) {
        const focusQuery = lineId ? \`?focus=\${lineId}\${!isExisting ? '&new=true' : ''}\` : '';
        navigate(\`/ready-to-dispatch/view/\${sheetId}\${focusQuery}\`);
      }`;

const postDispatchReplace = `      // Stay on Lacquer Plan page so the user sees updated/removed row, but offer navigation
      Swal.fire({
        icon: 'success',
        title: selectedOption === 'SPLIT_REMAINING_ORDER' ? 'Order Split & Dispatched' : 'Order Dispatched & Closed',
        text: selectedOption === 'SPLIT_REMAINING_ORDER'
          ? \`Dispatched \${selectedQty} units. Remaining \${remainingUncoated} units retained in active plan.\`
          : \`Dispatched \${selectedQty} units. Remaining \${remainingUncoated} units cancelled and row closed.\`,
        showConfirmButton: true,
        confirmButtonText: 'View in Ready To Dispatch',
        showCancelButton: true,
        cancelButtonText: 'Stay on Plan'
      }).then((result) => {
        if (result.isConfirmed && sheetId) {
          const focusQuery = lineId ? \`?focus=\${lineId}\${!isExisting ? '&new=true' : ''}\` : '';
          navigate(\`/ready-to-dispatch/view/\${sheetId}\${focusQuery}\`);
        }
      });`;

if (content.includes(postDispatchSearch)) {
  content = content.replace(postDispatchSearch, postDispatchReplace);
}

// 4. In handleImportPrevious: show exact Swal summary numbers
const importSuccessSearch = `        if (finalRes.data.success) {
          fetchPlans();
          Swal.fire(
            'Imported!',
            \`Previous plan imported \${importMode === 'with_changes' ? 'with edited changes' : 'with original values'}.\`,
            'success'
          );
        }
      } else {
        fetchPlans();
        Swal.fire('Imported!', 'Previous plan imported successfully.', 'success');
      }`;

const importSuccessReplace = `        if (finalRes.data.success) {
          fetchPlans();
          const summaryMsg = finalRes.data.message || \`\${finalRes.data.carriedCount || 0} rows carried, \${finalRes.data.completedSentCount || 0} completed rows sent to Ready To Dispatch, \${finalRes.data.notCarriedCount || 0} not carried\`;
          Swal.fire('Import Complete', summaryMsg, 'success');
        }
      } else {
        fetchPlans();
        const summaryMsg = res.data.message || \`\${res.data.carriedCount || 0} rows carried, \${res.data.completedSentCount || 0} completed rows sent to Ready To Dispatch, \${res.data.notCarriedCount || 0} not carried\`;
        Swal.fire('Import Complete', summaryMsg, 'success');
      }`;

if (content.includes(importSuccessSearch)) {
  content = content.replace(importSuccessSearch, importSuccessReplace);
}

// 5. In table row actions column: render Actions button purely from plan.readyActions (no eligibility logic in frontend)
const actionsColumnSearch = `{(() => {
                                const isProcessC = (plan.process || '').trim().toUpperCase() === 'C';
                                if (!isProcessC) return null;

                                const coated = Number(plan.coatingCompletedQty ?? plan.coatedQty ?? 0);
                                const sentQty = Number(plan.sentToReadyQty || 0);
                                const sendable = Math.max(0, coated - sentQty);
                                const isClosed = plan.isClosed || plan.productionStatus === 'CLOSED';
                                const isFullySent = coated > 0 && sendable === 0;

                                return (
                                  <>
                                    {sentQty > 0 && (
                                      <span
                                        className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 px-2 py-1 align-self-center"
                                        style={{ fontSize: 10, whiteSpace: 'nowrap' }}
                                        title={\`Sent \${sentQty} / \${coated}\`}
                                      >
                                        Sent \${sentQty} / \${coated}
                                      </span>
                                    )}
                                    {isClosed ? (
                                      <span
                                        className="badge bg-secondary px-2 py-1 align-self-center"
                                        style={{ fontSize: 10, whiteSpace: 'nowrap' }}
                                        title={plan.cancelledQty > 0 ? \`Closed (Cancelled: \${plan.cancelledQty})\` : 'Order Completed & Closed'}
                                      >
                                        CLOSED
                                      </span>
                                    ) : sendable > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => handleSendToReadyToDispatch(plan)}
                                        className="btn btn-sm btn-outline-success border-0 rounded-3 shadow-none p-2"
                                        title="Process C Production Actions"
                                      >
                                        <i className="bi bi-send fs-6"></i>
                                      </button>
                                    ) : coated === 0 ? (
                                      <button
                                        type="button"
                                        disabled
                                        className="btn btn-sm btn-outline-secondary border-0 rounded-3 shadow-none p-2 opacity-50"
                                        style={{ cursor: 'not-allowed' }}
                                        title="Dispatch unavailable: Coated quantity is 0"
                                      >
                                        <i className="bi bi-send fs-6"></i>
                                      </button>
                                    ) : isFullySent ? (
                                      <button
                                        type="button"
                                        disabled
                                        className="btn btn-sm btn-light border-0 rounded-3 shadow-none p-2 text-muted opacity-50"
                                        style={{ cursor: 'not-allowed' }}
                                        title="All coated quantity has been sent"
                                      >
                                        <i className="bi bi-send fs-6"></i>
                                      </button>
                                    ) : null}
                                  </>
                                );
                              })()}`;

const actionsColumnReplace = `{(() => {
                                const actions = plan.readyActions;
                                if (!actions || !actions.visible) return null;

                                const sentQty = Number(actions.sentQty || 0);
                                const coated = Number(actions.coatedQty || 0);

                                return (
                                  <>
                                    {sentQty > 0 && (
                                      <span
                                        className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 px-2 py-1 align-self-center"
                                        style={{ fontSize: 10, whiteSpace: 'nowrap' }}
                                        title={\`Sent \${sentQty} / \${coated}\`}
                                      >
                                        Sent \${sentQty} / \${coated}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleSendToReadyToDispatch(plan)}
                                      className="btn btn-sm btn-outline-success border-0 rounded-3 shadow-none p-2"
                                      title="Process C Production Actions"
                                    >
                                      <i className="bi bi-send fs-6"></i>
                                    </button>
                                  </>
                                );
                              })()}`;

if (content.includes(actionsColumnSearch)) {
  content = content.replace(actionsColumnSearch, actionsColumnReplace);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated LacquerPlan.jsx');
