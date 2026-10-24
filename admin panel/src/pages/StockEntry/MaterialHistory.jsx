import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { fetchStockSummary, fetchMaterialHistory, deleteStockEntry, setSearchTerm } from '../../redux/slices/stockEntrySlice';
import StockOutForm from './StockOutForm';
import { Can } from '../../context/AbilityContext';
import Select from 'react-select';
import Swal from 'sweetalert2';

export default function MaterialHistory() {
  const dispatch = useDispatch();
  const location = useLocation();
  
  const { summary, history, historyCurrentStock, loading, historyPage, historyTotalPages, historyTotal, searchTerm } = useSelector((state) => state.stockEntries);
  const search = searchTerm || '';
  
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get("page") || '';
  const currentPage = Number(urlPage) || historyPage || 1;
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modals state
  const [showOutForm, setShowOutForm] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [editOutEntry, setEditOutEntry] = useState(null);

  // Ensure summary is loaded
  useEffect(() => {
    if (summary.length === 0) {
      dispatch(fetchStockSummary({ date: new Date().toISOString().split('T')[0], page: 1, limit: 1000, search: '' }));
    }
  }, [dispatch, summary.length]);

  // Handle incoming materialId from navigation state
  useEffect(() => {
    if (summary.length > 0) {
      if (location.state?.materialId) {
        const mat = location.state.materialId === 'all' 
          ? { rawMaterial: { _id: 'all', name: 'All Materials' } }
          : summary.find(m => m.rawMaterial._id === location.state.materialId);
          
        if (mat && (!selectedMaterial || mat.rawMaterial._id !== selectedMaterial.rawMaterial._id)) {
          setSelectedMaterial(mat);
        }
      } else if (!selectedMaterial) {
        setSelectedMaterial({ rawMaterial: { _id: 'all', name: 'All Materials' } });
      }
    }
    // eslint-disable-next-line
  }, [summary, location.state]);

  // Fetch paginated history when selected material, page, limit, or search changes
  useEffect(() => {
    if (selectedMaterial) {
      dispatch(fetchMaterialHistory({
        id: selectedMaterial.rawMaterial._id,
        page: currentPage,
        limit: itemsPerPage,
        search
      }));
    }
  }, [dispatch, selectedMaterial, currentPage, itemsPerPage, search]);

  const handleEditOut = (record, material) => {
    setSelectedMaterial(material);
    setEditOutEntry({
      id: record._id.split('_')[0],
      date: record.date,
      quantity: Math.abs(record.quantity)
    });
    setShowOutForm(true);
  };

  const handleDeleteInvoice = (id, invoiceNumber) => {
    Swal.fire({
      title: 'Delete Entry?',
      text: `Are you sure you want to delete "${invoiceNumber}"? This will reverse the stock changes.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteStockEntry(id)).then(res => {
          if (!res.error) {
            Swal.fire('Deleted!', 'Entry deleted successfully.', 'success');
            dispatch(fetchStockSummary({ date: new Date().toISOString().split('T')[0], page: 1, limit: 1000, search: '' }));
            if (selectedMaterial) {
              dispatch(fetchMaterialHistory({ id: selectedMaterial.rawMaterial._id, page: currentPage, limit: itemsPerPage, search }));
            }
          } else {
            Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
          }
        });
      }
    });
  };

  const handlePrintSheet = () => {
    let rowsHTML = '';
    const isSpecificMaterial = selectedMaterial && selectedMaterial.rawMaterial._id !== 'all';
    
    history.forEach((record, index) => {
      const isIN = record.type === 'IN';
      const reference = isIN ? record.invoiceNumber : (record.remarks || 'Stock OUT');
      
      rowsHTML += `
        <tr>
          <td style="border: 1px solid #000; padding: 8px;">${index + 1}</td>
          <td style="border: 1px solid #000; padding: 8px;">${new Date(record.createdAt || record.date).toLocaleDateString('en-GB')}</td>
          ${!isSpecificMaterial ? `<td style="border: 1px solid #000; padding: 8px; font-weight: bold;">${record.materialName}</td>` : ''}
          <td style="border: 1px solid #000; padding: 8px; font-weight: bold; color: ${isIN ? 'green' : 'red'};">${record.type}</td>
          <td style="border: 1px solid #000; padding: 8px;">${reference}</td>
          <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">${isIN ? '+' : '-'}${record.quantity.toFixed(2)} ${record.unit || 'KG'}</td>
          ${isSpecificMaterial ? `<td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">${record.balance.toFixed(2)} ${record.unit || 'KG'}</td>` : ''}
        </tr>
      `;
    });

    const displayDate = new Date().toLocaleDateString('en-GB');
    const materialTitle = isSpecificMaterial ? selectedMaterial.rawMaterial.name : 'ALL MATERIALS';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #111;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 5px; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <div style="font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #000;">STOCK HISTORY - ${materialTitle}</div>
          <div style="font-size: 16px; font-weight: bold; color: #000;">${displayDate}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-top: 15px; font-size: 12px;">
          <thead>
            <tr>
              <th style="width: 5%; border: 1px solid #000; padding: 8px; font-weight: bold; text-align: left; background-color: #f8f9fa;">SR.</th>
              <th style="width: 15%; border: 1px solid #000; padding: 8px; font-weight: bold; text-align: left; background-color: #f8f9fa;">DATE</th>
              ${!isSpecificMaterial ? `<th style="width: 25%; border: 1px solid #000; padding: 8px; font-weight: bold; text-align: left; background-color: #f8f9fa;">MATERIAL</th>` : ''}
              <th style="width: 10%; border: 1px solid #000; padding: 8px; font-weight: bold; text-align: left; background-color: #f8f9fa;">TYPE</th>
              <th style="width: 20%; border: 1px solid #000; padding: 8px; font-weight: bold; text-align: left; background-color: #f8f9fa;">REFERENCE</th>
              <th style="width: 15%; border: 1px solid #000; padding: 8px; font-weight: bold; text-align: center; background-color: #f8f9fa;">QTY</th>
              ${isSpecificMaterial ? `<th style="width: 15%; border: 1px solid #000; padding: 8px; font-weight: bold; text-align: center; background-color: #f8f9fa;">BALANCE</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = htmlContent;

    const opt = {
      margin:       0.5,
      filename:     `Material_History_${displayDate.replace(/\//g, '-')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
      pagebreak:    { avoid: 'tr' }
    };

    window.html2pdf().set(opt).from(container).save();
  };

  const customSelectStyles = {
    control: (provided, state) => ({
      ...provided,
      borderColor: state.isFocused ? '#0d6efd' : '#dee2e6',
      boxShadow: state.isFocused ? '0 0 0 0.25rem rgba(13, 110, 253, 0.25)' : 'none',
      borderRadius: '8px',
      padding: '2px',
      backgroundColor: '#f8f9fa'
    }),
    indicatorSeparator: () => ({ display: 'none' }), // Removes the grey separator line
  };

  return (
    <div className="page-content stock-entry-page stock-entry-history">
      <div className="page-header d-flex flex-wrap justify-content-between align-items-center gap-3 companies-page-header stock-entry-header">
        <div>
          <h1 className="page-title">Material History</h1>
          <p className="page-subtitle">Track every inward and outward transaction</p>
        </div>
        <div className="d-flex align-items-center gap-3">
          <Can I="create" a="stock_entry">
            <Link to="/stock-entries/add" className="btn-accent companies-header-action d-flex align-items-center text-nowrap">
              <i className="bi bi-plus-lg me-2"></i> New Stock IN
            </Link>
          </Can>
        </div>
      </div>

      <div className="dash-card p-0 stock-entry-card">
        <div className="dash-card-header d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between px-4 pt-3 border-bottom bg-white companies-dash-toolbar gap-3 stock-entry-tabs">
          <ul className="nav nav-tabs border-0 flex-row flex-nowrap w-100 overflow-auto gap-4 pb-1" style={{ marginBottom: '-1px', WebkitOverflowScrolling: 'touch', whiteSpace: 'nowrap' }}>
            <Can I="read" a="stock_entry">
              <li className="nav-item flex-shrink-0">
                <Link to="/stock-summary" className="nav-link bg-transparent border-0 px-0 pb-3 fw-bold text-muted text-nowrap">
                  <i className="bi bi-box-seam me-2"></i> Stock Summary
                </Link>
              </li>
              <li className="nav-item flex-shrink-0">
                <Link to="/stock-invoices" className="nav-link bg-transparent border-0 px-0 pb-3 fw-bold text-muted text-nowrap">
                  <i className="bi bi-receipt-cutoff me-2"></i> Invoices
                </Link>
              </li>
            </Can>
            <Can I="ledger" a="stock_entry">
              <li className="nav-item flex-shrink-0">
                <Link to="/stock-history" className="nav-link bg-transparent border-0 px-0 pb-3 fw-bold active border-bottom border-primary border-3 text-primary text-nowrap">
                  <i className="bi bi-clock-history me-2"></i> Material History
                </Link>
              </li>
            </Can>
          </ul>
          <button onClick={handlePrintSheet} className="btn btn-sm btn-outline-danger d-flex align-items-center fw-bold shadow-sm bg-white mb-2 text-nowrap mt-2 mt-md-0" disabled={history.length === 0}>
            <i className="bi bi-file-earmark-pdf-fill me-2 fs-6"></i> Export PDF
          </button>
        </div>
        
        {/* Pagination Toolbar */}
        <div className="d-flex flex-wrap align-items-center justify-content-between p-3 border-bottom bg-white companies-dash-toolbar stock-entry-toolbar stock-entry-history-toolbar">
          <div className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center gap-2 gap-sm-3 mb-2 mb-md-0 w-100 w-md-auto flex-grow-1">
            <span className="text-muted fw-bold small text-nowrap">Select Material:</span>
            <div className="flex-grow-1" style={{ width: '100%', maxWidth: '300px' }}>
              <Select
                styles={customSelectStyles}
                classNamePrefix="react-select"
                menuPortalTarget={document.body}
                options={[
                  { value: 'all', label: '-- All Materials --' },
                  ...summary.map(item => ({
                    value: item.rawMaterial._id,
                    label: item.rawMaterial.name
                  }))
                ]}
                value={
                  selectedMaterial?.rawMaterial?._id === 'all'
                    ? { value: 'all', label: '-- All Materials --' }
                    : selectedMaterial?.rawMaterial
                      ? { value: selectedMaterial.rawMaterial._id, label: selectedMaterial.rawMaterial.name }
                      : null
                }
                onChange={(selectedOption) => {
                  setSearchParams({ page: 1 });
                  if (selectedOption.value === 'all') {
                    setSelectedMaterial({ rawMaterial: { _id: 'all', name: 'All Materials' } });
                  } else {
                    const mat = summary.find(m => m.rawMaterial._id === selectedOption.value);
                    if (mat) setSelectedMaterial(mat);
                  }
                }}
                placeholder="Search Material..."
              />
            </div>
            
            <div className="d-flex align-items-center gap-2 text-muted small fw-500 ms-md-4">
              <span>Show</span>
              <select
                className="form-select form-select-sm shadow-none border-light-subtle bg-light"
                style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
              <span>entries</span>
            </div>
          </div>
          
          <div className="d-flex align-items-center gap-3">
            <div className="search-input-wrapper position-relative companies-search-wrap">
              <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
              <input
                type="text"
                className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
                placeholder="Search history..."
                value={search}
                onChange={e => { dispatch(setSearchTerm(e.target.value)); setSearchParams({ page: 1 }); }}
                style={{ borderRadius: 10, fontSize: 13 }}
              />
            </div>
            
            {selectedMaterial && selectedMaterial.rawMaterial._id !== 'all' && (
              <div className="fw-bold border rounded-3 px-3 py-2 bg-light text-primary d-none d-md-block">
                Current Balance: {historyCurrentStock.toFixed(2)} {history[0]?.unit || 'KG'}
              </div>
            )}
          </div>
        </div>
        
        <div className="companies-list-mobile">
          {loading ? (
            <div className="text-center py-5 text-muted">Loading...</div>
          ) : history.map((record, idx) => (
            <div key={record._id || idx} className="companies-mobile-card brands-mobile-card">
              <div className="d-flex align-items-start gap-3 w-100 min-w-0">
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="fw-bold text-dark text-truncate fs-6 pe-2">{record.materialName}</span>
                    <span className="text-dark small fw-bold text-nowrap">{new Date(record.createdAt || record.date).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <div className="d-flex align-items-center gap-2">
                      {record.type === 'IN' 
                        ? <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1">IN</span>
                        : <span className="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2 py-1">OUT</span>}
                      {record.type === 'IN' ? (
                        <span className="text-muted small fw-500">{record.invoiceNumber}</span>
                      ) : (
                        <span className="text-muted small fw-500">{record.remarks || 'Stock OUT'}</span>
                      )}
                    </div>
                    <span className={`badge ${record.type === 'IN' ? 'bg-success bg-opacity-10 text-success border-success' : 'bg-danger bg-opacity-10 text-danger border-danger'} border border-opacity-25 px-2 py-1 fs-7`}>
                      {record.type === 'IN' ? '+' : '-'}{record.quantity.toFixed(2)} {record.unit || 'KG'}
                    </span>
                  </div>

                  {selectedMaterial && selectedMaterial.rawMaterial._id !== 'all' && (
                    <div className="d-flex align-items-center justify-content-between mb-3 border-top pt-2 mt-2">
                      <span className="text-muted small fw-600">BALANCE</span>
                      <span className="fw-bold text-primary fs-6">{record.balance.toFixed(2)} {record.unit || 'KG'}</span>
                    </div>
                  )}
                  
                  <div className="companies-mobile-actions brands-mobile-actions d-flex gap-2">
                    {record.type === 'IN' ? (
                      <Can I="edit" a="stock_entry">
                        <Link to={`/stock-entries/edit/${record._id.split('_')[0]}`} state={{ from: '/stock-history', editItemId: record._id.split('_')[1] }} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn flex-grow-1" title="Edit IN">
                          <i className="bi bi-pencil-square me-1" /> Edit
                        </Link>
                      </Can>
                    ) : (
                      <Can I="edit" a="stock_entry">
                        <button onClick={() => {
                          const mat = selectedMaterial.rawMaterial._id === 'all' 
                            ? summary.find(s => s.rawMaterial._id === record._id.split('_')[1])
                            : selectedMaterial;
                          if(mat) handleEditOut(record, mat);
                        }} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn flex-grow-1" title="Edit OUT">
                          <i className="bi bi-pencil-square me-1" /> Edit
                        </button>
                      </Can>
                    )}
                    <Can I="delete" a="stock_entry">
                      <button onClick={() => handleDeleteInvoice(record._id.split('_')[0], record.invoiceNumber || 'OUT')} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none companies-mobile-action-btn flex-grow-1" title="Delete">
                        <i className="bi bi-trash fs-6" />
                      </button>
                    </Can>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {history.length === 0 && !loading && (
            <div className="companies-mobile-empty">No history records found.</div>
          )}
        </div>

        {selectedMaterial ? (
          <div className="companies-list-desktop table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="py-3 text-uppercase small fw-bold text-muted ps-4">Date & Time</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted">Material</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center">Type</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted">Reference</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center">Quantity</th>
                  {selectedMaterial.rawMaterial._id !== 'all' && (
                    <th className="py-3 text-uppercase small fw-bold text-primary text-center">Balance</th>
                  )}
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center pe-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-5 text-muted">Loading...</td></tr>
                ) : history.map((record, idx) => (
                  <tr key={record._id || idx}>
                    <td className="ps-4">
                      <div className="d-flex flex-column">
                        <span className="fw-bold text-dark">{new Date(record.createdAt || record.date).toLocaleDateString()}</span>
                        <span className="text-muted" style={{ fontSize: '11px' }}>{new Date(record.createdAt || record.date).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
                      </div>
                    </td>
                    <td className="fw-bold text-dark">{record.materialName}</td>
                    <td className="text-center">
                      {record.type === 'IN' 
                        ? <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill shadow-sm">IN</span>
                        : <span className="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-3 py-2 rounded-pill shadow-sm">OUT</span>}
                    </td>
                    <td className="text-muted small">
                      {record.type === 'IN' ? (
                        <div className="d-flex align-items-center gap-2">
                          <div className="bg-light p-2 rounded text-primary">
                            <i className="bi bi-receipt"></i>
                          </div>
                          <div>
                            <span className="fw-bold text-dark d-block">{record.invoiceNumber}</span>
                            <span style={{fontSize: 11}}>{record.supplierName}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center gap-2">
                          <div className="bg-light p-2 rounded text-danger">
                            <i className="bi bi-box-arrow-up"></i>
                          </div>
                          <span className="fw-500">{record.remarks || 'Stock OUT'}</span>
                        </div>
                      )}
                    </td>
                    <td className="text-center">
                      <span className={`badge ${record.type === 'IN' ? 'bg-success bg-opacity-10 text-success border-success' : 'bg-danger bg-opacity-10 text-danger border-danger'} border border-opacity-25 px-2 py-1`}>
                        {record.type === 'IN' ? '+' : '-'}{record.quantity.toFixed(2)} {record.unit || 'KG'}
                      </span>
                    </td>
                    {selectedMaterial.rawMaterial._id !== 'all' && (
                      <td className="text-center">
                        <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-3 py-1 fs-6">
                          {record.balance.toFixed(2)} {record.unit || 'KG'}
                        </span>
                      </td>
                    )}
                    <td className="text-center pe-4">
                      <div className="companies-mobile-actions brands-mobile-actions d-flex gap-2 justify-content-center">
                        {record.type === 'IN' ? (
                          <>
                            <Can I="edit" a="stock_entry">
                              <Link to={`/stock-entries/edit/${record._id.split('_')[0]}`} state={{ from: '/stock-history', editItemId: record._id.split('_')[1] }} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Edit IN">
                                <i className="bi bi-pencil-square fs-6" />
                              </Link>
                            </Can>
                          </>
                        ) : (
                          <>
                            <Can I="edit" a="stock_entry">
                              <button onClick={() => {
                                const mat = selectedMaterial.rawMaterial._id === 'all' 
                                  ? summary.find(s => s.rawMaterial._id === record._id.split('_')[1])
                                  : selectedMaterial;
                                if(mat) handleEditOut(record, mat);
                              }} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Edit OUT">
                                <i className="bi bi-pencil-square fs-6" />
                              </button>
                            </Can>
                          </>
                        )}
                        <Can I="delete" a="stock_entry">
                          <button onClick={() => handleDeleteInvoice(record._id.split('_')[0], record.invoiceNumber || 'OUT')} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Delete">
                            <i className="bi bi-trash fs-6" />
                          </button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && !loading && (
                  <tr><td colSpan="7" className="text-center py-5 text-muted">No history found for this material.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-5 text-muted">Please select a material to view history.</div>
        )}
        
        {/* Pagination Footer */}
        {historyTotal > 0 && (
          <div className="d-flex flex-wrap align-items-center justify-content-between p-3 border-top bg-white">
            <div className="text-muted small mb-2 mb-md-0">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, historyTotal)} of {historyTotal} entries
            </div>
            <div className="d-flex gap-1">
              <button
                className="btn btn-sm btn-light border-light-subtle shadow-none"
                disabled={currentPage === 1}
                onClick={() => setSearchParams({ page: currentPage - 1 })}
              >
                Previous
              </button>
              {Array.from({ length: historyTotalPages }, (_, i) => i + 1).map((pg) => {
                if (
                  pg === 1 || 
                  pg === historyTotalPages || 
                  (pg >= currentPage - 1 && pg <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={pg}
                      className={`btn btn-sm shadow-none ${currentPage === pg ? 'btn-primary' : 'btn-light border-light-subtle'}`}
                      onClick={() => setSearchParams({ page: pg })}
                    >
                      {pg}
                    </button>
                  );
                }
                if (pg === currentPage - 2 || pg === currentPage + 2) {
                  return <span key={pg} className="px-2 py-1 text-muted">...</span>;
                }
                return null;
              })}
              <button
                className="btn btn-sm btn-light border-light-subtle shadow-none"
                disabled={currentPage === historyTotalPages}
                onClick={() => setSearchParams({ page: currentPage + 1 })}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stock OUT Modal */}
      {showOutForm && selectedMaterial && (
        <StockOutForm 
          onClose={() => {
            setShowOutForm(false);
            setEditOutEntry(null);
          }}
          selectedDate={new Date().toISOString().split('T')[0]}
          material={selectedMaterial}
          editEntry={editOutEntry}
        />
      )}
    </div>
  );
}
