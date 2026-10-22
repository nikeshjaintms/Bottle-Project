import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { fetchDispatch, deleteDispatch } from '../../redux/slices/dispatchSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { Can } from '../../context/AbilityContext';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import DispatchImportModal from './DispatchImportModal';

export default function DispatchList() {
  const dispatch = useDispatch();
  const { data: dispatches, loading, totalPages, total, page } = useSelector(state => state.dispatch);
  const { companies } = useSelector(state => state.companies);

  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showImportModal, setShowImportModal] = useState(false);
  
  const { companyId } = useParams();
  const navigate = useNavigate();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get("page") || '';
  const currentPage = Number(urlPage) || page || 1;

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: "false" }));
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchDispatch({ 
      page: currentPage, 
      limit: itemsPerPage, 
      search: searchTerm, 
      dateFrom,
      dateTo,
      companyId,
      pagination: companyId ? "false" : "true"
    }));
  }, [dispatch, currentPage, itemsPerPage, searchTerm, dateFrom, dateTo, companyId]);
  
  const handlePageChange = (newPage) => {
    setSearchParams({ page: newPage });
  };

  const handleReset = () => {
    setSearchTerm('');
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
              dateFrom,
              dateTo,
              companyId
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

      const response = await api.get('/dispatch', {
        params: {
          search: searchTerm,
          dateFrom,
          dateTo,
          companyId,
          pagination: 'false'
        }
      });

      const allData = response.data.data || [];

      if (allData.length === 0) {
        Swal.fire('No Data', 'There is no data to export for the selected filters.', 'info');
        return;
      }

      let exportedData = [];
      
      allData.forEach((dispatch, dispatchIdx) => {
        if (dispatch.items && dispatch.items.length > 0) {
          dispatch.items.forEach((item, itemIdx) => {
            exportedData.push({
              'Sr No': `${dispatchIdx + 1}.${itemIdx + 1}`,
              'Dispatch Date': new Date(dispatch.dispatchDate).toLocaleDateString('en-GB'),
              'G. Pass No': dispatch.gatePassNo || 'N/A',
              'Company': dispatch.companyId?.name || 'N/A',
              'Bottle Name': item.bottleId?.bottleName || item.bottleId || 'N/A',
              'Variant': item.variantId?.variantName || 'N/A',
              'Coating Shade': item.coatingShade || 'N/A',
              'Printing Type': item.printingTypeId?.printingType || 'N/A',
              'Box': item.box || 0,
              'Qty/Box': item.qty || 0,
              'Total Qty': item.totalQty || 0,
              'Remarks': dispatch.remarks || '-'
            });
          });
        } else {
          exportedData.push({
            'Sr No': dispatchIdx + 1,
            'Dispatch Date': new Date(dispatch.dispatchDate).toLocaleDateString('en-GB'),
            'G. Pass No': dispatch.gatePassNo || 'N/A',
            'Company': dispatch.companyId?.name || 'N/A',
            'Bottle Name': 'N/A',
            'Variant': 'N/A',
            'Coating Shade': 'N/A',
            'Printing Type': 'N/A',
            'Box': 0,
            'Qty/Box': 0,
            'Total Qty': 0,
            'Remarks': dispatch.remarks || '-'
          });
        }
      });

      const worksheet = XLSX.utils.json_to_sheet(exportedData);
      worksheet['!cols'] = [
        { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 20 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 20 }
      ];
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Dispatch`);

      let filename = `Dispatch`;
      if (dateFrom) filename += `_from_${dateFrom}`;
      filename += ".xlsx";

      XLSX.writeFile(workbook, filename);
      Swal.close();
    } catch (err) {
      console.error(err);
      Swal.fire('Export Failed', 'An error occurred while generating the export.', 'error');
    }
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate('/dispatch')} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
            <i className="bi bi-arrow-left fs-5 text-secondary" />
          </button>
          <div>
            <h1 className="page-title mb-0">Dispatch Register</h1>
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
                placeholder="Search G. Pass No or Bottle..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setSearchParams({ page: 1 }); }}
                style={{ borderRadius: 10, fontSize: 13, width: 250 }}
              />
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
              No dispatch records found.
            </div>
          ) : (
            <div className="table-responsive companies-list-desktop">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="py-3 text-uppercase small fw-bold text-muted ps-4 text-start" style={{ width: 50 }}>Sr</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted" style={{ width: 100 }}>Dispatch Date</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted" style={{ width: 120 }}>G. Pass No.</th>
                    {!companyId && <th className="py-3 text-uppercase small fw-bold text-muted" style={{ width: 150 }}>Company</th>}
                    <th className="py-3 text-uppercase small fw-bold text-muted">Bottle Name</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Variant</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Coating Shade</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted">Printing Type</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 70 }}>Box</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 70 }}>Qty</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-end" style={{ width: 100 }}>Total</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted pe-4 text-end" style={{ width: 100 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map((dispatchItem, idx) => {
                    const startingIndex = (currentPage - 1) * itemsPerPage;
                    return dispatchItem.items && dispatchItem.items.length > 0 ? dispatchItem.items.map((item, itemIdx) => (
                      <tr key={`${dispatchItem._id}-${itemIdx}`} className="align-middle border-bottom transition-all hover-bg-light">
                        {itemIdx === 0 && (
                          <>
                            <td className="ps-4 fw-500 text-muted small" rowSpan={dispatchItem.items.length}>{startingIndex + idx + 1}</td>
                            <td className="fw-500 small" rowSpan={dispatchItem.items.length}>
                              {new Date(dispatchItem.dispatchDate).toLocaleDateString('en-GB')}
                            </td>
                            <td className="fw-bold text-primary small" rowSpan={dispatchItem.items.length}>{dispatchItem.gatePassNo}</td>
                            {!companyId && (
                              <td className="fw-500 small" rowSpan={dispatchItem.items.length}>
                                {dispatchItem.companyId?.name || '-'}
                              </td>
                            )}
                          </>
                        )}
                        <td className="small fw-500">{item.bottleId?.bottleName || '-'}</td>
                        <td className="small">{item.variantId?.variantName || '-'}</td>
                        <td className="small">{item.coatingShade || '-'}</td>
                        <td className="small">{item.printingTypeId?.printingType || '-'}</td>
                        <td className="text-center fw-500 small">{item.box}</td>
                        <td className="text-center fw-500 small">{item.qty}</td>
                        <td className="text-end fw-bold text-accent small">{item.totalQty}</td>
                        {itemIdx === 0 && (
                          <td className="pe-4 text-end" rowSpan={dispatchItem.items.length}>
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
          )}
        </div>
        
        {totalPages > 1 && (
          <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-pagination">
            <div className="text-muted small fw-500">
              Showing {total === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, total)} of {total} entries
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

      <DispatchImportModal
        show={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          dispatch(fetchDispatch({
            page: 1,
            limit: itemsPerPage,
            search: searchTerm,
            dateFrom,
            dateTo,
            companyId,
            pagination: companyId ? "false" : "true"
          }));
          setSearchParams({ page: 1 });
        }}
      />
    </div>
  );
}
