import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import API from '../services/api';

const getIndiaDateInput = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getEntryDateTime = date => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(`${date}T${values.hour}:${values.minute}:${values.second}+05:30`).toISOString();
};

/**
 * Order Qty Modal - for adding to existing order quantity
 */
export function OrderQtyModal({ show, plan, onClose, onSave }) {
  const [addQty, setAddQty] = useState('');
  const [entryDate, setEntryDate] = useState(() => {
    return getIndiaDateInput();
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (show && plan) {
      setAddQty('');
      // Set default date to plan date if available
      if (plan.planDate) {
        setEntryDate(getIndiaDateInput(new Date(plan.planDate)));
      } else {
        setEntryDate(getIndiaDateInput());
      }
    }
  }, [show, plan]);

  const handleSave = async () => {
    const quantity = Number(addQty);
    if (!addQty || !Number.isInteger(quantity) || quantity === 0) {
      Swal.fire('Error', 'Please enter a non-zero quantity', 'error');
      return;
    }

    const calculatedNewOrder = (plan.orderQty || 0) + quantity;
    if (calculatedNewOrder < 0) {
      Swal.fire('Error', 'Order quantity cannot reduce the total below zero', 'error');
      return;
    }

    if (!entryDate) {
      Swal.fire('Error', 'Please select a date', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await API.post(`/lacquer-plan/${plan._id}/add-order-qty`, {
        qty: Number(addQty),
        date: getEntryDateTime(entryDate),
        note: ''
      });

      if (response.data.success) {
        onSave(response.data.data);
        Swal.fire({
          icon: 'success',
          title: 'Added!',
          text: response.data.message,
          toast: true,
          position: 'top-end',
          timer: 2000,
          showConfirmButton: false
        });
        onClose();
      }
    } catch (error) {
      Swal.fire('Error', error.response?.data?.message || 'Failed to add order qty', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!show || !plan) return null;

  const newOrderQty = (plan.orderQty || 0) + (Number(addQty) || 0);

  return (
    <div className="modal show lacquer-quantity-modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="modal-dialog lacquer-quantity-dialog lacquer-compact-quantity-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-content lacquer-quantity-content">
          <div className="modal-header lacquer-quantity-header">
            <h5 className="modal-title">Add Order Qty</h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>
          <div className="modal-body lacquer-quantity-body">
            <div className="lacquer-order-plan-summary">
              <div className="lacquer-order-summary-item">
                <span className="lacquer-order-summary-label">Plain Bottle</span>
                <span className="lacquer-order-summary-value">{plan.bottleName || '-'}</span>
              </div>
              <div className="lacquer-order-summary-item">
                <span className="lacquer-order-summary-label">Variant</span>
                <span className="lacquer-order-summary-value">{plan.variantId?.variantName || plan.variantName || '-'}</span>
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">Entry Date</label>
              <input
                type="date"
                className="form-control"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Add / Subtract Qty</label>
              <input
                type="number"
                className="form-control"
                value={addQty}
                onChange={e => setAddQty(e.target.value)}
                placeholder="Enter quantity to add or subtract (e.g. +500 or -200)"
                disabled={loading}
              />
              <small className="text-muted mt-2 d-block">
                New order qty = {plan.orderQty || 0} + {Number(addQty) || 0} = <strong>{newOrderQty}</strong>
              </small>
            </div>
          </div>
          <div className="modal-footer lacquer-quantity-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading || !addQty}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Coating Completed Qty Modal - for adding to coating completed quantity
 */
export function CoatingQtyModal({ show, plan, onClose, onSave }) {
  const [coatQty, setCoatQty] = useState('');
  const [rejectionQty, setRejectionQty] = useState('');
  const [rejectionBoxes, setRejectionBoxes] = useState('');
  const [entryDate, setEntryDate] = useState(() => getIndiaDateInput(plan?.planDate ? new Date(plan.planDate) : new Date()));
  const [availableStock, setAvailableStock] = useState(null);
  const [sourcesList, setSourcesList] = useState([]);
  const [splitAlloc, setSplitAlloc] = useState([]);
  const [splitError, setSplitError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const planSources = (plan?.stockSources && plan.stockSources.length > 0)
    ? plan.stockSources.map(s => (s._id || s).toString())
    : [plan?.companyId?._id || plan?.companyId].filter(Boolean).map(id => id.toString());

  const ownCompId = (plan?.companyId?._id || plan?.companyId)?.toString();
  const boxSize = Number(plan?.boxQty) || 0;
  const currentCoated = Number(plan?.coatingCompletedQty) || 0;
  const rejectedQuantity = (Number(rejectionBoxes) || 0) * boxSize + (Number(rejectionQty) || 0);
  const maxAdditionalQty = availableStock === null ? null : Math.max(0, Number(availableStock) - currentCoated);

  const validateSplit = (allocArray, targetTotal, availMap) => {
    let sum = 0;
    let err = '';
    for (const a of allocArray) {
      const sId = (a.companyId?._id || a.companyId)?.toString();
      const q = Number(a.qty) || 0;
      const maxAv = availMap.get(sId) ?? 0;
      const sObj = (sourcesList || []).find(s => s.companyId === sId);
      const sName = sObj?.companyName || 'Company';
      if (q > maxAv && !err) {
        err = `Only ${maxAv} bottles available for ${sName}`;
      }
      sum += q;
    }
    if (!err && sum !== targetTotal) {
      err = `Split must add up to ${targetTotal} (now ${sum})`;
    }
    setSplitError(err);
    return !err;
  };

  const updateCoatingSplit = quantity => {
    if (planSources.length >= 2) {
      const availMap = new Map();
      (sourcesList || []).forEach(s => availMap.set(s.companyId, Number(s.available) || 0));
      const sorted = [...planSources].sort((a, b) => {
        if (a === ownCompId) return -1;
        if (b === ownCompId) return 1;
        return 0;
      });
      let rem = quantity;
      const initial = [];
      for (const sId of sorted) {
        const av = availMap.get(sId) ?? 0;
        const part = Math.min(rem, Math.max(0, av));
        initial.push({ companyId: sId, qty: part });
        rem -= part;
      }
      if (rem > 0 && initial.length > 0) initial[initial.length - 1].qty += rem;
      setSplitAlloc(initial);
      validateSplit(initial, quantity, availMap);
    }
  };

  const handleCoatQtyChange = (val) => {
    setError('');
    let nextQty = Number(val) || 0;
    if (maxAdditionalQty !== null && nextQty > 0 && nextQty + rejectedQuantity > maxAdditionalQty) {
      nextQty = Math.max(0, maxAdditionalQty - rejectedQuantity);
      setError(`Cannot exceed available plain stock. Maximum additional quantity: ${maxAdditionalQty}.`);
    }
    setCoatQty(val === '' ? '' : String(nextQty));
    updateCoatingSplit(nextQty + rejectedQuantity);
  };

  const updateRejectedTotal = requestedTotal => {
    let total = Math.max(0, Number(requestedTotal) || 0);
    const maxRejected = maxAdditionalQty === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, maxAdditionalQty - Math.max(0, Number(coatQty) || 0));
    if (total > maxRejected) {
      total = maxRejected;
      setError(`Cannot exceed available plain stock. Maximum rejection quantity: ${maxRejected}.`);
    } else {
      setError('');
    }
    setRejectionBoxes(boxSize > 0 ? String(Math.floor(total / boxSize)) : '');
    setRejectionQty(boxSize > 0 ? String(total % boxSize || '') : String(total || ''));
    updateCoatingSplit((Number(coatQty) || 0) + total);
  };

  const handleRejectionQtyChange = value => {
    const looseQty = Number(value);
    if (boxSize > 0 && value !== '' && Number.isInteger(looseQty) && looseQty >= 0) {
      const totalRejected = (Number(rejectionBoxes) || 0) * boxSize + looseQty;
      updateRejectedTotal(totalRejected);
      return;
    }
    updateRejectedTotal((Number(rejectionBoxes) || 0) * boxSize + (Number(value) || 0));
  };

  const handleRejectionBoxesChange = value => {
    updateRejectedTotal((Number(value) || 0) * boxSize + (Number(rejectionQty) || 0));
  };

  const handleModalSplitChange = (sourceId, val) => {
    const quantity = (Number(coatQty) || 0) + rejectedQuantity;
    const parsedVal = val === '' ? '' : Math.max(0, parseInt(val, 10) || 0);
    const availMap = new Map();
    (sourcesList || []).forEach(s => availMap.set(s.companyId, Number(s.available) || 0));

    let updated = [...splitAlloc];
    planSources.forEach(sId => {
      if (!updated.some(a => (a.companyId?._id || a.companyId)?.toString() === sId)) {
        updated.push({ companyId: sId, qty: 0 });
      }
    });

    if (planSources.length === 2) {
      const otherSourceId = planSources.find(id => id !== sourceId);
      const thisQty = typeof parsedVal === 'number' ? parsedVal : 0;
      const otherQty = Math.max(0, quantity - thisQty);
      updated = [
        { companyId: sourceId, qty: parsedVal },
        { companyId: otherSourceId, qty: otherQty }
      ];
    } else {
      updated = updated.map(a => {
        const aId = (a.companyId?._id || a.companyId)?.toString();
        if (aId === sourceId) return { companyId: aId, qty: parsedVal };
        return a;
      });
    }
    setSplitAlloc(updated);
    validateSplit(updated, quantity, availMap);
  };

  useEffect(() => {
    if (!show || !plan) return undefined;

    let cancelled = false;
    const companyId = plan.companyId?._id || plan.companyId;

    const fetchAvailableStock = async () => {
      try {
        if (!plan.bottleName || !companyId) {
          throw new Error('Unable to determine plain bottle stock for this plan.');
        }

        const sourcesParam = (plan.stockSources && plan.stockSources.length > 0)
          ? plan.stockSources.map(s => (s._id || s).toString()).join(',')
          : companyId;
        const response = await API.get('/lacquer-plan/stats/computed', {
          params: {
            bottleName: plan.bottleName,
            companyId,
            planDate: plan.planDate,
            stockSources: sourcesParam,
            excludePlanIds: plan._id
          }
        });
        const stock = response.data?.data?.plainStock ?? response.data?.data?.openingStock;
        if (!response.data?.success || stock === null || stock === undefined || !Number.isFinite(Number(stock))) {
          throw new Error('Unable to load available plain bottle stock.');
        }

        if (!cancelled) {
          setAvailableStock(Number(stock));
          setSourcesList(response.data?.data?.sources || []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError.response?.data?.message || fetchError.message || 'Failed to load available plain bottle stock.');
        }
      }
    };

    fetchAvailableStock();

    return () => {
      cancelled = true;
    };
  }, [show, plan]);

  const handleSave = async () => {
    const wholeQuantity = Number(coatQty) || 0;
    const rejectedBoxes = Number(rejectionBoxes) || 0;
    const rejectedLooseQty = Number(rejectionQty) || 0;
    const rejectedQuantity = rejectedBoxes * boxSize + rejectedLooseQty;
    const quantity = wholeQuantity + rejectedQuantity;
    if ((!coatQty && !rejectionQty && !rejectionBoxes) || !Number.isInteger(wholeQuantity) || !Number.isInteger(rejectedBoxes) || rejectedBoxes < 0 || !Number.isInteger(rejectedLooseQty) || rejectedLooseQty < 0 || (rejectedBoxes > 0 && boxSize <= 0) || quantity === 0) {
      setError('Enter whole and rejection quantities as whole numbers, with a non-zero total.');
      return;
    }
    if (wholeQuantity < 0 && rejectedQuantity > 0) {
      setError('Rejection Qty cannot be added when subtracting quantity.');
      return;
    }

    if (!entryDate) {
      setError('Please select a date');
      return;
    }

    if (availableStock === null) {
      setError('Available plain bottle stock is not loaded yet.');
      return;
    }

    const newCoatedTotal = (plan.coatingCompletedQty || 0) + quantity;
    if (newCoatedTotal < 0) {
      setError('Coating quantity cannot reduce the total below zero.');
      return;
    }

    if (quantity > 0 && newCoatedTotal > availableStock) {
      setError(`Available stock is ${availableStock}. Cannot exceed this.`);
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (planSources.length >= 2) {
        const availMap = new Map();
        (sourcesList || []).forEach(s => availMap.set(s.companyId, Number(s.available) || 0));
        const ok = validateSplit(splitAlloc, quantity, availMap);
        if (!ok) {
          setError(splitError || 'Invalid split allocation');
          setLoading(false);
          return;
        }
      }

      const response = await API.post(`/lacquer-plan/${plan._id}/add-coated-qty`, {
        qty: quantity,
        rejectionQty: rejectedQuantity,
        rejectionBoxes: rejectedBoxes,
        rejectionLooseQty: rejectedLooseQty,
        date: getEntryDateTime(entryDate),
        note: '',
        stockAllocation: planSources.length >= 2 ? splitAlloc.map(a => ({ companyId: a.companyId?._id || a.companyId, qty: Number(a.qty) || 0 })) : undefined
      });

      if (response.data.success) {
        onSave(response.data.data);
        Swal.fire({
          icon: 'success',
          title: 'Added!',
          text: response.data.message,
          toast: true,
          position: 'top-end',
          timer: 2000,
          showConfirmButton: false
        });
        onClose();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add coated qty';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!show || !plan) return null;

  const wholeQuantity = Number(coatQty) || 0;
  const newCoatedTotal = currentCoated + wholeQuantity + rejectedQuantity;
  const newBalance = newCoatedTotal - (plan.orderQty || 0);
  const newPoolStock = availableStock === null ? null : availableStock - newCoatedTotal;

  return (
    <div className="modal show lacquer-quantity-modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="modal-dialog lacquer-quantity-dialog lacquer-compact-quantity-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-content lacquer-quantity-content">
          <div className="modal-header lacquer-quantity-header">
            <h5 className="modal-title">Add Coating Completed Qty</h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>
          <div className="modal-body lacquer-quantity-body">
            <div className="lacquer-order-plan-summary">
              <div className="lacquer-order-summary-item">
                <span className="lacquer-order-summary-label">Plain Bottle</span>
                <span className="lacquer-order-summary-value">{plan.bottleName || '-'}</span>
              </div>
              <div className="lacquer-order-summary-item">
                <span className="lacquer-order-summary-label">Variant</span>
                <span className="lacquer-order-summary-value">{plan.variantId?.variantName || plan.variantName || '-'}</span>
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">Entry Date</label>
              <input
                type="date"
                className="form-control"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Qty coated now (Add or Subtract)</label>
              <input
                type="number"
                className="form-control"
                value={coatQty}
                onChange={e => handleCoatQtyChange(e.target.value)}
                max={maxAdditionalQty === null ? undefined : maxAdditionalQty - rejectedQuantity}
                placeholder="Enter whole quantity coated"
                disabled={loading}
              />
              <div className="row g-2 mt-2 align-items-end">
                <div className="col-6">
                  <label className="form-label">Rejection Boxes</label>
                  <input
                    type="number"
                    className="form-control"
                    min="0"
                    step="1"
                    value={rejectionBoxes}
                    onChange={e => handleRejectionBoxesChange(e.target.value)}
                    max={boxSize > 0 && maxAdditionalQty !== null ? Math.floor(Math.max(0, maxAdditionalQty - Math.max(0, wholeQuantity) - (Number(rejectionQty) || 0)) / boxSize) : undefined}
                    placeholder="Boxes"
                    disabled={loading || boxSize <= 0}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label">Rejection Qty</label>
                  <input
                    type="number"
                    className="form-control"
                    min="0"
                    step="1"
                    value={rejectionQty}
                    onChange={e => handleRejectionQtyChange(e.target.value)}
                    max={maxAdditionalQty === null ? undefined : Math.max(0, maxAdditionalQty - Math.max(0, wholeQuantity) - (Number(rejectionBoxes) || 0) * boxSize)}
                    placeholder="Loose bottles"
                    disabled={loading}
                  />
                </div>
              </div>
              <small className="text-muted d-block mt-1">Bottle per box: {boxSize || '-'}</small>
              {availableStock !== null && (
                <small className="text-muted d-block">Available plain stock for this entry: {maxAdditionalQty}</small>
              )}
              {planSources.length >= 2 && (
                <div className="mt-2 p-2 bg-light border rounded">
                  <div className="small fw-bold text-muted mb-1 text-uppercase" style={{ fontSize: '11px' }}>Per-Source Split:</div>
                  <div className="d-flex flex-wrap gap-2 align-items-center">
                    {planSources.map(sId => {
                      const sObj = (sourcesList || []).find(s => s.companyId === sId);
                      const sName = sObj?.companyName || (sId === ownCompId ? 'Own Company' : 'Supplier');
                      const partObj = splitAlloc.find(a => (a.companyId?._id || a.companyId)?.toString() === sId);
                      const partQty = partObj !== undefined ? partObj.qty : '';
                      return (
                        <div key={sId} className="d-flex align-items-center gap-1">
                          <span className="badge bg-secondary">{sName}</span>
                          <input
                            type="number"
                            className="form-control form-control-sm text-center"
                            style={{ width: '80px' }}
                            value={partQty}
                            onChange={e => handleModalSplitChange(sId, e.target.value)}
                            min="0"
                            disabled={loading}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {splitError && (
                    <div className="text-danger fw-bold mt-1" style={{ fontSize: '0.75rem' }}>
                      <i className="bi bi-exclamation-circle-fill me-1"></i>
                      {splitError}
                    </div>
                  )}
                </div>
              )}
              <small className="text-muted mt-2 d-block">
                Rejected total = {rejectionBoxes || 0} × {boxSize || 0} + {rejectionQty || 0} = <strong>{rejectedQuantity}</strong>
              </small>
              <small className="text-muted d-block">
                New total = {currentCoated} + {wholeQuantity} + {rejectedQuantity} = <strong>{newCoatedTotal}</strong>
              </small>
              <small className="text-muted d-block">
                Balance to make = {newCoatedTotal} − {plan.orderQty || 0} = <strong>{newBalance}</strong>
              </small>
              <small className="text-muted d-block">
                {availableStock === null && !error ? 'Loading available pool stock...' : availableStock === null ? 'Available pool stock unavailable' : (
                  <>Plain Stock = {availableStock} − {newCoatedTotal} = <strong className={newPoolStock < 0 ? 'text-danger' : 'text-success'}>{newPoolStock}</strong></>
                )}
              </small>
            </div>
            {error && <div className="alert alert-danger mb-3">{error}</div>}
          </div>
          <div className="modal-footer lacquer-quantity-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading || availableStock === null || !coatQty || !!error || !!splitError}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
