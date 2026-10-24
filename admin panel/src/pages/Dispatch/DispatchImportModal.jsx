import React, { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import API from '../../services/api';
import Swal from 'sweetalert2';
import AddBottleModal from '../../components/AddBottleModal';

export default function DispatchImportModal({ show, onClose, onImportComplete, companyId: propCompanyId }) {
  const { companyId: routeCompanyId } = useParams();
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedSheets, setExpandedSheets] = useState({});
  const [filterTab, setFilterTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [activeSheetTab, setActiveSheetTab] = useState(null);
  const fileInputRef = useRef(null);
  const [showAddBottleModal, setShowAddBottleModal] = useState(false);
  const [selectedBottleForAdd, setSelectedBottleForAdd] = useState(null);
  const [bottleMatchSuggestions, setBottleMatchSuggestions] = useState([]);

  if (!show) return null;

  const getEffectiveCompanyId = () => {
    return propCompanyId || routeCompanyId || previewData?.companyId || '';
  };

  const handleBottleCreated = async () => {
    setShowAddBottleModal(false);
    setSelectedBottleForAdd(null);
    
    if (!file) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const activeCompId = getEffectiveCompanyId();
      if (activeCompId) formData.append('companyId', activeCompId);

      const res = await API.post('/dispatch/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setPreviewData(res.data.data);
      }
    } catch (err) {
      Swal.fire('Error', 'Failed to refresh preview after adding bottle', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddBottle = (bottleName, suggestedBottles = []) => {
    setSelectedBottleForAdd(bottleName);
    setBottleMatchSuggestions(suggestedBottles);
    setShowAddBottleModal(true);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handlePreview = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    const activeCompId = getEffectiveCompanyId();
    if (activeCompId) formData.append('companyId', activeCompId);

    setLoading(true);
    try {
      const res = await API.post('/dispatch/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setPreviewData(res.data.data);
        setExpandedSheets({});
        setActiveSheetTab(null);
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Failed to parse file', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!previewData) return;

    const totalValid = previewData.sheets.reduce((acc, s) => acc + s.validRows, 0);
    if (totalValid === 0) {
      // Zero valid rows - Orange "No Records Imported" popup with grouped reasons
      const groupedReasons = previewData.sheets
        .filter(s => s.invalidRows > 0 && s.errorSummary && s.errorSummary.length > 0)
        .flatMap(s => s.errorSummary);

      Swal.fire({
        title: 'No Records Imported',
        html: `<div style="text-align: left;">
          <p><strong style="color: #e74c3c;">${previewData.invalidRows} rows were skipped</strong> due to missing bottles:</p>
          <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; max-height: 200px; overflow-y: auto; text-align: left; font-size: 12px;">
            ${groupedReasons.map(err => `<div style="margin: 4px 0; color: #555;">❌ ${err}</div>`).join('')}
          </div>
          <p style="margin-top: 12px; color: #666; font-size: 13px;"><i class="bi bi-info-circle"></i> Add missing bottles using the Add button in View Details and try importing again.</p>
        </div>`,
        icon: 'warning',
        confirmButtonText: 'Close'
      });
      return;
    }

    setLoading(true);
    try {
      const activeCompId = getEffectiveCompanyId();
      const res = await API.post('/dispatch/import/commit', {
        sheetsToImport: previewData.sheets,
        companyId: activeCompId
      });
      if (res.data.success) {
        const imported = res.data.data.dispatchImported ?? 0;
        const skipped = res.data.data.dispatchSkipped ?? 0;
        const totalValidRows = res.data.data.totalValidRows ?? totalValid;
        const invalidRows = res.data.data.invalidRows ?? previewData.invalidRows;
        const groupsCount = res.data.data.groupsCount ?? res.data.data.affectedGroupsCount ?? 0;
        const skipSummary = res.data.data.skipSummary || [];
        const invalidReasons = res.data.data.invalidReasons || [];

        if (totalValidRows === 0 && imported === 0) {
          // Zero valid rows - Orange "No Records Imported" popup
          Swal.fire({
            title: 'No Records Imported',
            html: `<div style="text-align: left;">
              <p><strong style="color: #e74c3c;">${invalidRows} rows were skipped</strong> due to missing bottles:</p>
              <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; max-height: 200px; overflow-y: auto; text-align: left; font-size: 12px;">
                ${invalidReasons.map(err => `<div style="margin: 4px 0; color: #555;">❌ ${err}</div>`).join('')}
              </div>
              <p style="margin-top: 12px; color: #666; font-size: 13px;"><i class="bi bi-info-circle"></i> Add missing bottles using the Add button in View Details and try importing again.</p>
            </div>`,
            icon: 'warning',
            confirmButtonText: 'Close'
          });
        } else {
          // Success popup (same style as Incoming)
          // "Imported X of Y valid lines in G groups. Skipped Z (already existing)."
          // with per-row reasons for skipped rows, and a separate short line "N rows were invalid (see the table)."
          let skipHtml = '';
          if (skipped > 0) {
            skipHtml = `
              <div style="margin-top: 12px; text-align: left; background: #fff3cd; padding: 12px; border-radius: 6px; border-left: 4px solid #ffc107;">
                <strong style="color: #856404;">Skipped ${skipped} (already existing):</strong><br>
                <div style="max-height: 150px; overflow-y: auto; margin-top: 6px;">
                  ${skipSummary.slice(0, 10).map(err => `<div style="font-size: 12px; margin: 3px 0; color: #666;">• ${err}</div>`).join('')}
                  ${skipSummary.length > 10 ? `<div style="font-size: 11px; color: #999; margin-top: 4px;">... and ${skipSummary.length - 10} more</div>` : ''}
                </div>
              </div>`;
          }

          let invalidHtml = '';
          if (invalidRows > 0) {
            invalidHtml = `
              <div style="margin-top: 10px; font-size: 13px; color: #721c24; text-align: left;">
                <strong>${invalidRows} rows were invalid (see the table).</strong>
              </div>`;
          }

          Swal.fire({
            title: 'Import Successful',
            html: `<div style="text-align: left;">
              <div style="background: #d4edda; padding: 12px; border-radius: 6px; border-left: 4px solid #28a745; margin-bottom: 8px;">
                <strong style="color: #155724;">✓ Imported ${imported} of ${totalValidRows} valid lines.${skipped > 0 ? ` Skipped ${skipped} (already existing).` : ''}</strong>
              </div>
              ${invalidHtml}
              ${skipHtml}
            </div>`,
            icon: 'success',
            confirmButtonText: 'OK'
          });

          onImportComplete();
          setTimeout(() => {
            handleReset();
            onClose();
          }, 500);
        }
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Failed to import records', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreviewData(null);
    setExpandedSheets({});
    setFilterTab('ALL');
    setSearch('');
    setActiveSheetTab(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getFilteredRecords = (records) => {
    let filtered = records || [];

    if (filterTab === 'VALID') {
      filtered = filtered.filter(r => r.isValid);
    } else if (filterTab === 'INVALID') {
      filtered = filtered.filter(r => !r.isValid);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(r =>
        (r.gatePass || '').toString().toLowerCase().includes(searchLower) ||
        (r.bottleSheetName || '').toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  };

  const renderDetailsView = () => {
    const activeData = previewData.sheets.find(s => s.sheetName === activeSheetTab);
    if (!activeData) return null;

    // Use activeData.groups or fallback to grouping records
    let rawGroups = activeData.groups && activeData.groups.length > 0 ? activeData.groups : [];
    if (rawGroups.length === 0 && activeData.records && activeData.records.length > 0) {
      const gMap = new Map();
      for (const r of activeData.records) {
        const k = `${r.date}__${r.gatePass}`;
        if (!gMap.has(k)) {
          gMap.set(k, {
            groupKey: k,
            date: r.date,
            gatePass: r.gatePass,
            shade: r.shade,
            subtotalQty: 0,
            lines: []
          });
        }
        gMap.get(k).lines.push(r);
        gMap.get(k).subtotalQty += Number(r.total) || 0;
      }
      rawGroups = Array.from(gMap.values());
    }

    // Filter groups and lines
    const filteredGroups = [];
    let grandTotal = 0;

    for (const group of rawGroups) {
      const matchingLines = (group.lines || []).filter(rec => {
        if (filterTab === 'VALID' && !rec.isValid) return false;
        if (filterTab === 'INVALID' && rec.isValid) return false;
        if (search) {
          const s = search.toLowerCase();
          const gpMatch = String(rec.gatePass || group.gatePass || '').toLowerCase().includes(s);
          const varMatch = String(rec.variant || '').toLowerCase().includes(s);
          const shadeMatch = String(rec.shade || group.shade || '').toLowerCase().includes(s);
          if (!gpMatch && !varMatch && !shadeMatch) return false;
        }
        return true;
      });

      if (matchingLines.length > 0) {
        const groupSubtotal = matchingLines.reduce((s, r) => s + (Number(r.total) || 0), 0);
        grandTotal += groupSubtotal;
        filteredGroups.push({
          ...group,
          filteredLines: matchingLines,
          subtotal: groupSubtotal
        });
      }
    }

    return (
      <div className="d-flex flex-column h-100">
        <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn btn-primary shadow-sm"
              onClick={() => setActiveSheetTab(null)}
              style={{ padding: '0.5rem 1rem', transition: 'all 0.2s ease', borderRadius: '8px' }}
            >
              <i className="bi bi-arrow-left me-2"></i>
              <span>Back</span>
            </button>
            <div>
              <h4 className="fw-bold mb-1">Dispatch Import Details</h4>
              <h6 className="text-muted mb-0">Bottle: {activeSheetTab}</h6>
            </div>
          </div>
        </div>

        {/* Valid/Invalid breakdown cards */}
        <div className="row mb-4">
          <div className="col-md-4">
            <div className="card bg-light p-3 border text-center h-100">
              <h6 className="text-muted fw-bold small text-uppercase mb-1">Total Rows</h6>
              <h4 className="fw-bold mb-0">{activeData.totalRows}</h4>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card bg-success bg-opacity-10 border-success p-3 text-center h-100">
              <h6 className="text-success fw-bold small text-uppercase mb-1">Valid Rows</h6>
              <h4 className="text-success fw-bold mb-0">{activeData.validRows}</h4>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card bg-danger bg-opacity-10 border-danger p-3 h-100 text-center">
              <h6 className="text-danger fw-bold small text-uppercase mb-1">Invalid Rows</h6>
              <h4 className="text-danger fw-bold mb-0">{activeData.invalidRows}</h4>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="d-flex gap-2 mb-3 dispatch-import-detail-filters">
          <button
            className={`btn btn-sm ${filterTab === 'ALL' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => { setFilterTab('ALL'); setSearch(''); }}
          >
            All ({activeData.totalRows})
          </button>
          <button
            className={`btn btn-sm ${filterTab === 'VALID' ? 'btn-success' : 'btn-outline-success'}`}
            onClick={() => { setFilterTab('VALID'); setSearch(''); }}
          >
            Valid ({activeData.validRows})
          </button>
          <button
            className={`btn btn-sm ${filterTab === 'INVALID' ? 'btn-danger' : 'btn-outline-danger'}`}
            onClick={() => { setFilterTab('INVALID'); setSearch(''); }}
          >
            Invalid ({activeData.invalidRows})
          </button>
          <input
            type="text"
            className="form-control form-control-sm ms-auto"
            style={{ maxWidth: '200px' }}
            placeholder="Search gate pass..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Grouped Dispatch records table */}
        {filteredGroups.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-inbox" style={{ fontSize: '3rem', opacity: 0.3 }}></i>
            <p className="mt-3">No records found</p>
          </div>
        ) : (
          <div className="table-responsive border rounded dispatch-import-detail-table" style={{ maxHeight: '500px', overflow: 'auto' }}>
            <table className="table table-sm table-hover mb-0 align-middle" style={{ fontSize: '12px' }}>
              <thead className="table-light sticky-top">
                <tr>
                  <th className="text-center" style={{ width: '70px' }}>Excel Row</th>
                  <th style={{ width: '90px' }}>Date</th>
                  <th style={{ width: '100px' }}>Gate Pass</th>
                  <th style={{ width: '90px' }}>Shade</th>
                  <th>Variant</th>
                  <th>Print Type</th>
                  <th className="text-center" style={{ width: '60px' }}>Box</th>
                  <th className="text-center" style={{ width: '60px' }}>Qty</th>
                  <th className="text-end" style={{ width: '80px' }}>Total</th>
                  <th>Errors</th>
                  <th className="text-center" style={{ width: '70px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group, groupIdx) => (
                  <React.Fragment key={group.groupKey || groupIdx}>
                    {group.filteredLines.map((rec, lineIdx) => (
                      <tr 
                        key={`${groupIdx}-${lineIdx}`} 
                        className={`${rec.isValid ? '' : 'table-danger'} ${lineIdx === group.filteredLines.length - 1 ? 'border-bottom' : ''}`}
                      >
                        <td className="text-center fw-bold">{rec.rowNumber}</td>
                        {lineIdx === 0 && (
                          <>
                            <td className="fw-500" rowSpan={group.filteredLines.length}>{group.date || '-'}</td>
                            <td className="fw-bold text-primary" rowSpan={group.filteredLines.length}>{group.gatePass || '-'}</td>
                            <td className="fw-semibold" rowSpan={group.filteredLines.length}>{group.shade || '-'}</td>
                          </>
                        )}
                        <td className="fw-500">{rec.variant || '-'}</td>
                        <td>{rec.printingType || '-'}</td>
                        <td className="text-center">{rec.box || '-'}</td>
                        <td className="text-center">{rec.qty || '-'}</td>
                        <td className="text-end fw-bold">{rec.total || '-'}</td>
                        <td style={{ fontSize: '11px', minWidth: '180px' }}>
                          {rec.errors && rec.errors.length > 0 ? (
                            rec.errors.map((err, errIdx) => {
                              const isBottleNotFound = err.includes('not found in master');
                              return (
                                <div key={`err-${errIdx}`} className="d-flex align-items-center gap-2 mb-1">
                                  <span className="text-danger">❌ {err}</span>
                                  {isBottleNotFound && (
                                    <button
                                      type="button"
                                      className="btn btn-accent btn-sm rounded-pill shadow-sm fw-bold"
                                      onClick={() => handleOpenAddBottle(rec.bottleNameRaw, activeData.bottleMatchDetails?.suggestedBottles || [])}
                                      title="Add this bottle to the system"
                                      style={{ padding: '0.2rem 0.6rem', fontSize: '10px' }}
                                    >
                                      + Add
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="text-center">
                          {rec.isValid ? (
                            rec.existingPlans && rec.existingPlans !== '-' ? (
                              <span className="badge bg-warning text-dark" title="Already exists in database">Existing</span>
                            ) : (
                              <span className="badge bg-success">✓</span>
                            )
                          ) : (
                            <span
                              className="badge bg-danger"
                              title={rec.errors?.join('; ') || 'Invalid'}
                              style={{ cursor: 'help' }}
                            >
                              ✗
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                {/* Grand Total Row */}
                <tr className="table-secondary fw-bold border-top border-2">
                  <td colSpan={8} className="text-end text-uppercase py-2">
                    Grand Total:
                  </td>
                  <td className="text-end fw-bold fs-6 py-2">{grandTotal}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderPreviewDetails = () => {
    if (!previewData) return null;

    return (
      <div>
        <h5 className="fw-bold mb-4 border-bottom pb-2 text-dark">Import Summary & Verification</h5>

        {/* Skipped sheets info (neutral note) */}
        {previewData.skippedSheets && previewData.skippedSheets.length > 0 && (
          <div className="mb-4 p-3 rounded-3" style={{ backgroundColor: '#f0f9ff', border: '2px solid #bfdbfe' }}>
            <div className="d-flex align-items-start gap-3">
              <i className="bi bi-info-circle-fill text-info" style={{ fontSize: '1.3rem' }}></i>
              <div style={{ flex: 1 }}>
                <h6 className="text-info fw-bold mb-2">ℹ️ Skipped Sheets</h6>
                {previewData.skippedSheets.map((skip, idx) => (
                  <div key={idx} className="small text-muted mb-2">
                    <strong>Sheet "{skip.sheetName}":</strong> {skip.reason}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Display detected format (same as Incoming) */}
        {(previewData.detectedFormat || previewData.companyName) && (
          <div className="mb-4 p-3 rounded-3" style={{ backgroundColor: '#f0fdf4', border: '2px solid #86efac' }}>
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-info-circle-fill text-success" style={{ fontSize: '1.2rem' }}></i>
              <div>
                <span className="text-muted small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>Detected Format:</span>
                <span className="ms-2 fw-bold text-dark">
                  {previewData.detectedFormat || previewData.companyName}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="row mb-4">
          <div className="col-md-4">
            <div className="card bg-light p-3 border text-center h-100">
              <h6 className="text-muted fw-bold small text-uppercase mb-1">Total Rows</h6>
              <h3 className="fw-bold mb-0">{previewData.totalRows}</h3>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card bg-success bg-opacity-10 border-success p-3 text-center h-100">
              <h6 className="text-success fw-bold small text-uppercase mb-1">Valid Rows</h6>
              <h3 className="text-success fw-bold mb-0">{previewData.validRows}</h3>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card bg-danger bg-opacity-10 border-danger p-3 text-center h-100">
              <h6 className="text-danger fw-bold small text-uppercase mb-1">Invalid Rows</h6>
              <h3 className="text-danger fw-bold mb-0">{previewData.invalidRows}</h3>
            </div>
          </div>
        </div>

        <h5 className="fw-bold mb-4 border-bottom pb-2 text-dark" style={{ letterSpacing: '0.5px' }}>Sheet Details</h5>

        <div className="table-responsive mb-4 border-0 shadow-sm rounded-4 dispatch-import-preview-table">
          <table className="table table-hover mb-0 align-middle bg-white">
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th className="py-3 border-bottom border-light-subtle text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Sheet Name</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Format</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Total</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Valid</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Invalid</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Existing Plans</th>
                <th className="py-3 border-bottom border-light-subtle text-end text-uppercase text-muted fw-bold" style={{ minWidth: '150px', fontSize: '0.8rem', letterSpacing: '0.5px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {previewData.sheets.map((sheet, idx) => (
                <tr key={idx}>
                  <td className="fw-bold">{sheet.sheetName}</td>
                  <td className="text-center">
                    <span className={`badge ${sheet.detectedFormat === 'SHRENO' ? 'bg-primary' : 'bg-secondary'}`}>
                      {sheet.detectedFormat || previewData.companyName || 'TPP'}
                    </span>
                  </td>
                  <td className="text-center">{sheet.totalRows}</td>
                  <td className="text-center text-success fw-bold">{sheet.validRows}</td>
                  <td className="text-center text-danger">{sheet.invalidRows > 0 ? sheet.invalidRows : '-'}</td>
                  <td className="text-center">
                    {(sheet.existingPlansCount > 0 || sheet.existingRecordsCount > 0) ? (
                      <span className="badge bg-warning text-dark fw-bold">{sheet.existingPlansCount || sheet.existingRecordsCount}</span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-info shadow-sm fw-bold"
                      onClick={() => setActiveSheetTab(sheet.sheetName)}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="modal show d-block dispatch-import-modal" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="modal-dialog modal-xl modal-dialog-scrollable dispatch-import-dialog">
          <div className="modal-content border-0 shadow">
            <div className="modal-header border-bottom-0" style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', color: 'white' }}>
              <h5 className="modal-title fw-bold">
                <i className="bi bi-file-earmark-excel me-2"></i> Import Dispatch Records from Excel
              </h5>
            </div>

            <div className="modal-body p-4 bg-white dispatch-import-modal-body" style={{ minHeight: '500px' }}>
              {!previewData ? (
                <div className="d-flex flex-column justify-content-center align-items-center h-100 w-100" style={{ minHeight: '450px' }}>
                  <div className="text-center px-4 mx-auto w-100" style={{ maxWidth: '600px' }}>
                    <div
                      className="rounded-4 p-5 mb-3 position-relative import-upload-panel"
                      style={{ border: '2px dashed #cbd5e1', backgroundColor: '#f8fafc', transition: 'all 0.3s ease', cursor: 'pointer' }}
                      onClick={() => fileInputRef.current?.click()}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    >
                      <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-4" style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(14, 165, 233, 0.1))' }}>
                        <i className="bi bi-file-earmark-excel-fill text-success" style={{ fontSize: '3rem' }}></i>
                      </div>
                      <h4 className="fw-bold text-dark mb-2">Upload Dispatch Excel File</h4>
                      <p className="text-muted mb-4 px-3">
                        Please select your Dispatch summary Excel file
                      </p>

                      <div className="d-flex justify-content-center">
                        <input
                          type="file"
                          className="d-none"
                          accept=".xlsx, .xls"
                          onChange={handleFileChange}
                          ref={fileInputRef}
                        />
                        <button type="button" className="btn btn-accent px-4 py-2 rounded-3 shadow-sm fw-bold">
                          <i className="bi bi-cloud-arrow-up me-2"></i> Browse Files
                        </button>
                      </div>
                    </div>
                    {file && (
                      <div className="mt-3 animated fadeIn import-selected-file-wrap">
                        <span className="badge bg-success bg-opacity-10 text-success px-4 py-2 rounded-pill border border-success border-opacity-25 shadow-sm import-selected-file" style={{ fontSize: '0.95rem' }}>
                          <i className="bi bi-check-circle-fill me-2"></i> {file.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeSheetTab ? (
                renderDetailsView()
              ) : (
                renderPreviewDetails()
              )}
            </div>

            <div className="modal-footer bg-white border-top-0 pt-0 pb-4 px-4 dispatch-import-modal-footer">
              <button type="button" className="btn btn-light shadow-sm px-4 py-2 rounded-pill fw-bold text-secondary" style={{ border: '1px solid #e2e8f0' }} onClick={onClose} disabled={loading}>
                Close
              </button>
              {!previewData ? (
                <button type="button" className="btn btn-accent shadow-sm px-5 py-2 rounded-pill fw-bold" onClick={handlePreview} disabled={loading || !file}>
                  {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</> : 'Preview Import'}
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-outline-secondary shadow-sm px-4 py-2 rounded-pill fw-bold" onClick={handleReset} disabled={loading}>
                    <i className="bi bi-arrow-counterclockwise me-2"></i> Upload Different File
                  </button>
                  <button type="button" className="btn btn-success shadow-sm px-5 py-2 rounded-pill fw-bold" onClick={handleCommit} disabled={loading}>
                    {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Importing...</> : <><i className="bi bi-check-circle me-2"></i>Import Valid Records</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <AddBottleModal 
        show={showAddBottleModal} 
        initialBottleName={selectedBottleForAdd}
        suggestedBottles={bottleMatchSuggestions}
        onClose={() => {
          setShowAddBottleModal(false);
          setSelectedBottleForAdd(null);
          setBottleMatchSuggestions([]);
        }}
        onSuccess={handleBottleCreated}
      />
    </>
  );
}
