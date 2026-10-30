import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { updateVariant } from '../../redux/slices/variantSlice.js';
import Swal from 'sweetalert2';
import { V_URL } from '../../../Baseurl.js';

export default function VariantDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { variants } = useSelector((state) => state.variants);
  const [variant, setVariant] = useState(null);

  useEffect(() => {
    const found = variants.find(v => v._id === id);
    if (found) {
      setVariant(found);
    }
  }, [id, variants]);

  const toggleStatus = () => {
    const isActive = (variant.status === true || variant.status === 'active' || variant.status === undefined);
    const newStatus = !isActive;
    
    Swal.fire({
      title: `Mark as ${newStatus ? 'ACTIVE' : 'INACTIVE'}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: newStatus ? '#007236' : '#e91e63',
      confirmButtonText: `Yes, make ${newStatus ? 'ACTIVE' : 'INACTIVE'}`
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(updateVariant({ id: variant._id, formData: { status: newStatus } })).then((res) => {
          if (!res.error) {
            Swal.fire('Updated!', `Variant is now ${newStatus ? 'ACTIVE' : 'INACTIVE'}.`, 'success');
          } else {
            Swal.fire('Error!', res.payload || 'Failed to update status.', 'error');
          }
        });
      }
    });
  };

  if (!variant) return <div className="p-5">Loading...</div>;

  const isActive = (variant.status === true || variant.status === 'active' || variant.status === undefined);

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3">
        <Link to="/variants" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <h1 className="page-title">Variant Detailed</h1>
      </div>

      <div className="row mt-4">
        <div className="col-lg-4 mb-4">
          <div className="dash-card h-100">
            <div className="dash-card-body text-center d-flex flex-column align-items-center justify-content-center p-4">
              {variant.image ? (
                <img 
                  src={`${V_URL}${variant.image}`} 
                  alt={variant.variantName} 
                  className="img-fluid rounded-4 shadow-sm mb-3"
                  style={{ maxHeight: 250, objectFit: 'contain' }}
                />
              ) : (
                <div className="bg-light rounded-4 d-flex align-items-center justify-content-center mb-3" style={{ width: 150, height: 150 }}>
                  <i className="bi bi-image text-muted" style={{ fontSize: 40 }} />
                </div>
              )}

              <p className="text-muted mb-0">{variant.variantName}</p>
              
              <div className="mt-3 d-flex gap-2 justify-content-center">
                <span className={`badge-status badge-${isActive ? 'active' : 'inactive'}`}>
                  {isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
                <span className="badge bg-soft-info text-info px-3 py-2 border rounded-pill" style={{ fontSize: 12 }}>
                  {variant.variantSize || 'No Size'}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-lg-8 mb-4">
          <div className="dash-card h-100">
            <div className="dash-card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
              <h5 className="mb-0 fw-bold">Variant Information</h5>
              <div className="d-flex align-items-center gap-3">
                <div className="bg-light px-3 py-2 rounded-pill fw-bold d-flex align-items-center gap-2" style={{ fontSize: 13, color: '#333' }}>
                  <i className="bi bi-calendar-event"></i>
                  <span>Date: {variant.createdAt ? new Date(variant.createdAt).toLocaleDateString() : 'N/A'}</span>
                </div>
                <button 
                  onClick={toggleStatus}
                  className={`btn ${isActive ? 'btn-outline-danger' : 'btn-outline-success'} btn-sm px-4 py-2 fw-bold rounded-pill shadow-none`} 
                  style={{ fontSize: 12 }}
                >
                  {isActive ? 'MARK INACTIVE' : 'MARK ACTIVE'}
                </button>
              </div>
            </div>
            <div className="dash-card-body p-4">
              <div className="row g-4">
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Company Name</span>
                    <span className="fw-bold fs-6">{variant.bottleSpecId?.brandId?.companyId?.name || 'N/A'}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Brand Name</span>
                    <span className="fw-bold fs-6 text-accent">{variant.bottleSpecId?.brandId?.name || 'N/A'}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Bottle Spec</span>
                    <span className="fw-bold fs-6">{variant.bottleSpecId?.bottleName || 'N/A'}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Coating Shade</span>
                    <span className="fw-bold fs-6">{variant.coatingShade || 'N/A'}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Detected Text Color</span>
                    <span className="fw-bold fs-6 d-flex align-items-center gap-2">
                      <i className="bi bi-palette-fill text-muted" />
                      {variant.detectedTextColor || 'Not Detected'}
                    </span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Material Code</span>
                    <span className="fw-bold fs-6">{variant.materialCode || '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
