import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addStockEntry, updateStockEntry, fetchStockSummary, fetchMaterialHistory } from '../../redux/slices/stockEntrySlice';
import Swal from 'sweetalert2';

export default function StockOutForm({ onClose, selectedDate, material, editEntry }) {
  const dispatch = useDispatch();
  const { searchTerm } = useSelector(state => state.stockEntries || {});
  
  const [date, setDate] = useState(editEntry ? new Date(editEntry.date).toISOString().split('T')[0] : (selectedDate || new Date().toISOString().split('T')[0]));
  // Implicitly use 'consumed' if editing, otherwise 'remaining'
  const isEditing = !!editEntry;
  const [inputQuantity, setInputQuantity] = useState(editEntry ? editEntry.quantity : '');

  const evaluateMath = (str) => {
    if (!str) return 0;
    try {
      const sanitized = str.toString().replace(/x/gi, '*').replace(/[^\d+*/.\-()]/g, '');
      const result = new Function('return ' + (sanitized || '0'))();
      return isNaN(result) || !isFinite(result) ? 0 : Number(result);
    } catch (e) {
      return 0;
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const parsedQuantity = evaluateMath(inputQuantity);

    if (inputQuantity === '' || parsedQuantity < 0) {
      Swal.fire('Error', 'Please enter a valid quantity', 'error');
      return;
    }

    const maxAllowed = isEditing ? (material.currentStock + Number(editEntry.quantity)) : material.currentStock;
    let finalQuantityOut = 0;

    if (isEditing) {
      finalQuantityOut = parsedQuantity;
      if (finalQuantityOut > maxAllowed) {
        Swal.fire('Error', `Quantity OUT cannot exceed available stock (${maxAllowed.toFixed(2)} ${material.unit || 'KG'}).`, 'error');
        return;
      }
    } else {
      const remainingStock = parsedQuantity;
      if (remainingStock > maxAllowed) {
        Swal.fire('Error', `Remaining stock cannot exceed current stock (${maxAllowed.toFixed(2)} ${material.unit || 'KG'}). If you found extra stock, please create a new Stock IN invoice instead.`, 'error');
        return;
      }
      finalQuantityOut = maxAllowed - remainingStock;
    }

    if (finalQuantityOut <= 0) {
      Swal.fire('Error', 'The resulting Stock OUT quantity must be greater than 0.', 'error');
      return;
    }

    submitEntry(finalQuantityOut);
  };

  const submitEntry = (finalQuantityOut) => {
    const payload = {
      type: 'OUT',
      date,
      items: [{
        rawMaterialId: material.rawMaterial._id,
        quantity: finalQuantityOut
      }]
    };

    const action = isEditing 
      ? updateStockEntry({ id: editEntry.id, data: payload })
      : addStockEntry(payload);

    dispatch(action).then(res => {
      if (!res.error) {
        Swal.fire('Success', `Stock OUT ${isEditing ? 'updated' : 'saved'} successfully!`, 'success');
        dispatch(fetchStockSummary({ date: selectedDate, limit: 1000, search: searchTerm || '' }));
        if (isEditing) {
          dispatch(fetchMaterialHistory({ id: material.rawMaterial._id, limit: 1000 }));
        }
        onClose();
      } else {
        Swal.fire('Error', res.payload || `Failed to ${isEditing ? 'update' : 'save'} Stock OUT`, 'error');
      }
    });
  };

  return (
    <div className="modal show d-block stock-entry-out-modal" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="modal-dialog modal-dialog-centered stock-entry-out-dialog">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '1.25rem', overflow: 'hidden' }}>
          <div className="modal-header border-bottom-0 p-4 pb-3" style={{ background: 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)' }}>
            <h5 className="modal-title fw-bold text-white d-flex align-items-center">
              <i className="bi bi-box-arrow-up me-2 fs-5"></i> 
              {isEditing ? 'Edit Stock OUT' : 'Physical Stock Update'}
            </h5>
            <button type="button" className="btn-close btn-close-white shadow-none" onClick={onClose}></button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4 pt-4">
              <div className="mb-4 text-center p-3 bg-light rounded-4 border border-light-subtle">
                <h4 className="fw-bold mb-2 text-dark">{material.rawMaterial.name}</h4>
                <div className="d-flex flex-column flex-sm-row align-items-center justify-content-center gap-2">
                  <span className="text-muted small fw-semibold text-uppercase tracking-wide text-center">Current System Stock</span>
                  <span className="badge bg-white text-danger border border-danger border-opacity-25 px-3 py-2 fs-6 shadow-sm rounded-pill text-nowrap">
                    {material.currentStock.toFixed(2)} {material.unit || 'KG'}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label fw-bold text-secondary small text-uppercase tracking-wide">Date of Check *</label>
                <div className="input-group">
                  <span className="input-group-text bg-white border-end-0 text-muted"><i className="bi bi-calendar3"></i></span>
                  <input type="date" className="form-control border-start-0 ps-0 shadow-none" value={date} onChange={e => setDate(e.target.value)} required />
                </div>
              </div>
              
              <div className="mb-3">
                <label className="form-label fw-bold text-secondary small text-uppercase tracking-wide">
                  {isEditing ? `Quantity Used / OUT (${material.unit || 'KG'}) *` : `Physical Remaining Stock (${material.unit || 'KG'}) *`}
                </label>
                <div className="input-group input-group-lg">
                  <input 
                    type="text" 
                    className="form-control shadow-none fw-bold" 
                    style={{ borderColor: '#ef4444' }}
                    value={inputQuantity} 
                    onChange={e => setInputQuantity(e.target.value)} 
                    required 
                    placeholder="e.g. 7 * 200" 
                    autoFocus 
                  />
                  <span className="input-group-text bg-danger text-white border-danger fw-bold">{material.unit || 'KG'}</span>
                </div>
                
                {!isEditing && inputQuantity !== '' && (
                  <div className="mt-3 p-3 rounded-3 bg-danger bg-opacity-10 border border-danger border-opacity-25 text-danger d-flex align-items-center">
                    <i className="bi bi-calculator fs-5 me-3"></i>
                    <div>
                      <div className="small fw-semibold mb-1">System Calculation</div>
                      <div className="fs-6">
                        <strong>{Math.max(0, material.currentStock - evaluateMath(inputQuantity)).toFixed(2)} {material.unit || 'KG'}</strong> will be recorded as consumed.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer border-top-0 bg-light p-4 pt-3 d-flex flex-column flex-sm-row justify-content-end gap-2">
              <button type="button" className="btn btn-light border fw-bold text-secondary rounded-3 px-4 py-2 w-100 w-sm-auto order-2 order-sm-1" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-danger fw-bold rounded-3 px-4 py-2 shadow-sm d-flex align-items-center justify-content-center w-100 w-sm-auto order-1 order-sm-2 mb-2 mb-sm-0">
                <i className="bi bi-check2-circle me-2 fs-5"></i> 
                Confirm Update
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
