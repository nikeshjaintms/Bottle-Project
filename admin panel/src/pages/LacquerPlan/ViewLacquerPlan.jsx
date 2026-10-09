import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchLacquerPlanById, clearCurrentPlan } from '../../redux/slices/lacquerPlanSlice';
import { useLacquerPlanLanguage } from '../../hooks/useLacquerPlanLanguage';

export default function ViewLacquerPlan() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentPlan, loading, error } = useSelector((state) => state.lacquerPlans);
  const { labels, toggleLanguage, language } = useLacquerPlanLanguage();

  useEffect(() => {
    dispatch(fetchLacquerPlanById(id));
    return () => dispatch(clearCurrentPlan());
  }, [dispatch, id]);

  if (loading || !currentPlan) {
    return <div className="text-center py-5">Loading...</div>;
  }

  return (
    <div className="page-content">
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">{labels.view}</h1>
            <p className="page-subtitle mb-0">Details of the selected lacquer plan</p>
          </div>
        </div>
        <div>
          <button onClick={toggleLanguage} className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold">
            {language === 'en' ? 'ગુજરાતી' : 'English'}
          </button>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="dash-card border-0 shadow-sm p-4">
            {error && <div className="alert alert-danger">{error}</div>}
            
            <div className="mb-4 pb-4 border-bottom">
              <label className="form-label fw-bold small">{labels.date}</label>
              <input type="date" className="form-control shadow-none w-auto bg-light" disabled
                     value={currentPlan.planDate ? new Date(currentPlan.planDate).toISOString().split('T')[0] : ''} />
            </div>

            <div className="bg-white border border-light-subtle rounded-3 p-4 mb-4 shadow-sm position-relative">
              <div className="row g-4 mb-4 bg-light p-3 rounded mx-0">
                <div className="col-md-5">
                  <label className="form-label fw-bold small text-primary">{labels.bottleName}</label>
                  <input type="text" className="form-control shadow-none bg-white" disabled value={currentPlan.bottleName || '-'} />
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between mb-3 mt-2">
                <h6 className="fw-bold text-muted mb-0">PLAN ENTRIES FOR <span className="text-primary">{currentPlan.bottleName || 'BOTTLE'}</span></h6>
              </div>

              <div className="table-responsive mb-4">
              <table className="table table-bordered align-middle table-sm" style={{ minWidth: '2400px' }}>
                <thead className="table-light">
                  <tr>
                    <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.variant}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.coatingShade}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.brand}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.process}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.plainStock}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.bottlePerBox}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '7%'}}>{labels.orderQty}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.coatingCompletedQty}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.balanceToMake}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.dispatchPendingQty}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '5%'}}>{labels.soldQty}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.noOfOrderBoxes}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '15%', minWidth: '250px'}}>{labels.remarks}</th>
                  </tr>
                </thead>
                <tbody className="border-top-0">
                  <tr>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.variantId?.variantName || '-'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.colour || '-'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.brandId?.name || '-'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.process || '-'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.plainStock || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.boxQty || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center fw-bold" disabled value={currentPlan.orderQty || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.coatedQty || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center fw-bold text-danger" disabled value={currentPlan.balanceToMake || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.dispatchBalance || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.soldQty || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.noOfBoxes || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light" disabled value={currentPlan.remarks || '-'} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>

            <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
              <button type="button" onClick={() => navigate('/lacquer-plan')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
                {labels.close}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
