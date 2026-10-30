import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import Swal from 'sweetalert2';
import api from '../../services/api';
import { useSummaryLanguage } from '../../hooks/useSummaryLanguage';

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
  const [sortOrder, setSortOrder] = useState('asc');

  // Infinite scroll state for Incoming
  const [incomingItems, setIncomingItems] = useState([]);
  const [incomingTotals, setIncomingTotals] = useState(null);
  const [incomingCursor, setIncomingCursor] = useState(null);
  const [incomingHasMore, setIncomingHasMore] = useState(true);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [incomingError, setIncomingError] = useState(null);
  const incomingAbortControllerRef = useRef(null);
  const incomingRequestIdRef = useRef(0);
  const incomingLoadedIdsRef = useRef(new Set());

  // Infinite scroll state for Dispatch
  const [dispatchItems, setDispatchItems] = useState([]);
  const [dispatchTotals, setDispatchTotals] = useState(null);
  const [dispatchCursor, setDispatchCursor] = useState(null);
  const [dispatchHasMore, setDispatchHasMore] = useState(true);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState(null);
  const dispatchAbortControllerRef = useRef(null);
  const dispatchRequestIdRef = useRef(0);
  const dispatchLoadedIdsRef = useRef(new Set());

  // Infinite scroll state for Packing Material (SHRENO only)
  const [packingItems, setPackingItems] = useState([]);
  const [packingTotals, setPackingTotals] = useState(null);
  const [packingCursor, setPackingCursor] = useState(null);
  const [packingHasMore, setPackingHasMore] = useState(true);
  const [packingLoading, setPackingLoading] = useState(false);
  const [packingError, setPackingError] = useState(null);
  const packingAbortControllerRef = useRef(null);
  const packingRequestIdRef = useRef(0);
  const packingLoadedIdsRef = useRef(new Set());

  // IntersectionObserver sentinels
  const incomingSentinelRef = useRef(null);
  const dispatchSentinelRef = useRef(null);
  const packingSentinelRef = useRef(null);

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

  // ========== Infinite Scroll Helpers ==========

  const fetchTotals = useCallback(async (section) => {
    try {
      let url = '';
      if (section === 'incoming') {
        url = '/summary/incoming-totals';
      } else if (section === 'dispatch') {
        url = '/summary/dispatch-totals';
      } else if (section === 'packing') {
        url = '/summary/shreno-incoming-totals';
      }

      if (!url) return null;

      const params = {
        fromDate,
        toDate,
        search: searchFilter
      };

      if (section !== 'packing') {
        params.companyId = companyId;
      }

      const res = await api.get(url, { params });
      return res.data?.data || null;
    } catch (err) {
      console.error(`Failed to fetch ${section} totals:`, err);
      return null;
    }
  }, [companyId, fromDate, toDate, searchFilter]);

  const fetchPaginatedItems = useCallback(async (section, cursor, requestId) => {
    try {
      let url = '';
      if (section === 'incoming') {
        url = '/summary/incoming-paginated';
      } else if (section === 'dispatch') {
        url = '/summary/dispatch-paginated';
      } else if (section === 'packing') {
        url = '/summary/shreno-incoming-paginated';
      }

      if (!url) return null;

      const params = {
        limit: 20,
        fromDate,
        toDate,
        search: searchFilter
      };

      if (section !== 'packing') {
        params.companyId = companyId;
      }

      if (cursor) {
        params.cursor = cursor;
      }

      const abortController = section === 'incoming' 
        ? incomingAbortControllerRef.current 
        : section === 'dispatch' 
        ? dispatchAbortControllerRef.current 
        : packingAbortControllerRef.current;

      const res = await api.get(url, {
        params,
        signal: abortController?.signal
      });

      // Check if this is a stale response
      const currentRequestId = section === 'incoming' 
        ? incomingRequestIdRef.current 
        : section === 'dispatch' 
        ? dispatchRequestIdRef.current 
        : packingRequestIdRef.current;

      if (requestId !== currentRequestId) {
        return null;
      }

      return {
        items: res.data?.data?.items || [],
        nextCursor: res.data?.data?.nextCursor || null,
        hasMore: res.data?.data?.hasMore || false
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return null;
      }
      console.error(`Failed to fetch ${section} items:`, err);
      throw err;
    }
  }, [companyId, fromDate, toDate, searchFilter]);

  const loadSectionStart = useCallback(async (section) => {
    if (section === 'incoming') {
      if (incomingAbortControllerRef.current) {
        incomingAbortControllerRef.current.abort();
      }
      incomingAbortControllerRef.current = new AbortController();
      incomingRequestIdRef.current += 1;
      const requestId = incomingRequestIdRef.current;

      setIncomingLoading(true);
      setIncomingError(null);
      setIncomingItems([]);
      setIncomingCursor(null);
      setIncomingHasMore(true);
      incomingLoadedIdsRef.current = new Set();

      try {
        const [totals, pageData] = await Promise.all([
          fetchTotals('incoming'),
          fetchPaginatedItems('incoming', null, requestId)
        ]);

        if (requestId === incomingRequestIdRef.current && pageData) {
          setIncomingTotals(totals);
          setIncomingItems(pageData.items);
          setIncomingCursor(pageData.nextCursor);
          setIncomingHasMore(pageData.hasMore);
          pageData.items.forEach(item => incomingLoadedIdsRef.current.add(item._id));
        }
      } catch (err) {
        if (requestId === incomingRequestIdRef.current) {
          setIncomingError(err.message);
        }
      } finally {
        if (requestId === incomingRequestIdRef.current) {
          setIncomingLoading(false);
        }
      }
    } else if (section === 'dispatch') {
      if (dispatchAbortControllerRef.current) {
        dispatchAbortControllerRef.current.abort();
      }
      dispatchAbortControllerRef.current = new AbortController();
      dispatchRequestIdRef.current += 1;
      const requestId = dispatchRequestIdRef.current;

      setDispatchLoading(true);
      setDispatchError(null);
      setDispatchItems([]);
      setDispatchCursor(null);
      setDispatchHasMore(true);
      dispatchLoadedIdsRef.current = new Set();

      try {
        const [totals, pageData] = await Promise.all([
          fetchTotals('dispatch'),
          fetchPaginatedItems('dispatch', null, requestId)
        ]);

        if (requestId === dispatchRequestIdRef.current && pageData) {
          setDispatchTotals(totals);
          setDispatchItems(pageData.items);
          setDispatchCursor(pageData.nextCursor);
          setDispatchHasMore(pageData.hasMore);
          pageData.items.forEach(item => dispatchLoadedIdsRef.current.add(item._id));
        }
      } catch (err) {
        if (requestId === dispatchRequestIdRef.current) {
          setDispatchError(err.message);
        }
      } finally {
        if (requestId === dispatchRequestIdRef.current) {
          setDispatchLoading(false);
        }
      }
    } else if (section === 'packing') {
      if (packingAbortControllerRef.current) {
        packingAbortControllerRef.current.abort();
      }
      packingAbortControllerRef.current = new AbortController();
      packingRequestIdRef.current += 1;
      const requestId = packingRequestIdRef.current;

      setPackingLoading(true);
      setPackingError(null);
      setPackingItems([]);
      setPackingCursor(null);
      setPackingHasMore(true);
      packingLoadedIdsRef.current = new Set();

      try {
        const [totals, pageData] = await Promise.all([
          fetchTotals('packing'),
          fetchPaginatedItems('packing', null, requestId)
        ]);

        if (requestId === packingRequestIdRef.current && pageData) {
          setPackingTotals(totals);
          setPackingItems(pageData.items);
          setPackingCursor(pageData.nextCursor);
          setPackingHasMore(pageData.hasMore);
          pageData.items.forEach(item => packingLoadedIdsRef.current.add(item._id));
        }
      } catch (err) {
        if (requestId === packingRequestIdRef.current) {
          setPackingError(err.message);
        }
      } finally {
        if (requestId === packingRequestIdRef.current) {
          setPackingLoading(false);
        }
      }
    }
  }, [fetchTotals, fetchPaginatedItems]);

  const loadNextPage = useCallback(async (section) => {
    const isIncoming = section === 'incoming';
    const isDispatch = section === 'dispatch';
    const isPacking = section === 'packing';

    const loading = isIncoming ? incomingLoading : isDispatch ? dispatchLoading : packingLoading;
    const hasMore = isIncoming ? incomingHasMore : isDispatch ? dispatchHasMore : packingHasMore;
    const cursor = isIncoming ? incomingCursor : isDispatch ? dispatchCursor : packingCursor;
    const requestIdRef = isIncoming ? incomingRequestIdRef : isDispatch ? dispatchRequestIdRef : packingRequestIdRef;

    if (loading || !hasMore || !cursor) return;

    const requestId = requestIdRef.current;

    const setLoadingState = isIncoming ? setIncomingLoading : isDispatch ? setDispatchLoading : setPackingLoading;
    const setItemsState = isIncoming ? setIncomingItems : isDispatch ? setDispatchItems : setPackingItems;
    const setCursorState = isIncoming ? setIncomingCursor : isDispatch ? setDispatchCursor : setPackingCursor;
    const setHasMoreState = isIncoming ? setIncomingHasMore : isDispatch ? setDispatchHasMore : setPackingHasMore;
    const loadedIdsRef = isIncoming ? incomingLoadedIdsRef : isDispatch ? dispatchLoadedIdsRef : packingLoadedIdsRef;
    const setErrorState = isIncoming ? setIncomingError : isDispatch ? setDispatchError : setPackingError;

    setLoadingState(true);

    try {
      const pageData = await fetchPaginatedItems(section, cursor, requestId);

      if (requestId === requestIdRef.current && pageData) {
        const newItems = pageData.items.filter(item => !loadedIdsRef.current.has(item._id));
        pageData.items.forEach(item => loadedIdsRef.current.add(item._id));

        setItemsState(prev => [...prev, ...newItems]);
        setCursorState(pageData.nextCursor);
        setHasMoreState(pageData.hasMore);
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setErrorState(err.message);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingState(false);
      }
    }
  }, [fetchPaginatedItems, incomingLoading, incomingHasMore, incomingCursor, dispatchLoading, dispatchHasMore, dispatchCursor, packingLoading, packingHasMore, packingCursor]);

  const retryLoad = useCallback((section) => {
    loadNextPage(section);
  }, [loadNextPage]);

  // ========== IntersectionObserver Setup ==========

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '600px',
      threshold: 0.01
    };

    const incomingObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && incomingHasMore && !incomingLoading) {
        loadNextPage('incoming');
      }
    }, observerOptions);

    const dispatchObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && dispatchHasMore && !dispatchLoading) {
        loadNextPage('dispatch');
      }
    }, observerOptions);

    const packingObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && packingHasMore && !packingLoading) {
        loadNextPage('packing');
      }
    }, observerOptions);

    if (incomingSentinelRef.current) {
      incomingObserver.observe(incomingSentinelRef.current);
    }
    if (dispatchSentinelRef.current) {
      dispatchObserver.observe(dispatchSentinelRef.current);
    }
    if (packingSentinelRef.current) {
      packingObserver.observe(packingSentinelRef.current);
    }

    return () => {
      incomingObserver.disconnect();
      dispatchObserver.disconnect();
      packingObserver.disconnect();
    };
  }, [incomingHasMore, incomingLoading, dispatchHasMore, dispatchLoading, packingHasMore, packingLoading, loadNextPage]);

  // ========== Load sections when bottle detail changes ==========

  useEffect(() => {
    if (!selectedBottleId || selectedBottleId === 'all') return;

    loadSectionStart('incoming');
    loadSectionStart('dispatch');
    if (isShreno) {
      loadSectionStart('packing');
    }
  }, [selectedBottleId, loadSectionStart, isShreno]);

  // ========== Reload sections on filter change ==========

  useEffect(() => {
    if (!selectedBottleId || selectedBottleId === 'all') return;

    loadSectionStart('incoming');
    loadSectionStart('dispatch');
    if (isShreno) {
      loadSectionStart('packing');
    }
  }, [fromDate, toDate, searchFilter, loadSectionStart, isShreno, selectedBottleId]);

  const handleBottleChange = (newBottleId) => {
    setSelectedBottleId(newBottleId);
  };

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setSearchFilter('');
  };

  // Helper formatters
  const formatNum = (num) => (Number(num) || 0).toLocaleString('en-IN');
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB');
    } catch {
      return dateStr;
    }
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

  const bottleSelectOptions = useMemo(() => {
    return [
      { value: 'all', label: `★ ${labels.allBottles}` },
      ...bottles
        .sort((a, b) => {
          const nameA = (a.bottleName || a.plainBottleName || '').toLowerCase();
          const nameB = (b.bottleName || b.plainBottleName || '').toLowerCase();
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
      <div className="summary-header d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div className="summary-company-heading d-flex align-items-center gap-3">
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
            <div className="summary-company-title-row d-flex align-items-center gap-2">
              <h1 className="page-title summary-company-name mb-0">{company?.name || 'Company Summary'}</h1>
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

      <div className="summary-filter-card">
        <div className="row g-3 align-items-end">
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

          <div className="col-6 col-md-2 col-lg-2">
            <label className="summary-filter-label">{labels.fromDate}</label>
            <input
              type="date"
              className="form-control summary-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="col-6 col-md-2 col-lg-2">
            <label className="summary-filter-label">{labels.toDate}</label>
            <input
              type="date"
              className="form-control summary-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

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
        <div>
          <div className="summary-kpi-strip">
            <div className="summary-kpi-card theme-incoming">
              <div className="kpi-title">{labels.totalIncoming}</div>
              <div className="kpi-val">
                {formatNum(incomingTotals?.totalQty || 0)}
              </div>
              <div className="kpi-subtext">
                {formatNum(incomingTotals?.totalBoxes || 0)} {labels.boxes} (
                {formatNum(incomingItems.length)} {labels.records} loaded)
              </div>
            </div>

            <div className="summary-kpi-card theme-dispatch">
              <div className="kpi-title">{labels.totalDispatch}</div>
              <div className="kpi-val">
                {formatNum(dispatchTotals?.totalQty || 0)}
              </div>
              <div className="kpi-subtext">
                {formatNum(dispatchTotals?.totalBoxes || 0)} {labels.boxes} (
                {formatNum(dispatchItems.length)} {labels.records} loaded)
              </div>
            </div>

            <div
              className={`summary-kpi-card theme-difference ${((incomingTotals?.totalQty || 0) - (dispatchTotals?.totalQty || 0)) < 0 ? 'negative' : ''
                }`}
            >
              <div className="kpi-title">{labels.netDifference}</div>
              <div className="kpi-val">
                {formatNum((incomingTotals?.totalQty || 0) - (dispatchTotals?.totalQty || 0))}
              </div>
              <div className="kpi-subtext">
                {formatNum((incomingTotals?.totalBoxes || 0) - (dispatchTotals?.totalBoxes || 0))} {labels.boxes} net
              </div>
            </div>

            {isShreno && (
              <div className="summary-kpi-card theme-shreno">
                <div className="kpi-title">{labels.totalPackingMaterial}</div>
                <div className="kpi-val">
                  {formatNum(packingTotals?.totalQty || 0)}
                </div>
                <div className="kpi-subtext">
                  {formatNum(packingItems.length)} {labels.records} loaded
                </div>
              </div>
            )}
          </div>

          <div className={`summary-blocks-grid ${isShreno ? 'three-blocks' : 'two-blocks'}`}>
            {/* INCOMING BLOCK */}
            <div className="summary-block-card">
              <div className="block-header incoming-header">
                <h3 className="block-header-title">
                  <i className="bi bi-box-arrow-in-down" />
                  <span>{labels.blockIncoming}</span>
                </h3>
                <span className="block-header-pill">
                  {formatNum(incomingTotals?.totalQty || 0)} {labels.pcs}
                </span>
              </div>

              <div className="summary-table-scroll incoming-table-scroll">
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
                    {incomingItems.map((row, idx) => (
                      <tr key={row._id}>
                        <td className="text-muted fw-semibold">
                          {idx + 1}
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
                    ))}
                    {incomingLoading && (
                      <tr>
                        <td colSpan={isShreno ? 9 : 6} className="py-3 text-center">
                          <div className="spinner-border spinner-border-sm text-success" />
                        </td>
                      </tr>
                    )}
                    {incomingError && (
                      <tr>
                        <td colSpan={isShreno ? 9 : 6} className="py-2 text-center">
                          <button
                            className="btn btn-sm btn-link text-danger"
                            onClick={() => retryLoad('incoming')}
                          >
                            Couldn't load - Retry
                          </button>
                        </td>
                      </tr>
                    )}
                    {!incomingHasMore && incomingItems.length > 0 && (
                      <tr>
                        <td colSpan={isShreno ? 9 : 6} className="py-2 text-center text-muted small">
                          No more records
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {incomingItems.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={isShreno ? 6 : 3}>TOTAL</td>
                        <td className="num-col bold-num">
                          {formatNum(incomingTotals?.totalBoxes || 0)}
                        </td>
                        <td />
                        <td className="num-col bold-num text-success">
                          {formatNum(incomingTotals?.totalQty || 0)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div ref={incomingSentinelRef} style={{ height: '1px' }} />
            </div>

            {/* DISPATCH BLOCK */}
            <div className="summary-block-card">
              <div className="block-header dispatch-header">
                <h3 className="block-header-title">
                  <i className="bi bi-truck" />
                  <span>{labels.blockDispatch}</span>
                </h3>
                <span className="block-header-pill">
                  {formatNum(dispatchTotals?.totalQty || 0)} {labels.pcs}
                </span>
              </div>

              <div className={`summary-table-scroll dispatch-table-scroll${isShreno ? ' shreno-dispatch-table-scroll' : ''}`}>
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
                          <th style={{ textAlign: 'center' }} className="fw-bold">COATING</th>
                          <th style={{ textAlign: 'center' }} className="fw-bold">PRINTING</th>
                          <th className="fw-bold">TEXT COLOR</th>
                        </>
                      )}
                      <th className="num-col fw-bold">{labels.dispBox}</th>
                      <th className="num-col fw-bold">{labels.dispQty}</th>
                      <th className="num-col fw-bold">{labels.dispDispatchQty}</th>
                      <th className="fw-bold">REMARK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatchItems.map((row, idx) => (
                      <tr key={row._id}>
                        <td className="text-muted fw-semibold" style={{ width: 45 }}>
                          {idx + 1}
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
                          <span className="badge bg-light text-dark cursor-pointer" style={{ cursor: 'pointer', padding: '4px 8px', fontSize: '11px' }}>
                            {row.remarks && row.remarks !== '-' ? `📝 ${row.remarks.substring(0, 15)}...` : '+ Add'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {dispatchLoading && (
                      <tr>
                        <td colSpan={isShreno ? 8 : 10} className="py-3 text-center">
                          <div className="spinner-border spinner-border-sm text-indigo" />
                        </td>
                      </tr>
                    )}
                    {dispatchError && (
                      <tr>
                        <td colSpan={isShreno ? 8 : 10} className="py-2 text-center">
                          <button
                            className="btn btn-sm btn-link text-danger"
                            onClick={() => retryLoad('dispatch')}
                          >
                            Couldn't load - Retry
                          </button>
                        </td>
                      </tr>
                    )}
                    {!dispatchHasMore && dispatchItems.length > 0 && (
                      <tr>
                        <td colSpan={isShreno ? 8 : 10} className="py-2 text-center text-muted small">
                          No more records
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {dispatchItems.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={isShreno ? 4 : 6}>TOTAL</td>
                        <td className="num-col bold-num">
                          {formatNum(dispatchTotals?.totalBoxes || 0)}
                        </td>
                        <td />
                        <td className="num-col bold-num text-indigo">
                          {formatNum(dispatchTotals?.totalQty || 0)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div ref={dispatchSentinelRef} style={{ height: '1px' }} />
            </div>

            {/* PACKING MATERIAL BLOCK (SHRENO ONLY) */}
            {isShreno && (
              <div className="summary-block-card">
                <div className="block-header shreno-header">
                  <h3 className="block-header-title">
                    <i className="bi bi-box-seam" />
                    <span>{labels.blockPackingMaterial}</span>
                  </h3>
                  <span className="block-header-pill">
                    {formatNum(packingTotals?.totalQty || 0)} {labels.pcs}
                  </span>
                </div>

                <div className="summary-table-scroll packing-table-scroll">
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
                      {packingItems.map((row) => (
                        <tr key={row._id}>
                          <td>{formatDate(row.date)}</td>
                          <td>{row.itemType}</td>
                          <td>{row.configuration}</td>
                          <td className="num-col bold-num text-warning-emphasis">
                            {formatNum(row.quantity)}
                          </td>
                        </tr>
                      ))}
                      {packingLoading && (
                        <tr>
                          <td colSpan={4} className="py-3 text-center">
                            <div className="spinner-border spinner-border-sm text-warning" />
                          </td>
                        </tr>
                      )}
                      {packingError && (
                        <tr>
                          <td colSpan={4} className="py-2 text-center">
                            <button
                              className="btn btn-sm btn-link text-danger"
                              onClick={() => retryLoad('packing')}
                            >
                              Couldn't load - Retry
                            </button>
                          </td>
                        </tr>
                      )}
                      {!packingHasMore && packingItems.length > 0 && (
                        <tr>
                          <td colSpan={4} className="py-2 text-center text-muted small">
                            No more records
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {packingItems.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={3}>TOTAL</td>
                          <td className="num-col bold-num text-warning-emphasis">
                            {formatNum(packingTotals?.totalQty || 0)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <div ref={packingSentinelRef} style={{ height: '1px' }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
