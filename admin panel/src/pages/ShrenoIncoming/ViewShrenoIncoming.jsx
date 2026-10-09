import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';

export default function ViewShrenoIncoming() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        const res = await api.get(`/shreno-incoming/${id}`);
        if (res.data.success) {
          setData(res.data.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecord();
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>Record not found</div>;

  const grandTotal = data.items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 0;

  return (
    <div className="page-content">
      <div className="d-flex align-items-center mb-4 gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost shadow-sm border-0" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-arrow-left fs-5" />
        </button>
        <div>
          <h1 className="page-title mb-0">View Shreno Challan</h1>
          <p className="page-subtitle mb-0">Challan details and items</p>
        </div>
      </div>

      <div className="dash-card border-0 shadow-sm mb-4">
        <div className="dash-card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold">Entry Information</h5>
        </div>
        <div className="dash-card-body p-4">
          <div className="row g-4">
            <div className="col-md-4">
              <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                <span className="text-uppercase small fw-bold text-muted d-block mb-1">Date</span>
                <span className="fw-bold fs-6">{new Date(data.date).toLocaleDateString('en-GB')}</span>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                <span className="text-uppercase small fw-bold text-muted d-block mb-1">Challan / Delivery No</span>
                <span className="fw-bold fs-6 text-primary">{data.challanNo}</span>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-3 bg-light rounded-4 border border-light-subtle h-100">
                <span className="text-uppercase small fw-bold text-muted d-block mb-1">PO No</span>
                <span className="fw-bold fs-6">{data.poNo || '-'}</span>
              </div>
            </div>
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
              <div className="col-4">Bottle Name</div>
              <div className="col-2 text-center">Item Type</div>
              <div className="col-3 text-center">Configuration</div>
              <div className="col-3 text-end">Quantity</div>
            </div>
            
            {/* Item Rows */}
            {data.items?.map((item, index) => (
              <div key={index} className="row align-items-center px-3 py-3 bg-light rounded-4 border border-light-subtle">
                <div className="col-4 fw-bold fs-6 text-dark">{item.bottleName?.bottleName || 'Unknown'}</div>
                <div className="col-2 text-center">
                  <span className="badge bg-white text-dark border px-3 py-2 rounded-pill fs-6 shadow-sm">{item.itemType?.name || item.itemType || 'Unknown'}</span>
                </div>
                <div className="col-3 text-center fw-500">
                  <span className="badge bg-white text-dark border px-3 py-2 rounded-pill fs-6 shadow-sm">{item.configuration || '-'}</span>
                </div>
                <div className="col-3 text-end fw-bold text-accent fs-5">
                  {Number(item.quantity || 0).toLocaleString()}
                </div>
              </div>
            ))}

            {/* Grand Total Row */}
            <div className="row align-items-center px-3 py-4 mt-2 rounded-4 bg-primary bg-opacity-10 border border-primary border-opacity-25">
              <div className="col-9 text-end fw-bold text-uppercase text-primary" style={{ letterSpacing: '1px' }}>Grand Total:</div>
              <div className="col-3 text-end fw-bold text-primary fs-3">
                {grandTotal.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
