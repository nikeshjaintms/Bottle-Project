import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchCoatingSpecs } from '../../redux/slices/coatingSpecSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchCoatingTypes } from '../../redux/slices/coatingTypeSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import Swal from 'sweetalert2';
import SearchableSelect from '../../components/SearchableSelect';
import CoatingShadeSelect from '../../components/CoatingShadeSelect';
import CreatableSelect from 'react-select/creatable';
import API from '../../services/api';
import { V_URL } from '../../../Baseurl.js';

export default function EditCoatingSpec() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { coatingSpecs } = useSelector((state) => state.coatingSpecs);
  const { brands } = useSelector((state) => state.brands);
  const { companies } = useSelector((state) => state.companies);
  const { items: coatingTypes } = useSelector((state) => state.coatingType);
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);
  const { variants } = useSelector((state) => state.variants);
  const { items: bottlePerBoxes } = useSelector((state) => state.bottlePerBox);

  const [formData, setFormData] = useState({
    companyId: '',
    brandId: '',
    bottleName: '',
    code: '',
    variantId: '',
    coatingTypeId: '',
    coatingShade: '',
    image: '',
    status: 'active'
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const [errors, setErrors] = useState({
    companyId: '', brandId: '', bottleName: '', coatingTypeId: ''
  });

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchBrands({ pagination: 'false' }));
    dispatch(fetchCoatingTypes({ pagination: 'false' }));
    dispatch(fetchCoatingSpecs({ pagination: 'false' }));
    dispatch(fetchBottleSpecs({ pagination: 'false', type: 'all' }));
    dispatch(fetchVariants({ pagination: 'false' }));
    dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
  }, [dispatch]);

  // Combine specs to extract unique names and codes
  const allSpecs = [...(bottleSpecs || []), ...(coatingSpecs || [])];

  const filteredSpecs = formData.brandId
    ? allSpecs.filter(s => (s.brandId?._id || s.brandId) === formData.brandId)
    : allSpecs;

  const uniqueBottleNames = Array.from(new Set([
    ...filteredSpecs.map(s => s.bottleName).filter(name => name && name.trim() !== ''),
    ...(bottlePerBoxes || []).map(b => b.bottleName).filter(name => name && name.trim() !== '')
  ])).map(name => ({ value: name, label: name }));

  const uniqueBottleCodes = Array.from(new Set(
    filteredSpecs
      .map(s => s.code)
      .filter(code => code && code.trim() !== '')
  )).map(code => ({ value: code, label: code }));

  // Show all variants when no bottleName selected, filter by bottleName when selected
  const filteredVariants = (variants || []).filter(v => {
    if (!formData.bottleName) return true;
    return v.bottleSpecId?.bottleName === formData.bottleName;
  });

  const location = useLocation();

  useEffect(() => {
    const spec = coatingSpecs.find(s => s._id === id);
    if (spec) {
      if (location.state?.restoredFormData) {
        setFormData(prev => ({
          ...prev,
          ...location.state.restoredFormData,
          variantId: location.state.newVariantId || location.state.restoredFormData.variantId
        }));
      } else {
        setFormData({
          companyId: spec.brandId?.companyId?._id || spec.brandId?.companyId || '',
          brandId: spec.brandId?._id || spec.brandId || '',
          bottleName: spec.bottleName || '',
          code: spec.code || '',
          variantId: spec.variantId?._id || spec.variantId || '',
          coatingTypeId: spec.coatingTypeId?._id || spec.coatingTypeId || '',
          coatingShade: spec.coatingShade || '',
          image: spec.image || '',
          status: (spec.status === true || spec.status === 'active') ? 'active' : 'inactive'
        });
        if (spec.image) {
          setImagePreview(`${V_URL}${spec.image}`);
        }
      }
    }
  }, [id, coatingSpecs, location.state]);

  // When returning from Add/Edit Variant, sync coating shade from the variant
  useEffect(() => {
    const variantId = location.state?.newVariantId;
    if (variantId && variants.length > 0) {
      const returnedVariant = variants.find(v => v._id === variantId);
      if (returnedVariant?.coatingShade) {
        setFormData(prev => ({
          ...prev,
          coatingShade: prev.coatingShade || returnedVariant.coatingShade
        }));
      }
    }
  }, [location.state?.newVariantId, variants]);

  const validateField = (name, value) => {
    const fieldNames = { companyId: 'Company', brandId: 'Brand', bottleName: 'Bottle Name', coatingTypeId: 'Coating Type' };
    const msg = !value ? `${fieldNames[name] || name} is mandatory` : '';
    setErrors(prev => ({ ...prev, [name]: msg }));
    return msg;
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    const msg = validateField(name, value);
    if (msg) Swal.fire({ icon: 'warning', title: 'Validation Warning', text: msg, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
  };

  const handleSelectChange = (field, value) => {
    if (field === 'companyId') setFormData(prev => ({ ...prev, companyId: value, brandId: '' }));
    else setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'companyId') {
      setFormData(prev => ({ ...prev, companyId: value, brandId: '' }));
    } else if (name === 'variantId') {
      const selectedVariant = variants.find(v => v._id === value);
      if (selectedVariant) {
        setFormData(prev => ({
          ...prev,
          variantId: value,
          coatingShade: selectedVariant.coatingShade || prev.coatingShade
        }));
      } else {
        setFormData(prev => ({ ...prev, variantId: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAddVariantClick = async () => {
    if (!formData.brandId || !formData.bottleName) {
      return Swal.fire('Missing Info', 'Please select Company, Brand, and Bottle Name first.', 'warning');
    }

    try {
      // Check if a BottleSpec with this brand + bottleName already exists
      const allSpecsData = [...(bottleSpecs || []), ...(coatingSpecs || [])];
      let existing = allSpecsData.find(s =>
        (s.brandId?._id || s.brandId) === formData.brandId &&
        s.bottleName === formData.bottleName &&
        s.isPrinting === true
      );

      let specId = existing ? existing._id : null;

      if (!existing) {
        // Auto-create a BottleSpec entry so it shows in the variant page
        const specData = {
          brandId: formData.brandId,
          bottleName: formData.bottleName,
          code: formData.code || '',
          isPrinting: true,
          status: true
        };
        const response = await API.post('/bottle-spec', specData);
        specId = response.data._id;
        
        Swal.fire({
          icon: 'info',
          title: 'Bottle Spec Created',
          text: `"${formData.bottleName}" has been auto-saved to Bottle Specs.`,
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }

      navigate('/variants/add', {
        state: {
          autoSelectSpecId: specId,
          autoSelectCoatingShade: formData.coatingShade,
          returnTo: `/coating-specs/edit/${id}`,
          savedFormData: formData
        }
      });
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || 'Failed to auto-create bottle spec.', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const companyError = validateField('companyId', formData.companyId);
    const brandError = validateField('brandId', formData.brandId);
    const nameError = validateField('bottleName', formData.bottleName);
    const typeError = validateField('coatingTypeId', formData.coatingTypeId);

    if (companyError || brandError || nameError || typeError) {
      return Swal.fire('Validation Error', 'Please fix the errors before submitting.', 'error');
    }

    // Duplicate check: same brand + bottleName + variant (excluding self)
    const isDuplicate = coatingSpecs?.some(spec => {
      if (spec._id === id) return false;
      const matchBrand = (spec.brandId?._id || spec.brandId) === formData.brandId;
      const matchBottleName = spec.bottleName?.trim().toLowerCase() === formData.bottleName?.trim().toLowerCase();
      const matchVariant = (spec.variantId?._id || spec.variantId || '') === (formData.variantId || '');
      return matchBrand && matchBottleName && matchVariant;
    });

    if (isDuplicate) {
      const brandName = brands.find(b => b._id === formData.brandId)?.name || '';
      return Swal.fire({
        icon: 'error',
        title: 'Duplicate Entry',
        html: `Coating Spec <b>"${formData.bottleName}"</b><br/>
               already exists for brand <b>"${brandName}"</b>.<br/>
               <span class="text-muted small">Please use a different bottle name or variant.</span>`,
        confirmButtonColor: '#e91e63'
      });
    }

    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(formData).forEach(([k, v]) => {
        // Always include 'code' so clearing it sends an empty string to the server
        if (k === 'code') {
          data.append(k, v ?? '');
        } else if (v && k !== 'image') {
          data.append(k, v);
        }
      });
      if (imageFile) {
        data.append('image', imageFile);
      } else if (formData.image) {
        data.append('image', formData.image);
      }
      data.append('isCoating', true);

      const res = await API.put(`/bottle-spec/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data) {
        Swal.fire('Success!', `Coating Spec updated!`, 'success');
        navigate('/coating-specs');
      }
    } catch (err) {
      Swal.fire('Error!', err.response?.data?.message || 'Failed to update coating spec.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/coating-specs" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit Coating Spec</h1>
          <p className="page-subtitle">Configure coating specification details for {formData.bottleName}</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="row g-4">

                  {/* Company */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Company <span className="text-danger">*</span></label>
                    <SearchableSelect
                      options={companies.filter(c => c.status || c._id === formData.companyId).map(c => ({ value: c._id, label: c.name }))}
                      value={formData.companyId}
                      onChange={(val) => handleSelectChange('companyId', val)}
                      placeholder="-- Choose Company --"
                      isInvalid={!!errors.companyId}
                    />
                    {errors.companyId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.companyId}</div>}
                  </div>

                  {/* Brand */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Brand <span className="text-danger">*</span></label>
                    <SearchableSelect
                      options={brands.filter(b => (b.status || b._id === formData.brandId) && (b.companyId?._id === formData.companyId || b.companyId === formData.companyId)).map(b => ({ value: b._id, label: b.name }))}
                      value={formData.brandId}
                      onChange={(val) => handleSelectChange('brandId', val)}
                      placeholder="-- Choose Brand --"
                      disabled={!formData.companyId}
                      isInvalid={!!errors.brandId}
                    />
                    {errors.brandId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.brandId}</div>}
                  </div>

                  {/* Bottle Name */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Bottle Name <span className="text-danger">*</span></label>
                    <CreatableSelect
                      isClearable
                      options={uniqueBottleNames}
                      value={formData.bottleName ? { value: formData.bottleName, label: formData.bottleName } : null}
                      onChange={(selected) => {
                        handleSelectChange('bottleName', selected ? selected.value : '');
                      }}
                      onBlur={() => handleBlur({ target: { name: 'bottleName', value: formData.bottleName } })}
                      placeholder="Select or type bottle name..."
                      styles={{
                        control: (base, state) => ({
                          ...base,
                          borderRadius: '12px',
                          borderColor: errors.bottleName ? '#dc3545' : (state.isFocused ? '#86b7fe' : '#dee2e6'),
                          boxShadow: state.isFocused ? (errors.bottleName ? '0 0 0 0.25rem rgba(220, 53, 69, 0.25)' : '0 0 0 0.25rem rgba(13, 110, 253, 0.25)') : 'none',
                          padding: '2px',
                          '&:hover': {
                            borderColor: errors.bottleName ? '#dc3545' : (state.isFocused ? '#86b7fe' : '#dee2e6')
                          }
                        })
                      }}
                    />
                    {errors.bottleName && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.bottleName}</div>}
                  </div>

                  {/* Bottle Code */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Bottle Code</label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="code"
                      value={formData.code || ''}
                      onChange={handleChange}
                      placeholder="Enter bottle code..."
                      style={{ borderRadius: 12, padding: '8px 12px' }}
                    />
                  </div>

                  {/* Coating Type */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Coating Type <span className="text-danger">*</span></label>
                    <select className={`form-select custom-input-field ${errors.coatingTypeId ? 'is-invalid' : ''}`} name="coatingTypeId" value={formData.coatingTypeId} onChange={handleChange} onBlur={handleBlur} style={{ borderRadius: 12 }}>
                      <option value="">Select Coating Type</option>
                      {coatingTypes.filter(t => t.status || t._id === formData.coatingTypeId).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                    </select>
                    {errors.coatingTypeId && <div className="invalid-feedback">{errors.coatingTypeId}</div>}
                  </div>

                  {/* Coating Shade — manual text entry */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Coating Shade</label>
                    <CoatingShadeSelect
                      value={formData.coatingShade}
                      onChange={(val) => setFormData(prev => ({ ...prev, coatingShade: val }))}
                    />
                  </div>

                  {/* Variant */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Variant</label>
                    <div className="d-flex align-items-center gap-2">
                      <div className="flex-grow-1">
                        <SearchableSelect
                          options={filteredVariants.map(v => ({
                            value: v._id,
                            label: `${v.variantName}${v.variantSize ? ' - ' + v.variantSize : ''}${!formData.bottleName ? ` (${v.bottleSpecId?.bottleName || ''})` : ''}`
                          }))}
                          value={formData.variantId}
                          onChange={(val) => {
                            const selectedVariant = variants.find(v => v._id === val);
                            setFormData(prev => ({
                              ...prev,
                              variantId: val || '',
                              coatingShade: selectedVariant?.coatingShade || prev.coatingShade
                            }));
                          }}
                          placeholder="-- Select Variant --"
                        />
                      </div>
                      {formData.bottleName && (
                        <button
                          type="button"
                          onClick={handleAddVariantClick}
                          className="btn btn-sm btn-outline-primary rounded-3 shadow-none px-3 py-2 fw-600"
                          style={{ whiteSpace: 'nowrap', fontSize: 12 }}
                          title="Add another variant for this bottle"
                        >
                          <i className="bi bi-plus-lg me-1" />Add
                        </button>
                      )}
                    </div>
                    {formData.variantId && variants.find(v => v._id === formData.variantId)?.image && (
                      <div className="mt-2 border rounded-3 overflow-hidden d-flex align-items-center justify-content-center bg-light shadow-sm" style={{ width: 80, height: 80 }}>
                        <img src={`${V_URL}${variants.find(v => v._id === formData.variantId).image}`} alt="Variant" className="w-100 h-100 object-fit-cover" />
                      </div>
                    )}
                    {formData.bottleName && filteredVariants.length === 0 && (
                      <div className="mt-2 text-warning small d-flex align-items-center gap-1">
                        <i className="bi bi-exclamation-triangle-fill"></i>
                        <span>Variant of this bottle is not present. <button type="button" onClick={handleAddVariantClick} className="text-decoration-underline text-warning fw-bold btn btn-link p-0 border-0 align-baseline" style={{ fontSize: 'inherit' }}>Add Variant</button> (or leave blank, variant is optional)</span>
                      </div>
                    )}
                  </div>

                  {/* Image Upload */}
                  <div className="col-md-12">
                    <div className="d-flex align-items-center gap-3">
                      <div className="border rounded-3 d-flex justify-content-center align-items-center bg-light overflow-hidden shadow-sm position-relative" style={{ width: 80, height: 80, flexShrink: 0 }}>
                        {imagePreview ? (
                          <>
                            <img src={imagePreview} alt="Bottle Image" className="w-100 h-100 object-fit-cover" />
                            <button
                              type="button"
                              className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 m-1"
                              style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                              onClick={() => {
                                setImagePreview(null);
                                setFormData(prev => ({ ...prev, image: null }));
                                if (document.getElementById('bottleImageInput')) document.getElementById('bottleImageInput').value = '';
                              }}
                            >
                              <i className="bi bi-x" style={{ fontSize: 14 }}></i>
                            </button>
                          </>
                        ) : (
                          <div className="d-flex flex-column align-items-center text-muted">
                            <i className="bi bi-image fs-4"></i>
                            <span className="small mt-1" style={{ fontSize: 10 }}>Bottle Image</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-grow-1">
                        <input
                          id="bottleImageInput"
                          type="file"
                          accept="image/*"
                          className="form-control"
                          onChange={handleImageChange}
                          style={{
                            borderRadius: 8,
                            padding: '0.45rem 0.75rem',
                            border: '1px solid #dee2e6'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">Status</label>
                    <select className="form-select custom-input-field" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={{ borderRadius: 12 }}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="d-flex flex-column flex-md-row gap-2 mt-5 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={saving}>
                    {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Updating...</> : <><i className="bi bi-check2-circle me-2" />Update Coating Spec</>}
                  </button>
                  <button type="button" onClick={() => navigate('/coating-specs')} className="btn-ghost px-5 py-3">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
