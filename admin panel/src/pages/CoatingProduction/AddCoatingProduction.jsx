import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchCoatingSpecs } from '../../redux/slices/coatingSpecSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { createCoatingProduction, fetchCoatingProductions } from '../../redux/slices/coatingProductionSlice';
import { fetchOperators, createOperator } from '../../redux/slices/operatorSlice';
import { fetchShifts } from '../../redux/slices/shiftSlice';
import { fetchUnits } from '../../redux/slices/unitSlice';
import Swal from 'sweetalert2';
import SearchableSelect from '../../components/SearchableSelect';
import CreatableSelect from 'react-select/creatable';
import { V_URL } from '../../../Baseurl.js';
import { getUnitNumberByName } from '../../utils/unitMapper';

const hasDateValidation = (user, permissionName) => {
  if (typeof user?.role === 'object' && Array.isArray(user.role.permissions)) {
    return user.role.permissions.some(p => (p.name || p) === permissionName);
  }
  return false;
};

export default function AddCoatingProduction() {
  const { unit } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { user: authUser } = useSelector((state) => state.auth);
  const enforceValidation = hasDateValidation(authUser, 'coating-production-date-validation');

  const { companies } = useSelector((state) => state.companies);
  const { brands } = useSelector((state) => state.brands);
  const { coatingSpecs } = useSelector((state) => state.coatingSpecs);
  const { loading: saving, coatingProductions = [] } = useSelector((state) => state.coatingProductions);
  const { items: bottlePerBoxes } = useSelector((state) => state.bottlePerBox);
  const { operators } = useSelector((state) => state.operators);
  const { shifts } = useSelector((state) => state.shifts);
  const { units } = useSelector((state) => state.units);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const maxDate = tomorrow.toISOString().split('T')[0];
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const minDate = yesterday.toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    unit,
    companyId: '',
    brandId: '',
    coatingSpecId: '',
    coatingShade: '',
    date: new Date().toISOString().split('T')[0],
    shift: '',
    operatorId: '',
    actualQuantity: '',
    rejectionQuantity: '',
    bottlePerBox: '',
    rejectionReason: ''
  });

  const [errors, setErrors] = useState({
    companyId: '', brandId: '', coatingSpecId: '', coatingShade: '', date: '',
    operatorId: '', shift: '', actualQuantity: '', bottlePerBox: ''
  });

  const [calc, setCalc] = useState({ totalActual: 0, total: 0, totalBoxes: 0, extraBottles: 0, rejectionPercentage: 0 });

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchBrands({ pagination: 'false' }));
    dispatch(fetchCoatingSpecs({ pagination: 'false' }));
    dispatch(fetchOperators({ pagination: 'false' }));
    dispatch(fetchShifts({ pagination: 'false' }));
    dispatch(fetchUnits({ limit: 1000 }));
    dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
    dispatch(fetchCoatingProductions({ pagination: 'false' }));
  }, [dispatch]);

  const rejectionReasonOptions = useMemo(() => {
    const reasons = coatingProductions
      .map(p => p.rejectionReason)
      .filter(r => r && r.trim() !== '');
    return [...new Set(reasons)].map(r => ({ value: r, label: r }));
  }, [coatingProductions]);

  // Brands filtered by selected company
  const availableBrands = brands.filter(b =>
    b.status && (b.companyId?._id === formData.companyId || b.companyId === formData.companyId)
  );

  // Coating specs filtered by selected brand
  const availableSpecs = coatingSpecs.filter(s => {
    const sBrandId = (s.brandId?._id || s.brandId)?.toString();
    return sBrandId === formData.brandId?.toString() && s.status;
  });

  // Auto-populate coatingShade from selected spec's coatingShade field
  useEffect(() => {
    if (formData.coatingSpecId) {
      const spec = coatingSpecs.find(s => s._id === formData.coatingSpecId);
      if (spec && spec.coatingShade) {
        setFormData(prev => ({ ...prev, coatingShade: spec.coatingShade }));
      }
    }
  }, [formData.coatingSpecId, coatingSpecs]);

  useEffect(() => {
    if (formData.unit && units.length > 0 && operators.length > 0) {
      const activeUnits = (units || []).filter(u => u.status !== false && !u.isDeleted);
      const currentUnitObj = activeUnits.find(u => getUnitNumberByName(u.name) === Number(formData.unit));
      
      if (currentUnitObj && currentUnitObj.operators && currentUnitObj.operators.length > 0) {
        // Determine the latest operator (last in the array)
        const latestOpRaw = currentUnitObj.operators[currentUnitObj.operators.length - 1];
        const latestOpId = typeof latestOpRaw === 'object' ? latestOpRaw._id : latestOpRaw;
        
        setFormData(prev => ({
          ...prev,
          operatorId: latestOpId
        }));
      }
    }
  }, [formData.unit, units, operators]);

  // Auto-populate shift based on selected operator
  useEffect(() => {
    if (formData.operatorId && operators.length > 0) {
      const fullOp = operators.find(o => o._id === formData.operatorId);
      if (fullOp && fullOp.shift) {
        const shiftId = typeof fullOp.shift === 'object' ? fullOp.shift._id : fullOp.shift;
        setFormData(prev => ({ ...prev, shift: shiftId }));
      }
    }
  }, [formData.operatorId, operators]);

  useEffect(() => {
    const actual = parseInt(formData.actualQuantity) || 0;
    const rejected = parseInt(formData.rejectionQuantity) || 0;
    const bottlePerBox = parseInt(formData.bottlePerBox) || 0;
    const totalActual = actual;
    const totalCoated = actual + rejected;
    const totalBoxes = bottlePerBox > 0 ? Math.floor(totalActual / bottlePerBox) : 0;
    const extraBottles = bottlePerBox > 0 ? totalActual % bottlePerBox : 0;
    const rejectionPercentage = totalCoated > 0 ? ((rejected / totalCoated) * 100).toFixed(2) : 0;
    setCalc({ totalActual, total: totalCoated, totalBoxes, extraBottles, rejectionPercentage });
  }, [formData.actualQuantity, formData.rejectionQuantity, formData.bottlePerBox]);

  const validateField = (name, value) => {
    const fieldNames = {
      unit: 'Unit', companyId: 'Company', brandId: 'Brand', coatingSpecId: 'Coating Spec', coatingShade: 'Coating Shade',
      date: 'Production Date', operatorId: 'Operator Name', shift: 'Shift',
      actualQuantity: 'Actual Quantity', bottlePerBox: 'Bottle Per Box'
    };
    const msg = !value ? `${fieldNames[name] || name} is mandatory` : '';
    setErrors(prev => ({ ...prev, [name]: msg }));
    return msg;
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    const msg = validateField(name, value);
    if (msg) Swal.fire({ icon: 'warning', title: 'Validation Warning', text: msg, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let cleanValue = ['actualQuantity', 'rejectionQuantity'].includes(name) ? value.replace(/\s/g, '') : value;
    setFormData(prev => ({ ...prev, [name]: cleanValue }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const activeUnits = (units || []).filter(u => u.status !== false && !u.isDeleted);
  const currentUnitObj = activeUnits.find(u => getUnitNumberByName(u.name) === Number(formData.unit));
  
  let validOperatorIds = [];
  if (currentUnitObj) {
    if (currentUnitObj.operators && currentUnitObj.operators.length > 0) {
      validOperatorIds = currentUnitObj.operators.map(op => typeof op === 'object' ? op._id : op);
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    const companyError = validateField('companyId', formData.companyId);
    const brandError = validateField('brandId', formData.brandId);
    const specError = validateField('coatingSpecId', formData.coatingSpecId);
    const shadeError = validateField('coatingShade', formData.coatingShade);
    const dateError = validateField('date', formData.date);
    const opError = validateField('operatorId', formData.operatorId);
    const shiftError = validateField('shift', formData.shift);
    const qtyError = validateField('actualQuantity', formData.actualQuantity);
    const boxError = validateField('bottlePerBox', formData.bottlePerBox);

    if (companyError || brandError || specError || shadeError || dateError || opError || shiftError || qtyError || boxError) {
      return Swal.fire('Validation Error', 'Please fill all required fields.', 'error');
    }

    dispatch(createCoatingProduction({
      ...formData,
      totalActualCoatedBottle: calc.totalActual,
      totalBottleCoated: calc.total
    })).then((res) => {
      if (!res.error) {
        Swal.fire('Success!', `Coating Production log saved!`, 'success');
        navigate(`/coating-productions/unit/${unit}`);
      } else {
        Swal.fire('Error!', res.payload || 'Failed to save log.', 'error');
      }
    });
  };

  const selectedSpec = coatingSpecs.find(s => s._id === formData.coatingSpecId);

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between productions-add-header user-form-page-header">
        <div className="d-flex align-items-center gap-3">
          <Link to={`/coating-productions/unit/${unit}`} className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
          </Link>
          <div>
            <h1 className="page-title">Add Coating Production — Unit {unit}</h1>
            <p className="page-subtitle">Log new coating production details</p>
          </div>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-10">
          <div className="dash-card border-0 shadow-sm" style={{ borderRadius: 24 }}>
            <div className="dash-card-body p-4 p-md-5">
              <form onSubmit={handleSubmit}>
                <div className="row g-4">

                  {/* Company */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      1. Company <span className="text-danger">*</span>
                    </label>
                    <SearchableSelect
                      options={companies.filter(c => c.status).map(c => ({ value: c._id, label: c.name }))}
                      value={formData.companyId}
                      onChange={(val) => {
                        setFormData(prev => ({ ...prev, companyId: val, brandId: '', coatingSpecId: '', coatingShade: '' }));
                        if (errors.companyId) setErrors(prev => ({ ...prev, companyId: '' }));
                      }}
                      placeholder="-- Choose Company --"
                      isInvalid={!!errors.companyId}
                    />
                    {errors.companyId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.companyId}</div>}
                  </div>

                  {/* Brand */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      2. Brand <span className="text-danger">*</span>
                    </label>
                    <SearchableSelect
                      options={availableBrands.map(b => ({ value: b._id, label: b.name }))}
                      value={formData.brandId}
                      onChange={(val) => {
                        setFormData(prev => ({ ...prev, brandId: val, coatingSpecId: '', coatingShade: '' }));
                        if (errors.brandId) setErrors(prev => ({ ...prev, brandId: '' }));
                      }}
                      placeholder="-- Choose Brand --"
                      disabled={!formData.companyId}
                      isInvalid={!!errors.brandId}
                    />
                    {errors.brandId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.brandId}</div>}
                  </div>

                  {/* Coating Spec */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      3. Coating Spec <span className="text-danger">*</span>
                    </label>
                    <SearchableSelect
                      options={availableSpecs.map(s => ({
                        value: s._id,
                        label: `${s.bottleName}${s.variantId ? ` - ${s.variantId.variantName}${s.variantId.variantSize ? ' ' + s.variantId.variantSize : ''}` : ''}`
                      }))}
                      value={formData.coatingSpecId}
                      onChange={(val) => {
                        let newFormData = { ...formData, coatingSpecId: val };
                        const spec = availableSpecs.find(s => s._id === val);
                        if (spec && spec.bottleName && bottlePerBoxes) {
                          const foundBox = bottlePerBoxes.find(b => b.bottleName === spec.bottleName);
                          if (foundBox && foundBox.bottlePerBox != null) {
                            newFormData.bottlePerBox = foundBox.bottlePerBox.toString();
                          }
                        }
                        setFormData(newFormData);
                        if (errors.coatingSpecId) setErrors(prev => ({ ...prev, coatingSpecId: '' }));
                        if (errors.bottlePerBox) setErrors(prev => ({ ...prev, bottlePerBox: '' }));
                      }}
                      placeholder="-- Choose Coating Spec --"
                      disabled={!formData.brandId}
                      isInvalid={!!errors.coatingSpecId}
                    />
                    {errors.coatingSpecId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.coatingSpecId}</div>}
                  </div>

                  {/* Coating Shade */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Coating Shade
                    </label>
                    <div className="form-control custom-input-field bg-light fw-bold text-dark d-flex align-items-center" style={{ borderRadius: 12, minHeight: 46 }}>
                      {selectedSpec?.coatingShade || 'N/A'}
                    </div>
                  </div>

                  {/* Variant Display */}
                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Variant Details
                    </label>
                    <div className="form-control custom-input-field bg-light d-flex align-items-center gap-3 p-2" style={{ borderRadius: 12, minHeight: 60 }}>
                      {selectedSpec?.variantId ? (
                        <>
                          {selectedSpec.variantId.image && (
                            <img 
                              src={`${V_URL}${selectedSpec.variantId.image}`} 
                              alt="Variant" 
                              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} 
                            />
                          )}
                          <div>
                            <div className="fw-bold text-dark">
                              {selectedSpec.variantId.variantName} - {selectedSpec.variantId.variantSize}
                            </div>
                          </div>
                        </>
                      ) : (
                        <span className="text-muted fw-bold ps-2">N/A</span>
                      )}
                    </div>
                  </div>

                  {/* Operator Name — directly below Coating Spec */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Operator Name <span className="text-danger">*</span>
                    </label>
                    <CreatableSelect
                      isClearable
                      options={operators
                        .filter(o => o.status)
                        .filter(o => validOperatorIds.length > 0 ? validOperatorIds.includes(o._id) : true)
                        .map(o => ({ value: o._id, label: o.name }))}
                      value={
                        formData.operatorId
                          ? { value: formData.operatorId, label: operators.find(o => o._id === formData.operatorId)?.name || '' }
                          : null
                      }
                      onChange={(selected) => {
                        const newOperatorId = selected ? selected.value : '';
                        let newShift = formData.shift;
                        if (newOperatorId) {
                          const op = operators.find(o => o._id === newOperatorId);
                          if (op && op.shift) {
                            newShift = op.shift._id || op.shift;
                          }
                        }
                        setFormData(prev => ({ ...prev, operatorId: newOperatorId, shift: newShift }));
                        if (errors.operatorId) setErrors(prev => ({ ...prev, operatorId: '' }));
                        if (newShift && errors.shift) setErrors(prev => ({ ...prev, shift: '' }));
                      }}
                      onCreateOption={(inputValue) => {
                        dispatch(createOperator({ name: inputValue, status: true })).then((res) => {
                          if (!res.error) {
                            Swal.fire({ title: 'Success', text: 'Operator added successfully', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                            setFormData(prev => ({ ...prev, operatorId: res.payload._id }));
                            if (errors.operatorId) setErrors(prev => ({ ...prev, operatorId: '' }));
                          } else {
                            Swal.fire('Error', res.payload || 'Failed to add operator', 'error');
                          }
                        });
                      }}
                      placeholder="Select or type operator name..."
                      styles={{
                        control: (base, state) => ({
                          ...base,
                          borderRadius: '12px',
                          borderColor: errors.operatorId ? '#dc3545' : (state.isFocused ? '#86b7fe' : '#dee2e6'),
                          boxShadow: state.isFocused ? (errors.operatorId ? '0 0 0 0.25rem rgba(220, 53, 69, 0.25)' : '0 0 0 0.25rem rgba(13, 110, 253, 0.25)') : 'none',
                          padding: '2px',
                          '&:hover': {
                            borderColor: errors.operatorId ? '#dc3545' : (state.isFocused ? '#86b7fe' : '#dee2e6')
                          }
                        })
                      }}
                    />
                    {errors.operatorId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.operatorId}</div>}
                  </div>

                  {/* Shift — directly below Coating Shade */}
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Shift <span className="text-danger">*</span>
                    </label>
                    <SearchableSelect
                      options={shifts.filter(s => s.status).map(s => ({ value: s._id, label: s.name }))}
                      value={formData.shift}
                      onChange={(val) => {
                        setFormData(prev => ({ ...prev, shift: val }));
                        if (errors.shift) setErrors(prev => ({ ...prev, shift: '' }));
                      }}
                      placeholder="-- Choose Shift --"
                      isInvalid={!!errors.shift}
                    />
                    {errors.shift && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.shift}</div>}
                  </div>


                  <div className="col-12"><hr className="my-4 opacity-50" /></div>

                  {/* Date */}
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

                  {/* Actual Quantity */}
                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Actual Quantity <span className="text-danger">*</span>
                    </label>
                    <input
                      type="number"
                      name="actualQuantity"
                      className={`form-control custom-input-field ${errors.actualQuantity ? 'is-invalid' : ''}`}
                      required
                      value={formData.actualQuantity}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      style={{ borderRadius: 12 }}
                    />
                    {errors.actualQuantity && <div className="invalid-feedback">{errors.actualQuantity}</div>}
                  </div>

                  {/* Rejection Quantity */}
                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">Rejection Quantity</label>
                    <input type="number" name="rejectionQuantity" className="form-control custom-input-field" value={formData.rejectionQuantity} onChange={handleChange} style={{ borderRadius: 12 }} />
                  </div>

                  {/* Rejection Percentage — auto-calculated, read-only */}
                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">Rejection %</label>
                    <div className="input-group">
                      <input
                        type="text"
                        className="form-control custom-input-field bg-light"
                        value={calc.rejectionPercentage}
                        readOnly
                        style={{ borderRadius: '12px 0 0 12px' }}
                      />
                      <span className="input-group-text bg-light fw-bold text-muted" style={{ borderRadius: '0 12px 12px 0', border: '1px solid var(--card-border)' }}>%</span>
                    </div>
                  </div>

                  {/* Bottle Per Box */}
                  <div className="col-md-4">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Bottle Per Box <span className="text-danger">*</span>
                    </label>
                    <input type="number" name="bottlePerBox" className="form-control custom-input-field" value={formData.bottlePerBox} onChange={handleChange} required style={{ borderRadius: 12 }} />
                  </div>

                  {/* Rejection Reason */}
                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">Rejection Reason</label>
                    <CreatableSelect
                      isClearable
                      options={rejectionReasonOptions}
                      value={formData.rejectionReason ? { value: formData.rejectionReason, label: formData.rejectionReason } : null}
                      onChange={(selected) => {
                        setFormData(prev => ({ ...prev, rejectionReason: selected ? selected.value : '' }));
                      }}
                      onCreateOption={(inputValue) => {
                        setFormData(prev => ({ ...prev, rejectionReason: inputValue }));
                      }}
                      placeholder="Select or type rejection reason..."
                      styles={{
                        control: (base, state) => ({
                          ...base,
                          borderRadius: '12px',
                          padding: '2px',
                          minHeight: '86px',
                          alignItems: 'flex-start',
                          borderColor: state.isFocused ? '#86b7fe' : '#dee2e6',
                          boxShadow: state.isFocused ? '0 0 0 0.25rem rgba(13, 110, 253, 0.25)' : 'none',
                        }),
                        valueContainer: (base) => ({
                          ...base,
                          alignItems: 'flex-start',
                          paddingTop: '8px'
                        }),
                        indicatorsContainer: (base) => ({
                          ...base,
                          alignItems: 'flex-start',
                          paddingTop: '4px'
                        })
                      }}
                    />
                  </div>
                </div>

                {/* Calculated Summary */}
                <div className="mt-5 p-4 rounded-4 d-flex justify-content-around text-center" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div className="text-muted small text-uppercase fw-bold mb-1">Total Actual</div>
                    <div className="h2 mb-0 text-success fw-bold">{calc.totalActual}</div>
                  </div>
                  <div style={{ width: 1, background: '#cbd5e1' }} />
                  <div>
                    <div className="text-muted small text-uppercase fw-bold mb-1">Total Coated</div>
                    <div className="h2 mb-0 fw-bold text-accent">{calc.total}</div>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-4 d-flex justify-content-around text-center" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div className="text-muted small text-uppercase fw-bold mb-1">Total Boxes</div>
                    <div className="h2 mb-0 fw-bold text-primary">{calc.totalBoxes}</div>
                  </div>
                  <div style={{ width: 1, background: '#cbd5e1' }} />
                  <div>
                    <div className="text-muted small text-uppercase fw-bold mb-1">Extra Bottles</div>
                    <div className="h2 mb-0 fw-bold text-success">{calc.extraBottles}</div>
                  </div>
                </div>

                <div className="d-flex gap-3 mt-5 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1 rounded-4 shadow-sm" disabled={saving}>
                    {saving ? <><span className="spinner-border spinner-border-sm me-2" /> Saving...</> : <><i className="bi bi-check2-circle me-2" /> Save Entry</>}
                  </button>
                  <button type="button" onClick={() => navigate(`/coating-productions/unit/${unit}`)} className="btn-ghost px-5 py-3 rounded-4">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

