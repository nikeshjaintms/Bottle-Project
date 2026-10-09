import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import API from '../../services/api';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { createVariant, fetchVariants } from '../../redux/slices/variantSlice';
import Swal from 'sweetalert2';
import SearchableSelect from '../../components/SearchableSelect';
import CoatingShadeSelect from '../../components/CoatingShadeSelect';

export default function AddVariant() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);
  const { loading, variants } = useSelector((state) => state.variants);

  const [formData, setFormData] = useState({
    variantName: '',
    variantSize: '',
    coatingShade: '',
    status: 'active',
    bottleSpecId: '',
    image: null,
    detectedTextColor: ''
  });
  const [analyzingColor, setAnalyzingColor] = useState(false);

  const [errors, setErrors] = useState({
    variantName: '',
    bottleSpecId: ''
  });

  const validateField = (name, value) => {
    let msg = '';
    const fieldNames = {
      bottleSpecId: 'Bottle Specification'
    };

    if (name === 'bottleSpecId' && (!value || value.trim() === '')) {
      msg = `${fieldNames[name] || name} is mandatory`;
    }
    setErrors(prev => ({ ...prev, [name]: msg }));
    return msg;
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    const msg = validateField(name, value);
    if (msg) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Warning',
        text: msg,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    }
  };

  const handleChange = async (e) => {
    const { name, value, type, files } = e.target;
    if (type === 'file') {
      const file = files[0];
      setFormData(prev => ({ ...prev, [name]: file }));
      
      if (file) {
        setAnalyzingColor(true);
        const data = new FormData();
        data.append('image', file);
        try {
          const res = await API.post('/text-color/analyze', data);
          if (res.data?.success && res.data?.data?.detectedName) {
            setFormData(prev => ({ ...prev, detectedTextColor: res.data.data.detectedName }));
          } else {
            // API responded but no text color found — not an error
            setFormData(prev => ({ ...prev, detectedTextColor: 'Not Detected' }));
          }
        } catch (err) {
          console.error("Color analysis error:", err);
          // If server returned a structured response (e.g. 404/500), still show Not Detected
          const serverMsg = err.response?.data?.message;
          if (serverMsg) {
            setFormData(prev => ({ ...prev, detectedTextColor: 'Not Detected' }));
          } else {
            setFormData(prev => ({ ...prev, detectedTextColor: 'Not Detected' }));
          }
        } finally {
          setAnalyzingColor(false);
        }
      } else {
        setFormData(prev => ({ ...prev, detectedTextColor: '' }));
      }
    } else {
      let cleanValue = value;
      if (name === 'detectedTextColor' && typeof cleanValue === 'string') {
        cleanValue = cleanValue.replace(/^\s+/, '');
      }
      setFormData(prev => ({ ...prev, [name]: cleanValue }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const location = useLocation();

  useEffect(() => {
    dispatch(fetchBottleSpecs({ pagination: 'false', type: 'all' }));
    dispatch(fetchVariants({ pagination: 'false' }));
    if (location.state?.autoSelectSpecId) {
      setFormData(prev => ({ 
        ...prev, 
        bottleSpecId: location.state.autoSelectSpecId,
        coatingShade: location.state.autoSelectCoatingShade || prev.coatingShade
      }));
    }
  }, [dispatch, location.state]);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate all mandatory fields
    const specError = validateField('bottleSpecId', formData.bottleSpecId);
    if (specError) return Swal.fire('Validation Error', specError, 'error');

    // Duplicate check: same bottleSpecId + same variantName (case-insensitive)
    if (formData.variantName && formData.bottleSpecId) {
      const isDuplicate = variants.some(v =>
        v.bottleSpecId?._id === formData.bottleSpecId &&
        v.variantName?.trim().toLowerCase() === formData.variantName.trim().toLowerCase()
      );
      if (isDuplicate) {
        const specName = selectedSpec?.bottleName || 'this bottle specification';
        return Swal.fire({
          icon: 'error',
          title: 'Duplicate Entry',
          html: `Variant <b>"${formData.variantName}"</b> already exists under<br/><b>${specName}</b>.<br/><span class="text-muted small">Please use a different variant name.</span>`,
          confirmButtonColor: '#e91e63'
        });
      }
    }

    const submitData = new FormData();
    for (const key in formData) {
      if (formData[key] !== null && formData[key] !== undefined) {
        submitData.append(key, formData[key]);
      }
    }

    dispatch(createVariant(submitData)).then((res) => {
      if (!res.error) {
        Swal.fire('Success!', `Variant "${formData.variantName}" added!`, 'success');
        if (location.state?.returnTo) {
          navigate(location.state.returnTo, {
            state: {
              restoredFormData: {
                ...location.state.savedFormData,
                // If the variant had a coating shade, bring it back to the coating spec form
                coatingShade: formData.coatingShade || location.state.savedFormData?.coatingShade || ''
              },
              newVariantId: res.payload._id
            }
          });
        } else {
          navigate('/variants');
        }
      } else {
        // Check if it's a duplicate error from the backend (409)
        const msg = res.payload || 'Failed to add variant.';
        const isDuplicateErr = msg.toLowerCase().includes('already exists');
        Swal.fire({
          icon: isDuplicateErr ? 'error' : 'error',
          title: isDuplicateErr ? 'Duplicate Entry' : 'Error',
          html: isDuplicateErr
            ? `Variant <b>"${formData.variantName}"</b> already exists under<br/><b>${selectedSpec?.bottleName || 'this bottle specification'}</b>.<br/><span class="text-muted small">Please use a different variant name.</span>`
            : msg,
          confirmButtonColor: '#e91e63'
        });
      }
    });
  };

  const selectedSpec = bottleSpecs.find(s => s._id === formData.bottleSpecId);

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/variants" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Add Variant</h1>
          <p className="page-subtitle">Create a new product variant for a specification</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="row g-4">
                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Bottle Specification <span className="text-danger">*</span>
                    </label>
                    <SearchableSelect
                      options={bottleSpecs.filter(s => s.status && s.brandId?.status).map(s => ({
                        value: s._id,
                        label: `${s.bottleName} (${s.brandId?.name || 'N/A'})${s.isCoating ? ' [Coating]' : ` - ${s.printingTypeId?.name || 'N/A'} [${s.printingColorId?.name || 'N/A'}]`}`
                      }))}
                      value={formData.bottleSpecId}
                      onChange={(val) => {
                        setFormData(prev => ({ ...prev, bottleSpecId: val }));
                        if (errors.bottleSpecId) setErrors(prev => ({ ...prev, bottleSpecId: '' }));
                      }}
                      placeholder="-- Choose Spec --"
                      isInvalid={!!errors.bottleSpecId}
                    />
                    {errors.bottleSpecId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.bottleSpecId}</div>}
                  </div>

                  {selectedSpec && (
                    <div className="col-md-12">
                      <div className="alert alert-info py-3 px-3 mb-0" style={{ fontSize: 13, borderRadius: 12, border: 'none', backgroundColor: '#e3f2fd', color: '#0d47a1' }}>
                        <div className="d-flex align-items-center mb-1">
                          <i className="bi bi-info-circle-fill me-2" />
                          <span className="fw-bold">Linked Specification Details:</span>
                        </div>
                        <div className="row g-2 mt-1">
                          <div className="col-md-4">
                            <span className="text-muted small text-uppercase fw-600 d-block">Brand</span>
                            <span className="fw-600">{selectedSpec.brandId?.name || 'N/A'}</span>
                          </div>
                          <div className="col-md-4">
                            <span className="text-muted small text-uppercase fw-600 d-block">Printing Type</span>
                            <span className="fw-600">{selectedSpec.printingTypeId?.name || 'N/A'}</span>
                          </div>
                          <div className="col-md-4">
                            <span className="text-muted small text-uppercase fw-600 d-block">Printing Color</span>
                            <span className="fw-600">{selectedSpec.printingColorId?.name || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}



                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Variant Name
                    </label>
                    <input
                      type="text"
                      name="variantName"
                      className={`form-control custom-input-field ${errors.variantName ? 'is-invalid' : ''}`}
                      value={formData.variantName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      style={{ borderRadius: 12 }}
                    />
                    {errors.variantName && <div className="invalid-feedback">{errors.variantName}</div>}
                  </div>



                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Variant Size
                    </label>
                    <input
                      type="text"
                      name="variantSize"
                      className="form-control custom-input-field"
                      value={formData.variantSize}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Coating Shade
                    </label>
                    <CoatingShadeSelect
                      value={formData.coatingShade}
                      onChange={(val) => setFormData(prev => ({ ...prev, coatingShade: val }))}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted d-block mb-3">
                      Variant Image
                    </label>
                    <div className="d-flex align-items-end gap-3">
                      {formData.image && (
                        <div className="position-relative shadow-sm rounded-3 overflow-hidden border border-light-subtle" style={{ width: '80px', height: '80px', flexShrink: 0 }}>
                          <img src={URL.createObjectURL(formData.image)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button 
                            type="button" 
                            className="btn btn-sm btn-danger rounded-circle position-absolute p-0 d-flex align-items-center justify-content-center shadow" 
                            style={{ width: 22, height: 22, top: 4, right: 4 }}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, image: null }));
                              document.getElementById('imageInput').value = '';
                            }}
                          >
                            <i className="bi bi-x" style={{ fontSize: 16 }} />
                          </button>
                        </div>
                      )}
                      <div className="flex-grow-1">
                        <input
                          id="imageInput"
                          type="file"
                          name="image"
                          className="form-control custom-input-field"
                          onChange={handleChange}
                          accept="image/*"
                          style={{ borderRadius: 12 }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Detected Text Color
                      {analyzingColor && <span className="spinner-border spinner-border-sm text-accent ms-2" role="status" />}
                    </label>
                    <input
                      type="text"
                      name="detectedTextColor"
                      className="form-control custom-input-field"
                      placeholder="Auto-detected on image upload"
                      value={formData.detectedTextColor}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    />
                  </div>

                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">Status</label>
                    <select 
                      className="form-select custom-input-field" 
                      value={formData.status} 
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      style={{ borderRadius: 12 }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="d-flex gap-2 mt-5 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...</>
                    ) : (
                      <><i className="bi bi-check2-circle me-2" /> Save Variant</>
                    )}
                  </button>
                  <button type="button" onClick={() => navigate('/variants')} className="btn-ghost px-5 py-3">
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
