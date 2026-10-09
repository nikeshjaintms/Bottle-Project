import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchCompanies, setSearchTerm } from '../../redux/slices/companySlice';
import { Can } from '../../context/AbilityContext';

export default function IncomingCompanies() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { companies, loading, page, totalPages, total, searchTerm } = useSelector((state) => state.companies);
  const search = searchTerm || "";
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get('page') || '';
  const currentPage = Number(urlPage) || page || 1;
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    dispatch(fetchCompanies({
      page: urlPage,
      limit: itemsPerPage,
      search,
    }));
  }, [dispatch, urlPage, itemsPerPage, search]);

  const companyAvatarColors = [
    'linear-gradient(135deg,#00aeef,#008ecc)',
    'linear-gradient(135deg,#007236,#008b45)',
    'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'linear-gradient(135deg,#ffcc00,#ffb300)',
  ];

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title">Incoming Register</h1>
          <p className="page-subtitle">Select a company to view their incoming deliveries</p>
        </div>
        <Can I="create" a="incoming">
          <Link to="/incoming/add" className="btn-accent companies-header-action">
            <i className="bi bi-plus-lg me-2" /> New Incoming
          </Link>
        </Can>
      </div>

      <div className="dash-card border-0 shadow-sm">
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
            <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
              placeholder="Search companies..."
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

        <div className="companies-list-mobile">
          {companies.map((b, index) => (
            <div key={b._id} className="companies-mobile-card brands-mobile-card">
              <div className="d-flex align-items-start gap-3 w-100 min-w-0">
                <div
                  className="companies-mobile-avatar"
                  style={{ background: companyAvatarColors[index % companyAvatarColors.length], flexShrink: 0 }}
                >
                  {b.name?.charAt(0).toUpperCase() || 'C'}
                </div>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                    <span className="text-muted small fw-bold">#{String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}</span>
                    <span className="fw-semibold text-truncate">{b.name}</span>
                  </div>
                  <div className="small text-muted mt-1">
                    Select to view incoming entries
                  </div>
                </div>
              </div>
              <div className="companies-mobile-actions brands-mobile-actions">
                <Link
                  to={`/incoming/company/${b._id}`}
                  className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn"
                  title="View Incoming"
                >
                  <i className="bi bi-arrow-right fs-6" />
                </Link>
              </div>
            </div>
          ))}
          {companies.length === 0 && !loading && (
            <div className="companies-mobile-empty">No companies found</div>
          )}
        </div>

        <div className="companies-list-desktop" style={{ overflowX: 'auto' }}>
          <table className="data-table mb-0">
            <thead>
              <tr>
                <th className="py-3 text-uppercase small fw-bold text-muted ps-5 text-start" style={{ width: 150 }}>Sr No</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-start">Company Name</th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 150 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((b, index) => (
                <tr 
                  key={b._id} 
                  className="align-middle border-bottom transition-all hover-bg-light" 
                >
                  <td className="py-4 ps-5 text-start" style={{ width: 100 }}>
                    <span className="text-muted fw-bold" style={{ fontSize: 13 }}>{String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0')}</span>
                  </td>
                  <td className="py-4 text-start">
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className="d-flex align-items-center justify-content-center text-white shadow-sm"
                        style={{ width: 45, height: 45, borderRadius: '14px', background: companyAvatarColors[index % companyAvatarColors.length], fontSize: '1.2rem', fontWeight: 600 }}
                      >
                        {b.name?.charAt(0).toUpperCase() || 'C'}
                      </div>
                      <div className="d-flex flex-column justify-content-center">
                        <span className="text-dark fw-bold" style={{ fontSize: '15px' }}>{b.name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 text-center pe-5" style={{ width: 180 }}>
                    <Link to={`/incoming/company/${b._id}`} className="btn btn-sm btn-light text-primary border rounded-pill px-4 py-2 fw-600 transition-all hover-shadow" onClick={(e) => e.stopPropagation()}>
                      View <i className="bi bi-arrow-right ms-1" />
                    </Link>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && !loading && (
                <tr><td colSpan={3} className="text-center py-5 text-muted">No companies found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer">
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
