import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useSummaryLanguage } from '../../hooks/useSummaryLanguage';
import './Summary.css';

export default function SummaryCompanies() {
  const { labels, language, toggleLanguage } = useSummaryLanguage();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const urlPage = searchParams.get('page') || '1';
  const currentPage = Number(urlPage) || 1;
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    let isMounted = true;
    const fetchCompanies = async () => {
      setLoading(true);
      try {
        const res = await api.get('/summary/companies', {
          params: { search }
        });
        if (isMounted) {
          setCompanies(res.data?.data || []);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || err.message || 'Failed to fetch companies');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCompanies();
    return () => { isMounted = false; };
  }, [search]);

  // Client-side pagination for company list
  const total = companies.length;
  const totalPages = Math.ceil(total / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCompanies = companies.slice(startIndex, startIndex + itemsPerPage);

  const companyAvatarColors = [
    'linear-gradient(135deg,#00aeef,#008ecc)',
    'linear-gradient(135deg,#007236,#008b45)',
    'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'linear-gradient(135deg,#ffcc00,#ffb300)',
    'linear-gradient(135deg,#ec4899,#f43f5e)',
    'linear-gradient(135deg,#14b8a6,#0d9488)',
  ];

  return (
    <div className="page-content summary-container">
      {/* Page Header */}
      <div className="page-header d-flex align-items-center justify-content-between summary-header flex-wrap gap-3">
        <div>
          <h1 className="page-title">{labels.title}</h1>
          <p className="page-subtitle text-muted mb-0">{labels.subtitle}</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            onClick={toggleLanguage}
            className="btn btn-outline-primary summary-lang-btn d-flex align-items-center gap-2"
            title="Toggle English / Gujarati"
          >
            <i className="bi bi-translate fs-6" />
            <span>{labels.languageToggle}</span>
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="dash-card border-0 shadow-sm" style={{ borderRadius: 14, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white companies-dash-toolbar flex-wrap gap-3">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>{labels.entriesPerPage}</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 75, borderRadius: 8, cursor: 'pointer' }}
              value={itemsPerPage}
              onChange={(e) => {
                setSearchParams({ page: 1, search });
                setItemsPerPage(Number(e.target.value));
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span>{labels.entries}</span>
          </div>

          <div className="search-input-wrapper position-relative companies-search-wrap" style={{ minWidth: 260 }}>
            <i
              className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3"
              style={{ pointerEvents: 'none' }}
            />
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
              placeholder={labels.searchCompanies}
              value={search}
              onChange={(e) => {
                setSearchParams({ page: 1, search: e.target.value });
              }}
              style={{ borderRadius: 10, fontSize: 13 }}
            />
          </div>
        </div>

        {/* Mobile View */}
        <div className="companies-list-mobile">
          {loading ? (
            <div className="p-4 text-center text-muted">
              <div className="spinner-border text-primary mb-2" />
              <div>{labels.loading}</div>
            </div>
          ) : paginatedCompanies.map((c, index) => (
            <div key={c._id} className="companies-mobile-card brands-mobile-card">
              <div className="d-flex align-items-start gap-3 w-100 min-w-0">
                <div
                  className="companies-mobile-avatar d-flex align-items-center justify-content-center text-white fw-bold"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: companyAvatarColors[index % companyAvatarColors.length],
                    fontSize: '1.2rem',
                    flexShrink: 0
                  }}
                >
                  {c.name?.charAt(0).toUpperCase() || 'C'}
                </div>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                    <span className="text-muted small fw-bold">#{String(startIndex + index + 1).padStart(2, '0')}</span>
                    <span className="fw-semibold text-truncate">{c.name}</span>
                    {c.isShreno && (
                      <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-0.5" style={{ fontSize: '11px', fontWeight: 600 }}>
                        SHRENO
                      </span>
                    )}
                  </div>
                  <div className="small text-muted mt-1">{labels.companySummary}</div>
                </div>
              </div>
              <div className="companies-mobile-actions brands-mobile-actions">
                <Link
                  to={`/summary/company/${c._id}`}
                  className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none companies-mobile-action-btn"
                  title="View Summary"
                >
                  <i className="bi bi-arrow-right fs-6" />
                </Link>
              </div>
            </div>
          ))}
          {companies.length === 0 && !loading && (
            <div className="companies-mobile-empty">{labels.noCompanies}</div>
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
                    <div className="spinner-border text-primary mb-2" />
                    <div>{labels.loading}</div>
                  </td>
                </tr>
              ) : paginatedCompanies.map((c, index) => (
                <tr key={c._id} className="align-middle border-bottom transition-all hover-bg-light">
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
                          fontWeight: 600
                        }}
                      >
                        {c.name?.charAt(0).toUpperCase() || 'C'}
                      </div>
                      <div className="d-flex flex-column justify-content-center">
                        <div className="d-flex align-items-center gap-2">
                          <span className="text-dark fw-bold" style={{ fontSize: '15px' }}>{c.name}</span>
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
                      to={`/summary/company/${c._id}`}
                      className="btn btn-sm btn-light text-primary border rounded-pill px-4 py-2 fw-600 transition-all hover-shadow"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View <i className="bi bi-arrow-right ms-1" />
                    </Link>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className="text-center py-5 text-muted">
                    {labels.noCompanies}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="dash-card-footer d-flex align-items-center justify-content-between p-3 border-top bg-white companies-dash-footer flex-wrap gap-2">
          <div className="text-muted small fw-500">
            {labels.showing} <b>{total === 0 ? 0 : startIndex + 1}</b> {labels.to}{' '}
            <b>{Math.min(currentPage * itemsPerPage, total)}</b> {labels.of} <b>{total}</b> {labels.entries}
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center">
            <button
              className="btn btn-sm btn-light"
              disabled={currentPage <= 1}
              onClick={() => setSearchParams({ page: currentPage - 1, search })}
            >
              {labels.previous}
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
                p === '...' ? (
                  <span key={`e-${idx}`} className="px-1 text-muted" style={{ fontSize: 13 }}>
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-light'}`}
                    onClick={() => setSearchParams({ page: p, search })}
                  >
                    {p}
                  </button>
                )
              );
            })()}

            <button
              className="btn btn-sm btn-light"
              disabled={currentPage >= totalPages || totalPages === 0}
              onClick={() => setSearchParams({ page: currentPage + 1, search })}
            >
              {labels.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
