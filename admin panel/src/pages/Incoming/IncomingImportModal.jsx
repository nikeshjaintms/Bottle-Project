import React, { useState, useRef } from 'react';
import API from '../../services/api';
import Swal from 'sweetalert2';
import { useSelector } from 'react-redux';
import AddBottleModal from '../../components/AddBottleModal';

export default function IncomingImportModal({ show, onClose, onImportComplete }) {
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

  const handleOpenAddBottle = (bottleName) => {
    setSelectedBottleForAdd(bottleName);
    
    // Look for bottle match details in preview data to extract suggestions
    let suggestions = [];
    if (previewData && previewData.sheets) {
      for (const sheet of previewData.sheets) {
        if (sheet.bottleMatchDetails && sheet.bottleMatchDetails.suggestedBottles) {
          suggestions = sheet.bottleMatchDetails.suggestedBottles;
          break; // Use the first sheet's suggestions (or customize logic as needed)
        }
      }
    }
    
    setBottleMatchSuggestions(suggestions);
    setShowAddBottleModal(true);
  };

  const handleBottleCreated = async () => {
    setShowAddBottleModal(false);
    setSelectedBottleForAdd(null);
    
    if (!file) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedCompanyId) {
        formData.append('companyId', selectedCompanyId);
      }
      const res = await API.post('/incoming/import/preview', formData);
      if (res.data.success) {
        setPreviewData(res.data.data);
      }
    } catch (err) {
      Swal.fire('Error', 'Failed to refresh preview after adding bottle', 'error');
    } finally {
      setLoading(false);
    }
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
    if (selectedCompanyId) {
      formData.append('companyId', selectedCompanyId);
    }

    setLoading(true);
    try {
      const res = await API.post('/incoming/import/preview', formData);
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

  const handleCommit = async () => {
    if (!previewData) return;

    const totalValid = previewData.sheets.reduce((acc, s) => acc + s.validRows, 0);
    if (totalValid === 0) {
      Swal.fire('No Data', 'There are no valid rows to import.', 'info');
      return;
    }

    const result = await Swal.fire({
      title: 'Confirm Import',
      html: `<p>Are you sure you want to import <strong>${totalValid}</strong> incoming records?</p>
             <p><small style="color: #666;">Company: <strong>${previewData.companyName}</strong></small></p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Import All',
      cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        const res = await API.post('/incoming/import/commit', { 
          sheetsToImport: previewData.sheets
        });
        if (res.data.success) {
          Swal.fire('Success', `Imported ${res.data.data.incomingImported} records.`, 'success');
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

  const renderDetailsView = () => {
    const activeData = previewData.sheets.find(s => s.sheetName === activeSheetTab);
    if (!activeData) return null;

    let filteredRows = activeData.incomingRecords;
    if (filterTab === 'VALID') filteredRows = filteredRows.filter(r => r.isValid);
    if (filterTab === 'INVALID') filteredRows = filteredRows.filter(r => !r.isValid);

    if (search) {
      const s = search.toLowerCase();
      filteredRows = filteredRows.filter(r => 
        String(r.bottleNameRaw).toLowerCase().includes(s) ||
        String(r.challanNo).toLowerCase().includes(s) ||
        String(r.excelRowNumber).includes(s)
      );
    }

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
              <h4 className="fw-bold mb-1">Incoming Import Details</h4>
              <h6 className="text-muted mb-0">Sheet: {activeSheetTab}</h6>
            </div>
          </div>
        </div>

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
              <span className="small text-muted">Review errors below to fix issues</span>
            </div>
          </div>
        </div>

        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="btn-group shadow-sm">
            <button 
              className={`btn btn-sm ${filterTab === 'ALL' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setFilterTab('ALL')}
            >ALL</button>
            <button 
              className={`btn btn-sm ${filterTab === 'VALID' ? 'btn-success' : 'btn-outline-success'}`}
              onClick={() => setFilterTab('VALID')}
            >VALID</button>
            <button 
              className={`btn btn-sm ${filterTab === 'INVALID' ? 'btn-danger' : 'btn-outline-danger'}`}
              onClick={() => setFilterTab('INVALID')}
            >INVALID</button>
          </div>
          
          <div className="position-relative" style={{ width: '250px' }}>
            <i className="bi bi-search position-absolute top-50 start-0 translate-middle-y ms-2 text-muted"></i>
            <input 
              type="text" 
              className="form-control form-control-sm ps-4" 
              placeholder="Search rows..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive border rounded flex-grow-1" style={{ maxHeight: '400px' }}>
          <table className="table table-sm table-hover mb-0 align-middle" style={{ fontSize: '13px' }}>
            <thead className="table-light sticky-top">
              <tr>
                <th className="text-center">#</th>
                <th>Bottle Name</th>
                <th>Challan No</th>
                <th>Date</th>
                <th>PO Date</th>
                <th>PO No</th>
                <th>PO Order Qty</th>
                <th>Box</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Status</th>
                {filterTab !== 'VALID' && <th>Error</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? filteredRows.map((r, i) => (
                <tr key={i} className={!r.isValid ? 'table-danger' : ''}>
                  <td className="text-center fw-bold">{r.excelRowNumber}</td>
                  <td>{r.bottleNameRaw || 'N/A'}</td>
                  <td className="fw-bold">{r.challanNo || '-'}</td>
                  <td>{r.incomingDate ? new Date(r.incomingDate).toLocaleDateString() : '-'}</td>
                  <td>{r.poDate ? new Date(r.poDate).toLocaleDateString() : '-'}</td>
                  <td className="fw-bold">{r.poNo || '-'}</td>
                  <td className="fw-bold">{r.poOrderQty || '-'}</td>
                  <td className="fw-bold">{r.noOfBox || '-'}</td>
                  <td className="fw-bold">{r.qty || '-'}</td>
                  <td className="fw-bold">{r.totalQty || '-'}</td>
                  <td>
                    <span className={`badge ${r.isValid ? 'bg-success' : 'bg-danger'}`}>
                      {r.isValid ? 'VALID' : 'INVALID'}
                    </span>
                  </td>
                  {filterTab !== 'VALID' && (
                    <td>
                      {!r.isValid && (
                        <div className="small text-danger">
                          {r.errors.map((err, eidx) => {
                            const isBottleNotFound = err.includes('not found in master');
                            return (
                              <div key={eidx} className="mb-2">
                                <div className="d-flex align-items-start gap-2">
                                  <span>❌ {err}</span>
                                  {isBottleNotFound && (
                                    <button
                                      type="button"
                                      className="btn btn-accent btn-sm rounded-pill shadow-sm fw-bold"
                                      onClick={() => handleOpenAddBottle(r.bottleNameRaw)}
                                      title="Add this bottle to the system"
                                      style={{ padding: '0.4rem 0.8rem', transition: 'all 0.2s ease' }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'scale(1.08)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.boxShadow = 'none';
                                      }}
                                    >
                                      <i className="bi bi-plus-circle-fill me-1"></i>Add
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              )) : (
                <tr>
                  <td colSpan={filterTab !== 'VALID' ? 13 : 12} className="text-center py-4 text-muted">No rows match the current filters</td>
                </tr>
              )}
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
                <i className="bi bi-file-earmark-excel me-2"></i> Import Incoming Records from Excel
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
                      <h4 className="fw-bold text-dark mb-2">Upload Excel File</h4>
                      <p className="text-muted mb-4 px-3" style={{ fontSize: '0.95rem' }}>
                        Please select your Incoming summary Excel file (SHRENO trade.xlsx or TPP summary)
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
                <div>
                  <h5 className="fw-bold mb-4 border-bottom pb-2 text-dark" style={{ letterSpacing: '0.5px' }}>Import Summary & Verification</h5>
                  
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
                      {previewData.detectedCompanies.length > 1 && (
                        <div className="small text-muted mt-2 ms-4">
                          ⚠️ This workbook contains multiple formats. Each sheet will be parsed according to its detected format.
                        </div>
                      )}
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
                          <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Format</th>
                          <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Total</th>
                          <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Valid</th>
                          <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Invalid</th>
                          <th className="py-3 border-bottom border-light-subtle text-end text-uppercase text-muted fw-bold" style={{ minWidth: '150px', fontSize: '0.8rem', letterSpacing: '0.5px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.sheets.map((sheet, idx) => (
                          <tr key={idx}>
                            <td className="fw-bold">{sheet.sheetName}</td>
                            <td className="text-center">
                              <span className={`badge ${sheet.detectedFormat === 'SHRENO' ? 'bg-primary' : 'bg-secondary'}`}>
                                {sheet.detectedFormat || 'TPP'}
                              </span>
                            </td>
                            <td className="text-center">{sheet.totalRows}</td>
                            <td className="text-center text-success fw-bold">{sheet.validRows}</td>
                            <td className="text-center text-danger">{sheet.invalidRows > 0 ? sheet.invalidRows : '-'}</td>
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
