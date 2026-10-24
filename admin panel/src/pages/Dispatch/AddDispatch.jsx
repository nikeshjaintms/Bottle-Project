import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { createDispatch } from '../../redux/slices/dispatchSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import { fetchPrintingTypes } from '../../redux/slices/printingTypeSlice';
import Select from 'react-select';
import Swal from 'sweetalert2';

export default function AddDispatch() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { items: bottlePerBoxes } = useSelector(state => state.bottlePerBox);
  const { companies } = useSelector(state => state.companies);
  const { bottleSpecs } = useSelector(state => state.bottleSpecs);
  const { variants } = useSelector(state => state.variants);
  const { items: printingTypes } = useSelector(state => state.printingType || { items: [] });

  const [formData, setFormData] = useState({
    dispatchDate: new Date().toISOString().split('T')[0],
    gatePassNo: '',
    companyId: '',
    remarks: ''
  });

  const [items, setItems] = useState([{
    bottleId: '',
    coatingShade: '',
    printingTypeId: '',
    variantId: '',
    detectedTextColor: 'Not Detected',
    box: '',
    qty: '',
    totalQty: 0
  }]);

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ pagination: "false" }));
    dispatch(fetchCompanies({ pagination: "false" }));
    dispatch(fetchBottleSpecs({ pagination: "false", type: "all" }));
    dispatch(fetchVariants({ pagination: "false" }));
    dispatch(fetchPrintingTypes({ limit: 1000, status: true }));
  }, [dispatch]);

  const companyOptions = useMemo(() => {
    if (!companies || companies.length === 0) return [];
    return companies.map(c => ({ value: c._id, label: c.name }));
  }, [companies]);

  const bottleOptions = useMemo(() => {
    if (!formData.companyId || !bottlePerBoxes || !bottleSpecs) return [];
    
    // Filter bottles associated with the selected company
    const companyBottles = bottleSpecs
      .filter(spec => 
        spec.brandId?.companyId?._id === formData.companyId || 
        spec.brandId?.companyId === formData.companyId
      )
      .map(spec => spec.bottleName)
      .filter(Boolean);

    const uniqueBottles = new Set(companyBottles);
    
    return bottlePerBoxes
      .filter(b => uniqueBottles.has(b.bottleName))
      .map(b => ({ value: b._id, label: b.bottleName }));
  }, [formData.companyId, bottlePerBoxes, bottleSpecs]);

  const getVariantOptions = (selectedBottleId) => {
    if (!selectedBottleId || !bottleSpecs || !variants) return [];
    
    // Find the selected bottle and get its plain bottle name
    const bottlePerBox = bottlePerBoxes?.find(b => b._id === selectedBottleId);
    if (!bottlePerBox) return [];
    
    // Use plainBottleName instead of bottleName
    const plainBottleName = bottlePerBox.plainBottleName || bottlePerBox.bottleName;
    
    const specs = bottleSpecs.filter(spec => spec.bottleName === plainBottleName);
    const variantMap = new Map();
    
    specs.forEach(spec => {
      if (spec.variantId) {
        const variantIdStr = typeof spec.variantId === 'string' ? spec.variantId : spec.variantId._id || spec.variantId;
        if (!variantMap.has(variantIdStr)) {
          // Find the variant document to get its name
          const variantDoc = variants.find(v => v._id === variantIdStr);
          const label = variantDoc?.variantName || variantIdStr;
          variantMap.set(variantIdStr, { value: variantIdStr, label });
        }
      }
    });
    
    return Array.from(variantMap.values());
  };

  const getCoatingShadeOptions = (selectedBottleId) => {
    if (!selectedBottleId || !bottleSpecs) return [];
    
    // Find the selected bottle and get its plain bottle name
    const bottlePerBox = bottlePerBoxes?.find(b => b._id === selectedBottleId);
    if (!bottlePerBox) return [];
    
    // Use plainBottleName instead of bottleName
    const plainBottleName = bottlePerBox.plainBottleName || bottlePerBox.bottleName;
    
    const specs = bottleSpecs.filter(spec => spec.bottleName === plainBottleName);
    const coatingShades = new Set();
    specs.forEach(spec => {
      if (spec.coatingShade) coatingShades.add(spec.coatingShade);
    });
    
    return Array.from(coatingShades).map(shade => ({ value: shade, label: shade }));
  };

  const getPrintingTypeOptions = (selectedBottleId, selectedVariantId) => {
    // Fallback: If we can't find specs with printing types, return all available printing types
    // This ensures user always has options to choose from
    if (!selectedBottleId || !printingTypes || printingTypes.length === 0) {
      return [];
    }
    
    // Try to get bottle specs with printing type info
    if (bottleSpecs && bottleSpecs.length > 0) {
      const bottlePerBox = bottlePerBoxes?.find(b => b._id === selectedBottleId);
      if (bottlePerBox) {
        const plainBottleName = bottlePerBox.plainBottleName || bottlePerBox.bottleName;
        
        // If variant is selected, filter specs by bottle + variant + printing type
        if (selectedVariantId) {
          const specsForVariant = bottleSpecs.filter(spec => 
            spec.bottleName === plainBottleName && 
            (spec.variantId === selectedVariantId || spec.variantId?._id === selectedVariantId) &&
            spec.printingTypeId
          );
          
          const printingTypeMap = new Map();
          specsForVariant.forEach(spec => {
            if (spec.printingTypeId) {
              const printingTypeId = typeof spec.printingTypeId === 'object' 
                ? spec.printingTypeId._id 
                : spec.printingTypeId;
              
              if (!printingTypeMap.has(printingTypeId)) {
                const printingTypeDoc = printingTypes.find(pt => pt._id === printingTypeId);
                const label = printingTypeDoc?.printingType || printingTypeDoc?.name || printingTypeId;
                printingTypeMap.set(printingTypeId, { value: printingTypeId, label });
              }
            }
          });
          
          if (printingTypeMap.size > 0) {
            return Array.from(printingTypeMap.values());
          }
        } else {
          // No variant selected - get all printing types for this bottle
          const specsForBottle = bottleSpecs.filter(spec => 
            spec.bottleName === plainBottleName && spec.printingTypeId
          );
          
          const printingTypeMap = new Map();
          specsForBottle.forEach(spec => {
            if (spec.printingTypeId) {
              const printingTypeId = typeof spec.printingTypeId === 'object' 
                ? spec.printingTypeId._id 
                : spec.printingTypeId;
              
              if (!printingTypeMap.has(printingTypeId)) {
                const printingTypeDoc = printingTypes.find(pt => pt._id === printingTypeId);
                const label = printingTypeDoc?.printingType || printingTypeDoc?.name || printingTypeId;
                printingTypeMap.set(printingTypeId, { value: printingTypeId, label });
              }
            }
          });
          
          if (printingTypeMap.size > 0) {
            return Array.from(printingTypeMap.values());
          }
        }
      }
    }
    
    // Fallback: Return all active printing types so user has something to select
    return printingTypes.filter(pt => pt.status !== false).map(pt => ({ 
      value: pt._id, 
      label: pt.printingType || pt.name 
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCompanyChange = (selected) => {
    setFormData(prev => ({ ...prev, companyId: selected?.value || '' }));
  };

  const addItemRow = () => {
    setItems([...items, { bottleId: '', coatingShade: '', printingTypeId: '', detectedTextColor: 'Not Detected', variantId: '', box: '', qty: '', totalQty: 0 }]);
  };

  const removeItemRow = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;

    // When bottle changes, clear dependent fields
    if (field === 'bottleId' && value) {
      // Clear variant, coating shade, and printing type when bottle changes
      newItems[index].variantId = '';
      newItems[index].coatingShade = '';
      newItems[index].printingTypeId = '';
      newItems[index].detectedTextColor = 'Not Detected';
      
      // Auto-populate qty when bottleId changes
      const foundBox = bottlePerBoxes?.find(b => b._id === value);
      if (foundBox && foundBox.bottlePerBox != null && foundBox.bottlePerBox > 0) {
        newItems[index].qty = foundBox.bottlePerBox;
      } else {
        newItems[index].qty = '';
      }
    }

    // Auto-populate coating shade and printing type when variant is selected
    if (field === 'variantId' && value) {
      // Find the BottleSpec that has this variantId and get its coating shade and printing type
      const bottlePerBox = bottlePerBoxes?.find(b => b._id === newItems[index].bottleId);
      if (bottlePerBox) {
        const plainBottleName = bottlePerBox.plainBottleName || bottlePerBox.bottleName;
        
        // Get the text color directly from the selected variant
        const selectedVariant = variants?.find(v => v._id === value);
        if (selectedVariant && selectedVariant.detectedTextColor) {
          newItems[index].detectedTextColor = selectedVariant.detectedTextColor;
        }
        
        // Try to find matching BottleSpec by bottle name and variant
        let matchingSpec = bottleSpecs?.find(spec => 
          spec.bottleName === plainBottleName && 
          (spec.variantId === value || spec.variantId?._id === value)
        );
        
        // If not found with variantId, search for any spec with this bottle name and has printingTypeId
        // This handles cases where printingTypeId is set directly on BottleSpec without variantId
        if (!matchingSpec) {
          matchingSpec = bottleSpecs?.find(spec => 
            spec.bottleName === plainBottleName && 
            spec.printingTypeId
          );
        }
        
        if (matchingSpec) {
          // Auto-populate coating shade
          if (matchingSpec.coatingShade) {
            newItems[index].coatingShade = matchingSpec.coatingShade;
          }
        }
      }
    }

    // Auto-populate coating shade when printing type is selected
    if (field === 'printingTypeId' && value) {
      const bottlePerBox = bottlePerBoxes?.find(b => b._id === newItems[index].bottleId);
      if (bottlePerBox) {
        const plainBottleName = bottlePerBox.plainBottleName || bottlePerBox.bottleName;
        
        // Find the BottleSpec that matches bottle + variant + printing type
        const matchingSpec = bottleSpecs?.find(spec => 
          spec.bottleName === plainBottleName && 
          (spec.variantId === newItems[index].variantId || spec.variantId?._id === newItems[index].variantId) &&
          (spec.printingTypeId === value || spec.printingTypeId?._id === value)
        );
        
        if (matchingSpec && matchingSpec.coatingShade) {
          newItems[index].coatingShade = matchingSpec.coatingShade;
        }
      }
    }
    
    if (field === 'box' || field === 'qty' || field === 'bottleId') {
      const boxes = newItems[index].box === '' ? 0 : Number(newItems[index].box);
      const qty = newItems[index].qty === '' ? 0 : Number(newItems[index].qty);
      if (boxes > 0 && qty > 0) {
        newItems[index].totalQty = parseFloat((boxes * qty).toFixed(2));
      } else {
        newItems[index].totalQty = '';
      }
    } else if (field === 'totalQty') {
      const total = Number(value) || 0;
      const qty = Number(newItems[index].qty) || 0;
      if (qty > 0 && total > 0) {
        newItems[index].box = parseFloat((total / qty).toFixed(2));
      } else if (total === 0) {
        newItems[index].box = '';
      }
    }

    setItems(newItems);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.dispatchDate || !formData.gatePassNo || !formData.companyId) {
      return Swal.fire('Error', 'Please fill required fields (Dispatch Date, G. Pass No., Company)', 'error');
    }

    const validItems = items.filter(i => i.bottleId && i.qty > 0);
    if (validItems.length === 0) {
      return Swal.fire('Error', 'Please add at least one valid item with quantity > 0', 'error');
    }

    const bottleNames = validItems.map(i => i.bottleId).filter(Boolean);
    const uniqueBottles = new Set(bottleNames);
    if (uniqueBottles.size !== bottleNames.length) {
      return Swal.fire('Error', 'Duplicate bottles found! You cannot add the same bottle multiple times in a single dispatch.', 'error');
    }

    const payload = {
      dispatchDate: formData.dispatchDate,
      gatePassNo: formData.gatePassNo,
      companyId: formData.companyId,
      remarks: formData.remarks,
      items: validItems.map(item => ({
        bottleId: item.bottleId,
        coatingShade: item.coatingShade || null,
        variantId: item.variantId || null,
        detectedTextColor: item.detectedTextColor || 'Not Detected',
        printingTypeId: item.printingTypeId || null,
        box: Number(item.box) || 0,
        qty: Number(item.qty),
        totalQty: parseFloat((Number(item.box) * Number(item.qty)).toFixed(2))
      }))
    };

    dispatch(createDispatch(payload)).then(res => {
      if (!res.error) {
        Swal.fire('Success', 'Dispatch recorded successfully!', 'success');
        navigate(`/dispatch/company/${formData.companyId}`);
      } else {
        Swal.fire('Error', res.payload || 'Failed to save', 'error');
      }
    });
  };

  const grandTotal = items.reduce((acc, curr) => acc + (Number(curr.totalQty) || 0), 0);

  return (
    <div className="page-content dispatch-module-page dispatch-module-form">
      <div className="page-header d-flex align-items-center justify-content-between user-form-page-header">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
            <i className="bi bi-arrow-left fs-5 text-secondary" />
          </button>
          <div>
            <h1 className="page-title">New Dispatch Entry</h1>
            <p className="page-subtitle">Record dispatch/gate-pass transaction</p>
          </div>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="dash-card border-0 shadow-sm p-4">
            <form onSubmit={handleSubmit} className="dispatch-entry-form">
              <div className="row g-4 mb-4">
                <div className="col-md-3">
                  <label className="form-label fw-bold small">Dispatch Date <span className="text-danger">*</span></label>
                  <input
                    type="date"
                    name="dispatchDate"
                    value={formData.dispatchDate}
                    onChange={handleInputChange}
                    className="form-control shadow-none"
                    style={{ borderRadius: 10 }}
                    required
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold small">G. Pass No. <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    name="gatePassNo"
                    value={formData.gatePassNo}
                    onChange={handleInputChange}
                    className="form-control shadow-none"
                    style={{ borderRadius: 10 }}
                    required
                    placeholder="Enter G. Pass No"
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold small">Company <span className="text-danger">*</span></label>
                  <Select
                    options={companyOptions}
                    value={companyOptions.find(opt => opt.value === formData.companyId) || null}
                    onChange={handleCompanyChange}
                    placeholder="Select Company..."
                    isClearable
                    classNamePrefix="react-select"
                    styles={{
                      control: (base) => ({
                        ...base,
                        borderRadius: '8px',
                        minHeight: '38px',
                        borderColor: 'var(--bs-border-color)',
                        backgroundColor: 'var(--bs-light)'
                      })
                    }}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold small">Remarks</label>
                  <input
                    type="text"
                    name="remarks"
                    value={formData.remarks}
                    onChange={handleInputChange}
                    className="form-control shadow-none"
                    style={{ borderRadius: 10 }}
                    placeholder="Optional remarks"
                  />
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2 mt-4">
                <h6 className="fw-bold text-primary mb-0">BOTTLE ENTRIES</h6>
              </div>

              <div className="table-responsive mb-3 dispatch-entry-table">
                <table className="table table-bordered align-middle">
                  <thead className="table-light">
                    <tr>
                      <th className="small text-muted text-center" style={{ width: '4%', minWidth: '45px' }}>Sr.</th>
                      <th className="small text-muted" style={{ width: '20%' }}>Bottle Name <span className="text-danger">*</span></th>
                      <th className="small text-muted" style={{ width: '15%' }}>Variant (Printing)</th>
                      <th className="small text-muted" style={{ width: '15%' }}>Coating Shade</th>
                      <th className="small text-muted" style={{ width: '15%' }}>Text Color</th>
                      <th className="small text-muted text-center" style={{ width: '12%' }}>No of boxes</th>
                      <th className="small text-muted text-center" style={{ width: '12%' }}>Qty/Box <span className="text-danger">*</span></th>
                      <th className="small text-muted text-end" style={{ width: '12%' }}>Total Qty</th>
                      <th className="small text-muted text-center" style={{ width: '10%' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody className="border-top-0">
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td className="text-center text-muted small">{index + 1}</td>
                        <td>
                          <Select
                            options={bottleOptions}
                            value={
                              item.bottleId
                                ? (bottleOptions.find(opt => opt.value === item.bottleId) || 
                                   { value: item.bottleId, label: bottlePerBoxes?.find(b => b._id === item.bottleId)?.bottleName || item.bottleId })
                                : null
                            }
                            onChange={(selected) => handleItemChange(index, 'bottleId', selected?.value || '')}
                            placeholder="Select Bottle"
                            isClearable
                            menuPortalTarget={document.body}
                            styles={{
                              menuPortal: base => ({ ...base, zIndex: 9999 }),
                              control: (base) => ({ ...base, borderRadius: '8px', backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' })
                            }}
                          />
                        </td>
                        <td>
                          <Select
                            options={getVariantOptions(item.bottleId)}
                            value={
                              item.variantId 
                                ? { value: item.variantId, label: variants?.find(v => v._id === item.variantId)?.variantName || item.variantId }
                                : null
                            }
                            onChange={(selected) => handleItemChange(index, 'variantId', selected?.value || '')}
                            placeholder="Select Variant"
                            isClearable
                            isDisabled={!item.bottleId}
                            menuPortalTarget={document.body}
                            styles={{
                              menuPortal: base => ({ ...base, zIndex: 9999 }),
                              control: (base) => ({ ...base, borderRadius: '8px', backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' })
                            }}
                          />
                        </td>
                        <td>
                          <Select
                            options={getCoatingShadeOptions(item.bottleId)}
                            value={item.coatingShade ? { value: item.coatingShade, label: item.coatingShade } : null}
                            onChange={(selected) => handleItemChange(index, 'coatingShade', selected?.value || '')}
                            placeholder="Select Shade"
                            isClearable
                            isDisabled={!item.bottleId}
                            menuPortalTarget={document.body}
                            styles={{
                              menuPortal: base => ({ ...base, zIndex: 9999 }),
                              control: (base) => ({ ...base, borderRadius: '8px', backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' })
                            }}
                          />
                        </td>
                        <td>
                          <div className="form-control bg-light" style={{ borderRadius: '8px', height: '38px', display: 'flex', alignItems: 'center', border: '1px solid var(--bs-border-color-translucent)', cursor: 'default' }}>
                            <span className="text-muted small">{item.detectedTextColor || 'Not Detected'}</span>
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control form-control-sm shadow-none text-center"
                            placeholder="1"
                            value={item.box}
                            onChange={(e) => handleItemChange(index, 'box', e.target.value)}
                            min="1"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control form-control-sm shadow-none text-center"
                            placeholder="1"
                            value={item.qty}
                            onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                            min="1"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control text-end shadow-none"
                            value={item.totalQty === 0 ? '' : item.totalQty}
                            onChange={(e) => handleItemChange(index, 'totalQty', e.target.value)}
                            style={{ borderRadius: 8 }}
                          />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-light text-danger rounded-circle shadow-sm"
                            onClick={() => removeItemRow(index)}
                            disabled={items.length === 1}
                            style={{ width: 32, height: 32 }}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-start mb-4">
                <button type="button" className="btn btn-sm btn-outline-primary fw-600 rounded-pill px-3 mb-0" onClick={addItemRow}>
                  <i className="bi bi-plus-lg me-1"></i> Add Row
                </button>
              </div>

              <div className="card bg-light border-0 mb-4">
                <div className="card-body px-4 py-3">
                  <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-1 pt-1">
                    <span className="fw-bold fs-5 mb-1 mb-sm-0">Total Dispatch Quantity:</span>
                    <span className="fw-bold fs-4 text-primary">{grandTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
                <button type="submit" className="btn-accent px-5 py-3 flex-grow-1">
                  <i className="bi bi-check2-circle me-2" /> Save Dispatch
                </button>
                <button type="button" onClick={() => navigate(`/dispatch/company/${formData.companyId}`)} className="btn-ghost px-5 py-3 text-decoration-none text-center">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
