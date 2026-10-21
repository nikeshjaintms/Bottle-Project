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
  const [name, setName] = useState('');
  const [status, setStatus] = useState(true);
  const [optionsRows, setOptionsRows] = useState([{ name: '' }]);

  useEffect(() => {
    dispatch(fetchItemTypeById(id));
  }, [dispatch, id]);

  useEffect(() => {
    if (currentItemType) {
      setName(currentItemType.name || '');
      setStatus(currentItemType.status ?? true);
      setOptionsRows(
        currentItemType.options?.length 
          ? currentItemType.options.map(opt => ({ name: opt })) 
          : [{ name: '' }]
      );
    }
  }, [currentItemType]);

  const handleAddMore = () => {
    setOptionsRows([...optionsRows, { name: '' }]);
  };

  const handleRemoveRow = (index) => {
    if (optionsRows.length > 1) {
      const newRows = optionsRows.filter((_, i) => i !== index);
      setOptionsRows(newRows);
    }
  };

  const handleRowChange = (index, value) => {
    const newRows = [...optionsRows];
    newRows[index].name = value;
    setOptionsRows(newRows);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      Swal.fire('Error', 'Name is required', 'error');
      return;
    }

    const formattedOptions = optionsRows.map(row => row.name.trim()).filter(opt => opt !== '');

    setLoading(true);
    try {
      await dispatch(updateItemType({ id, data: { name, status, options: formattedOptions } })).unwrap();
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: 'Item Type updated successfully!',
        timer: 1500,
        showConfirmButton: false
      });
      navigate('/item-types');
    } catch (err) {
      Swal.fire('Error!', err || 'Failed to update item type.', 'error');
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
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header mb-4">
        <Link to="/item-types" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Edit Item Type</h1>
          <p className="page-subtitle">Update item type details</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-10">
          <div className="dash-card">
            <div className="dash-card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="row mb-4">
                  <div className="col-lg-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">
                      Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control custom-input-field"
                      placeholder="Enter item type name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      style={{ borderRadius: 12 }}
                    />
                  </div>
                  <div className="col-lg-6">
                    <label className="form-label fw-600 small text-uppercase text-muted">Status</label>
                    <select
                      className="form-select custom-input-field"
                      value={status ? 'active' : 'inactive'}
                      onChange={(e) => setStatus(e.target.value === 'active')}
                      style={{ borderRadius: 12 }}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <hr className="my-4 text-muted opacity-25" />

                <div className="mb-3">
                  <label className="form-label fw-600 small text-uppercase text-muted d-block">Options Definitions</label>
                  {optionsRows.map((row, index) => (
                    <div key={index} className="row g-3 mb-3 align-items-end">
                      <div className="col-md-10">
                        <label className="form-label small text-muted">Option Name</label>
                        <input
                          type="text"
                          className="form-control custom-input-field"
                          placeholder="e.g. 2 PC GP, 4 PC GP"
                          value={row.name}
                          onChange={(e) => handleRowChange(index, e.target.value)}
                          style={{ borderRadius: 12 }}
                        />
                      </div>
                      <div className="col-md-2">
                        {optionsRows.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => handleRemoveRow(index)} 
                            className="btn btn-outline-danger w-100 border-0 shadow-none"
                            style={{ height: '48px', borderRadius: 12 }}
                          >
                            <i className="bi bi-trash-fill" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mb-4">
                  <button 
                    type="button" 
                    onClick={handleAddMore} 
                    className="btn btn-outline-primary border-dashed w-100 py-3"
                    style={{ borderRadius: 12, borderStyle: 'dashed' }}
                  >
                    <i className="bi bi-plus-circle-fill me-2" /> Add More Option
                  </button>
                </div>

                <div className="d-flex gap-2 mt-5 user-form-actions">
                  <button type="submit" className="btn-accent px-5 py-3 flex-grow-1" disabled={loading}>
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...</>
                    ) : (
                      <><i className="bi bi-check2-circle me-2" /> Save & Back</>
                    )}
                  </button>

                  <button type="button" onClick={() => navigate('/item-types')} className="btn-ghost px-5 py-3">
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
