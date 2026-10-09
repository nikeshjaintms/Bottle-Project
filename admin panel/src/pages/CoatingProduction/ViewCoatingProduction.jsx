import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchCoatingProductions } from '../../redux/slices/coatingProductionSlice.js';
import { fetchCoatingSpecs } from '../../redux/slices/coatingSpecSlice.js';
import { V_URL } from '../../../Baseurl.js';

const parseProductionDate = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return new Date(dateStr);
  return new Date(y, m - 1, d);
};

export default function ViewCoatingProduction() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { coatingProductions, loading } = useSelector((state) => state.coatingProductions);
  const { coatingSpecs } = useSelector((state) => state.coatingSpecs);
  const [production, setProduction] = useState(null);

  useEffect(() => {
    dispatch(fetchCoatingProductions({ pagination: 'false' }));
    dispatch(fetchCoatingSpecs({ pagination: 'false' }));
  }, [dispatch]);

  useEffect(() => {
    const found = coatingProductions.find(p => p._id === id);
    if (found) {
      setProduction(found);
    }
  }, [id, coatingProductions]);

  if (loading || !production) return <div className="p-5 text-center">Loading...</div>;

  const specId = production.coatingSpecId?._id || production.coatingSpecId;
  const spec = coatingSpecs.find(s => s._id === specId) || production.coatingSpecId || {};
  
  const specImage = spec.image;
  const prodDate = parseProductionDate(production.date)?.toLocaleDateString() || 'N/A';
  const bottlePerBox = production.bottlePerBox || 0;

  const boxes = bottlePerBox > 0 ? Math.floor((production.totalActualCoatedBottle || 0) / bottlePerBox) : 0;
  const extraCoatedBottles = bottlePerBox > 0 ? (production.totalActualCoatedBottle || 0) % bottlePerBox : 0;

  const unitNum = production.unit || '1';
  const backLink = `/coating-productions/unit/${unitNum}`;

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header">
        <Link to={backLink} className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">Coating Production Detail</h1>
          <p className="page-subtitle">Viewing coating production log details — Unit {unitNum}</p>
        </div>
      </div>

      <div className="row mt-4">
        {/* Left Column - Spec Image & Info */}
        <div className="col-lg-4 mb-4">
          <div className="dash-card h-100 border-0 shadow-sm">
            <div className="dash-card-body text-center d-flex flex-column align-items-center p-4">
              <h5 className="fw-bold mb-4">Spec Image</h5>
              
              {specImage ? (
                <img 
                  src={`${V_URL}${specImage}`} 
                  alt={spec.bottlePerBox || 'Bottle'} 
                  className="img-fluid rounded-4 shadow-sm mb-3"
                  style={{ maxHeight: 250, objectFit: 'contain' }}
                />
              ) : (
                <div className="bg-light rounded-4 d-flex align-items-center justify-content-center mb-3 w-100" style={{ height: 200 }}>
                  <i className="bi bi-image text-muted" style={{ fontSize: 40 }} />
                </div>
              )}

              <h6 className="fw-bold text-dark mt-3">{spec.bottlePerBox || 'N/A'}</h6>
              
              <div className="mt-3 d-flex flex-wrap gap-2 justify-content-center">
                {spec.code && (
                  <span className="badge bg-soft-info text-info px-3 py-2 border rounded-pill" style={{ fontSize: 12 }}>
                    Code: {spec.code}
                  </span>
                )}
                {production.coatingShade && (
                  <span className="badge bg-soft-warning text-warning-accent px-3 py-2 border rounded-pill" style={{ fontSize: 12 }}>
                    Shade: {production.coatingShade}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Column - Production & Specification Details */}
        <div className="col-lg-8 mb-4">
          <div className="dash-card h-100 border-0 shadow-sm">
            <div className="dash-card-header bg-white border-bottom p-4 d-flex flex-wrap justify-content-between align-items-center gap-2">
              <h5 className="mb-0 fw-bold">Coating Production Information</h5>
              <div className="fw-bold text-accent px-3 py-1 bg-light rounded-pill" style={{ fontSize: 13 }}>
                <i className="bi bi-calendar-event me-2"></i> Date: {prodDate}
              </div>
            </div>
            
            <div className="dash-card-body p-4">
              <h6 className="fw-bold text-muted text-uppercase small mb-3">Hierarchy Details</h6>
              <div className="row g-4 mb-4">
                <div className="col-md-4">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Company</span>
                    <span className="fw-bold fs-6">{production.brandId?.companyId?.name || production.coatingSpecId?.brandId?.companyId?.name || 'N/A'}</span>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Brand</span>
                    <span className="fw-bold fs-6 text-accent">{production.brandId?.name || production.coatingSpecId?.brandId?.name || 'N/A'}</span>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Unit</span>
                    <span className="fw-bold fs-6">{unitNum}</span>
                  </div>
                </div>
              </div>

              <h6 className="fw-bold text-muted text-uppercase small mb-3">Specification Details</h6>
              <div className="row g-4 mb-4">
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Bottle Spec Name</span>
                    <span className="fw-bold fs-6">{production.coatingSpecId?.bottlePerBox || 'N/A'}</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Coating Configuration</span>
                    <div className="fw-bold fs-6">
                      Type: <span className="text-dark fw-normal">{production.coatingSpecId?.coatingTypeId?.name || 'N/A'}</span><br/>
                      Shade: <span className="text-dark fw-normal">{production.coatingSpecId?.coatingShade || production.coatingShade || '—'}</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Variant</span>
                    {spec?.variantId ? (
                      <div className="d-flex align-items-center gap-2 mt-1">
                        {spec.variantId.image && (
                          <img 
                            src={`${V_URL}${spec.variantId.image}`} 
                            alt="Variant" 
                            style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} 
                          />
                        )}
                        <div className="fw-bold fs-6 text-dark">{spec.variantId.variantName} - {spec.variantId.variantSize}</div>
                      </div>
                    ) : (
                      <span className="fw-bold fs-6 text-muted">—</span>
                    )}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Operator & Shift</span>
                    <span className="fw-bold fs-6">{production.operatorId?.name || 'N/A'}</span>
                    {production.shift && (
                      <span className={`ms-2 badge ${production.shift?.name === 'A' ? 'bg-soft-primary text-primary' : 'bg-soft-warning text-warning'}`} style={{ fontSize: 12 }}>
                        Shift {production.shift?.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <h6 className="fw-bold text-muted text-uppercase small mb-3">Production Quantities</h6>
              <div className="row g-4 production-qty-grid">
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Actual Quantity</span>
                    <span className="fw-bold fs-4 text-dark">{production.actualQuantity || 0}</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Rejection Qty</span>
                    <span className="fw-bold fs-4 text-danger">{production.rejectionQuantity || 0}</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Rejection %</span>
                    <span className="fw-bold fs-4 text-danger">
                      {((Number(production.rejectionQuantity) || 0) / (Number(production.totalBottleCoated) || (Number(production.actualQuantity) || 0) + (Number(production.rejectionQuantity) || 0)) * 100 || 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Total Actual Coated</span>
                    <span className="fw-bold fs-4 text-success">{production.totalActualCoatedBottle || 0}</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Total Bottle Coated</span>
                    <span className="fw-bold fs-4 text-primary">{production.totalBottleCoated || 0}</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Bottles Per Box</span>
                    <span className="fw-bold fs-4 text-info">{production.bottlePerBox || 0}</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Boxes</span>
                    <span className="fw-bold fs-4 text-primary">{boxes}</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle text-center h-100 d-flex flex-column justify-content-center">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Extra Bottles</span>
                    <span className="fw-bold fs-4 text-success">{extraCoatedBottles}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <h6 className="fw-bold text-muted text-uppercase small mb-3">Rejection Information</h6>
                <div className="p-3 bg-light rounded-4 border border-light-subtle">
                  <span className="text-uppercase small fw-bold text-muted d-block mb-2">Rejection Reason</span>
                  <div className="fw-semibold">{production.rejectionReason || "No rejection reason provided"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

