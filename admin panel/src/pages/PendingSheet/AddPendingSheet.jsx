import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import axios from 'axios';
import Swal from 'sweetalert2';

export default function AddPendingSheet() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);
  const { brands } = useSelector((state) => state.brands);
  const { variants } = useSelector((state) => state.variants);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const [blocks, setBlocks] = useState([
    {
      bottleName: '',
      items: [{
        variantName: '',
        brandId: '',
        coated: 0,
        order: 0,
        ready: 0,
        readyToDispatch: 0,
        dispatch: 0
      }]
    }
  ]);

  useEffect(() => {
    dispatch(fetchBottleSpecs({ limit: 1000, status: true }));
    dispatch(fetchBrands({ limit: 1000, status: true }));
    dispatch(fetchVariants({ limit: 1000, status: true }));
  }, [dispatch]);

  const handleBlockChange = (blockIndex, field, value) => {
    const newBlocks = [...blocks];
    newBlocks[blockIndex][field] = value;
    
    if (field === 'bottleName') {
      newBlocks[blockIndex].items = [{
        variantName: '',
        brandId: '',
        coated: 0,
        order: 0,
        ready: 0,
        readyToDispatch: 0,
        dispatch: 0
      }];
    }
    setBlocks(newBlocks);
  };

  const addBlock = () => {
    setBlocks([...blocks, {
      bottleName: '',
      items: [{
        variantName: '', brandId: '', coated: 0, order: 0, ready: 0, readyToDispatch: 0, dispatch: 0
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
    newBlocks[blockIndex].items.push({
        variantName: '', brandId: '', coated: 0, order: 0, ready: 0, readyToDispatch: 0, dispatch: 0
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

  const handleItemChange = (blockIndex, itemIndex, field, value) => {
    const newBlocks = [...blocks];
    const currentRow = newBlocks[blockIndex].items[itemIndex];
    currentRow[field] = value;

    if (field === 'variantName' && value) {
      const selectedVariant = (variants || []).find(v => 
        v.variantName === value && 
        v.bottleSpecId?.bottleName === newBlocks[blockIndex].bottleName
      );
      if (selectedVariant) {
        if (selectedVariant.bottleSpecId?.brandId) {
          currentRow.brandId = selectedVariant.bottleSpecId?.brandId?._id || selectedVariant.bottleSpecId?.brandId;
        }
      }
    }

    setBlocks(newBlocks);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const payload = [];
    let hasError = false;

    blocks.forEach((block) => {
      if (!block.bottleName) return;

      block.items.forEach(item => {
        if (item.brandId || item.order) {
          if (!item.brandId || !item.order) {
            hasError = true;
          } else {
            payload.push({
              date: date,
              bottleName: block.bottleName,
              variantName: item.variantName || '',
              brandId: item.brandId,
              coated: item.coated || 0,
              order: item.order || 0,
              ready: item.ready || 0,
              readyToDispatch: item.readyToDispatch || 0,
              dispatch: item.dispatch || 0
            });
          }
        }
      });
    });

    if (hasError) {
      return Swal.fire('Error', 'Please fill in all required fields (Brand, Order) for each entered row.', 'error');
    }

    if (payload.length === 0) {
      return Swal.fire('Error', 'Please ensure at least one valid entry.', 'error');
    }

    setLoading(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}/api/pending-sheet`, payload, { withCredentials: true });
      if (res.data.success) {
         Swal.fire('Success', 'Pending Sheet(s) added successfully', 'success');
         navigate('/pending-sheet');
      } else {
         Swal.fire('Error', res.data.message || 'Failed to add record', 'error');
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Server error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const uniqueBottleNames = Array.from(new Set(
    (bottleSpecs || []).map(b => b.bottleName).filter(name => name && name.trim() !== '')
  )).sort().map(name => ({ value: name, label: name }));

  return (
    <div className="page-content">
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">New Pending Sheet</h1>
            <p className="page-subtitle mb-0">Record multiple pending sheet entries</p>
          </div>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="dash-card border-0 shadow-sm p-4">
            
            <form onSubmit={handleSubmit}>
            <div className="mb-4 pb-4 border-bottom">
              <label className="form-label fw-bold small">Common Date <span className="text-danger">*</span></label>
              <input type="date" className="form-control shadow-none w-auto" 
                     value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>

            {blocks.map((block, blockIndex) => {

              let availableBrandIds = new Set();
              if (block.bottleName) {
                const specs = bottleSpecs.filter(bs => bs.bottleName === block.bottleName);
                specs.forEach(spec => availableBrandIds.add(spec.brandId?._id || spec.brandId));
              }
              const brandOptions = brands
                .filter(b => availableBrandIds.size === 0 || availableBrandIds.has(b._id))
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
                      <label className="form-label fw-bold small text-primary">Bottlename <span className="text-danger">*</span></label>
                      <Select
                        options={uniqueBottleNames}
                        value={uniqueBottleNames.find(o => o.value === block.bottleName) || null}
                        onChange={(selected) => handleBlockChange(blockIndex, 'bottleName', selected ? selected.value : '')}
                        placeholder="Select bottle..."
                        isClearable
                        required
                      />
                    </div>
                  </div>

                  <div className="d-flex align-items-center justify-content-between mb-3 mt-2">
                    <h6 className="fw-bold text-muted mb-0">ENTRIES FOR <span className="text-primary">{block.bottleName || 'UNSELECTED BOTTLE'}</span></h6>
                  </div>

                  <div className="table-responsive mb-3">
                    <table className="table table-bordered align-middle table-sm" style={{ minWidth: '1000px' }}>
                      <thead className="table-light">
                        <tr>
                          <th className="small text-muted text-center align-middle" style={{width: '5%'}}>Sr.</th>
                          <th className="small text-muted text-center align-middle" style={{width: '20%'}}>Variant Name</th>
                          <th className="small text-muted text-center align-middle" style={{width: '15%'}}>Brand <span className="text-danger">*</span></th>
                          <th className="small text-muted text-center align-middle" style={{width: '10%'}}>Coated</th>
                          <th className="small text-muted text-center align-middle" style={{width: '10%'}}>Order Qty <span className="text-danger">*</span></th>
                          <th className="small text-muted text-center align-middle" style={{width: '10%'}}>Ready</th>
                          <th className="small text-muted text-center align-middle" style={{width: '12%'}}>Ready To Dispatch</th>
                          <th className="small text-muted text-center align-middle" style={{width: '12%'}}>Dispatch</th>
                          <th className="small text-muted text-center align-middle" style={{width: '5%'}}></th>
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
                                    .map(v => v.variantName)
                                )).sort().map(val => ({ value: val, label: val }))}
                                value={item.variantName ? { value: item.variantName, label: item.variantName } : null}
                                onChange={(selected) => handleItemChange(blockIndex, itemIndex, 'variantName', selected?.value || '')}
                                placeholder="Variant..."
                                isClearable
                                menuPortalTarget={document.body}
                                styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
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
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.coated} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'coated', e.target.value)} min="0" />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.order} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'order', e.target.value)} min="1" required />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.ready} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'ready', e.target.value)} min="0" />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.readyToDispatch} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'readyToDispatch', e.target.value)} min="0" />
                            </td>
                            <td>
                              <input type="number" className="form-control form-control-sm shadow-none text-center" value={item.dispatch} onChange={(e) => handleItemChange(blockIndex, itemIndex, 'dispatch', e.target.value)} min="0" />
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
                <i className="bi bi-plus-circle-fill me-2"></i> Add New Bottle Section
              </button>
            </div>

            <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
              <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                <i className="bi bi-check2-circle me-2" /> {loading ? 'Saving...' : 'Save All Records'}
              </button>
              <button type="button" onClick={() => navigate('/pending-sheet')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
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
