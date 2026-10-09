import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProductions } from '../../redux/slices/productionSlice.js';
import { fetchVariants } from '../../redux/slices/variantSlice.js';
import { V_URL } from '../../../Baseurl.js';

const parseProductionDate = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return new Date(dateStr);
  return new Date(y, m - 1, d);
};

export default function ProductionDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { productions, loading } = useSelector((state) => state.productions);
  const { variants } = useSelector((state) => state.variants);
  const [production, setProduction] = useState(null);

  useEffect(() => {
    dispatch(fetchProductions({ pagination: 'false' }));
    dispatch(fetchVariants({ pagination: 'false' }));
  }, [dispatch]);

  useEffect(() => {
    const found = productions.find(p => p._id === id);
    if (found) {
      setProduction(found);
    }
  }, [id, productions]);

  if (loading || !production) return <div className="p-5 text-center">Loading...</div>;

  const variantId = production.variantId?._id || production.variantId;
  const variant = production.variantId || variants.find(v => v._id === variantId) || {};
  
  const variantImage = variant.image;
  const prodDate = parseProductionDate(production.date)?.toLocaleDateString() || 'N/A';

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3">
        <Link to="/productions" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Production Detailed</h1>
          <p className="page-subtitle">Viewing production log details</p>
        </div>
      </div>

      <div className="row mt-4">
        {/* Left Column - Variant Image & Info */}
        <div className="col-lg-4 mb-4">
          <div className="dash-card h-100 border-0 shadow-sm">
            <div className="dash-card-body text-center d-flex flex-column align-items-center p-4">
              <h5 className="fw-bold mb-4">Variant Image</h5>
              
              {variantImage ? (
                <img 
                  src={`${V_URL}${variantImage}`} 
                  alt={variant.variantName || 'Bottle'} 
                  className="img-fluid rounded-4 shadow-sm mb-3"
                  style={{ maxHeight: 250, objectFit: 'contain' }}
                />
              ) : (
                <div className="bg-light rounded-4 d-flex align-items-center justify-content-center mb-3 w-100" style={{ height: 200 }}>
                  <i className="bi bi-image text-muted" style={{ fontSize: 40 }} />
                </div>
              )}

              <h6 className="fw-bold text-dark mt-3">{variant.variantName || 'N/A'}</h6>
              
              <div className="mt-3 d-flex flex-wrap gap-2 justify-content-center">
                {variant.variantSize && (
                  <span className="badge bg-soft-info text-info px-3 py-2 border rounded-pill" style={{ fontSize: 12 }}>
                    Size: {variant.variantSize}
                  </span>
                )}
                {variant.coatingShade && (
                  <span className="badge bg-soft-warning text-warning-accent px-3 py-2 border rounded-pill" style={{ fontSize: 12 }}>
                    Coating: {variant.coatingShade}
                  </span>
                )}
                {variant.detectedTextColor && (
                  <span className="badge bg-light text-dark px-3 py-2 border rounded-pill" style={{ fontSize: 12 }}>
                    Text Color: {variant.detectedTextColor}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Column - Production & Specification Details */}
        <div className="col-lg-8 mb-4">
          <div className="dash-card h-100 border-0 shadow-sm">
            <div className="dash-card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
              <h5 className="mb-0 fw-bold">Production Information</h5>
              <div className="fw-bold text-accent px-3 py-1 bg-light rounded-pill">
                <i className="bi bi-calendar-event me-2"></i> Date: {prodDate}
              </div>
            </div>
            
            <div className="dash-card-body p-4">
              <h6 className="fw-bold text-muted text-uppercase small mb-3">Hierarchy Details</h6>
              <div className="row g-4 mb-4">
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Company</span>
                    <span className="fw-bold fs-6">{production.brandId?.companyId?.name || production.bottleSpecId?.brandId?.companyId?.name || 'N/A'}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Brand</span>
                    <span className="fw-bold fs-6 text-accent">{production.brandId?.name || production.bottleSpecId?.brandId?.name || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <h6 className="fw-bold text-muted text-uppercase small mb-3">Specification Details</h6>
              <div className="row g-4 mb-4">
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Bottle Spec Name</span>
                    <span className="fw-bold fs-6">{production.bottleSpecId?.bottlePerBox || 'N/A'}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Printing Configuration</span>
                    <div className="fw-bold fs-6">
                      Type: <span className="text-dark fw-normal">{production.bottleSpecId?.printingTypeId?.name || 'N/A'}</span><br/>
                      Color: <span className="text-dark fw-normal">{production.bottleSpecId?.printingColorId?.name || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <h6 className="fw-bold text-muted text-uppercase small mb-3">Production Quantities</h6>
              <div className="row g-4">
                <div className="col-md-4">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Total Printed</span>
                    <span className="fw-bold fs-4 text-dark">{production.totalPrinted || 0}</span>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Bottles Per Box</span>
                    <span className="fw-bold fs-4 text-dark">{production.bottlePerBox || 0}</span>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Resulting Boxes</span>
                    <span className="fw-bold fs-4 text-primary">{production.totalBoxes || 0}</span>
                    {production.remainingBottles > 0 && (
                      <span className="d-block text-danger small mt-1 fw-bold">
                        +{production.remainingBottles} extra bottles
                      </span>
                    )}
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

