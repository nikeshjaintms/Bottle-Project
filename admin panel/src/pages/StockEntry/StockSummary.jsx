import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { fetchStockSummary, setSearchTerm } from '../../redux/slices/stockEntrySlice';
import StockOutForm from './StockOutForm';
import html2pdf from 'html2pdf.js';
import { Can } from '../../context/AbilityContext';

const MATERIAL_ORDER = [
  "CLEAR GLOSS",
  "ECO COAT GLOSS",
  "FAST DILUENT",
  "SLOW DILUENT",
  "DILUENT MEDIUM",
  "MATT PAST",
  "BLACK PAST",
  "WHITE GLOSS",
  "BLACK GLOSS",
  "BLACK MATT",
  "ORANGE DYE",
  "ROYAL BLUE DYE",
  "GREEN DYE",
  "BLUE DYE",
  "VIOLET DYE",
  "RED DYE",
  "YELLOW DYE",
  "PINK DYE",
  "BLACK DYE",
  "BROWN DYE",
  "SPARKLE SILVER LACQUER"
];

export default function StockSummary() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState("");
  
  const { summary, loading, searchTerm } = useSelector((state) => state.stockEntries);
  const search = searchTerm || '';
  
  const sortedSummary = React.useMemo(() => {
    return [...summary].sort((a, b) => {
      const aName = a.rawMaterial?.name?.toUpperCase().trim() || "";
      const bName = b.rawMaterial?.name?.toUpperCase().trim() || "";
      
      const indexA = MATERIAL_ORDER.indexOf(aName);
      const indexB = MATERIAL_ORDER.indexOf(bName);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      return aName.localeCompare(bName);
    });
  }, [summary]);

  // Modals state
  const [showOutForm, setShowOutForm] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);

  useEffect(() => {
    dispatch(fetchStockSummary({
      date: selectedDate,
      page: 1,
      limit: 1000,
      search
    }));
  }, [dispatch, selectedDate, search]);

  const handleOpenOut = (material) => {
    setSelectedMaterial(material);
    setShowOutForm(true);
  };

  const handleViewHistory = (material) => {
    navigate('/stock-history', { state: { materialId: material.rawMaterial._id } });
  };

  const handlePrintSheet = () => {
    let rowsHTML = '';
    
    sortedSummary.forEach((item, index) => {
      rowsHTML += `
        <tr>
          <td style="border: 1px solid #000; text-align: center; font-weight: bold; padding: 10px;">${index + 1}</td>
          <td style="border: 1px solid #000; padding: 10px; font-weight: bold; text-transform: uppercase; font-size: 15px;">${item.rawMaterial.name}</td>
          <td style="border: 1px solid #000; padding: 10px;"></td>
          <td style="border: 1px solid #000; padding: 10px; text-align: center; font-weight: bold; font-size: 15px;">${item.currentStock.toFixed(2)} ${item.unit || 'KG'}</td>
        </tr>
      `;
    });

    const displayDate = selectedDate ? new Date(selectedDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #111;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 5px; border-bottom: 2px solid #000; padding-bottom: 10px;">
          <div style="font-size: 22px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #000;">RAW MATERIAL PHYSICAL STOCK SHEET</div>
          <div style="font-size: 20px; font-weight: bold; color: #000;">${displayDate}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-top: 15px;">
          <thead>
            <tr>
              <th style="width: 8%; border: 1px solid #000; padding: 12px; font-weight: bold; text-align: center; font-size: 14px; background-color: #f8f9fa;">SR. NO.</th>
              <th style="width: 50%; text-align: left; border: 1px solid #000; padding: 12px; font-weight: bold; font-size: 14px; background-color: #f8f9fa;">MATERIAL NAME</th>
              <th style="width: 22%; border: 1px solid #000; padding: 12px; font-weight: bold; text-align: center; font-size: 14px; background-color: #f8f9fa;">AVL. STOCK</th>
              <th style="width: 20%; border: 1px solid #000; padding: 12px; font-weight: bold; text-align: center; font-size: 14px; background-color: #f8f9fa;">TOTAL QTY</th>
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
      filename:     `Stock_Summary_${displayDate.replace(/\//g, '-')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
      pagebreak:    { avoid: 'tr' }
    };

    html2pdf().set(opt).from(container).save();
  };

  return (
    <div className="page-content stock-entry-page stock-entry-summary">
      <div className="page-header d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 companies-page-header stock-entry-header">
        <div className="flex-grow-1">
          <h1 className="page-title">Stock Summary</h1>
          <p className="page-subtitle">Overview of all raw material stock balances</p>
        </div>
        <div className="d-flex flex-wrap justify-content-start justify-content-md-end align-items-center gap-3 ms-md-auto stock-entry-header-actions">
          <div className="d-flex align-items-center gap-2">
            <label className="fw-bold text-muted mb-0 text-nowrap">Balance Date:</label>
            <input 
              type="date" 
              className="form-control shadow-none border-primary border-opacity-25" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <Can I="create" a="stock_entry">
            <Link to="/stock-entries/add" state={{ from: '/stock-summary' }} className="btn-accent companies-header-action d-flex align-items-center text-nowrap justify-content-center">
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
                <Link to="/stock-summary" className="nav-link bg-transparent border-0 px-0 pb-3 fw-bold active border-bottom border-primary border-3 text-primary text-nowrap">
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
                <Link to="/stock-history" className="nav-link bg-transparent border-0 px-0 pb-3 fw-bold text-muted text-nowrap">
                  <i className="bi bi-clock-history me-2"></i> Material History
                </Link>
              </li>
            </Can>
          </ul>
          <button onClick={handlePrintSheet} className="btn btn-sm btn-outline-danger d-flex align-items-center fw-bold shadow-sm bg-white mb-2 text-nowrap mt-2 mt-md-0">
            <i className="bi bi-file-earmark-pdf-fill me-2 fs-6"></i> Export PDF
          </button>
        </div>
        
        {/* Toolbar */}
        <div className="d-flex flex-wrap align-items-center justify-content-end p-3 border-bottom bg-white stock-entry-toolbar">
          <div className="search-input-wrapper position-relative companies-search-wrap">
            <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
              placeholder="Search materials..."
              value={search}
              onChange={e => dispatch(setSearchTerm(e.target.value))}
              style={{ borderRadius: 10, fontSize: 13 }}
            />
          </div>
        </div>

        <div className="companies-list-mobile">
          {loading && sortedSummary.length === 0 && (
            <div className="text-center py-5 text-muted">Loading...</div>
          )}
          {sortedSummary.map((item, index) => (
            <div key={item.rawMaterial._id} className="companies-mobile-card brands-mobile-card">
              <div className="d-flex align-items-start gap-3 w-100 min-w-0">
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                    <span className="text-muted small fw-bold">#{String(index + 1).padStart(2, '0')}</span>
                    <span className="fw-bold text-dark text-truncate fs-6">{item.rawMaterial.name}</span>
                  </div>
                  
                  <div className="row g-2 mb-3">
                    <div className="col-6">
                      <div className="text-muted small fw-600 mb-1">OPENING</div>
                      <span className="badge bg-light text-secondary border px-2 py-1 fs-7">{item.openingStock.toFixed(2)} {item.unit}</span>
                    </div>
                    <div className="col-6">
                      <div className="text-muted small fw-600 mb-1">IN</div>
                      <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 fs-7">+{item.totalIn.toFixed(2)} {item.unit}</span>
                    </div>
                    <div className="col-6">
                      <div className="text-muted small fw-600 mb-1">OUT</div>
                      <span className="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2 py-1 fs-7">-{item.totalOut.toFixed(2)} {item.unit}</span>
                    </div>
                    <div className="col-6">
                      <div className="text-primary small fw-bold mb-1">CURRENT</div>
                      <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2 py-1 fs-7">{item.currentStock.toFixed(2)} {item.unit}</span>
                    </div>
                  </div>
                  
                  <div className="companies-mobile-actions brands-mobile-actions d-flex gap-2">
                    <Can I="ledger" a="stock_entry">
                      <button onClick={() => handleViewHistory(item)} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none companies-mobile-action-btn flex-grow-1" title="View Ledger">
                        <i className="bi bi-clock-history me-1" /> Ledger
                      </button>
                    </Can>
                    <Can I="stockout" a="stock_entry">
                      <button onClick={() => handleOpenOut(item)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none companies-mobile-action-btn flex-grow-1" title="Stock OUT">
                        <i className="bi bi-box-arrow-up me-1" /> Stock OUT
                      </button>
                    </Can>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {sortedSummary.length === 0 && !loading && (
            <div className="companies-mobile-empty">No stock records found</div>
          )}
        </div>

        <div className="companies-list-desktop table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th className="py-3 text-uppercase small fw-bold text-muted ps-4">Sr No</th>
                <th className="py-3 text-uppercase small fw-bold text-muted">Raw Material</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Opening</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center text-success">Stock IN</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center text-danger">Stock OUT</th>
                <th className="py-3 text-uppercase small fw-bold text-primary text-center pe-4">Current Stock</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 180 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && sortedSummary.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-5">Loading...</td></tr>
              ) : sortedSummary.map((item, index) => (
                <tr key={item.rawMaterial._id}>
                  <td className="ps-4 text-muted fw-bold">{index + 1}</td>
                  <td className="fw-bold text-dark">{item.rawMaterial.name}</td>
                  <td className="text-center">
                    <span className="badge bg-light text-secondary border px-2 py-1">{item.openingStock.toFixed(2)} {item.unit}</span>
                  </td>
                  <td className="text-center">
                    <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1">+{item.totalIn.toFixed(2)} {item.unit}</span>
                  </td>
                  <td className="text-center">
                    <span className="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2 py-1">-{item.totalOut.toFixed(2)} {item.unit}</span>
                  </td>
                  <td className="text-center pe-4">
                    <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-3 py-1 fs-6">{item.currentStock.toFixed(2)} {item.unit}</span>
                  </td>
                  <td className="text-center">
                    <div className="companies-mobile-actions brands-mobile-actions d-flex gap-2 justify-content-center">
                      <Can I="ledger" a="stock_entry">
                        <button onClick={() => handleViewHistory(item)} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none companies-mobile-action-btn" title="View Ledger">
                          <i className="bi bi-clock-history fs-6" />
                        </button>
                      </Can>
                      <Can I="stockout" a="stock_entry">
                        <button onClick={() => handleOpenOut(item)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none companies-mobile-action-btn" title="Stock OUT">
                          <i className="bi bi-box-arrow-up fs-6" />
                        </button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedSummary.length === 0 && !loading && (
                <tr><td colSpan="7" className="text-center py-5 text-muted">No materials found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock OUT Modal */}
      {showOutForm && selectedMaterial && (
        <StockOutForm 
          onClose={() => setShowOutForm(false)}
          selectedDate={selectedDate}
          material={selectedMaterial}
        />
      )}
    </div>
  );
}
