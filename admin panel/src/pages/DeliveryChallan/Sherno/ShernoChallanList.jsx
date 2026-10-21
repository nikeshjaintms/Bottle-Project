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

export default function ShernoChallanList() {
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
        challanType: 'sherno',
      })
    );
  }, [dispatch, currentPage, itemsPerPage, search]);

  const handleDelete = (id, challanNo) => {
    Swal.fire({
      title: 'Delete Delivery Challan?',
      text: `Are you sure you want to delete Sherno Challan No "${challanNo}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete!',
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteDeliveryChallan(id)).then((res) => {
          if (!res.error) {
            Swal.fire('Deleted!', 'Sherno delivery challan removed.', 'success');
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
      a.download = `Delivery_Challan_Sherno_${challanNo || id}.pdf`;
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
          <h1 className="page-title">Sherno Delivery Challan</h1>
          <p className="page-subtitle">Manage, create and print M/S Shreno Ltd delivery challans</p>
        </div>
        <Link to="/delivery-challan/sherno/add" className="btn-accent companies-header-action">
          <i className="bi bi-plus-circle-fill me-2" /> Create Challan
        </Link>
      </div>

      {/* Main Card */}
      <div className="dash-card">
        {/* Controls */}
        <div className="dash-card-header d-flex align-items-center justify-content-between gap-3 flex-wrap companies-controls">
          <div className="search-input-wrap">
            <i className="bi bi-search search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search by Gate Pass No, P.O. No, Vehicle..."
              value={search}
              onChange={(e) => dispatch(setSearchTerm(e.target.value))}
            />
          </div>

          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted">Per page:</span>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Table Body */}
        <div className="dash-card-body p-0">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: 60 }} className="text-center">#</th>
                  <th style={{ width: 140 }}>Gate Pass No</th>
                  <th style={{ width: 140 }}>Date & Time</th>
                  <th>P.O. Details</th>
                  <th style={{ width: 150 }}>Vehicle No</th>
                  <th style={{ width: 110 }} className="text-center">Total Boxes</th>
                  <th style={{ width: 130 }} className="text-center">Total Qty</th>
                  <th style={{ width: 140 }} className="text-end pe-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-5">
                      <div className="spinner-border text-primary spinner-border-sm me-2" />
                      Loading Sherno delivery challans...
                    </td>
                  </tr>
                ) : challans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-5 text-muted">
                      <i className="bi bi-inbox fs-2 d-block mb-2 text-secondary" />
                      No Sherno delivery challans found.
                      <div className="mt-2">
                        <Link to="/delivery-challan/sherno/add" className="btn btn-sm btn-outline-primary">
                          <i className="bi bi-plus-lg me-1" /> Create First Challan
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  challans.map((c, index) => {
                    const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                    return (
                      <tr key={c._id}>
                        <td className="text-center text-muted">{rowNumber}</td>
                        <td>
                          <Link
                            to={`/delivery-challan/sherno/view/${c._id}`}
                            className="fw-bold text-primary text-decoration-none"
                          >
                            #{c.challanNo}
                          </Link>
                        </td>
                        <td>
                          <div className="fw-semibold">{formatDate(c.challanDate)}</div>
                          {c.challanTime && (
                            <small className="text-muted d-block">{c.challanTime}</small>
                          )}
                        </td>
                        <td>
                          <div className="fw-semibold">
                            {c.poNo || c.buyersOrderNo ? `PO: ${c.poNo || c.buyersOrderNo}` : '-'}
                          </div>
                          {c.poDate && (
                            <small className="text-muted d-block">
                              Date: {formatDate(c.poDate)}
                            </small>
                          )}
                        </td>
                        <td>
                          <span className="font-monospace fw-semibold text-uppercase">
                            {c.vehicleNo || '-'}
                          </span>
                        </td>
                        <td className="text-center font-monospace fw-bold text-primary">
                          {c.totalBoxes || 0}
                        </td>
                        <td className="text-center font-monospace fw-bold text-success">
                          {(c.totalQuantity || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="text-end pe-4">
                          <div className="d-flex align-items-center justify-content-end gap-1">
                            <Link
                              to={`/delivery-challan/sherno/view/${c._id}`}
                              className="btn btn-xs btn-outline-primary p-1 rounded-2"
                              title="View & Print Challan"
                            >
                              <i className="bi bi-eye" />
                            </Link>
                            <button
                              type="button"
                              className="btn btn-xs btn-outline-success p-1 rounded-2"
                              title="Download PDF"
                              disabled={downloadingId === c._id}
                              onClick={() => handleDownloadPdf(c._id, c.challanNo)}
                            >
                              {downloadingId === c._id ? (
                                <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }} />
                              ) : (
                                <i className="bi bi-file-earmark-pdf" />
                              )}
                            </button>
                            <Link
                              to={`/delivery-challan/sherno/edit/${c._id}`}
                              className="btn btn-xs btn-outline-secondary p-1 rounded-2"
                              title="Edit Challan"
                            >
                              <i className="bi bi-pencil" />
                            </Link>
                            <button
                              type="button"
                              className="btn btn-xs btn-outline-danger p-1 rounded-2"
                              title="Delete Challan"
                              onClick={() => handleDelete(c._id, c.challanNo)}
                            >
                              <i className="bi bi-trash" />
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
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top">
            <span className="small text-muted">
              Showing page {currentPage} of {totalPages} ({total} items total)
            </span>
            <div className="d-flex gap-1">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={currentPage <= 1}
                onClick={() => setSearchParams({ page: String(currentPage - 1) })}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={currentPage >= totalPages}
                onClick={() => setSearchParams({ page: String(currentPage + 1) })}
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
