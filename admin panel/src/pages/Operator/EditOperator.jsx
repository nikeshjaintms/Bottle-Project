import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateOperator } from '../../redux/slices/operatorSlice';
import { fetchShifts } from '../../redux/slices/shiftSlice';
import Swal from 'sweetalert2';
import SearchableSelect from '../../components/SearchableSelect';

export default function EditOperator() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { operators, loading } = useSelector((state) => state.operators);
  const { shifts = [] } = useSelector((state) => state.shifts);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('active');
  const [shift, setShift] = useState('');
  const [error, setError] = useState('');

  const validateField = (value) => {
    let msg = '';
    if (!value || value.trim() === '') {
      msg = 'Operator Name is mandatory';
    } else if (!/^[a-zA-Z\s]+$/.test(value)) {
      msg = 'Operator Name should only contain characters';
    } else {
      const isDuplicate = operators.some(b => 
        b._id !== id && 
        b.name.toLowerCase().trim() === value.toLowerCase().trim()
      );
      if (isDuplicate) {
        msg = `Operator "${value}" already exists`;
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
    dispatch(fetchShifts({ pagination: 'false' }));
  }, [dispatch]);

  useEffect(() => {
    const operator = operators.find(b => b._id === id);
    if (operator) {
      setName(operator.name);
      setStatus(operator.status === true ? 'active' : 'inactive');
      setShift(operator.shift?._id || operator.shift || '');
    }
  }, [id, operators]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const msg = validateField(name);
    if (msg) {
      return Swal.fire('Validation Error', msg, 'error');
    }

    dispatch(updateOperator({ id, formData: { name, status, shift: shift || null } })).then((res) => {
      if (!res.error) {
        Swal.fire('Updated!', 'operator updated successfully!', 'success');
        navigate('/operators');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update operator.', 'error');
      }
    });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/operators" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit Operator</h1>
          <p className="page-subtitle">Update operator details</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-6">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="form-label fw-600 small text-uppercase text-muted">
                    operator Name <span className="text-danger">*</span>
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

                <div className="mb-4">
                  <label className="form-label fw-600 small text-uppercase text-muted">Shift</label>
                  <SearchableSelect
                    options={shifts.filter(s => s.status).map(s => ({ value: s._id, label: s.name }))}
                    value={shift}
                    onChange={(val) => setShift(val)}
                    placeholder="-- Choose Default Shift --"
                  />
                </div>

                <div className="d-flex gap-2 mt-4 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating...</>
                    ) : (
                      <><i className="bi bi-check2-circle me-2" /> Update Operator</>
                    )}
                  </button>
                  <button type="button" onClick={() => navigate('/operators')} className="btn-ghost px-5 py-3">
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
