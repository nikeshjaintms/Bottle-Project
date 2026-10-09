import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateBottlePerBox, fetchBottlePerBoxes } from '../../redux/slices/bottlePerBoxSlice';
import { fetchBottleSpecs } from '../../redux/slices/bottleSpecSlice';
import CreatableSelect from 'react-select/creatable';
import Swal from 'sweetalert2';
export default function EditBottlePerBox() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { items, loading } = useSelector((state) => state.bottlePerBox);
  const { bottleSpecs } = useSelector((state) => state.bottleSpecs);

  useEffect(() => {
    dispatch(fetchBottlePerBoxes({ pagination: 'false' }));
    dispatch(fetchBottleSpecs({ pagination: 'false' }));
  }, [dispatch]);

  const uniqueBottleNames = useMemo(() => {
    return Array.from(new Set(
      (bottleSpecs || [])
        .map(s => s.BottlePerBox || s.bottleName)
        .filter(name => name && name.trim() !== '')
    )).map(name => ({ value: name, label: name }));
  }, [bottleSpecs]);

  const [formData, setFormData] = useState({
    bottleNames: [],
    bottlePerBox: '',
    status: 'active'
  });

  const [errors, setErrors] = useState({
    bottleNames: '',
    bottlePerBox: ''
  });

  useEffect(() => {
    const record = items.find(s => s._id === id);
    if (record) {
      setFormData({
        bottleNames: [{ value: record.bottleName, label: record.bottleName }],
        bottlePerBox: record.bottlePerBox || '',
        status: record.status === true ? 'active' : 'inactive'
      });
    }
  }, [id, items]);

  const validateField = (name, value) => {
    let msg = '';
    if (name === 'bottleNames' && (!value || value.length === 0)) {
      msg = 'Please select at least one bottle';
    } else if (name !== 'bottleNames' && !value) {
      msg = 'Bottle per Box is mandatory';
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

    if (nameError || countError) {
      return Swal.fire('Validation Error', 'Please fill all required fields.', 'error');
    }

    const payload = {
      ...formData,
      bottleNames: formData.bottleNames.map(opt => opt.value)
    };

    dispatch(updateBottlePerBox({ id, formData: payload })).then((res) => {
      if (!res.error) {
        Swal.fire('Updated!', 'Bottle per Box configuration updated successfully!', 'success');
        navigate('/bottle-per-box');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update configuration.', 'error');
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
          <h1 className="page-title">Edit Configuration</h1>
          <p className="page-subtitle">Update configuration</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="row g-4">
                  <div className="col-md-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Bottle Name(s) <span className="text-danger">*</span></label>
                    <CreatableSelect
                      isMulti
                      options={uniqueBottleNames}
                      value={formData.bottleNames}
                      onChange={(selected) => {
                        setFormData(prev => ({ ...prev, bottleNames: selected || [] }));
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
                    {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Updating...</> : <><i className="bi bi-check2-circle me-2" /> Update Configuration</>}
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
