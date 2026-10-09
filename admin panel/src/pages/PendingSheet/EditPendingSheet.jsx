import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import Swal from 'sweetalert2';

export default function EditPendingSheet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);
  const { brands } = useSelector((state) => state.brands);
  const { variants } = useSelector((state) => state.variants);

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    date: '',
    bottleName: '',
    brandId: '',
    variantName: '',
    coated: 0,
    order: 0,
    ready: 0,
    readyToDispatch: 0,
    dispatch: 0
  });

  useEffect(() => {
    dispatch(fetchBottleSpecs({ limit: 1000, status: true }));
    dispatch(fetchBrands({ limit: 1000, status: true }));
    dispatch(fetchVariants({ limit: 1000, status: true }));
    
    const fetchRecord = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}/api/pending-sheet/${id}`, { withCredentials: true });
        if (res.data.success) {
          const data = res.data.data;
          setFormData({
            ...data,
            date: data.date ? new Date(data.date).toISOString().split('T')[0] : '',
            brandId: data.brandId ? (data.brandId._id || data.brandId) : ''
          });
        }
      } catch (err) {
        console.error("Error fetching record", err);
      }
    };
    fetchRecord();
  }, [dispatch, id]);

  const handleChange = (eOrField, value) => {
    let name, val;
    if (eOrField && eOrField.target) {
      name = eOrField.target.name;
      val = eOrField.target.value;
    } else {
      name = eOrField;
      val = value;
    }

    const newFormData = { ...formData, [name]: val };

    if (name === 'bottleName') {
      newFormData.brandId = '';
      newFormData.variantName = '';
    }

    if (name === 'variantName' && val) {
      const selectedVariant = (variants || []).find(v => 
        v.variantName === val && 
        v.bottleSpecId?.bottleName === newFormData.bottleName
      );
      if (selectedVariant) {
        if (selectedVariant.bottleSpecId?.brandId) {
          newFormData.brandId = selectedVariant.bottleSpecId?.brandId?._id || selectedVariant.bottleSpecId?.brandId;
        }
      }
    }

    setFormData(newFormData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.brandId || !formData.order) {
      return Swal.fire('Error', 'Please fill in all required fields (Brand, Order Qty).', 'error');
    }
    
    setLoading(true);
    try {
      const res = await axios.put(`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}/api/pending-sheet/${id}`, formData, { withCredentials: true });
      if (res.data.success) {
        Swal.fire('Success', 'Pending Sheet updated successfully', 'success');
        navigate('/pending-sheet');
      } else {
        Swal.fire('Error', res.data.message || 'Failed to update record', 'error');
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

  let availableBrandIds = new Set();
  if (formData.bottleName) {
    const specs = bottleSpecs.filter(bs => bs.bottleName === formData.bottleName);
    specs.forEach(spec => availableBrandIds.add(spec.brandId?._id || spec.brandId));
  }
  const brandOptions = brands
    .filter(b => availableBrandIds.size === 0 || availableBrandIds.has(b._id))
    .map(b => ({ value: b._id, label: b.name }));

  return (
    <div className="page-content">
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">Edit Pending Sheet Record</h1>
            <p className="page-subtitle mb-0">Update an existing pending sheet entry</p>
          </div>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="dash-card border-0 shadow-sm p-4">
            
            <form onSubmit={handleSubmit}>
            <div className="mb-4 pb-4 border-bottom">
              <label className="form-label fw-bold small">Date <span className="text-danger">*</span></label>
              <input type="date" className="form-control shadow-none w-auto" name="date" 
                     value={formData.date} onChange={handleChange} required />
            </div>

            <div className="bg-white border border-light-subtle rounded-3 p-4 mb-4 shadow-sm position-relative">
              <div className="row g-4 mb-4 bg-light p-3 rounded mx-0">
                <div className="col-md-5">
                  <label className="form-label fw-bold small text-primary">Bottlename <span className="text-danger">*</span></label>
                  <Select
                    options={uniqueBottleNames}
                    value={uniqueBottleNames.find(o => o.value === formData.bottleName) || null}
                    onChange={(selected) => handleChange('bottleName', selected ? selected.value : '')}
                    placeholder="Select bottle..."
                    isClearable
                    required
                  />
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between mb-3 mt-2">
                <h6 className="fw-bold text-muted mb-0">ENTRIES FOR <span className="text-primary">{formData.bottleName || 'UNSELECTED BOTTLE'}</span></h6>
              </div>

              <div className="table-responsive mb-4">
              <table className="table table-bordered align-middle table-sm" style={{ minWidth: '1000px' }}>
                <thead className="table-light">
                  <tr>
                    <th className="small text-muted text-center align-middle" style={{width: '20%'}}>Variant Name</th>
                    <th className="small text-muted text-center align-middle" style={{width: '15%'}}>Brand <span className="text-danger">*</span></th>
                    <th className="small text-muted text-center align-middle" style={{width: '10%'}}>Coated</th>
                    <th className="small text-muted text-center align-middle" style={{width: '10%'}}>Order Qty <span className="text-danger">*</span></th>
                    <th className="small text-muted text-center align-middle" style={{width: '10%'}}>Ready</th>
                    <th className="small text-muted text-center align-middle" style={{width: '15%'}}>Ready To Dispatch</th>
                    <th className="small text-muted text-center align-middle" style={{width: '15%'}}>Dispatch</th>
                  </tr>
                </thead>
                <tbody className="border-top-0">
                  <tr>
                    <td>
                      <CreatableSelect
                        options={Array.from(new Set(
                          (variants || [])
                            .filter(v => v.bottleSpecId?.bottleName === formData.bottleName)
                            .filter(v => v.variantName)
                            .map(v => v.variantName)
                        )).sort().map(val => ({ value: val, label: val }))}
                        value={formData.variantName ? { value: formData.variantName, label: formData.variantName } : null}
                        onChange={(selected) => handleChange('variantName', selected?.value || '')}
                        placeholder="Variant..."
                        isClearable
                        menuPortalTarget={document.body}
                        styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                      />
                    </td>
                    <td>
                      <Select
                        options={brandOptions}
                        value={brandOptions.find(o => o.value === formData.brandId) || null}
                        onChange={(selected) => handleChange('brandId', selected?.value || '')}
                        placeholder="Brand..."
                        isClearable
                        required
                        menuPortalTarget={document.body}
                        styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                      />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm shadow-none text-center" name="coated" value={formData.coated} onChange={handleChange} min="0" />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm shadow-none text-center" name="order" value={formData.order} onChange={handleChange} min="1" required />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm shadow-none text-center" name="ready" value={formData.ready} onChange={handleChange} min="0" />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm shadow-none text-center" name="readyToDispatch" value={formData.readyToDispatch} onChange={handleChange} min="0" />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm shadow-none text-center" name="dispatch" value={formData.dispatch} onChange={handleChange} min="0" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>

            <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
              <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                <i className="bi bi-check2-circle me-2" /> {loading ? 'Saving...' : 'Update Record'}
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
