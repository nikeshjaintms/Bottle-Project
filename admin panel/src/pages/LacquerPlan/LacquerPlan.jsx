import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchLacquerPlans, deleteLacquerPlan } from '../../redux/slices/lacquerPlanSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../../context/AbilityContext';
import API from '../../services/api';
import Swal from 'sweetalert2';
import Select from 'react-select';

import ImportExcelModal from './ImportExcelModal';
import { OrderQtyModal, CoatingQtyModal } from '../../components/LacquerQuantityModals';
import { useLacquerPlanLanguage } from '../../hooks/useLacquerPlanLanguage';
import { useLacquerPlanInfiniteScroll } from '../../hooks/useLacquerPlanInfiniteScroll';
import { sortLacquerPlans } from '../../utils/lacquerPlanSort';
import { buildContiguousGroups, buildMultipleContiguousGroups } from '../../utils/tableGrouping';
import { isPlanRowCompleted, checkRowStockWarning, getCoatedQty } from '../../utils/lacquerPlanUtils';
import ZoomControl from '../../components/ZoomControl';
import { downloadLacquerPlanExcel } from '../../utils/lacquerPlanExport';

const DoubleScrollContainer = ({ children }) => {
  const topScrollRef = React.useRef(null);
  const bottomScrollRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const [contentWidth, setContentWidth] = React.useState(0);

  const isSyncingLeft = React.useRef(false);
  const isSyncingRight = React.useRef(false);

  const handleTopScroll = (e) => {
    if (isSyncingLeft.current) {
      isSyncingLeft.current = false;
      return;
    }
    if (bottomScrollRef.current && topScrollRef.current) {
      isSyncingRight.current = true;
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = (e) => {
    if (isSyncingRight.current) {
      isSyncingRight.current = false;
      return;
    }
    if (topScrollRef.current && bottomScrollRef.current) {
      isSyncingLeft.current = true;
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  React.useEffect(() => {
    if (!bottomScrollRef.current) return;

    const updateWidth = () => {
      if (bottomScrollRef.current) {
        setContentWidth(bottomScrollRef.current.scrollWidth);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });

    resizeObserver.observe(bottomScrollRef.current);
    if (bottomScrollRef.current.firstElementChild) {
      resizeObserver.observe(bottomScrollRef.current.firstElementChild);
    }

    updateWidth();

    return () => resizeObserver.disconnect();
  }, [children]);

  return (
    <div className="lacquer-plan-double-scroll">
      <div
        ref={topScrollRef}
        onScroll={handleTopScroll}
        style={{ overflowX: 'auto', marginBottom: '4px', height: '14px' }}
        className="top-scrollbar"
      >
        <div style={{ width: contentWidth > 0 ? contentWidth : '100%', height: '1px' }}></div>
      </div>
      <div
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)', minHeight: '500px' }}
        className="companies-list-desktop lacquer-plan-main-scroll"
      >
        <div ref={contentRef} style={{ display: 'inline-block', minWidth: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default function LacquerPlan() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlDate = searchParams.get('date');
  const ability = useAbility(AbilityContext);
  const { plans, loading } = useSelector((state) => state.lacquerPlans);
  const { companies } = useSelector((state) => state.companies || { companies: [] });
  const { brands } = useSelector((state) => state.brands || { brands: [] });
  const { labels, toggleLanguage, language } = useLacquerPlanLanguage();

  const [allCompaniesList, setAllCompaniesList] = useState([]);

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(urlDate || today.toISOString().split('T')[0]);

  useEffect(() => {
    if (urlDate) {
      setSelectedDate(urlDate);
    }
  }, [urlDate]);
  const [showImportModal, setShowImportModal] = useState(false);

  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // Helper to format date nicely with local timezone offset without shifting
  const formatDateString = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');

  const [importing, setImporting] = useState(false);

  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('lacquerPlanZoom');
    return saved ? parseInt(saved, 10) : 100;
  });

  // Infinite scroll hook with server-side pagination & whole-block preservation
  const infiniteScroll = useLacquerPlanInfiniteScroll({
    selectedDate: (!fromDate && !toDate) ? selectedDate : '',
    fromDate,
    toDate,
    search,
    selectedCompanyId,
    selectedBrandId
  });

  // Modal state management for quantity cells
  const [showOrderQtyModal, setShowOrderQtyModal] = useState(false);
  const [showCoatingQtyModal, setShowCoatingQtyModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    localStorage.setItem('lacquerPlanZoom', zoom.toString());
  }, [zoom]);

  const openOrderQtyModal = (plan) => {
    setSelectedPlan(plan);
    setShowOrderQtyModal(true);
  };

  const openCoatingQtyModal = (plan) => {
    setSelectedPlan(plan);
    setShowCoatingQtyModal(true);
  };

  const handleModalSave = () => {
    // Refresh the plans list after modal save
    fetchPlans();
  };

  const fetchPlans = () => {
    infiniteScroll.resetAndLoad();
  };

  useEffect(() => {
    let isMounted = true;
    API.get('/company?pagination=false')
      .then(res => {
        if (isMounted && res.data?.data) {
          const sorted = [...res.data.data].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
          );
          setAllCompaniesList(sorted);
        }
      })
      .catch(err => console.error('Failed to load all companies:', err));

    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchBrands({ pagination: 'false' }));
    return () => { isMounted = false; };
  }, [dispatch]);

  // Initial load on mount
  useEffect(() => {
    infiniteScroll.resetAndLoad();
  }, []);

  // IntersectionObserver for sentinel
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '600px',
      threshold: 0.01
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && infiniteScroll.hasMore && infiniteScroll.status !== 'loadingMore' && !infiniteScroll.error) {
        infiniteScroll.loadNextPage();
      }
    }, observerOptions);

    if (infiniteScroll.sentinelRef.current) {
      observer.observe(infiniteScroll.sentinelRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [infiniteScroll.hasMore, infiniteScroll.status, infiniteScroll.error]);

  // Keep API sync with debounced reset on filter changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      infiniteScroll.resetAndLoad();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [selectedDate, fromDate, toDate, search, selectedCompanyId, selectedBrandId]);

  // Refetch when tab/window receives focus
  useEffect(() => {
    const handleFocus = () => {
      infiniteScroll.resetAndLoad();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [selectedDate, fromDate, toDate, search, selectedCompanyId, selectedBrandId]);

  const handleCompanyChange = (companyId) => {
    setSelectedCompanyId(companyId);
    if (companyId && selectedBrandId && companyId !== 'UNASSIGNED') {
      // Check if selected brand belongs to the newly selected company
      const brandObj = brands?.find(b => b._id === selectedBrandId);
      if (brandObj) {
        const bCompId = (brandObj.companyId?._id || brandObj.companyId)?.toString();
        const bComp = (brandObj.company?._id || brandObj.company)?.toString();
        if (bCompId !== companyId?.toString() && bComp !== companyId?.toString()) {
          setSelectedBrandId(''); // Reset if invalid combo
        }
      }
    }
  };

  const handleReset = () => {
    const todayStr = new Date().toISOString().split('T')[0];

    setSelectedDate(todayStr);
    setFromDate('');
    setToDate('');
    setSearch('');
    setSelectedCompanyId('');
    setSelectedBrandId('');
    dispatch(fetchLacquerPlans({ date: todayStr, pagination: 'false' }));
  };

  const companySelectOptions = useMemo(() => {
    const list = allCompaniesList.length > 0 ? allCompaniesList : (companies || []);
    const sorted = [...list].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
    return [
      { value: '', label: 'All Companies' },
      ...sorted.map(c => ({ value: c._id, label: c.name })),
      { value: 'UNASSIGNED', label: 'UNASSIGNED' }
    ];
  }, [allCompaniesList, companies]);

  const activeCompanySummaries = useMemo(() => {
    const map = new Map();
    (plans || []).forEach(plan => {
      const cid = (plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId) || 'UNASSIGNED').toString();
      const cname = plan.companyName || (cid === 'UNASSIGNED' ? 'UNASSIGNED' : 'Unknown');
      if (!map.has(cid)) {
        map.set(cid, { id: cid, name: cname, count: 0 });
      }
      map.get(cid).count++;
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [plans]);

  const filteredPlans = infiniteScroll.items || [];


const handleDelete = (id) => {
  Swal.fire({
    title: 'Delete Plan Row?',
    text: 'Do you really want to delete this individual plan row?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e91e63',
    confirmButtonText: 'Yes, delete it!'
  }).then((result) => {
    if (result.isConfirmed) {
      dispatch(deleteLacquerPlan(id)).then(() => {
        infiniteScroll.removeItem(id);
        Swal.fire('Deleted!', 'Plan row has been deleted.', 'success');
      });
    }
  });
};

const handleSendToReadyToDispatch = async (plan) => {
  try {
    const process = (plan.process || '').trim().toUpperCase();
    if (process !== 'C') {
      Swal.fire({
        icon: 'warning',
        title: 'Not Allowed',
        text: 'Only Process C rows can be sent to Ready To Dispatch.',
        toast: true,
        position: 'top-end',
        timer: 4000,
        showConfirmButton: false
      });
      return;
    }

    const orderQty = Number(plan.orderQty || 0);
    const coated = Number(plan.coatingCompletedQty ?? plan.coatedQty ?? 0);
    const alreadySent = Number(plan.sentToReadyQty || 0);
    const sendable = Math.max(0, coated - alreadySent);

    if (sendable <= 0) {
      Swal.fire({
        icon: 'info',
        title: 'Nothing to Send',
        text: 'No sendable quantity remaining for this row.',
        toast: true,
        position: 'top-end',
        timer: 3000,
        showConfirmButton: false
      });
      return;
    }

    const isCompleted = orderQty > 0 && coated >= orderQty;
    let selectedQty = sendable;

    if (isCompleted) {
      // Normal confirmation for completed row
      const result = await Swal.fire({
        title: 'Send to Ready To Dispatch',
        html: `
            <div class="text-start py-2">
              <p class="mb-2">Send all <strong>${sendable}</strong> units of <strong>${plan.bottleName}</strong> to Ready To Dispatch?</p>
              <div class="d-flex justify-content-between p-2 rounded bg-light border" style="font-size: 13px;">
                <span>Order: <strong>${orderQty}</strong></span>
                <span>Coated: <strong>${coated}</strong></span>
                <span>Already Sent: <strong>${alreadySent}</strong></span>
                <span class="text-success">Sendable: <strong>${sendable}</strong></span>
              </div>
            </div>
          `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Send',
        cancelButtonText: 'Cancel',
        customClass: {
          confirmButton: 'btn btn-primary px-4 py-2 me-2',
          cancelButton: 'btn btn-light px-4 py-2'
        },
        buttonsStyling: false
      });

      if (!result.isConfirmed) return;
      selectedQty = sendable;
    } else {
      // Swal with Whole or Partial quantity choice when balance remains
      const result = await Swal.fire({
        title: 'Send to Ready To Dispatch',
        html: `
            <div class="text-start py-1">
              <div class="p-3 mb-3 rounded-3" style="background: rgba(0, 174, 239, 0.08); border: 1px solid rgba(0, 174, 239, 0.25);">
                <div class="fw-bold mb-2 text-dark" style="font-size: 14px;">
                  ${plan.bottleName} ${plan.variantId?.variantName || plan.variantName ? ' - ' + (plan.variantId?.variantName || plan.variantName) : ''}
                </div>
                <div class="row g-2 text-center" style="font-size: 12px;">
                  <div class="col-3">
                    <div class="text-muted text-uppercase" style="font-size: 10px; font-weight: 600;">Order</div>
                    <div class="fw-bold text-dark fs-6">${orderQty}</div>
                  </div>
                  <div class="col-3">
                    <div class="text-muted text-uppercase" style="font-size: 10px; font-weight: 600;">Coated</div>
                    <div class="fw-bold text-primary fs-6">${coated}</div>
                  </div>
                  <div class="col-3">
                    <div class="text-muted text-uppercase" style="font-size: 10px; font-weight: 600;">Already Sent</div>
                    <div class="fw-bold text-secondary fs-6">${alreadySent}</div>
                  </div>
                  <div class="col-3">
                    <div class="text-muted text-uppercase" style="font-size: 10px; font-weight: 600;">Sendable</div>
                    <div class="fw-bold text-success fs-6">${sendable}</div>
                  </div>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label fw-bold small text-muted text-uppercase mb-2" style="font-size: 11px;">Select Quantity Option</label>
                <div class="d-flex flex-column gap-2">
                  <label class="d-flex align-items-center p-2 rounded border cursor-pointer" style="background: #f8fafc; cursor: pointer;">
                    <input type="radio" name="swal-send-choice" id="choice-whole" value="whole" checked class="form-check-input me-2 mt-0">
                    <div>
                      <strong>Whole quantity</strong> <span class="text-muted">(${sendable} units)</span>
                    </div>
                  </label>
                  <label class="d-flex align-items-center p-2 rounded border cursor-pointer" style="background: #f8fafc; cursor: pointer;">
                    <input type="radio" name="swal-send-choice" id="choice-partial" value="partial" class="form-check-input me-2 mt-0">
                    <div>
                      <strong>Partial quantity</strong>
                    </div>
                  </label>
                </div>
              </div>

              <div id="swal-partial-container" class="mb-2" style="display: none;">
                <label class="form-label small fw-bold text-muted mb-1" for="swal-partial-qty">Quantity to Send (1 - ${sendable})</label>
                <input type="number" id="swal-partial-qty" class="form-control shadow-none" placeholder="Enter quantity" min="1" max="${sendable}">
                <div id="swal-partial-error" class="text-danger small mt-1" style="display: none;"></div>
              </div>
            </div>
          `,
        didOpen: () => {
          const wholeRadio = document.getElementById('choice-whole');
          const partialRadio = document.getElementById('choice-partial');
          const partialContainer = document.getElementById('swal-partial-container');
          const partialInput = document.getElementById('swal-partial-qty');
          const errorDiv = document.getElementById('swal-partial-error');

          const togglePartial = () => {
            if (partialRadio.checked) {
              partialContainer.style.display = 'block';
              partialInput.focus();
            } else {
              partialContainer.style.display = 'none';
              if (errorDiv) {
                errorDiv.style.display = 'none';
                errorDiv.innerText = '';
              }
            }
          };

          wholeRadio.addEventListener('change', togglePartial);
          partialRadio.addEventListener('change', togglePartial);
          partialInput.addEventListener('input', () => {
            if (errorDiv) {
              errorDiv.style.display = 'none';
              errorDiv.innerText = '';
            }
          });
        },
        preConfirm: () => {
          const partialRadio = document.getElementById('choice-partial');
          const partialInput = document.getElementById('swal-partial-qty');
          const errorDiv = document.getElementById('swal-partial-error');

          const showError = (msg) => {
            if (errorDiv) {
              errorDiv.innerText = msg;
              errorDiv.style.display = 'block';
            }
            return false;
          };

          if (!partialRadio || !partialRadio.checked) {
            return { qty: sendable };
          }

          const rawVal = partialInput ? partialInput.value.trim() : '';
          if (!rawVal) {
            return showError('Please enter a quantity.');
          }

          if (rawVal.includes('.')) {
            return showError('Decimals are not allowed.');
          }

          const num = Number(rawVal);
          if (isNaN(num) || !Number.isInteger(num)) {
            return showError('Please enter a valid whole number.');
          }

          if (num <= 0) {
            return showError('Quantity must be greater than zero.');
          }

          if (num > sendable) {
            return showError(`Quantity cannot exceed sendable quantity (${sendable}).`);
          }

          return { qty: num };
        },
        showCancelButton: true,
        confirmButtonText: 'Send to Ready To Dispatch',
        cancelButtonText: 'Cancel',
        customClass: {
          confirmButton: 'btn btn-primary px-4 py-2 me-2',
          cancelButton: 'btn btn-light px-4 py-2'
        },
        buttonsStyling: false
      });

      if (!result.isConfirmed || !result.value) return;
      selectedQty = result.value.qty;
    }

    // Send to API (idempotent endpoint with optional qty)
    const response = await API.post('/ready-to-dispatch/from-plan', {
      source: 'lacquer',
      planId: plan._id,
      qty: selectedQty
    });

    if (response.data.success) {
      const { sheetId, lineId, isExisting, warnings = [] } = response.data.data;

      // In-place update of sent quantity without losing scroll position
      infiniteScroll.updateItem(plan._id, {
        sentToReadyQty: (plan.sentToReadyQty || 0) + selectedQty
      });

      Swal.fire({
        icon: 'success',
        title: isExisting ? 'Added to Ready To Dispatch' : 'Sent to Ready To Dispatch',
        toast: true,
        position: 'top-end',
        timer: 3000,
        showConfirmButton: false
      });

      // Show warning toasts if any
      if (warnings && warnings.length > 0) {
        setTimeout(() => {
          warnings.forEach((warning, idx) => {
            setTimeout(() => {
              Swal.fire({
                icon: 'warning',
                title: 'Warning',
                text: warning,
                toast: true,
                position: 'top-end',
                timer: 5000,
                showConfirmButton: false
              });
            }, idx * 1200);
          });
        }, 800);
      }

      // Navigate to the sheet's View page with focus
      const focusQuery = lineId ? `?focus=${lineId}${!isExisting ? '&new=true' : ''}` : '';
      navigate(`/ready-to-dispatch/view/${sheetId}${focusQuery}`);
    }
  } catch (error) {
    console.error('Error sending to Ready To Dispatch:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.response?.data?.message || 'Failed to send to Ready To Dispatch',
      toast: true,
      position: 'top-end',
      timer: 4000,
      showConfirmButton: false
    });
  }
};

const handleImportPrevious = async () => {
  try {
    const defaultPrevDate = new Date(selectedDate);
    defaultPrevDate.setDate(defaultPrevDate.getDate() - 1);
    const defaultPrevDateStr = defaultPrevDate.toISOString().split('T')[0];

    const result = await Swal.fire({
      title: labels.importPreviousPlan || 'Import Previous Plan?',
      html: `
          <p class="mb-3 text-muted">Select the date you want to import the Lacquer Plan from.</p>
          <div class="form-group text-start px-3">
            <label class="form-label fw-bold small text-muted">Source Date <span class="text-danger">*</span></label>
            <input type="date" id="swal-source-date" class="form-control shadow-none" style="border-radius: 8px" value="${defaultPrevDateStr}" max="${defaultPrevDateStr}">
          </div>
          <p class="mt-3 mb-0 small text-muted">This will copy all plans from the selected date and create new entries for <strong>${selectedDate}</strong>.</p>
        `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, import it!',
      preConfirm: () => {
        const sourceDate = document.getElementById('swal-source-date').value;
        if (!sourceDate) {
          Swal.showValidationMessage('Please select a source date');
        }
        return sourceDate;
      }
    });

    if (!result.isConfirmed) {
      return;
    }

    const sourceDate = result.value;

    setImporting(true);
    const res = await API.post('/lacquer-plan/import-previous', { targetDate: selectedDate, sourceDate });
    if (res.data.success) {
      if (res.data.requiresConfirmation) {
        setImporting(false);
        const isExisting = res.data.hasExistingImport;
        const choice = await Swal.fire({
          title: isExisting ? 'Previous Plan Already Imported' : 'Previous Plan Modified',
          html: isExisting
            ? `
                <p class="text-muted mb-2">This date already has imports from <strong>${sourceDate}</strong>.</p>
                <p class="mb-0 fw-bold">How would you like to proceed?</p>
              `
            : `
                <p class="text-muted mb-2">The source plan for <strong>${sourceDate}</strong> has <strong>${res.data.editedCount || 'several'}</strong> entry(s) that were manually edited after import.</p>
                <p class="mb-0 fw-bold">How would you like to carry forward this plan?</p>
              `,
          icon: isExisting ? 'question' : 'warning',
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: isExisting ? 'Import with changes (Update & Add)' : 'Import with changes',
          confirmButtonColor: '#3085d6',
          denyButtonText: isExisting ? 'Import without changes (Add Only)' : 'Import without changes',
          denyButtonColor: '#10b981',
          cancelButtonText: 'Cancel'
        });

        if (!choice.isConfirmed && !choice.isDenied) {
          return;
        }

        const importMode = choice.isConfirmed ? 'with_changes' : 'without_changes';
        setImporting(true);
        const finalRes = await API.post('/lacquer-plan/import-previous', {
          targetDate: selectedDate,
          sourceDate,
          importMode
        });

        if (finalRes.data.success) {
          fetchPlans();
          Swal.fire(
            'Imported!',
            `Previous plan imported ${importMode === 'with_changes' ? 'with edited changes' : 'with original values'}.`,
            'success'
          );
        }
      } else {
        fetchPlans();
        Swal.fire('Imported!', 'Previous plan imported successfully.', 'success');
      }
    }
  } catch (err) {
    Swal.fire('Error', err.response?.data?.message || 'Failed to import previous day', 'error');
  } finally {
    setImporting(false);
  }
};

const handleExport = async () => {
  try {
    const params = {
      date: (!fromDate && !toDate) ? selectedDate : '',
      fromDate,
      toDate,
      search,
      companyId: selectedCompanyId,
      brandId: selectedBrandId,
      pagination: 'false'
    };
    const res = await API.get('/lacquer-plan', { params });
    const allPlans = res.data?.data || [];
    if (allPlans.length === 0) {
      Swal.fire('No Data', 'There is no data to export for the selected filters.', 'info');
      return;
    }

    await downloadLacquerPlanExcel(allPlans, {
      selectedDate: (!fromDate && !toDate) ? selectedDate : '',
      fromDate,
      toDate,
      companies: companies || []
    });
  } catch (err) {
    console.error(err);
    Swal.fire('Export Failed', 'An error occurred while generating the export.', 'error');
  }
};

const renderGroupedTables = (planList, showDate = false) => {
  if (!planList || planList.length === 0) {
    return renderDailyTable([], showDate, 0);
  }
  const groupedByCompany = {};
  planList.forEach(plan => {
    const compId = (plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId) || 'UNASSIGNED').toString();
    const compName = plan.companyName || (compId === 'UNASSIGNED' ? 'UNASSIGNED' : 'Unassigned');
    if (!groupedByCompany[compId]) {
      groupedByCompany[compId] = { id: compId, name: compId === 'UNASSIGNED' ? 'UNASSIGNED' : compName, plans: [] };
    }
    groupedByCompany[compId].plans.push(plan);
  });

  let currentSrNo = 0;
  const sortedCompIds = Object.keys(groupedByCompany).sort((a, b) =>
    groupedByCompany[a].name.localeCompare(groupedByCompany[b].name, undefined, { numeric: true, sensitivity: 'base' })
  );

  return sortedCompIds.map((compId) => {
    const groupData = groupedByCompany[compId];
    const startSrNo = currentSrNo;
    currentSrNo += groupData.plans.length;

    const sortedPlans = groupData.plans; // Maintain exact server block sort order
    return (
      <div key={compId} className="mb-4">
        <h5 className="text-center py-3 bg-light border-top border-bottom text-uppercase fw-bold text-dark tracking-wide mb-0" style={{ letterSpacing: '2px' }}>
          {groupData.name}
        </h5>
        {renderDailyTable(sortedPlans, showDate, startSrNo)}
      </div>
    );
  });
};

const renderDailyTable = (planList, showDate = false, startSrNo = 0) => {
  const contiguousPlanList = planList;


  return (
    <table className="data-table" style={{ minWidth: '1800px', borderCollapse: 'separate', borderSpacing: 0 }}>
      <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <tr style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', color: 'white' }}>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.sr}</th>
          {showDate && <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.date}</th>}
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.bottleName}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.variant}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.coatingShade}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.brand}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.process}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.plainStock}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.orderQty}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.coatingCompletedQty}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.balanceToMake}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.bottlePerBox}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.noOfOrderBoxes}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.dispatchPendingQty}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.soldQty}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.remarks}</th>
          <th className="py-3 text-uppercase fw-bolder text-center" style={{ minWidth: 220, fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.actions || 'Actions'}</th>
        </tr>
      </thead>
      <tbody>
        {contiguousPlanList.length > 0 ? contiguousPlanList.map((plan, index) => {

          // Dynamically calculate pool block, brand, and process spans
          const getBlockKey = (p) => p.blockKey || `${p.planDate ? new Date(p.planDate).toISOString().split('T')[0] : ''}__${String(p.canonicalCompanyId || (p.companyId?._id || p.companyId) || p.companyName || 'UNASSIGNED').trim()}__${p.canonicalBottleNormalized || p.plainBottle || p.plainBottleName || p.bottleName || ''}`;
          const getBrandKey = (p) => (p.brandId?._id || p.brandId || p.brandName || '').toString().trim().toLowerCase();
          const getProcessKey = (p) => String(p.process || '').trim().toUpperCase();

          const curBlockKey = getBlockKey(plan);
          const prevPlan = index > 0 ? contiguousPlanList[index - 1] : null;
          const prevBlockKey = prevPlan ? getBlockKey(prevPlan) : null;
          const isFirstInBottleVisualGroup = !prevPlan || prevBlockKey !== curBlockKey;

          let bottleVisualRowSpan = 1;
          if (isFirstInBottleVisualGroup) {
            for (let i = index + 1; i < contiguousPlanList.length; i++) {
              if (getBlockKey(contiguousPlanList[i]) === curBlockKey) {
                bottleVisualRowSpan++;
              } else {
                break;
              }
            }
          }

          let renderShadeGroupCell = true;
          let shadeRowSpan = 1;
          const currentShade = plan.coatingShade || plan.colour;
          const prevShade = prevPlan ? (prevPlan.coatingShade || prevPlan.colour) : null;

            if (prevPlan && getBlockKey(prevPlan) === curBlockKey && prevShade === currentShade) {
              renderShadeGroupCell = false;
            } else {
              let count = 1;
              for (let i = index + 1; i < contiguousPlanList.length; i++) {
                const nextPlan = contiguousPlanList[i];
                const nextShade = nextPlan.coatingShade || nextPlan.colour;
                  if (getBlockKey(nextPlan) === curBlockKey && nextShade === currentShade) {
                    count++;
                  } else {
                    break;
                  }
                }
                shadeRowSpan = count;
              }

              const curProcessKey = getProcessKey(plan);
              const prevProcessKey = prevPlan ? getProcessKey(prevPlan) : null;
              const isFirstInProcess = plan.isFirstInProcess !== undefined ? plan.isFirstInProcess : (isFirstInBottleVisualGroup || prevProcessKey !== curProcessKey);

              let processRowSpan = plan.processSpan !== undefined ? plan.processSpan : 1;
              if (plan.processSpan === undefined && isFirstInProcess) {
                processRowSpan = 1;
                for (let i = index + 1; i < contiguousPlanList.length; i++) {
                  const nextPlan = contiguousPlanList[i];
                  if (getBlockKey(nextPlan) === curBlockKey && getProcessKey(nextPlan) === curProcessKey) {
                    processRowSpan++;
                  } else {
                    break;
                  }
                }
              }

              const curBrandKey = getBrandKey(plan);
              const prevBrandKey = prevPlan ? getBrandKey(prevPlan) : null;
              const isFirstInBrand = plan.isFirstInBrand !== undefined ? plan.isFirstInBrand : (isFirstInProcess || prevBrandKey !== curBrandKey);

              let brandRowSpan = plan.brandSpan !== undefined ? plan.brandSpan : 1;
              if (plan.brandSpan === undefined && isFirstInBrand) {
                brandRowSpan = 1;
                for (let i = index + 1; i < contiguousPlanList.length; i++) {
                  const nextPlan = contiguousPlanList[i];
                  if (getBlockKey(nextPlan) === curBlockKey && getProcessKey(nextPlan) === curProcessKey && getBrandKey(nextPlan) === curBrandKey) {
                    brandRowSpan++;
                  } else {
                    break;
                  }
                }
              }

              const isFirstInBottleGroup = isFirstInBottleVisualGroup;
              const isFirstInGroup = isFirstInBottleVisualGroup;

              const rowClasses = [
                'align-middle',
                'transition-all',
                'hover-bg-light',
                isFirstInBottleGroup && index !== 0 ? 'bottle-group-divider' : '',
                isFirstInGroup ? 'border-top' : 'border-bottom'
              ].filter(Boolean).join(' ');

              return (
                <tr key={plan._id || index} className={rowClasses}>
                  <td className="py-3 ps-4 text-start">
                    <span className="text-muted fw-bold" style={{ fontSize: 13 }}>{(startSrNo + index + 1).toString().padStart(2, '0')}</span>
                  </td>
                  {showDate && <td className="py-3 text-center">{new Date(plan.planDate).toLocaleDateString()}</td>}

                  {isFirstInBottleVisualGroup && (
                    <td className="py-3 text-center fw-600 text-dark align-middle" style={{ fontSize: 13 }} rowSpan={bottleVisualRowSpan}>{plan.bottleName || '*'}</td>
                  )}

                  <td className="py-3 text-center">
                    <span className="badge bg-soft-primary text-primary px-2 py-1" style={{ fontSize: 11 }}>{plan.variantId?.variantName || plan.variantName || '-'}</span>
                  </td>
                  {renderShadeGroupCell && (
                    <td className="py-3 text-center align-middle" rowSpan={shadeRowSpan}>
                      {(plan.coatingShade || plan.colour) ? (
                        <span className="badge bg-soft-warning text-warning-accent px-2 py-1" style={{ fontSize: 10 }}>{plan.coatingShade || plan.colour}</span>
                      ) : '-'}
                    </td>
                  )}
                      <td className="py-3 text-center text-accent fw-500 align-middle">
                        {plan.brandId?.name || plan.brandName || '-'}
                      </td>

                          {isFirstInProcess && (
                            <td className="py-3 text-center align-middle" rowSpan={processRowSpan}>
                              <span className="badge bg-light text-dark border px-2 py-1" style={{ fontSize: 11 }}>{plan.process}</span>
                            </td>
                          )}

                          {(() => {
                            const isRowExceeding = checkRowStockWarning(plan.orderQty, plan.openingStock);
                            const blockPlans = contiguousPlanList.filter(p => p.blockKey ? p.blockKey === plan.blockKey : (p.bottleName === plan.bottleName && p.companyId === plan.companyId));
                            const isBlockExceeding = blockPlans.some(p => checkRowStockWarning(p.orderQty, p.openingStock));

                            return (
                              <>
                                {isFirstInBottleVisualGroup && (
                                  <td className={`py-3 text-center align-middle ${isBlockExceeding ? 'bg-warning' : ''}`} rowSpan={bottleVisualRowSpan}>
                                    <div className="fw-bold">{plan.plainStock !== null && plan.plainStock !== undefined ? plan.plainStock : 0}</div>
                                    {(() => {
                                      const allocs = Array.isArray(plan.stockAllocation) ? plan.stockAllocation : [];
                                      const suppliers = (companies || []).filter(c => c.isStockSupplier).map(c => c._id.toString());
                                      const hasSupplier = allocs.some(a => suppliers.includes((a.companyId?._id || a.companyId)?.toString()));
                                      if (allocs.length > 1 || hasSupplier) {
                                        const names = allocs.map(a => {
                                          const cId = (a.companyId?._id || a.companyId)?.toString();
                                          return a.companyName || a.companyId?.name || (companies || []).find(c => c._id === cId)?.name || 'Company';
                                        });
                                        const tooltip = allocs.map(a => {
                                          const cId = (a.companyId?._id || a.companyId)?.toString();
                                          const name = a.companyName || a.companyId?.name || (companies || []).find(c => c._id === cId)?.name || 'Company';
                                          return `${name}: ${a.qty}`;
                                        }).join(' | ');
                                        return (
                                          <div className="mt-1" title={tooltip}>
                                            <span className="badge bg-info text-dark" style={{ fontSize: '10px', cursor: 'help' }}>
                                              {Array.from(new Set(names)).join(' + ')}
                                            </span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                    {plan.allocationShortfall && (
                                      <div className="badge bg-danger mt-1 d-block text-wrap" style={{ fontSize: '10px' }} title={`Stock short by ${plan.shortfallQty || 0} after an earlier change`}>
                                        Stock short by {plan.shortfallQty || 0} after an earlier change
                                      </div>
                                    )}
                                  </td>
                                )}
                                <td className={`py-3 text-center fw-bold ${isRowExceeding ? 'bg-warning' : ''}`} style={{ cursor: 'pointer' }} onClick={() => openOrderQtyModal(plan)} title="Click to add Order Qty">
                                  {plan.orderQty !== null && plan.orderQty !== undefined ? plan.orderQty : '-'}
                                </td>
                              </>
                            );
                          })()}
                          <td className="py-3 text-center" style={{ cursor: 'pointer' }} onClick={() => openCoatingQtyModal(plan)} title={plan.usedFromTooltip || "Click to add Coating Completed Qty"}>
                            <div>{getCoatedQty(plan)}</div>
                            {(() => {
                              if (!Array.isArray(plan.usedFrom) || plan.usedFrom.length === 0) return null;
                              const splitLine = plan.usedFrom.map(u => `${u.companyName} ${u.qty}`).join(' · ');
                              return (
                                <div className="small text-muted text-wrap font-monospace mt-1" style={{ fontSize: '11px', lineHeight: '1.2' }} title={plan.usedFromTooltip}>
                                  {splitLine}
                                </div>
                              );
                            })()}
                          </td>
                          <td className={`py-3 text-center fw-bold ${plan.balanceToMake >= 0 ? 'text-success' : 'text-danger'}`}>
                            {plan.balanceToMake !== null && plan.balanceToMake !== undefined ? plan.balanceToMake : '-'}
                            {isPlanRowCompleted(plan) && <span className="d-block mt-1 badge bg-success" style={{ fontSize: 10 }}>COMPLETED</span>}
                          </td>
                          {isFirstInBottleVisualGroup && (
                            <td className="py-3 text-center align-middle" rowSpan={bottleVisualRowSpan}>{plan.boxQty !== null && plan.boxQty !== undefined && plan.boxQty > 0 ? plan.boxQty : '-'}</td>
                          )}
                          <td className="py-3 text-center">{plan.noOfBoxes !== null && plan.noOfBoxes !== undefined ? plan.noOfBoxes : '-'}</td>
                          <td className="py-3 text-center">{plan.dispatchPendingQty !== null && plan.dispatchPendingQty !== undefined ? plan.dispatchPendingQty : (plan.dispatchBalance || 0)}</td>
                          <td className="py-3 text-center">{plan.soldQty || 0}</td>
                          <td className="py-3 text-center small text-muted">{plan.remarks || '-'}</td>
                          <td className="py-3 text-center text-nowrap" style={{ minWidth: 220 }}>
                            <div className="d-flex align-items-center gap-2 justify-content-center">
                              <Link to={`/lacquer-plan/view/${plan._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View">
                                <i className="bi bi-eye fs-6"></i>
                              </Link>
                              {(() => {
                                const bottlePlans = contiguousPlanList.filter(p =>
                                  plan.blockKey ? p.blockKey === plan.blockKey : p._id === plan._id
                                );
                                const editUrl = `/lacquer-plan/edit/${bottlePlans.map(p => p._id).join(',')}`;
                                return (
                                  <Link
                                    to={editUrl}
                                    state={{ groupVariantIds: bottlePlans.map(p => p.variantId?._id || p.variantId) }}
                                    className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2"
                                    title="Edit Bottle Plan (All Brands)"
                                  >
                                    <i className="bi bi-pencil-square fs-6"></i>
                                  </Link>
                                );
                              })()}
                              {(() => {
                                const isProcessC = (plan.process || '').trim().toUpperCase() === 'C';
                                const coated = Number(plan.coatingCompletedQty ?? plan.coatedQty ?? 0);
                                const sentQty = Number(plan.sentToReadyQty || 0);
                                const sendable = Math.max(0, coated - sentQty);
                                const isFullySent = isProcessC && coated > 0 && sendable === 0;

                                if (!isProcessC) return null;

                                return (
                                  <>
                                    {sentQty > 0 && (
                                      <span
                                        className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 px-2 py-1 align-self-center"
                                        style={{ fontSize: 10, whiteSpace: 'nowrap' }}
                                        title={`Sent ${sentQty} / ${coated}`}
                                      >
                                        Sent {sentQty} / {coated}
                                      </span>
                                    )}
                                    {sendable > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => handleSendToReadyToDispatch(plan)}
                                        className="btn btn-sm btn-outline-success border-0 rounded-3 shadow-none p-2"
                                        title="Send to Ready To Dispatch"
                                      >
                                        <i className="bi bi-send fs-6"></i>
                                      </button>
                                    ) : isFullySent ? (
                                      <button
                                        type="button"
                                        disabled
                                        className="btn btn-sm btn-light border-0 rounded-3 shadow-none p-2 text-muted opacity-50"
                                        style={{ cursor: 'not-allowed' }}
                                        title="Sent"
                                      >
                                        <i className="bi bi-send fs-6"></i>
                                      </button>
                                    ) : null}
                                  </>
                                );
                              })()}
                              <button onClick={() => handleDelete(plan._id)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete">
                                <i className="bi bi-trash fs-6"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
          }) : (
                      <tr>
                        <td colSpan={showDate ? "17" : "16"} className="text-center py-5 text-muted">No plans found</td>
                      </tr>
          )}
                    </tbody>
      </table>
              );
            };

            return (
              <>
                <div className="page-content lacquer-plan-page lacquer-plan-list">
                  <style>{`
        tr.bottle-group-divider > td {
          border-top: 2px solid #adb5bd !important;
        }
        .data-table th, .data-table td {
          border-right: 1px solid #dee2e6;
        }
        .data-table td:first-child, .data-table th:first-child {
          border-left: 1px solid #dee2e6;
        }
        
        /* Zoom-Aware Workspace */
        .zoomable-workspace {
          --z: var(--zoom-scale, 1);
          font-size: calc(14px * var(--z));
        }
        .zoomable-workspace table.data-table {
          min-width: calc(1800px * var(--z)) !important;
        }
        .zoomable-workspace th, .zoomable-workspace td {
          padding: calc(1rem * var(--z)) calc(0.5rem * var(--z)) !important;
        }
        .zoomable-workspace th {
          font-size: calc(15px * var(--z)) !important;
        }
        .zoomable-workspace h5 {
          font-size: calc(1.25rem * var(--z)) !important;
          padding: calc(1rem * var(--z)) 0 !important;
          letter-spacing: calc(2px * var(--z)) !important;
        }
        .zoomable-workspace .badge {
          font-size: calc(11px * var(--z)) !important;
          padding: calc(0.25rem * var(--z)) calc(0.5rem * var(--z)) !important;
        }
        .zoomable-workspace .btn {
          font-size: calc(14px * var(--z)) !important;
          padding: calc(0.25rem * var(--z)) calc(0.5rem * var(--z)) !important;
        }
        .zoomable-workspace .btn i {
          font-size: calc(16px * var(--z)) !important;
        }
      `}</style>
                  <div className="page-header d-flex align-items-center justify-content-between companies-page-header lacquer-plan-list-header">
                    <div>
                      <h1 className="page-title">Lacquer Plan</h1>
                      <p className="page-subtitle">Manage and track your lacquer plans</p>
                    </div>
                    <div className="d-flex align-items-center gap-3 productions-page-actions lacquer-plan-list-actions">
                      <button onClick={toggleLanguage} className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold">
                        {language === 'en' ? 'ગુજરાતી' : 'English'}
                      </button>
                      <button onClick={handleExport} className="btn btn-outline-primary shadow-sm px-4 py-2 rounded-3">
                        <i className="bi bi-file-earmark-excel-fill me-2" /> Export Excel
                      </button>
                      <button onClick={() => setShowImportModal(true)} className="btn btn-outline-success shadow-sm px-4 py-2 rounded-3">
                        <i className="bi bi-file-earmark-excel-fill me-2" /> {labels.importExcel}
                      </button>
                      <Link to={`/lacquer-plan/add?date=${selectedDate}`} className="btn-accent shadow-sm px-4 py-2 rounded-3">
                        <i className="bi bi-plus-lg me-2" /> {labels.addPlan}
                      </Link>
                    </div>
                  </div>

                  <div className="dash-card mb-4">
                    <div className="dash-card-body p-3 border-bottom bg-white companies-dash-toolbar">
                      <div className="row g-3 align-items-end productions-filters-panel">
                        {/* Date Filter */}
                        <div className="col-12 col-sm-6 col-md-4 col-lg-2">
                          <label className="small text-muted fw-bold mb-1 d-block">{labels.date}</label>
                          <input
                            type="date"
                            className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                            value={selectedDate}
                            onChange={(e) => {
                              setSelectedDate(e.target.value);
                              setFromDate('');
                              setToDate('');
                            }}
                            style={{ borderRadius: 10, height: 38 }}
                          />
                        </div>

                        {/* From Date Filter */}
                        <div className="col-12 col-sm-6 col-md-4 col-lg-2">
                          <label className="small text-muted fw-bold mb-1 d-block">{labels.fromDate}</label>
                          <input
                            type="date"
                            className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                            value={fromDate}
                            onChange={(e) => {
                              setFromDate(e.target.value);
                              setSelectedDate('');
                            }}
                            style={{ borderRadius: 10, height: 38 }}
                          />
                        </div>

                        {/* To Date Filter */}
                        <div className="col-12 col-sm-6 col-md-4 col-lg-2">
                          <label className="small text-muted fw-bold mb-1 d-block">{labels.toDate}</label>
                          <input
                            type="date"
                            className="form-control form-control-sm border-light-subtle bg-light shadow-none w-100"
                            value={toDate}
                            onChange={(e) => {
                              setToDate(e.target.value);
                              setSelectedDate('');
                            }}
                            style={{ borderRadius: 10, height: 38 }}
                          />
                        </div>

                        {/* Company Filter */}
                        <div className="col-12 col-sm-6 col-md-4 col-lg-2">
                          <label className="small text-muted fw-bold mb-1 d-block">{labels.company}</label>
                          <Select
                            options={[{ value: '', label: 'All Companies' }, ...(companies || []).map(c => ({ value: c._id, label: c.name })), { value: 'UNASSIGNED', label: 'UNASSIGNED' }]}
                            value={selectedCompanyId ? (selectedCompanyId === 'UNASSIGNED' ? { value: 'UNASSIGNED', label: 'UNASSIGNED' } : { value: selectedCompanyId, label: companies?.find(c => c._id === selectedCompanyId)?.name || 'Unknown' }) : { value: '', label: 'All Companies' }}
                            onChange={(option) => handleCompanyChange(option.value)}
                            classNamePrefix="react-select"
                            menuPortalTarget={document.body}
                            menuPosition="fixed"
                            styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                          />
                        </div>

                        {/* Brand Filter */}
                        <div className="col-12 col-sm-6 col-md-4 col-lg-2">
                          <label className="small text-muted fw-bold mb-1 d-block">Brand</label>
                          <Select
                            options={[{ value: '', label: 'All Brands' }, ...(brands || []).filter(b => {
                              if (!selectedCompanyId || selectedCompanyId === 'UNASSIGNED') return true;
                              const bCompId = (b.companyId?._id || b.companyId)?.toString();
                              const bComp = (b.company?._id || b.company)?.toString();
                              return bCompId === selectedCompanyId?.toString() || bComp === selectedCompanyId?.toString();
                            }).map(b => ({ value: b._id, label: b.name }))]}
                            value={selectedBrandId ? { value: selectedBrandId, label: brands?.find(b => b._id === selectedBrandId)?.name || 'Unknown' } : { value: '', label: 'All Brands' }}
                            onChange={(option) => setSelectedBrandId(option.value)}
                            classNamePrefix="react-select"
                            menuPortalTarget={document.body}
                            menuPosition="fixed"
                            styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                          />
                        </div>

                        {/* Search */}
                        <div className="col-12 col-sm-6 col-md-4 col-lg-2">
                          <label className="small text-muted fw-bold mb-1 d-block">Search</label>
                          <div className="search-input-wrapper position-relative">
                            <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
                            <input
                              type="text"
                              className="form-control form-control-sm border-light-subtle bg-light ps-5 shadow-none w-100"
                              placeholder="Search bottle name..."
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              style={{ borderRadius: 10, height: 38 }}
                            />
                          </div>
                        </div>

                        {/* Buttons */}
                        <div className="col-12 col-sm-6 col-md-4 col-lg-2">
                          <button
                            onClick={handleReset}
                            type="button"
                            className="btn btn-sm btn-light border-light-subtle w-100"
                            style={{ borderRadius: 10, fontWeight: 600, height: 38 }}
                          >
                            Reset Filters
                          </button>
                        </div>
                        {/* Zoom Control */}
                        <div className="col-12 col-md-auto ms-md-auto d-flex align-items-end justify-content-end mt-3 mt-md-0 lacquer-plan-zoom-control-wrapper">
                          <ZoomControl value={zoom} onChange={setZoom} />
                        </div>
                      </div>
                    </div>

                    <div className="p-0">
                      {/* Data Rendering */}
                      {infiniteScroll.status === 'loadingFirst' ? (
                        <div className="text-center py-5 lacquer-plan-loading-first">
                          <div className="spinner-border text-primary" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      ) : infiniteScroll.status === 'error' ? (
                        <div className="text-center py-5 lacquer-plan-error-state" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <div className="bg-danger bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center mb-4" style={{ width: '80px', height: '80px' }}>
                            <i className="bi bi-exclamation-triangle text-danger" style={{ fontSize: '2rem' }}></i>
                          </div>
                          <h4 className="text-dark fw-bold mb-2">Error Loading Plans</h4>
                          <p className="text-muted mb-3">{infiniteScroll.error || 'An error occurred while loading lacquer plans'}</p>
                          <button onClick={() => infiniteScroll.retryLoad()} className="btn btn-danger py-2 px-4" style={{ borderRadius: '8px' }}>
                            <i className="bi bi-arrow-clockwise me-2"></i> Retry
                          </button>
                        </div>
                      ) : (!infiniteScroll.items || infiniteScroll.items.length === 0) ? (
                        <div className="text-center py-5 lacquer-plan-empty-state" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <div className="bg-light rounded-circle d-flex align-items-center justify-content-center mb-4" style={{ width: '80px', height: '80px' }}>
                            <i className="bi bi-calendar-x text-muted" style={{ fontSize: '2rem' }}></i>
                          </div>
                          <h4 className="text-dark fw-bold mb-2">No Lacquer Plan Found for This Date</h4>
                          <p className="text-muted mb-3">No lacquer plans found for the selected filters</p>

                          <div className="d-flex gap-3 align-items-center justify-content-center lacquer-plan-empty-actions">
                            <div className="lacquer-plan-empty-action">
                              <Link to={`/lacquer-plan/add?date=${selectedDate}`} className="btn btn-accent py-2 w-100 d-flex align-items-center justify-content-center" style={{ borderRadius: '8px', whiteSpace: 'nowrap' }}>
                                <i className="bi bi-plus-circle me-2"></i> Create New Plan
                              </Link>
                            </div>
                            {(!fromDate && !toDate) && (
                              <div className="lacquer-plan-empty-action">
                                <button
                                  onClick={handleImportPrevious}
                                  className="btn btn-outline-secondary py-2 w-100 d-flex align-items-center justify-content-center"
                                  style={{ borderRadius: '8px', whiteSpace: 'nowrap' }}
                                  disabled={importing}
                                >
                                  {importing ? (
                                    <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Importing...</>
                                  ) : (
                                    <><i className="bi bi-arrow-down-square me-2"></i> Import Previous Plan</>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <DoubleScrollContainer>
                          <div className="zoomable-workspace" style={{ '--zoom-scale': zoom / 100 }}>
                            {renderGroupedTables(infiniteScroll.items, !!(fromDate || toDate))}
                            {/* Sentinel for infinite scroll - mounted after first page loads */}
                            <div ref={infiniteScroll.sentinelRef} style={{ height: '600px' }} className="lacquer-plan-sentinel" />
                          </div>
                        </DoubleScrollContainer>
                      )}
                      {/* Loading more indicator */}
                      {infiniteScroll.status === 'loadingMore' && (
                        <div className="text-center py-4 border-top lacquer-plan-loading-more">
                          <div className="spinner-border spinner-border-sm text-primary" role="status">
                            <span className="visually-hidden">Loading more...</span>
                          </div>
                          <div className="text-muted small mt-2">Loading more lacquer plans...</div>
                        </div>
                      )}
                      {/* End of records indicator */}
                      {infiniteScroll.status !== 'loadingFirst' && !infiniteScroll.hasMore && infiniteScroll.items.length > 0 && (
                        <div className="text-center py-4 border-top text-muted small lacquer-plan-no-more">
                          No more records
                        </div>
                      )}
                    </div>
                  </div>

                  <ImportExcelModal
                    show={showImportModal}
                    onClose={() => setShowImportModal(false)}
                    onImportComplete={() => fetchPlans()}
                  />

                  {selectedPlan && (
                    <>
                      <OrderQtyModal
                        show={showOrderQtyModal}
                        plan={selectedPlan}
                        onClose={() => {
                          setShowOrderQtyModal(false);
                          setSelectedPlan(null);
                        }}
                        onSave={() => {
                          setShowOrderQtyModal(false);
                          setSelectedPlan(null);
                          handleModalSave();
                        }}
                      />

                      <CoatingQtyModal
                        show={showCoatingQtyModal}
                        plan={selectedPlan}
                        onClose={() => {
                          setShowCoatingQtyModal(false);
                          setSelectedPlan(null);
                        }}
                        onSave={() => {
                          setShowCoatingQtyModal(false);
                          setSelectedPlan(null);
                          handleModalSave();
                        }}
                      />
                    </>
                  )}
                </div>
              </>
            );
          }
