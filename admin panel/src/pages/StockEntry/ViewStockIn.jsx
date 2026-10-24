import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { fetchStockEntryById } from '../../redux/slices/stockEntrySlice';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../../context/AbilityContext';
import Swal from 'sweetalert2';

export default function ViewStockIn() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const fallbackUrl = location.state?.from || '/stock-invoices';
  const ability = useAbility(AbilityContext);
  const canSeeRate = ability.can('rate', 'stock_entry');
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dispatch(fetchStockEntryById(id)).then(res => {
      if (!res.error) {
        setEntry(res.payload.data);
      } else {
        Swal.fire('Error', res.payload || 'Failed to fetch invoice', 'error');
        navigate(fallbackUrl);
      }
      setLoading(false);
    });
  }, [dispatch, id, navigate, fallbackUrl]);

  if (loading) {
    return <div className="page-content text-center py-5">Loading...</div>;
  }

  if (!entry) return null;

  const totalAmount = entry.items?.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) || 0;

  return (
    <div className="page-content stock-entry-page stock-entry-view-page">
      <div className="page-header d-flex align-items-center gap-3 user-form-page-header stock-entry-form-header">
        <Link to={fallbackUrl} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
          <i className="bi bi-arrow-left fs-5 text-secondary"></i>
        </Link>
        <div>
          <h1 className="page-title">View Invoice</h1>
          <p className="page-subtitle">Details of Stock IN entry</p>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-10 col-lg-12">
          <div className="dash-card stock-entry-form-card">
            <div className="dash-card-body p-4 stock-entry-form-body">
              <div className="row g-4 mb-4 border-bottom pb-4">
                <div className="col-md-4">
                  <label className="text-muted fw-bold small">Invoice Number</label>
                  <div className="fw-bold fs-5 text-dark">{entry.invoiceNumber || 'N/A'}</div>
                </div>
                <div className="col-md-4">
                  <label className="text-muted fw-bold small">Invoice Date</label>
                  <div className="fw-500 fs-5">{new Date(entry.date).toLocaleDateString()}</div>
                </div>
                <div className="col-md-4">
                  <label className="text-muted fw-bold small">Supplier Name</label>
                  <div className="fw-500 fs-5">{entry.supplierName || 'N/A'}</div>
                </div>
              </div>
              
              <div className="table-responsive mb-4 stock-entry-items-table">
                <table className="table table-bordered align-middle">
                  <thead className="table-light">
                    <tr>
                      <th className="small text-muted text-center" style={{width: '5%'}}>Sr.</th>
                      <th className="small text-muted" style={{width: '45%'}}>Description of Goods</th>
                      <th className="small text-muted text-end" style={{width: '12%'}}>Quantity</th>
                      {canSeeRate && <th className="small text-muted text-end" style={{width: '12%'}}>Rate</th>}
                      <th className="small text-muted" style={{width: '10%'}}>Per</th>
                      {canSeeRate && <th className="small text-muted text-end" style={{width: '16%'}}>Amount</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entry.items?.map((item, index) => (
                      <tr key={item._id || index}>
                        <td className="text-center text-muted">{index + 1}</td>
                        <td className="fw-500">
                          <div className="text-dark">{item.descriptionOfGoods || item.rawMaterialId?.name || 'Unknown'}</div>
                          <div className="small text-muted mt-1">Ref: {item.rawMaterialId?.name || 'Unknown'}</div>
                        </td>
                        <td className="text-end fw-bold text-success">+{item.quantity.toFixed(3)}</td>
                        {canSeeRate && <td className="text-end text-muted">{item.rate ? item.rate.toFixed(2) : '-'}</td>}
                        <td className="text-muted">{item.per || '-'}</td>
                        {canSeeRate && <td className="text-end fw-bold text-dark">{item.amount ? item.amount.toFixed(2) : '-'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canSeeRate && (
                <div className="d-flex justify-content-end">
                  <div className="card bg-light border-0" style={{ minWidth: '300px' }}>
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="fw-bold fs-5">Total Invoice Amount:</span>
                        <span className="fw-bold fs-5 text-primary">₹ {totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
