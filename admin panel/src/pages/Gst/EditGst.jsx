import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { updateGst } from '../../redux/slices/gstSlice';
import API from '../../services/api';
import Swal from 'sweetalert2';

export default function EditGst() {
  const { id } = useParams();
  const [formData, setFormData] = useState({ gstNumber: '', status: true });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    API.get(`/gst/${id}`).then(res => {
      setFormData({
        gstNumber: res.data.gstNumber,
        status: res.data.status
      });
      setLoading(false);
    }).catch(err => {
      Swal.fire('Error', 'Failed to fetch GST entry', 'error');
      navigate('/gst');
    });
  }, [id, navigate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.gstNumber.trim() === '') {
      return Swal.fire('Error', 'GST Number is required', 'error');
    }
    
    dispatch(updateGst({
      id,
      formData: {
        gstNumber: formData.gstNumber.trim().toUpperCase(),
        status: formData.status
      }
    })).then(res => {
      if (!res.error) {
        Swal.fire('Success', 'GST entry updated successfully', 'success');
        navigate('/gst');
      } else {
        Swal.fire('Error', res.payload || 'Failed to update', 'error');
      }
    });
  };

  if (loading) return <div className="p-5 text-center">Loading...</div>;

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center mb-4">
        <Link to="/gst" className="btn-ghost shadow-sm me-3" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left fs-5" />
        </Link>
        <div>
          <h1 className="page-title mb-0">Edit GST Entry</h1>
          <p className="page-subtitle mb-0">Update GST registration number</p>
        </div>
      </div>
      <div className="dash-card border-0 shadow-sm p-4">
        <form onSubmit={handleSubmit}>
          <div className="row g-4">
            <div className="col-md-6">
              <label className="form-label fw-bold small">GST Number *</label>
              <input 
                type="text" 
                className="form-control shadow-none" 
                placeholder="e.g. 24AAUCS9498K1Z5" 
                value={formData.gstNumber}
                onChange={e => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-bold small">Status</label>
              <select 
                className="form-select shadow-none"
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value === 'true' })}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div className="col-12 mt-4">
              <button type="submit" className="btn-accent px-4 py-2" style={{ borderRadius: 8 }}>
                <i className="bi bi-check2-circle me-2" /> Update Entry
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
