import { useState, useRef, useCallback, useEffect } from 'react';
import API from '../services/api';

/**
 * Custom hook for infinite scroll pagination on Printing Plan list
 * Robust state machine: status = idle | loadingFirst | loadingMore | error | done
 * No timeout can leave status stuck; totals and list fetch independently
 */
export const usePrintingPlanInfiniteScroll = (filters) => {
  const { selectedDate, fromDate, toDate, search, selectedCompanyId } = filters;

  // State machine for list (not a boolean 'loading')
  const [status, setStatus] = useState('idle'); // idle | loadingFirst | loadingMore | error | done
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);

  // Request management
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const loadedIdsRef = useRef(new Set());
  const sentinelRef = useRef(null);
  const loadTimeoutRef = useRef(null);

  // Fetch totals independently (no timeout, no blocking other requests)
  const fetchTotals = useCallback(async () => {
    try {
      const params = {
        date: (!fromDate && !toDate) ? selectedDate : '',
        fromDate,
        toDate,
        search,
        companyId: selectedCompanyId
      };

      const res = await API.get('/printing-plan/totals', { params });
      return res.data?.data || null;
    } catch (err) {
      console.error('Failed to fetch printing plan totals:', err);
      return null; // Silent fail, don't block list
    }
  }, [selectedDate, fromDate, toDate, search, selectedCompanyId]);

  // Fetch paginated page with 20-second timeout
  const fetchPage = useCallback(async (pageC, requestId) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params = {
          limit: 20,
          date: (!fromDate && !toDate) ? selectedDate : '',
          fromDate,
          toDate,
          search,
          companyId: selectedCompanyId
        };

        if (pageC) {
          params.cursor = pageC;
        }

        const abortController = abortControllerRef.current;

        // 20-second timeout for fetch
        const timeoutHandle = setTimeout(() => {
          if (abortController) {
            abortController.abort();
          }
        }, 20000);

        const res = await API.get('/printing-plan/paginated', {
          params,
          signal: abortController?.signal
        });

        clearTimeout(timeoutHandle);

        // Check for stale response
        if (requestId !== requestIdRef.current) {
          return resolve(null);
        }

        resolve({
          items: res.data?.data?.items || [],
          nextCursor: res.data?.data?.nextCursor || null,
          hasMore: res.data?.data?.hasMore || false
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          return resolve(null);
        }
        reject(err);
      }
    });
  }, [selectedDate, fromDate, toDate, search, selectedCompanyId]);

  // Reset and reload from first page
  const resetAndLoad = useCallback(async () => {
    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    abortControllerRef.current = new AbortController();
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setStatus('loadingFirst');
    setError(null);
    setItems([]);
    setCursor(null);
    setHasMore(true);
    loadedIdsRef.current = new Set();

    try {
      const pageData = await fetchPage(null, requestId);

      // Only update if this is still the current request
      if (requestId === requestIdRef.current) {
        if (pageData) {
          setItems(pageData.items);
          setCursor(pageData.nextCursor);
          setHasMore(pageData.hasMore);
          pageData.items.forEach(item => loadedIdsRef.current.add(item._id));
          setStatus(pageData.items.length === 0 ? 'done' : 'idle');
        } else {
          // pageData is null (stale or aborted), don't change status
          setStatus('idle');
        }
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err.message || 'Failed to load printing plans');
        setStatus('error');
      }
    }

    // Fetch totals independently (fire and forget)
    fetchTotals().then(totalsData => {
      if (requestId === requestIdRef.current) {
        setTotals(totalsData);
      }
    });
  }, [fetchPage, fetchTotals]);

  // Load next page
  const loadNextPage = useCallback(async () => {
    if (status === 'loadingMore' || !hasMore || !cursor) return;

    const requestId = requestIdRef.current;
    setStatus('loadingMore');

    try {
      const pageData = await fetchPage(cursor, requestId);

      if (requestId === requestIdRef.current && pageData) {
        const newItems = pageData.items.filter(item => !loadedIdsRef.current.has(item._id));
        pageData.items.forEach(item => loadedIdsRef.current.add(item._id));

        setItems(prev => [...prev, ...newItems]);
        setCursor(pageData.nextCursor);
        setHasMore(pageData.hasMore);
        setStatus('idle');
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err.message || 'Failed to load more');
        setStatus('error');
      }
    }
  }, [status, hasMore, cursor, fetchPage]);

  // Retry on error
  const retryLoad = useCallback(() => {
    if (status === 'error' && cursor) {
      loadNextPage();
    } else if (status === 'error') {
      resetAndLoad();
    }
  }, [status, cursor, loadNextPage, resetAndLoad]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  // For backwards compatibility, expose 'loading' boolean
  const loading = status === 'loadingFirst' || status === 'loadingMore';

  return {
    items,
    totals,
    cursor,
    hasMore,
    loading,
    status,
    error,
    sentinelRef,
    resetAndLoad,
    loadNextPage,
    retryLoad
  };
};
