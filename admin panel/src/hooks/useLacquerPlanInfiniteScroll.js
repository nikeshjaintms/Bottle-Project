import { useState, useRef, useCallback, useEffect } from 'react';
import API from '../services/api';

/**
 * Custom hook for infinite scroll pagination on Lacquer Plan list
 * State machine: status = 'idle' | 'loadingFirst' | 'loadingMore' | 'error' | 'done'
 * Features:
 * - 20s timeout with AbortController
 * - Deduplication by _id
 * - Independent totals aggregation fetch
 * - In-place updates/removals for actions without scroll jumps
 */
export const useLacquerPlanInfiniteScroll = (filters) => {
  const { selectedDate, fromDate, toDate, search, selectedCompanyId, selectedBrandId } = filters;

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

  // Fetch totals independently (no timeout, no blocking list)
  const fetchTotals = useCallback(async () => {
    try {
      const params = {
        date: (!fromDate && !toDate) ? selectedDate : '',
        fromDate,
        toDate,
        search,
        companyId: selectedCompanyId,
        brandId: selectedBrandId
      };

      const res = await API.get('/lacquer-plan/totals', { params });
      return res.data?.data || null;
    } catch (err) {
      console.error('Failed to fetch lacquer plan totals:', err);
      return null;
    }
  }, [selectedDate, fromDate, toDate, search, selectedCompanyId, selectedBrandId]);

  // Fetch paginated page with 20-second timeout
  const fetchPage = useCallback(async (pageCursor, requestId) => {
    return new Promise(async (resolve, reject) => {
      try {
        const params = {
          limit: 20,
          date: (!fromDate && !toDate) ? selectedDate : '',
          fromDate,
          toDate,
          search,
          companyId: selectedCompanyId,
          brandId: selectedBrandId
        };

        if (pageCursor) {
          params.cursor = pageCursor;
        }

        const abortController = abortControllerRef.current;

        // 20-second timeout for fetch
        const timeoutHandle = setTimeout(() => {
          if (abortController) {
            abortController.abort();
          }
        }, 20000);

        const res = await API.get('/lacquer-plan/paginated', {
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
        if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
          return resolve(null);
        }
        reject(err);
      }
    });
  }, [selectedDate, fromDate, toDate, search, selectedCompanyId, selectedBrandId]);

  // Reset and reload from first page
  const resetAndLoad = useCallback(async () => {
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

      if (requestId === requestIdRef.current) {
        if (pageData) {
          setItems(pageData.items);
          setCursor(pageData.nextCursor);
          setHasMore(pageData.hasMore);
          pageData.items.forEach(item => loadedIdsRef.current.add(String(item._id)));
          setStatus(pageData.items.length === 0 ? 'done' : 'idle');
        } else {
          setStatus('idle');
        }
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err.message || 'Failed to load lacquer plans');
        setStatus('error');
      }
    }

    // Fetch totals independently
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
        const newItems = pageData.items.filter(item => !loadedIdsRef.current.has(String(item._id)));
        newItems.forEach(item => loadedIdsRef.current.add(String(item._id)));

        setItems(prev => [...prev, ...newItems]);
        setCursor(pageData.nextCursor);
        setHasMore(pageData.hasMore);
        setStatus('idle');
      }
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err.message || 'Failed to load more plans');
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

  // Update item in place (no full reload, keeps scroll position)
  const updateItem = useCallback((id, updates) => {
    setItems(prev => prev.map(item => {
      if (String(item._id) === String(id)) {
        return { ...item, ...updates };
      }
      return item;
    }));
  }, []);

  // Remove item in place (for delete action)
  const removeItem = useCallback((id) => {
    setItems(prev => {
      const target = prev.find(i => String(i._id) === String(id));
      if (!target) return prev;
      loadedIdsRef.current.delete(String(id));
      const filtered = prev.filter(i => String(i._id) !== String(id));

      // Recalculate block spans if deleted row belonged to a block
      if (target.blockKey) {
        const blockRows = filtered.filter(i => i.blockKey === target.blockKey);
        const newBlockSize = blockRows.length;
        return filtered.map(item => {
          if (item.blockKey === target.blockKey) {
            const idxInBlock = blockRows.indexOf(item);
            return {
              ...item,
              blockSize: newBlockSize,
              blockIndex: idxInBlock,
              isFirstInBlock: (idxInBlock === 0),
              bottleSpan: (idxInBlock === 0) ? newBlockSize : 0,
              stockSpan: (idxInBlock === 0) ? newBlockSize : 0
            };
          }
          return item;
        });
      }
      return filtered;
    });
  }, []);

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
    retryLoad,
    updateItem,
    removeItem
  };
};

