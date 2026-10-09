import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { fetchDispatch, deleteDispatch } from '../../redux/slices/dispatchSlice';
import Swal from 'sweetalert2';

export default function DispatchList() {
  const dispatch = useDispatch();
  const { data: dispatches, loading, totalPages, total, page } = useSelector(state => state.dispatch);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchPrinting, setSearchPrinting] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const navigate = useNavigate();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get("page") || '';
  const currentPage = Number(urlPage) || page || 1;

  useEffect(() => {
    dispatch(fetchDispatch({ 
      page: currentPage, 
      limit: itemsPerPage, 
      search: searchTerm, 
      searchPrinting,
      dateFrom,
      dateTo
    }));
  }, [dispatch, currentPage, itemsPerPage, searchTerm, searchPrinting, dateFrom, dateTo]);
  
  const handlePageChange = (newPage) => {
    setSearchParams({ page: newPage });
  };

  const handleReset = () => {
    setSearchTerm('');
    setSearchPrinting('');
    setDateFrom('');
    setDateTo('');
    setSearchParams({ page: 1 });
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
              page: currentPage, 
              limit: itemsPerPage, 
              search: searchTerm, 
              searchPrinting,
              dateFrom,
              dateTo
            }));
          } else {
            Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
          }
        });
      }
    });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost border-0" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
          </button>
          <div>
            <h1 className="page-title mb-0">Dispatch</h1>
            <p className="page-subtitle mb-0">Record dispatch/gate-pass transactions</p>
          </div>
        </div>
        <Link to="/dispatch/add" className="btn-accent companies-header-action">
          <i className="bi bi-plus-lg me-2" /> New Dispatch
        </Link>
      </div>

      <div className="dash-card border-0 shadow-sm">
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white companies-dash-toolbar flex-wrap gap-3">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>Show</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setSearchParams({ page: 1 });
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span>entries</span>
          </div>

          <div className="d-flex flex-wrap gap-3">
            <div className="search-input-wrapper position-relative companies-search-wrap">
              <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
              <input
                type="text"
                className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
                placeholder="Search G. Pass No or Product..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setSearchParams({ page: 1 }); }}
                style={{ borderRadius: 10, fontSize: 13, width: 250 }}
              />
            </div>
            
            <div className="search-input-wrapper position-relative companies-search-wrap">
              <i className="bi bi-funnel text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
              <input
                type="text"
                className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
                placeholder="Search Printing..."
                value={searchPrinting}
                onChange={e => { setSearchPrinting(e.target.value); setSearchParams({ page: 1 }); }}
                style={{ borderRadius: 10, fontSize: 13, width: 200 }}
              />
            </div>

            <div className="d-flex align-items-center gap-2">
              <input
                type="date"
                className="form-control form-control-sm border-light-subtle bg-light shadow-none py-2"
                title="Date From"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setSearchParams({ page: 1 }); }}
                style={{ borderRadius: 10, fontSize: 13 }}
              />
              <span className="text-muted small">to</span>
              <input
                type="date"
                className="form-control form-control-sm border-light-subtle bg-light shadow-none py-2"
                title="Date To"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setSearchParams({ page: 1 }); }}
                style={{ borderRadius: 10, fontSize: 13 }}
              />
            </div>

            <button className="btn btn-sm btn-outline-secondary px-3 py-2" onClick={handleReset} style={{ borderRadius: 10 }}>
              <i className="bi bi-arrow-clockwise me-1" /> Reset
            </button>
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
              No dispatch records found.
            </div>
          ) : (
            <div className="table-responsive companies-list-desktop">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="py-3 text-uppercase small fw-bold text-muted ps-4 text-start" style={{ width: 80 }}>Sr No</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Dispatch Date</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">G. Pass No.</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Product Name</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Printing</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Foil</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Organic</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-end">Box</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-end">Qty</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-end">Total</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Remarks</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted pe-4 text-end" style={{ width: 100 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map((dispatchItem, idx) => {
                    const startingIndex = (currentPage - 1) * itemsPerPage;
                    return dispatchItem.items.map((item, itemIdx) => (
                      <tr key={`${dispatchItem._id}-${itemIdx}`} className="align-middle">
                        {itemIdx === 0 && (
                          <>
                            <td className="ps-4 fw-500 text-muted" rowSpan={dispatchItem.items.length}>{startingIndex + idx + 1}</td>
                            <td className="fw-500" rowSpan={dispatchItem.items.length}>
                              {new Date(dispatchItem.dispatchDate).toLocaleDateString('en-GB')}
                            </td>
                            <td className="fw-bold text-dark" rowSpan={dispatchItem.items.length}>{dispatchItem.gatePassNo}</td>
                          </>
                        )}
                        <td>{item.productName}</td>
                        <td>{item.printing || '-'}</td>
                        <td>{item.foil || '-'}</td>
                        <td>{item.organic || '-'}</td>
                        <td className="text-end fw-500">
                          {item.additionalBox > 0 ? `${item.box}(+${item.additionalBox})` : item.box}
                        </td>
                        <td className="text-end fw-500">{item.qty}</td>
                        <td className="text-end fw-bold text-primary">{item.total}</td>
                        <td>{item.remarks || '-'}</td>
                        {itemIdx === 0 && (
                          <td className="pe-4 text-end" rowSpan={dispatchItem.items.length}>
                            <div className="action-buttons justify-content-end">
                              <Link
                                to={`/dispatch/view/${dispatchItem._id}`}
                                className="action-btn view-btn"
                                title="View"
                              >
                                <i className="bi bi-eye" />
                              </Link>
                              <Link
                                to={`/dispatch/edit/${dispatchItem._id}`}
                                className="action-btn edit-btn"
                                title="Edit"
                              >
                                <i className="bi bi-pencil" />
                              </Link>
                              <button
                                onClick={() => handleDelete(dispatchItem._id, dispatchItem.gatePassNo)}
                                className="action-btn delete-btn"
                                title="Delete"
                              >
                                <i className="bi bi-trash3" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {totalPages > 1 && (
          <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-pagination">
            <div className="text-muted small fw-500">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, total)} of {total} entries
            </div>
            <div className="d-flex gap-1">
              <button
                className="btn btn-sm btn-light border-light-subtle shadow-none"
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                style={{ width: 32, height: 32, padding: 0, borderRadius: 8 }}
              >
                <i className="bi bi-chevron-left" />
              </button>
              
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  className={`btn btn-sm ${currentPage === i + 1 ? 'btn-primary' : 'btn-light border-light-subtle'} shadow-none`}
                  onClick={() => handlePageChange(i + 1)}
                  style={{ width: 32, height: 32, padding: 0, borderRadius: 8 }}
                >
                  {i + 1}
                </button>
              ))}
              
              <button
                className="btn btn-sm btn-light border-light-subtle shadow-none"
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                style={{ width: 32, height: 32, padding: 0, borderRadius: 8 }}
              >
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
