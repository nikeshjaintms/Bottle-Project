import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchIncomingById } from '../../redux/slices/incomingSlice';
import { V_URL } from '../../../Baseurl.js';

export default function ViewIncoming() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentIncoming, loading } = useSelector(state => state.incoming);

  useEffect(() => {
    dispatch(fetchIncomingById(id));
  }, [id, dispatch]);

  if (loading || !currentIncoming) {
    return (
      <div className="page-content d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  const { incoming, items } = currentIncoming;
  const grandTotal = items.reduce((sum, item) => sum + (item.totalQty || 0), 0);

  return (
    <div className="page-content">
      <div className="d-flex align-items-center mb-4 gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost shadow-sm border-0" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left fs-5" />
        </button>
        <div>
          <h1 className="page-title mb-0">Incoming Detail</h1>
          <p className="page-subtitle mb-0">Delivery entry review</p>
        </div>
      </div>

      <div className="row g-4">
        {/* Left Side: Images/Documents */}
        <div className="col-lg-4">
          <div className="dash-card h-100 border-0 shadow-sm">
            <div className="dash-card-body p-4 d-flex flex-column align-items-center justify-content-center h-100">
               {(() => {
                 const docs = incoming.images && incoming.images.length > 0 ? incoming.images : (incoming.image ? [incoming.image] : []);
                 if (docs.length === 0) {
                   return (
                     <div className="bg-light rounded d-flex flex-column align-items-center justify-content-center w-100" style={{ height: '280px' }}>
                       <i className="bi bi-image text-muted" style={{ fontSize: '4rem' }}></i>
                       <span className="text-muted mt-2">No Document</span>
                     </div>
                   );
                 }
                 const firstDoc = docs[0];
                 const isImage = firstDoc.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;
                 return (
                   <div className="w-100">
                     {isImage ? (
                       <a href={`${V_URL}${firstDoc}`} target="_blank" rel="noreferrer" className="text-center bg-light rounded p-2 mb-3 d-block" style={{ textDecoration: 'none' }}>
                         <img src={`${V_URL}${firstDoc}`} alt="Document Preview" style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '8px' }} />
                       </a>
                     ) : (
                       <a href={`${V_URL}${firstDoc}`} target="_blank" rel="noreferrer" className="bg-light rounded d-flex flex-column align-items-center justify-content-center w-100 mb-3" style={{ height: '280px', textDecoration: 'none' }}>
                         <i className="bi bi-file-earmark-pdf text-danger" style={{ fontSize: '4rem' }}></i>
                         <span className="text-muted mt-2 fw-500">PDF Document</span>
                       </a>
                     )}
                     {docs.length > 1 && (
                       <div className="d-flex flex-wrap gap-2 justify-content-center">
                          {docs.map((doc, i) => (
                             <a key={i} href={`${V_URL}${doc}`} target="_blank" rel="noreferrer" className="btn btn-outline-primary border-2 fw-bold" style={{ borderRadius: 8 }}>
                               <i className="bi bi-box-arrow-up-right me-2"></i> Open Doc {i + 1}
                             </a>
                          ))}
                       </div>
                     )}
                   </div>
                 );
               })()}
            </div>
          </div>
        </div>

        {/* Right Side: Details & Table */}
        <div className="col-lg-8">
          <div className="dash-card border-0 shadow-sm mb-4">
            <div className="dash-card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
              <h5 className="mb-0 fw-bold">Entry Information</h5>
            </div>
            <div className="dash-card-body p-4">
              <div className="row g-4">
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Date</span>
                    <span className="fw-bold fs-6">{(incoming.documentDate || incoming.date || incoming.createdAt) ? new Date(incoming.documentDate || incoming.date || incoming.createdAt).toLocaleDateString('en-GB') : '-'}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Challan / Delivery No</span>
                    <span className="fw-bold fs-6 text-primary">{incoming.deliveryNumber || '-'}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Bill To</span>
                    <span className="fw-bold fs-6">{incoming.billToId?.name || '-'}</span>
                  </div>
                </div>
                {incoming.poNo && (
                  <div className="col-md-6">
                    <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                      <span className="text-uppercase small fw-bold text-muted d-block mb-1">PO No</span>
                      <span className="fw-bold fs-6">{incoming.poNo}</span>
                    </div>
                  </div>
                )}
                {incoming.poDate && (
                  <div className="col-md-6">
                    <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                      <span className="text-uppercase small fw-bold text-muted d-block mb-1">PO Date</span>
                      <span className="fw-bold fs-6">{new Date(incoming.poDate).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>
                )}
                {incoming.poOrderQty ? (
                  <div className="col-md-6">
                    <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                      <span className="text-uppercase small fw-bold text-muted d-block mb-1">PO Order Qty</span>
                      <span className="fw-bold fs-6">{incoming.poOrderQty}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="dash-card border-0 shadow-sm">
            <div className="dash-card-header bg-white border-bottom p-4">
              <h5 className="mb-0 fw-bold"><i className="bi bi-box-seam me-2 text-primary"></i>Bottle Entries</h5>
            </div>
            <div className="dash-card-body p-4">
              <div className="d-flex flex-column gap-3">
                {/* Header Row */}
                <div className="row px-3 small fw-bold text-muted text-uppercase mb-1">
                  <div className="col-5">Bottle Name</div>
                  <div className="col-2 text-center">No of Boxes</div>
                  <div className="col-2 text-center">Qty / Box</div>
                  <div className="col-3 text-end">Total Qty</div>
                </div>
                
                {/* Item Rows */}
                {items.map((item, index) => (
                  <div key={index} className="row align-items-center px-3 py-3 bg-light rounded-4 border border-light-subtle">
                    <div className="col-5 fw-bold fs-6 text-dark">{item.bottleId?.bottleName}</div>
                    <div className="col-2 text-center">
                      <span className="badge bg-white text-dark border px-3 py-2 rounded-pill fs-6 shadow-sm">{item.box || 0}</span>
                    </div>
                    <div className="col-2 text-center">
                      <span className="badge bg-white text-dark border px-3 py-2 rounded-pill fs-6 shadow-sm">{item.qty || 0}</span>
                    </div>
                    <div className="col-3 text-end fw-bold text-accent fs-5">
                      {item.totalQty?.toLocaleString() || 0}
                    </div>
                  </div>
                ))}

                {/* Grand Total Row */}
                <div className="row align-items-center px-3 py-4 mt-2 rounded-4 bg-primary bg-opacity-10 border border-primary border-opacity-25">
                  <div className="col-9 text-end fw-bold text-uppercase text-primary" style={{ letterSpacing: '1px' }}>Grand Total:</div>
                  <div className="col-3 text-end fw-bold text-primary fs-3">
                    {grandTotal?.toLocaleString() || 0}
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
