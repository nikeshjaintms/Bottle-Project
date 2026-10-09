import React, { useState, useRef } from 'react';
import API from '../../services/api';
import Swal from 'sweetalert2';
import { useLacquerPlanLanguage, LACQUER_PLAN_LABELS } from '../../hooks/useLacquerPlanLanguage';

export default function ImportExcelModal({ show, onClose, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importConfig, setImportConfig] = useState({});
  const fileInputRef = useRef(null);

  // New states for detailed view
  const [activeDateTab, setActiveDateTab] = useState(null);
  const [filterTab, setFilterTab] = useState('ALL'); // ALL, VALID, INVALID
  const [search, setSearch] = useState('');
  const { labels } = useLacquerPlanLanguage();

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
    
    setLoading(true);
    try {
      const res = await API.post('/lacquer-plan/preview-import', formData);
      if (res.data.success) {
        setPreviewData(res.data.data);
        
        // Setup initial import config for each date
        const initialConfig = {};
        res.data.data.dates.forEach(d => {
          initialConfig[d.date] = d.existingCount > 0 ? 'skip' : 'import';
        });
        setImportConfig(initialConfig);
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Failed to parse file', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (date, val) => {
    setImportConfig(prev => ({ ...prev, [date]: val }));
  };

  const handleCommitSingleDate = async (dateData) => {
    const validCount = dateData.validRows;
    const invalidCount = dateData.invalidRows;
    
    const result = await Swal.fire({
      title: `Import ${dateData.date}`,
      text: `${validCount} valid rows will be imported.\n${invalidCount} invalid rows will be skipped.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `Import ${validCount} Valid Rows`,
      cancelButtonText: 'Cancel'
    });
    
    if (result.isConfirmed) {
      const datesToImport = [{
        date: dateData.date,
        rows: dateData.rows,
        replaceExisting: dateData.existingCount > 0 // Or could be derived from a specific UI dropdown if needed
      }];
      
      setLoading(true);
      try {
        const res = await API.post('/lacquer-plan/commit-import', { datesToImport });
        if (res.data.success) {
          Swal.fire('Import Completed', `Imported ${res.data.data.totalImported} records for ${dateData.date}.`, 'success');
          onImportComplete();
          // Optionally, we could remove this date from previewData, but closing/resetting is easier
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

  const handleImportAll = async () => {
    const totalValid = previewData.dates.reduce((acc, d) => acc + d.validRows, 0);
    if (totalValid === 0) {
       Swal.fire('No Data', 'There are no valid rows to import.', 'info');
       return;
    }
    
    const result = await Swal.fire({
      title: 'Import All Dates',
      text: `Are you sure you want to import ${totalValid} valid rows across all dates? Existing plans will be replaced.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Import All',
      cancelButtonText: 'Cancel'
    });
    
    if (result.isConfirmed) {
      const datesToImport = previewData.dates.map(d => ({
        date: d.date,
        rows: d.rows,
        replaceExisting: true
      }));
      
      setLoading(true);
      try {
        const res = await API.post('/lacquer-plan/commit-import', { datesToImport });
        if (res.data.success) {
          Swal.fire('Import Completed', `Successfully imported ${res.data.data.totalImported} records.`, 'success');
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
    setFile(null);
    setPreviewData(null);
    setActiveDateTab(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderDetailsView = () => {
    const activeData = previewData.dates.find(d => d.date === activeDateTab);
    if (!activeData) return null;

    let filteredRows = activeData.rows;
    if (filterTab === 'VALID') filteredRows = filteredRows.filter(r => r.isValid);
    if (filterTab === 'INVALID') filteredRows = filteredRows.filter(r => !r.isValid);

    if (search) {
      const s = search.toLowerCase();
      filteredRows = filteredRows.filter(r => 
        String(r.bottleName).toLowerCase().includes(s) ||
        String(r.variantName).toLowerCase().includes(s) ||
        String(r.brandName).toLowerCase().includes(s) ||
        String(r.coatingShade).toLowerCase().includes(s) ||
        String(r.process).toLowerCase().includes(s) ||
        String(r.excelRowNumber).includes(s)
      );
    }

    // Calculate dynamic rowspans for groups based on current filters
    const visibleGroupSpans = {};
    filteredRows.forEach(r => {
      if (r.groupId) {
        visibleGroupSpans[r.groupId] = (visibleGroupSpans[r.groupId] || 0) + 1;
      }
    });

    const renderedGroups = new Set();

    return (
      <div className="d-flex flex-column h-100">
        <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
          <div>
            <h4 className="fw-bold mb-1">Lacquer Plan Import Details</h4>
            <h6 className="text-muted mb-0">Date: {activeDateTab}</h6>
          </div>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setActiveDateTab(null)}>
             <i className="bi bi-arrow-left me-2"></i>Back to Summary
          </button>
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
               {Object.keys(activeData.invalidReasons || {}).length > 0 ? (
                 <div className="d-flex flex-wrap gap-2">
                   {Object.entries(activeData.invalidReasons).map(([reason, count]) => (
                     <span key={reason} className="badge bg-danger bg-opacity-25 text-danger border border-danger">
                       {reason}: {count}
                     </span>
                   ))}
                 </div>
               ) : (
                 <span className="small text-muted">No invalid rows</span>
               )}
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
                <th className="text-center">{LACQUER_PLAN_LABELS.en.sr}</th>
                <th>Company</th>
                <th>{LACQUER_PLAN_LABELS.en.bottleName}</th>
                <th>{LACQUER_PLAN_LABELS.en.variant}</th>
                <th>{LACQUER_PLAN_LABELS.en.coatingShade}</th>
                <th>{LACQUER_PLAN_LABELS.en.brand}</th>
                <th>{LACQUER_PLAN_LABELS.en.process}</th>
                <th>{LACQUER_PLAN_LABELS.en.plainStock}</th>
                <th>{LACQUER_PLAN_LABELS.en.orderQty}</th>
                <th>{LACQUER_PLAN_LABELS.en.coatingCompletedQty}</th>
                <th>{LACQUER_PLAN_LABELS.en.balanceToMake}</th>
                <th>{LACQUER_PLAN_LABELS.en.dispatchPendingQty}</th>
                <th>{LACQUER_PLAN_LABELS.en.soldQty}</th>
                <th>{LACQUER_PLAN_LABELS.en.bottlePerBox}</th>
                <th>{LACQUER_PLAN_LABELS.en.noOfOrderBoxes}</th>
                <th>{LACQUER_PLAN_LABELS.en.remarks}</th>
                <th>Status</th>
                {filterTab !== 'VALID' && <th>Reason</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? filteredRows.map((r, i) => {
                
                const isFirstInGroup = r.groupId && !renderedGroups.has(r.groupId);
                if (isFirstInGroup) {
                    renderedGroups.add(r.groupId);
                }
                const rowSpan = r.groupId ? visibleGroupSpans[r.groupId] : 1;
                const rowClasses = [
                    !r.isValid ? 'table-danger' : '',
                    isFirstInGroup ? 'border-top border-2 border-secondary' : ''
                ].filter(Boolean).join(' ');

                return (
                <tr key={i} className={rowClasses} title={r._importSource?.detectionMethod === 'gujarati' ? 'Gujarati header detected' : 'Fuzzy fallback used'}>
                  <td className="text-center fw-bold">
                    {r.excelRowNumber}
                    {r._importSource?.detectionMethod === 'gujarati' && (
                      <span className="badge bg-info ms-2" style={{ fontSize: '10px' }}>GJ</span>
                    )}
                  </td>
                  
                  {isFirstInGroup && (
                    <td 
                      className="align-middle fw-bold" 
                      rowSpan={rowSpan}
                      title={r.companyStatus === 'UNASSIGNED' ? `Original Company: ${r.originalCompanyName}` : undefined}
                    >
                      {r.companyStatus === 'UNASSIGNED' ? 'UNASSIGNED' : (r.companyName || 'UNASSIGNED')}
                    </td>
                  )}

                  {isFirstInGroup && (
                    <td className="fw-bold align-middle" rowSpan={rowSpan}>{r.bottleName || '*'}</td>
                  )}
                  
                  <td>
                     {r.variantName ? (
                       <span className="badge bg-info text-dark fw-normal">{r.variantName}</span>
                     ) : (
                       '-'
                     )}
                  </td>
                  <td>{r.coatingShade || '-'}</td>
                  <td>{r.brandName || '-'}</td>
                  
                  {isFirstInGroup && (
                    <td className="align-middle" rowSpan={rowSpan}>{r.process || '-'}</td>
                  )}
                  {isFirstInGroup && (
                    <td className="align-middle" rowSpan={rowSpan}>{r.plainStock !== null && r.plainStock !== undefined ? r.plainStock : '-'}</td>
                  )}
                  
                  <td className="fw-bold">{r.orderQty !== null && r.orderQty !== undefined ? r.orderQty : '-'}</td>
                  <td>{r.coatingCompletedQty !== null && r.coatingCompletedQty !== undefined ? r.coatingCompletedQty : '-'}</td>
                  <td>{r.balanceToMake !== null && r.balanceToMake !== undefined ? r.balanceToMake : '-'}</td>
                  <td>{r.dispatchPendingQty !== null && r.dispatchPendingQty !== undefined ? r.dispatchPendingQty : '-'}</td>
                  <td>{r.soldQty !== null && r.soldQty !== undefined ? r.soldQty : '-'}</td>
                  
                  {isFirstInGroup && (
                    <td className="align-middle" rowSpan={rowSpan}>{r.boxQty !== null && r.boxQty !== undefined ? r.boxQty : '-'}</td>
                  )}

                  <td>{r.noOfBoxes !== null && r.noOfBoxes !== undefined ? r.noOfBoxes : '-'}</td>
                  <td>{r.remarks || '-'}</td>
                  <td>
                     {r.isValid ? (
                       <span className="badge bg-success">VALID</span>
                     ) : (
                       <span className="badge bg-danger">INVALID</span>
                     )}
                  </td>
                  {filterTab !== 'VALID' && (
                    <td>
                      {!r.isValid && (
                         <div className="d-flex flex-column gap-1">
                           {r.errors.map((err, errIdx) => (
                             <span key={errIdx} className="text-danger small fw-bold">❌ {err}</span>
                           ))}
                         </div>
                      )}
                    </td>
                  )}
                </tr>
              );
              }) : (
                <tr>
                  <td colSpan={filterTab !== 'VALID' ? 18 : 17} className="text-center py-4 text-muted">No rows match the current filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content border-0 shadow">
          <div className="modal-header border-bottom-0" style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', color: 'white' }}>
            <h5 className="modal-title fw-bold">
               <i className="bi bi-file-earmark-excel me-2"></i> Import Lacquer Plan from Excel
            </h5>
            <button type="button" className="btn-close btn-close-white shadow-none" onClick={onClose} disabled={loading}></button>
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
                    Please select the monthly Lacquer Plan XLSX file. The file should have sheet names matching dates like <span className="fw-bold" style={{ color: 'var(--accent)' }}>01.09.26</span>.
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
            ) : activeDateTab ? (
              renderDetailsView()
            ) : (
              <div>
                <h5 className="fw-bold mb-4 border-bottom pb-2 text-dark" style={{ letterSpacing: '0.5px' }}>Import Verification & Summary</h5>
                
                {previewData.verificationReport && (
                  <div className="row mb-4">
                    <div className="col-md-12">
                      <div className="alert border-0 shadow-sm p-4 rounded-4" style={{ background: 'linear-gradient(135deg, #e0f2fe, #f0fdfa)' }}>
                        <h6 className="fw-bold text-dark mb-3"><i className="bi bi-info-circle-fill text-info me-2"></i>Detection Summary:</h6>
                        <ul className="mb-0 text-dark" style={{ listStyle: 'none', paddingLeft: 0 }}>
                          <li className="mb-2"><i className="bi bi-check2-circle text-success me-2"></i><strong>Gujarati Headers Detected:</strong> <span className="text-secondary">{previewData.verificationReport.dateGroupReports.reduce((sum, d) => sum + (d.rowValidation?.gujaratiRowCount || 0), 0)} rows</span></li>
                          <li className="mb-2"><i className="bi bi-check2-circle text-success me-2"></i><strong>Fuzzy Fallback Used:</strong> <span className="text-secondary">{previewData.verificationReport.dateGroupReports.reduce((sum, d) => sum + (d.rowValidation?.fuzzyFallbackCount || 0), 0)} rows</span></li>
                          <li><i className="bi bi-check2-circle text-success me-2"></i><strong>Total Valid Rows:</strong> <span className="text-secondary">{previewData.validRows} of {previewData.totalRows}</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                
                <h5 className="fw-bold mb-4 border-bottom pb-2 text-dark" style={{ letterSpacing: '0.5px' }}>Daily Summary & Import Settings</h5>
                
                <div className="table-responsive mb-4 border-0 shadow-sm rounded-4 overflow-hidden">
                  <table className="table table-hover mb-0 align-middle bg-white">
                    <thead style={{ background: '#f8fafc' }}>
                      <tr>
                        <th className="py-3 border-bottom border-light-subtle text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Date</th>
                        <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Valid Rows</th>
                        <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Invalid Rows</th>
                        <th className="py-3 border-bottom border-light-subtle text-center text-uppercase text-muted fw-bold" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>Existing Plans</th>
                        <th className="py-3 border-bottom border-light-subtle text-end text-uppercase text-muted fw-bold" style={{ minWidth: '200px', fontSize: '0.8rem', letterSpacing: '0.5px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.dates.map((d, idx) => {
                        return (
                          <tr key={idx}>
                            <td className="fw-bold">{d.date}</td>
                            <td className="text-center text-success fw-bold">{d.validRows}</td>
                            <td className="text-center text-danger">{d.invalidRows > 0 ? d.invalidRows : '-'}</td>
                            <td className="text-center">
                               {d.existingCount > 0 ? (
                                  <span className="badge bg-warning text-dark">{d.existingCount} existing</span>
                               ) : (
                                  <span className="badge bg-light text-muted">None</span>
                               )}
                            </td>
                            <td className="text-end d-flex gap-2 justify-content-end">
                               <button 
                                 className="btn btn-sm btn-outline-info shadow-sm fw-bold"
                                 onClick={() => {
                                   setActiveDateTab(d.date);
                                   setFilterTab('ALL');
                                   setSearch('');
                                 }}
                               >
                                 View Details
                               </button>
                             </td>
                          </tr>
                        );
                      })}
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
              !activeDateTab && (
                 <>
                   <button type="button" className="btn btn-outline-secondary shadow-sm px-4 py-2 rounded-pill fw-bold" onClick={handleReset} disabled={loading}>
                      <i className="bi bi-arrow-counterclockwise me-2"></i> Upload Different File
                   </button>
                   <button type="button" className="btn btn-success shadow-sm px-5 py-2 rounded-pill fw-bold" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: 'white' }} onClick={handleImportAll} disabled={loading}>
                      <i className="bi bi-cloud-arrow-up-fill me-2"></i> Import All
                   </button>
                 </>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
