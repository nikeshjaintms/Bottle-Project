import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import { fetchVariants } from '../../redux/slices/variantSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchProductions, updateProduction } from '../../redux/slices/productionSlice';
import Swal from 'sweetalert2';
import SearchableSelect from '../../components/SearchableSelect';

// Derive admin status from the logged-in user's role
const getIsAdmin = (user) => {
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  return roleName?.toLowerCase() === 'admin';
};

export default function EditProduction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { brands } = useSelector((state) => state.brands);
  const { bottleSpecs: specs } = useSelector((state) => state.bottleSpecs);
  const { variants } = useSelector((state) => state.variants);
  const { items: bottlePerBoxes } = useSelector((state) => state.bottlePerBox);
  const { productions, loading } = useSelector((state) => state.productions);
  const { user: authUser } = useSelector((state) => state.auth);

  const hasDateValidation = (user, permissionName) => {
    if (typeof user?.role === 'object' && Array.isArray(user.role.permissions)) {
      return user.role.permissions.some(p => (p.name || p) === permissionName);
    }
    return false;
  };
  const enforceValidation = hasDateValidation(authUser, 'production-date-validation');

  // Admins can edit any date; regular users are restricted to yesterday/today/tomorrow
  const isAdmin = getIsAdmin(authUser);

  // Calculate min and max dates (Yesterday, Today, Tomorrow) — only used for non-admins
  const today = new Date();
  
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const maxDate = tomorrow.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const minDate = yesterday.toISOString().split('T')[0];

  const [isLocked, setIsLocked] = useState(false);

  const [formData, setFormData] = useState({
    brandId: '',
    bottleSpecId: '',
    variantId: '',
    date: '',
    totalPrinted: '',
    bottlePerBox: 50,
  });

  const [errors, setErrors] = useState({
    brandId: '',
    bottleSpecId: '',
    variantId: '',
    date: '',
    totalPrinted: '',
    bottlePerBox: ''
  });

  const validateField = (name, value) => {
    let msg = '';
    const fieldNames = {
      brandId: 'Brand',
      bottleSpecId: 'Bottle Spec',
      variantId: 'Variant',
      date: 'Production Date',
      totalPrinted: 'Total Printed',
      bottlePerBox: 'Per Box'
    };

    if (!value) {
      msg = `${fieldNames[name] || name} is mandatory`;
    } else if (['totalPrinted', 'bottlePerBox'].includes(name) && /\s/.test(value.toString())) {
      msg = 'Whitespace is not allowed';
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    let cleanValue = value;

    if (['totalPrinted', 'bottlePerBox'].includes(name)) {
      cleanValue = value.replace(/\s/g, '');
    }

    if (name === 'brandId') {
      setFormData({ ...formData, brandId: cleanValue, bottleSpecId: '', variantId: '' });
    } else if (name === 'bottleSpecId') {
      setFormData({ ...formData, bottleSpecId: cleanValue, variantId: '' });
    } else {
      setFormData({ ...formData, [name]: cleanValue });
    }

    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const [calc, setCalc] = useState({ boxes: 0, rem: 0 });

  useEffect(() => {
    dispatch(fetchBrands({ pagination: 'false' }));
    dispatch(fetchBottleSpecs({ pagination: 'false' }));
    dispatch(fetchVariants({ pagination: 'false' }));
    dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
    dispatch(fetchProductions({ pagination: 'false' })); // ensure productions are loaded if navigated directly
  }, [dispatch]);

  useEffect(() => {
    const record = productions.find(p => p._id === id);
    if (record) {
      const recordDate = record.date ? new Date(record.date).toISOString().split('T')[0] : '';
      setFormData({
        brandId: record.brandId?._id || record.brandId || '',
        bottleSpecId: record.bottleSpecId?._id || record.bottleSpecId || '',
        variantId: record.variantId?._id || record.variantId || '',
        date: recordDate,
        totalPrinted: record.totalPrinted || '',
        bottlePerBox: record.bottlePerBox || 50,
      });
      // If the permission is ON, the lock is ENABLED for old records.
      // If the permission is OFF, the lock is DISABLED (anyone can edit).
      const hasLockPermission = hasDateValidation(authUser, 'production-record-unlock');
      if (hasLockPermission && recordDate && recordDate < minDate) {
        setIsLocked(true);
      } else {
        setIsLocked(false);
      }
    }
  }, [id, productions]);

  // Hierarchical Filtering Logic
  // brandId and bottleSpecId may be populated objects OR plain strings — normalize both sides
  const availableSpecs = specs.filter(s => {
    const sBrandId = (s.brandId?._id || s.brandId)?.toString();
    const isBrandActive = s.brandId?.status !== false;
    return sBrandId === formData.brandId?.toString() && (s.status && isBrandActive || s._id === formData.bottleSpecId);
  });

  const filteredVariants = variants.filter(v => {
    const vSpecId = (v.bottleSpecId?._id || v.bottleSpecId)?.toString();
    const isSpecActive = v.bottleSpecId?.status !== false;
    return vSpecId === formData.bottleSpecId?.toString() && (v.status && isSpecActive || v._id === formData.variantId);
  });

  useEffect(() => {
    const printed = parseInt(formData.totalPrinted) || 0;
    const perBox = parseInt(formData.bottlePerBox) || 1;
    setCalc({
      boxes: Math.floor(printed / perBox),
      rem: printed % perBox
    });
  }, [formData.totalPrinted, formData.bottlePerBox]);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate all mandatory fields
    const brandError = validateField('brandId', formData.brandId);
    const specError = validateField('bottleSpecId', formData.bottleSpecId);
    const varError = validateField('variantId', formData.variantId);
    const dateError = validateField('date', formData.date);
    const printedError = validateField('totalPrinted', formData.totalPrinted);
    const boxError = validateField('bottlePerBox', formData.bottlePerBox);

    if (brandError) return Swal.fire('Validation Error', brandError, 'error');
    if (specError) return Swal.fire('Validation Error', specError, 'error');
    if (varError) return Swal.fire('Validation Error', varError, 'error');
    if (dateError) return Swal.fire('Validation Error', dateError, 'error');
    if (printedError) return Swal.fire('Validation Error', printedError, 'error');
    if (boxError) return Swal.fire('Validation Error', boxError, 'error');

    dispatch(updateProduction({ id, formData })).then((res) => {
      if (!res.error) {
        Swal.fire('Updated!', 'Production log updated successfully!', 'success');
        navigate('/productions');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update log.', 'error');
      }
    });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/productions" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit Printing Production Log</h1>
          <p className="page-subtitle">Update details for the selected log</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-10">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              {isLocked && (
                <div className="alert alert-warning d-flex align-items-center mb-4" style={{ borderRadius: 12 }}>
                  <i className="bi bi-lock-fill me-3 fs-4" />
                  <div>
                    <h6 className="mb-1 fw-bold">Record Locked</h6>
                    <span className="small">This production record is older than yesterday and can no longer be edited.</span>
                  </div>
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <fieldset disabled={isLocked}>
                  <div className="row g-4">
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      1. Brand <span className="text-danger">*</span>
                    </label>
                    <SearchableSelect
                      options={brands.filter(b => b.status || b._id === formData.brandId).map(b => ({ value: b._id, label: b.name }))}
                      value={formData.brandId}
                      onChange={(val) => {
                        setFormData({ ...formData, brandId: val, bottleSpecId: '', variantId: '' });
                        if (errors.brandId) setErrors(prev => ({ ...prev, brandId: '' }));
                      }}
                      placeholder="-- Choose Brand --"
                      isInvalid={!!errors.brandId}
                    />
                    {errors.brandId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.brandId}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      2. Bottle Spec <span className="text-danger">*</span>
                    </label>
                    <SearchableSelect
                      options={availableSpecs.map(s => ({
                        value: s._id,
                        label: `${s.bottleName} — ${s.code} (${s.printingTypeId?.name || 'N/A'} / ${s.printingColorId?.name || 'No Color'})`
                      }))}
                      value={formData.bottleSpecId}
                      onChange={(val) => {
                        let newFormData = { ...formData, bottleSpecId: val, variantId: '' };
                        const spec = availableSpecs.find(s => s._id === val);
                        if (spec && spec.bottleName && bottlePerBoxes) {
                          const foundBox = bottlePerBoxes.find(b => b.bottleName === spec.bottleName);
                          if (foundBox && foundBox.bottlePerBox != null) {
                            newFormData.bottlePerBox = foundBox.bottlePerBox.toString();
                          }
                        }
                        setFormData(newFormData);
                        if (errors.bottleSpecId) setErrors(prev => ({ ...prev, bottleSpecId: '' }));
                        if (errors.bottlePerBox) setErrors(prev => ({ ...prev, bottlePerBox: '' }));
                      }}
                      placeholder="-- Choose Specification --"
                      disabled={!formData.brandId}
                      isInvalid={!!errors.bottleSpecId}
                    />
                    {errors.bottleSpecId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.bottleSpecId}</div>}
                  </div>

                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      3. Variant <span className="text-danger">*</span>
                    </label>
                    <SearchableSelect
                      options={filteredVariants.map(v => ({
                        value: v._id,
                        label: `${v.variantName} — ${v.variantSize || 'N/A'}`
                      }))}
                      value={formData.variantId}
                      onChange={(val) => {
                        setFormData({ ...formData, variantId: val });
                        if (errors.variantId) setErrors(prev => ({ ...prev, variantId: '' }));
                      }}
                      placeholder="-- Choose Variant --"
                      disabled={!formData.bottleSpecId}
                      isInvalid={!!errors.variantId}
                    />
                    {errors.variantId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.variantId}</div>}
                  </div>

                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Coating Shade
                    </label>
                    <div className="form-control custom-input-field bg-light text-center fw-bold text-dark d-flex align-items-center justify-content-center" style={{ borderRadius: 12 }}>
                      {formData.variantId ? (variants.find(v => v._id === formData.variantId)?.coatingShade || 'N/A') : 'N/A'}
                    </div>
                  </div>

                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Text Color
                    </label>
                    <div className="form-control custom-input-field bg-light text-center fw-bold text-dark d-flex align-items-center justify-content-center" style={{ borderRadius: 12 }}>
                      {formData.variantId ? (variants.find(v => v._id === formData.variantId)?.detectedTextColor || 'Not Detected') : 'N/A'}
                    </div>
                  </div>

                  <div className="col-12"><hr className="my-4 opacity-50" /></div>

                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Production Date <span className="text-danger">*</span>
                    </label>
                    <input
                      type="date"
                      name="date"
                      className={`form-control custom-input-field ${errors.date ? 'is-invalid' : ''}`}
                      required
                      {...(enforceValidation && { min: minDate, max: maxDate })}
                      value={formData.date}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      style={{ borderRadius: 12 }}
                    />
                    {errors.date && <div className="invalid-feedback">{errors.date}</div>}
                  </div>

                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Total Printed Bottles <span className="text-danger">*</span>
                    </label>
                    <input
                      type="number"
                      name="totalPrinted"
                      className={`form-control custom-input-field ${errors.totalPrinted ? 'is-invalid' : ''}`}
                      required
                      value={formData.totalPrinted}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      style={{ borderRadius: 12 }}
                    />
                    {errors.totalPrinted && <div className="invalid-feedback">{errors.totalPrinted}</div>}
                  </div>

                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Bottles Per Box <span className="text-danger">*</span>
                    </label>
                    <input
                      type="number"
                      name="bottlePerBox"
                      className={`form-control custom-input-field ${errors.bottlePerBox ? 'is-invalid' : ''}`}
                      required
                      value={formData.bottlePerBox}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      style={{ borderRadius: 12 }}
                    />
                    {errors.bottlePerBox && <div className="invalid-feedback">{errors.bottlePerBox}</div>}
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-4 bg-light d-flex justify-content-around text-center border">
                  <div>
                    <div className="text-muted small text-uppercase fw-bold mb-1">Total Boxes</div>
                    <div className="h3 mb-0 text-accent fw-bold">{calc.boxes}</div>
                  </div>
                  <div style={{ width: 1, background: '#dee2e6' }} />
                  <div>
                    <div className="text-muted small text-uppercase fw-bold mb-1">Extra Printed Bottles</div>
                    <div className={`h3 mb-0 fw-bold ${calc.rem > 0 ? 'text-danger' : 'text-success'}`}>{calc.rem}</div>
                  </div>
                </div>

                </fieldset>
                <div className="d-flex gap-2 mt-5 user-form-actions">
                  {!isLocked && (
                    <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                      {loading ? (
                        <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating...</>
                      ) : (
                        <><i className="bi bi-check2-circle me-2" /> Update Printing Production Log</>
                      )}
                    </button>
                  )}
                  <button type="button" onClick={() => navigate('/productions')} className="btn-ghost px-5 py-3">
                    {isLocked ? 'Back' : 'Cancel'}
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

