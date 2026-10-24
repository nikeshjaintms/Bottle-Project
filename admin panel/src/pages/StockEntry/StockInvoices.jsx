import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchStockInvoices, deleteStockEntry, setSearchTerm } from '../../redux/slices/stockEntrySlice';
import Swal from 'sweetalert2';
import { Can } from '../../context/AbilityContext';
import { V_URL } from '../../../Baseurl.js';

export default function StockInvoices() {
  const dispatch = useDispatch();
  
  const { invoices, loading, invoicesPage, invoicesTotalPages, invoicesTotal, searchTerm } = useSelector((state) => state.stockEntries);
  const search = searchTerm || '';
  
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get("page") || '';
  const currentPage = Number(urlPage) || invoicesPage || 1;
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    dispatch(fetchStockInvoices({ page: currentPage, limit: itemsPerPage, search }));
  }, [dispatch, currentPage, itemsPerPage, search]);

  const handlePrintSheet = () => {
    let rowsHTML = '';
    
    invoices.forEach((invoice, index) => {
      rowsHTML += `
        <tr>
          <td style="border: 1px solid #000; padding: 10px;">${index + 1}</td>
          <td style="border: 1px solid #000; padding: 10px; font-weight: bold;">${new Date(invoice.date).toLocaleDateString('en-GB')}</td>
          <td style="border: 1px solid #000; padding: 10px; font-weight: bold; color: #0d6efd;">${invoice.invoiceNumber}</td>
          <td style="border: 1px solid #000; padding: 10px;">${invoice.supplierName}</td>
          <td style="border: 1px solid #000; padding: 10px; text-align: center;">${invoice.items?.length || 0} items</td>
        </tr>
      `;
    });

    const displayDate = new Date().toLocaleDateString('en-GB');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #111;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 5px; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <div style="font-size: 22px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #000;">STOCK INVOICES REPORT</div>
          <div style="font-size: 20px; font-weight: bold; color: #000;">${displayDate}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-top: 15px;">
          <thead>
            <tr>
              <th style="width: 5%; border: 1px solid #000; padding: 12px; font-weight: bold; text-align: left; font-size: 14px; background-color: #f8f9fa;">SR.</th>
              <th style="width: 20%; border: 1px solid #000; padding: 12px; font-weight: bold; text-align: left; font-size: 14px; background-color: #f8f9fa;">DATE</th>
              <th style="width: 25%; border: 1px solid #000; padding: 12px; font-weight: bold; text-align: left; font-size: 14px; background-color: #f8f9fa;">INVOICE NO</th>
              <th style="width: 35%; border: 1px solid #000; padding: 12px; font-weight: bold; text-align: left; font-size: 14px; background-color: #f8f9fa;">SUPPLIER</th>
              <th style="width: 15%; border: 1px solid #000; padding: 12px; font-weight: bold; text-align: center; font-size: 14px; background-color: #f8f9fa;">ITEMS</th>
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
      filename:     `Stock_Invoices_${displayDate.replace(/\//g, '-')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
      pagebreak:    { avoid: 'tr' }
    };

    window.html2pdf().set(opt).from(container).save();
  };

  const handleDeleteInvoice = (id, invoiceNumber) => {
    Swal.fire({
      title: 'Delete Invoice?',
      text: `Are you sure you want to delete invoice "${invoiceNumber}"? This will reverse the stock entry.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteStockEntry(id)).then(res => {
          if (!res.error) {
            Swal.fire('Deleted!', 'Invoice deleted successfully.', 'success');
            dispatch(fetchStockInvoices({ page: currentPage, limit: itemsPerPage, search }));
          } else {
            Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
          }
        });
      }
    });
  };

  return (
    <div className="page-content stock-entry-page stock-entry-invoices">
      <div className="page-header d-flex flex-wrap justify-content-between align-items-center gap-3 companies-page-header stock-entry-header">
        <div>
          <h1 className="page-title">Stock Invoices</h1>
          <p className="page-subtitle">Track and manage all raw material inward invoices</p>
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
                <Link to="/stock-invoices" className="nav-link bg-transparent border-0 px-0 pb-3 fw-bold active border-bottom border-primary border-3 text-primary text-nowrap">
                  <i className="bi bi-receipt-cutoff me-2"></i> Invoices
                </Link>
              </li>
            </Can>
            <Can I="ledger" a="stock_entry">
              <li className="nav-item flex-shrink-0">
                <Link to="/stock-history" className="nav-link bg-transparent border-0 px-0 pb-3 fw-bold text-muted text-nowrap">
                  <i className="bi bi-clock-history me-2"></i> Material History
                </Link>
              </li>
            </Can>
          </ul>
          <button onClick={handlePrintSheet} className="btn btn-sm btn-outline-danger d-flex align-items-center fw-bold shadow-sm bg-white mb-2 text-nowrap mt-2 mt-md-0" disabled={invoices.length === 0}>
            <i className="bi bi-file-earmark-pdf-fill me-2 fs-6"></i> Export PDF
          </button>
        </div>

        {/* Pagination Toolbar */}
        <div className="d-flex flex-wrap align-items-center justify-content-between p-3 border-bottom bg-white stock-entry-toolbar">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500 mb-2 mb-md-0">
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
          <div className="search-input-wrapper position-relative companies-search-wrap">
            <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
              placeholder="Search invoices..."
              value={search}
              onChange={e => { dispatch(setSearchTerm(e.target.value)); setSearchParams({ page: 1 }); }}
              style={{ borderRadius: 10, fontSize: 13 }}
            />
          </div>
        </div>

        <div className="companies-list-mobile">
          {loading ? (
            <div className="text-center py-5 text-muted">Loading...</div>
          ) : invoices.map(invoice => (
            <div key={invoice._id} className="companies-mobile-card brands-mobile-card">
              <div className="d-flex align-items-start gap-3 w-100 min-w-0">
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="fw-bold text-primary fs-6">{invoice.invoiceNumber}</span>
                    <span className="text-dark small fw-bold">{new Date(invoice.date).toLocaleDateString()}</span>
                  </div>
                  <div className="text-muted small mb-2">{invoice.supplierName}</div>
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <span className="badge bg-light text-dark border px-2 py-1">{invoice.items.length} items</span>
                    <div className="d-flex flex-column text-end">
                      <span className="text-muted" style={{ fontSize: '11px' }}>Added on {new Date(invoice.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div className="companies-mobile-actions brands-mobile-actions d-flex gap-2">
                    {invoice.invoiceFileUrl && (
                      <a href={`${V_URL}${invoice.invoiceFileUrl}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-success border-0 rounded-3 shadow-none companies-mobile-action-btn flex-grow-1" title="View File">
                        <i className="bi bi-file-earmark-pdf me-1" /> File
                      </a>
                    )}
                    <Link to={`/stock-entries/view/${invoice._id}`} state={{ from: '/stock-invoices' }} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none companies-mobile-action-btn flex-grow-1" title="View Details">
                      <i className="bi bi-eye fs-6" />
                    </Link>
                    <Can I="edit" a="stock_entry">
                      <Link to={`/stock-entries/edit/${invoice._id}`} state={{ from: '/stock-invoices' }} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn flex-grow-1" title="Edit">
                        <i className="bi bi-pencil-square fs-6" />
                      </Link>
                    </Can>
                    <Can I="delete" a="stock_entry">
                      <button type="button" onClick={() => handleDeleteInvoice(invoice._id, invoice.invoiceNumber)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none companies-mobile-action-btn flex-grow-1" title="Delete">
                        <i className="bi bi-trash fs-6" />
                      </button>
                    </Can>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {invoices.length === 0 && !loading && (
            <div className="companies-mobile-empty">No invoices found.</div>
          )}
        </div>

        <div className="companies-list-desktop table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="py-3 text-uppercase small fw-bold text-muted ps-4">Invoice Date</th>
                <th className="py-3 text-uppercase small fw-bold text-muted">Invoice No.</th>
                <th className="py-3 text-uppercase small fw-bold text-muted">Supplier Name</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Total Items</th>
                <th className="py-3 text-uppercase small fw-bold text-muted">Time and Date of Entry</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center pe-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center py-5">Loading...</td></tr>
              ) : invoices.map(invoice => (
                <tr key={invoice._id}>
                  <td className="ps-4 fw-bold text-dark">{new Date(invoice.date).toLocaleDateString()}</td>
                  <td className="fw-bold text-primary">{invoice.invoiceNumber}</td>
                  <td>{invoice.supplierName}</td>
                  <td className="text-center fw-500">
                    <span className="badge bg-light text-dark border px-2 py-1">{invoice.items.length} items</span>
                  </td>
                  <td className="text-muted small">
                    <div className="d-flex flex-column">
                      <span className="fw-bold text-dark">{new Date(invoice.createdAt).toLocaleDateString()}</span>
                      <span className="text-muted" style={{ fontSize: '11px' }}>{new Date(invoice.createdAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
                    </div>
                  </td>
                  <td className="text-center pe-4">
                    <div className="companies-mobile-actions brands-mobile-actions d-flex gap-2 justify-content-center">
                      {invoice.invoiceFileUrl && (
                        <a href={`${V_URL}${invoice.invoiceFileUrl}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-success border-0 rounded-3 shadow-none companies-mobile-action-btn" title="View File">
                          <i className="bi bi-file-earmark-pdf fs-6" />
                        </a>
                      )}
                      <Link to={`/stock-entries/view/${invoice._id}`} state={{ from: '/stock-invoices' }} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none companies-mobile-action-btn" title="View Details">
                        <i className="bi bi-eye fs-6" />
                      </Link>
                      <Can I="edit" a="stock_entry">
                        <Link to={`/stock-entries/edit/${invoice._id}`} state={{ from: '/stock-invoices' }} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Edit">
                          <i className="bi bi-pencil-square fs-6" />
                        </Link>
                      </Can>
                      <Can I="delete" a="stock_entry">
                        <button type="button" onClick={() => handleDeleteInvoice(invoice._id, invoice.invoiceNumber)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Delete">
                          <i className="bi bi-trash fs-6" />
                        </button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && !loading && (
                <tr><td colSpan="6" className="text-center py-5 text-muted">No invoices found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {invoicesTotal > 0 && (
          <div className="d-flex flex-wrap align-items-center justify-content-between p-3 border-top bg-white">
            <div className="text-muted small mb-2 mb-md-0">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, invoicesTotal)} of {invoicesTotal} entries
            </div>
            <div className="d-flex gap-1">
              <button
                className="btn btn-sm btn-light border-light-subtle shadow-none"
                disabled={currentPage === 1}
                onClick={() => setSearchParams({ page: currentPage - 1 })}
              >
                Previous
              </button>
              {Array.from({ length: invoicesTotalPages }, (_, i) => i + 1).map((pg) => {
                if (
                  pg === 1 || 
                  pg === invoicesTotalPages || 
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
                disabled={currentPage === invoicesTotalPages}
                onClick={() => setSearchParams({ page: currentPage + 1 })}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
