import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDispatchById, fetchDispatchPlainBottleOptions, fetchDispatchVariantOptions, updateDispatch, clearCurrentDispatch } from '../../redux/slices/dispatchSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import { fetchPrintingTypes } from '../../redux/slices/printingTypeSlice';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import Swal from 'sweetalert2';

// Simple debounce utility
const debounce = (fn, wait) => {
  let timeout;
  const debounced = (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
};

const normalizeBottleName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export default function EditDispatch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { currentDispatch, loading } = useSelector(state => state.dispatch);
  const { plainBottleOptionsByCompany, variantOptionsByCompanyBottle } = useSelector(state => state.dispatch);
  const { items: bottlePerBoxes } = useSelector(state => state.bottlePerBox);
  const { companies } = useSelector(state => state.companies);
  const { bottleSpecs } = useSelector(state => state.bottleSpecs);
  const { variants } = useSelector(state => state.variants);
  const { items: printingTypes } = useSelector(state => state.printingType || { items: [] });

  const [formData, setFormData] = useState({
    dispatchDate: '',
    gatePassNo: '',
    companyId: '',
    remarks: ''
  });

  const [items, setItems] = useState([]);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [otherBottles, setOtherBottles] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [createErrors, setCreateErrors] = useState({});
  const [newBottlesToCreate, setNewBottlesToCreate] = useState({});

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ pagination: "false" }));
    dispatch(fetchCompanies({ pagination: "false" }));
    dispatch(fetchBottleSpecs({ pagination: "false", type: "all" }));
    dispatch(fetchVariants({ pagination: "false" }));
    dispatch(fetchPrintingTypes({ limit: 1000, status: true }));
    if (id) {
      dispatch(fetchDispatchById(id));
    }
    return () => dispatch(clearCurrentDispatch());
  }, [dispatch, id]);

  const companyOptions = useMemo(() => {
    if (!companies || companies.length === 0) return [];
    return companies
      .filter(c => c?._id && c?.name && !c.isStockSupplier)
      .slice()
      .sort((a, b) => a.name.trim().localeCompare(b.name.trim(), undefined, { numeric: true, sensitivity: 'base' }))
      .map(c => ({ value: c._id, label: c.name }));
  }, [companies]);

  const companyBottleOptions = plainBottleOptionsByCompany[formData.companyId] || {};
  const bottleOptions = companyBottleOptions.options || [];
  const selectedBottleIds = useMemo(
    () => [...new Set(items.map((item) => item.bottleId).filter(Boolean))],
    [items]
  );

  useEffect(() => {
    if (formData.companyId) {
      dispatch(fetchDispatchPlainBottleOptions(formData.companyId));
    }
  }, [dispatch, formData.companyId]);

  // Cleanup state on company change
  useEffect(() => {
    setOtherBottles([]);
    setSearchLoading(false);
    setCreateErrors({});
    setNewBottlesToCreate({});
  }, [formData.companyId]);

  useEffect(() => {
    selectedBottleIds.forEach((plainBottleId) => {
      dispatch(fetchDispatchVariantOptions({ companyId: formData.companyId, plainBottleId }));
    });
  }, [dispatch, formData.companyId, selectedBottleIds]);

  // Debounced global bottle search
  const debouncedSearch = useMemo(() => {
    const fn = async (inputValue) => {
      if (!inputValue || inputValue.trim().length < 2) {
        setOtherBottles([]);
        return;
      }
      setSearchLoading(true);
      try {
        const url = `/api/bottle-per-box/search?q=${encodeURIComponent(inputValue)}&limit=10`;
        const res = await fetch(url);
        
        if (!res.ok) {
          setOtherBottles([]);
          return;
        }
        
        const data = await res.json();
        const items = data.data || data.items || (Array.isArray(data) ? data : []);
        if (!Array.isArray(items)) {
          setOtherBottles([]);
          return;
        }
        
        const companyBottleValues = new Set(bottleOptions.map(b => (b.plainBottleName || b.value || '').toLowerCase()));
        const otherBottlesList = (items || []).filter(item => {
          const itemName = (item.plainBottleName || item.bottleName || item.name || '').toLowerCase();
          return !companyBottleValues.has(itemName);
        }).map(item => ({
          value: item.plainBottleName || item.bottleName || item.name,
          label: item.plainBottleName || item.bottleName || item.name,
          plainBottleName: item.plainBottleName || item.bottleName || item.name,
          bottlePerBox: item.bottlePerBox || 0,
          isOtherBottle: true,
          bottlePerBoxData: item
        }));
        
        setOtherBottles(otherBottlesList);
      } catch (err) {
        setOtherBottles([]);
      } finally {
        setSearchLoading(false);
      }
    };
    const debounced = debounce(fn, 300);
    return debounced;
  }, [bottleOptions]);

  const handleInputChangeBottle = (inputValue) => {
    if (!inputValue || inputValue.trim().length < 2) {
      setOtherBottles([]);
      if (debouncedSearch.cancel) {
        debouncedSearch.cancel();
      }
    } else {
      const companyMatches = bottleOptions.filter(opt => 
        (opt.label || '').toLowerCase().includes(inputValue.toLowerCase())
      );
      
      if (companyMatches.length > 0) {
        setOtherBottles([]);
        if (debouncedSearch.cancel) {
          debouncedSearch.cancel();
        }
      } else {
        debouncedSearch(inputValue);
      }
    }
  };

  // Memoize combined + deduplicated bottle options
  const optionsList = useMemo(() => {
    const combined = [...bottleOptions, ...otherBottles];
    const seen = new Set();
    return combined
      .filter(opt => {
        if (seen.has(opt.value)) return false;
        seen.add(opt.value);
        return true;
      })
      .sort((a, b) => {
        if (a.isOtherBottle !== b.isOtherBottle) {
          return a.isOtherBottle ? 1 : -1;
        }
        return (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [bottleOptions, otherBottles]);

  const getVariantOptions = (selectedBottleId) => {
    if (!formData.companyId || !selectedBottleId) return [];
    return variantOptionsByCompanyBottle[`${formData.companyId}:${selectedBottleId}`]?.options || [];
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
                const label = printingTypeDoc?.name || printingTypeDoc?.printingType || printingTypeId;
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
                const label = printingTypeDoc?.name || printingTypeDoc?.printingType || printingTypeId;
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
      label: pt.name || pt.printingType 
    }));
  };

  useEffect(() => {
    if (currentDispatch?.dispatch) {
      setFormData({
        dispatchDate: currentDispatch.dispatch.dispatchDate ? currentDispatch.dispatch.dispatchDate.split('T')[0] : '',
        gatePassNo: currentDispatch.dispatch.gatePassNo || '',
        companyId: currentDispatch.dispatch.companyId?._id || currentDispatch.dispatch.companyId || '',
        remarks: currentDispatch.dispatch.remarks || ''
      });
    }
    
    if (currentDispatch?.items) {
      setItems(currentDispatch.items.map(item => ({
        bottleId: item.bottleId?._id || item.bottleId || '',
        plainBottleName: item.plainBottleName || item.bottleId?.plainBottleName || item.bottleId?.bottleName || '',
        coatingShade: item.coatingShade || '',
        printingTypeId: item.printingTypeId?._id || item.printingTypeId || '',
        variantId: item.variantId?._id || item.variantId || '',
        detectedTextColor: item.detectedTextColor || 'Not Detected',
        box: item.box || 0,
        qty: item.qty || 0,
        totalQty: item.totalQty || 0
      })));
    }
  }, [currentDispatch]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle CreatableSelect "Create" option - store bottle name, don't create yet
  const handleCreateBottle = (inputValue, index) => {
    const bottleName = inputValue.trim();
    if (!bottleName || bottleName.length < 2) {
      setCreateErrors(prev => ({
        ...prev,
        [index]: 'Bottle name must be at least 2 characters'
      }));
      return;
    }

    // Show toast notification for bottle creation
    Swal.fire({
      position: 'top-right',
      icon: 'info',
      title: 'Plain Bottle Created',
      text: `"${bottleName}" created successfully`,
      timer: 2000,
      timerProgressBar: true,
      showConfirmButton: false,
      toast: true
    });

    // Store the bottle name to create later on submit
    setNewBottlesToCreate(prev => ({
      ...prev,
      [index]: bottleName
    }));

    // Set bottleId to the bottle name
    handleItemChange(index, 'bottleId', bottleName);
    
    // Clear any previous error for this item
    setCreateErrors(prev => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  };

  const handleCompanyChange = (selected) => {
    const companyId = selected?.value || '';
    if (companyId === formData.companyId) return;
    setFormData(prev => ({ ...prev, companyId }));
    setItems(currentItems => currentItems.map(item => ({
      ...item,
      bottleId: '',
      plainBottleName: '',
      coatingShade: '',
      printingTypeId: '',
      variantId: '',
      detectedTextColor: 'Not Detected',
    })));
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
    if (field === 'bottleId') {
      // Clear variant, coating shade, and printing type when bottle changes
      newItems[index].variantId = '';
      newItems[index].coatingShade = '';
      newItems[index].printingTypeId = '';
      newItems[index].detectedTextColor = 'Not Detected';
      
      // Auto-populate qty when bottleId changes
      const foundBox = value && bottlePerBoxes?.find(b => b._id === value);
      if (foundBox && foundBox.bottlePerBox != null && foundBox.bottlePerBox > 0) {
        newItems[index].qty = foundBox.bottlePerBox;
      } else {
        newItems[index].qty = '';
      }
    }

    // Auto-populate coating shade and printing type when variant is selected
    if (field === 'variantId' && value) {
      const variantOption = getVariantOptions(newItems[index].bottleId)
        .find((option) => option.value === String(value));
      if (variantOption) {
        newItems[index].detectedTextColor = variantOption.textColor || 'Not Detected';
        if (variantOption.coatingShade) newItems[index].coatingShade = variantOption.coatingShade;
      }

      // Find the BottleSpec that has this variantId and get its coating shade and printing type
      const bottlePerBox = bottlePerBoxes?.find(b => b._id === newItems[index].bottleId);
      if (bottlePerBox) {
        // Get the text color directly from the selected variant
        const selectedVariant = variants?.find(v => v._id === value);
        if (!variantOption?.textColor && selectedVariant?.detectedTextColor) {
          newItems[index].detectedTextColor = selectedVariant.detectedTextColor;
        }
        
        let matchingSpec = variantOption?.bottleSpecId
          ? bottleSpecs?.find(spec => String(spec._id) === variantOption.bottleSpecId)
          : null;
        
        if (!matchingSpec) {
          const plainBottleName = bottlePerBox.plainBottleName || bottlePerBox.bottleName;
          matchingSpec = bottleSpecs?.find(spec =>
            spec.bottleName === plainBottleName &&
            (spec.variantId === value || spec.variantId?._id === value)
          );
        }
        
        if (matchingSpec && !variantOption?.coatingShade) {
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
    
    // Allow at least one item with bottleId, OR allow items with null bottleId if productName is set
    const validItems = items.filter(i => (i.bottleId || i.productName) && i.qty > 0);
    if (validItems.length === 0) {
      return Swal.fire('Error', 'Please add at least one valid item with quantity > 0 and either a bottle name or product name', 'error');
    }

    const bottleNames = validItems.filter(i => i.bottleId).map(i => i.bottleId).filter(Boolean);
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
        bottleId: item.bottleId || null,
        coatingShade: item.coatingShade || null,
        variantId: item.variantId || null,
        detectedTextColor: item.detectedTextColor || 'Not Detected',
        printingTypeId: item.printingTypeId || null,
        box: Number(item.box) || 0,
        qty: Number(item.qty),
        totalQty: parseFloat((Number(item.box) * Number(item.qty)).toFixed(2)),
        // Keep old fields for backward compatibility (unmapped entries)
        productName: item.productName,
        printing: item.printing,
        foil: item.foil,
        organic: item.organic,
        additionalBox: Number(item.additionalBox) || 0,
        remarks: item.remarks
      }))
    };

    dispatch(updateDispatch({ id, data: payload })).then(res => {
      if (!res.error) {
        // Show success SweetAlert modal (centered, not toast)
        Swal.fire({
          position: 'center',
          icon: 'success',
          title: 'Success!',
          text: 'Dispatch updated and stock updated successfully',
          confirmButtonText: 'OK'
        }).then(() => {
          navigate(`/dispatch/company/${formData.companyId}`);
        });
      } else {
        Swal.fire('Error', res.payload || 'Failed to update', 'error');
      }
    });
  };

  const grandTotal = items.reduce((acc, curr) => acc + (Number(curr.totalQty) || 0), 0);

  if (loading) {
    return (
      <div className="p-5 text-center text-muted">
        <div className="spinner-border text-primary mb-3" />
        <div>Loading Dispatch...</div>
      </div>
    );
  }

  return (
    <div className="page-content dispatch-module-page dispatch-module-form">
      <div className="page-header d-flex align-items-center justify-content-between user-form-page-header">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
            <i className="bi bi-arrow-left fs-5 text-secondary" />
          </button>
          <div>
            <h1 className="page-title">Edit Dispatch Entry</h1>
            <p className="page-subtitle">Update dispatch/gate-pass transaction</p>
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
                      <th className="small text-muted" style={{ width: '20%' }}>Plain Bottle <span className="text-danger">*</span></th>
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
                          <div className="position-relative">
                            <CreatableSelect
                              options={optionsList}
                              value={
                                item.bottleId
                                  ? (optionsList.find(opt => opt.value === item.bottleId) || 
                                     { value: item.bottleId, label: item.plainBottleName || bottlePerBoxes?.find(b => b._id === item.bottleId)?.plainBottleName || bottlePerBoxes?.find(b => b._id === item.bottleId)?.bottleName || item.bottleId })
                                  : null
                              }
                              onChange={(selected) => handleItemChange(index, 'bottleId', selected?.value || '')}
                              onCreateOption={(inputValue) => handleCreateBottle(inputValue, index)}
                              placeholder={!formData.companyId ? 'Select company first' : 'Select or Create Plain Bottle'}
                              isClearable
                              isDisabled={!formData.companyId}
                              menuPortalTarget={document.body}
                              formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
                              styles={{
                                menuPortal: base => ({ ...base, zIndex: 9999 }),
                                control: (base) => ({ ...base, borderRadius: '8px', backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' })
                              }}
                            />
                            {createErrors[index] && (
                              <small className="text-danger d-block mt-1">{createErrors[index]}</small>
                            )}
                            {!item.bottleId && item.productName && (
                              <small className="text-muted d-block mt-1">
                                Stored: {item.productName}
                              </small>
                            )}
                          </div>
                        </td>
                        <td>
                          <Select
                            options={getVariantOptions(item.bottleId)}
                            value={getVariantOptions(item.bottleId).find(option => option.value === String(item.variantId)) ||
                              (item.variantId
                                ? { value: item.variantId, label: variants?.find(v => v._id === item.variantId)?.variantName || item.variantId }
                                : null)}
                            onChange={(selected) => handleItemChange(index, 'variantId', selected?.value || '')}
                            placeholder={
                              !item.bottleId
                                ? 'Select Plain Bottle first'
                                : variantOptionsByCompanyBottle[`${formData.companyId}:${item.bottleId}`]?.loading
                                  ? 'Loading variants...'
                                  : variantOptionsByCompanyBottle[`${formData.companyId}:${item.bottleId}`]?.error || 'Select Variant'
                            }
                            isClearable
                            isDisabled={!item.bottleId || variantOptionsByCompanyBottle[`${formData.companyId}:${item.bottleId}`]?.loading}
                            menuPortalTarget={document.body}
                            styles={{
                              menuPortal: base => ({ ...base, zIndex: 9999 }),
                              control: (base) => ({ ...base, borderRadius: '8px', backgroundColor: 'var(--bs-light)', borderColor: 'var(--bs-border-color-translucent)' })
                            }}
                          />
                          {variantOptionsByCompanyBottle[`${formData.companyId}:${item.bottleId}`]?.error && (
                            <small className="text-danger d-block mt-1">
                              {variantOptionsByCompanyBottle[`${formData.companyId}:${item.bottleId}`].error}
                            </small>
                          )}
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
                          <input
                            type="text"
                            className="form-control form-control-sm shadow-none"
                            value={item.detectedTextColor || ''}
                            onChange={(e) => handleItemChange(index, 'detectedTextColor', e.target.value)}
                            placeholder="Enter text color"
                            style={{ borderRadius: '8px', height: '38px' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control form-control-sm shadow-none text-center"
                            placeholder="1"
                            value={item.box}
                            onChange={(e) => handleItemChange(index, 'box', e.target.value)}
                            min="0"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-control form-control-sm shadow-none text-center"
                            placeholder="1"
                            value={item.qty}
                            onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                            min="0"
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
                  <i className="bi bi-check2-circle me-2" /> Update Dispatch
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
