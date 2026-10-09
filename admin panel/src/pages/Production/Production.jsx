import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchVariants } from '../../redux/slices/variantSlice';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

export default function Production() {
  const dispatch = useDispatch();
  const { variants, loading } = useSelector((state) => state.variants);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    dispatch(fetchVariants());
  }, [dispatch]);

  // Filter by search
  const filteredVariants = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return variants;
    return variants.filter(v => {
      return (
        (v.bottleSpecId?.brandId?.name || '').toLowerCase().includes(s) ||
        (v.bottleSpecId?.printingTypeId?.name || '').toLowerCase().includes(s) ||
        (v.bottleSpecId?.printingColorId?.name || '').toLowerCase().includes(s) ||
        (v.bottleSpecId?.bottlePerBox || '').toLowerCase().includes(s) ||
        (v.bottleSpecId?.code || '').toLowerCase().includes(s) ||
        (v.productName || '').toLowerCase().includes(s) ||
        (v.variantName || '').toLowerCase().includes(s) ||
        (v.variantSize || '').toLowerCase().includes(s) ||
        (v.coatingShade || '').toLowerCase().includes(s)
      );
    });
  }, [variants, search]);

  // Deduplicate by all 9 fields combined
  const uniqueVariants = useMemo(() => {
    const seen = new Set();
    return filteredVariants.filter(v => {
      const key = [
        v.bottleSpecId?.brandId?.name,
        v.bottleSpecId?.printingTypeId?.name,
        v.bottleSpecId?.printingColorId?.name,
        v.bottleSpecId?.bottlePerBox,
        v.bottleSpecId?.code,
        v.productName,
        v.variantName,
        v.variantSize,
        v.coatingShade,
      ].join('||');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredVariants]);

  // Reset page on filter/search change
  useEffect(() => { setCurrentPage(1); }, [search, itemsPerPage]);

  const totalPages = Math.ceil(uniqueVariants.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return uniqueVariants.slice(start, start + itemsPerPage);
  }, [uniqueVariants, currentPage, itemsPerPage]);

  // Excel Export
  const handleExport = () => {
    if (uniqueVariants.length === 0) {
      Swal.fire('No Data', 'There is no data to export.', 'info');
      return;
    }
    const data = uniqueVariants.map((v, i) => ({
      'Sr No': i + 1,
      'Brand Name': v.bottleSpecId?.brandId?.name || 'N/A',
      'Bottle Name': v.bottleSpecId?.bottlePerBox || 'N/A',
      'Variant Name': v.variantName || 'N/A',
      'Coating Shade': v.coatingShade || 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    // Auto column widths
    const colWidths = Object.keys(data[0]).map(key => ({
      wch: Math.max(key.length, ...data.map(row => String(row[key]).length)) + 2
    }));
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Production');
    XLSX.writeFile(workbook, 'Production_Master.xlsx');
  };

  const columns = [
    { label: 'Sr No', width: 70 },
    { label: 'Brand Name' },
    { label: 'Printing Type' },
    { label: 'Printing Color' },
    { label: 'Bottle Name' },
    { label: 'Bottle Code' },
    { label: 'Product Name' },
    { label: 'Variant Name' },
    { label: 'Variant Size' },
    { label: 'Coating Shade' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>

      {/* ── Page Header (always visible, not scrollable) ── */}
      <div className="page-header d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="page-title">Production</h1>
          <p className="page-subtitle">Master list of all unique production configurations</p>
        </div>
        <button
          onClick={handleExport}
          className="btn btn-outline-success shadow-sm px-4 py-2 rounded-3"
          style={{ fontWeight: 600, letterSpacing: 0.3 }}
        >
          <i className="bi bi-file-earmark-excel-fill me-2" />
          Export Excel
        </button>
      </div>

      {/* ── Search Bar (always visible) ── */}
      <div className="dash-card mb-3">
        <div className="p-3">
          <div className="position-relative">
            <i
              className="bi bi-search text-muted position-absolute top-50 translate-middle-y"
              style={{ left: 14, pointerEvents: 'none', fontSize: 15 }}
            />
            <input
              type="text"
              className="form-control border-light-subtle bg-light shadow-none"
              placeholder="Search by brand, bottle, variant, color, code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ borderRadius: 10, paddingLeft: 40, paddingTop: 10, paddingBottom: 10 }}
            />
            {search && (
              <button
                className="btn btn-sm position-absolute top-50 translate-middle-y border-0 text-muted p-0"
                style={{ right: 12, background: 'none', fontSize: 18, lineHeight: 1 }}
                onClick={() => setSearch('')}
              >
                <i className="bi bi-x-circle-fill" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Table Card (scrolls independently, topbar stays fixed) ── */}
      <div
        className="dash-card"
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        {/* Card header — show/entries */}
        <div
          className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom bg-white"
          style={{ borderRadius: '16px 16px 0 0', flexShrink: 0 }}
        >
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>Show</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
              value={itemsPerPage}
              onChange={e => setItemsPerPage(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>entries</span>
          </div>
          <span className="text-muted small">
            <b>{uniqueVariants.length}</b> unique record{uniqueVariants.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Scrollable table wrapper ── */}
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <table
            className="data-table"
            style={{ minWidth: 900, tableLayout: 'fixed', width: '100%' }}
          >
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.label}
                    className="text-uppercase small fw-bold text-muted text-start"
                    style={{
                      position: 'sticky',
                      top: 0,
                      background: '#f8fafc',
                      zIndex: 2,
                      whiteSpace: 'nowrap',
                      width: col.width || 'auto',
                      padding: '12px 16px',
                      borderBottom: '2px solid #e2e8f0',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="text-center py-5">
                    <div className="spinner-border spinner-border-sm text-accent me-2" role="status" />
                    <span className="text-muted">Loading...</span>
                  </td>
                </tr>
              )}
              {!loading && paginatedItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-5 text-muted">
                    <i className="bi bi-inbox fs-3 d-block mb-2 opacity-50" />
                    No records found
                  </td>
                </tr>
              )}
              {!loading && paginatedItems.map((v, index) => {
                const srNo = String((currentPage - 1) * itemsPerPage + index + 1).padStart(2, '0');
                return (
                  <tr
                    key={v._id}
                    className="align-middle border-bottom"
                    style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <span className="text-muted fw-bold" style={{ fontSize: 13 }}>{srNo}</span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span className="fw-600" style={{ color: 'var(--accent)', fontSize: 13 }}>
                        {v.bottleSpecId?.brandId?.name || <span className="text-muted">—</span>}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span className="fw-500 text-dark small">
                        {v.bottleSpecId?.printingTypeId?.name || <span className="text-muted">—</span>}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span className="fw-500 text-dark small">
                        {v.bottleSpecId?.printingColorId?.name || <span className="text-muted">—</span>}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span className="fw-500 text-dark small">
                        {v.bottleSpecId?.bottlePerBox || <span className="text-muted">—</span>}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span
                        className="badge fw-normal"
                        style={{
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #e2e8f0',
                          borderRadius: 6,
                          padding: '3px 10px',
                          fontSize: 12,
                        }}
                      >
                        {v.bottleSpecId?.code || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span className="fw-600 text-dark small">
                        {v.productName || <span className="text-muted">—</span>}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span className="fw-500 text-dark small">
                        {v.variantName || <span className="text-muted">—</span>}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span className="fw-bold small" style={{ color: 'var(--accent)' }}>
                        {v.variantSize || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span className="fw-500 text-dark small">
                        {v.coatingShade || <span className="text-muted">—</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination footer (always visible) ── */}
        <div
          className="d-flex align-items-center justify-content-between px-3 py-2 border-top bg-white"
          style={{ borderRadius: '0 0 16px 16px', flexShrink: 0 }}
        >
          <div className="text-muted small fw-500">
            Showing{' '}
            <b>{uniqueVariants.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</b>
            {' '}to{' '}
            <b>{Math.min(currentPage * itemsPerPage, uniqueVariants.length)}</b>
            {' '}of <b>{uniqueVariants.length}</b> entries
          </div>
          <nav>
            <ul className="pagination pagination-sm mb-0 gap-1">
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button
                  className="page-link border-0 bg-light text-muted px-3 rounded-3"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                >
                  Previous
                </button>
              </li>
              {[...Array(totalPages)].map((_, i) => (
                <li key={i} className="page-item">
                  <button
                    className="page-link border-0 px-3 rounded-3"
                    style={{
                      background: currentPage === i + 1 ? 'var(--accent)' : 'transparent',
                      color: currentPage === i + 1 ? '#fff' : 'inherit',
                      fontWeight: currentPage === i + 1 ? 700 : 400,
                    }}
                    onClick={() => setCurrentPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                </li>
              ))}
              <li className={`page-item ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}`}>
                <button
                  className="page-link border-0 bg-light text-muted px-3 rounded-3"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                >
                  Next
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}

