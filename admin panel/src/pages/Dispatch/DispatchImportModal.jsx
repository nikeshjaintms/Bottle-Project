import React, { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import API from '../../services/api';
import Swal from 'sweetalert2';
import AddBottleModal from '../../components/AddBottleModal';

export default function DispatchImportModal({ show, onClose, onImportComplete }) {
  const { companyId } = useParams();
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

  const handleBottleCreated = async () => {
    setShowAddBottleModal(false);
    setSelectedBottleForAdd(null);
    
    if (!file) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

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

    setLoading(true);
    try {
      const res = await API.post('/dispatch/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setPreviewData(res.data.data);
        setExpandedSheets({});
        setActiveSheetTab(null);
        
        // Don't auto-import - let user review and click Import button
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
      Swal.fire('No Data', 'There are no valid rows to import.', 'info');
      return;
    }

    // Auto-import without asking - just import all valid rows
    setLoading(true);
    try {
      const res = await API.post('/dispatch/import/commit', {
        sheetsToImport: previewData.sheets,
        companyId: companyId
      });
      if (res.data.success) {
        const imported = res.data.data.dispatchImported;
        const skipped = res.data.data.dispatchSkipped;
        
        if (imported === 0 && skipped > 0) {
          // All rows skipped
          Swal.fire({
            title: 'No Records Imported',
            html: `<div style="text-align: left;">
              <p><strong style="color: #e74c3c;">${skipped} rows were skipped</strong> due to missing bottles:</p>
              <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; max-height: 200px; overflow-y: auto; text-align: left; font-size: 12px;">
                ${(res.data.data.skipSummary || []).slice(0, 10).map(err => `<div style="margin: 4px 0; color: #555;">❌ ${err}</div>`).join('')}
                ${(res.data.data.skipSummary || []).length > 10 ? `<div style="color: #999; margin-top: 8px;">... and ${(res.data.data.skipSummary || []).length - 10} more</div>` : ''}
              </div>
              <p style="margin-top: 12px; color: #666; font-size: 13px;"><i class="bi bi-info-circle"></i> Add missing bottles using the Add button in View Details and try importing again.</p>
            </div>`,
            icon: 'warning',
            confirmButtonText: 'Close'
          });
        } else if (imported > 0) {
          // Some/all records imported
          const skipMsg = skipped > 0 
            ? `<br><br><div style="text-align: left; background: #fff3cd; padding: 12px; border-radius: 6px; border-left: 4px solid #ffc107;">
                <strong>${skipped} rows skipped (missing bottles):</strong><br>
                ${(res.data.data.skipSummary || []).slice(0, 5).map(err => `<div style="font-size: 12px; margin: 4px 0;">• ${err}</div>`).join('')}
                ${(res.data.data.skipSummary || []).length > 5 ? `<div style="font-size: 12px; color: #666; margin-top: 8px;">... and ${(res.data.data.skipSummary || []).length - 5} more</div>` : ''}
              </div>`
            : '';
          
          Swal.fire({
            title: 'Import Successful',
            html: `<div style="text-align: left;">
              <div style="background: #d4edda; padding: 12px; border-radius: 6px; border-left: 4px solid #28a745; margin-bottom: 12px;">
                <strong style="color: #155724;">✓ ${imported} dispatch records imported successfully</strong>
              </div>
              ${skipMsg}
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

    const filteredRecords = getFilteredRecords(activeData.records);

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

        {/* Valid/Invalid breakdown */}
        <div className="row mb-4">
          <div className="col-md-3">
            <div className="card bg-light p-3 border text-center h-100">
              <h6 className="text-muted fw-bold small text-uppercase mb-1">Total Rows</h6>
              <h4 className="fw-bold mb-0">{activeData.totalRows}</h4>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-success bg-opacity-10 border-success p-3 text-center h-100">
              <h6 className="text-success fw-bold small text-uppercase mb-1">Valid Rows</h6>
              <h4 className="text-success fw-bold mb-0">{activeData.validRows}</h4>
            </div>
          </div>
          <div className="col-md-6">
            <div className="card bg-danger bg-opacity-10 border-danger p-3 h-100">
              <h6 className="text-danger fw-bold small text-uppercase mb-2">Invalid Rows: {activeData.invalidRows}</h6>
              <span className="small text-muted">Add missing bottles to import these rows</span>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="d-flex gap-2 mb-3">
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

        {/* Dispatch records table */}
        {filteredRecords.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-inbox" style={{ fontSize: '3rem', opacity: 0.3 }}></i>
            <p className="mt-3">No records found</p>
          </div>
        ) : (
          <div className="table-responsive border rounded" style={{ maxHeight: '500px', overflow: 'auto' }}>
            <table className="table table-sm table-hover mb-0 align-middle" style={{ fontSize: '12px' }}>
              <thead className="table-light sticky-top">
                <tr>
                  <th className="text-center" style={{ width: '50px' }}>Excel Row</th>
                  <th>Date</th>
                  <th>Gate Pass</th>
                  <th>Shade</th>
                  <th>Variant</th>
                  <th>Print Type</th>
                  <th className="text-center">Box</th>
                  <th className="text-center">Qty</th>
                  <th className="text-end">Total</th>
                  <th>Errors</th>
                  <th style={{ width: '40px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec, idx) => (
                  <tr key={idx} className={rec.isValid ? '' : 'table-danger'}>
                    <td className="text-center fw-bold">{rec.rowNumber}</td>
                    <td>{rec.date || '-'}</td>
                    <td className="fw-bold">{rec.gatePass || '-'}</td>
                    <td>{rec.shade || '-'}</td>
                    <td>{rec.variant || '-'}</td>
                    <td>{rec.printingType || '-'}</td>
                    <td className="text-center">{rec.box || '-'}</td>
                    <td className="text-center">{rec.qty || '-'}</td>
                    <td className="text-end fw-bold">{rec.total || '-'}</td>
                    <td style={{ fontSize: '11px', minWidth: '200px' }}>
                      {rec.errors && rec.errors.length > 0 && (
                        <>
                          {rec.errors.map((err, errIdx) => {
                            const isBottleNotFound = err.includes('not found in master');
                            return (
                              <div key={`err-${errIdx}`} className="mb-2">
                                <div className="d-flex align-items-start gap-2">
                                  <span>❌ {err}</span>
                                  {isBottleNotFound && (
                                    <button
                                      type="button"
                                      className="btn btn-accent btn-sm rounded-pill shadow-sm fw-bold"
                                      onClick={() => handleOpenAddBottle(rec.bottleNameRaw, rec.bottleNameMatch?.suggestedBottles || [])}
                                      title="Add this bottle to the system"
                                      style={{ padding: '0.4rem 0.8rem', transition: 'all 0.2s ease', whiteSpace: 'nowrap' }}
                                    >
                                      <i className="bi bi-plus-circle-fill me-1"></i>Add
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}
                      {(!rec.errors || rec.errors.length === 0) && (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {rec.isValid ? (
                        <span className="badge bg-success">✓</span>
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

        <h5 className="fw-bold mb-4 border-bottom pb-2 text-dark">Sheet Details</h5>

        <div className="table-responsive mb-4 border-0 shadow-sm rounded-4 overflow-hidden">
          <table className="table table-hover mb-0 align-middle bg-white">
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th className="py-3 border-bottom border-light-subtle text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem' }}>Bottle Name</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem' }}>Total</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem' }}>Valid</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem' }}>Invalid</th>
                <th className="py-3 border-bottom border-light-subtle text-end text-uppercase text-muted fw-bold" style={{ minWidth: '150px', fontSize: '0.8rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {previewData.sheets.map((sheet, idx) => (
                <tr key={idx}>
                  <td className="fw-bold">{sheet.sheetName}</td>
                  <td className="text-center">{sheet.totalRows}</td>
                  <td className="text-center text-success fw-bold">{sheet.validRows}</td>
                  <td className="text-center text-danger">{sheet.invalidRows > 0 ? sheet.invalidRows : '-'}</td>
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
      <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="modal-dialog modal-xl modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header border-bottom-0" style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', color: 'white' }}>
              <h5 className="modal-title fw-bold">
                <i className="bi bi-file-earmark-excel me-2"></i> Import Dispatch Records from Excel
              </h5>
            </div>

            <div className="modal-body p-4 bg-white" style={{ minHeight: '500px' }}>
              {!previewData ? (
                <div className="d-flex flex-column justify-content-center align-items-center h-100 w-100" style={{ minHeight: '450px' }}>
                  <div className="text-center px-4 mx-auto w-100" style={{ maxWidth: '600px' }}>
                    <div
                      className="rounded-4 p-5 mb-3 position-relative"
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
                      <div className="mt-3 animated fadeIn">
                        <span className="badge bg-success bg-opacity-10 text-success px-4 py-2 rounded-pill border border-success border-opacity-25 shadow-sm" style={{ fontSize: '0.95rem' }}>
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

            <div className="modal-footer bg-white border-top-0 pt-0 pb-4 px-4">
              <button type="button" className="btn btn-light shadow-sm px-4 py-2 rounded-pill fw-bold text-secondary" style={{ border: '1px solid #e2e8f0' }} onClick={onClose} disabled={loading}>
                Close
              </button>
              {!previewData ? (
                <button type="button" className="btn btn-accent shadow-sm px-5 py-2 rounded-pill fw-bold" onClick={handlePreview} disabled={loading || !file}>
                  {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</> : 'Preview Import'}
                </button>
              ) : (
                !activeSheetTab && (
                  <>
                    <button type="button" className="btn btn-outline-secondary shadow-sm px-4 py-2 rounded-pill fw-bold" onClick={handleReset} disabled={loading}>
                      <i className="bi bi-arrow-counterclockwise me-2"></i> Upload Different File
                    </button>
                    <button type="button" className="btn btn-success shadow-sm px-5 py-2 rounded-pill fw-bold" onClick={handleCommit} disabled={loading}>
                      {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Importing...</> : <><i className="bi bi-check-circle me-2"></i>Import All</>}
                    </button>
                  </>
                )
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
