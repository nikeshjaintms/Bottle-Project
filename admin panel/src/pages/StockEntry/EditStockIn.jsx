import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link, useParams, useLocation } from 'react-router-dom';
import { fetchStockEntryById, updateStockEntry } from '../../redux/slices/stockEntrySlice';
import { fetchRawMaterials, createRawMaterial } from '../../redux/slices/rawMaterialSlice';
import Swal from 'sweetalert2';
import CreatableSelect from 'react-select/creatable';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../../context/AbilityContext';

export default function EditStockIn() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const fallbackUrl = location.state?.from || '/stock-invoices';
  const editItemId = location.state?.editItemId;
  const ability = useAbility(AbilityContext);
  const canSeeRate = ability.can('rate', 'stock_entry');
  const { items: rawMaterials } = useSelector(state => state.rawMaterials);
  
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState([]);
  const [hiddenItems, setHiddenItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dispatch(fetchRawMaterials({ pagination: 'false' }));
    
    dispatch(fetchStockEntryById(id)).then(res => {
      if (!res.error) {
        const entry = res.payload.data;
        setInvoiceNumber(entry.invoiceNumber || '');
        setSupplierName(entry.supplierName || '');
        setDate(entry.date ? new Date(entry.date).toISOString().split('T')[0] : '');
        
        if (res.payload.data && res.payload.data.items) {
          if (editItemId) {
            const targetItem = res.payload.data.items.find(i => i.rawMaterialId._id === editItemId);
            const otherItems = res.payload.data.items.filter(i => i.rawMaterialId._id !== editItemId);
            
            if (targetItem) {
              setItems([{
                rawMaterialId: targetItem.rawMaterialId._id,
                descriptionOfGoods: targetItem.descriptionOfGoods || '',
                quantity: targetItem.quantity,
                rate: targetItem.rate || '',
                per: targetItem.per || '',
                amount: targetItem.amount || 0
              }]);
            } else {
              setItems([]);
            }
            setHiddenItems(otherItems.map(item => ({
              rawMaterialId: item.rawMaterialId._id,
              descriptionOfGoods: item.descriptionOfGoods || '',
              quantity: item.quantity,
              rate: item.rate || '',
              per: item.per || '',
              amount: item.amount || 0
            })));
          } else {
            setItems(res.payload.data.items.map(item => ({
              rawMaterialId: item.rawMaterialId._id,
              descriptionOfGoods: item.descriptionOfGoods || '',
              quantity: item.quantity,
              rate: item.rate || '',
              per: item.per || '',
              amount: item.amount || 0
            })));
            setHiddenItems([]);
          }
        }
      } else {
        Swal.fire('Error', res.payload || 'Failed to fetch invoice', 'error');
        navigate(fallbackUrl);
      }
      setLoading(false);
    });
  }, [dispatch, id, navigate, editItemId]);

  const handleAddItem = () => {
    setItems([...items, { rawMaterialId: '', descriptionOfGoods: '', quantity: '', rate: '', per: '', amount: 0 }]);
  };

  const handleRemoveItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    
    if (field === 'rawMaterialId') {
      newItems[index].rawMaterialId = value;
      // Auto-populate description if available
      const selectedRM = rawMaterials.find(rm => rm._id === value);
      if (selectedRM) {
        newItems[index].descriptionOfGoods = selectedRM.name;
      }
    } else {
      newItems[index][field] = value;
    }
    
    // Auto-calculate dynamically based on which field was changed
    if (field === 'quantity' || field === 'rate' || field === 'rawMaterialId') {
      const q = Number(newItems[index].quantity) || 0;
      const r = Number(newItems[index].rate) || 0;
      newItems[index].amount = Number((q * r).toFixed(2));
    } else if (field === 'amount') {
      const amt = Number(value) || 0;
      const q = Number(newItems[index].quantity) || 0;
      if (q > 0) {
        newItems[index].rate = Number((amt / q).toFixed(2));
      }
    }

    setItems(newItems);
  };

  const handleCreateRawMaterial = async (inputValue, index) => {
    const newId = `NEW_${inputValue}`;
    handleItemChange(index, 'rawMaterialId', newId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!invoiceNumber || !supplierName || !date) {
      Swal.fire('Error', 'Invoice Number, Supplier Name, and Date are required.', 'error');
      return;
    }

    const validItems = items.filter(item => item.rawMaterialId && item.quantity && Number(item.quantity) > 0);
    
    if (validItems.length === 0) {
      Swal.fire('Error', 'Please add at least one raw material with a valid quantity.', 'error');
      return;
    }

    const pendingCreations = new Map();
    let processedItems = [];

    try {
      for (const item of validItems) {
        let finalId = item.rawMaterialId;
        
        if (finalId.startsWith('NEW_')) {
          const rawMaterialName = finalId.replace('NEW_', '');
          if (!pendingCreations.has(rawMaterialName)) {
            const res = await dispatch(createRawMaterial({ name: rawMaterialName.toUpperCase(), status: true })).unwrap();
            const realId = res._id || res.data?._id;
            pendingCreations.set(rawMaterialName, realId);
          }
          finalId = pendingCreations.get(rawMaterialName);
        }

        processedItems.push({
          ...item,
          rawMaterialId: finalId
        });
      }

      const selectedIds = processedItems.map(item => item.rawMaterialId);
      const uniqueIds = new Set(selectedIds);
      if (uniqueIds.size !== selectedIds.length) {
        Swal.fire('Error', 'Duplicate raw materials are not allowed in the same invoice. Please consolidate the quantities.', 'error');
        return;
      }

      const allItems = [...processedItems, ...hiddenItems];

      const res = await dispatch(updateStockEntry({
        id,
        data: {
          type: 'IN',
          invoiceNumber,
          supplierName,
          date,
          items: allItems.map(item => ({
            rawMaterialId: item.rawMaterialId,
            descriptionOfGoods: item.descriptionOfGoods || '',
            quantity: Number(item.quantity),
            rate: Number(item.rate) || 0,
            per: item.per || '',
            amount: Number(item.amount) || 0
          }))
        }
      }));

      if (!res.error) {
        if (pendingCreations.size > 0) {
          dispatch(fetchRawMaterials({ limit: 1000 }));
        }
        Swal.fire('Success', 'Stock IN invoice updated successfully!', 'success');
        navigate(fallbackUrl);
      } else {
        Swal.fire('Error', res.payload || 'Failed to update Stock IN', 'error');
      }
    } catch (error) {
      Swal.fire('Error', error?.message || error || 'Failed to process raw materials', 'error');
    }
  };

  if (loading) {
    return <div className="page-content text-center py-5">Loading...</div>;
  }

  const allActiveItems = [...items, ...hiddenItems];
  const totalQuantity = allActiveItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const totalAmount = allActiveItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const validItemsCount = allActiveItems.filter(i => i.rawMaterialId && Number(i.quantity) > 0).length;

  return (
    <div className="page-content stock-entry-page stock-entry-form-page">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header stock-entry-form-header">
        <Link to={fallbackUrl} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
          <i className="bi bi-arrow-left fs-5 text-secondary"></i>
        </Link>
        <div>
          <h1 className="page-title">Edit Stock IN</h1>
          <p className="page-subtitle">Update an existing raw material invoice</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-10 col-lg-12">
          <div className="dash-card stock-entry-form-card">
            <div className="dash-card-body p-4 stock-entry-form-body">
              <form onSubmit={handleSubmit}>
                <div className="row g-4 mb-4">
                  <div className="col-md-4">
                    <label className="form-label fw-bold small">Invoice Number *</label>
                    <input type="text" className="form-control shadow-none" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} required placeholder="e.g. INV-2026-001" />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-bold small">Invoice Date *</label>
                    <input type="date" className="form-control shadow-none" value={date} onChange={e => setDate(e.target.value)} required />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label fw-bold small">Supplier Name *</label>
                    <input type="text" className="form-control shadow-none" value={supplierName} onChange={e => setSupplierName(e.target.value)} required placeholder="e.g. ABC Chemicals" />
                  </div>
                </div>

                <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2 mt-4">
                  <h6 className="fw-bold text-primary mb-0">INVOICE ITEMS</h6>
                </div>
                
                <div className="table-responsive mb-3 stock-entry-items-table">
                  <table className="table table-bordered align-middle">
                    <thead className="table-light">
                      <tr>
                        <th className="small text-muted text-center" style={{width: '5%', minWidth: '50px'}}>Sr.</th>
                        <th className="small text-muted" style={{width: '35%', minWidth: '250px'}}>Description of Goods / Raw Material</th>
                        <th className="small text-muted" style={{width: '12%', minWidth: '120px'}}>Quantity</th>
                        {canSeeRate && <th className="small text-muted" style={{width: '12%', minWidth: '100px'}}>Rate</th>}
                        <th className="small text-muted" style={{width: '10%', minWidth: '80px'}}>Per</th>
                        {canSeeRate && <th className="small text-muted text-end" style={{width: '16%', minWidth: '120px'}}>Amount</th>}
                        <th className="small text-muted text-center" style={{width: '10%', minWidth: '80px'}}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={index}>
                          <td className="text-center text-muted">{index + 1}</td>
                          <td>
                            <div className="d-flex flex-column gap-2">
                              <CreatableSelect
                                options={rawMaterials?.map(rm => ({ value: rm._id, label: rm.name })) || []}
                                value={item.rawMaterialId ? { value: item.rawMaterialId, label: rawMaterials?.find(rm => rm._id === item.rawMaterialId)?.name || (item.rawMaterialId.startsWith('NEW_') ? item.rawMaterialId.replace('NEW_', '') : 'Unknown') } : null}
                                onChange={selectedOption => handleItemChange(index, 'rawMaterialId', selectedOption ? selectedOption.value : '')}
                                onCreateOption={(val) => handleCreateRawMaterial(val, index)}
                                placeholder="[Select or Type New Raw Material]"
                                isClearable
                                isSearchable
                                className="react-select-container"
                                classNamePrefix="react-select"
                                menuPortalTarget={document.body}
                                formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                                styles={{
                                  control: (base) => ({ 
                                    ...base, 
                                    minHeight: '31px', 
                                    height: 'auto', 
                                    fontSize: '0.875rem',
                                    borderRadius: 8,
                                    borderColor: 'var(--bs-border-color-translucent)',
                                    backgroundColor: 'var(--bs-light)',
                                    boxShadow: 'none',
                                    '&:hover': { borderColor: 'var(--bs-border-color)' }
                                  }),
                                  valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                  dropdownIndicator: (base) => ({ ...base, padding: '4px' }),
                                  clearIndicator: (base) => ({ ...base, padding: '4px' }),
                                  menuPortal: base => ({ ...base, zIndex: 9999, fontSize: '0.875rem' })
                                }}
                              />
                            </div>
                          </td>
                          <td>
                            <input type="number" className="form-control form-control-sm shadow-none text-end" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} min="0" step="0.001" required placeholder="0.000" />
                          </td>
                          {canSeeRate && (
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-end" value={item.rate} onChange={e => handleItemChange(index, 'rate', e.target.value)} min="0" step="0.01" placeholder="0.00" />
                            </td>
                          )}
                          <td>
                            <input type="text" className="form-control form-control-sm shadow-none" value={item.per} onChange={e => handleItemChange(index, 'per', e.target.value)} placeholder="e.g. Kgs" />
                          </td>
                          {canSeeRate && (
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-end bg-light fw-bold" value={item.amount || ''} onChange={e => handleItemChange(index, 'amount', e.target.value)} min="0" step="0.01" placeholder="0.00" />
                            </td>
                          )}
                          <td className="text-center">
                            <button type="button" className="btn btn-outline-danger btn-sm rounded-3 py-1 px-2" onClick={() => handleRemoveItem(index)} disabled={items.length === 1} title="Remove Item">
                              <i className="bi bi-x-lg"></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <button type="button" className="btn btn-light border btn-sm rounded-3 shadow-sm fw-500 mb-4" onClick={handleAddItem}>
                  <i className="bi bi-plus-lg me-1"></i> Add Another Item
                </button>

                <div className="card bg-light border-0 mb-4">
                  <div className="card-body px-4 py-3">
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center border-bottom pb-2 mb-2 gap-1">
                      <span className="fw-500 text-muted mb-1 mb-sm-0">Total Quantity / Items:</span>
                      <span className="fw-bold fs-6">{totalQuantity.toFixed(3)} <span className="text-muted fw-normal fs-7">(across {validItemsCount} valid items)</span></span>
                    </div>
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-1 pt-1">
                      <span className="fw-bold fs-5 mb-1 mb-sm-0">Total Invoice Amount:</span>
                      <span className="fw-bold fs-4 text-primary">₹ {totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
                
                <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1">
                    <i className="bi bi-check2-circle me-2" /> Update Invoice
                  </button>
                  <button type="button" onClick={() => navigate(fallbackUrl)} className="btn-ghost px-5 py-3 text-decoration-none text-center">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
