import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams, Navigate } from 'react-router-dom';
import api from '../../services/api';
import { Can } from '../../context/AbilityContext';

export default function ReadyToDispatchCompanies() {
  const [searchParams, setSearchParams] = useSearchParams();
  const oldCompanyParam = searchParams.get('company');

  // If old URL /ready-to-dispatch?company=<id> is accessed, redirect to /ready-to-dispatch/company/<id>
  if (oldCompanyParam) {
    return <Navigate to={`/ready-to-dispatch/company/${oldCompanyParam}`} replace />;
  }

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const urlPage = searchParams.get('page') || '1';
  const currentPage = Number(urlPage) || 1;

  useEffect(() => {
    let isMounted = true;
    const loadCompaniesSummary = async () => {
      try {
        setLoading(true);
        const res = await api.get('/ready-to-dispatch/companies-summary');
        if (isMounted) {
          if (res.data?.success) {
            setCompanies(res.data.data || []);
            setError(null);
          } else {
            setError(res.data?.message || 'Failed to load company summaries');
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching companies summary:', err);
          setError(err.response?.data?.message || err.message || 'Failed to load companies');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCompaniesSummary();
    return () => { isMounted = false; };
  }, []);

  // Filter companies by search term
  const filteredCompanies = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return companies
      .filter(c =>
        !term ||
        c.name?.toLowerCase().includes(term) ||
        c.code?.toLowerCase().includes(term) ||
        c.shortName?.toLowerCase().includes(term)
      )
      .slice()
      .sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      );
  }, [companies, searchTerm]);

  // Client-side pagination matching Incoming/Dispatch
  const total = filteredCompanies.length;
  const totalPages = Math.ceil(total / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCompanies = filteredCompanies.slice(startIndex, startIndex + itemsPerPage);

  const companyAvatarColors = [
    'linear-gradient(135deg,#00aeef,#008ecc)',
    'linear-gradient(135deg,#007236,#008b45)',
    'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'linear-gradient(135deg,#ffcc00,#ffb300)',
    'linear-gradient(135deg,#ec4899,#f43f5e)',
    'linear-gradient(135deg,#14b8a6,#0d9488)',
  ];

  return (
    <div className="page-content ready-to-dispatch-page ready-to-dispatch-companies-page">
      {/* Page Header */}
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title">Ready To Dispatch</h1>
          <p className="page-subtitle">Select a company to view their ready to dispatch sheets</p>
        </div>
        <div className="d-flex gap-2">
          <Can I="create" a="ready-to-dispatch">
            <Link to="/ready-to-dispatch/add" className="btn-accent companies-header-action">
              <i className="bi bi-plus-lg me-2" /> New Ready To Dispatch
            </Link>
          </Can>
        </div>
      </div>

      {/* Main Card */}
      <div className="dash-card border-0 shadow-sm">
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
              <option value="100">100</option>
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
              placeholder="Search companies..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSearchParams({ page: 1 });
              }}
              style={{ borderRadius: 10, fontSize: 13 }}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="alert alert-danger m-3 mb-0" role="alert">
            <i className="bi bi-exclamation-triangle-fill me-2" />
            {error}
          </div>
        )}

        {/* Mobile View */}
        <div className="companies-list-mobile">
          {loading ? (
            <div className="p-4 text-center text-muted">
              <div className="spinner-border spinner-border-sm text-primary mb-2" />
              <div>Loading companies...</div>
            </div>
          ) : paginatedCompanies.map((c, index) => {
            const dateStr = c.latestSheetDate
              ? new Date(c.latestSheetDate).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
              : 'No sheets yet';

            return (
              <div key={c._id} className="companies-mobile-card brands-mobile-card">
                <div className="d-flex align-items-start gap-3 w-100 min-w-0">
                  <div
                    className="companies-mobile-avatar"
                    style={{
                      background: companyAvatarColors[index % companyAvatarColors.length],
                      flexShrink: 0,
                    }}
                  >
                    {c.name?.charAt(0).toUpperCase() || 'C'}
                  </div>
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <span className="text-muted small fw-bold">
                        #{String(startIndex + index + 1).padStart(2, '0')}
                      </span>
                      <span className="fw-semibold text-truncate">{c.name}</span>
                      {c.isShreno && (
                        <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-0.5" style={{ fontSize: '11px', fontWeight: 600 }}>
                          SHRENO
                        </span>
                      )}
                    </div>
                    <div className="small text-muted mt-1">
                      Select to view ready to dispatch sheets
                    </div>
                  </div>
                </div>
                <div className="companies-mobile-actions brands-mobile-actions">
                  <Link
                    to={`/ready-to-dispatch/company/${c._id}`}
                    className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn"
                    title="View Ready To Dispatch"
                  >
                    <i className="bi bi-arrow-right fs-6" />
                  </Link>
                </div>
              </div>
            );
          })}
          {paginatedCompanies.length === 0 && !loading && (
            <div className="companies-mobile-empty">No companies found</div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="companies-list-desktop" style={{ overflowX: 'auto' }}>
          <table className="data-table mb-0">
            <thead>
              <tr>
                <th className="py-3 text-uppercase small fw-bold text-muted ps-5 text-start" style={{ width: 150 }}>
                  Sr No
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-start">
                  Company Name
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 150 }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="text-center py-5 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status" />
                    <span>Loading companies...</span>
                  </td>
                </tr>
              ) : paginatedCompanies.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-5 text-muted">
                    No companies found
                  </td>
                </tr>
              ) : (
                paginatedCompanies.map((c, index) => (
                  <tr
                    key={c._id}
                    className="align-middle border-bottom transition-all hover-bg-light"
                  >
                    <td className="py-4 ps-5 text-start" style={{ width: 100 }}>
                      <span className="text-muted fw-bold" style={{ fontSize: 13 }}>
                        {String(startIndex + index + 1).padStart(2, '0')}
                      </span>
                    </td>
                    <td className="py-4 text-start">
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="d-flex align-items-center justify-content-center text-white shadow-sm flex-shrink-0"
                          style={{
                            width: 45,
                            height: 45,
                            borderRadius: '14px',
                            background: companyAvatarColors[index % companyAvatarColors.length],
                            fontSize: '1.2rem',
                            fontWeight: 600,
                          }}
                        >
                          {c.name?.charAt(0).toUpperCase() || 'C'}
                        </div>
                        <div className="d-flex flex-column justify-content-center">
                          <div className="d-flex align-items-center gap-2">
                            <span className="text-dark fw-bold company-name-text" data-company-name={c.name} style={{ fontSize: '15px' }}>
                              {c.name}
                            </span>
                            {c.isShreno && (
                              <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-0.5" style={{ fontSize: '11px', fontWeight: 600 }}>
                                SHRENO
                              </span>
                            )}
                          </div>
                          {c.code && <span className="text-muted small">Code: {c.code}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-center pe-5" style={{ width: 180 }}>
                      <Link
                        to={`/ready-to-dispatch/company/${c._id}`}
                        className="btn btn-sm btn-light text-primary border rounded-pill px-4 py-2 fw-600 transition-all hover-shadow"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View <i className="bi bi-arrow-right ms-1" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer">
          <div className="text-muted small fw-500">
            Showing <b>{total === 0 ? 0 : startIndex + 1}</b> to <b>{Math.min(startIndex + itemsPerPage, total)}</b> of <b>{total}</b> entries
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
            <button
              className="btn btn-sm btn-light"
              disabled={currentPage <= 1}
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
                    …
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
              disabled={currentPage >= totalPages || totalPages === 0}
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
