import React, { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDispatchById, clearCurrentDispatch } from '../../redux/slices/dispatchSlice';

export default function ViewDispatch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  const { currentDispatch, loading } = useSelector(state => state.dispatch);

  useEffect(() => {
    dispatch(fetchDispatchById(id));
    return () => dispatch(clearCurrentDispatch());
  }, [dispatch, id]);

  if (loading || !currentDispatch) {
    return (
      <div className="p-5 text-center text-muted">
        <div className="spinner-border text-primary mb-3" />
        <div>Loading Dispatch Details...</div>
      </div>
    );
  }

  const { dispatch: dispatchData, items } = currentDispatch;
  
  const totalBoxes = items?.reduce((acc, item) => acc + (Number(item.box) || 0), 0) || 0;
  const totalQty = items?.reduce((acc, item) => acc + (Number(item.qty) || 0), 0) || 0;

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost border-0" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
          </button>
          <div>
            <h1 className="page-title mb-0">Dispatch Details</h1>
            <p className="page-subtitle mb-0">View dispatch transaction information</p>
          </div>
        </div>
        <Link to={`/dispatch/edit/${dispatchData._id}`} className="btn btn-outline-primary shadow-none">
          <i className="bi bi-pencil me-2" /> Edit Dispatch
        </Link>
      </div>

      <div className="row g-4">
        <div className="col-12">
          <div className="dash-card border-0 shadow-sm">
            <div className="dash-card-header p-4 border-bottom bg-white">
              <h5 className="mb-0">Dispatch Information</h5>
            </div>
            <div className="dash-card-body p-4">
              <div className="row g-4">
                <div className="col-md-4">
                  <div className="text-muted small mb-1">Dispatch Date</div>
                  <div className="fw-500">{new Date(dispatchData.dispatchDate).toLocaleDateString('en-GB')}</div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted small mb-1">G. Pass No.</div>
                  <div className="fw-500">{dispatchData.gatePassNo}</div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted small mb-1">Remarks</div>
                  <div className="fw-500">{dispatchData.remarks || '-'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="dash-card border-0 shadow-sm">
            <div className="dash-card-header p-4 border-bottom bg-white">
              <h5 className="mb-0">Dispatch Items</h5>
            </div>
            <div className="dash-card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="bg-light">
                    <tr>
                      <th className="py-3 px-4 text-muted small fw-bold">Product Name</th>
                      <th className="py-3 px-3 text-muted small fw-bold">Printing</th>
                      <th className="py-3 px-3 text-muted small fw-bold">Foil</th>
                      <th className="py-3 px-3 text-muted small fw-bold">Organic</th>
                      <th className="py-3 px-3 text-muted small fw-bold text-end">Box</th>
                      <th className="py-3 px-3 text-muted small fw-bold text-end">Qty</th>
                      <th className="py-3 px-3 text-muted small fw-bold text-end">Total</th>
                      <th className="py-3 px-4 text-muted small fw-bold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items?.map((item, index) => (
                      <tr key={index} className="align-middle">
                        <td className="ps-4 fw-500">{item.productName}</td>
                        <td>{item.printing || '-'}</td>
                        <td>{item.foil || '-'}</td>
                        <td>{item.organic || '-'}</td>
                        <td className="text-end fw-500">
                          {item.additionalBox > 0 ? `${item.box}(+${item.additionalBox})` : item.box}
                        </td>
                        <td className="text-end fw-500">{item.qty}</td>
                        <td className="text-end fw-bold text-primary">{item.total}</td>
                        <td className="pe-4">{item.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-light border-top">
                    <tr>
                      <td colSpan="4" className="ps-4 py-3 fw-bold text-end">Totals:</td>
                      <td className="text-end py-3 fw-bold">{totalBoxes}</td>
                      <td className="text-end py-3 fw-bold">{totalQty}</td>
                      <td colSpan="2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
