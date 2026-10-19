import React, { useState, useRef } from 'react';
import API from '../../services/api';
import Swal from 'sweetalert2';
import { useSelector } from 'react-redux';
import AddBottleModal from '../../components/AddBottleModal';

export default function ShrenoIncomingImportModal({ show, onClose, onImportComplete }) {
  const { companies } = useSelector((state) => state.companies);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
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

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handlePreview = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (selectedCompanyId) {
      formData.append('companyId', selectedCompanyId);
    }

    setLoading(true);
    try {
      const res = await API.post('/shreno-incoming/import/preview', formData);
      if (res.data.success) {
        setPreviewData(res.data.data);
        setExpandedSheets({});
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Failed to parse file', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddBottle = (bottleName) => {
    setSelectedBottleForAdd(bottleName);
    
    // Look for bottle match details in preview data to extract suggestions
    let suggestions = [];
    if (previewData && previewData.sheets) {
      for (const sheet of previewData.sheets) {
        if (sheet.bottleMatchDetails && sheet.bottleMatchDetails.suggestedBottles) {
          suggestions = sheet.bottleMatchDetails.suggestedBottles;
          break;
        }
      }
    }
    
    setBottleMatchSuggestions(suggestions);
    setShowAddBottleModal(true);
  };

  const handleBottleCreated = async () => {
    setShowAddBottleModal(false);
    setSelectedBottleForAdd('');
    // Re-run preview with same file
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    if (selectedCompanyId) {
      formData.append('companyId', selectedCompanyId);
    }

    setLoading(true);
    try {
      const res = await API.post('/shreno-incoming/import/preview', formData);
      if (res.data.success) {
        setPreviewData(res.data.data);
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Failed to re-validate preview', 'error');
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

    const result = await Swal.fire({
      title: 'Confirm Import',
      html: `<p>Are you sure you want to import <strong>${totalValid}</strong> SHRENO incoming records?</p>
             <p><small style="color: #666;">Company: <strong>${previewData.companyName}</strong></small></p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Import All',
      cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        const res = await API.post('/shreno-incoming/import/commit', { 
          sheetsToImport: previewData.sheets
        });
        if (res.data.success) {
          Swal.fire('Success', `Imported ${res.data.data.incomingImported} SHRENO records.`, 'success');
          onImportComplete();
          handleReset();
          onClose();
        }
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || 'Failed to import records', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleReset = () => {
    setSelectedCompanyId('');
    setFile(null);
    setPreviewData(null);
    setExpandedSheets({});
    setFilterTab('ALL');
    setSearch('');
    setActiveSheetTab(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSheetExpanded = (sheetName) => {
    setExpandedSheets(prev => ({
      ...prev,
      [sheetName]: !prev[sheetName]
    }));
  };

  const renderDetailsView = () => {
    const activeData = previewData.sheets.find(s => s.sheetName === activeSheetTab);
    if (!activeData) return null;

    return (
      <div className="d-flex flex-column h-100">
        <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
          <div className="d-flex align-items-center gap-3">
            <button 
              type="button" 
              className="btn btn-accent shadow-sm"
              onClick={() => setActiveSheetTab(null)}
              title="Back to Summary"
              style={{ padding: '0.5rem 1rem', transition: 'all 0.2s ease', borderRadius: '8px' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(139, 92, 246, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.2)';
              }}
            >
              <i className="bi bi-arrow-left me-2" style={{ fontSize: '1.2rem', fontWeight: 'bold' }}></i>
              <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>Back</span>
            </button>
            <div>
              <h4 className="fw-bold mb-1">SHRENO Packing Material Stock</h4>
              <h6 className="text-muted mb-0">Sheet: {activeSheetTab}</h6>
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
              <span className="small text-muted">Review errors below if needed</span>
            </div>
          </div>
        </div>

        {/* Show packing material section only */}
        {!activeData.packingRecords || activeData.packingRecords.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-inbox" style={{ fontSize: '3rem', opacity: 0.3 }}></i>
            <p className="mt-3">No packing material stock found in this sheet</p>
          </div>
        ) : (
          <div>
            <h6 className="fw-bold mb-3 text-dark border-top pt-3">📦 Packing Material Stock</h6>
            <div className="table-responsive border rounded" style={{ maxHeight: '400px' }}>
              <table className="table table-sm table-hover mb-0 align-middle" style={{ fontSize: '12px' }}>
                <thead className="table-light sticky-top">
                  <tr>
                    <th>Bottle Name</th>
                    <th>Item Type</th>
                    <th className="text-center">Qty (02.06.26)</th>
                    <th className="text-center">Qty (09.09.26)</th>
                    <th className="text-center">Total Available</th>
                  </tr>
                </thead>
                <tbody>
                  {activeData.packingRecords.map((rec, idx) => (
                    <tr key={idx}>
                      <td className="fw-bold">{activeSheetTab}</td>
                      <td>{rec.itemTypeName || 'N/A'}</td>
                      <td className="text-center">{rec.dateQuantities?.['2026-06-02'] || rec.dateQuantities?.['2026-06-01'] || '-'}</td>
                      <td className="text-center">{rec.dateQuantities?.['2026-09-09'] || rec.dateQuantities?.['2026-09-08'] || '-'}</td>
                      <td className="text-center fw-bold">{rec.totalAvailable || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Invalid rows details */}
        {activeData.invalidRows > 0 && activeData.incomingRecords && (
          <div className="mt-4">
            <h6 className="fw-bold mb-3 text-dark border-top pt-3">⚠️ Invalid Rows Details</h6>
            <div className="table-responsive border rounded" style={{ maxHeight: '300px' }}>
              <table className="table table-sm mb-0 align-middle" style={{ fontSize: '11px' }}>
                <thead className="table-light sticky-top">
                  <tr>
                    <th className="text-center">#</th>
                    <th>Bottle</th>
                    <th>Challan</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {activeData.incomingRecords.filter(r => !r.isValid).map((r, i) => (
                    <tr key={i} className="table-danger">
                      <td className="text-center fw-bold text-danger">{r.excelRowNumber}</td>
                      <td className="small">{r.bottleNameRaw || 'N/A'}</td>
                      <td className="small">{r.challanNo || '-'}</td>
                      <td className="small">
                        {r.errors && r.errors.map((err, idx) => (
                          <div key={idx} className="text-danger">❌ {err}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPreviewDetails = () => {
    if (!previewData) return null;

    return (
      <div>
        <h5 className="fw-bold mb-4 border-bottom pb-2 text-dark" style={{ letterSpacing: '0.5px' }}>Import Summary & Verification</h5>
        
        {/* NEW: Display company mismatch warnings */}
        {previewData.companyMismatchWarnings && previewData.companyMismatchWarnings.length > 0 && (
          <div className="mb-4 p-3 rounded-3" style={{ backgroundColor: '#fef2f2', border: '2px solid #fca5a5' }}>
            <div className="d-flex align-items-start gap-3">
              <i className="bi bi-exclamation-triangle-fill text-danger" style={{ fontSize: '1.3rem', marginTop: '0.2rem' }}></i>
              <div style={{ flex: 1 }}>
                <h6 className="text-danger fw-bold mb-2">⚠️ Company Mismatch Detected</h6>
                {previewData.companyMismatchWarnings.map((warn, idx) => (
                  <div key={idx} className="small text-danger mb-2">
                    <strong>Sheet "{warn.sheetName}":</strong> {warn.detectedCompany ? `Detected company is "${warn.detectedCompany}"` : `Detected format is "${warn.detectedFormat}"`}. This sheet will be <strong>SKIPPED</strong> as this is a SHRENO-specific importer.
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Display detected companies */}
        {previewData.detectedCompanies && previewData.detectedCompanies.length > 0 && (
          <div className="mb-4 p-3 rounded-3" style={{ backgroundColor: '#f0fdf4', border: '2px solid #86efac' }}>
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-info-circle-fill text-success" style={{ fontSize: '1.2rem' }}></i>
              <div>
                <span className="text-muted small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>Detected Format:</span>
                <span className="ms-2 fw-bold text-dark">
                  {previewData.detectedCompanies.length === 1 
                    ? previewData.detectedCompanies[0] 
                    : `Mixed (${previewData.detectedCompanies.join(', ')})`}
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

        <div className="table-responsive mb-4 border-0 shadow-sm rounded-4 overflow-hidden">
          <table className="table table-hover mb-0 align-middle bg-white">
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th className="py-3 border-bottom border-light-subtle text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Sheet Name</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Total</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Valid</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Invalid</th>
                <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Packing Items</th>
                <th className="py-3 border-bottom border-light-subtle text-end text-uppercase text-muted fw-bold" style={{ minWidth: '150px', fontSize: '0.8rem', letterSpacing: '0.5px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {previewData.sheets.map((sheet, idx) => (
                <tr key={idx}>
                  <td className="fw-bold">{sheet.sheetName}</td>
                  <td className="text-center">{sheet.totalRows}</td>
                  <td className="text-center text-success fw-bold">{sheet.validRows}</td>
                  <td className="text-center text-danger">{sheet.invalidRows > 0 ? sheet.invalidRows : '-'}</td>
                  <td className="text-center">
                    {sheet.packingMaterialCount > 0 ? (
                      <span className="badge bg-info">{sheet.packingMaterialCount}</span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="text-end">
                    <button 
                      className="btn btn-sm btn-outline-info shadow-sm fw-bold"
                      onClick={() => {
                        setActiveSheetTab(sheet.sheetName);
                        setFilterTab('ALL');
                        setSearch('');
                      }}
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
                <i className="bi bi-file-earmark-excel me-2"></i> Import SHRENO Incoming Records from Excel
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
                      <h4 className="fw-bold text-dark mb-2">Upload SHRENO Excel File</h4>
                      <p className="text-muted mb-4 px-3" style={{ fontSize: '0.95rem' }}>
                        Please select your SHRENO Incoming summary Excel file
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
                    <button type="button" className="btn btn-accent shadow-sm px-5 py-2 rounded-pill fw-bold" style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', border: 'none', color: 'white' }} onClick={handleCommit} disabled={loading || previewData.validRows === 0}>
                      <i className="bi bi-cloud-arrow-up-fill me-2"></i> Import All
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
