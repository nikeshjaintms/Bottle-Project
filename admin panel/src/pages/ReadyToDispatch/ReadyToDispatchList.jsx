import React, { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams, useParams, useNavigate } from 'react-router-dom';
import API from '../../services/api';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import Select from 'react-select';

export default function ReadyToDispatchList() {
  const { companyId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [availableBottles, setAvailableBottles] = useState([]);

  const [stats, setStats] = useState({
    grandTotalBoxes: 0,
    grandTotalProducedQty: 0,
    grandTotalWeight: 0,
  });

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = urlPage || 1;

  const [searchTerm, setSearchTerm] = useState('');
  const [bottleFilter, setBottleFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Load companies
  useEffect(() => {
    let isMounted = true;
    const fetchCompanies = async () => {
      try {
        setLoadingCompanies(true);
        const res = await API.get('/company', { params: { pagination: 'false' } });
        if (isMounted) {
          setCompanies(res.data?.data || []);
        }
      } catch (err) {
        console.error('Failed to load companies:', err);
      } finally {
        if (isMounted) setLoadingCompanies(false);
      }
    };
    fetchCompanies();
    return () => { isMounted = false; };
  }, []);

  // Find the selected company
  const selectedCompany = useMemo(() => {
    if (!companyId || !companies.length) return null;
    return companies.find((c) => String(c._id) === String(companyId)) || null;
  }, [companyId, companies]);

  // Load available bottles for this company to populate the Select filter
  useEffect(() => {
    let isMounted = true;
    const fetchBottles = async () => {
      try {
        // Fetch all sheets for this company without pagination to collect unique bottles
        const [sheetsRes, bpRes] = await Promise.all([
          API.get('/ready-to-dispatch', {
            params: { companyId, pagination: 'false' },
          }),
          API.get('/bottle-per-box', {
            params: { pagination: 'false' },
          }).catch(() => ({ data: { data: [] } })),
        ]);

        if (isMounted) {
          const bottleSet = new Set();
          const sheets = sheetsRes.data?.data || [];
          sheets.forEach((sheet) => {
            (sheet.groups || []).forEach((grp) => {
              const name = grp.plainBottleName || grp.bottleName || grp.title;
              if (name && name.trim()) {
                bottleSet.add(name.trim());
              }
            });
          });

          // Also merge bottles from master
          const bpList = bpRes.data?.data || [];
          bpList.forEach((bp) => {
            const name = bp.plainBottleName || bp.bottleName;
            if (name && name.trim()) {
              bottleSet.add(name.trim());
            }
          });

          const sortedList = Array.from(bottleSet).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
          );

          setAvailableBottles(sortedList);
        }
      } catch (err) {
        console.error('Failed to load bottles for filter:', err);
      }
    };

    if (companyId) {
      fetchBottles();
    }
    return () => { isMounted = false; };
  }, [companyId]);

  // Fetch list of ready to dispatch sheets for this company
  const fetchData = async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      const res = await API.get('/ready-to-dispatch', {
        params: {
          page: currentPage,
          limit: itemsPerPage,
          search: searchTerm || undefined,
          companyId,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          bottleName: bottleFilter || undefined,
        },
      });

      if (res.data?.success) {
        setData(res.data.data || []);
        setTotal(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
        if (res.data.stats) {
          setStats(res.data.stats);
        }
      }
    } catch (err) {
      console.error('Error fetching ReadyToDispatch:', err);
      Swal.fire('Error', err.response?.data?.message || 'Failed to fetch records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId, currentPage, itemsPerPage, searchTerm, bottleFilter, dateFrom, dateTo]);

  // Reset Filters
  const handleReset = () => {
    setSearchTerm('');
    setBottleFilter('');
    setDateFrom('');
    setDateTo('');
    setSearchParams({ page: 1 });
  };

  // Delete Record
  const handleDelete = async (id, title) => {
    const result = await Swal.fire({
      title: 'Delete Record?',
      text: `Are you sure you want to delete "${title || 'this sheet'}"? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel',
    });

    if (result.isConfirmed) {
      try {
        const res = await API.delete(`/ready-to-dispatch/${id}`);
        if (res.data?.success) {
          Swal.fire('Deleted!', 'The record has been deleted.', 'success');
          fetchData();
        }
      } catch (err) {
        console.error('Delete error:', err);
        Swal.fire('Error', err.response?.data?.message || 'Failed to delete record', 'error');
      }
    }
  };

  // Export List to Excel (restricted to current company and active filters)
  const handleExportList = async () => {
    try {
      Swal.fire({
        title: 'Generating Export...',
        text: 'Please wait while we fetch the records.',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const res = await API.get('/ready-to-dispatch', {
        params: {
          pagination: 'false',
          companyId,
          search: searchTerm || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          bottleName: bottleFilter || undefined,
        },
      });

      const allRecords = res.data?.data || [];
      if (!allRecords.length) {
        Swal.fire('Notice', 'No data to export for the selected filters.', 'info');
        return;
      }

      const rows = allRecords.map((item, idx) => ({
        'Sr. No': idx + 1,
        'Dispatch Date': item.dispatchDate
          ? new Date(item.dispatchDate).toLocaleDateString('en-GB')
          : '',
        'Sheet Title': item.sheetTitle || '',
        Company: item.companyId?.name || selectedCompany?.name || '',
        'Total Plain Bottles': (item.groups || []).length,
        'Total Boxes': item.summary?.totalBoxes || 0,
        'Produced Qty': item.summary?.totalProducedQty || 0,
        'Total Weight (kg)':
          item.summary?.totalWeight != null ? item.summary.totalWeight : '-',
        Remarks: item.remarks || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      const compName = (selectedCompany?.name || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
      XLSX.utils.book_append_sheet(wb, ws, 'Ready_To_Dispatch');
      XLSX.writeFile(
        wb,
        `Ready_To_Dispatch_${compName}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      Swal.close();
    } catch (err) {
      console.error('Export error:', err);
      Swal.fire('Error', 'Failed to generate export file.', 'error');
    }
  };

  // If company loading completed and company was not found
  if (!loadingCompanies && !selectedCompany) {
    return (
      <div className="page-content ready-to-dispatch-page">
        <div className="dash-card p-5 text-center my-5 shadow-sm rounded-4 bg-white border">
          <i className="bi bi-exclamation-circle text-warning fs-1 mb-3 d-block" />
          <h2 className="fw-bold mb-2 text-dark">Company Not Found</h2>
          <p className="text-muted mb-4">
            The requested company ID <code>{companyId}</code> does not exist or has been removed.
          </p>
          <button
            onClick={() => navigate('/ready-to-dispatch')}
            className="btn btn-primary px-4 py-2 rounded-pill shadow-sm"
          >
            <i className="bi bi-arrow-left me-2" /> Back to Companies
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content ready-to-dispatch-page ready-to-dispatch-list">
      {/* Page Header */}
      <div className="page-header d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-center gap-3">
          <button
            onClick={() => navigate('/ready-to-dispatch')}
            className="btn-ghost border-0"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Back to Companies"
          >
            <i className="bi bi-arrow-left" style={{ fontSize: 22 }} />
          </button>
          <div>
            <h1 className="page-title mb-1 d-flex align-items-center gap-2">
              <i className="bi bi-box-seam-fill text-primary" />
              Ready To Dispatch - {selectedCompany?.name || 'Company'}
            </h1>
            <p className="page-subtitle text-muted mb-0">
              Material ready for dispatch for {selectedCompany?.name || 'this company'}
            </p>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 productions-page-actions">
          <button
            type="button"
            disabled={loading}
            className="btn btn-outline-primary shadow-sm px-4 py-2 rounded-3"
            onClick={handleExportList}
          >
            <i className="bi bi-file-earmark-excel-fill me-2" /> Export Excel
          </button>
          <Link
            to={`/ready-to-dispatch/add?company=${companyId}`}
            className="btn btn-accent shadow-sm px-4 py-2 rounded-3"
            style={{ color: 'white', textDecoration: 'none', fontWeight: 600 }}
          >
            <i className="bi bi-plus-lg me-2" /> New Ready to Dispatch
          </Link>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 bg-white">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <div className="text-muted small text-uppercase fw-semibold">Total Sheets</div>
                <div className="fs-4 fw-bold text-dark mt-1">{total}</div>
              </div>
              <div
                className="rounded-circle d-flex align-items-center justify-content-center bg-primary-subtle text-primary"
                style={{ width: 48, height: 48 }}
              >
                <i className="bi bi-files fs-4" />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 bg-white">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <div className="text-muted small text-uppercase fw-semibold">Total Boxes</div>
                <div className="fs-4 fw-bold text-success mt-1">
                  {(stats.grandTotalBoxes || 0).toLocaleString()}
                </div>
              </div>
              <div
                className="rounded-circle d-flex align-items-center justify-content-center bg-success-subtle text-success"
                style={{ width: 48, height: 48 }}
              >
                <i className="bi bi-boxes fs-4" />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 bg-white">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <div className="text-muted small text-uppercase fw-semibold">Produced Qty</div>
                <div className="fs-4 fw-bold text-info mt-1">
                  {(stats.grandTotalProducedQty || 0).toLocaleString()}
                </div>
              </div>
              <div
                className="rounded-circle d-flex align-items-center justify-content-center bg-info-subtle text-info"
                style={{ width: 48, height: 48 }}
              >
                <i className="bi bi-box2-fill fs-4" />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 bg-white">
            <div className="card-body p-3 d-flex align-items-center justify-content-between">
              <div>
                <div className="text-muted small text-uppercase fw-semibold">Total Weight (kg)</div>
                <div className="fs-4 fw-bold text-warning mt-1">
                  {(stats.grandTotalWeight || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 3,
                  })}
                </div>
              </div>
              <div
                className="rounded-circle d-flex align-items-center justify-content-center bg-warning-subtle text-warning"
                style={{ width: 48, height: 48 }}
              >
                <i className="bi bi-speedometer2 fs-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="dash-card mb-4 border-top-accent" style={{ borderTop: '3px solid var(--accent, #008ecc)' }}>
        <div className="dash-card-body p-3 bg-white">
          <div className="d-flex align-items-center gap-2 mb-3">
            <i className="bi bi-funnel text-primary fw-bold" style={{ fontSize: 18 }} />
            <h6 className="mb-0 fw-bold text-dark">Filter Ready To Dispatch Sheets</h6>
          </div>
          <div className="row g-3 align-items-end">
            {/* Date From Filter */}
            <div className="col-12 col-sm-6 col-md-3 col-lg-2">
              <label className="small text-muted fw-bold mb-1 d-block">From</label>
              <input
                type="date"
                className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setSearchParams({ page: 1 });
                }}
                style={{ borderRadius: 10, height: 38 }}
              />
            </div>

            {/* To Date Filter */}
            <div className="col-12 col-sm-6 col-md-3 col-lg-2">
              <label className="small text-muted fw-bold mb-1 d-block">To</label>
              <input
                type="date"
                className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setSearchParams({ page: 1 });
                }}
                style={{ borderRadius: 10, height: 38 }}
              />
            </div>

            {/* Plain Bottle Name Filter */}
            <div className="col-12 col-sm-12 col-md-6 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">🔍 Plain Bottle Name</label>
              <Select
                isClearable={true}
                isSearchable={true}
                options={availableBottles.map((b) => ({ value: b, label: b }))}
                value={bottleFilter ? { value: bottleFilter, label: bottleFilter } : null}
                onChange={(selected) => {
                  setSearchParams({ page: 1 });
                  setBottleFilter(selected ? selected.value : '');
                }}
                placeholder="Select bottle name..."
                classNamePrefix="react-select"
                styles={{
                  control: (base) => ({
                    ...base,
                    borderRadius: 10,
                    minHeight: 38,
                    borderColor: 'var(--bs-border-color-translucent, #dee2e6)',
                    backgroundColor: 'var(--bs-light, #f8f9fa)',
                    boxShadow: 'none',
                  }),
                }}
              />
            </div>

            {/* Search */}
            <div className="col-12 col-sm-6 col-md-6 col-lg-3">
              <label className="small text-muted fw-bold mb-1 d-block">Search Sheet</label>
              <div className="search-input-wrapper position-relative">
                <i
                  className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3"
                  style={{ pointerEvents: 'none' }}
                />
                <input
                  type="text"
                  className="form-control form-control-sm border-light-subtle bg-light ps-5 shadow-none w-100"
                  placeholder="Search title, remarks..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSearchParams({ page: 1 });
                  }}
                  style={{ borderRadius: 10, height: 38 }}
                />
              </div>
            </div>

            {/* Reset Button */}
            <div className="col-12 col-sm-6 col-md-6 col-lg-2">
              <button
                onClick={handleReset}
                type="button"
                className="btn btn-sm btn-light border-light-subtle w-100"
                style={{ borderRadius: 10, fontWeight: 600, height: 38 }}
              >
                ✕ Reset All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="dash-card border-0 shadow-sm">
        <div className="dash-card-header d-flex align-items-center justify-content-start p-3 border-bottom bg-white companies-dash-toolbar">
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
              <option value="100">100</option>
            </select>
            <span>entries</span>
          </div>
        </div>

        <div className="table-responsive ready-to-dispatch-list-table">
          <table className="data-table mb-0">
            <thead>
              <tr>
                <th className="py-3 text-uppercase small fw-bold text-muted ps-5 text-start" style={{ width: 100 }}>
                  Sr No
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 130 }}>
                  Date
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-start">
                  Sheet Title / Remarks
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 140 }}>
                  Plain Bottles
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 110 }}>
                  Total Boxes
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 120 }}>
                  Produced Qty
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 130 }}>
                  Total Weight (kg)
                </th>
                <th className="py-3 text-uppercase small fw-bold text-muted text-center pe-5" style={{ width: 130 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-5">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status" />
                    <span className="text-muted">Loading records...</span>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    <i className="bi bi-inbox fs-2 d-block mb-2 text-secondary" />
                    No Ready to Dispatch sheets found for this company.
                  </td>
                </tr>
              ) : (
                data.map((item, index) => {
                  const dateStr = item.dispatchDate
                    ? new Date(item.dispatchDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : '-';

                  const bottleCount = (item.groups || []).length;
                  const variantCount = (item.groups || []).reduce(
                    (acc, g) => acc + (g.variantLines || []).length,
                    0
                  );

                  return (
                    <tr key={item._id} className="align-middle border-bottom transition-all hover-bg-light">
                      <td className="py-3 ps-5 text-start">
                        <span className="text-muted fw-bold" style={{ fontSize: 13 }}>
                          {(currentPage - 1) * itemsPerPage + index + 1}
                        </span>
                      </td>
                      <td className="py-3 text-center fw-semibold text-dark">
                        <span className="d-inline-flex align-items-center gap-1">
                          <i className="bi bi-calendar3 text-secondary" style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true" />
                          <span>{dateStr}</span>
                        </span>
                      </td>
                      <td className="py-3 text-start">
                        <div className="fw-bold text-dark">{item.sheetTitle || 'Ready to Dispatch'}</div>
                        {item.remarks && (
                          <div className="text-muted small text-truncate" style={{ maxWidth: 300 }}>
                            {item.remarks}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        <div className="small">
                          <span className="fw-bold text-dark">{bottleCount}</span> Plain Bottle
                          {bottleCount !== 1 ? 's' : ''}
                        </div>
                        <div className="text-muted small">{variantCount} variant lines</div>
                      </td>
                      <td className="py-3 text-center">
                        <span className="badge bg-light text-dark border px-2 py-1 fw-bold fs-7">
                          {(item.summary?.totalBoxes || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className="fw-semibold text-primary">
                          {(item.summary?.totalProducedQty || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 text-center fw-bold text-dark">
                        {item.summary?.totalWeight != null
                          ? item.summary.totalWeight.toLocaleString(undefined, {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 3,
                            })
                          : '-'}
                      </td>
                      <td className="py-3 text-center pe-5">
                        <div className="d-flex align-items-center justify-content-center gap-2">
                          <Link
                            to={`/ready-to-dispatch/view/${item._id}`}
                            className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2"
                            title="View Sheet"
                          >
                            <i className="bi bi-eye fs-6" />
                          </Link>
                          <Link
                            to={`/ready-to-dispatch/edit/${item._id}`}
                            className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2"
                            title="Edit Sheet"
                          >
                            <i className="bi bi-pencil-square fs-6" />
                          </Link>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2"
                            onClick={() => handleDelete(item._id, item.sheetTitle)}
                            title="Delete Sheet"
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
