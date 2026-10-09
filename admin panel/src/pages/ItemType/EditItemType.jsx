import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { updateItemType, fetchItemTypeById } from '../../redux/slices/itemTypeSlice';
import Swal from 'sweetalert2';

export default function EditItemType() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentItemType, loading: storeLoading } = useSelector((state) => state.itemTypes);
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    status: true,
  });

  useEffect(() => {
    dispatch(fetchItemTypeById(id));
  }, [dispatch, id]);

  useEffect(() => {
    if (currentItemType) {
      setFormData({
        name: currentItemType.name || '',
        status: currentItemType.status ?? true,
      });
    }
  }, [currentItemType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      Swal.fire('Error', 'Name is required', 'error');
      return;
    }

    setLoading(true);
    try {
      await dispatch(updateItemType({ id, data: formData })).unwrap();
      Swal.fire('Success', 'Item Type updated successfully', 'success');
      navigate('/item-types');
    } catch (err) {
      Swal.fire('Error', err || 'Failed to update item type', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (storeLoading) {
    return (
      <div className="page-content d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header mb-4">
        <h1 className="page-title">Edit Item Type</h1>
        <p className="page-subtitle">Update item type details</p>
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
                {loading ? 'Saving...' : 'Update Item Type'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
