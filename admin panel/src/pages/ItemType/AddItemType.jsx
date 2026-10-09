import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { createItemType } from '../../redux/slices/itemTypeSlice';
import Swal from 'sweetalert2';

export default function AddItemType() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    status: true,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      Swal.fire('Error', 'Name is required', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await dispatch(createItemType(formData)).unwrap();
      Swal.fire('Success', 'Item Type created successfully', 'success');
      navigate('/item-types');
    } catch (err) {
      Swal.fire('Error', err || 'Failed to create item type', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header mb-4">
        <h1 className="page-title">Add Item Type</h1>
        <p className="page-subtitle">Create a new item type category</p>
      </div>

      <div className="dash-card">
        <div className="dash-card-header p-3 border-bottom">
          <h5 className="mb-0">Item Type Details</h5>
        </div>
        <div className="dash-card-body p-4">
          <form onSubmit={handleSubmit}>
            <div className="row mb-4">
              <div className="col-md-6">
                <label className="form-label fw-bold">Name <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter item type name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="col-md-6 d-flex align-items-center mt-md-4">
                <div className="form-check form-switch mt-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="statusSwitch"
                    checked={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  <label className="form-check-label fw-bold ms-2" htmlFor="statusSwitch" style={{ cursor: 'pointer' }}>
                    {formData.status ? 'Active' : 'Inactive'}
                  </label>
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
              <Link to="/item-types" className="btn btn-light px-4">Cancel</Link>
              <button type="submit" className="btn btn-primary px-4" disabled={loading}>
                {loading ? 'Saving...' : 'Save Item Type'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
