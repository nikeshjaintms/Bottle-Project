import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { fetchPrintingPlanById, updatePrintingPlan, clearCurrentPlan, createPrintingPlan, deletePrintingPlan } from '../../redux/slices/printingPlanSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import API from '../../services/api';
import Swal from 'sweetalert2';
import { usePrintingPlanLanguage } from '../../hooks/usePrintingPlanLanguage';

export default function EditPrintingPlan() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);
  const { brands } = useSelector((state) => state.brands);
  const { variants } = useSelector((state) => state.variants);
  const { items: bottlePerBoxes } = useSelector((state) => state.bottlePerBox);
  const { companies } = useSelector((state) => state.companies);
  const { currentPlan, loading, error } = useSelector((state) => state.printingPlans);
  const { labels, language, toggleLanguage } = usePrintingPlanLanguage();

  const [planDate, setPlanDate] = useState('');
  const [existingGroupPlans, setExistingGroupPlans] = useState([]);

  const [block, setBlock] = useState({
    companyId: '',
    bottleName: '',
    items: []
  });

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ limit: 1000, status: true }));
    dispatch(fetchBottleSpecs({ limit: 1000, status: true }));
    dispatch(fetchBrands({ limit: 1000, status: true }));
    dispatch(fetchVariants({ limit: 1000, status: true }));
    dispatch(fetchCompanies({ limit: 1000, status: true }));
  }, [dispatch]);

  useEffect(() => {
    const initializeData = async () => {
      let groupPlans = [];
      if (location.state?.editGroup) {
        groupPlans = location.state.editGroup;
      } else {
        // Fallback if accessed without state (e.g., direct URL)
        const idArray = id.split(',');
        try {
          const promises = idArray.map(singleId => API.get(`/printing-plan/${singleId}`));
          const results = await Promise.all(promises);
          groupPlans = results.map(r => r.data?.data).filter(Boolean);
        } catch (err) {
          console.error("Failed to fetch group plans", err);
        }
      }

      if (groupPlans.length > 0) {
        setExistingGroupPlans(groupPlans);
        setPlanDate(groupPlans[0].planDate ? new Date(groupPlans[0].planDate).toISOString().split('T')[0] : '');
        
        const companyId = groupPlans[0].companyId?._id || groupPlans[0].companyId || '';
        const bottleName = groupPlans[0].bottleName || '';

        const items = groupPlans.map(plan => ({
          _id: plan._id,
          coatingShade: plan.coatingShade || '',
          brandId: plan.brandId?._id || plan.brandId || '',
          printingToBeDone: plan.printingToBeDone || '',
          textColor: plan.textColor || '',
          plainBottleStock: plan.plainBottleStock || 0,
          boxQty: plan.boxQty || '',
          orderQty: plan.orderQty || '',
          producedQty: plan.producedQty || 0,
          balanceToMake: plan.balanceToMake || 0,
          dispatchBalance: plan.dispatchBalance || 0,
          soldQty: plan.soldQty || 0,
          noOfBoxes: plan.noOfBoxes || '',
          readyBoxes: plan.readyBoxes || '',
          remarks: plan.remarks || ''
        }));

        setBlock({
          companyId,
          bottleName,
          items
        });
      }
    };
    
    initializeData();
  }, [id, location.state]);

  const handleBlockChange = async (field, value) => {
    const newBlock = { ...block, [field]: value };
    
    if (field === 'bottleName') {
      const selectedBottle = (bottlePerBoxes || []).find(b => b.bottleName === value);
      const newBoxQty = selectedBottle && selectedBottle.bottlePerBox ? selectedBottle.bottlePerBox : '';
      newBlock.items = [{
        coatingShade: '', brandId: '', printingToBeDone: '', textColor: '',
        plainBottleStock: 0, boxQty: newBoxQty,
        orderQty: '', producedQty: 0, balanceToMake: 0, dispatchBalance: 0, soldQty: 0, noOfBoxes: '', readyBoxes: '', remarks: ''
      }];
    }
    setBlock(newBlock);
  };

  const addItemRow = () => {
    const newBlock = { ...block };
    const items = newBlock.items;
    const inheritedBoxQty = items.length > 0 ? items[0].boxQty : '';
    newBlock.items.push({
      coatingShade: '', brandId: '', printingToBeDone: '', textColor: '',
      plainBottleStock: 0, boxQty: inheritedBoxQty,
      orderQty: '', producedQty: 0, balanceToMake: 0, dispatchBalance: 0, soldQty: 0, noOfBoxes: '', readyBoxes: '', remarks: ''
    });
    setBlock(newBlock);
  };

  const removeItemRow = (itemIndex) => {
    const newBlock = { ...block };
    if (newBlock.items.length > 1) {
      newBlock.items = newBlock.items.filter((_, i) => i !== itemIndex);
      setBlock(newBlock);
    }
  };

  const handleItemChange = async (itemIndex, field, value) => {
    const newBlock = { ...block };
    const currentRow = newBlock.items[itemIndex];
    currentRow[field] = value;

    if (field === 'printingToBeDone' && value) {
      const selectedVariant = (variants || []).find(v => 
        `${v.variantName}-${v.detectedTextColor}` === value && 
        v.bottleSpecId?.bottleName === newBlock.bottleName
      );
      if (selectedVariant) {
        if (selectedVariant.coatingShade) {
          currentRow.coatingShade = selectedVariant.coatingShade;
        }
        if (selectedVariant.bottleSpecId?.brandId) {
          currentRow.brandId = selectedVariant.bottleSpecId?.brandId?._id || selectedVariant.bottleSpecId?.brandId;
        }
      }
    }

    if (field === 'orderQty' || field === 'boxQty') {
      const orderQty = parseFloat(currentRow.orderQty);
      const boxQty = parseFloat(currentRow.boxQty);
      if (!isNaN(orderQty) && !isNaN(boxQty) && boxQty > 0) {
        currentRow.noOfBoxes = Math.ceil(orderQty / boxQty);
      }
    }

    if (field === 'orderQty' || field === 'coatedStockAvailable' || field === 'plainBottleStock') {
      const orderQty = parseFloat(currentRow.orderQty);
      const stock = parseFloat(currentRow.coatedStockAvailable || currentRow.plainBottleStock);
      currentRow.balanceToMake = (orderQty || 0) - (stock || 0);
    }

    setBlock(newBlock);

    // Fetch computed stats
    if ((field === 'coatingShade' || field === 'brandId' || field === 'printingToBeDone') && newBlock.bottleName) {
      if (currentRow.brandId) {
        try {
          const res = await API.get('/printing-plan/stats/computed', {
            params: {
              bottleName: newBlock.bottleName,
              brandId: currentRow.brandId,
              coatingShade: currentRow.coatingShade || ""
            }
          });
          if (res.data?.success) {
            const updatedBlock = { ...newBlock };
            updatedBlock.items[itemIndex].coatedStockAvailable = res.data.data.coatedStockAvailable;
            updatedBlock.items[itemIndex].plainBottleStock = res.data.data.coatedStockAvailable;
            updatedBlock.items[itemIndex].producedQty = res.data.data.producedQty;
            const currentOrderQty = parseFloat(updatedBlock.items[itemIndex].orderQty) || 0;
            updatedBlock.items[itemIndex].balanceToMake = currentOrderQty - (res.data.data.coatedStockAvailable || 0);
            setBlock(updatedBlock);
          }
        } catch (err) {
          console.error("Failed to fetch computed stats", err);
        }
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    let hasError = false;

    if (!block.companyId || !block.bottleName) {
      return Swal.fire('Error', 'Please select a Company and Bottle Name.', 'error');
    }

    const payloadUpdates = [];
    const payloadCreates = [];

    block.items.forEach(item => {
      if (item.brandId || item.orderQty) {
        if (!item.brandId || !item.orderQty) {
          hasError = true;
        } else {
          const planData = {
            planDate: planDate,
            companyId: block.companyId,
            bottleName: block.bottleName,
            status: true,
            boxQty: item.boxQty || null,
            coatingShade: item.coatingShade || '',
            brandId: item.brandId,
            printingToBeDone: item.printingToBeDone || '',
            textColor: item.textColor || '',
            plainBottleStock: item.plainBottleStock || 0,
            orderQty: item.orderQty,
            producedQty: item.producedQty || 0,
            balanceToMake: item.balanceToMake || 0,
            dispatchBalance: item.dispatchBalance || 0,
            soldQty: item.soldQty || 0,
            noOfBoxes: item.noOfBoxes || null,
            remarks: item.remarks || ''
          };
          
          if (item._id) {
             payloadUpdates.push({ id: item._id, data: planData });
          } else {
             payloadCreates.push(planData);
          }
        }
      }
    });

    if (hasError) {
      return Swal.fire('Error', 'Please fill in all required fields (Brand, Order Qty) for each entered row.', 'error');
    }

    if (payloadUpdates.length === 0 && payloadCreates.length === 0) {
      return Swal.fire('Error', 'Please ensure there is at least one valid entry.', 'error');
    }

    try {
       // Delete records that were removed from the UI
       const originalIds = existingGroupPlans.map(p => p._id);
       const currentIds = payloadUpdates.map(p => p.id);
       const toDelete = originalIds.filter(id => !currentIds.includes(id));
       
       for (const delId of toDelete) {
         await dispatch(deletePrintingPlan(delId)).unwrap();
       }

       // Create new records
       if (payloadCreates.length > 0) {
         await dispatch(createPrintingPlan(payloadCreates)).unwrap();
       }

       // Update existing records
       for (const update of payloadUpdates) {
         await dispatch(updatePrintingPlan({ id: update.id, data: update.data })).unwrap();
       }

       Swal.fire('Success', 'Printing Plan group updated successfully', 'success');
       navigate('/printing-plan');

    } catch (err) {
       Swal.fire('Error', err.message || 'Failed to update plan group', 'error');
    }
  };

  const uniqueBottleNames = Array.from(new Set(
    (bottleSpecs || []).map(b => b.bottleName).filter(name => name && name.trim() !== '')
  )).sort().map(name => ({ value: name, label: name }));

  const uniqueCoatingShades = Array.from(new Set(
    (bottleSpecs || []).map(s => s.coatingShade).filter(shade => shade && shade.trim() !== '')
  )).sort().map(shade => ({ value: shade, label: shade }));

  const companyOptions = (companies || [])
    .filter(c => c && c.status !== false && !c.isDeleted)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
    .map(c => ({ value: c._id, label: c.name }));

  const bCompanyId = block.companyId;
  const companyBrandIds = new Set(
    (brands || [])
      .filter(b => (b.companyId?._id || b.companyId)?.toString() === bCompanyId?.toString())
      .map(b => b._id.toString())
  );

  const companySpecs = (bottleSpecs || []).filter(s => {
    const bId = s.brandId?._id || s.brandId;
    return bId && companyBrandIds.has(bId.toString());
  });

  const companyBottleNames = new Set(companySpecs.map(s => s.bottleName?.trim()).filter(Boolean));

  let blockFilteredBottleOptions = [];
  if (bCompanyId) {
    const bpbBottles = (bottlePerBoxes || [])
      .filter(b => b.bottleName && companyBottleNames.has(b.bottleName.trim()))
      .map(b => b.bottleName.trim());

    const allBottles = Array.from(new Set([...bpbBottles, ...companyBottleNames]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    blockFilteredBottleOptions = allBottles.map(name => ({ value: name, label: name }));
  }

  let availableBrandIds = new Set();
  if (block.bottleName) {
    const specs = bottleSpecs.filter(bs => bs.bottleName === block.bottleName);
    specs.forEach(spec => availableBrandIds.add(spec.brandId?._id || spec.brandId));
  }
  const brandOptions = brands
    .filter(b => availableBrandIds.size === 0 || availableBrandIds.has(b._id))
    .filter(b => !bCompanyId || (b.companyId?._id || b.companyId)?.toString() === bCompanyId?.toString())
    .map(b => ({ value: b._id, label: b.name }));

  if (loading && existingGroupPlans.length === 0) {
    return <div className="text-center py-5">Loading...</div>;
  }

  return (
    <div className="page-content">
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">{labels.edit} Group</h1>
            <p className="page-subtitle mb-0">Update multiple printing plan entries at once</p>
          </div>
        </div>
        <div>
          <button onClick={toggleLanguage} className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold">
            {language === 'en' ? 'ગુજરાતી' : 'English'}
          </button>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="dash-card border-0 shadow-sm p-4">
            {error && <div className="alert alert-danger">{error}</div>}
            
            <form onSubmit={handleSubmit}>
            <div className="mb-4 pb-4 border-bottom">
              <label className="form-label fw-bold small">Common Plan Date <span className="text-danger">*</span></label>
              <input type="date" className="form-control shadow-none w-auto" 
                     value={planDate} onChange={(e) => setPlanDate(e.target.value)} required />
            </div>

            <div className="bg-white border border-light-subtle rounded-3 p-4 mb-4 shadow-sm position-relative">
              
              <div className="row g-4 mb-4 bg-light p-3 rounded mx-0">
                <div className="col-md-5">
                  <label className="form-label fw-bold small text-primary">{labels.bottleName} <span className="text-danger">*</span></label>
                  <Select
                    options={blockFilteredBottleOptions}
                    value={blockFilteredBottleOptions.find(o => o.value === block.bottleName) || null}
                    onChange={(selected) => handleBlockChange('bottleName', selected ? selected.value : '')}
                    placeholder={block.companyId ? "Select bottle..." : "Select company first..."}
                    isDisabled={true}
                    isClearable={false}
                    required
                  />
                  <small className="text-muted d-block mt-1">To change company or bottle name, please create a new plan.</small>
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between mb-3 mt-2">
                <h6 className="fw-bold text-muted mb-0">PLAN ENTRIES FOR <span className="text-primary">{block.bottleName || 'UNSELECTED BOTTLE'}</span></h6>
              </div>

              <div className="table-responsive mb-3">
                <table className="table table-bordered align-middle table-sm" style={{ minWidth: '2400px' }}>
                  <thead className="table-light">
                    <tr>
                      <th className="small text-muted text-center align-middle" style={{width: '3%'}}>{labels.sr}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.printingToBeDone}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.coatingShade} <span className="text-danger">*</span></th>
                      <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.brand} <span className="text-danger">*</span></th>
                      <th className="small text-muted text-center align-middle" style={{width: '8%', minWidth: '150px'}}>{labels.plainColouredBottleStock}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '7%'}}>{labels.orderQty} <span className="text-danger">*</span></th>
                      <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.balanceToMake}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.bottlePerBox}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.noOfOrderBoxes}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.readyPrintedQty}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.balanceToBeDispatched}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '5%'}}>{labels.soldQty}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.readyBoxes}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '15%', minWidth: '250px'}}>{labels.remarks}</th>
                      <th className="small text-muted text-center align-middle" style={{width: '3%'}}></th>
                    </tr>
                  </thead>
                  <tbody className="border-top-0">
                    {block.items.map((item, itemIndex) => (
                      <tr key={itemIndex}>
                        <td className="text-center text-muted">{itemIndex + 1}</td>
                        <td>
                          <CreatableSelect
                            options={Array.from(new Set(
                              (variants || [])
                                .filter(v => v.bottleSpecId?.bottleName === block.bottleName)
                                .filter(v => v.variantName)
                                .map(v => `${v.variantName}-${v.detectedTextColor}`)
                            )).sort().map(val => ({ value: val, label: val }))}
                            value={item.printingToBeDone ? { value: item.printingToBeDone, label: item.printingToBeDone } : null}
                            onChange={(selected) => handleItemChange(itemIndex, 'printingToBeDone', selected?.value || '')}
                            placeholder="Printing..."
                            isClearable
                            menuPortalTarget={document.body}
                            styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                          />
                        </td>
                        <td>
                          <CreatableSelect
                            options={uniqueCoatingShades}
                            value={item.coatingShade ? { value: item.coatingShade, label: item.coatingShade } : null}
                            onChange={(selected) => handleItemChange(itemIndex, 'coatingShade', selected?.value || '')}
                            placeholder="Shade..."
                            isClearable
                            required
                            menuPortalTarget={document.body}
                            styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                            isValidNewOption={(inputValue, selectValue, selectOptions) => {
                              if (!inputValue) return false;
                              const lowerInput = inputValue.trim().toLowerCase();
                              return !selectOptions.some(opt => opt.label.toLowerCase().includes(lowerInput));
                            }}
                            formatCreateLabel={(inputValue) => `Create "${inputValue.toUpperCase()}"`}
                          />
                        </td>
                        <td>
                          <Select
                            options={brandOptions}
                            value={brandOptions.find(o => o.value === item.brandId) || null}
                            onChange={(selected) => handleItemChange(itemIndex, 'brandId', selected?.value || '')}
                            placeholder="Brand..."
                            isClearable
                            required
                            menuPortalTarget={document.body}
                            styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                          />
                        </td>
                        <td>
                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.plainBottleStock} onChange={(e) => handleItemChange(itemIndex, 'plainBottleStock', e.target.value)} min="0" />
                        </td>
                        <td>
                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.orderQty} onChange={(e) => handleItemChange(itemIndex, 'orderQty', e.target.value)} min="1" required />
                        </td>
                        <td>
                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.balanceToMake} onChange={(e) => handleItemChange(itemIndex, 'balanceToMake', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.boxQty} onChange={(e) => handleItemChange(itemIndex, 'boxQty', e.target.value)} min="1" />
                        </td>
                        <td>
                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.noOfBoxes} onChange={(e) => handleItemChange(itemIndex, 'noOfBoxes', e.target.value)} min="0" />
                        </td>
                        <td>
                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.producedQty} onChange={(e) => handleItemChange(itemIndex, 'producedQty', e.target.value)} min="0" />
                        </td>
                        <td>
                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.dispatchBalance} onChange={(e) => handleItemChange(itemIndex, 'dispatchBalance', e.target.value)} min="0" />
                        </td>
                        <td>
                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.soldQty} onChange={(e) => handleItemChange(itemIndex, 'soldQty', e.target.value)} min="0" />
                        </td>
                        <td>
                          <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.readyBoxes} onChange={(e) => handleItemChange(itemIndex, 'readyBoxes', e.target.value)} min="0" />
                        </td>
                        <td>
                          <input type="text" className="form-control form-control-sm shadow-none" value={item.remarks} onChange={(e) => handleItemChange(itemIndex, 'remarks', e.target.value)} />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-light text-danger rounded-circle shadow-sm"
                            onClick={() => removeItemRow(itemIndex)}
                            disabled={block.items.length === 1}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-between">
                <button type="button" className="btn btn-sm btn-outline-primary shadow-sm" onClick={addItemRow}>
                  <i className="bi bi-plus-lg me-1"></i> Add Entry Row
                </button>
              </div>
            </div>

            <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
              <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                <i className="bi bi-check2-circle me-2" /> {loading ? 'Saving...' : 'Save All Plans'}
              </button>
              <button type="button" onClick={() => navigate('/printing-plan')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
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
