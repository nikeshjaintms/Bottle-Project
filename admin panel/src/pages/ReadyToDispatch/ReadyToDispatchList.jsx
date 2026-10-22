import React, { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import API from '../../services/api';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

export default function ReadyToDispatchList() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
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
  const [selectedCompany, setSelectedCompany] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Load companies
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await API.get('/company', { params: { pagination: 'false' } });
        setCompanies(res.data?.data || []);
      } catch (err) {
        console.error('Failed to load companies:', err);
      }
    };
    fetchCompanies();
  }, []);

  // Fetch list
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await API.get('/ready-to-dispatch', {
        params: {
          page: currentPage,
          limit: itemsPerPage,
          search: searchTerm,
          companyId: selectedCompany || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
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
  }, [currentPage, itemsPerPage, selectedCompany, dateFrom, dateTo]);

  // Handle Search submit
  const handleSearch = (e) => {
    e.preventDefault();
    setSearchParams({ page: 1 });
    fetchData();
  };

  // Reset Filters
  const handleReset = () => {
    setSearchTerm('');
    setSelectedCompany('');
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

  // Export List to Excel
  const handleExportList = () => {
    if (!data.length) {
      return Swal.fire('Notice', 'No data to export', 'info');
    }

    const rows = data.map((item, idx) => ({
      'Sr. No': idx + 1,
      'Dispatch Date': item.dispatchDate ? new Date(item.dispatchDate).toLocaleDateString() : '',
      'Sheet Title': item.sheetTitle || '',
      Company: item.companyId?.name || '',
      'Total Plain Bottles': (item.groups || []).length,
      'Total Boxes': item.summary?.totalBoxes || 0,
      'Produced Qty': item.summary?.totalProducedQty || 0,
      'Total Weight (kg)': item.summary?.totalWeight || 0,
      Remarks: item.remarks || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ready_To_Dispatch');
    XLSX.writeFile(wb, `Ready_To_Dispatch_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <h1 className="page-title mb-1 d-flex align-items-center gap-2">
            <i className="bi bi-box-seam-fill text-primary" />
            Ready to Dispatch Material
          </h1>
          <p className="page-subtitle text-muted mb-0">
            Daily ready-to-dispatch sheets, boxes, produced quantities, and weights
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-success btn-sm shadow-sm"
            onClick={handleExportList}
          >
            <i className="bi bi-file-earmark-excel me-1" /> Export Excel
          </button>
          <Link to="/ready-to-dispatch/add" className="btn btn-primary btn-sm shadow-sm">
            <i className="bi bi-plus-lg me-1" /> New Ready to Dispatch
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
      <div className="card border-0 shadow-sm rounded-3 mb-4 bg-white">
        <div className="card-body p-3">
          <form onSubmit={handleSearch} className="row g-2 align-items-center">
            {/* Search */}
            <div className="col-12 col-md-3">
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-light border-end-0">
                  <i className="bi bi-search text-muted" />
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Search title, bottle, shade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Company Filter */}
            <div className="col-12 col-md-2">
              <select
                className="form-select form-select-sm"
                value={selectedCompany}
                onChange={(e) => {
                  setSelectedCompany(e.target.value);
                  setSearchParams({ page: 1 });
                }}
              >
                <option value="">All Companies</option>
                {companies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div className="col-6 col-md-2">
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setSearchParams({ page: 1 });
                }}
                title="From Date"
              />
            </div>

            {/* Date To */}
            <div className="col-6 col-md-2">
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setSearchParams({ page: 1 });
                }}
                title="To Date"
              />
            </div>

            {/* Actions */}
            <div className="col-12 col-md-3 d-flex gap-2">
              <button type="submit" className="btn btn-sm btn-primary flex-grow-1">
                <i className="bi bi-filter me-1" /> Filter
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleReset}
                title="Reset Filters"
              >
                <i className="bi bi-arrow-counterclockwise" /> Reset
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Main Table */}
      <div className="card border-0 shadow-sm rounded-3 bg-white">
        <div className="card-header bg-white p-3 border-bottom d-flex align-items-center justify-content-between">
          <div className="fw-bold text-dark d-flex align-items-center gap-2">
            <span>Dispatch Sheets</span>
            <span className="badge bg-secondary-subtle text-secondary rounded-pill">{total}</span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="text-muted small">Show</span>
            <select
              className="form-select form-select-sm"
              style={{ width: 70 }}
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
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 text-nowrap">
            <thead className="table-light small text-uppercase text-muted">
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th style={{ width: 130 }}>Date</th>
                <th>Sheet Title / Remarks</th>
                <th style={{ width: 140 }}>Company</th>
                <th style={{ width: 140 }}>Plain Bottles</th>
                <th className="text-center" style={{ width: 110 }}>
                  Total Boxes
                </th>
                <th className="text-center" style={{ width: 120 }}>
                  Produced Qty
                </th>
                <th className="text-end" style={{ width: 130 }}>
                  Total Weight (kg)
                </th>
                <th className="text-end" style={{ width: 130 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="text-center py-5">
                    <div className="spinner-border spinner-border-sm text-primary me-2" role="status" />
                    <span className="text-muted">Loading records...</span>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-5 text-muted">
                    <i className="bi bi-inbox fs-2 d-block mb-2 text-secondary" />
                    No Ready to Dispatch sheets found.
                  </td>
                </tr>
              ) : (
                data.map((item, index) => {
                  const dateStr = item.dispatchDate
                    ? new Date(item.dispatchDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '-';

                  const bottleCount = (item.groups || []).length;
                  const variantCount = (item.groups || []).reduce(
                    (acc, g) => acc + (g.variantLines || []).length,
                    0
                  );

                  return (
                    <tr key={item._id}>
                      <td className="text-muted small">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td className="fw-semibold text-dark">
                        <i className="bi bi-calendar3 me-1 text-muted" />
                        {dateStr}
                      </td>
                      <td>
                        <div className="fw-bold text-dark">{item.sheetTitle || 'Ready to Dispatch'}</div>
                        {item.remarks && (
                          <div className="text-muted small text-truncate" style={{ maxWidth: 260 }}>
                            {item.remarks}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1">
                          {item.companyId?.name || 'TPP'}
                        </span>
                      </td>
                      <td>
                        <div className="small">
                          <span className="fw-bold text-dark">{bottleCount}</span> Plain Bottle
                          {bottleCount !== 1 ? 's' : ''}
                        </div>
                        <div className="text-muted small">{variantCount} variant lines</div>
                      </td>
                      <td className="text-center">
                        <span className="badge bg-light text-dark border px-2 py-1 fw-bold fs-7">
                          {(item.summary?.totalBoxes || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className="fw-semibold text-primary">
                          {(item.summary?.totalProducedQty || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="text-end fw-bold text-dark">
                        {(item.summary?.totalWeight || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 3,
                        })}
                      </td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          <Link
                            to={`/ready-to-dispatch/view/${item._id}`}
                            className="btn btn-outline-primary"
                            title="View Spreadsheet Style Sheet"
                          >
                            <i className="bi bi-eye" />
                          </Link>
                          <Link
                            to={`/ready-to-dispatch/edit/${item._id}`}
                            className="btn btn-outline-secondary"
                            title="Edit Sheet"
                          >
                            <i className="bi bi-pencil" />
                          </Link>
                          <button
                            type="button"
                            className="btn btn-outline-danger"
                            onClick={() => handleDelete(item._id, item.sheetTitle)}
                            title="Delete Sheet"
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
