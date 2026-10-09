import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateUnit, fetchUnits } from '../../redux/slices/unitSlice';
import { fetchOperators } from '../../redux/slices/operatorSlice';
import Select from 'react-select';
import Swal from 'sweetalert2';

export default function EditUnit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { units, loading } = useSelector((state) => state.units);
  const { operators = [] } = useSelector((state) => state.operators);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('active');
  const [selectedOperators, setSelectedOperators] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (units.length === 0) {
      dispatch(fetchUnits({ pagination: 'false' }));
    }
    dispatch(fetchOperators({ pagination: 'false' }));
  }, [dispatch, units.length]);

  const validateField = (value) => {
    let msg = '';
    if (!value || value.trim() === '') {
      msg = 'Unit Name is mandatory';
    } else if (!/^[a-zA-Z0-9\s-]+$/.test(value)) {
      msg = 'Unit Name should only contain characters, numbers, or dashes';
    } else {
      const isDuplicate = units.some(b => 
        b._id !== id && 
        b.name.toLowerCase().trim() === value.toLowerCase().trim()
      );
      if (isDuplicate) {
        msg = `Unit "${value}" already exists`;
      }
    }
    setError(msg);
    return msg;
  };

  const handleBlur = () => {
    const msg = validateField(name);
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
    setName(e.target.value);
    if (error) setError('');
  };

  useEffect(() => {
    const unit = units.find(b => b._id === id);
    if (unit) {
      setName(unit.name);
      setStatus(unit.status === true ? 'active' : 'inactive');
      if (unit.operators && unit.operators.length > 0) {
        setSelectedOperators(
          unit.operators.map(op => ({
            value: op._id || op,
            label: op.name || operators.find(o => o._id === (op._id || op))?.name || 'Unknown'
          }))
        );
      }
    }
  }, [id, units, operators]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const msg = validateField(name);
    if (msg) {
      return Swal.fire('Validation Error', msg, 'error');
    }

    dispatch(updateUnit({ id, formData: { name, status, operators: selectedOperators.map(o => o.value) } })).then((res) => {
      if (!res.error) {
        Swal.fire('Updated!', 'unit updated successfully!', 'success');
        navigate('/units');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update unit.', 'error');
      }
    });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/units" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit Unit</h1>
          <p className="page-subtitle">Update unit details</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-6">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="form-label fw-600 small text-uppercase text-muted">
                    Unit Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control custom-input-field ${error ? 'is-invalid' : ''}`}
                    required
                    value={name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    style={{ borderRadius: 12 }}
                  />
                  {error && <div className="invalid-feedback">{error}</div>}
                </div>

                <div className="mb-4">
                  <label className="form-label fw-600 small text-uppercase text-muted">
                    Assign Operators
                  </label>
                  <Select
                    isMulti
                    options={operators.filter(o => o.status).map(o => ({ value: o._id, label: o.name }))}
                    value={selectedOperators}
                    onChange={setSelectedOperators}
                    placeholder="Select operators..."
                    classNamePrefix="react-select"
                  />
                </div>

                <div className="mb-4">
                  <label className="form-label fw-600 small text-uppercase text-muted">Status</label>
                  <select
                    className="form-select custom-input-field"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    style={{ borderRadius: 12 }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="d-flex gap-2 mt-4 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating...</>
                    ) : (
                      <><i className="bi bi-check2-circle me-2" /> Update Unit</>
                    )}
                  </button>
                  <button type="button" onClick={() => navigate('/units')} className="btn-ghost px-5 py-3">
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
