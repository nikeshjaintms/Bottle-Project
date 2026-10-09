import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams, } from 'react-router-dom';
import { Can } from '../../context/AbilityContext';
import { useDispatch, useSelector } from 'react-redux';
import {fetchOperators, deleteOperator, setSearchTerm} from '../../redux/slices/operatorSlice';
import Swal from 'sweetalert2';

export default function Operators() {
  const dispatch = useDispatch();
  const { operators, loading, page, totalPages, total, searchTerm } = useSelector((state) => state.operators);
  const search = searchTerm || "";
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get('page') || '';
  const currentPage = Number(urlPage) || page || 1;
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handledeleteOperator = (id, name) => {
    Swal.fire({
      title: 'Delete Operator?',
      text: `Are you sure you want to delete "${name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteOperator(id)).then(res => {
          if (!res.error) Swal.fire('Deleted!', 'Operator removed.', 'success');
          else Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
        });
      }
    });
  };

  useEffect(() => {
    dispatch(fetchOperators({
      page: urlPage,
      limit: itemsPerPage,
      search,
    }));
  }, [dispatch, urlPage, itemsPerPage, search]);

  const isOperatorActive = (b) =>
    b.status === true || b.status === 'active' || b.status === undefined;

  const operatorAvatarColors = [
    'linear-gradient(135deg,#00aeef,#008ecc)',
    'linear-gradient(135deg,#007236,#008b45)',
    'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'linear-gradient(135deg,#ffcc00,#ffb300)',
  ];

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between operators-page-header">
        <div>
          <h1 className="page-title">Operators</h1>
          <p className="page-subtitle">Manage your operator portfolio</p>
        </div>
        <Can I="create" a="operator">
          <Link to="/operators/add" className="btn-accent">
            <i className="bi bi-plus-circle-fill me-2" /> Add Operator
          </Link>
        </Can>
      </div>

      <div className="dash-card">
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white operators-dash-toolbar">
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
          <div className="search-input-wrapper position-relative operators-search-wrap">
            <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
              placeholder="Search operators..."
              value={search}
              onChange={(e) => {
                const val = e.target.value;
                dispatch(setSearchTerm(val));
                setSearchParams({ page: 1 });
              }}
              style={{ borderRadius: 10, fontSize: 13 }}
            />
          </div>
        </div>
        <div className="companies-list-mobile">
          {operators.map((b, index) => (
            <div key={b._id} className="operators-mobile-card brands-mobile-card">
              <div className="d-flex align-items-start gap-3 w-100 min-w-0">
                <div
                  className="operators-mobile-avatar"
                  style={{ background: operatorAvatarColors[index % operatorAvatarColors.length], flexShrink: 0 }}
                >
                  {b.name?.charAt(0).toUpperCase() || 'O'}
                </div>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                    <span className="text-muted small fw-bold">#{String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}</span>
                    <span className="fw-semibold text-truncate">{b.name}</span>
                  </div>
                  <div className="small text-muted mb-1">
                    Shift: <span className="fw-500 text-dark">{b.shift?.name || 'N/A'}</span>
                  </div>
                  <span className={`badge-status badge-${isOperatorActive(b) ? 'active' : 'inactive'}`}>
                    {isOperatorActive(b) ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  <div className="small text-muted mt-1">
                    Created {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
              </div>
              <div className="operators-mobile-actions brands-mobile-actions">
                <Can I="edit" a="operator">
                  <Link
                    to={`/operators/edit/${b._id}`}
                    className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none operators-mobile-action-btn"
                    title="Edit"
                  >
                    <i className="bi bi-pencil-square fs-6" />
                  </Link>
                </Can>
                <Can I="delete" a="operator">
                  <button
                    type="button"
                    onClick={() => handledeleteOperator(b._id, b.name)}
                    className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none operators-mobile-action-btn"
                    title="Delete"
                  >
                    <i className="bi bi-trash fs-6" />
                  </button>
                </Can>
              </div>
            </div>
          ))}
          {operators.length === 0 && !loading && (
            <div className="operators-mobile-empty">No operators found</div>
          )}
        </div>

        <div className="companies-list-desktop" style={{ overflowX: 'auto' }}>
          <table className="data-table mb-0">
            <thead>
              <tr>
                <th className="py-3 text-uppercase small fw-bold text-muted ps-5 text-start" style={{ width: 150 }}>Sr No</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Operator Name</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Shift</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Status</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center">Created At</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 150 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((b, index) => (
                <tr key={b._id} className="align-middle border-bottom transition-all hover-bg-light">
                  <td className="py-3 ps-5 text-start">
                    <span className="text-muted fw-bold" style={{ fontSize: 13 }}>{String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}</span>
                  </td>
                  <td className="py-3 text-center fw-600">{b.name}</td>
                  <td className="py-3 text-center text-muted fw-500">
                    {b.shift?.name || 'N/A'}
                  </td>
                  <td className="py-3 text-center">
                    <span className={`badge-status badge-${isOperatorActive(b) ? 'active' : 'inactive'}`}>
                      {isOperatorActive(b) ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="py-3 text-center text-muted">
                    {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="py-3 text-center">
                    <div className="d-flex gap-2 justify-content-center">
                      <Can I="edit" a="operator">
                        <Link to={`/operators/edit/${b._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit">
                          <i className="bi bi-pencil-square fs-6" />
                        </Link>
                      </Can>
                      <Can I="delete" a="operator">
                        <button onClick={() => handledeleteOperator(b._id, b.name)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete">
                          <i className="bi bi-trash fs-6" />
                        </button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
              {operators.length === 0 && !loading && (
                <tr><td colSpan={6} className="text-center py-5 text-muted">No operators found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white operators-dash-footer">
          <div className="text-muted small fw-500">
            Showing <b>{total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</b> to <b>{Math.min(currentPage * itemsPerPage, total)}</b> of <b>{total}</b> entries
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === 1}
              onClick={() => { if (currentPage > 1) setSearchParams({ page: currentPage - 1 }); }}
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
                  : <button key={p} className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-light'}`} onClick={() => setSearchParams({ page: p })}>{p}</button>
              );
            })()}

            <button
              className="btn btn-sm btn-light"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => { if (currentPage < totalPages) setSearchParams({ page: currentPage + 1 }); }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
