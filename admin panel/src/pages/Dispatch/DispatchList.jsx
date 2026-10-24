import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { fetchDispatch, deleteDispatch } from '../../redux/slices/dispatchSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { Can } from '../../context/AbilityContext';
import Select from 'react-select';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import DispatchImportModal from './DispatchImportModal';

export default function DispatchList() {
  const dispatch = useDispatch();
  const { data: dispatches, loading, totalPages, total } = useSelector(state => state.dispatch);
  const { companies } = useSelector(state => state.companies);
  const { items: bottlePerBoxes } = useSelector(state => state.bottlePerBox);
  const { bottleSpecs } = useSelector(state => state.bottleSpecs);

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [bottleFilter, setBottleFilter] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showImportModal, setShowImportModal] = useState(false);
  
  const { companyId } = useParams();
  const navigate = useNavigate();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Number(searchParams.get("page")) || 1;

  // Debounce search
  const searchTimeoutRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setSearchParams({ page: '1' });
    }, 400);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchTerm]);

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: "false" }));
    if (companyId) {
      dispatch(fetchBottlePerBoxes({ pagination: "false" }));
      dispatch(fetchBottleSpecs({ pagination: "false" }));
    }
  }, [dispatch, companyId]);

  const selectedCompany = React.useMemo(() => {
    if (!companyId || !companies) return null;
    return companies.find(c => c._id === companyId);
  }, [companyId, companies]);

  // Fetch bottle options from API instead of from page data
  const [bottleOptions, setBottleOptions] = useState([]);

  useEffect(() => {
    if (companyId) {
      api.get('/dispatch/bottle-options', { params: { companyId } })
        .then(res => {
          const options = res.data.data || [];
          
          const unmappedCount = res.data.unmappedCount ?? 0;
          
          // Build options array with Unmapped first (no brackets or counts)
          const allOptions = [
            { value: 'Unmapped', label: 'Unmapped' },
            ...options
              .map(b => ({ value: b.name, label: b.name }))
              .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))
          ];
          
          setBottleOptions(allOptions);
        })
        .catch(err => console.error('Error fetching bottle options:', err));
    }
  }, [companyId]);

  // Fetch data with proper pagination
  useEffect(() => {
    dispatch(fetchDispatch({ 
      page: currentPage,
      limit: itemsPerPage,
      search: debouncedSearch, 
      dateFrom,
      dateTo,
      companyId,
      plainBottleName: bottleFilter,
      pagination: "true"
    }));
  }, [dispatch, currentPage, itemsPerPage, debouncedSearch, dateFrom, dateTo, companyId, bottleFilter]);

  const handlePageChange = (newPage) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('page', String(newPage));
      return params;
    });
  };

  const handlePageSizeChange = (newSize) => {
    setItemsPerPage(newSize);
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('page', '1');
      return params;
    });
  };

  const handleReset = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setBottleFilter('');
    setItemsPerPage(10);
    setSearchParams({ page: '1' });
  };

  const handleDelete = (id, gatePassNo) => {
    Swal.fire({
      title: 'Delete Record?',
      text: `Are you sure you want to delete G. Pass No. "${gatePassNo}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteDispatch(id)).then(res => {
          if (!res.error) {
            Swal.fire('Deleted!', 'Record removed.', 'success');
            dispatch(fetchDispatch({ 
              page: 1,
              limit: itemsPerPage,
              search: debouncedSearch,
              dateFrom,
              dateTo,
              companyId,
              plainBottleName: bottleFilter
            }));
          } else {
            Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
          }
        });
      }
    });
  };

  const handleExport = async () => {
    try {
      Swal.fire({
        title: 'Generating Export...',
        text: 'Please wait while we fetch the data.',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      // Fetch ALL matching data (not just current page) for export
      const response = await api.get('/dispatch', {
        params: {
          search: debouncedSearch,
          dateFrom,
          dateTo,
          companyId,
          plainBottleName: bottleFilter,
          pagination: 'false'
        }
      });

      const allData = response.data.data || [];

      if (allData.length === 0) {
        Swal.fire('No Data', 'There is no data to export for the selected filters.', 'info');
        return;
      }

      let exportedData = [];
      let srNo = 1;
      
      allData.forEach((dispatch) => {
        if (dispatch.items && dispatch.items.length > 0) {
          dispatch.items.forEach((item, itemIdx) => {
            exportedData.push({
              'Sr No': srNo,
              'Dispatch Date': new Date(dispatch.dispatchDate).toLocaleDateString('en-GB'),
              'G. Pass No': dispatch.gatePassNo || 'N/A',
              'Company': dispatch.companyId?.name || 'N/A',
              'Bottle Name': item.plainBottleName || 'Unmapped',
              'Variant': item.variantName || '-',
              'Coating Shade': item.coatingShade || '-',
              'Text Color': item.detectedTextColor || '-',
              'Box': item.box || 0,
              'Qty/Box': item.qty || 0,
              'Total Qty': item.totalQty || 0,
              'Remarks': dispatch.remarks || '-'
            });
            srNo++;
          });
        } else {
          exportedData.push({
            'Sr No': srNo,
            'Dispatch Date': new Date(dispatch.dispatchDate).toLocaleDateString('en-GB'),
            'G. Pass No': dispatch.gatePassNo || 'N/A',
            'Company': dispatch.companyId?.name || 'N/A',
            'Bottle Name': 'N/A',
            'Variant': '-',
            'Coating Shade': '-',
            'Text Color': '-',
            'Box': 0,
            'Qty/Box': 0,
            'Total Qty': 0,
            'Remarks': dispatch.remarks || '-'
          });
          srNo++;
        }
      });

      const worksheet = XLSX.utils.json_to_sheet(exportedData);
      worksheet['!cols'] = [
        { wch: 6 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 20 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 20 }
      ];
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Dispatch`);

      let filename = `Dispatch`;
      if (dateFrom) filename += `_from_${dateFrom}`;
      if (dateTo) filename += `_to_${dateTo}`;
      filename += ".xlsx";

      XLSX.writeFile(workbook, filename);
      Swal.close();
    } catch (err) {
      console.error(err);
      Swal.fire('Export Failed', 'An error occurred while generating the export.', 'error');
    }
  };

  // Calculate pagination display
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, total);
  const showingText = total === 0 ? 'Showing 0 entries' : `Showing ${startIndex} to ${endIndex} of ${total} entries`;

  return (
    <div className="page-content dispatch-module-page dispatch-module-list">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate('/dispatch')} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
            <i className="bi bi-arrow-left fs-5 text-secondary" />
          </button>
          <div>
            <h1 className="page-title mb-0">Dispatch Register{selectedCompany ? ` - ${selectedCompany.name}` : ''}</h1>
            <p className="page-subtitle mb-0">Record dispatch/gate-pass transactions</p>
          </div>
        </div>
        <div className="d-flex gap-2">
          <button onClick={handleExport} className="btn btn-outline-accent shadow-sm px-4 py-2 rounded-3" style={{ fontWeight: 600 }}>
            <i className="bi bi-file-earmark-excel-fill me-2" /> Export Excel
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-outline-success shadow-sm px-4 py-2 rounded-3" style={{ fontWeight: 600 }}>
            <i className="bi bi-file-earmark-arrow-up me-2" /> Import Excel
          </button>
          <Can I="create" a="dispatch">
            <Link to="/dispatch/add" className="btn-accent companies-header-action">
              <i className="bi bi-plus-lg me-2" /> New Dispatch
            </Link>
          </Can>
        </div>
      </div>

      {companyId && (
        <div className="dash-card mb-4 border-top-accent" style={{ borderTop: '3px solid var(--accent)' }}>
          <div className="dash-card-body p-3">
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-funnel text-accent fw-bold" style={{ fontSize: 18 }}></i>
              <h6 className="mb-0 fw-bold text-dark">Filter by Dispatch Date & Bottle</h6>
            </div>
            <div className="row g-3 align-items-end">
              <div className="col-12 col-sm-6 col-md-3 col-lg-2">
                <label className="small text-muted fw-bold mb-1 d-block">From</label>
                <input
                  type="date"
                  className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                  style={{ borderRadius: 10, height: 38 }}
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setSearchParams({ page: '1' });
                  }}
                />
              </div>
              <div className="col-12 col-sm-6 col-md-3 col-lg-2">
                <label className="small text-muted fw-bold mb-1 d-block">To</label>
                <input
                  type="date"
                  className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                  style={{ borderRadius: 10, height: 38 }}
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setSearchParams({ page: '1' });
                  }}
                />
              </div>
              <div className="col-12 col-sm-12 col-md-6 col-lg-3">
                <label className="small text-muted fw-bold mb-1 d-block">🔍 Plain Bottle Name</label>
                <Select
                  isClearable={true}
                  isSearchable
                  options={bottleOptions}
                  value={
                    bottleFilter && bottleFilter !== '' 
                      ? bottleOptions.find(opt => opt.value === bottleFilter)
                      : null
                  }
                  onChange={(selected) => {
                    if (selected && selected.value) {
                      setBottleFilter(selected.value);
                    } else {
                      setBottleFilter('');
                    }
                    setSearchParams({ page: '1' });
                  }}
                  classNamePrefix="react-select"
                  placeholder="Select bottle name..."
                  styles={{
                    control: (base) => ({
                      ...base,
                      borderRadius: 10,
                      minHeight: 38,
                      borderColor: 'var(--bs-border-color-translucent)',
                      backgroundColor: 'var(--bs-light)',
                      boxShadow: 'none'
                    })
                  }}
                />
              </div>
              <div className="col-12 col-sm-6 col-md-6 col-lg-3">
                <label className="small text-muted fw-bold mb-1 d-block">Search G. Pass No</label>
                <div className="search-input-wrapper position-relative">
                  <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
                  <input
                    type="text"
                    className="form-control form-control-sm border-light-subtle bg-light ps-5 shadow-none w-100"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ borderRadius: 10, height: 38 }}
                  />
                </div>
              </div>
              <div className="col-12 col-sm-6 col-md-6 col-lg-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn btn-sm btn-light border-light-subtle w-100"
                  style={{ borderRadius: 10, fontWeight: 600, height: 38 }}
                >
                  ✕ Reset All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="dash-card border-0 shadow-sm">
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white companies-dash-toolbar">
          <div className="d-flex gap-2 flex-wrap align-items-center">
            {!companyId && (
              <div className="search-input-wrapper position-relative companies-search-wrap">
                <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
                <input
                  type="text"
                  className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
                  placeholder="Search G. Pass No or Bottle..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ borderRadius: 10, fontSize: 13, width: 250 }}
                />
              </div>
            )}
            {/* Page size selector */}
            <div className="d-flex align-items-center gap-2">
              <label className="small text-muted fw-bold mb-0">Show</label>
              <select
                className="form-select form-select-sm"
                style={{ width: 80 }}
                value={itemsPerPage}
                onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="small text-muted fw-bold">entries</span>
            </div>
          </div>
        </div>
        
        <div className="dash-card-body p-0">
          {loading ? (
            <div className="p-5 text-center text-muted">
              <div className="spinner-border text-primary mb-3" />
              <div>Loading Dispatch Register...</div>
            </div>
          ) : dispatches.length === 0 ? (
            <div className="p-5 text-center text-muted">
              <i className="bi bi-inbox fs-1 d-block mb-3" />
              <div>{showingText}</div>
              <div>No dispatch records found.</div>
            </div>
          ) : (
            <>
              <div className="small text-muted p-3 bg-light border-bottom">{showingText}</div>
              <div className="table-responsive companies-list-desktop dispatch-list-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="py-3 text-uppercase small fw-bold text-muted ps-4 text-start" style={{ width: 50 }}>Sr</th>
                      <th className="py-3 text-uppercase small fw-bold text-muted" style={{ width: 100 }}>Dispatch Date</th>
                      <th className="py-3 text-uppercase small fw-bold text-muted" style={{ width: 120 }}>G. Pass No.</th>
                      {!companyId && <th className="py-3 text-uppercase small fw-bold text-muted" style={{ width: 150 }}>Company</th>}
                      <th className="py-3 text-uppercase small fw-bold text-muted">Plain Bottle</th>
                      <th className="py-3 text-uppercase small fw-bold text-muted">Variant</th>
                      <th className="py-3 text-uppercase small fw-bold text-muted">Coating Shade</th>
                      <th className="py-3 text-uppercase small fw-bold text-muted">Text Color</th>
                      <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 70 }}>Box</th>
                      <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 70 }}>Qty</th>
                      <th className="py-3 text-uppercase small fw-bold text-muted text-end" style={{ width: 100 }}>Total</th>
                      <th className="py-3 text-uppercase small fw-bold text-muted pe-4 text-end" style={{ width: 100 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatches.map((dispatchItem, idx) => {
                      const startingIndex = (currentPage - 1) * itemsPerPage;
                      const displayItems = bottleFilter
                        ? (dispatchItem.items || []).filter(item =>
                            bottleFilter === 'Unmapped'
                              ? (!item.bottleId || item.isUnmapped || !item.plainBottleName)
                              : item.plainBottleName === bottleFilter
                          )
                        : (dispatchItem.items || []);

                      return displayItems && displayItems.length > 0 ? displayItems.map((item, itemIdx) => (
                        <tr key={`${dispatchItem._id}-${itemIdx}`} className="align-middle border-bottom transition-all hover-bg-light">
                          {itemIdx === 0 && (
                            <>
                              <td className="ps-4 fw-500 text-muted small" rowSpan={displayItems.length}>{startingIndex + idx + 1}</td>
                              <td className="fw-500 small" rowSpan={displayItems.length}>
                                {new Date(dispatchItem.dispatchDate).toLocaleDateString('en-GB')}
                              </td>
                              <td className="fw-bold text-primary small" rowSpan={displayItems.length}>{dispatchItem.gatePassNo}</td>
                              {!companyId && (
                                <td className="fw-500 small" rowSpan={displayItems.length}>
                                  {dispatchItem.companyId?.name || '-'}
                                </td>
                              )}
                            </>
                          )}
                          <td className="small fw-500">{item.plainBottleName || (item.productName ? `${item.productName} (Unmapped)` : 'Unmapped')}</td>
                          <td className="small">{item.variantName || item.printing || item.productName || '-'}</td>
                          <td className="small">{item.coatingShade || item.coatingShadeHint || '-'}</td>
                          <td className="small">{item.detectedTextColor || '-'}</td>
                          <td className="text-center fw-500 small">{item.box || 0}</td>
                          <td className="text-center fw-500 small">{item.qty || 0}</td>
                          <td className="text-end fw-bold text-accent small">{item.totalQty || (Number(item.box || 0) * Number(item.qty || 0))}</td>
                          {itemIdx === 0 && (
                            <td className="pe-4 text-end" rowSpan={displayItems.length}>
                              <div className="d-flex justify-content-end gap-2">
                                <Can I="read" a="dispatch">
                                  <Link
                                    to={`/dispatch/view/${dispatchItem._id}`}
                                    className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2"
                                    title="View"
                                  >
                                    <i className="bi bi-eye fs-6"></i>
                                  </Link>
                                </Can>
                                <Can I="edit" a="dispatch">
                                  <Link
                                    to={`/dispatch/edit/${dispatchItem._id}`}
                                    className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2"
                                    title="Edit"
                                  >
                                    <i className="bi bi-pencil-square fs-6"></i>
                                  </Link>
                                </Can>
                                <Can I="delete" a="dispatch">
                                  <button
                                    onClick={() => handleDelete(dispatchItem._id, dispatchItem.gatePassNo)}
                                    className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                                    title="Delete"
                                  >
                                    <i className="bi bi-trash fs-6"></i>
                                  </button>
                                </Can>
                              </div>
                            </td>
                          )}
                        </tr>
                      )) : (
                        <tr key={dispatchItem._id} className="align-middle border-bottom transition-all hover-bg-light">
                          <td className="ps-4 fw-500 text-muted small">{startingIndex + idx + 1}</td>
                          <td className="fw-500 small">{new Date(dispatchItem.dispatchDate).toLocaleDateString('en-GB')}</td>
                          <td className="fw-bold text-primary small">{dispatchItem.gatePassNo}</td>
                          {!companyId && <td className="fw-500 small">{dispatchItem.companyId?.name || '-'}</td>}
                          <td colSpan={7} className="text-center text-muted small py-3">No items</td>
                          <td className="pe-4 text-end">
                            <div className="d-flex justify-content-end gap-2">
                              <Can I="read" a="dispatch">
                                <Link
                                  to={`/dispatch/view/${dispatchItem._id}`}
                                  className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2"
                                  title="View"
                                >
                                  <i className="bi bi-eye fs-6"></i>
                                </Link>
                              </Can>
                              <Can I="edit" a="dispatch">
                                <Link
                                  to={`/dispatch/edit/${dispatchItem._id}`}
                                  className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2"
                                  title="Edit"
                                >
                                  <i className="bi bi-pencil-square fs-6"></i>
                                </Link>
                              </Can>
                              <Can I="delete" a="dispatch">
                                <button
                                  onClick={() => handleDelete(dispatchItem._id, dispatchItem.gatePassNo)}
                                  className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                                  title="Delete"
                                >
                                  <i className="bi bi-trash fs-6"></i>
                                </button>
                              </Can>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination controls - matching Incoming style */}
              {totalPages > 1 && (
                <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer">
                  <div className="text-muted small fw-500">
                    Showing <b>{startIndex}</b> to <b>{endIndex}</b> of <b>{total}</b> entries
                  </div>

                  <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
                    <button
                      className="btn btn-sm btn-light"
                      disabled={currentPage === 1}
                      onClick={() => { if (currentPage > 1) handlePageChange(currentPage - 1); }}
                    >
                      Previous
                    </button>

                    {(() => {
                      const pages = [];
                      const delta = 2;
                      const left = currentPage - delta;
                      const right = currentPage + delta;
                      pages.push(1);
                      if (left > 2) pages.push('...');
                      for (let i = Math.max(2, left); i <= Math.min(totalPages - 1, right); i++) pages.push(i);
                      if (right < totalPages - 1) pages.push('...');
                      if (totalPages > 1) pages.push(totalPages);
                      return pages.map((p, idx) =>
                        p === '...'
                          ? <span key={`e-${idx}`} className="px-1 text-muted" style={{ fontSize: 13 }}>…</span>
                          : <button key={p} className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-light'}`} onClick={() => handlePageChange(p)}>{p}</button>
                      );
                    })()}

                    <button
                      className="btn btn-sm btn-light"
                      disabled={currentPage === totalPages || totalPages === 0}
                      onClick={() => { if (currentPage < totalPages) handlePageChange(currentPage + 1); }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <DispatchImportModal
        show={showImportModal}
        companyId={companyId}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          dispatch(fetchDispatch({
            page: 1,
            limit: itemsPerPage,
            search: debouncedSearch,
            dateFrom,
            dateTo,
            companyId,
            plainBottleName: bottleFilter,
            pagination: "true"
          }));
          setSearchParams({ page: '1' });
        }}
      />
    </div>
  );
}
