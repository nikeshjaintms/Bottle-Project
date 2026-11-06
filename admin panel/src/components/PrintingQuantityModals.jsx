import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import API from '../services/api';

const isPlainPlan = plan => (plan?.coatingShade || '').trim().toUpperCase() === 'PLAIN';

const getIndiaDateInput = date => {
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

const sourceId = source => (source?.companyId?._id || source?.companyId || source?._id || source)?.toString();

const getReadyBoxFields = row => {
  const bottlePerBox = Number(row.boxQty);
  if (!Number.isFinite(bottlePerBox) || bottlePerBox <= 0) {
    return { readyBoxes: null, looseQty: null, showLooseQty: false };
  }

  const printedQty = Number(row.producedQty ?? row.coatingCompletedQty ?? row.readyQty ?? 0);
  const readyBoxes = Math.floor(printedQty / bottlePerBox);
  const looseQty = printedQty - (readyBoxes * bottlePerBox);

  return {
    readyBoxes,
    looseQty,
    showLooseQty: printedQty !== 0
  };
};

const sourceSplitSuggestion = (quantity, sources, currentAllocation) => {
  let remaining = Math.max(0, Number(quantity) || 0);
  const ownId = sources.find(source => source.isOwnCompany)?.companyId;
  const ordered = [...sources].sort((a, b) => {
    if (a.companyId === ownId) return -1;
    if (b.companyId === ownId) return 1;
    return a.companyName.localeCompare(b.companyName);
  });
  return ordered.map(source => {
    const alreadyAllocated = currentAllocation
      .filter(allocation => sourceId(allocation) === source.companyId)
      .reduce((sum, allocation) => sum + (Number(allocation.qty) || 0), 0);
    const remainingAvailable = Math.max(0, (Number(source.available) || 0) - alreadyAllocated);
    const allocated = Math.min(remaining, remainingAvailable);
    remaining -= allocated;
    return { companyId: source.companyId, qty: allocated };
  });
};

function PrintingQuantityModal({ show, plan, subType, onClose, onSave }) {
  const [details, setDetails] = useState(null);
  const [addQty, setAddQty] = useState('');
  const [rejectionQty, setRejectionQty] = useState('');
  const [rejectionBoxes, setRejectionBoxes] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [sources, setSources] = useState([]);
  const [split, setSplit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isReady = subType === 'ready';
  const plainPlan = isPlainPlan(details || plan);
  const boxSize = Number(details?.boxQty) || 0;
  const readyStockAvailable = Number(details?.coatedStockAvailable);
  const rejectedQuantity = (Number(rejectionBoxes) || 0) * boxSize + (Number(rejectionQty) || 0);

  useEffect(() => {
    if (!show || !plan?._id) return undefined;
    let active = true;
    API.get(`/printing-plan/${plan._id}`)
      .then(response => {
        if (!active) return;
        const current = response.data?.data;
        if (!current) throw new Error('Printing Plan details were not returned.');
        setDetails(current);
        setRejectionQty('');
        setRejectionBoxes('');
        setEntryDate(getIndiaDateInput(current.planDate ? new Date(current.planDate) : new Date()));
        const availableSources = current.stockContext?.sources || [];
        const formattedSources = availableSources.map(source => ({
          companyId: sourceId(source),
          companyName: source.companyName || source.companyId?.name || 'Company',
          available: Number(source.available) || 0,
          isOwnCompany: sourceId(source) === sourceId({ companyId: current.companyId })
        }));
        setSources(formattedSources);
        setSplit(sourceSplitSuggestion(current.producedQty, formattedSources, current.stockAllocation || []));
      })
      .catch(fetchError => {
        if (active) setError(fetchError.response?.data?.message || fetchError.message || 'Failed to load Printing Plan details.');
      });
    return () => {
      active = false;
    };
  }, [show, plan]);

  const updateQuantity = value => {
    let nextQty = Number(value) || 0;
    let nextError = '';
    if (isReady && plainPlan && Number.isFinite(readyStockAvailable) && nextQty > 0 && nextQty + rejectedQuantity > readyStockAvailable) {
      nextQty = Math.max(0, readyStockAvailable - rejectedQuantity);
      nextError = `Ready and rejected quantities exceed available plain stock. Maximum additional quantity: ${readyStockAvailable}.`;
    } else if (isReady && !plainPlan && Number.isFinite(readyStockAvailable)) {
      const currentReady = Number(details?.producedQty) || 0;
      const currentRejected = Number(details?.readyRejectionQty) || 0;
      const nextReady = Math.max(0, currentReady + nextQty);
      if (nextReady + currentRejected + rejectedQuantity > readyStockAvailable) {
        nextError = `Ready and rejected quantities exceed available coated stock. Available: ${readyStockAvailable}.`;
      }
    }
    setError(nextError);
    setAddQty(value === '' ? '' : String(nextQty));
    if (isReady && plainPlan) {
      setSplit(sourceSplitSuggestion(nextQty, sources, details?.stockAllocation || []));
    }
  };

  const updateRejectedTotal = requestedTotal => {
    let total = Math.max(0, Number(requestedTotal) || 0);
    const currentRejectedQty = Number(details?.readyRejectionQty) || 0;
    const maxRejected = !Number.isFinite(readyStockAvailable)
      ? Number.POSITIVE_INFINITY
      : Math.max(
        0,
        readyStockAvailable -
          (plainPlan
            ? Math.max(0, Number(addQty) || 0)
            : (Number(details?.producedQty) || 0) + currentRejectedQty + Math.max(0, Number(addQty) || 0))
      );
    if (total > maxRejected) {
      total = maxRejected;
      setError(`Rejected Qty exceeds available ${plainPlan ? 'plain' : 'coated'} stock. Maximum rejection quantity: ${maxRejected}.`);
    } else {
      setError('');
    }
    setRejectionBoxes(boxSize > 0 ? String(Math.floor(total / boxSize)) : '');
    setRejectionQty(boxSize > 0 ? String(total % boxSize || '') : String(total || ''));
    if (plainPlan) {
      setSplit(sourceSplitSuggestion(Number(addQty) || 0, sources, details?.stockAllocation || []));
    }
  };

  const updateRejectionQuantity = value => {
    const looseQty = Number(value);
    if (boxSize > 0 && value !== '' && Number.isInteger(looseQty) && looseQty >= 0) {
      const totalRejected = (Number(rejectionBoxes) || 0) * boxSize + looseQty;
      updateRejectedTotal(totalRejected);
      return;
    }
    updateRejectedTotal((Number(rejectionBoxes) || 0) * boxSize + (Number(value) || 0));
  };

  const updateRejectionBoxes = value => {
    updateRejectedTotal((Number(value) || 0) * boxSize + (Number(rejectionQty) || 0));
  };

  const updateSplit = (companyId, value) => {
    const qty = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0);
    const updated = split.map(item => item.companyId === companyId ? { ...item, qty } : item);
    const nextSplit = [...updated];
    let remaining = Math.max(0, quantityToAdd - nextSplit.reduce((sum, item) => sum + item.qty, 0));
    for (const source of sources) {
      if (source.companyId === companyId) continue;
      const currentAllocation = (details?.stockAllocation || [])
        .filter(allocation => sourceId(allocation) === source.companyId)
        .reduce((sum, allocation) => sum + (Number(allocation.qty) || 0), 0);
      const maxAvailable = Math.max(0, source.available - currentAllocation);
      const index = nextSplit.findIndex(item => item.companyId === source.companyId);
      if (index < 0 || remaining <= 0) continue;
      const amount = Math.min(remaining, maxAvailable);
      nextSplit[index] = { ...nextSplit[index], qty: amount };
      remaining -= amount;
    }
    setSplit(nextSplit);
  };

  const handleSave = async () => {
    const wholeQuantity = Number(addQty) || 0;
    const rejectedBoxes = Number(rejectionBoxes) || 0;
    const rejectedLooseQty = Number(rejectionQty) || 0;
    const rejectedQuantity = rejectedBoxes * boxSize + rejectedLooseQty;
    const quantity = wholeQuantity;
    if ((!addQty && !rejectionQty && !rejectionBoxes) || !Number.isInteger(wholeQuantity) || !Number.isInteger(rejectedBoxes) || rejectedBoxes < 0 || !Number.isInteger(rejectedLooseQty) || rejectedLooseQty < 0 || (rejectedBoxes > 0 && boxSize <= 0) || (quantity === 0 && (!isReady || rejectedQuantity <= 0))) {
      setError('Enter whole and rejection quantities as whole numbers, with a non-zero total.');
      return;
    }
    if (wholeQuantity < 0 && rejectedQuantity > 0) {
      setError('Rejection Qty cannot be added when subtracting quantity.');
      return;
    }
    if (isReady && !Number.isFinite(readyStockAvailable)) {
      setError('Available stock could not be verified. Reload the plan and try again.');
      return;
    }
    const currentRejectedQty = Number(details?.readyRejectionQty) || 0;
    const totalStockUse = isReady
      ? (plainPlan
        ? quantity + rejectedQuantity
        : Math.max(0, (Number(details?.producedQty) || 0) + quantity) + currentRejectedQty + rejectedQuantity)
      : quantity;
    if (isReady && totalStockUse > 0 && Number.isFinite(readyStockAvailable) && totalStockUse > readyStockAvailable) {
      setError(`${plainPlan ? 'Ready and rejected quantities exceed available plain stock' : 'Rejected quantities exceed available coated stock'}. Available: ${readyStockAvailable}.`);
      return;
    }
    if (!entryDate) {
      setError('Select an entry date.');
      return;
    }
    if (isReady && plainPlan && quantity > 0) {
      const splitTotal = split.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      if (splitTotal !== quantity) {
        const availableBySource = sources.map(source => {
          const alreadyAllocated = currentAllocation
            .filter(allocation => sourceId(allocation) === source.companyId)
            .reduce((sum, allocation) => sum + (Number(allocation.qty) || 0), 0);
          return `${source.companyName}: ${Math.max(0, source.available - alreadyAllocated)}`;
        }).join(', ');
        setError(`Stock split must add up to ${quantity} (now ${splitTotal}). Available by source: ${availableBySource || 'none'}.`);
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const body = {
        qty: quantity,
        rejectionQty: isReady ? rejectedQuantity : 0,
        rejectionBoxes: isReady ? rejectedBoxes : 0,
        rejectionLooseQty: isReady ? rejectedLooseQty : 0,
        date: getEntryDateTime(entryDate)
      };
      if (isReady && plainPlan) {
        body.stockSources = sources.map(source => source.companyId);
        if (quantity > 0) {
          body.stockAllocation = split.map(item => ({ companyId: item.companyId, qty: Number(item.qty) || 0 }));
        }
      }
      const endpoint = isReady ? 'add-ready-qty' : 'add-order-qty';
      const response = await API.post(`/printing-plan/${details._id}/${endpoint}`, body);
      onSave(response.data.data);
      onClose();
      Swal.fire({
        icon: 'success',
        title: 'Saved',
        text: response.data.message,
        toast: true,
        position: 'top-end',
        timer: 1800,
        showConfirmButton: false
      });
    } catch (saveError) {
      setError(saveError.response?.data?.message || saveError.message || 'Failed to save quantity.');
    } finally {
      setLoading(false);
    }
  };

  if (!show || !plan) return null;

  const currentOrder = Number(details?.orderQty) || 0;
  const currentReady = Number(details?.producedQty) || 0;
  const currentQty = isReady ? currentReady : currentOrder;
  const wholeQuantity = Number(addQty) || 0;
  const quantityToAdd = wholeQuantity;
  const nextQty = currentQty + quantityToAdd;
  const currentAllocation = details?.stockAllocation || [];
  const currentRejectedQty = Number(details?.readyRejectionQty) || 0;
  const stockBeforePlan = plainPlan
    ? readyStockAvailable + currentReady + currentRejectedQty
    : readyStockAvailable;
  const plainStockAfterUpdate = plainPlan
    ? stockBeforePlan - nextQty - currentRejectedQty - rejectedQuantity
    : stockBeforePlan - nextQty - currentRejectedQty - rejectedQuantity;
  const nextBalance = currentOrder - nextQty;

  return (
    <div className="modal show lacquer-quantity-modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="modal-dialog lacquer-quantity-dialog lacquer-compact-quantity-dialog modal-lg" onClick={event => event.stopPropagation()}>
        <div className="modal-content lacquer-quantity-content">
          <div className="modal-header lacquer-quantity-header">
            <h5 className="modal-title">Add {isReady ? 'Ready (Printed) Qty' : 'Order Qty'}</h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body lacquer-quantity-body">
            {!details && !error && <div className="text-center py-3">Loading Printing Plan...</div>}
            {details && (
              <>
                <div className="lacquer-order-plan-summary">
                  <div className="lacquer-order-summary-item">
                    <span className="lacquer-order-summary-label">Plain Bottle</span>
                    <span className="lacquer-order-summary-value">
                      {details.plainBottleName || details.plainBottle || details.bottleName || details.itemId?.bottleName || '-'}
                    </span>
                  </div>
                  <div className="lacquer-order-summary-item">
                    <span className="lacquer-order-summary-label">Variant</span>
                    <span className="lacquer-order-summary-value">
                      {details.printingVariant || details.printingToBeDone || details.itemId?.variantId?.variantName || '-'}
                    </span>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Entry Date</label>
                  <input type="date" className="form-control" value={entryDate} onChange={event => setEntryDate(event.target.value)} disabled={loading} />
                </div>
                <div className="mb-3">
                  <label className="form-label">{isReady ? 'Ready (Printed) Qty' : 'Add / Subtract Qty'}</label>
                  <input
                    type="number"
                    className="form-control"
                    value={addQty}
                    onChange={event => updateQuantity(event.target.value)}
                    max={isReady && Number.isFinite(readyStockAvailable)
                      ? (plainPlan
                        ? readyStockAvailable - rejectedQuantity
                        : readyStockAvailable - currentReady - currentRejectedQty - rejectedQuantity)
                      : undefined}
                    placeholder={isReady ? 'Enter whole printed quantity' : 'Enter a whole quantity'}
                    disabled={loading}
                  />
                  {isReady && (
                    <>
                      <div className="row g-2 mt-2 align-items-end">
                        <div className="col-6">
                          <label className="form-label">Rejection Boxes</label>
                          <input
                            type="number"
                            className="form-control"
                            min="0"
                            step="1"
                            value={rejectionBoxes}
                            onChange={event => updateRejectionBoxes(event.target.value)}
                            max={boxSize > 0 && Number.isFinite(readyStockAvailable) ? Math.floor(Math.max(0, readyStockAvailable - (plainPlan ? Math.max(0, wholeQuantity) : currentReady + currentRejectedQty + Math.max(0, wholeQuantity)) - (Number(rejectionQty) || 0)) / boxSize) : undefined}
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
                            onChange={event => updateRejectionQuantity(event.target.value)}
                            max={Number.isFinite(readyStockAvailable) ? Math.max(0, readyStockAvailable - (plainPlan ? Math.max(0, wholeQuantity) : currentReady + currentRejectedQty + Math.max(0, wholeQuantity)) - (Number(rejectionBoxes) || 0) * boxSize) : undefined}
                            placeholder="Loose bottles"
                            disabled={loading}
                          />
                        </div>
                      </div>
                      <small className="text-muted d-block mt-1">Bottle per box: {boxSize || '-'}</small>
                      <small className="text-muted d-block">
                        Rejected total = {rejectionBoxes || 0} × {boxSize || 0} + {rejectionQty || 0} = <strong>{rejectedQuantity}</strong>
                      </small>
                    </>
                  )}
                  <small className="text-muted d-block mt-1">
                    New total = {currentQty} + {wholeQuantity} = <strong>{nextQty}</strong>
                  </small>
                  {isReady && (
                    <>
                      <small className="text-muted d-block">
                        Balance to make = {currentOrder} − {nextQty} = <strong>{nextBalance}</strong>
                      </small>
                      {boxSize > 0 && (() => {
                        const readyBoxSummary = getReadyBoxFields({ boxQty: boxSize, producedQty: nextQty });
                        return (
                          <small className="text-muted d-block">
                            Ready Boxes = <strong>{readyBoxSummary.readyBoxes ?? 0}</strong> · Loose = <strong>{readyBoxSummary.looseQty ?? 0}</strong>
                          </small>
                        );
                      })()}
                      {plainPlan && (
                        <small className="text-muted d-block">
                          Plain Stock = {stockBeforePlan} − {nextQty} − {currentRejectedQty + rejectedQuantity} rejected = <strong className={plainStockAfterUpdate < 0 ? 'text-danger' : 'text-success'}>{plainStockAfterUpdate}</strong>
                        </small>
                      )}
                      {!plainPlan && (
                        <small className="text-muted d-block">
                          Coated Stock = {stockBeforePlan} − {nextQty} ready − {currentRejectedQty + rejectedQuantity} rejected = <strong className={plainStockAfterUpdate < 0 ? 'text-danger' : 'text-success'}>{plainStockAfterUpdate}</strong>
                        </small>
                      )}
                    </>
                  )}
                </div>
                {isReady && plainPlan && sources.length > 0 && (
                  <div className="mb-3 p-2 bg-light border rounded">
                    <div className="small fw-bold text-muted mb-2 text-uppercase">Stock from</div>
                    <div className="d-flex flex-wrap gap-3">
                      {sources.map(source => {
                        const splitItem = split.find(item => item.companyId === source.companyId);
                        const alreadyAllocated = currentAllocation
                          .filter(allocation => sourceId(allocation) === source.companyId)
                          .reduce((sum, allocation) => sum + (Number(allocation.qty) || 0), 0);
                        const availableForEntry = Math.max(0, source.available - alreadyAllocated);
                        return (
                          <label key={source.companyId} className="d-flex align-items-center gap-2">
                            <span className="badge bg-secondary">{source.companyName}</span>
                            <input
                              type="number"
                              className="form-control form-control-sm text-center"
                              style={{ width: 90 }}
                              min="0"
                              max={availableForEntry}
                              aria-label={`${source.companyName} allocation`}
                              value={splitItem?.qty ?? 0}
                              onChange={event => updateSplit(source.companyId, event.target.value)}
                              disabled={loading || quantityToAdd <= 0}
                            />
                            <small className="text-muted">Available {availableForEntry}</small>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {error && <div className="alert alert-danger py-2">{error}</div>}
              </>
            )}
            {error && !details && <div className="alert alert-danger mt-3">{error}</div>}
          </div>
          <div className="modal-footer lacquer-quantity-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading || !details || (!addQty && !(isReady && (rejectionQty || rejectionBoxes)))}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrintingOrderQtyModal(props) {
  return <PrintingQuantityModal {...props} subType="order" />;
}

export function PrintingReadyQtyModal(props) {
  return <PrintingQuantityModal {...props} subType="ready" />;
}
