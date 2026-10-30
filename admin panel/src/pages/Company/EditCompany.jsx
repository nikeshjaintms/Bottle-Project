import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateCompany } from '../../redux/slices/companySlice';
import Swal from 'sweetalert2';

export default function EditCompany() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { companies, loading } = useSelector((state) => state.companies);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('active');
  const [isStockSupplier, setIsStockSupplier] = useState(false);
  const [error, setError] = useState('');

  const validateField = (value) => {
    let msg = '';
    if (!value || value.trim() === '') {
      msg = 'Company Name is mandatory';
    } else if (!/^[a-zA-Z\s]+$/.test(value)) {
      msg = 'Company Name should only contain characters';
    } else {
      const isDuplicate = companies.some(b => 
        b._id !== id && 
        b.name.toLowerCase().trim() === value.toLowerCase().trim()
      );
      if (isDuplicate) {
        msg = `Company "${value}" already exists`;
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
    const company = companies.find(b => b._id === id);
    if (company) {
      setName(company.name);
      setStatus(company.status === true ? 'active' : 'inactive');
      setIsStockSupplier(Boolean(company.isStockSupplier));
    }
  }, [id, companies]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const msg = validateField(name);
    if (msg) {
      return Swal.fire('Validation Error', msg, 'error');
    }

    dispatch(updateCompany({ id, formData: { name, status, isStockSupplier } })).then((res) => {
      if (!res.error) {
        Swal.fire('Updated!', 'company updated successfully!', 'success');
        navigate('/companies');
      } else {
        Swal.fire('Error!', res.payload || 'Failed to update company.', 'error');
      }
    });
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to="/companies" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit Company</h1>
          <p className="page-subtitle">Update company details</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-6">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="form-label fw-600 small text-uppercase text-muted">
                    company Name <span className="text-danger">*</span>
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

                <div className="mb-4 form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="isStockSupplierCheck"
                    checked={isStockSupplier}
                    onChange={(e) => setIsStockSupplier(e.target.checked)}
                  />
                  <label className="form-check-label fw-600 small text-muted" htmlFor="isStockSupplierCheck">
                    Stock supplier (stock only: used for Incoming and as a plain stock source; not selectable in Dispatch, Lacquer Plan or Printing Plan)
                  </label>
                </div>

                <div className="d-flex gap-2 mt-4 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating...</>
                    ) : (
                      <><i className="bi bi-check2-circle me-2" /> Update Company</>
                    )}
                  </button>
                  <button type="button" onClick={() => navigate('/companies')} className="btn-ghost px-5 py-3">
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
