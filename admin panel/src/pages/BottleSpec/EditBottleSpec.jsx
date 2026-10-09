import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateBottleSpec, fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchCoatingSpecs } from '../../redux/slices/coatingSpecSlice';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchPrintingTypes } from '../../redux/slices/printingTypeSlice';
import { fetchPrintingColors } from '../../redux/slices/printingColorSlice';
import Swal from 'sweetalert2';
import SearchableSelect from '../../components/SearchableSelect';
import CreatableSelect from 'react-select/creatable';

export default function EditBottleSpec() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { bottleSpecs, loading } = useSelector((state) => state.bottleSpecs);
  const { coatingSpecs } = useSelector((state) => state.coatingSpecs);
  const { brands } = useSelector((state) => state.brands);
  const { companies } = useSelector((state) => state.companies);
  const { items: printingTypes } = useSelector((state) => state.printingType);
  const { items: printingColors } = useSelector((state) => state.printingColor);
  const { items: bottlePerBoxes } = useSelector((state) => state.bottlePerBox);

  const [formData, setFormData] = useState({
    companyId: '',
    brandId: '',
    bottleName: '',
    code: '',
    printingTypeId: '',
    printingColorId: '',
    status: 'active'
  });

  const [errors, setErrors] = useState({
    companyId: '',
    brandId: '',
    bottleName: '',
    printingTypeId: ''
  });

  const [filteredColors, setFilteredColors] = useState([]);

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchBrands({ pagination: 'false' }));
    dispatch(fetchPrintingTypes({ pagination: 'false' }));
    dispatch(fetchPrintingColors({ pagination: 'false' }));
    dispatch(fetchBottleSpecs({ pagination: 'false' }));
    dispatch(fetchCoatingSpecs({ pagination: 'false', type: 'all' }));
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

  useEffect(() => {
    const spec = bottleSpecs.find(s => s._id === id);
    if (spec) {
      setFormData({
        companyId: spec.brandId?.companyId?._id || spec.brandId?.companyId || '',
        brandId: spec.brandId?._id || spec.brandId || '',
        bottleName: spec.bottleName || '',
        code: spec.code || '',
        printingTypeId: spec.printingTypeId?._id || spec.printingTypeId || '',
        printingColorId: spec.printingColorId?._id || spec.printingColorId || '',
        status: spec.status === true ? 'active' : 'inactive',
        isPrinting: true
      });
    }
  }, [id, bottleSpecs]);

  useEffect(() => {
    if (formData.printingTypeId) {
      const filtered = printingColors.filter(c => c.printingTypeId?._id === formData.printingTypeId || c.printingTypeId === formData.printingTypeId);
      setFilteredColors(filtered);
    } else {
      setFilteredColors([]);
    }
  }, [formData.printingTypeId, printingColors]);

  const validateField = (name, value) => {
    let msg = '';
    const fieldNames = { companyId: 'Company', brandId: 'Brand', bottleName: 'Bottle Name', printingTypeId: 'Printing Type' };
    if (!value) msg = `${fieldNames[name] || name} is mandatory`;
    setErrors(prev => ({ ...prev, [name]: msg }));
    return msg;
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    const msg = validateField(name, value);
    if (msg) Swal.fire({ icon: 'warning', title: 'Validation Warning', text: msg, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
  };

  const handleSelectChange = (field, value) => {
    if (field === 'companyId') {
      setFormData(prev => ({ ...prev, companyId: value, brandId: '' }));
    } else if (field === 'printingTypeId') {
      setFormData(prev => ({ ...prev, printingTypeId: value, printingColorId: '' }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'companyId') setFormData(prev => ({ ...prev, companyId: value, brandId: '' }));
    else if (name === 'printingTypeId') setFormData(prev => ({ ...prev, printingTypeId: value, printingColorId: '' }));
    else setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const companyError = validateField('companyId', formData.companyId);
    const brandError = validateField('brandId', formData.brandId);
    const nameError = validateField('bottleName', formData.bottleName);
    const typeError = validateField('printingTypeId', formData.printingTypeId);

    if (companyError || brandError || nameError || typeError) {
      return Swal.fire('Validation Error', 'Please fix errors before submitting.', 'error');
    }

    // Duplicate check: same brand + bottleName + printingType + printingColor (excluding self)
    const isDuplicate = bottleSpecs?.some(spec => {
      if (spec._id === id) return false;
      const matchBrand = (spec.brandId?._id || spec.brandId) === formData.brandId;
      const matchName = spec.bottleName?.trim().toLowerCase() === formData.bottleName?.trim().toLowerCase();
      const matchType = (spec.printingTypeId?._id || spec.printingTypeId) === formData.printingTypeId;
      const matchColor = (spec.printingColorId?._id || spec.printingColorId || '') === (formData.printingColorId || '');
      return matchBrand && matchName && matchType && matchColor;
    });

    if (isDuplicate) {
      const brandName = brands.find(b => b._id === formData.brandId)?.name || '';
      const typeName = printingTypes.find(t => t._id === formData.printingTypeId)?.name || '';
      const colorName = filteredColors.find(c => c._id === formData.printingColorId)?.name || '';
      return Swal.fire({
        icon: 'error',
        title: 'Duplicate Entry',
        html: `Bottle Spec <b>"${formData.bottleName}"</b><br/>
               with Printing Type <b>"${typeName}"</b>${colorName ? ` and Color <b>"${colorName}"</b>` : ''}<br/>
               already exists for brand <b>"${brandName}"</b>.<br/>
               <span class="text-muted small">Change the Printing Type or Printing Color.</span>`,
        confirmButtonColor: '#e91e63'
      });
    }

    dispatch(updateBottleSpec({ id, formData })).then((res) => {
      if (!res.error) {
        Swal.fire('Updated!', 'Bottle specification updated successfully!', 'success');
        navigate('/bottle-specs');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update spec.', 'error');
      }
    });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/bottle-specs" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit Bottle Specification</h1>
          <p className="page-subtitle">Update printing details for {formData.bottleName}</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="row g-4">
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Select Company <span className="text-danger">*</span></label>
                    <SearchableSelect
                      options={companies.filter(c => c.status || c._id === formData.companyId).map(c => ({ value: c._id, label: c.name }))}
                      value={formData.companyId}
                      onChange={(val) => handleSelectChange('companyId', val)}
                      placeholder="-- Choose Company --"
                      isInvalid={!!errors.companyId}
                    />
                    {errors.companyId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.companyId}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Select Brand <span className="text-danger">*</span></label>
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

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Printing Type <span className="text-danger">*</span></label>
                    <select className={`form-select custom-input-field ${errors.printingTypeId ? 'is-invalid' : ''}`} name="printingTypeId" required value={formData.printingTypeId} onChange={handleChange} onBlur={handleBlur} style={{ borderRadius: 12 }}>
                      <option value="">Select Printing Type</option>
                      {printingTypes.filter(t => t.status || t._id === formData.printingTypeId).map(t => (
                        <option key={t._id} value={t._id}>{t.name}</option>
                      ))}
                    </select>
                    {errors.printingTypeId && <div className="invalid-feedback">{errors.printingTypeId}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Printing Color</label>
                    <select className="form-select custom-input-field" name="printingColorId" disabled={!formData.printingTypeId} value={formData.printingColorId} onChange={handleChange} style={{ borderRadius: 12 }}>
                      <option value="">Select Color</option>
                      {filteredColors.filter(c => c.status || c._id === formData.printingColorId).map(c => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">Status</label>
                    <select className="form-select custom-input-field" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={{ borderRadius: 12 }}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="d-flex flex-column flex-md-row gap-2 mt-5 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Updating...</> : <><i className="bi bi-check2-circle me-2" /> Update Specification</>}
                  </button>
                  <button type="button" onClick={() => navigate('/bottle-specs')} className="btn-ghost px-5 py-3">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
