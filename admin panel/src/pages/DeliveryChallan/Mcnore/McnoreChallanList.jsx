import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDeliveryChallans,
  deleteDeliveryChallan,
  setSearchTerm,
} from '../../../redux/slices/deliveryChallanSlice';
import API from '../../../services/api';
import Swal from 'sweetalert2';

export default function McnoreChallanList() {
  const dispatch = useDispatch();
  const { challans = [], loading, page, totalPages, total, searchTerm } = useSelector(
    (state) => state.deliveryChallans
  );

  const search = searchTerm || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get('page') || '';
  const currentPage = Number(urlPage) || page || 1;
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    dispatch(
      fetchDeliveryChallans({
        page: currentPage,
        limit: itemsPerPage,
        search,
        challanType: 'mcnore',
      })
    );
  }, [dispatch, currentPage, itemsPerPage, search]);

  const handleDelete = (id, challanNo) => {
    Swal.fire({
      title: 'Delete Delivery Challan?',
      text: `Are you sure you want to delete Mcnore Challan No "${challanNo}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete!',
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteDeliveryChallan(id)).then((res) => {
          if (!res.error) {
            Swal.fire('Deleted!', 'Mcnore delivery challan removed.', 'success');
          } else {
            Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
          }
        });
      }
    });
  };

  const handleDownloadPdf = async (id, challanNo) => {
    try {
      setDownloadingId(id);
      const response = await API.get(`/delivery-challan/${id}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Delivery_Challan_Mcnore_${challanNo || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('PDF download error:', err);
      Swal.fire('Error', 'Failed to generate PDF. You can try browser print.', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title">Mcnore Delivery Challan</h1>
          <p className="page-subtitle">Manage, create and print Mcnroe Consumer Products delivery challans (With PO / Without PO)</p>
        </div>
        <Link to="/delivery-challan/mcnore/add" className="btn-accent companies-header-action">
          <i className="bi bi-plus-circle-fill me-2" /> Create Challan
        </Link>
      </div>

      {/* Main Card */}
      <div className="dash-card">
        {/* Toolbar */}
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white companies-dash-toolbar">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>Show</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
              value={itemsPerPage}
              onChange={(e) => {
                setSearchParams({ page: 1 });
                setItemsPerPage(Number(e.target.value));
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span>entries</span>
          </div>

          <div className="search-input-wrapper position-relative companies-search-wrap">
            <i
              className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3"
              style={{ pointerEvents: 'none' }}
            />
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
              placeholder="Search challan no, vehicle, PO..."
              value={search}
              onChange={(e) => {
                dispatch(setSearchTerm(e.target.value));
                setSearchParams({ page: 1 });
              }}
              style={{ width: 280, borderRadius: 8 }}
            />
          </div>
        </div>

        {/* Table Body */}
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 companies-table">
            <thead className="table-light text-muted small text-uppercase">
              <tr>
                <th className="ps-3 py-3">DC No.</th>
                <th>Mode</th>
                <th>Dis Date &amp; Time</th>
                <th>PO / Invoice Ref</th>
                <th>Vehicle No</th>
                <th className="text-center">Total Boxes</th>
                <th className="text-end">Total Qty</th>
                <th className="text-end pe-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-5 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status" />
                    Loading Mcnore delivery challans...
                  </td>
                </tr>
              ) : challans.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-5 text-muted">
                    <i className="bi bi-file-earmark-text fs-1 d-block mb-2 text-secondary opacity-50" />
                    No Mcnore delivery challans found.
                    <div className="mt-2">
                      <Link to="/delivery-challan/mcnore/add" className="btn btn-sm btn-outline-primary">
                        <i className="bi bi-plus-lg me-1" /> Create Your First Challan
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                challans.map((c) => {
                  const isWithPo = c.poMode === 'with_po';
                  return (
                    <tr key={c._id} className="cursor-pointer">
                      <td className="ps-3 py-3">
                        <Link
                          to={`/delivery-challan/mcnore/view/${c._id}`}
                          className="fw-bold text-decoration-none text-dark hover-primary"
                        >
                          <i className="bi bi-file-earmark-text text-primary me-2" />
                          #{c.challanNo}
                        </Link>
                      </td>
                      <td>
                        {isWithPo ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">
                            <i className="bi bi-patch-check-fill me-1" /> With PO
                          </span>
                        ) : (
                          <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1">
                            <i className="bi bi-file-text me-1" /> Without PO
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="fw-500 text-dark">{formatDate(c.challanDate)}</div>
                        <div className="small text-muted">{c.challanTime || '-'}</div>
                      </td>
                      <td>
                        {isWithPo ? (
                          <div>
                            <span className="fw-bold text-primary">PO: </span>
                            <span>{c.poNo || '-'}</span>
                            {c.poDate && (
                              <span className="text-muted small ms-1">({formatDate(c.poDate)})</span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="text-muted">Inv: </span>
                            <span>{c.taxInvoiceNo || '-'}</span>
                            {c.taxInvoiceDate && (
                              <span className="text-muted small ms-1">({formatDate(c.taxInvoiceDate)})</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border">
                          {c.vehicleNo || '-'}
                        </span>
                      </td>
                      <td className="text-center fw-bold">{c.totalBoxes || 0}</td>
                      <td className="text-end fw-bold text-dark">
                        {Number(c.totalQuantity || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="text-end pe-3">
                        <div className="d-flex align-items-center justify-content-end gap-1">
                          <Link
                            to={`/delivery-challan/mcnore/view/${c._id}`}
                            className="btn btn-sm btn-light border text-primary action-btn-hover"
                            title="View & Print Challan"
                          >
                            <i className="bi bi-eye-fill" />
                          </Link>
                          <button
                            type="button"
                            className="btn btn-sm btn-light border text-danger action-btn-hover"
                            title="Download PDF"
                            onClick={() => handleDownloadPdf(c._id, c.challanNo)}
                            disabled={downloadingId === c._id}
                          >
                            <i className={`bi ${downloadingId === c._id ? 'bi-hourglass-split' : 'bi-file-earmark-pdf-fill'}`} />
                          </button>
                          <Link
                            to={`/delivery-challan/mcnore/edit/${c._id}`}
                            className="btn btn-sm btn-light border text-secondary action-btn-hover"
                            title="Edit Challan"
                          >
                            <i className="bi bi-pencil-fill" />
                          </Link>
                          <button
                            type="button"
                            className="btn btn-sm btn-light border text-danger action-btn-hover"
                            title="Delete Challan"
                            onClick={() => handleDelete(c._id, c.challanNo)}
                          >
                            <i className="bi bi-trash-fill" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white flex-wrap gap-2">
          <div className="text-muted small">
            Showing {challans.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to{' '}
            {Math.min(currentPage * itemsPerPage, total)} of {total} entries
          </div>

          {totalPages > 1 && (
            <div className="d-flex align-items-center gap-1">
              <button
                className="btn btn-sm btn-light border"
                disabled={currentPage <= 1}
                onClick={() => setSearchParams({ page: currentPage - 1 })}
              >
                Previous
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  className={`btn btn-sm ${currentPage === i + 1 ? 'btn-primary' : 'btn-light border'}`}
                  onClick={() => setSearchParams({ page: i + 1 })}
                >
                  {i + 1}
                </button>
              ))}
              <button
                className="btn btn-sm btn-light border"
                disabled={currentPage >= totalPages}
                onClick={() => setSearchParams({ page: currentPage + 1 })}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
