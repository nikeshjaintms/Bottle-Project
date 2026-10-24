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
  const totalQty = items?.reduce((acc, item) => acc + (Number(item.totalQty) || 0), 0) || 0;

  return (
    <div className="page-content dispatch-module-page dispatch-module-view">
      <div className="page-header d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn btn-light border-0 shadow-sm rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
            <i className="bi bi-arrow-left fs-5 text-secondary" />
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
                <div className="col-md-3">
                  <div className="text-muted small mb-1">Dispatch Date</div>
                  <div className="fw-500">{new Date(dispatchData.dispatchDate).toLocaleDateString('en-GB')}</div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted small mb-1">G. Pass No.</div>
                  <div className="fw-500">{dispatchData.gatePassNo}</div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted small mb-1">Company</div>
                  <div className="fw-500">{dispatchData.companyId?.name || '-'}</div>
                </div>
                <div className="col-md-3">
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
              <div className="table-responsive dispatch-view-table">
                <table className="table table-hover mb-0">
                  <thead className="bg-light">
                    <tr>
                      <th className="py-3 px-4 text-muted small fw-bold">Sr.</th>
                      <th className="py-3 px-4 text-muted small fw-bold">Plain Bottle</th>
                      <th className="py-3 px-3 text-muted small fw-bold">Variant</th>
                      <th className="py-3 px-3 text-muted small fw-bold">Coating Shade</th>
                      <th className="py-3 px-3 text-muted small fw-bold">Text Color</th>
                      <th className="py-3 px-3 text-muted small fw-bold text-end">Boxes</th>
                      <th className="py-3 px-3 text-muted small fw-bold text-end">Qty/Box</th>
                      <th className="py-3 px-3 text-muted small fw-bold text-end">Total Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items?.map((item, index) => (
                      <tr key={index} className="align-middle">
                        <td className="ps-4 text-muted small">{index + 1}</td>
                        <td className="fw-500">{item.plainBottleName || 'Unmapped'}</td>
                        <td>{item.variantName || '-'}</td>
                        <td>{item.coatingShade || '-'}</td>
                        <td>{item.detectedTextColor || '-'}</td>
                        <td className="text-end fw-500">{item.box || 0}</td>
                        <td className="text-end fw-500">{item.qty || 0}</td>
                        <td className="text-end fw-bold text-primary">{item.totalQty || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-light border-top">
                    <tr>
                      <td colSpan="5" className="ps-4 py-3 fw-bold text-end">Totals:</td>
                      <td className="text-end py-3 fw-bold">{totalBoxes}</td>
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
