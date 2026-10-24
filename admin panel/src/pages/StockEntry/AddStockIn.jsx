import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { addStockEntry } from '../../redux/slices/stockEntrySlice';
import { fetchRawMaterials, createRawMaterial } from '../../redux/slices/rawMaterialSlice';
import { parseInvoice } from '../../redux/slices/visionSlice';
import Swal from 'sweetalert2';
import CreatableSelect from 'react-select/creatable';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../../context/AbilityContext';

export default function AddStockIn() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const ability = useAbility(AbilityContext);
  const canSeeRate = ability.can('rate', 'stock_entry');
  const fallbackUrl = location.state?.from || '/stock-invoices';
  const { items: rawMaterials } = useSelector(state => state.rawMaterials);
  const { loading: visionLoading } = useSelector(state => state.vision);
  
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState([{ rawMaterialId: '', quantity: '', rate: '', per: '', amount: 0 }]);
  const [invoiceFileUrl, setInvoiceFileUrl] = useState('');

  const [mode, setMode] = useState('manual');
  const [image, setImage] = useState(null);
  const [cameraSource, setCameraSource] = useState(null);

  const handleMatch = async () => {
    if (!image) return Swal.fire('Error', 'Please provide an image first', 'error');
    
    try {
      const res = await dispatch(parseInvoice(image)).unwrap();
      
      if (res.invoiceNumber) {
        setInvoiceNumber(res.invoiceNumber);
      }
      if (res.supplierName) {
        setSupplierName(res.supplierName);
      }
      if (res.fileUrl) {
        setInvoiceFileUrl(res.fileUrl);
      }
      if (res.invoiceDate) {
        try {
          // res.invoiceDate could be '11-08-2026', '11-Aug-26', '11 Aug 2026'
          const parts = res.invoiceDate.split(/[-/.\s]+/);
          if (parts.length === 3) {
            let day = parts[0].padStart(2, '0');
            let month = parts[1];
            let year = parts[2];
            
            // Handle alphabetic months
            if (isNaN(month)) {
              const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
              const monthStr = month.substring(0, 3).toLowerCase();
              month = monthMap[monthStr] || '01';
            } else {
              month = month.padStart(2, '0');
            }
            
            year = year.length === 2 ? `20${year}` : year;
            setDate(`${year}-${month}-${day}`);
          }
        } catch (e) {
          console.error("Date parsing error", e);
        }
      }
      let itemsToSet = [];
      if (res.items && res.items.length > 0) {
        itemsToSet = res.items;
      }
      
      let warningText = "";
      if (res.unmatchedItems && res.unmatchedItems.length > 0) {
        const unmatchedNames = res.unmatchedItems.map(i => `<b>${i.suggestedName}</b>`).join(', ');
        warningText = `<br/><br/><b style='color:#e63946;'>Warning:</b> Found ${res.unmatchedItems.length} item(s) on the invoice that do not match any raw material in the database: ${unmatchedNames}. Please add the raw materials first, or map them manually.`;
        // Removed the code that pushes these to the UI as extra blank boxes
      }

      if (itemsToSet.length > 0) {
        setItems(itemsToSet);
        Swal.fire({
          icon: (res.unmatchedItems && res.unmatchedItems.length > 0) ? 'warning' : 'success',
          title: 'Invoice Parsed',
          html: `Found Invoice No: <b>${res.invoiceNumber || 'N/A'}</b>, Supplier: <b>${res.supplierName || 'N/A'}</b>.<br/>Matched ${res.items?.length || 0} items! ${warningText}`,
          showConfirmButton: true
        });
        setMode('manual');
      } else {
        Swal.fire('Warning', 'No items could be automatically detected from this invoice. Please enter them manually.', 'warning').then(() => setMode('manual'));
      }
    } catch (error) {
      Swal.fire('Error', error || 'Failed to parse invoice', 'error');
    }
  };

  useEffect(() => {
    dispatch(fetchRawMaterials({ pagination: 'false' }));
  }, [dispatch]);

  const handleAddItem = () => {
    setItems([...items, { rawMaterialId: '', descriptionOfGoods: '', quantity: '', rate: '', per: '', amount: 0 }]);
  };

  const handleRemoveItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

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
      const q = evaluateMath(newItems[index].quantity);
      const r = Number(newItems[index].rate) || 0;
      newItems[index].amount = Number((q * r).toFixed(2));
    } else if (field === 'amount') {
      const amt = Number(value) || 0;
      const q = evaluateMath(newItems[index].quantity);
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

    const validItems = items.filter(item => item.rawMaterialId && item.quantity && evaluateMath(item.quantity) > 0);
    
    if (validItems.length === 0) {
      Swal.fire('Error', 'Please add at least one raw material with a valid quantity.', 'error');
      return;
    }

    // Process new raw materials
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

      const res = await dispatch(addStockEntry({
        type: 'IN',
        invoiceNumber,
        supplierName,
        date,
        invoiceFileUrl,
        items: processedItems.map(item => ({
          rawMaterialId: item.rawMaterialId,
          descriptionOfGoods: item.descriptionOfGoods || '',
          quantity: evaluateMath(item.quantity),
          rate: Number(item.rate) || 0,
          per: item.per || '',
          amount: Number(item.amount) || 0
        }))
      }));

      if (!res.error) {
        dispatch(fetchRawMaterials({ limit: 1000 })); // Refresh if any were created
        Swal.fire('Success', 'Stock IN invoice added successfully!', 'success');
        navigate(fallbackUrl);
      } else {
        Swal.fire('Error', res.payload || 'Failed to add Stock IN', 'error');
      }
    } catch (error) {
      Swal.fire('Error', error?.message || error || 'Failed to process raw materials', 'error');
    }
  };

  const totalQuantity = items.reduce((sum, item) => sum + evaluateMath(item.quantity), 0);
  const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const validItemsCount = items.filter(i => i.rawMaterialId && evaluateMath(i.quantity) > 0).length;

  return (
    <div className="page-content stock-entry-page stock-entry-form-page">
      <div className="page-header d-flex align-items-center justify-content-between user-form-page-header stock-entry-form-header">
        <div className="d-flex align-items-center gap-3">
          <Link to={fallbackUrl} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
            <i className="bi bi-arrow-left fs-5 text-secondary"></i>
          </Link>
          <div>
            <h1 className="page-title">New Stock IN</h1>
            <p className="page-subtitle">Add raw material via supplier invoice</p>
          </div>
        </div>

        <div className="mode-toggle-container p-1 bg-light rounded-4 d-flex stock-entry-mode-toggle" style={{ border: '1px solid #eee' }}>
          <button
            className={`btn btn-sm py-2 px-4 rounded-3 border-0 transition-all ${mode === 'camera' ? 'btn-accent shadow-sm' : 'btn-ghost'}`}
            onClick={() => setMode('camera')}
          >
            <i className="bi bi-cloud-arrow-up-fill me-2" /> Upload File
          </button>
          <button
            className={`btn btn-sm py-2 px-4 rounded-3 border-0 transition-all ${mode === 'manual' ? 'btn-accent shadow-sm' : 'btn-ghost'}`}
            onClick={() => setMode('manual')}
          >
            <i className="bi bi-pencil-square me-2" /> Manual Mode
          </button>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-10 col-lg-12">
          
          {mode === 'camera' ? (
            <div className="dash-card mb-4 overflow-hidden border-0 shadow-lg stock-entry-upload-card" style={{ borderRadius: 24 }}>
              <div className="dash-card-body p-3 p-md-5 text-center">
                {!cameraSource && !image ? (
                  <div className="py-5">
                    <h3 className="fw-bold mb-4">How would you like to provide the invoice?</h3>
                    <div className="d-flex justify-content-center gap-4">
                      <button
                        className="btn btn-outline-accent p-4 rounded-4 d-flex flex-column align-items-center gap-2"
                        style={{ width: 180, borderWidth: 2 }}
                        onClick={() => setCameraSource('upload')}
                      >
                        <i className="bi bi-folder" style={{ fontSize: 32 }} />
                        <span className="fw-bold">Upload File</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                      <div
                        className="upload-placeholder mx-auto mb-4 d-flex flex-column align-items-center justify-content-center"
                        style={{
                          maxWidth: 240,
                          width: '100%',
                          aspectRatio: '1 / 1',
                          borderRadius: 30,
                          border: '3px dashed #ddd',
                          background: image ? 'transparent' : '#fcfcfc',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          position: 'relative'
                        }}
                        onClick={() => image ? null : document.getElementById('camera-file').click()}
                      >
                        {image ? (
                          image.type === 'application/pdf' ? (
                            <embed src={URL.createObjectURL(image)} type="application/pdf" style={{ width: '100%', height: '100%' }} />
                          ) : (
                            <img src={URL.createObjectURL(image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                          )
                        ) : (
                          <>
                            <i className="bi bi-cloud-arrow-up text-accent mb-2" style={{ fontSize: 48 }} />
                            <span className="fw-600 text-muted">Click to upload invoice</span>
                            <button className="btn btn-sm btn-ghost position-absolute top-0 end-0 m-2" onClick={(e) => { e.stopPropagation(); setCameraSource(null); }}>
                              <i className="bi bi-x-lg" />
                            </button>
                          </>
                        )}
                      </div>

                    <input
                      type="file"
                      id="camera-file"
                      hidden
                      accept="image/*,.pdf"
                      onChange={e => {
                        setImage(e.target.files[0]);
                        setCameraSource('upload');
                      }}
                    />

                    {image && (
                      <>
                        <h3 className="fw-bold mt-4">Invoice Provided</h3>
                        <p className="text-muted">Process the invoice to auto-fill items</p>
                      </>
                    )}
                  </div>
                )}

                {(image || cameraSource) && (
                  <div className="d-flex flex-column flex-sm-row justify-content-center align-items-center gap-3 mt-4">
                    <button
                      className="btn-accent px-5 py-3 rounded-4 shadow-sm d-flex align-items-center gap-2 w-100 w-sm-auto justify-content-center"
                      onClick={handleMatch}
                      disabled={!image || visionLoading}
                    >
                      {visionLoading ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          Scanning...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-magic" /> Scan Invoice
                        </>
                      )}
                    </button>
                    <button className="btn-ghost px-5 py-3 rounded-4 w-100 w-sm-auto" onClick={() => { setImage(null); setCameraSource(null); }} disabled={visionLoading}>
                      {image ? 'Change Invoice' : 'Cancel'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
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
                            <input type="text" className="form-control form-control-sm shadow-none text-end" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} required placeholder="e.g. 7 * 200 or 1400" />
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
                    <i className="bi bi-check2-circle me-2" /> Save Stock IN
                  </button>
                  <button type="button" onClick={() => navigate(fallbackUrl)} className="btn-ghost px-5 py-3 text-decoration-none text-center">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
