import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchPrintingPlans, deletePrintingPlan } from '../../redux/slices/printingPlanSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../../context/AbilityContext';
import API from '../../services/api';
import Swal from 'sweetalert2';
import Select from 'react-select';
import ImportExcelModal from './ImportExcelModal';
import { usePrintingPlanLanguage } from '../../hooks/usePrintingPlanLanguage';
import { usePrintingPlanInfiniteScroll } from '../../hooks/usePrintingPlanInfiniteScroll';
import { buildMultipleContiguousGroups } from '../../utils/tableGrouping';
import ZoomControl from '../../components/ZoomControl';
import { downloadPrintingPlanExcel } from '../../utils/printingPlanExport';
import { PrintingOrderQtyModal, PrintingReadyQtyModal } from '../../components/PrintingQuantityModals';
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
    <div className="printing-plan-double-scroll">
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
        style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}
        className="companies-list-desktop printing-plan-main-scroll"
      >
        <div ref={contentRef} style={{ display: 'inline-block', minWidth: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default function PrintingPlan() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlDate = searchParams.get('date');
  const ability = useAbility(AbilityContext);
  const { plans, loading } = useSelector((state) => state.printingPlans);
  const { companies } = useSelector((state) => state.companies || { companies: [] });
  const { brands } = useSelector((state) => state.brands || { brands: [] });
  const { variants } = useSelector((state) => state.variants || { variants: [] });
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs || { bottleSpecs: [] });
  const { labels, language, toggleLanguage } = usePrintingPlanLanguage();
  
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(urlDate || today.toISOString().split('T')[0]);

  useEffect(() => {
    if (urlDate) {
      setSelectedDate(urlDate);
    }
  }, [urlDate]);

  const [showImportModal, setShowImportModal] = useState(false);
  const [quantityModal, setQuantityModal] = useState({ type: null, plan: null });
  
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  
  const [importing, setImporting] = useState(false);

  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('printingPlanZoom');
    return saved ? parseInt(saved, 10) : 100;
  });

  // Initialize infinite scroll hook with current filters
  const infiniteScroll = usePrintingPlanInfiniteScroll({
    selectedDate: (!fromDate && !toDate) ? selectedDate : '',
    fromDate,
    toDate,
    search,
    selectedCompanyId
  });

  useEffect(() => {
    localStorage.setItem('printingPlanZoom', zoom.toString());
  }, [zoom]);

  const fetchPlans = () => {
    infiniteScroll.resetAndLoad();
  };

  const openQuantityModal = (type, plan) => setQuantityModal({ type, plan });

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchBrands({ pagination: 'false' }));
    dispatch(fetchVariants({ pagination: 'false' }));
    dispatch(fetchBottleSpecs({ pagination: 'false', type: 'all' }));
  }, [dispatch]);

  // Initial load on mount
  useEffect(() => {
    infiniteScroll.resetAndLoad();
  }, []); // Only on mount

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

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      infiniteScroll.resetAndLoad();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [selectedDate, fromDate, toDate, search, selectedCompanyId]);

  // Refetch when user returns to this page (tab/window focus or navigation)
  useEffect(() => {
    const handleFocus = () => {
      infiniteScroll.resetAndLoad();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [selectedDate, fromDate, toDate, search, selectedCompanyId]);

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
    dispatch(fetchPrintingPlans({ date: todayStr }));
  };

  const handleDelete = (id) => {
    Swal.fire({
      title: 'Are you sure?',
      text: 'Do you really want to delete this plan?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete it!'
    }).then(async (result) => {
      if (!result.isConfirmed) return;

      try {
        const action = await dispatch(deletePrintingPlan(id));
        if (!deletePrintingPlan.fulfilled.match(action)) {
          const msg = action.payload || 'Failed to delete plan';
          Swal.fire('Delete failed', msg, 'error');
          return;
        }

        infiniteScroll.removeItem(id);
        await infiniteScroll.resetAndLoad();
        Swal.fire('Deleted!', 'Plan has been deleted.', 'success');
      } catch (error) {
        Swal.fire('Delete failed', error?.message || 'Failed to delete plan', 'error');
      }
    });
  };

  const handleSendToReadyToDispatch = async (plan) => {
    try {
      const orderQty = Number(plan.orderQty || 0);
      const printed = Number(plan.producedQty ?? 0);
      const alreadySent = Number(plan.sentToReadyQty || 0);
      const sendable = Math.max(0, printed - alreadySent);
      const balanceToMake = printed - orderQty;

      if (printed <= 0) {
        Swal.fire({
          icon: 'info',
          title: 'No Printing Done Yet',
          text: 'No printing done yet, nothing to send.',
          confirmButtonText: 'OK'
        });
        return;
      }

      if (sendable <= 0) {
        Swal.fire({
          icon: 'info',
          title: 'Nothing to Send',
          text: 'All printed quantity for this row has already been sent to Ready To Dispatch.',
          toast: true,
          position: 'top-end',
          timer: 3000,
          showConfirmButton: false
        });
        return;
      }

      const remainingUnprinted = Math.max(0, orderQty - printed);

      let selectedOption = null;
      let selectedQty = sendable;
      let remainingOrderAfterDispatch = remainingUnprinted;
      let remainingPrintedAfterDispatch = 0;
      let balanceAfterDispatch = 0 - remainingUnprinted;

      if (remainingUnprinted > 0) {
        // Partial production: order > printed. Present both production options!
        const dialogResult = await Swal.fire({
          title: 'Production Actions & Dispatch',
          width: 650,
          html: `
          <div class="text-start py-1">
            <div class="p-3 mb-3 rounded-3" style="background: rgba(0, 174, 239, 0.08); border: 1px solid rgba(0, 174, 239, 0.25);">
              <div class="fw-bold mb-2 text-dark" style="font-size: 15px;">
                ${plan.bottleName} ${plan.printingToBeDone ? ' - ' + plan.printingToBeDone : ''}
              </div>
              <div class="row g-2 text-center" style="font-size: 12px;">
                <div class="col-4">
                  <div class="text-muted text-uppercase" style="font-size: 10px; font-weight: 600;">Order Qty</div>
                  <div class="fw-bold text-dark fs-6">${orderQty}</div>
                </div>
                <div class="col-4">
                  <div class="text-muted text-uppercase" style="font-size: 10px; font-weight: 600;">Printed Qty</div>
                  <div class="fw-bold text-primary fs-6">${printed}</div>
                </div>
                <div class="col-4">
                  <div class="text-muted text-uppercase" style="font-size: 10px; font-weight: 600;">Balance To Make</div>
                  <div class="fw-bold ${balanceToMake >= 0 ? 'text-success' : 'text-danger'} fs-6">${balanceToMake}</div>
                </div>
                <div class="col-6 mt-2">
                  <div class="text-muted text-uppercase" style="font-size: 10px; font-weight: 600;">Already Dispatched</div>
                  <div class="fw-bold text-secondary">${alreadySent}</div>
                </div>
                <div class="col-6 mt-2">
                  <div class="text-muted text-uppercase" style="font-size: 10px; font-weight: 600;">Available To Dispatch</div>
                  <div class="fw-bold text-success">${sendable}</div>
                </div>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small text-muted text-uppercase mb-2" style="font-size: 11px;">Select Production Decision</label>
              <div class="d-flex flex-column gap-2">
                <label class="d-flex align-items-start p-3 rounded-3 border cursor-pointer" id="card-option-1" style="background: #fff; border-color: #dee2e6; cursor: pointer;">
                  <input type="radio" name="swal-prod-option" id="choice-close-order" value="CLOSE_ENTIRE_ORDER" class="form-check-input me-3 mt-1">
                  <div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">Option A: Send & Close Entire Order</div>
                    <div class="text-muted small mt-1" style="font-size: 11.5px; line-height: 1.4;">
                      Sends the selected quantity to Ready To Dispatch and cancels the unsent remainder of the order. The original row will be closed from active production.
                    </div>
                  </div>
                </label>

                <label class="d-flex align-items-start p-3 rounded-3 border cursor-pointer" id="card-option-2" style="background: #fff; border-color: #dee2e6; cursor: pointer;">
                  <input type="radio" name="swal-prod-option" id="choice-split-order" value="SPLIT_REMAINING_ORDER" class="form-check-input me-3 mt-1">
                  <div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">Option B: Send & Continue Remaining Order</div>
                    <div class="text-muted small mt-1" style="font-size: 11.5px; line-height: 1.4;">
                      Sends the selected quantity to Ready To Dispatch and keeps the remaining order and any printed quantity not yet dispatched active in the Printing Plan.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small text-muted text-uppercase mb-2" style="font-size: 11px;">Dispatch Quantity</label>
              <div class="d-flex gap-3">
                <label id="choice-qty-whole-label" class="d-flex align-items-center p-2 px-3 rounded border cursor-pointer" style="background: #f8fafc; cursor: pointer;">
                  <input type="radio" name="swal-qty-choice" id="choice-qty-whole" value="whole" checked class="form-check-input me-2 mt-0">
                  <span class="small">All available (<strong>${sendable}</strong> units)</span>
                </label>
                <label id="choice-qty-partial-label" class="d-flex align-items-center p-2 px-3 rounded border cursor-pointer" style="background: #f8fafc; cursor: pointer;">
                  <input type="radio" name="swal-qty-choice" id="choice-qty-partial" value="partial" class="form-check-input me-2 mt-0">
                  <span class="small">Custom Partial Quantity</span>
                </label>
              </div>
            </div>

            <div id="swal-partial-container" class="mb-2" style="display: none;">
              <label class="form-label small fw-bold text-muted mb-1" for="swal-partial-qty">Quantity to Dispatch (1 - ${sendable})</label>
              <input type="number" id="swal-partial-qty" class="form-control shadow-none" placeholder="Enter quantity" min="1" max="${sendable}" step="1" inputmode="numeric" value="${sendable}">
              <div id="swal-partial-error" class="text-danger small mt-1" style="display: none;"></div>
            </div>
          </div>
        `,
          didOpen: () => {
            const wholeRadio = document.getElementById('choice-qty-whole');
            const partialRadio = document.getElementById('choice-qty-partial');
            const partialContainer = document.getElementById('swal-partial-container');
            const partialInput = document.getElementById('swal-partial-qty');
            const errorDiv = document.getElementById('swal-partial-error');

            const opt1Radio = document.getElementById('choice-close-order');
            const opt2Radio = document.getElementById('choice-split-order');
            const card1 = document.getElementById('card-option-1');
            const card2 = document.getElementById('card-option-2');

            const updateCardStyles = () => {
              [card1, card2].forEach(c => {
                if (c) {
                  c.style.borderColor = '#dee2e6';
                  c.style.background = '#fff';
                }
              });
              if (opt1Radio && opt1Radio.checked && card1) {
                card1.style.borderColor = '#00aeef';
                card1.style.background = 'rgba(0, 174, 239, 0.05)';
              } else if (opt2Radio && opt2Radio.checked && card2) {
                card2.style.borderColor = '#00aeef';
                card2.style.background = 'rgba(0, 174, 239, 0.05)';
              }
            };
            updateCardStyles();
            opt1Radio?.addEventListener('change', updateCardStyles);
            opt2Radio?.addEventListener('change', updateCardStyles);

            const setQuantityMode = (mode) => {
              const isPartial = mode === 'partial';
              partialRadio.checked = isPartial;
              wholeRadio.checked = !isPartial;
              partialContainer.hidden = !isPartial;
              partialContainer.style.display = isPartial ? 'block' : 'none';
              if (isPartial) {
                requestAnimationFrame(() => {
                  partialInput.focus();
                  partialInput.select();
                });
              } else {
                if (errorDiv) {
                  errorDiv.style.display = 'none';
                  errorDiv.innerText = '';
                }
              }
            };

            const togglePartial = () => setQuantityMode(partialRadio.checked ? 'partial' : 'whole');
            wholeRadio.addEventListener('change', togglePartial);
            partialRadio.addEventListener('change', togglePartial);
            document.getElementById('choice-qty-whole-label').addEventListener('click', () => setQuantityMode('whole'));
            document.getElementById('choice-qty-partial-label').addEventListener('click', () => setQuantityMode('partial'));
            setQuantityMode('whole');

            const enforceAvailableMaximum = () => {
              const enteredQty = partialInput.valueAsNumber;
              if (Number.isFinite(enteredQty) && enteredQty > sendable) {
                partialInput.value = String(sendable);
              }
              if (errorDiv) {
                errorDiv.style.display = 'none';
                errorDiv.innerText = '';
              }
            };
            partialInput.addEventListener('input', enforceAvailableMaximum);
            partialInput.addEventListener('change', enforceAvailableMaximum);
            partialInput.addEventListener('blur', enforceAvailableMaximum);
          },
          preConfirm: () => {
            const optRadio = document.querySelector('input[name="swal-prod-option"]:checked');
            const partialRadio = document.getElementById('choice-qty-partial');
            const partialInput = document.getElementById('swal-partial-qty');
            const errorDiv = document.getElementById('swal-partial-error');

            if (!optRadio) {
              Swal.showValidationMessage('Please select a production decision.');
              return false;
            }

            const showError = (msg) => {
              if (errorDiv) {
                errorDiv.innerText = msg;
                errorDiv.style.display = 'block';
              }
              return false;
            };

            const option = optRadio.value;
            let qty = sendable;

            if (partialRadio && partialRadio.checked) {
              const rawVal = partialInput ? partialInput.value.trim() : '';
              if (!rawVal) return showError('Please enter a quantity.');
              if (rawVal.includes('.')) return showError('Decimals are not allowed.');
              const num = Number(rawVal);
              if (isNaN(num) || !Number.isInteger(num)) return showError('Please enter a valid whole number.');
              if (num <= 0) return showError('Quantity must be greater than zero.');
              if (num > sendable) return showError(`Quantity cannot exceed available sendable quantity (${sendable}).`);
              qty = num;
            }

            return { option, qty };
          },
          showCancelButton: true,
          confirmButtonText: 'Next <i class="bi bi-arrow-right ms-1"></i>',
          cancelButtonText: 'Cancel',
          customClass: {
            confirmButton: 'btn btn-primary px-4 py-2 me-2',
            cancelButton: 'btn btn-light px-4 py-2'
          },
          buttonsStyling: false
        });

        if (!dialogResult.isConfirmed || !dialogResult.value) return;
        selectedOption = dialogResult.value.option;
        selectedQty = dialogResult.value.qty;
        const totalDispatchedAfterAction = alreadySent + selectedQty;
        remainingOrderAfterDispatch = Math.max(0, orderQty - totalDispatchedAfterAction);
        remainingPrintedAfterDispatch = Math.max(0, printed - totalDispatchedAfterAction);
        balanceAfterDispatch = remainingPrintedAfterDispatch - remainingOrderAfterDispatch;

        // Show confirmation dialog with exact dispatch and cancellation/remaining quantities
        const isOption1 = selectedOption === 'CLOSE_ENTIRE_ORDER';

        let confirmHtml = '';
        let confirmTitle = '';
        let confirmBtnText = 'Yes, Proceed';
        let confirmBtnClass = 'btn btn-primary px-4 py-2 me-2';

        if (isOption1) {
          confirmTitle = 'Confirm Close Entire Order';
          confirmBtnText = 'Yes, Close & Dispatch';
          confirmBtnClass = 'btn btn-danger px-4 py-2 me-2';
          confirmHtml = `
          <div class="text-start py-2">
            <p class="mb-3 text-dark">Please confirm closing the order and dispatching:</p>
            <div class="p-3 rounded border bg-light mb-3" style="font-size: 13px;">
              <div class="d-flex justify-content-between mb-1">
                <span>Dispatch to Ready To Dispatch:</span>
                <strong class="text-success">${selectedQty} units</strong>
              </div>
              <div class="d-flex justify-content-between mb-1">
                <span>Cancel Remaining Order Quantity:</span>
                <strong class="text-danger">${remainingOrderAfterDispatch} units</strong>
              </div>
              <div class="d-flex justify-content-between">
                <span>Original Order:</span>
                <strong>${orderQty} units</strong>
              </div>
            </div>
            <div class="alert alert-warning py-2 px-3 small mb-0">
              <i class="bi bi-exclamation-triangle-fill me-1"></i>
              This row will be <strong>closed</strong> from active production.
            </div>
          </div>
        `;
        } else {
          confirmTitle = 'Confirm Split Order';
          confirmBtnText = 'Yes, Split & Dispatch';
          confirmHtml = `
          <div class="text-start py-2">
            <p class="mb-3 text-dark">Please confirm splitting the order and dispatching:</p>
            <div class="p-3 rounded border bg-light mb-3" style="font-size: 13px;">
              <div class="d-flex justify-content-between mb-1">
                <span>Dispatch to Ready To Dispatch:</span>
                <strong class="text-success">${selectedQty} units</strong>
              </div>
              <div class="d-flex justify-content-between mb-1">
                <span>Carry Forward Remaining Order:</span>
                <strong class="text-primary">${remainingOrderAfterDispatch} units</strong>
              </div>
              <div class="d-flex justify-content-between">
                <span>New Active Balance To Make:</span>
                <strong class="${balanceAfterDispatch >= 0 ? 'text-success' : 'text-danger'}">${balanceAfterDispatch} units</strong>
              </div>
            </div>
            <div class="alert alert-info py-2 px-3 small mb-0">
              <i class="bi bi-info-circle-fill me-1"></i>
              The remaining order (<strong>${remainingOrderAfterDispatch}</strong> units) and undispatched printed quantity (<strong>${remainingPrintedAfterDispatch}</strong> units) will remain active in Printing Plan.
            </div>
          </div>
        `;
        }

        const confirmResult = await Swal.fire({
          title: confirmTitle,
          html: confirmHtml,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: confirmBtnText,
          cancelButtonText: 'Back',
          customClass: {
            confirmButton: confirmBtnClass,
            cancelButton: 'btn btn-light px-4 py-2'
          },
          buttonsStyling: false
        });

        if (!confirmResult.isConfirmed) return;
      } else {
        // Row is already completed (printed >= order)
        // Calculate ready boxes and loose qty for sendable amount
        const bottlePerBox = Number(plan.boxQty) || 0;
        const sendableReadyBoxes = bottlePerBox > 0 ? Math.floor(sendable / bottlePerBox) : 0;
        const sendableLooseQty = bottlePerBox > 0 ? sendable - (sendableReadyBoxes * bottlePerBox) : sendable;

        const confirmResult = await Swal.fire({
          title: 'Send to Ready To Dispatch',
          html: `
          <div class="text-start py-2">
            <p class="mb-2">Send <strong>${sendable}</strong> units of <strong>${plan.bottleName}</strong> to Ready To Dispatch?</p>
            <div class="d-flex justify-content-between p-2 rounded bg-light border" style="font-size: 13px;">
              <span>Order: <strong>${orderQty}</strong></span>
              <span>Printed: <strong>${printed}</strong></span>
              <span>Already Sent: <strong>${alreadySent}</strong></span>
              <span class="text-success">Sending: <strong>${sendable}</strong></span>
            </div>
            <div class="d-flex justify-content-between p-2 rounded bg-light border mt-2" style="font-size: 13px;">
              <span>Ready Boxes: <strong>${sendableReadyBoxes}</strong></span>
              <span>Loose: <strong>${sendableLooseQty}</strong></span>
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

        if (!confirmResult.isConfirmed) return;
        selectedOption = null;
        selectedQty = sendable;
      }

      // Send to API with selected option and qty
      const requestData = {
        source: 'printing',
        planId: plan._id,
        qty: selectedQty
      };
      if (selectedOption) requestData.action = selectedOption;
      const response = await API.post('/ready-to-dispatch/from-plan', requestData);

      if (response.data.success) {
        const { sheetId, lineId, isExisting, warnings = [] } = response.data.data;

        // Refetch plans so active/closed changes reflect immediately
        fetchPlans();

        Swal.fire({
          icon: 'success',
          title: selectedOption === 'SPLIT_REMAINING_ORDER' ? 'Order Split & Dispatched' : (isExisting ? 'Added to Ready To Dispatch' : 'Sent to Ready To Dispatch'),
          text: selectedOption === 'SPLIT_REMAINING_ORDER'
            ? `Dispatched ${selectedQty} units. Remaining order ${remainingOrderAfterDispatch}, including ${remainingPrintedAfterDispatch} printed units, retained in active plan.`
            : (selectedOption === 'CLOSE_ENTIRE_ORDER' && remainingOrderAfterDispatch > 0
              ? `Dispatched ${selectedQty} units. Remaining ${remainingOrderAfterDispatch} units cancelled and row closed.`
              : 'Sent to Ready To Dispatch successfully.'),
          toast: true,
          position: 'top-end',
          timer: 4000,
          showConfirmButton: false
        });

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

        // Stay on Printing Plan page so the user sees updated/removed row, but offer navigation
        Swal.fire({
          icon: 'success',
          title: selectedOption === 'SPLIT_REMAINING_ORDER' ? 'Order Split & Dispatched' : 'Order Dispatched & Closed',
          text: selectedOption === 'SPLIT_REMAINING_ORDER'
            ? `Dispatched ${selectedQty} units. Remaining order ${remainingOrderAfterDispatch}, including ${remainingPrintedAfterDispatch} printed units, retained in active plan.`
            : `Dispatched ${selectedQty} units. Remaining ${remainingOrderAfterDispatch} units cancelled and row closed.`,
          showConfirmButton: true,
          confirmButtonText: 'View in Ready To Dispatch',
          showCancelButton: true,
          cancelButtonText: 'Stay on Plan'
        }).then((result) => {
          if (result.isConfirmed && sheetId) {
            const focusQuery = lineId ? `?focus=${lineId}${!isExisting ? '&new=true' : ''}` : '';
            navigate(`/ready-to-dispatch/view/${sheetId}${focusQuery}`);
          }
        });
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
        title: 'Import Previous Plan?',
        html: `
          <p class="mb-3 text-muted">Select the date you want to import the Printing Plan from.</p>
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
      const res = await API.post('/printing-plan/import-previous', { targetDate: selectedDate, sourceDate });
      if (res.data.success) {
        if (res.data.requiresConfirmation) {
          setImporting(false);
          const choice = await Swal.fire({
            title: 'Previous Plan Modified',
            html: `
              <p class="text-muted mb-2">The source plan for <strong>${sourceDate}</strong> has <strong>${res.data.editedCount}</strong> entry(s) that were manually edited after import.</p>
              <p class="mb-0 fw-bold">How would you like to carry forward this plan?</p>
            `,
            icon: 'warning',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: 'Import with changes',
            confirmButtonColor: '#3085d6',
            denyButtonText: 'Import without changes',
            denyButtonColor: '#10b981',
            cancelButtonText: 'Cancel'
          });

          if (!choice.isConfirmed && !choice.isDenied) {
            return;
          }

          const importMode = choice.isConfirmed ? 'with_changes' : 'without_changes';
          setImporting(true);
          const finalRes = await API.post('/printing-plan/import-previous', {
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
    } catch(err) {
      Swal.fire('Error', err.response?.data?.message || 'Failed to import previous day', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      if (infiniteScroll.items.length === 0) {
        Swal.fire('No Data', 'There is no data to export for the selected filters.', 'info');
        return;
      }
      await downloadPrintingPlanExcel({
        plans: infiniteScroll.items,
        date: (!fromDate && !toDate) ? selectedDate : '',
        fromDate,
        toDate,
        companies
      });
    } catch (err) {
      console.error(err);
      Swal.fire('Export Failed', err.message || 'An error occurred while generating the export.', 'error');
    }
  };

  const renderGroupedTables = (planList, showDate = false) => {
    if (!planList || planList.length === 0) {
      return renderDailyTable([], showDate, 0);
    }
    const groupedByCompany = {};
    planList.forEach(plan => {
      const compId = (plan.canonicalCompanyId || plan.companyId?._id || plan.companyId || plan.brandId?.companyId?._id || plan.brandId?.company?._id || plan.company?._id || 'UNASSIGNED').toString();
      const compName = plan.companyName || plan.companyId?.name || plan.company?.name || plan.brandId?.companyId?.name || plan.brandId?.company?.name || (compId === 'UNASSIGNED' ? 'UNASSIGNED' : 'Unassigned');
      if (!groupedByCompany[compId]) {
        groupedByCompany[compId] = { id: compId, name: compId === 'UNASSIGNED' ? 'UNASSIGNED' : (compName || 'Unassigned'), plans: [] };
      }
      groupedByCompany[compId].plans.push(plan);
    });

    const sortedCompIds = Object.keys(groupedByCompany).sort((a, b) =>
      groupedByCompany[a].name.localeCompare(groupedByCompany[b].name, undefined, { numeric: true, sensitivity: 'base' })
    );

    let currentSrNo = 0;
    return sortedCompIds.map(compId => {
      const groupData = groupedByCompany[compId];
      const startSrNo = currentSrNo;
      currentSrNo += groupData.plans.length;
      return (
        <div key={groupData.id} className="mb-4">
          <h5 className="text-center py-3 bg-light border-top border-bottom text-uppercase fw-bold text-dark tracking-wide mb-0" style={{ letterSpacing: '2px' }}>
            {groupData.name}
          </h5>
          {renderDailyTable(groupData.plans, showDate, startSrNo)}
        </div>
      );
    });
  };

  const renderDailyTable = (planList, showDate = false, startSrNo = 0) => {
    
    const isShreno = planList.length > 0 && (planList[0].companyName || planList[0].companyId?.name || planList[0].company?.name || '').toUpperCase().includes('SHRENO');
    
    const getBoundary = (r) => `${r.canonicalCompanyId || r.companyId?._id || r.companyId || r.companyName || r.company || 'UNASSIGNED'}_${r.planDate}`;
    
    // Use a stable ID for non-grouped SHRENO columns instead of Math.random()
    const getRowStableId = (r) => r._id || `temp-${r.excelRowNumber || r.srNo || Math.floor(Math.random() * 1000000)}`;
    
    const groupConfigs = [
        { idKey: '_cBottle', keySelector: r => {
             // Extract plain bottle name from plainBottleName (backend field), plainBottle, or BottleSpec lookup
             // This ensures PLAIN and colored rows of the same bottle get grouped together
             const plainName = (r.plainBottleName || r.plainBottle || r.bottleName || '').trim().toUpperCase();
             return `${getBoundary(r)}_${plainName}`;
        }},
        { idKey: '_cShade', keySelector: r => {
             const shade = (r.coatingShade || '').trim().toUpperCase();
             return shade ? `${getBoundary(r)}_${(r.plainBottle || r.bottleName || '').trim().toUpperCase()}_${shade}` : `nogroup_${getRowStableId(r)}`;
        }},
        { idKey: '_cPrinting', keySelector: r => isShreno ? `nogroup_${getRowStableId(r)}` : `${getBoundary(r)}_${(r.plainBottle || r.bottleName || '').trim().toUpperCase()}_${r.coatingShade}_${r.printingToBeDone}` },
        { idKey: '_cTextColor', keySelector: r => isShreno ? `nogroup_${getRowStableId(r)}` : `${getBoundary(r)}_${(r.plainBottle || r.bottleName || '').trim().toUpperCase()}_${r.coatingShade}_${r.printingToBeDone}_${r.textColor}` },
        { idKey: '_cStock', keySelector: r => {
             const shade = (r.coatingShade || '').trim().toUpperCase();
             if (shade !== 'PLAIN') return `nogroup_${getRowStableId(r)}`;
             const bName = (r.plainBottle || r.bottleName || '').trim().toUpperCase();
             return `${getBoundary(r)}_${bName}_${shade}`;
        }},
        { idKey: '_cBoxQty', keySelector: r => `${getBoundary(r)}_${(r.plainBottle || r.bottleName || '').trim().toUpperCase()}` }
    ];
    
    const { contiguousList: contiguousPlanList, groupSpans } = buildMultipleContiguousGroups(planList, groupConfigs);
    
    const renderedSets = {
        _cBottle: new Set(),
        _cShade: new Set(),
        _cPrinting: new Set(),
        _cTextColor: new Set(),
        _cStock: new Set(),
        _cBoxQty: new Set()
    };

    const shrenoComponentHeaders = isShreno ? 
        (contiguousPlanList.find(p => p.componentHeadersList && p.componentHeadersList.length > 0)?.componentHeadersList || []) 
        : [];

    const hasPrintingToBeDone = contiguousPlanList.some(p => p.printingToBeDone || p.variantId?.variantName || p.variantName);

    return (
      <table className="data-table" style={{ minWidth: '1800px', borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
          <tr style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', color: 'white' }}>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.sr}</th>
            {showDate && <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.date}</th>}
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.bottleName}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.coatingShade}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.brand}</th>
            {hasPrintingToBeDone && <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white', minWidth: '220px' }}>{labels.printingToBeDone}</th>}
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{isShreno && language === 'gu' ? 'ટાઈપ' : labels.textColor}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.plainColouredBottleStock}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.orderQty}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.readyPrintedQty}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.balanceToMake}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.bottlePerBox}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.noOfOrderBoxes}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.readyBoxes}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.balanceToBeDispatched}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.soldQty}</th>
            {shrenoComponentHeaders.map((comp, idx) => (
                <th key={`comp_th_${idx}`} className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{comp}</th>
            ))}
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.remarks}</th>
            <th className="py-3 text-uppercase fw-bolder text-center" style={{ width: 100, fontSize: '15px', backgroundColor: 'var(--accent)', color: 'white' }}>{labels.actions}</th>
          </tr>
        </thead>
        <tbody>
          {contiguousPlanList.length > 0 ? contiguousPlanList.map((plan, index) => {
            
            const renderGroupedTd = (colKey, content, className = "py-3 text-center align-middle") => {
                const groupId = plan[colKey];
                if (!groupId) return <td className={className}>{content}</td>;
                const isFirst = !renderedSets[colKey].has(groupId);
                if (isFirst) {
                    renderedSets[colKey].add(groupId);
                    const rSpan = groupSpans[colKey][groupId] || 1;
                    return <td className={className} rowSpan={rSpan}>{content}</td>;
                }
                return null;
            };

            const isFirstInBottleBlock = index === 0 || contiguousPlanList[index - 1]._cBottle !== plan._cBottle;
            
            const rowClasses = [
                'align-middle',
                'transition-all',
                'hover-bg-light',
                isFirstInBottleBlock && index !== 0 ? 'bottle-group-divider' : '',
                (!renderedSets._cBottle.has(plan._cBottle)) ? 'border-top' : 'border-bottom'
            ].filter(Boolean).join(' ');

            const isBottleFirst = !renderedSets._cBottle.has(plan._cBottle);
            const isShadeFirst = !renderedSets._cShade.has(plan._cShade);
            const isPrintingFirst = !renderedSets._cPrinting.has(plan._cPrinting);
            const isTextFirst = !renderedSets._cTextColor.has(plan._cTextColor);

            // UI Debug log as explicitly requested
            if (isShreno) {
                console.log("[SHRENO UI FINAL ROW]", {
                    rowNumber: index,
                    bottleName: plan.bottleName,
                    coatingShade: plan.coatingShade,
                    printingToBeDone: plan.printingToBeDone,
                    textColor: plan.textColor
                });
                
                console.log("[SHRENO CELL TRACE]", {
                    rowNumber: index,
                    renderBottleCell: isBottleFirst,
                    renderShadeCell: isShadeFirst,
                    renderPrintingCell: isPrintingFirst,
                    renderTextColorCell: isTextFirst,

                    bottleValue: plan.bottleName,
                    shadeValue: plan.coatingShade,
                    printingValue: plan.printingToBeDone,
                    textColorValue: plan.textColor
                });
            }

            return (
            <tr key={plan._id || index} className={rowClasses}>
              <td className="py-3 ps-4 text-start">
                <span className="text-muted fw-bold" style={{ fontSize: 13 }}>{(startSrNo + index + 1).toString().padStart(2, '0')}</span>
              </td>
              {showDate && <td className="py-3 text-center">{new Date(plan.planDate).toLocaleDateString()}</td>}
              
              {renderGroupedTd('_cBottle', plan.plainBottleName || plan.plainBottle || plan.bottleName || '*', "py-3 text-center fw-600 text-dark align-middle")}
              
              {renderGroupedTd('_cShade', plan.coatingShade ? (
                <span className="badge bg-soft-warning text-warning-accent px-2 py-1" style={{ fontSize: 10 }}>{plan.coatingShade}</span>
              ) : '-')}
              
              <td className="py-3 text-center text-accent fw-500 align-middle">
                {plan.brandId?.name || plan.brandName || '-'}
              </td>
              
              {hasPrintingToBeDone && (
                <td className="py-3 text-center">
                  <span className="badge bg-soft-primary text-primary px-2 py-1 text-wrap" style={{ fontSize: 11, maxWidth: '280px', display: 'inline-block', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.3' }}>
                    {plan.printingToBeDone || plan.variantId?.variantName || plan.variantName || '-'}
                  </span>
                </td>
              )}
              
              {renderGroupedTd('_cTextColor', (
                <span className="badge bg-soft-secondary text-secondary px-2 py-1" style={{ fontSize: 11 }}>{plan.textColor || '-'}</span>
              ))}
              
              {renderGroupedTd('_cStock', (() => {
                  const isPlain = (plan.coatingShade || '').trim().toUpperCase() === 'PLAIN';
                  const allocs = Array.isArray(plan.stockAllocation) ? plan.stockAllocation : [];
                  const suppliers = (companies || []).filter(c => c.isStockSupplier).map(c => c._id.toString());
                  const hasSupplier = allocs.some(a => suppliers.includes((a.companyId?._id || a.companyId)?.toString()));
                  const showBadge = isPlain && (allocs.length > 1 || hasSupplier);
                  const names = allocs.map(a => {
                    const cId = (a.companyId?._id || a.companyId)?.toString();
                    return a.companyName || a.companyId?.name || (companies || []).find(c => c._id === cId)?.name || 'Company';
                  });
                  const tooltip = allocs.map(a => {
                    const cId = (a.companyId?._id || a.companyId)?.toString();
                    const n = a.companyName || a.companyId?.name || (companies || []).find(c => c._id === cId)?.name || 'Company';
                    return `${n}: ${a.qty || 0}`;
                  }).join(', ');

                  return (
                    <>
                      <div>{plan.plainBottleStockDisplay ?? plan.plainBottleStock ?? ''}</div>
                      {showBadge && (
                        <span
                          className="badge bg-soft-info text-info border border-info border-opacity-25 px-1 py-0 mt-1 d-inline-block"
                          style={{ fontSize: '10px', cursor: 'help' }}
                          title={tooltip}
                        >
                          {names.join(' + ')}
                        </span>
                      )}
                      {plan.allocationShortfall && (
                        <div className="badge bg-danger text-white mt-1 d-block" style={{ fontSize: '10px' }} title={`Shortfall: ${plan.shortfallQty || ''}`}>
                          Shortfall: {plan.shortfallQty}
                        </div>
                      )}
                    </>
                  );
                })())}
              
              <td
                className={`py-3 text-center fw-bold align-middle ${plan.plainStockWarning?.hasWarning ? 'bg-warning' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => openQuantityModal('order', plan)}
                title={plan.plainStockWarning ? plan.plainStockWarning.tooltip : 'Click to add Order Qty'}
              >
                {plan.orderQty !== null && plan.orderQty !== undefined ? plan.orderQty : '-'}
              </td>
              
              <td
                className="py-3 text-center align-middle"
                style={{ cursor: 'pointer' }}
                onClick={() => openQuantityModal('ready', plan)}
                title={(plan.coatingShade || '').trim().toUpperCase() === 'PLAIN' && plan.usedFromTooltip ? plan.usedFromTooltip : 'Click to add Ready (Printed) Qty'}
              >
                <div>{plan.producedQty !== null && plan.producedQty !== undefined ? plan.producedQty : 0}</div>
                {Number(plan.readyRejectionQty) > 0 && (
                  <div className="small text-muted">Rejected: {plan.readyRejectionQty}</div>
                )}
                {plan.completed && <span className="badge bg-success mt-1">Completed</span>}
                {(plan.coatingShade || '').trim().toUpperCase() === 'PLAIN' && Array.isArray(plan.usedFrom) && plan.usedFrom.length > 0 && (
                  <div className="small text-muted text-wrap font-monospace mt-1" style={{ fontSize: '11px', lineHeight: '1.2' }} title={plan.usedFromTooltip}>
                    {plan.usedFrom.map(u => `${u.companyName} ${u.qty}`).join(' · ')}
                  </div>
                )}
              </td>

              <td className={`py-3 text-center fw-bold align-middle ${plan.balanceToMake < 0 ? 'text-danger' : 'text-dark'}`}>
                {plan.balanceToMake !== null && plan.balanceToMake !== undefined ? plan.balanceToMake : '-'}
              </td>
              
              {renderGroupedTd('_cBoxQty', plan.boxQty !== null && plan.boxQty !== undefined && plan.boxQty > 0 ? plan.boxQty : '-')}
              
              <td className="py-3 text-center align-middle">{plan.noOfBoxes !== null && plan.noOfBoxes !== undefined ? plan.noOfBoxes : '-'}</td>
              <td className="py-3 text-center align-middle">
                {plan.readyBoxes !== null && plan.readyBoxes !== undefined ? plan.readyBoxes : '—'}
                {plan.showLooseQty && plan.looseQty !== null && plan.looseQty !== undefined && (
                  <div className="small text-muted">Loose: {plan.looseQty}</div>
                )}
              </td>
              <td className="py-3 text-center align-middle">{plan.dispatchBalance !== null && plan.dispatchBalance !== undefined ? plan.dispatchBalance : 0}</td>
              <td className="py-3 text-center align-middle">{plan.soldQty !== null && plan.soldQty !== undefined ? plan.soldQty : 0}</td>
              
              {shrenoComponentHeaders.map((comp, idx) => {
                  const compData = plan.components?.find(c => (c.itemType || c.componentType) === comp);
                  return <td key={`comp_td_${idx}`} className="py-3 text-center align-middle fw-bold">{compData ? compData.quantity : '-'}</td>;
              })}
              
              <td className="py-3 text-center small text-muted align-middle">{plan.remarks || '-'}</td>
              
              <td className="py-3 text-center">
                <div className="d-flex gap-2 justify-content-center">
                  <Link to={`/printing-plan/view/${plan._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View">
                    <i className="bi bi-eye fs-6"></i>
                  </Link>
                  <Link 
                     to={`/printing-plan/edit/${(() => {
                       const curBottle = (plan.plainBottle || plan.bottleName || '').trim().toUpperCase();
                       const curBrand = (plan.brandId?._id || plan.brandId || plan.brandName || '').toString();
                       const matchingPlans = contiguousPlanList.filter(p => {
                         const pBottle = (p.plainBottle || p.bottleName || '').trim().toUpperCase();
                         const pBrand = (p.brandId?._id || p.brandId || p.brandName || '').toString();
                         return pBottle === curBottle && pBrand === curBrand;
                       });
                       return (matchingPlans.length > 0 ? matchingPlans : [plan]).map(p => p._id).join(',');
                     })()}`} 
                     state={{ 
                       editGroup: (() => {
                         const curBottle = (plan.plainBottle || plan.bottleName || '').trim().toUpperCase();
                         const curBrand = (plan.brandId?._id || plan.brandId || plan.brandName || '').toString();
                         const matchingPlans = contiguousPlanList.filter(p => {
                           const pBottle = (p.plainBottle || p.bottleName || '').trim().toUpperCase();
                           const pBrand = (p.brandId?._id || p.brandId || p.brandName || '').toString();
                           return pBottle === curBottle && pBrand === curBrand;
                         });
                         return matchingPlans.length > 0 ? matchingPlans : [plan];
                       })()
                     }}
                     className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" 
                     title="Edit Group"
                  >
                    <i className="bi bi-pencil-square fs-6"></i>
                  </Link>
                  {ability && ability.can('dispatch', 'ready-to-dispatch') && (
                    <button 
                      onClick={() => handleSendToReadyToDispatch(plan)} 
                      className={`btn btn-sm border-0 rounded-3 shadow-none p-2 ${
                        plan.readyToDispatch && plan.readyToDispatch.sheetId 
                          ? 'btn-success' 
                          : 'btn-outline-success'
                      }`} 
                      title={plan.readyToDispatch && plan.readyToDispatch.sheetId ? 'Sent – open in Ready To Dispatch' : 'Send to Ready To Dispatch'}
                    >
                      <i className={`bi ${plan.readyToDispatch && plan.readyToDispatch.sheetId ? 'bi-send-fill text-success' : 'bi-send'} fs-6`}></i>
                    </button>
                  )}
                  <button onClick={() => handleDelete(plan._id)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" title="Delete">
                    <i className="bi bi-trash fs-6"></i>
                  </button>
                </div>
              </td>
            </tr>
          );
          }) : (
            <tr>
              <td colSpan={showDate ? "20" : "19"} className="text-center py-5 text-muted">No plans found</td>
            </tr>
          )}
          
          {/* Loading spinner row */}
          {infiniteScroll.loading && (
            <tr>
              <td colSpan={showDate ? "20" : "19"} className="text-center py-4 text-muted">
                <div className="spinner-border spinner-border-sm text-primary me-2" role="status" />
                <span>Loading next page...</span>
              </td>
            </tr>
          )}

          {/* Error retry row */}
          {infiniteScroll.error && (
            <tr>
              <td colSpan={showDate ? "20" : "19"} className="text-center py-4">
                <div className="alert alert-danger mb-0 d-inline-block">
                  <strong>Error:</strong> {infiniteScroll.error}
                  <button 
                    onClick={() => infiniteScroll.retryLoad()} 
                    className="btn btn-sm btn-outline-danger ms-2"
                  >
                    <i className="bi bi-arrow-clockwise me-1" /> Retry
                  </button>
                </div>
              </td>
            </tr>
          )}

        </tbody>
      </table>
    );
  };

  return (
    <div className="page-content printing-plan-page printing-plan-list">
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
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header printing-plan-list-header">
        <div>
          <h1 className="page-title mb-0">Printing Plan</h1>
          <p className="page-subtitle mb-0">Manage and track your printing plans</p>
        </div>
        <div className="d-flex align-items-center gap-3 productions-page-actions printing-plan-list-actions">
          <button onClick={toggleLanguage} className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold">
            {language === 'en' ? 'ગુજરાતી' : 'English'}
          </button>
          {(!fromDate && !toDate && infiniteScroll.items && infiniteScroll.items.length > 0) && (
            <button
              onClick={handleImportPrevious}
              className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold"
              disabled={importing}
            >
              {importing ? (
                <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Importing...</>
              ) : (
                <><i className="bi bi-clock-history me-2" /> {labels.importPreviousPlan || 'Import Previous Plan'}</>
              )}
            </button>
          )}
          <button onClick={handleExport} className="btn btn-outline-primary shadow-sm px-4 py-2 rounded-3">
            <i className="bi bi-file-earmark-excel-fill me-2" /> Export Excel
          </button>
          <button onClick={fetchPlans} className="btn btn-outline-secondary shadow-sm px-4 py-2 rounded-3" title="Refresh list to show latest stock changes">
            <i className="bi bi-arrow-clockwise me-2" /> Refresh
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-outline-success shadow-sm px-4 py-2 rounded-3">
            <i className="bi bi-file-earmark-excel-fill me-2" /> {labels.importExcel}
          </button>
          <Link to={`/printing-plan/add?date=${selectedDate}`} className="btn-accent shadow-sm px-4 py-2 rounded-3">
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
              <label className="small text-muted fw-bold mb-1 d-block">{labels.company || 'Company'}</label>
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

            {/* Search */}
            <div className="col-12 col-sm-6 col-md-4 col-lg-2">
              <label className="small text-muted fw-bold mb-1 d-block">{labels.search}</label>
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
            <div className="col-12 col-md-auto ms-md-auto d-flex align-items-end justify-content-end mt-3 mt-md-0 printing-plan-zoom-wrapper">
               <ZoomControl value={zoom} onChange={setZoom} />
            </div>
          </div>
        </div>

        <div className="p-0">
          {/* Data Rendering */}
          {infiniteScroll.status === 'loadingFirst' ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : infiniteScroll.status === 'error' ? (
            <div className="text-center py-5 printing-plan-error-state" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="bg-danger bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center mb-4" style={{ width: '80px', height: '80px' }}>
                <i className="bi bi-exclamation-triangle text-danger" style={{ fontSize: '2rem' }}></i>
              </div>
              <h4 className="text-dark fw-bold mb-2">Error Loading Plans</h4>
              <p className="text-muted mb-3">{infiniteScroll.error || 'An error occurred while loading the printing plans'}</p>
              <button onClick={() => infiniteScroll.retryLoad()} className="btn btn-danger py-2 px-4" style={{ borderRadius: '8px' }}>
                <i className="bi bi-arrow-clockwise me-2"></i> Retry
              </button>
            </div>
          ) : infiniteScroll.items.length === 0 ? (
            <div className="text-center py-5 printing-plan-empty-state" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="bg-light rounded-circle d-flex align-items-center justify-content-center mb-4" style={{ width: '80px', height: '80px' }}>
                <i className="bi bi-calendar-x text-muted" style={{ fontSize: '2rem' }}></i>
              </div>
              <h4 className="text-dark fw-bold mb-2">No Printing Plan Found</h4>
              <p className="text-muted mb-3">No printing plans found for the selected filters</p>
              
              <div className="d-flex gap-3 align-items-center justify-content-center printing-plan-empty-actions">
                <div className="printing-plan-empty-action">
                  <Link to={`/printing-plan/add?date=${selectedDate}`} className="btn btn-accent py-2 w-100 d-flex align-items-center justify-content-center" style={{ borderRadius: '8px', whiteSpace: 'nowrap' }}>
                    <i className="bi bi-plus-circle me-2"></i> Create New Plan
                  </Link>
                </div>
                {(!fromDate && !toDate) && (
                  <div className="printing-plan-empty-action">
                    <button 
                      onClick={handleImportPrevious} 
                      className="btn btn-outline-secondary py-2 w-100 d-flex align-items-center justify-content-center" 
                      style={{ borderRadius: '8px', whiteSpace: 'nowrap' }}
                      disabled={importing}
                    >
                      {importing ? (
                        <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Importing...</>
                      ) : (
                        <><i className="bi bi-clock-history me-2"></i> Import Previous Plan</>
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
                  {/* Sentinel for infinite scroll - always rendered once list is loaded */}
                  <div ref={infiniteScroll.sentinelRef} style={{height: '600px'}} />
                </div>
             </DoubleScrollContainer>
          )}
          {/* Loading more indicator */}
          {infiniteScroll.status === 'loadingMore' && (
            <div className="text-center py-4 border-top">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Loading more...</span>
              </div>
            </div>
          )}
          {/* No more records indicator */}
          {infiniteScroll.items.length > 0 && !infiniteScroll.hasMore && (
            <div className="text-center py-4 text-muted border-top">
              <p className="mb-0"><small>No more records</small></p>
            </div>
          )}
        </div>
      </div>

      <ImportExcelModal 
        show={showImportModal} 
        onClose={() => setShowImportModal(false)} 
        onImportComplete={() => fetchPlans()} 
      />
      {quantityModal.type === 'order' && (
        <PrintingOrderQtyModal
          show
          plan={quantityModal.plan}
          onClose={() => setQuantityModal({ type: null, plan: null })}
          onSave={fetchPlans}
        />
      )}
      {quantityModal.type === 'ready' && (
        <PrintingReadyQtyModal
          show
          plan={quantityModal.plan}
          onClose={() => setQuantityModal({ type: null, plan: null })}
          onSave={fetchPlans}
        />
      )}
    </div>
  );
}
