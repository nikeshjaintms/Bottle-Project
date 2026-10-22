import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import Swal from 'sweetalert2';
import api from '../../services/api';
import { useSummaryLanguage } from '../../hooks/useSummaryLanguage';
import './Summary.css';

export default function CompanySummary() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { labels, language, toggleLanguage } = useSummaryLanguage();

  // Company state
  const [company, setCompany] = useState(null);
  const [isShreno, setIsShreno] = useState(false);

  // Bottles state
  const [bottles, setBottles] = useState([]);
  const [selectedBottleId, setSelectedBottleId] = useState('');
  const [hasInitializedBottle, setHasInitializedBottle] = useState(false);

  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  // Overview data
  const [overviewData, setOverviewData] = useState([]);
  const [grandTotals, setGrandTotals] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [sortField, setSortField] = useState('bottleName');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'

  // Bottle Logs Detail data
  const [logsData, setLogsData] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [incomingPage, setIncomingPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [shrenoPage, setShrenoPage] = useState(1);

  // 1. Fetch Bottles for this Company & determine default
  useEffect(() => {
    let isMounted = true;
    const fetchBottles = async () => {
      try {
        const res = await api.get('/summary/bottles', { params: { companyId } });
        if (!isMounted) return;

        const data = res.data?.data;
        const bList = data?.bottles || [];
        setBottles(bList);
        setCompany(data?.company);
        setIsShreno(Boolean(data?.company?.isShreno));

        // Default to most recently saved bottle on first open (as SHRENO Incoming does)
        if (!hasInitializedBottle) {
          const defaultId = data?.mostRecentBottleId || (bList.length > 0 ? bList[0]._id : 'all');
          setSelectedBottleId(defaultId);
          setHasInitializedBottle(true);
        }
      } catch (err) {
        console.error('Failed to load company bottles:', err);
      }
    };

    fetchBottles();
    return () => { isMounted = false; };
  }, [companyId, hasInitializedBottle]);

  // 2. Fetch Overview Data when "all" bottles selected
  useEffect(() => {
    if (selectedBottleId !== 'all') return;

    let isMounted = true;
    const fetchOverview = async () => {
      setOverviewLoading(true);
      try {
        const res = await api.get('/summary/overview', {
          params: {
            companyId,
            fromDate,
            toDate,
            search: searchFilter
          }
        });
        if (isMounted) {
          setOverviewData(res.data?.data?.overview || []);
          setGrandTotals(res.data?.data?.grandTotals || null);
          if (res.data?.data?.company) {
            setCompany(res.data.data.company);
            setIsShreno(Boolean(res.data.data.company.isShreno));
          }
        }
      } catch (err) {
        console.error('Failed to load summary overview:', err);
      } finally {
        if (isMounted) setOverviewLoading(false);
      }
    };

    fetchOverview();
    return () => { isMounted = false; };
  }, [companyId, selectedBottleId, fromDate, toDate, searchFilter]);

  // 3. Fetch Detail Logs when a specific bottle is selected
  useEffect(() => {
    if (!selectedBottleId || selectedBottleId === 'all') return;

    let isMounted = true;
    const fetchLogs = async () => {
      setLogsLoading(true);
      try {
        const res = await api.get('/summary/logs', {
          params: {
            companyId,
            bottleId: selectedBottleId,
            fromDate,
            toDate,
            incomingPage,
            dispatchPage,
            shrenoPage,
            limit: 10
          }
        });
        if (isMounted) {
          setLogsData(res.data?.data || null);
          if (res.data?.data?.company) {
            setCompany(res.data.data.company);
            setIsShreno(Boolean(res.data.data.company.isShreno));
          }
        }
      } catch (err) {
        console.error('Failed to load summary logs:', err);
      } finally {
        if (isMounted) setLogsLoading(false);
      }
    };

    fetchLogs();
    return () => { isMounted = false; };
  }, [companyId, selectedBottleId, fromDate, toDate, incomingPage, dispatchPage, shrenoPage]);

  // Reset pagination when bottle changes
  const handleBottleChange = (newBottleId) => {
    setSelectedBottleId(newBottleId);
    setIncomingPage(1);
    setDispatchPage(1);
    setShrenoPage(1);
  };

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setSearchFilter('');
  };

  // Sorted Overview data
  const sortedOverview = useMemo(() => {
    if (!overviewData || overviewData.length === 0) return [];
    return [...overviewData].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      aVal = Number(aVal) || 0;
      bVal = Number(bVal) || 0;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [overviewData, sortField, sortOrder]);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Helper formatters
  const formatNum = (num) => (Number(num) || 0).toLocaleString('en-IN');
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
    } catch {
      return dateStr;
    }
  };

  const bottleSelectOptions = useMemo(() => {
    return [
      { value: 'all', label: `★ ${labels.allBottles}` },
      ...bottles
        .sort((a, b) => {
          const nameA = (a.bottleName || a.plainBottleName || '').toLowerCase();
          const nameB = (b.bottleName || b.plainBottleName || '').toLowerCase();
          // Natural sort: handle numbers numerically (3 ML before 8 ML before 20 ML)
          return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
        })
        .map((b) => ({
          value: b._id,
          label: b.isUnmatched ? `⚠️ ${b.bottleName} (Unmatched)` : b.bottleName
        }))
    ];
  }, [bottles, labels.allBottles]);

  const selectedBottleObj = bottles.find(b => b._id === selectedBottleId);

  return (
    <div className="page-content summary-container">
      {/* Top Breadcrumb & Header */}
      <div className="summary-header d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div className="d-flex align-items-center gap-3">
          <button
            onClick={() => navigate('/summary')}
            className="btn-ghost border-0"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title={labels.backToCompanies}
            aria-label={labels.backToCompanies}
          >
            <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
          </button>
          <div>
            <div className="d-flex align-items-center gap-2">
              <h1 className="page-title mb-0">{company?.name || 'Company Summary'}</h1>
              {isShreno ? (
                <span className="summary-header-badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">
                  <i className="bi bi-star-fill text-warning" /> {labels.shrenoCompany}
                </span>
              ) : (
                <span className="summary-header-badge bg-primary-subtle text-primary border border-primary-subtle">
                  <i className="bi bi-building" /> {labels.normalCompany}
                </span>
              )}
            </div>
            <div className="summary-subtitle-row mb-0 mt-1">
              {selectedBottleId === 'all' ? (
                <span className="text-muted">{labels.overviewTitle}</span>
              ) : (
                <>
                  <span className="text-muted fw-500">{labels.bottleDetailTitle}:</span>
                  <span className="summary-bottle-highlight">
                    {selectedBottleObj?.bottleName || 'Bottle Log'}
                  </span>
                  {selectedBottleObj?.isUnmatched && (
                    <span className="badge rounded-pill bg-danger-subtle text-danger border border-danger-subtle px-2 py-0.5" style={{ fontSize: '11px', fontWeight: 600 }}>
                      {labels.unmatchedBadge}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Language Toggle */}
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

      {/* Filter Toolbar Card */}
      <div className="summary-filter-card">
        <div className="row g-3 align-items-end">
          {/* Bottle Selector (lists only that company's bottles + All bottles option) */}
          <div className="col-12 col-md-4 col-lg-4">
            <label className="summary-filter-label">
              <i className="bi bi-funnel me-1" /> {labels.bottle}
            </label>
            <Select
              id="bottle-filter-select"
              className="react-select-container"
              classNamePrefix="react-select"
              options={bottleSelectOptions}
              value={bottleSelectOptions.find((o) => o.value === selectedBottleId) || null}
              onChange={(opt) => handleBottleChange(opt ? opt.value : 'all')}
              placeholder={labels.searchBottles}
              isSearchable
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: 38,
                  borderRadius: 10,
                  borderColor: '#cbd5e1',
                  backgroundColor: '#f8fafc',
                  boxShadow: 'none',
                  fontSize: '0.9rem',
                  '&:hover': {
                    borderColor: '#94a3b8'
                  }
                }),
                menu: (base) => ({
                  ...base,
                  zIndex: 9999,
                  borderRadius: 10,
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                }),
                option: (base, state) => ({
                  ...base,
                  backgroundColor: state.isSelected ? '#3b82f6' : state.isFocused ? '#eff6ff' : '#ffffff',
                  color: state.isSelected ? '#ffffff' : '#1e293b',
                  fontSize: '0.875rem',
                  fontWeight: state.isSelected ? 600 : 400,
                  padding: '8px 12px',
                  cursor: 'pointer'
                })
              }}
            />
          </div>

          {/* Date Range: From */}
          <div className="col-6 col-md-2 col-lg-2">
            <label className="summary-filter-label">{labels.fromDate}</label>
            <input
              type="date"
              className="form-control summary-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          {/* Date Range: To */}
          <div className="col-6 col-md-2 col-lg-2">
            <label className="summary-filter-label">{labels.toDate}</label>
            <input
              type="date"
              className="form-control summary-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          {/* Search Box */}
          <div className="col-8 col-md-3 col-lg-3">
            <label className="summary-filter-label">
              <i className="bi bi-search me-1" /> Search
            </label>
            <input
              type="text"
              className="form-control summary-input"
              placeholder={selectedBottleId === 'all' ? labels.searchBottles : labels.searchRecords}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>

          {/* Reset Action */}
          <div className="col-4 col-md-1 col-lg-1 d-flex">
            <button
              className="btn btn-light border summary-input w-100 d-flex align-items-center justify-content-center"
              onClick={handleResetFilters}
              title={labels.reset}
            >
              <i className="bi bi-arrow-counterclockwise fs-6" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: OVERVIEW (ALL BOTTLES)                                             */}
      {/* ========================================================================= */}
      {selectedBottleId === 'all' ? (
        <div className="overview-card">
          <div className="p-3 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2 bg-light">
            <div className="fw-bold fs-6 text-dark">
              <i className="bi bi-table me-2 text-primary" />
              {labels.overviewTitle} ({sortedOverview.length} {labels.records})
            </div>
            <div className="text-muted small">
              Click any bottle row to inspect its side-by-side ledger
            </div>
          </div>

          <div className="overview-table-wrapper">
            <table className="overview-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('bottleName')} style={{ minWidth: 220 }}>
                    {labels.ovBottle}{' '}
                    {sortField === 'bottleName' && (
                      <i className={`bi bi-arrow-${sortOrder === 'asc' ? 'up' : 'down'} text-primary`} />
                    )}
                  </th>
                  <th onClick={() => toggleSort('incomingTotal')} className="num-col table-col-incoming">
                    {labels.ovIncoming}{' '}
                    {sortField === 'incomingTotal' && (
                      <i className={`bi bi-arrow-${sortOrder === 'asc' ? 'up' : 'down'}`} />
                    )}
                  </th>
                  <th onClick={() => toggleSort('dispatchTotal')} className="num-col table-col-dispatch">
                    {labels.ovDispatch}{' '}
                    {sortField === 'dispatchTotal' && (
                      <i className={`bi bi-arrow-${sortOrder === 'asc' ? 'up' : 'down'}`} />
                    )}
                  </th>
                  <th onClick={() => toggleSort('difference')} className="num-col">
                    {labels.ovDifference} (Inc − Disp){' '}
                    {sortField === 'difference' && (
                      <i className={`bi bi-arrow-${sortOrder === 'asc' ? 'up' : 'down'}`} />
                    )}
                  </th>
                  {isShreno && (
                    <th onClick={() => toggleSort('shrenoIncomingTotal')} className="num-col table-col-shreno">
                      {labels.ovShreno}{' '}
                      {sortField === 'shrenoIncomingTotal' && (
                        <i className={`bi bi-arrow-${sortOrder === 'asc' ? 'up' : 'down'}`} />
                      )}
                    </th>
                  )}
                  {isShreno && (
                    <th onClick={() => toggleSort('shrenoDifference')} className="num-col">
                      PM Diff (PM − Disp){' '}
                      {sortField === 'shrenoDifference' && (
                        <i className={`bi bi-arrow-${sortOrder === 'asc' ? 'up' : 'down'}`} />
                      )}
                    </th>
                  )}
                  <th className="text-center" style={{ width: 100 }}>
                    {labels.ovAction}
                  </th>
                </tr>
              </thead>
              <tbody>
                {overviewLoading ? (
                  <tr>
                    <td colSpan={isShreno ? 7 : 5} className="py-5 text-center text-muted">
                      <div className="spinner-border text-primary mb-2" />
                      <div>{labels.loading}</div>
                    </td>
                  </tr>
                ) : sortedOverview.length === 0 ? (
                  <tr>
                    <td colSpan={isShreno ? 7 : 5} className="py-5 text-center text-muted">
                      {labels.noRecords}
                    </td>
                  </tr>
                ) : (
                  sortedOverview.map((row) => (
                    <tr
                      key={row.bottleId}
                      onClick={() => handleBottleChange(row.bottleId)}
                      title="Click to view side-by-side bottle details"
                    >
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-semibold text-dark">{row.bottleName}</span>
                          {row.isUnmatched && (
                            <span className="badge-unmatched" title={labels.unmatchedTooltip}>
                              <i className="bi bi-exclamation-triangle-fill" /> {labels.unmatchedBadge}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num-col table-col-incoming fw-bold text-success">
                        {formatNum(row.incomingTotal)}
                      </td>
                      <td className="num-col table-col-dispatch fw-bold text-indigo">
                        {formatNum(row.dispatchTotal)}
                      </td>
                      <td
                        className={`num-col fw-bold ${row.difference < 0 ? 'text-danger' : 'text-primary'
                          }`}
                      >
                        {formatNum(row.difference)}
                      </td>
                      {isShreno && (
                        <td className="num-col table-col-shreno fw-bold text-amber">
                          {formatNum(row.shrenoIncomingTotal)}
                        </td>
                      )}
                      {isShreno && (
                        <td
                          className={`num-col fw-bold ${row.shrenoDifference < 0 ? 'text-danger' : 'text-dark'
                            }`}
                        >
                          {formatNum(row.shrenoDifference)}
                        </td>
                      )}
                      <td className="text-center">
                        <button
                          className="btn btn-sm btn-outline-primary rounded-pill px-3 py-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBottleChange(row.bottleId);
                          }}
                        >
                          <i className="bi bi-eye" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {grandTotals && sortedOverview.length > 0 && (
                <tfoot>
                  <tr>
                    <td>{labels.grandTotal} ({grandTotals.bottleCount} Bottles)</td>
                    <td className="num-col table-col-incoming">
                      {formatNum(grandTotals.incomingTotal)}
                    </td>
                    <td className="num-col table-col-dispatch">
                      {formatNum(grandTotals.dispatchTotal)}
                    </td>
                    <td
                      className={`num-col ${grandTotals.difference < 0 ? 'text-danger' : 'text-primary'
                        }`}
                    >
                      {formatNum(grandTotals.difference)}
                    </td>
                    {isShreno && (
                      <td className="num-col table-col-shreno">
                        {formatNum(grandTotals.shrenoIncomingTotal)}
                      </td>
                    )}
                    {isShreno && (
                      <td
                        className={`num-col ${grandTotals.shrenoDifference < 0 ? 'text-danger' : 'text-dark'
                          }`}
                      >
                        {formatNum(grandTotals.shrenoDifference)}
                      </td>
                    )}
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* VIEW 2: BOTTLE DETAIL (SIDE-BY-SIDE EXCEL BLOCKS)                         */
        /* ========================================================================= */
        <div>
          {/* KPI Strip */}
          <div className="summary-kpi-strip">
            {/* Total Incoming */}
            <div className="summary-kpi-card theme-incoming">
              <div className="kpi-title">{labels.totalIncoming}</div>
              <div className="kpi-val">
                {formatNum(logsData?.kpis?.incomingTotal || 0)}
              </div>
              <div className="kpi-subtext">
                {formatNum(logsData?.kpis?.incomingBoxes || 0)} {labels.boxes} (
                {formatNum(logsData?.incoming?.total || 0)} {labels.records})
              </div>
            </div>

            {/* Total Dispatch */}
            <div className="summary-kpi-card theme-dispatch">
              <div className="kpi-title">{labels.totalDispatch}</div>
              <div className="kpi-val">
                {formatNum(logsData?.kpis?.dispatchTotal || 0)}
              </div>
              <div className="kpi-subtext">
                {formatNum(logsData?.kpis?.dispatchBoxes || 0)} {labels.boxes} (
                {formatNum(logsData?.dispatch?.total || 0)} {labels.records})
              </div>
            </div>

            {/* Net Stock Balance: Incoming − Dispatch */}
            <div
              className={`summary-kpi-card theme-difference ${(logsData?.kpis?.netDifference || 0) < 0 ? 'negative' : ''
                }`}
            >
              <div className="kpi-title">
                {language === 'gu'
                  ? logsData?.kpis?.differenceLabelGu || labels.netDifference
                  : logsData?.kpis?.differenceLabel || labels.netDifference}
              </div>
              <div className="kpi-val">
                {formatNum(logsData?.kpis?.netDifference || 0)}
              </div>
              <div className="kpi-subtext">
                {formatNum(logsData?.kpis?.incomingBoxes || 0) -
                  formatNum(logsData?.kpis?.dispatchBoxes || 0)}{' '}
                {labels.boxes} net
              </div>
            </div>

            {/* If SHRENO: Packing Material Total */}
            {isShreno && (
              <div className="summary-kpi-card theme-shreno">
                <div className="kpi-title">{labels.totalPackingMaterial}</div>
                <div className="kpi-val">
                  {formatNum(logsData?.kpis?.shrenoIncomingTotal || 0)}
                </div>
                <div className="kpi-subtext">
                  {formatNum(logsData?.shrenoIncoming?.total || 0)} {labels.records}
                </div>
              </div>
            )}
          </div>

          {/* Side by Side Blocks Grid */}
          <div
            className={`summary-blocks-grid ${isShreno ? 'three-blocks' : 'two-blocks'
              }`}
          >
            {/* ------------------------------------------------------------- */}
            {/* 1ST: Incoming (sr no, po date, po no, po qty, date, challan no, no of box, qty, total) */}
            {/* ------------------------------------------------------------- */}
            <div className="summary-block-card">
              <div className="block-header incoming-header">
                <h3 className="block-header-title">
                  <i className="bi bi-box-arrow-in-down" />
                  <span>{labels.blockIncoming}</span>
                </h3>
                <span className="block-header-pill">
                  {formatNum(logsData?.incoming?.totals?.totalQty || 0)} {labels.pcs}
                </span>
              </div>

              <div className="summary-table-scroll">
                <table className="summary-table">
                  <thead>
                    <tr>
                      <th style={{ width: 45 }} className="fw-bold">{labels.incSr}</th>
                      {isShreno && (
                        <>
                          <th className="fw-bold">{labels.incPoDate}</th>
                          <th className="fw-bold">{labels.incPoNo}</th>
                          <th className="num-col fw-bold">{labels.incPoQty}</th>
                        </>
                      )}
                      <th className="fw-bold">{labels.incDate}</th>
                      <th className="fw-bold">{labels.incChallanNo}</th>
                      <th className="num-col fw-bold">{labels.incBox}</th>
                      <th className="num-col fw-bold">{labels.incQty}</th>
                      <th className="num-col fw-bold">{labels.incTotal}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsLoading ? (
                      <tr>
                        <td colSpan={isShreno ? 9 : 6} className="py-5 text-center text-muted">
                          <div className="spinner-border text-success mb-2" />
                          <div>{labels.loading}</div>
                        </td>
                      </tr>
                    ) : logsData?.incoming?.data?.length === 0 ? (
                      <tr>
                        <td colSpan={isShreno ? 9 : 6} className="p-0">
                          <div className="summary-empty-state">
                            <i className="bi bi-inbox text-success" />
                            <div>{labels.noIncomingRecords}</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      logsData?.incoming?.data?.map((row, idx) => (
                        <tr key={row._id}>
                          <td className="text-muted fw-semibold">
                            {(logsData.incoming.page - 1) * logsData.incoming.limit + idx + 1}
                          </td>
                          {isShreno && (
                            <>
                              <td>{formatDate(row.poDate)}</td>
                              <td className="text-muted">{row.poNo}</td>
                              <td className="num-col">{row.poOrderQty ? formatNum(row.poOrderQty) : '-'}</td>
                            </>
                          )}
                          <td>{formatDate(row.date)}</td>
                          <td className="fw-bold text-dark">{row.challanNo}</td>
                          <td className="num-col">{formatNum(row.box)}</td>
                          <td className="num-col text-muted">{formatNum(row.qty)}</td>
                          <td className="num-col bold-num text-success">
                            {formatNum(row.totalQty)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={isShreno ? 6 : 3}>TOTAL</td>
                      <td className="num-col bold-num">
                        {formatNum(logsData?.incoming?.totals?.totalBoxes || 0)}
                      </td>
                      <td />
                      <td className="num-col bold-num text-success">
                        {formatNum(logsData?.incoming?.totals?.totalQty || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Incoming Block Pagination */}
              {logsData?.incoming?.totalPages > 1 && (
                <div className="p-2 border-top bg-light d-flex align-items-center justify-content-between small text-muted">
                  <span>
                    Page {logsData.incoming.page} of {logsData.incoming.totalPages}
                  </span>
                  <div className="d-flex gap-1">
                    <button
                      className="btn btn-sm btn-light border py-0 px-2"
                      disabled={logsData.incoming.page <= 1}
                      onClick={() => setIncomingPage(p => p - 1)}
                    >
                      Prev
                    </button>
                    <button
                      className="btn btn-sm btn-light border py-0 px-2"
                      disabled={logsData.incoming.page >= logsData.incoming.totalPages}
                      onClick={() => setIncomingPage(p => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 2ND: Dispatch (Date, D C NO, Product name, Box, Qty, Dispatch Qty) */}
            {/* ------------------------------------------------------------- */}
            <div className="summary-block-card">
              <div className="block-header dispatch-header">
                <h3 className="block-header-title">
                  <i className="bi bi-truck" />
                  <span>{labels.blockDispatch}</span>
                </h3>
                <span className="block-header-pill">
                  {formatNum(logsData?.dispatch?.totals?.totalQty || 0)} {labels.pcs}
                </span>
              </div>

              <div className="summary-table-scroll">
                <table className="summary-table">
                  <thead>
                    <tr>
                      <th style={{ width: 45 }} className="fw-bold">Sr No</th>
                      <th className="fw-bold">{labels.dispDate}</th>
                      <th className="fw-bold">G.PASS NO</th>
                      {isShreno ? (
                        <th className="fw-bold">PRODUCT NAME</th>
                      ) : (
                        <>
                          <th colSpan={2} style={{ textAlign: 'center' }} className="fw-bold">PRODUCT NAME</th>
                          <th className="fw-bold">TEXT COLOR</th>
                        </>
                      )}
                      <th className="num-col fw-bold">{labels.dispBox}</th>
                      <th className="num-col fw-bold">{labels.dispQty}</th>
                      <th className="num-col fw-bold">{labels.dispDispatchQty}</th>
                      <th className="fw-bold">REMARK</th>
                    </tr>
                    {!isShreno && (
                      <tr style={{ fontSize: '12px', fontWeight: 'normal', backgroundColor: '#f8f9fa' }}>
                        <th></th>
                        <th colSpan={2}></th>
                        <th style={{ textAlign: 'center' }} className="fw-bold">COATING</th>
                        <th style={{ textAlign: 'center' }} className="fw-bold">PRINTING</th>
                        <th colSpan={5}></th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {logsLoading ? (
                      <tr>
                        <td colSpan={isShreno ? 8 : 10} className="py-5 text-center text-muted">
                          <div className="spinner-border text-indigo mb-2" />
                          <div>{labels.loading}</div>
                        </td>
                      </tr>
                    ) : logsData?.dispatch?.data?.length === 0 ? (
                      <tr>
                        <td colSpan={isShreno ? 8 : 10} className="p-0">
                          <div className="summary-empty-state">
                            <i className="bi bi-truck text-indigo" />
                            <div>{labels.noDispatchRecords}</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      logsData?.dispatch?.data?.map((row, idx) => (
                        <tr key={row._id}>
                          <td className="text-muted fw-semibold" style={{ width: 45 }}>
                            {(logsData.dispatch.page - 1) * logsData.dispatch.limit + idx + 1}
                          </td>
                          <td>{formatDate(row.date || row.dispatchDate)}</td>
                          <td className="fw-bold text-dark">{row.gatePassNo || row.dcNo || '-'}</td>
                          {isShreno ? (
                            <td style={{ textAlign: 'center', minWidth: '120px' }}>
                              {row.coating || '-'} - {row.printing || '-'} - {row.detectedTextColor || '-'}
                            </td>
                          ) : (
                            <>
                              <td style={{ textAlign: 'center', minWidth: '120px' }}>{row.coating || '-'}</td>
                              <td style={{ textAlign: 'center', minWidth: '120px' }}>{row.printing || '-'}</td>
                              <td style={{ textAlign: 'center', minWidth: '120px' }}>{row.detectedTextColor || '-'}</td>
                            </>
                          )}
                          <td className="num-col">{formatNum(row.box || 0)}</td>
                          <td className="num-col text-muted">{formatNum(row.qty || 0)}</td>
                          <td className="num-col bold-num text-indigo">
                            {formatNum(row.totalQty || 0)}
                          </td>
                          <td>
                            <span
                              className="badge bg-light text-dark cursor-pointer"
                              style={{ cursor: 'pointer', padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => {
                                Swal.fire({
                                  title: 'Enter Remark',
                                  input: 'textarea',
                                  inputValue: row.remarks && row.remarks !== '-' ? row.remarks : '',
                                  inputPlaceholder: 'Type your remark here...',
                                  showCancelButton: true,
                                  confirmButtonText: 'Save',
                                  confirmButtonColor: '#0d6efd',
                                  cancelButtonColor: '#6c757d',
                                  inputAttributes: {
                                    'aria-label': 'Enter remark'
                                  }
                                }).then((result) => {
                                  if (result.isConfirmed && result.value) {
                                    console.log('Update remark for', row.docId, ':', result.value);
                                    // TODO: Implement API call to update dispatch remarks
                                    Swal.fire('Success!', 'Remark saved.', 'success');
                                  }
                                });
                              }}
                              title={row.remarks && row.remarks !== '-' ? row.remarks : 'Click to add remark'}
                            >
                              {row.remarks && row.remarks !== '-' ? `📝 ${row.remarks.substring(0, 15)}...` : '+ Add'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={isShreno ? 4 : 6}>TOTAL</td>
                      <td className="num-col bold-num">
                        {formatNum(logsData?.dispatch?.totals?.totalBoxes || 0)}
                      </td>
                      <td />
                      <td className="num-col bold-num text-indigo">
                        {formatNum(logsData?.dispatch?.totals?.totalQty || 0)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Dispatch Block Pagination */}
              {logsData?.dispatch?.totalPages > 1 && (
                <div className="p-2 border-top bg-light d-flex align-items-center justify-content-between small text-muted">
                  <span>
                    Page {logsData.dispatch.page} of {logsData.dispatch.totalPages}
                  </span>
                  <div className="d-flex gap-1">
                    <button
                      className="btn btn-sm btn-light border py-0 px-2"
                      disabled={logsData.dispatch.page <= 1}
                      onClick={() => setDispatchPage(p => p - 1)}
                    >
                      Prev
                    </button>
                    <button
                      className="btn btn-sm btn-light border py-0 px-2"
                      disabled={logsData.dispatch.page >= logsData.dispatch.totalPages}
                      onClick={() => setDispatchPage(p => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 3RD: Packing Material (item type, configurations, Qty)       */}
            {/* ------------------------------------------------------------- */}
            {isShreno && (
              <div className="summary-block-card">
                <div className="block-header shreno-header">
                  <h3 className="block-header-title">
                    <i className="bi bi-box-seam" />
                    <span>{labels.blockPackingMaterial}</span>
                  </h3>
                  <span className="block-header-pill">
                    {formatNum(logsData?.shrenoIncoming?.totals?.totalQty || 0)} {labels.pcs}
                  </span>
                </div>

                <div className="summary-table-scroll">
                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th className="fw-bold">{labels.pmDate || 'DATE'}</th>
                        <th className="fw-bold">{labels.pmItemType}</th>
                        <th className="fw-bold">{labels.pmConfig}</th>
                        <th className="num-col fw-bold">{labels.pmQty}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logsLoading ? (
                        <tr>
                          <td colSpan={4} className="py-5 text-center text-muted">
                            <div className="spinner-border text-warning mb-2" />
                            <div>{labels.loading}</div>
                          </td>
                        </tr>
                      ) : logsData?.shrenoIncoming?.data?.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-0">
                            <div className="summary-empty-state">
                              <i className="bi bi-box-seam text-warning" />
                              <div>{labels.noPackingMaterialRecords}</div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        logsData?.shrenoIncoming?.data?.map((row) => (
                          <tr key={row._id}>
                            <td>{formatDate(row.date)}</td>
                            <td>{row.itemType}</td>
                            <td>{row.configuration}</td>
                            <td className="num-col bold-num text-warning-emphasis">
                              {formatNum(row.quantity)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>TOTAL</td>
                        <td className="num-col bold-num text-warning-emphasis">
                          {formatNum(logsData?.shrenoIncoming?.totals?.totalQty || 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Packing Material Block Pagination */}
                {logsData?.shrenoIncoming?.totalPages > 1 && (
                  <div className="p-2 border-top bg-light d-flex align-items-center justify-content-between small text-muted">
                    <span>
                      Page {logsData.shrenoIncoming.page} of {logsData.shrenoIncoming.totalPages}
                    </span>
                    <div className="d-flex gap-1">
                      <button
                        className="btn btn-sm btn-light border py-0 px-2"
                        disabled={logsData.shrenoIncoming.page <= 1}
                        onClick={() => setShrenoPage(p => p - 1)}
                      >
                        Prev
                      </button>
                      <button
                        className="btn btn-sm btn-light border py-0 px-2"
                        disabled={logsData.shrenoIncoming.page >= logsData.shrenoIncoming.totalPages}
                        onClick={() => setShrenoPage(p => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
