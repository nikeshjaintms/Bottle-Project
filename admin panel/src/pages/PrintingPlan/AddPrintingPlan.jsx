import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { createPrintingPlan } from '../../redux/slices/printingPlanSlice';
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

export default function AddPrintingPlan() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);
  const { brands } = useSelector((state) => state.brands);
  const { variants } = useSelector((state) => state.variants);
  const { items: bottlePerBoxes } = useSelector((state) => state.bottlePerBox);
  const { companies } = useSelector((state) => state.companies);
  const { loading, error } = useSelector((state) => state.printingPlans);
  const { labels, language, toggleLanguage } = usePrintingPlanLanguage();

  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);

  const [blocks, setBlocks] = useState([
    {
      companyId: '',
      bottleName: '',
      items: [{
        coatingShade: '',
        brandId: '',
        printingToBeDone: '', textColor: '',
        coatedStockAvailable: 0,
        boxQty: '',
        orderQty: '',
        producedQty: 0,
        balanceToMake: 0,
        dispatchBalance: 0,
        soldQty: 0,
        noOfBoxes: '',
        remarks: ''
      }]
    }
  ]);

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ limit: 1000, status: true }));
    dispatch(fetchBottleSpecs({ limit: 1000, status: true }));
    dispatch(fetchBrands({ limit: 1000, status: true }));
    dispatch(fetchVariants({ limit: 1000, status: true }));
    dispatch(fetchCompanies({ limit: 1000, status: true }));
  }, [dispatch]);

  const handleBlockChange = async (blockIndex, field, value) => {
    const newBlocks = [...blocks];
    newBlocks[blockIndex][field] = value;
    
    if (field === 'bottleName') {
      const selectedBottle = (bottlePerBoxes || []).find(b => b.bottleName === value);
      const newBoxQty = selectedBottle && selectedBottle.bottlePerBox ? selectedBottle.bottlePerBox : '';
      newBlocks[blockIndex].items = [{
        coatingShade: '', brandId: '', printingToBeDone: '', textColor: '',
        plainBottleStock: 0, boxQty: newBoxQty,
        orderQty: '', producedQty: 0, balanceToMake: 0, dispatchBalance: 0, soldQty: 0, noOfBoxes: '', readyBoxes: '', remarks: ''
      }];
    }
    setBlocks(newBlocks);
  };

  const addBlock = () => {
    setBlocks([...blocks, {
      companyId: '',
      bottleName: '',
      items: [{
        coatingShade: '', brandId: '', printingToBeDone: '', textColor: '',
        plainBottleStock: 0, boxQty: '', orderQty: '', producedQty: 0, balanceToMake: 0, dispatchBalance: 0, soldQty: 0, noOfBoxes: '', readyBoxes: '', remarks: ''
      }]
    }]);
  };

  const removeBlock = (blockIndex) => {
    if (blocks.length > 1) {
      setBlocks(blocks.filter((_, i) => i !== blockIndex));
    }
  };

  const addItemRow = (blockIndex) => {
    const newBlocks = [...blocks];
    const items = newBlocks[blockIndex].items;
    const inheritedBoxQty = items.length > 0 ? items[0].boxQty : '';
    newBlocks[blockIndex].items.push({
      coatingShade: '', brandId: '', printingToBeDone: '', textColor: '',
      plainBottleStock: 0, boxQty: inheritedBoxQty,
      orderQty: '', producedQty: 0, balanceToMake: 0, dispatchBalance: 0, soldQty: 0, noOfBoxes: '', readyBoxes: '', remarks: ''
    });
    setBlocks(newBlocks);
  };

  const removeItemRow = (blockIndex, itemIndex) => {
    const newBlocks = [...blocks];
    if (newBlocks[blockIndex].items.length > 1) {
      newBlocks[blockIndex].items = newBlocks[blockIndex].items.filter((_, i) => i !== itemIndex);
      setBlocks(newBlocks);
    }
  };

  const handleItemChange = async (blockIndex, itemIndex, field, value) => {
    const newBlocks = [...blocks];
    const currentRow = newBlocks[blockIndex].items[itemIndex];
    currentRow[field] = value;

    if (field === 'printingToBeDone' && value) {
      const selectedVariant = (variants || []).find(v => 
        `${v.variantName}-${v.detectedTextColor}` === value && 
        v.bottleSpecId?.bottleName === newBlocks[blockIndex].bottleName
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

    if (field === 'orderQty' || field === 'coatedStockAvailable') {
      const orderQty = parseFloat(currentRow.orderQty);
      const stock = parseFloat(currentRow.coatedStockAvailable);
      currentRow.balanceToMake = (orderQty || 0) - (stock || 0);
    }

    setBlocks(newBlocks);

    // Fetch computed stats
    if ((field === 'coatingShade' || field === 'brandId' || field === 'printingToBeDone') && newBlocks[blockIndex].bottleName) {
      if (currentRow.brandId) {
        try {
          const res = await API.get('/printing-plan/stats/computed', {
            params: {
              bottleName: newBlocks[blockIndex].bottleName,
              brandId: currentRow.brandId,
              coatingShade: currentRow.coatingShade || ""
            }
          });
          if (res.data?.success) {
            const updatedBlocks = [...newBlocks];
            updatedBlocks[blockIndex].items[itemIndex].coatedStockAvailable = res.data.data.coatedStockAvailable;
            updatedBlocks[blockIndex].items[itemIndex].producedQty = res.data.data.producedQty;
            const currentOrderQty = parseFloat(updatedBlocks[blockIndex].items[itemIndex].orderQty) || 0;
            updatedBlocks[blockIndex].items[itemIndex].balanceToMake = currentOrderQty - (res.data.data.coatedStockAvailable || 0);
            setBlocks(updatedBlocks);
          }
        } catch (err) {
          console.error("Failed to fetch computed stats", err);
        }
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const payload = [];
    let hasError = false;
    let missingCompany = false;

    blocks.forEach((block) => {
      if (!block.bottleName) return;
      if (!block.companyId) {
        missingCompany = true;
      }

      block.items.forEach(item => {
        if (item.brandId || item.orderQty) {
          if (!item.brandId || !item.orderQty) {
            hasError = true;
          } else {
            payload.push({
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
            });
          }
        }
      });
    });

    if (missingCompany) {
      return Swal.fire('Error', 'Please select a Company for all entered bottle plans.', 'error');
    }

    if (hasError) {
      return Swal.fire('Error', 'Please fill in all required fields (Brand, Order Qty) for each entered row.', 'error');
    }

    if (payload.length === 0) {
      return Swal.fire('Error', 'Please ensure at least one block has a selected Company, Bottle Name and a valid entry.', 'error');
    }

    dispatch(createPrintingPlan(payload)).then((res) => {
      if (!res.error) {
         Swal.fire('Success', 'Printing Plan(s) added successfully', 'success');
         navigate('/printing-plan');
      } else {
         Swal.fire('Error', res.payload || 'Failed to add plan', 'error');
      }
    });
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

  return (
    <div className="page-content">
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">{labels.addPlan}</h1>
            <p className="page-subtitle mb-0">Record multiple printing plan entries</p>
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

            {blocks.map((block, blockIndex) => {
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

              return (
                <div key={blockIndex} className="bg-white border border-light-subtle rounded-3 p-4 mb-4 shadow-sm position-relative">
                  {blocks.length > 1 && (
                    <button type="button" onClick={() => removeBlock(blockIndex)} className="btn btn-sm btn-danger position-absolute top-0 end-0 m-3 rounded-circle" title="Remove entire bottle section" style={{ width: 32, height: 32 }}>
                      <i className="bi bi-x-lg"></i>
                    </button>
                  )}
                  
                  <div className="row g-4 mb-4 bg-light p-3 rounded mx-0">
                    <div className="col-md-5">
                      <label className="form-label fw-bold small text-primary">{labels.bottleName} <span className="text-danger">*</span></label>
                      <Select
                        options={blockFilteredBottleOptions}
                        value={blockFilteredBottleOptions.find(o => o.value === block.bottleName) || null}
                        onChange={(selected) => handleBlockChange(blockIndex, 'bottleName', selected ? selected.value : '')}
                        placeholder={block.companyId ? "Select bottle..." : "Select company first..."}
                        isDisabled={!block.companyId}
                        isClearable
                        required
                      />
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
                                onChange={(selected) => handleItemChange(blockIndex, itemIndex, 'printingToBeDone', selected?.value || '')}
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
                                onChange={(selected) => handleItemChange(blockIndex, itemIndex, 'coatingShade', selected?.value || '')}
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
                                onChange={(selected) => handleItemChange(blockIndex, itemIndex, 'brandId', selected?.value || '')}
                                placeholder="Brand..."
                                isClearable
                                required
                                menuPortalTarget={document.body}
                                styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                              />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.plainBottleStock} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'plainBottleStock', e.target.value)} min="0" />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.orderQty} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'orderQty', e.target.value)} min="1" required />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.balanceToMake} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'balanceToMake', e.target.value)} />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.boxQty} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'boxQty', e.target.value)} min="1" />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.noOfBoxes} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'noOfBoxes', e.target.value)} min="0" />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.producedQty} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'producedQty', e.target.value)} min="0" />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.dispatchBalance} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'dispatchBalance', e.target.value)} min="0" />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.soldQty} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'soldQty', e.target.value)} min="0" />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.readyBoxes} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'readyBoxes', e.target.value)} min="0" />
                            </td>
                            <td>
                              <input type="text" className="form-control form-control-sm shadow-none" value={item.remarks} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'remarks', e.target.value)} />
                            </td>
                            <td className="text-center">
                              <button
                                type="button"
                                className="btn btn-sm btn-light text-danger rounded-circle shadow-sm"
                                onClick={() => removeItemRow(blockIndex, itemIndex)}
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
                    <button type="button" className="btn btn-sm btn-outline-primary shadow-sm" onClick={() => addItemRow(blockIndex)}>
                      <i className="bi bi-plus-lg me-1"></i> Add Entry Row
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="d-flex justify-content-start mb-4">
              <button type="button" className="btn btn-dark shadow-sm px-4" onClick={addBlock}>
                <i className="bi bi-plus-circle-fill me-2"></i> Add New Bottle Plan Section
              </button>
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
