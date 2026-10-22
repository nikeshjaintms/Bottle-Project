import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { createBottlePerBox } from '../../redux/slices/bottlePerBoxSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import CreatableSelect from 'react-select/creatable';
import Swal from 'sweetalert2';
import { derivePlainBottleName } from '../../utils/derivePlainBottleName';

export default function AddBottlePerBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.bottlePerBox);
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);

  useEffect(() => {
    dispatch(fetchBottleSpecs({ pagination: 'false' }));
  }, [dispatch]);

  const allRawBottleNames = useMemo(() => {
    return Array.from(new Set(
      (bottleSpecs || [])
        .map(s => s.BottlePerBox || s.bottleName)
        .filter(name => name && name.trim() !== '')
    ));
  }, [bottleSpecs]);

  const prefillName = location.state?.prefillName || '';

  const [formData, setFormData] = useState({
    plainBottleName: prefillName ? derivePlainBottleName(prefillName) : '',
    bottleNames: prefillName ? [{ value: prefillName, label: prefillName }] : [],
    bottlePerBox: '',
    boxWeight: '',
    status: 'active'
  });

  const uniqueBottleNames = useMemo(() => {
    const target = (formData.plainBottleName || '').trim().toLowerCase();

    const capMatch = target.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?/i);
    const numPart = capMatch ? capMatch[1] : '';
    const unitPart = capMatch && capMatch[2] ? capMatch[2] : 'ml';
    const volumePrefix = numPart ? `${numPart} ${unitPart}`.toLowerCase() : '';

    const list = [...allRawBottleNames];

    list.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      if (target) {
        // Priority 1: Exact target or starts with full target mold name
        const aExact = aLower === target || aLower.startsWith(target);
        const bExact = bLower === target || bLower.startsWith(target);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        // Priority 2: Contains target words
        const aContains = aLower.includes(target);
        const bContains = bLower.includes(target);
        if (aContains && !bContains) return -1;
        if (!aContains && bContains) return 1;

        // Priority 3: Matches volume prefix (e.g. "20 ml ")
        if (volumePrefix) {
          const aVol = aLower.startsWith(volumePrefix);
          const bVol = bLower.startsWith(volumePrefix);
          if (aVol && !bVol) return -1;
          if (!aVol && bVol) return 1;
        }

        // Priority 4: Starts with number (e.g. "20 ")
        if (numPart) {
          const aNum = aLower.startsWith(numPart);
          const bNum = bLower.startsWith(numPart);
          if (aNum && !bNum) return -1;
          if (!aNum && bNum) return 1;
        }
      }

      return a.localeCompare(b);
    });

    return list.map(name => ({ value: name, label: name }));
  }, [allRawBottleNames, formData.plainBottleName]);

  const [isPlainBottleManuallyEdited, setIsPlainBottleManuallyEdited] = useState(false);

  const [errors, setErrors] = useState({
    bottleNames: '',
    bottlePerBox: '',
    boxWeight: ''
  });

  const validateField = (name, value) => {
    let msg = '';
    if (name === 'bottleNames' && (!value || value.length === 0)) {
      msg = 'Please select at least one bottle';
    } else if (name !== 'bottleNames' && !value) {
      msg = name === 'boxWeight' ? 'Box Weight is mandatory' : 'Bottle per Box is mandatory';
    }
    setErrors(prev => ({ ...prev, [name]: msg }));
    return msg;
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    validateField(name, value);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const nameError = validateField('bottleNames', formData.bottleNames);
    const countError = validateField('bottlePerBox', formData.bottlePerBox);
    const weightError = validateField('boxWeight', formData.boxWeight);

    if (nameError || countError || weightError) {
      return Swal.fire('Validation Error', 'Please fill all required fields.', 'error');
    }

    const payload = {
      ...formData,
      bottleNames: formData.bottleNames.map(opt => opt.value)
    };

    dispatch(createBottlePerBox(payload)).then((res) => {
      if (!res.error) {
        Swal.fire('Created!', 'Bottle per Box configuration added successfully!', 'success');
        navigate('/bottle-per-box');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to create configuration.', 'error');
      }
    });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/bottle-per-box" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Add Configuration</h1>
          <p className="page-subtitle">Create a new Bottle per Box configuration</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="row g-4">
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Plain Bottle (Base Mold)
                    </label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      name="plainBottleName"
                      value={formData.plainBottleName || ''}
                      onChange={(e) => {
                        setIsPlainBottleManuallyEdited(true);
                        setFormData(prev => ({ ...prev, plainBottleName: e.target.value }));
                      }}
                      placeholder="Auto-derived base mold (editable)..."
                      style={{ borderRadius: 12, padding: '8px 12px' }}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Bottle Name(s) <span className="text-danger">*</span></label>
                    <CreatableSelect
                      isMulti
                      options={uniqueBottleNames}
                      value={formData.bottleNames}
                      onChange={(selected) => {
                        const newSelection = selected || [];
                        setFormData(prev => {
                          const updated = { ...prev, bottleNames: newSelection };
                          if (!isPlainBottleManuallyEdited && newSelection.length > 0) {
                            updated.plainBottleName = derivePlainBottleName(newSelection[0].value);
                          }
                          return updated;
                        });
                        if (errors.bottleNames) setErrors(prev => ({ ...prev, bottleNames: '' }));
                      }}
                      onBlur={() => validateField('bottleNames', formData.bottleNames)}
                      placeholder="Select bottle(s)..."
                      classNamePrefix="react-select"
                      className={errors.bottleNames ? 'is-invalid' : ''}
                    />
                    {errors.bottleNames && <div className="text-danger" style={{ fontSize: '0.875em', marginTop: 4 }}>{errors.bottleNames}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Bottle per Box <span className="text-danger">*</span></label>
                    <input
                      type="number"
                      className={`form-control custom-input-field ${errors.bottlePerBox ? 'is-invalid' : ''}`}
                      name="bottlePerBox"
                      value={formData.bottlePerBox}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="e.g. 24"
                      min="1"
                      style={{ borderRadius: 12, padding: '8px 12px' }}
                    />
                    {errors.bottlePerBox && <div className="invalid-feedback">{errors.bottlePerBox}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Box Weight <span className="text-danger">*</span></label>
                    <input
                      type="number"
                      className={`form-control custom-input-field ${errors.boxWeight ? 'is-invalid' : ''}`}
                      name="boxWeight"
                      value={formData.boxWeight}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="Enter box weight"
                      min="0"
                      step="any"
                      style={{ borderRadius: 12, padding: '8px 12px' }}
                    />
                    {errors.boxWeight && <div className="invalid-feedback">{errors.boxWeight}</div>}
                  </div>

                  <div className="col-md-12">
                    <label className="form-label fw-600 small text-uppercase text-muted">Status</label>
                    <select
                      className="form-select custom-input-field"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      style={{ borderRadius: 12 }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="d-flex flex-column flex-md-row gap-2 mt-5 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</> : <><i className="bi bi-check2-circle me-2" /> Save Configuration</>}
                  </button>
                  <button type="button" onClick={() => navigate('/bottle-per-box')} className="btn-ghost px-5 py-3">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
