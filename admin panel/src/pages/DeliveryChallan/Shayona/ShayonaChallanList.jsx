import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDeliveryChallans,
  deleteDeliveryChallan,
  setSearchTerm,
} from '../../../redux/slices/deliveryChallanSlice';
import Swal from 'sweetalert2';

export default function ShayonaChallanList() {
  const dispatch = useDispatch();
  const { challans = [], loading, page, totalPages, total, searchTerm } = useSelector(
    (state) => state.deliveryChallans
  );

  const search = searchTerm || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get('page') || '';
  const currentPage = Number(urlPage) || page || 1;
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    dispatch(
      fetchDeliveryChallans({
        page: currentPage,
        limit: itemsPerPage,
        search,
        challanType: 'shayoona',
      })
    );
  }, [dispatch, currentPage, itemsPerPage, search]);

  const handleDelete = (id, challanNo) => {
    Swal.fire({
      title: 'Delete Delivery Challan?',
      text: `Are you sure you want to delete Challan No "${challanNo}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete!',
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteDeliveryChallan(id)).then((res) => {
          if (!res.error) {
            Swal.fire('Deleted!', 'Delivery challan removed.', 'success');
          } else {
            Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
          }
        });
      }
    });
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title">Shayona Delivery Challan</h1>
          <p className="page-subtitle">Manage, create and print Shayona Glass Decor delivery challans</p>
        </div>
        <Link to="/delivery-challan/shayoona/add" className="btn-accent companies-header-action">
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
              placeholder="Search challan no, company, vehicle..."
              value={search}
              onChange={(e) => {
                const val = e.target.value;
                setSearchParams({ page: 1 });
                dispatch(setSearchTerm(val));
              }}
              style={{ borderRadius: 10, fontSize: 13 }}
            />
          </div>
        </div>

        {/* Mobile View */}
        <div className="d-md-none p-3">
          {challans.map((c, index) => (
            <div key={c._id} className="card border rounded-3 p-3 mb-3 shadow-sm">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span className="text-muted small fw-bold me-2">
                    Sr No: {String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}
                  </span>
                  <span className="badge bg-primary me-2">#{c.challanNo}</span>
                  <span className="fw-bold">{c.companyName || c.companyId?.name || c.billedTo?.name || '-'}</span>
                </div>
                <span className="text-muted small">
                  {c.challanDate ? new Date(c.challanDate).toLocaleDateString() : ''}
                </span>
              </div>

              <div className="small text-muted mb-2">
                <div>
                  <strong>Vehicle / Transport:</strong> {c.vehicleNo || c.transporter || c.dispatchThrough || 'Not specified'}
                </div>
                {c.lrNo && <div><strong>LR:</strong> {c.lrNo}</div>}
                <div>
                  <strong>Billed To:</strong> {c.billedTo?.name || c.companyName} ({c.billedTo?.city || ''})
                </div>
                <div>
                  <strong>Boxes:</strong> {c.totalBoxes} | <strong>Quantity:</strong> {c.totalQuantity}
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                <Link
                  to={`/delivery-challan/shayoona/view/${c._id}`}
                  className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2"
                  title="View / Print"
                >
                  <i className="bi bi-eye fs-6" />
                </Link>
                <Link
                  to={`/delivery-challan/shayoona/edit/${c._id}`}
                  className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2"
                  title="Edit"
                >
                  <i className="bi bi-pencil-square fs-6" />
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(c._id, c.challanNo)}
                  className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                  title="Delete"
                >
                  <i className="bi bi-trash fs-6" />
                </button>
              </div>
            </div>
          ))}
          {challans.length === 0 && !loading && (
            <div className="text-center py-4 text-muted">No delivery challans found</div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="d-none d-md-block" style={{ overflowX: 'auto' }}>
          <table className="data-table mb-0 w-100 shayona-challan-list-table" style={{ tableLayout: 'fixed', minWidth: 1180 }}>
            <colgroup>
              <col style={{ width: '6%' }} />
              <col style={{ width: '23%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="py-3 px-2 text-uppercase small fw-bold text-muted text-center">
                  Sr No
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">
                  Challan No
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">
                  Date & Time
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-start">
                  Company Name
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-start">
                  Vehicle / Transport
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">
                  Total Box
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">
                  Total Qty
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {challans.map((c, index) => (
                <tr key={c._id} className="align-middle border-bottom transition-all hover-bg-light">
                  {/* Sr No */}
                  <td className="py-3 px-2 text-center">
                    <span className="text-muted fw-bold" style={{ fontSize: 13 }}>
                      {String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}
                    </span>
                  </td>

                  {/* Challan No */}
                  <td className="py-3 text-center">
                    <span className="badge bg-primary-subtle text-primary border border-primary-subtle fs-6 px-2 py-1 font-monospace fw-bold">
                      #{c.challanNo}
                    </span>
                  </td>

                  {/* Date & Time */}
                  <td className="py-3 small text-center">
                    <div className="fw-semibold text-dark">
                      {c.challanDate ? new Date(c.challanDate).toLocaleDateString() : 'N/A'}
                    </div>
                    {c.challanTime && <div className="text-muted small">{c.challanTime}</div>}
                  </td>

                  {/* Company */}
                  <td className="py-3">
                    <div className="fw-bold text-dark text-break">
                      {c.companyName || c.companyId?.name || c.billedTo?.name || '-'}
                    </div>
                    {(c.billedTo?.city || c.billedTo?.gstNo) && (
                      <div className="small text-muted text-break">
                        {[c.billedTo.city, c.billedTo.gstNo ? `GST: ${c.billedTo.gstNo}` : ''].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>

                  {/* Vehicle / LR */}
                  <td className="py-3 small">
                    {(c.vehicleNo || c.transporter || c.dispatchThrough) ? (
                      <>
                        <div className="fw-semibold text-dark text-break">
                          <i className="bi bi-truck me-1 text-muted" />
                          {c.vehicleNo || c.transporter || c.dispatchThrough}
                        </div>
                        {c.vehicleNo && (c.dispatchThrough || c.transporter) && (
                          <div className="text-muted small text-break">
                            Via: {c.dispatchThrough || c.transporter}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">Not specified</span>
                    )}
                    {c.lrNo && (
                      <div className="text-muted small text-break">LR: {c.lrNo}</div>
                    )}
                  </td>

                  {/* Total Box */}
                  <td className="py-3 text-center">
                    <span className="badge bg-light text-dark border px-3 py-1 font-monospace fw-bold">
                      {c.totalBoxes || 0}
                    </span>
                  </td>

                  {/* Total Qty */}
                  <td className="py-3 text-center">
                    <span className="badge bg-success-subtle text-success border border-success-subtle px-3 py-1 font-monospace fw-bold">
                      {c.totalQuantity?.toLocaleString() || 0}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3 text-center">
                    <div className="d-flex gap-2 justify-content-center">
                          <Link
                            to={`/delivery-challan/shayoona/view/${c._id}`}
                            className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2"
                            title="View / Print"
                          >
                            <i className="bi bi-eye fs-6" />
                          </Link>
                      <Link
                        to={`/delivery-challan/shayoona/edit/${c._id}`}
                        className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2"
                        title="Edit Challan"
                      >
                            <i className="bi bi-pencil-square fs-6" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(c._id, c.challanNo)}
                        className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                        title="Delete Challan"
                      >
                            <i className="bi bi-trash fs-6" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {challans.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    <div className="d-flex flex-column align-items-center justify-content-center gap-2">
                      <i className="bi bi-receipt-cutoff text-muted" style={{ fontSize: 36 }} />
                      <span className="fs-6">No delivery challans recorded yet</span>
                      <div className="mt-2" style={{ width: 260 }}>
                        <Link
                          to="/delivery-challan/shayoona/add"
                          className="btn btn-accent py-2 w-100 d-flex align-items-center justify-content-center"
                          style={{ borderRadius: 8, whiteSpace: 'nowrap' }}
                        >
                          <i className="bi bi-plus-circle me-2" /> Create First Challan
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
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
              disabled={currentPage === 1}
              onClick={() => {
                if (currentPage > 1) setSearchParams({ page: currentPage - 1 });
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
                    onClick={() => setSearchParams({ page: p })}
                  >
                    {p}
                  </button>
                )
              );
            })()}

            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => {
                if (currentPage < totalPages) setSearchParams({ page: currentPage + 1 });
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
