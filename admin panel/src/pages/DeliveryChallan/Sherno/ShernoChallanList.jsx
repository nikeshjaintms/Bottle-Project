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
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white companies-dash-toolbar">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>Show</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setSearchParams({ page: '1' });
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>entries</span>
          </div>

          <div className="search-input-wrapper position-relative companies-search-wrap">
            <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
              placeholder="Search by Gate Pass No, P.O. No, Vehicle..."
              value={search}
              onChange={(e) => {
                dispatch(setSearchTerm(e.target.value));
                setSearchParams({ page: '1' });
              }}
              style={{ borderRadius: 10, fontSize: 13 }}
            />
          </div>
        </div>

        {/* Table Body */}
        <div className="table-responsive">
            <table className="data-table mb-0 w-100">
              <thead>
                <tr>
                  <th className="py-3 text-uppercase small fw-bold text-muted ps-5 text-start" style={{ width: 80 }}>Sr No</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 140 }}>Gate Pass No</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 140 }}>Date &amp; Time</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center">P.O. Details</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 150 }}>Vehicle No</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 110 }}>Total Boxes</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 130 }}>Total Qty</th>
                  <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 140 }}>Actions</th>
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
                      <div className="d-flex flex-column align-items-center justify-content-center gap-2">
                        <i className="bi bi-inbox fs-2 text-secondary" />
                        <span>No Sherno delivery challans found.</span>
                        <div className="mt-2" style={{ width: 260 }}>
                          <Link
                            to="/delivery-challan/sherno/add"
                            className="btn btn-accent py-2 w-100 d-flex align-items-center justify-content-center"
                            style={{ borderRadius: 8, whiteSpace: 'nowrap' }}
                          >
                            <i className="bi bi-plus-circle me-2" /> Create First Challan
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  challans.map((c, index) => {
                    const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                    return (
                      <tr key={c._id} className="align-middle border-bottom transition-all hover-bg-light">
                        <td className="py-3 ps-5 text-start text-muted">{rowNumber}</td>
                        <td className="py-3 text-center">
                          <Link
                            to={`/delivery-challan/sherno/view/${c._id}`}
                            className="fw-bold text-primary text-decoration-none"
                          >
                            #{c.challanNo}
                          </Link>
                        </td>
                        <td className="py-3 text-center">
                          <div className="fw-semibold">{formatDate(c.challanDate)}</div>
                          {c.challanTime && (
                            <small className="text-muted d-block">{c.challanTime}</small>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          <div className="fw-semibold">
                            {c.poNo || c.buyersOrderNo ? `PO: ${c.poNo || c.buyersOrderNo}` : '-'}
                          </div>
                          {c.poDate && (
                            <small className="text-muted d-block">
                              Date: {formatDate(c.poDate)}
                            </small>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          <span className="font-monospace fw-semibold text-uppercase">
                            {c.vehicleNo || '-'}
                          </span>
                        </td>
                        <td className="py-3 text-center font-monospace fw-bold text-primary">
                          {c.totalBoxes || 0}
                        </td>
                        <td className="py-3 text-center font-monospace fw-bold text-success">
                          {(c.totalQuantity || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 text-center">
                          <div className="d-flex align-items-center justify-content-center gap-2">
                            <Link
                              to={`/delivery-challan/sherno/view/${c._id}`}
                              className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2"
                              title="View & Print Challan"
                            >
                              <i className="bi bi-eye fs-6" />
                            </Link>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                              title="Download PDF"
                              disabled={downloadingId === c._id}
                              onClick={() => handleDownloadPdf(c._id, c.challanNo)}
                            >
                            <i className={`bi ${downloadingId === c._id ? 'bi-hourglass-split' : 'bi-file-earmark-pdf-fill'} fs-6`} />
                            </button>
                          <Link
                            to={`/delivery-challan/sherno/edit/${c._id}`}
                            className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2"
                            title="Edit Challan"
                          >
                            <i className="bi bi-pencil-square fs-6" />
                          </Link>
                            <button
                              type="button"
                            className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                              title="Delete Challan"
                              onClick={() => handleDelete(c._id, c.challanNo)}
                            >
                              <i className="bi bi-trash fs-6" />
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
        <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer">
          <div className="text-muted small fw-500">
            Showing <b>{total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</b> to{' '}
            <b>{Math.min(currentPage * itemsPerPage, total)}</b> of <b>{total}</b> entries
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
            <button
              className="btn btn-sm btn-light"
              disabled={currentPage <= 1}
              onClick={() => {
                if (currentPage > 1) setSearchParams({ page: String(currentPage - 1) });
              }}
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
              for (let i = Math.max(2, left); i <= Math.min(totalPages - 1, right); i++) {
                pages.push(i);
              }
              if (right < totalPages - 1) pages.push('...');
              if (totalPages > 1) pages.push(totalPages);
              return pages.map((p, idx) =>
                p === '...' ? (
                  <span key={`e-${idx}`} className="px-1 text-muted" style={{ fontSize: 13 }}>
                    ΓÇª
                  </span>
                ) : (
                  <button
                    key={p}
                    className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-light'}`}
                    onClick={() => setSearchParams({ page: String(p) })}
                  >
                    {p}
                  </button>
                )
              );
            })()}

            <button
              className="btn btn-sm btn-light"
              disabled={currentPage >= totalPages || totalPages === 0}
              onClick={() => {
                if (currentPage < totalPages) setSearchParams({ page: String(currentPage + 1) });
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
