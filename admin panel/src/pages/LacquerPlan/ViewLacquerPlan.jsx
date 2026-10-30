const renderUsedFrom = (allocation) => {
  if (!Array.isArray(allocation) || allocation.length === 0) return null;
  const parts = allocation
    .filter(a => Number(a.qty) !== 0)
    .map(a => {
      const name = a.companyName || a.companyId?.name || (typeof a.companyId === 'string' ? a.companyId : 'Company');
      const q = a.qty > 0 ? `+${a.qty}` : `${a.qty}`;
      return `${name} ${q}`;
    });
  if (parts.length === 0) return null;
  return (
    <div className="small text-muted mt-1 text-center font-monospace" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
      Used from: {parts.join(', ')}
    </div>
  );
};

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchLacquerPlanById, clearCurrentPlan } from '../../redux/slices/lacquerPlanSlice';
import { useLacquerPlanLanguage } from '../../hooks/useLacquerPlanLanguage';

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

export default function ViewLacquerPlan() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentPlan, loading, error } = useSelector((state) => state.lacquerPlans);
  const { labels, toggleLanguage, language } = useLacquerPlanLanguage();

  const [openRows, setOpenRows] = useState({ 0: true });
  const [showAllOrderEntries, setShowAllOrderEntries] = useState({});
  const [showAllCoatingEntries, setShowAllCoatingEntries] = useState({});

  useEffect(() => {
    dispatch(fetchLacquerPlanById(id));
    return () => dispatch(clearCurrentPlan());
  }, [dispatch, id]);

  if (loading) {
    return <div className="text-center py-5">Loading...</div>;
  }

  if (!currentPlan) {
    return (
      <div className="page-content lacquer-plan-page lacquer-plan-view-page">
        <div className="alert alert-danger" role="alert">{error || 'Lacquer plan not found.'}</div>
        <button type="button" onClick={() => navigate('/lacquer-plan')} className="btn-ghost px-4 py-2">
          {labels.close}
        </button>
      </div>
    );
  }

  const getVariantName = (plan) => plan.variantId?.variantName || plan.variantName || '-';

  // View only the particular selected plan entry that was clicked
  const planEntries = [currentPlan];

  const toggleRowAccordion = (idx) => {
    setOpenRows((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const getTypeLabel = (type) => {
    if (!type) return '-';
    const lower = type.toLowerCase();
    if (lower.includes('opening')) return labels.openingBalance || 'Opening balance';
    if (lower.includes('removed')) return labels.removed || 'Removed';
    if (lower.includes('edit')) return labels.editAdjustment || 'Edit adjustment';
    if (lower.includes('added')) return labels.added || 'Added';
    return type;
  };

  return (
    <div className="page-content lacquer-plan-page lacquer-plan-view-page">
      <div className="d-flex justify-content-between align-items-end mb-4 lacquer-plan-view-header">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">{labels.view}</h1>
            <p className="page-subtitle mb-0">{labels.detailsOfSelectedPlan || 'Details of the selected lacquer plan'}</p>
          </div>
        </div>
        <div>
          <button onClick={toggleLanguage} className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold">
            {language === 'en' ? 'ગુજરાતી' : 'English'}
          </button>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="dash-card border-0 shadow-sm p-4 lacquer-plan-view-card">
            {error && <div className="alert alert-danger">{error}</div>}
            
            <div className="row g-3 mb-4 pb-4 border-bottom align-items-center">
              <div className="col-md-3">
                <label className="form-label fw-bold small">{labels.date}</label>
                <input type="date" className="form-control shadow-none bg-light" disabled
                       value={currentPlan.planDate ? new Date(currentPlan.planDate).toISOString().split('T')[0] : ''} />
              </div>
            </div>

            <div className="bg-white border border-light-subtle rounded-3 p-4 mb-4 shadow-sm position-relative lacquer-plan-section">
                <div className="row g-4 mb-4 bg-light p-3 rounded mx-0">
                  <div className="col-md-4">
                    <label className="form-label fw-bold small text-primary">{labels.company}</label>
                    <input type="text" className="form-control shadow-none bg-white" disabled value={currentPlan.companyId?.name || currentPlan.companyName || '-'} />
                  </div>
                  <div className="col-md-5">
                    <label className="form-label fw-bold small text-primary">{labels.brand}</label>
                    <input type="text" className="form-control shadow-none bg-white" disabled value={currentPlan.brandId?.name || currentPlan.brandName || '-'} />
                  </div>
                </div>

                <div className="d-flex align-items-center justify-content-between mb-3 mt-2">
                  <h6 className="fw-bold text-muted mb-0">{labels.planEntries || 'PLAN ENTRIES'}</h6>
                </div>

                <div className="table-responsive mb-4 lacquer-plan-view-table">
                  <table className="table table-bordered align-middle table-sm" style={{ minWidth: '2400px' }}>
                    <thead className="table-light">
                      <tr>
                        <th className="small text-muted text-center align-middle" style={{ width: '3%' }}>{labels.sr}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '12%', minWidth: '200px' }}>{labels.bottleName}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '12%', minWidth: '200px' }}>{labels.variant}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '12%', minWidth: '200px' }}>{labels.coatingShade}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.process}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.plainStock}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '7%' }}>{labels.orderQty}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '9%' }}>{labels.coatingCompletedQty}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '9%' }}>{labels.balanceToMake}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.bottlePerBox}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '6%' }}>{labels.noOfOrderBoxes}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '9%' }}>{labels.dispatchPendingQty}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '5%' }}>{labels.soldQty}</th>
                        <th className="small text-muted text-center align-middle" style={{ width: '15%', minWidth: '250px' }}>{labels.remarks}</th>
                      </tr>
                    </thead>
                    <tbody className="border-top-0">
                      {planEntries.map((row, idx) => (
                        <tr key={row._id || idx}>
                          <td className="text-center">{idx + 1}</td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={row.plainBottle || row.bottleName || '-'} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={getVariantName(row)} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={row.coatingShade || row.colour || '-'} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={row.process || '-'} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={row.plainStock ?? '0'} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center fw-bold" disabled value={row.orderQty ?? '0'} /></td>
                          <td>
                            <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={row.coatingCompletedQty ?? row.coatedQty ?? '0'} />
                            {renderUsedFrom(row.stockAllocation)}
                          </td>
                          <td><input type="text" className={`form-control form-control-sm shadow-none bg-light text-center fw-bold ${(row.balanceToMake ?? 0) >= 0 ? 'text-success' : 'text-danger'}`} disabled value={row.balanceToMake ?? '0'} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={row.boxQty ?? '0'} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={row.noOfBoxes ?? '0'} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={row.dispatchPendingQty ?? row.dispatchBalance ?? '0'} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={row.soldQty ?? '0'} /></td>
                          <td><input type="text" className="form-control form-control-sm shadow-none bg-light" disabled value={row.remarks || '-'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* History Section */}
                <div className="mt-5 pt-3 border-top">
                  <div className="d-flex align-items-center justify-content-between mb-4">
                    <h5 className="fw-bold text-dark mb-0">
                      <i className="bi bi-clock-history me-2 text-primary"></i>
                      {labels.history || 'History'}
                    </h5>
                  </div>

                  <div className="d-flex flex-column gap-4">
                    {planEntries.map((row, rIdx) => {
                      const isAccordionOpen = !!openRows[rIdx];
                      const history = row.history || {};
                      const orderRows = history.orderHistory || [];
                      const coatingRows = history.coatingHistory || [];
                      const orderSummary = history.orderSummary || { opening: row.orderQty || 0, totalAdded: 0, current: row.orderQty || 0 };
                      const coatingSummary = history.coatingSummary || { opening: row.coatingCompletedQty || 0, totalAdded: 0, current: row.coatingCompletedQty || 0 };

                      const showAllOrder = !!showAllOrderEntries[rIdx];
                      const displayedOrderRows = (orderRows.length > 50 && !showAllOrder)
                        ? orderRows.slice(-50)
                        : orderRows;

                      const showAllCoating = !!showAllCoatingEntries[rIdx];
                      const displayedCoatingRows = (coatingRows.length > 50 && !showAllCoating)
                        ? coatingRows.slice(-50)
                        : coatingRows;

                      const bottleLabel = row.plainBottle || row.bottleName || '-';
                      const variantLabel = getVariantName(row);
                      const shadeLabel = row.coatingShade || row.colour || '-';

                      return (
                        <div key={row._id || rIdx} className="card border shadow-sm rounded-3 overflow-hidden">
                          {/* Collapsible Header */}
                          <div
                            className="card-header bg-white py-3 px-4 d-flex align-items-center justify-content-between"
                            style={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => toggleRowAccordion(rIdx)}
                          >
                            <div className="d-flex align-items-center gap-3 flex-wrap">
                              <span className="badge bg-primary px-2 py-1 fs-6">
                                #{String(rIdx + 1).padStart(2, '0')}
                              </span>
                              <span className="fw-bold text-dark fs-6">{bottleLabel}</span>
                              <span className="badge bg-soft-primary text-primary px-2 py-1">{variantLabel}</span>
                              <span className="badge bg-soft-warning text-warning-accent px-2 py-1">{shadeLabel}</span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm btn-light border-0 shadow-none rounded-circle"
                              style={{ width: 32, height: 32 }}
                              onClick={(e) => { e.stopPropagation(); toggleRowAccordion(rIdx); }}
                            >
                              <i className={`bi bi-chevron-${isAccordionOpen ? 'up' : 'down'}`}></i>
                            </button>
                          </div>

                          {/* Collapsible Content */}
                          {isAccordionOpen && (
                            <div className="card-body p-4 bg-white">
                              {/* Summary Section */}
                              <div className="row g-3 mb-4 p-3 bg-light rounded-3 border">
                                <div className="col-md-6 border-end-md">
                                  <div className="fw-bold small text-muted text-uppercase mb-2">
                                    <i className="bi bi-cart-check me-1 text-primary"></i>
                                    {labels.orderQty} {labels.history}
                                  </div>
                                  <div className="d-flex gap-4 small flex-wrap">
                                    <div>{labels.opening}: <strong className="fs-6">{orderSummary.opening ?? 0}</strong></div>
                                    <div>{labels.totalAdded}: <strong className="fs-6 text-primary">{orderSummary.totalAdded >= 0 ? `+${orderSummary.totalAdded}` : orderSummary.totalAdded}</strong></div>
                                    <div>{labels.current}: <strong className="fs-6 text-success">{orderSummary.current ?? 0}</strong></div>
                                  </div>
                                </div>
                                <div className="col-md-6">
                                  <div className="fw-bold small text-muted text-uppercase mb-2">
                                    <i className="bi bi-paint-bucket me-1 text-warning"></i>
                                    {labels.coatingCompletedQty} {labels.history}
                                  </div>
                                  <div className="d-flex gap-4 small flex-wrap">
                                    <div>{labels.opening}: <strong className="fs-6">{coatingSummary.opening ?? 0}</strong></div>
                                    <div>{labels.totalAdded}: <strong className="fs-6 text-primary">{coatingSummary.totalAdded >= 0 ? `+${coatingSummary.totalAdded}` : coatingSummary.totalAdded}</strong></div>
                                    <div>{labels.current}: <strong className="fs-6 text-success">{coatingSummary.current ?? 0}</strong></div>
                                  </div>
                                </div>
                              </div>

                              <div className="row g-4">
                                {/* Order Qty History Table */}
                                <div className="col-xl-6 col-lg-12">
                                  <div className="d-flex align-items-center justify-content-between mb-2">
                                    <h6 className="fw-bold text-dark mb-0">
                                      {labels.orderQtyHistory || 'Order Qty History'} ({orderRows.length})
                                    </h6>
                                    {orderRows.length > 50 && !showAllOrder && (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-primary py-0 px-2"
                                        onClick={() => setShowAllOrderEntries(p => ({ ...p, [rIdx]: true }))}
                                      >
                                        {labels.loadOlderEntries || 'Load older entries'} ({orderRows.length - 50} remaining)
                                      </button>
                                    )}
                                  </div>
                                  <div className="table-responsive border rounded-2">
                                    <table className="table table-sm table-bordered table-hover align-middle mb-0 text-center" style={{ minWidth: 500 }}>
                                      <thead className="table-light">
                                        <tr>
                                          <th style={{ width: '8%' }}>{labels.sr}</th>
                                          <th style={{ width: '28%' }}>{labels.dateTime || 'Date & Time'}</th>
                                          <th style={{ width: '24%' }}>{labels.type || 'Type'}</th>
                                          <th style={{ width: '20%' }}>{labels.orderQty || 'Order Qty'}</th>
                                          <th style={{ width: '20%' }}>{labels.balanceToMake || 'Balance to Make'}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {displayedOrderRows.map((entry, eIdx) => {
                                          const isDel = !!entry.isDeleted;
                                          return (
                                            <tr key={entry._id || eIdx} className={isDel ? 'table-danger text-muted' : ''}>
                                              <td>{entry.sr || (eIdx + 1)}</td>
                                              <td className="small">{formatDateTime(entry.at)}</td>
                                              <td>
                                                {isDel ? (
                                                  <span className="badge bg-danger">{labels.removed || 'Removed'}</span>
                                                ) : (
                                                  <span className={`badge ${entry.rawType === 'opening' ? 'bg-secondary' : entry.rawType === 'edit-adjustment' ? 'bg-warning text-dark' : 'bg-primary'}`}>
                                                    {getTypeLabel(entry.type)}
                                                  </span>
                                                )}
                                              </td>
                                              <td className={`fw-bold ${isDel ? 'text-decoration-line-through text-muted' : entry.displayQty?.startsWith('-') ? 'text-danger' : 'text-primary'}`}>
                                                {entry.displayQty || entry.qtyChange}
                                              </td>
                                              <td className={`fw-bold ${isDel ? 'text-decoration-line-through text-muted' : (entry.balance >= 0 ? 'text-success' : 'text-danger')}`}>
                                                {entry.balance}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                        {/* Current Total Row */}
                                        <tr className="table-light fw-bold border-top border-2">
                                          <td colSpan={3} className="text-end pe-3 text-uppercase">
                                            {labels.currentTotal || 'Current Total'}:
                                          </td>
                                          <td className="text-primary">{row.orderQty ?? orderSummary.current ?? 0}</td>
                                          <td className={(row.balanceToMake ?? 0) >= 0 ? 'text-success' : 'text-danger'}>
                                            {row.balanceToMake ?? 0}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* Coating Completed History Table */}
                                <div className="col-xl-6 col-lg-12">
                                  <div className="d-flex align-items-center justify-content-between mb-2">
                                    <h6 className="fw-bold text-dark mb-0">
                                      {labels.coatingCompletedHistory || 'Coating Completed History'} ({coatingRows.length})
                                    </h6>
                                    {coatingRows.length > 50 && !showAllCoating && (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-primary py-0 px-2"
                                        onClick={() => setShowAllCoatingEntries(p => ({ ...p, [rIdx]: true }))}
                                      >
                                        {labels.loadOlderEntries || 'Load older entries'} ({coatingRows.length - 50} remaining)
                                      </button>
                                    )}
                                  </div>
                                  <div className="table-responsive border rounded-2">
                                    <table className="table table-sm table-bordered table-hover align-middle mb-0 text-center" style={{ minWidth: 500 }}>
                                      <thead className="table-light">
                                        <tr>
                                          <th style={{ width: '8%' }}>{labels.sr}</th>
                                          <th style={{ width: '22%' }}>{labels.dateTime || 'Date & Time'}</th>
                                          <th style={{ width: '18%' }}>{labels.type || 'Type'}</th>
                                          <th style={{ width: '18%' }}>{labels.coatingCompletedQty || 'Coating Completed Qty'}</th>
                                          <th style={{ width: '18%' }}>{labels.usedFrom || 'Used from'}</th>
                                          <th style={{ width: '16%' }}>{labels.balanceToMake || 'Balance to Make'}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {displayedCoatingRows.map((entry, eIdx) => {
                                          const isDel = !!entry.isDeleted;
                                          return (
                                            <tr key={entry._id || eIdx} className={isDel ? 'table-danger text-muted' : ''}>
                                              <td>{entry.sr || (eIdx + 1)}</td>
                                              <td className="small">{formatDateTime(entry.at)}</td>
                                              <td>
                                                {isDel ? (
                                                  <span className="badge bg-danger">{labels.removed || 'Removed'}</span>
                                                ) : (
                                                  <span className={`badge ${entry.rawType === 'opening' ? 'bg-secondary' : entry.rawType === 'edit-adjustment' ? 'bg-warning text-dark' : 'bg-success'}`}>
                                                    {getTypeLabel(entry.type)}
                                                  </span>
                                                )}
                                              </td>
                                              <td className={`fw-bold ${isDel ? 'text-decoration-line-through text-muted' : entry.displayQty?.startsWith('-') ? 'text-danger' : 'text-success'}`}>
                                                {entry.displayQty || entry.qtyChange}
                                              </td>
                                              <td className={`small ${isDel ? 'text-decoration-line-through text-muted' : ''}`}>
                                                {entry.usedFromText || '-'}
                                              </td>
                                              <td className={`fw-bold ${isDel ? 'text-decoration-line-through text-muted' : (entry.balance >= 0 ? 'text-success' : 'text-danger')}`}>
                                                {entry.balance}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                        {/* Current Total Row */}
                                        <tr className="table-light fw-bold border-top border-2">
                                          <td colSpan={3} className="text-end pe-3 text-uppercase">
                                            {labels.currentTotal || 'Current Total'}:
                                          </td>
                                          <td className="text-success">{row.coatingCompletedQty ?? row.coatedQty ?? coatingSummary.current ?? 0}</td>
                                          <td className="small text-muted">{coatingSummary.totalUsedFromText || '-'}</td>
                                          <td className={(row.balanceToMake ?? 0) >= 0 ? 'text-success' : 'text-danger'}>
                                            {row.balanceToMake ?? 0}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
            </div>

            <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
              <button type="button" onClick={() => navigate('/lacquer-plan')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
                {labels.close}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
