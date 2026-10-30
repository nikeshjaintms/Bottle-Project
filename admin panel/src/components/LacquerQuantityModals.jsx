import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import API from '../services/api';

/**
 * Order Qty Modal - for adding to existing order quantity
 */
export function OrderQtyModal({ show, plan, onClose, onSave }) {
  const [addQty, setAddQty] = useState('');
  const [entryDate, setEntryDate] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return today;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (show && plan) {
      setAddQty('');
      // Set default date to plan date if available
      if (plan.planDate) {
        setEntryDate(new Date(plan.planDate).toISOString().split('T')[0]);
      } else {
        setEntryDate(new Date().toISOString().split('T')[0]);
      }
    }
  }, [show, plan]);


  const planSources = (plan?.stockSources && plan.stockSources.length > 0)
    ? plan.stockSources.map(s => (s._id || s).toString())
    : [plan?.companyId?._id || plan?.companyId].filter(Boolean);

  const ownCompId = (plan?.companyId?._id || plan?.companyId)?.toString();

  const handleCoatQtyChange = (val) => {
    setCoatQty(val);
    setError('');
    const quantity = Number(val) || 0;
    if (planSources.length >= 2) {
      const availMap = new Map();
      (sourcesList || []).forEach(s => availMap.set(s.companyId, Number(s.available) || 0));
      // Suggest own-company first
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
      if (rem > 0 && initial.length > 0) {
        initial[initial.length - 1].qty += rem;
      }
      setSplitAlloc(initial);
      validateSplit(initial, quantity, availMap);
    }
  };

  const handleModalSplitChange = (sourceId, val) => {
    const quantity = Number(coatQty) || 0;
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
        date: entryDate,
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
  const [entryDate, setEntryDate] = useState(() => {
    return plan?.planDate ? new Date(plan.planDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  });
  const [availableStock, setAvailableStock] = useState(null);
  const [sourcesList, setSourcesList] = useState([]);
  const [splitAlloc, setSplitAlloc] = useState([]);
  const [splitError, setSplitError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    const quantity = Number(coatQty);
    if (!coatQty || !Number.isInteger(quantity) || quantity === 0) {
      setError('Please enter a non-zero whole quantity');
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
        qty: Number(coatQty),
        date: entryDate,
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

  const currentCoated = plan.coatingCompletedQty || 0;
  const newCoatedTotal = currentCoated + (Number(coatQty) || 0);
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
                placeholder="Enter quantity coated"
                disabled={loading}
              />
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
                New total = {currentCoated} + {Number(coatQty) || 0} = <strong>{newCoatedTotal}</strong>
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
