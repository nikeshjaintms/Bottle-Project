import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchBrands } from '../../redux/slices/brandSlice';
import { fetchCompanies } from '../../redux/slices/companySlice';
import { fetchCoatingSpecs } from '../../redux/slices/coatingSpecSlice';
import { fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchCoatingProductions, updateCoatingProduction } from '../../redux/slices/coatingProductionSlice';
import { fetchOperators, createOperator } from '../../redux/slices/operatorSlice';
import { fetchShifts } from '../../redux/slices/shiftSlice';
import { fetchUnits } from '../../redux/slices/unitSlice';
import Swal from 'sweetalert2';
import SearchableSelect from '../../components/SearchableSelect';
import CreatableSelect from 'react-select/creatable';
import { V_URL } from '../../../Baseurl.js';
import { getUnitNumberByName } from '../../utils/unitMapper';

const getIsAdmin = (user) => {
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  return roleName?.toLowerCase() === 'admin';
};

export default function EditCoatingProduction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { companies } = useSelector((state) => state.companies);
  const { brands } = useSelector((state) => state.brands);
  const { coatingSpecs } = useSelector((state) => state.coatingSpecs);
  const { coatingProductions: productions, loading } = useSelector((state) => state.coatingProductions);
  const { items: bottlePerBoxes } = useSelector((state) => state.bottlePerBox);
  const { user: authUser } = useSelector((state) => state.auth);
  const { operators } = useSelector((state) => state.operators);
  const { shifts } = useSelector((state) => state.shifts);
  const { units } = useSelector((state) => state.units);

  const hasDateValidation = (user, permissionName) => {
    if (typeof user?.role === 'object' && Array.isArray(user.role.permissions)) {
      return user.role.permissions.some(p => (p.name || p) === permissionName);
    }
    return false;
  };
  const enforceValidation = hasDateValidation(authUser, 'coating-production-date-validation');

  const isAdmin = getIsAdmin(authUser);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const maxDate = tomorrow.toISOString().split('T')[0];
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const minDate = yesterday.toISOString().split('T')[0];

  const [isLocked, setIsLocked] = useState(false);

  const [formData, setFormData] = useState({
    unit: '',
    companyId: '',
    brandId: '',
    coatingSpecId: '',
    coatingShade: '',
    shift: '',
    operatorId: '',
    actualQuantity: '',
    rejectionQuantity: '',
    bottlePerBox: '',
    rejectionReason: '',
  });

  const [errors, setErrors] = useState({
    operatorId: '', shift: '', actualQuantity: '', bottlePerBox: ''
  });

  const [calc, setCalc] = useState({ totalActual: 0, total: 0, totalBoxes: 0, extraBottles: 0, rejectionPercentage: 0 });

  useEffect(() => {
    dispatch(fetchCompanies({ pagination: 'false' }));
    dispatch(fetchBrands({ pagination: 'false' }));
    dispatch(fetchCoatingSpecs({ pagination: 'false' }));
    dispatch(fetchCoatingProductions({ pagination: 'false' }));
    dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
    dispatch(fetchOperators({ pagination: 'false' }));
    dispatch(fetchShifts({ pagination: 'false' }));
    dispatch(fetchUnits({ limit: 1000 }));
  }, [dispatch]);

  useEffect(() => {
    const record = productions.find(p => p._id === id);
    if (record) {
      const recordDate = record.date ? new Date(record.date).toISOString().split('T')[0] : '';
      const brandObj = record.brandId;
      const companyId = brandObj?.companyId?._id || brandObj?.companyId || '';
      setFormData({
        unit: record.unit || '',
        companyId,
        brandId: brandObj?._id || record.brandId || '',
        coatingSpecId: record.coatingSpecId?._id || record.coatingSpecId || '',
        coatingShade: record.coatingShade || '',
        date: recordDate,
        shift: record.shift?._id || record.shift || '',
        operatorId: record.operatorId?._id || record.operatorId || '',
        actualQuantity: record.actualQuantity || '',
        rejectionQuantity: record.rejectionQuantity || '',
        bottlePerBox: record.bottlePerBox || '',
        rejectionReason: record.rejectionReason || '',
      });
      // If the permission is ON, the lock is ENABLED for old records.
      // If the permission is OFF, the lock is DISABLED (anyone can edit).
      const hasLockPermission = hasDateValidation(authUser, 'coating-production-record-unlock');
      if (hasLockPermission && recordDate && recordDate < minDate) {
        setIsLocked(true);
      } else {
        setIsLocked(false);
      }
    }
  }, [id, productions, isAdmin, minDate]);

  const rejectionReasonOptions = useMemo(() => {
    const reasons = productions
      .map(p => p.rejectionReason)
      .filter(r => r && r.trim() !== '');
    return [...new Set(reasons)].map(r => ({ value: r, label: r }));
  }, [productions]);

  // Brands filtered by selected company
  const availableBrands = brands.filter(b =>
    (b.status || b._id === formData.brandId) &&
    (b.companyId?._id === formData.companyId || b.companyId === formData.companyId)
  );

  const availableSpecs = coatingSpecs.filter(s => {
    const sBrandId = (s.brandId?._id || s.brandId)?.toString();
    const isBrandActive = s.brandId?.status !== false;
    return sBrandId === formData.brandId?.toString() && (s.status && isBrandActive || s._id === formData.coatingSpecId);
  });

  // Auto-populate shade from spec's coatingShade if not yet entered
  useEffect(() => {
    if (formData.coatingSpecId) {
      const spec = coatingSpecs.find(s => s._id === formData.coatingSpecId);
      if (spec && spec.coatingShade && !formData.coatingShade) {
        setFormData(prev => ({ ...prev, coatingShade: spec.coatingShade }));
      }
    }
  }, [formData.coatingSpecId, coatingSpecs, formData.coatingShade]);

  // Auto-populate shift based on selected operator
  useEffect(() => {
    if (formData.operatorId && operators.length > 0) {
      const fullOp = operators.find(o => o._id === formData.operatorId);
      if (fullOp && fullOp.shift) {
        const shiftId = typeof fullOp.shift === 'object' ? fullOp.shift._id : fullOp.shift;
        setFormData(prev => {
          if (prev.shift !== shiftId) {
            return { ...prev, shift: shiftId };
          }
          return prev;
        });
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
    let msg = '';
    const fieldNames = {
      unit: 'Unit', brandId: 'Brand', coatingSpecId: 'Coating Spec', coatingShade: 'Coating Shade',
      date: 'Production Date', operatorId: 'Operator Name', shift: 'Shift',
      actualQuantity: 'Actual Quantity', bottlePerBox: 'Bottles Per Box',
    };
    if (!value && name !== 'rejectionQuantity') {
      msg = `${fieldNames[name] || name} is mandatory`;
    } else if (['actualQuantity', 'rejectionQuantity'].includes(name) && /\s/.test(value.toString())) {
      msg = 'Whitespace is not allowed';
    }
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
    let cleanValue = value;
    if (['actualQuantity', 'rejectionQuantity'].includes(name)) cleanValue = value.replace(/\s/g, '');

    if (name === 'brandId') {
      setFormData({ ...formData, brandId: cleanValue, coatingSpecId: '', coatingShade: '' });
    } else {
      setFormData({ ...formData, [name]: cleanValue });
    }
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
    const brandError = validateField('brandId', formData.brandId);
    const specError = validateField('coatingSpecId', formData.coatingSpecId);
    const shadeError = validateField('coatingShade', formData.coatingShade);
    const dateError = validateField('date', formData.date);
    const opError = validateField('operatorId', formData.operatorId);
    const shiftError = validateField('shift', formData.shift);
    const printedError = validateField('actualQuantity', formData.actualQuantity);
    const bottleError = validateField('bottlePerBox', formData.bottlePerBox);

    const record = productions.find(p => p._id === id);
    const originalDate = record?.date ? new Date(record.date).toISOString().split('T')[0] : '';

    if (enforceValidation && formData.date !== originalDate) {
      if (formData.date < minDate || formData.date > maxDate) {
        return Swal.fire('Validation Error', 'Invalid date. You are only allowed to select Yesterday, Today, or Tomorrow.', 'error');
      }
    }

    if (brandError || specError || shadeError || dateError || opError || shiftError || printedError || bottleError) {
      return Swal.fire('Validation Error', 'Please fill all required fields.', 'error');
    }

    dispatch(updateCoatingProduction({ id, formData: {
      ...formData,
      totalActualCoatedBottle: calc.totalActual,
      totalBottleCoated: calc.total
    } })).then((res) => {
      if (!res.error) {
        Swal.fire('Updated!', 'Coating Production log updated successfully!', 'success');
        navigate(`/coating-productions/unit/${formData.unit}`);
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update log.', 'error');
      }
    });
  };

  const selectedSpec = coatingSpecs.find(s => s._id === formData.coatingSpecId);

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <button onClick={() => navigate(-1)} className="btn-ghost border-0" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </button>
        <div>
          <h1 className="page-title">Edit Coating Production Log</h1>
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

                    {/* Company (Read-only on edit) */}
                    <div className="col-md-6">
                      <label className="form-label fw-600 small text-uppercase text-muted">1. Company <span className="text-danger">*</span></label>
                      <SearchableSelect
                        options={companies.filter(c => c.status || c._id === formData.companyId).map(c => ({ value: c._id, label: c.name }))}
                        value={formData.companyId}
                        onChange={(val) => {
                          setFormData({ ...formData, companyId: val, brandId: '', coatingSpecId: '', coatingShade: '' });
                          if (errors.companyId) setErrors(prev => ({ ...prev, companyId: '' }));
                        }}
                        placeholder="-- Choose Company --"
                        isInvalid={!!errors.companyId}
                      />
                      {errors.companyId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.companyId}</div>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-600 small text-uppercase text-muted">2. Brand <span className="text-danger">*</span></label>
                      <SearchableSelect
                        options={availableBrands.map(b => ({ value: b._id, label: b.name }))}
                        value={formData.brandId}
                        onChange={(val) => {
                          setFormData({ ...formData, brandId: val, coatingSpecId: '', coatingShade: '' });
                          if (errors.brandId) setErrors(prev => ({ ...prev, brandId: '' }));
                        }}
                        placeholder="-- Choose Brand --"
                        disabled={!formData.companyId}
                        isInvalid={!!errors.brandId}
                      />
                      {errors.brandId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.brandId}</div>}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-600 small text-uppercase text-muted">3. Coating Spec <span className="text-danger">*</span></label>
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
                        placeholder="-- Choose Specification --"
                        disabled={!formData.brandId}
                        isInvalid={!!errors.coatingSpecId}
                      />
                      {errors.coatingSpecId && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.coatingSpecId}</div>}
                    </div>

                    {/* Coating Shade — directly beside Coating Spec */}
                    <div className="col-md-6">
                      <label className="form-label fw-600 small text-uppercase text-muted">Coating Shade</label>
                      <div className="form-control custom-input-field bg-light fw-bold text-dark d-flex align-items-center" style={{ borderRadius: 12, minHeight: 46 }}>
                        {formData.coatingSpecId ? (coatingSpecs.find(s => s._id === formData.coatingSpecId)?.coatingShade || 'N/A') : 'N/A'}
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
                      <label className="form-label fw-600 small text-uppercase text-muted">Operator Name <span className="text-danger">*</span></label>
                      <CreatableSelect
                        isClearable
                        options={operators
                          .filter(o => o.status || o._id === formData.operatorId)
                          .filter(o => validOperatorIds.length > 0 ? validOperatorIds.includes(o._id) || o._id === formData.operatorId : true)
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
                          setFormData({ ...formData, operatorId: newOperatorId, shift: newShift });
                          if (errors.operatorId) setErrors(prev => ({ ...prev, operatorId: '' }));
                          if (newShift && errors.shift) setErrors(prev => ({ ...prev, shift: '' }));
                        }}
                        onCreateOption={(inputValue) => {
                          dispatch(createOperator({ name: inputValue, status: true })).then((res) => {
                            if (!res.error) {
                              Swal.fire({ title: 'Success', text: 'Operator added successfully', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                              setFormData({ ...formData, operatorId: res.payload._id });
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
                      <label className="form-label fw-600 small text-uppercase text-muted">Shift <span className="text-danger">*</span></label>
                      <SearchableSelect
                        options={shifts.filter(s => s.status || s._id === formData.shift).map(s => ({ value: s._id, label: s.name }))}
                        value={formData.shift}
                        onChange={(val) => {
                          setFormData({ ...formData, shift: val });
                          if (errors.shift) setErrors(prev => ({ ...prev, shift: '' }));
                        }}
                        placeholder="-- Choose Shift --"
                        isInvalid={!!errors.shift}
                      />
                      {errors.shift && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.shift}</div>}
                    </div>


                    <div className="col-12"><hr className="my-4 opacity-50" /></div>

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">Production Date <span className="text-danger">*</span></label>
                      <input type="date" name="date" className={`form-control custom-input-field ${errors.date ? 'is-invalid' : ''}`} required {...(enforceValidation && { min: minDate, max: maxDate })} value={formData.date} onChange={handleChange} onBlur={handleBlur} style={{ borderRadius: 12 }} />
                      {errors.date && <div className="invalid-feedback">{errors.date}</div>}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">Actual Quantity <span className="text-danger">*</span></label>
                      <input type="number" name="actualQuantity" className={`form-control custom-input-field ${errors.actualQuantity ? 'is-invalid' : ''}`} required value={formData.actualQuantity} onChange={handleChange} onBlur={handleBlur} style={{ borderRadius: 12 }} />
                      {errors.actualQuantity && <div className="invalid-feedback">{errors.actualQuantity}</div>}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">Rejection Quantity</label>
                      <input type="number" name="rejectionQuantity" className={`form-control custom-input-field ${errors.rejectionQuantity ? 'is-invalid' : ''}`} value={formData.rejectionQuantity} onChange={handleChange} onBlur={handleBlur} style={{ borderRadius: 12 }} />
                      {errors.rejectionQuantity && <div className="invalid-feedback">{errors.rejectionQuantity}</div>}
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

                    <div className="col-md-4">
                      <label className="form-label fw-600 small text-uppercase text-muted">Bottles Per Box <span className="text-danger">*</span></label>
                      <input type="number" name="bottlePerBox" className="form-control custom-input-field" value={formData.bottlePerBox} onChange={handleChange} required style={{ borderRadius: 12 }} />
                    </div>

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

                  <div className="mt-4 p-4 rounded-4 bg-light d-flex justify-content-around text-center border">
                    <div>
                      <div className="text-muted small text-uppercase fw-bold mb-1">Total Actual</div>
                      <div className="h3 mb-0 text-success fw-bold">{calc.totalActual}</div>
                    </div>
                    <div style={{ width: 1, background: '#dee2e6' }} />
                    <div>
                      <div className="text-muted small text-uppercase fw-bold mb-1">Total Coated Bottle</div>
                      <div className="h3 mb-0 fw-bold text-accent">{calc.total}</div>
                    </div>
                  </div>

                  <div className="mt-4 p-4 rounded-4 bg-light d-flex justify-content-around text-center border">
                    <div>
                      <div className="text-muted small text-uppercase fw-bold mb-1">Total Boxes</div>
                      <div className="h3 mb-0 text-primary fw-bold">{calc.totalBoxes}</div>
                    </div>
                    <div style={{ width: 1, background: '#dee2e6' }} />
                    <div>
                      <div className="text-muted small text-uppercase fw-bold mb-1">Extra Coated Bottles</div>
                      <div className="h3 mb-0 text-success fw-bold">{calc.extraBottles}</div>
                    </div>
                  </div>
                </fieldset>

                <div className="d-flex gap-2 mt-5 user-form-actions">
                  {!isLocked && (
                    <button type="submit" formNoValidate className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                      {loading ? <><span className="spinner-border spinner-border-sm me-2" />Updating...</> : <><i className="bi bi-check2-circle me-2" /> Update Coating Production Log</>}
                    </button>
                  )}
                  <button type="button" onClick={() => navigate(-1)} className="btn-ghost px-5 py-3">
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

