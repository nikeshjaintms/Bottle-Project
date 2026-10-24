import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchPrintingPlanById, clearCurrentPlan } from '../../redux/slices/printingPlanSlice';
import { usePrintingPlanLanguage } from '../../hooks/usePrintingPlanLanguage';

export default function ViewPrintingPlan() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentPlan, loading, error } = useSelector((state) => state.printingPlans);
  const { labels, language, toggleLanguage } = usePrintingPlanLanguage();

  useEffect(() => {
    dispatch(fetchPrintingPlanById(id));
    return () => dispatch(clearCurrentPlan());
  }, [dispatch, id]);

  if (loading || !currentPlan) {
    return <div className="text-center py-5">Loading...</div>;
  }

  return (
    <div className="page-content printing-plan-page printing-plan-view-page">
      <div className="d-flex justify-content-between align-items-end mb-4 printing-plan-view-header">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">{labels.view}</h1>
            <p className="page-subtitle mb-0">Details of the selected printing plan</p>
          </div>
        </div>
        <div>
          <button type="button" onClick={toggleLanguage} className="btn btn-outline-secondary shadow-sm px-3 py-2 rounded-3 fw-bold">
            {language === 'en' ? 'ગુજરાતી' : 'English'}
          </button>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="dash-card border-0 shadow-sm p-4 printing-plan-view-card">
            {error && <div className="alert alert-danger">{error}</div>}
            
            <div className="mb-4 pb-4 border-bottom">
              <label className="form-label fw-bold small">Plan Date</label>
              <input type="date" className="form-control shadow-none w-auto bg-light" disabled
                     value={currentPlan.planDate ? new Date(currentPlan.planDate).toISOString().split('T')[0] : ''} />
            </div>

            <div className="bg-white border border-light-subtle rounded-3 p-4 mb-4 shadow-sm position-relative printing-plan-section">
              <div className="row g-4 mb-4 bg-light p-3 rounded mx-0">
                <div className="col-md-5">
                  <label className="form-label fw-bold small text-primary">Plain Bottle</label>
                  <input type="text" className="form-control shadow-none bg-white" disabled value={currentPlan.plainBottleName || currentPlan.plainBottle || currentPlan.bottleName || '-'} />
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between mb-3 mt-2">
                <h6 className="fw-bold text-muted mb-0">PLAN ENTRIES FOR <span className="text-primary">{currentPlan.plainBottleName || currentPlan.plainBottle || currentPlan.bottleName || 'BOTTLE'}</span></h6>
              </div>

              <div className="table-responsive mb-4 printing-plan-view-table">
              <table className="table table-bordered align-middle table-sm" style={{ minWidth: '2400px' }}>
                <thead className="table-light">
                  <tr>
                    <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.coatingShade}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.printingToBeDone}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '10%', minWidth: '150px'}}>{labels.textColor}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '12%', minWidth: '200px'}}>{labels.brand}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '8%', minWidth: '150px'}}>{labels.plainColouredBottleStock}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '7%'}}>{labels.orderQty}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.readyPrintedQty}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.balanceToMake}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.bottlePerBox}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.noOfOrderBoxes}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '9%'}}>{labels.balanceToBeDispatched}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '5%'}}>{labels.soldQty}</th>
                    <th className="small text-muted text-center align-middle" style={{width: '6%'}}>{labels.readyBoxes}</th>
                    {(currentPlan.componentHeadersList || []).map((headerName, hIdx) => (
                      <th key={`comp_th_${hIdx}`} className="small text-primary text-center align-middle bg-primary-subtle" style={{ width: '6%', minWidth: '95px' }}>
                        {headerName}
                      </th>
                    ))}
                    <th className="small text-muted text-center align-middle" style={{width: '15%', minWidth: '250px'}}>{labels.remarks}</th>
                  </tr>
                </thead>
                <tbody className="border-top-0">
                  <tr>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.coatingShade || '-'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.printingToBeDone || '-'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.textColor || '-'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.brandName || currentPlan.brandId?.name || '-'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.plainBottleStock || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center fw-bold" disabled value={currentPlan.orderQty || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.producedQty || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center fw-bold text-danger" disabled value={currentPlan.balanceToMake || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.boxQty || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.noOfBoxes || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.dispatchBalance || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.soldQty || '0'} />
                    </td>
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light text-center" disabled value={currentPlan.readyBoxes || '0'} />
                    </td>
                    {(currentPlan.componentHeadersList || []).map((headerName, hIdx) => {
                      const compData = currentPlan.components?.find(c => (c.itemType || c.componentType) === headerName);
                      return (
                        <td key={`comp_td_${hIdx}`} className="text-center align-middle">
                          <input type="text" className="form-control form-control-sm shadow-none bg-light text-center fw-bold" disabled value={compData?.quantity !== undefined && compData?.quantity !== null ? compData.quantity : '-'} />
                        </td>
                      );
                    })}
                    <td>
                      <input type="text" className="form-control form-control-sm shadow-none bg-light" disabled value={currentPlan.remarks || '-'} />
                    </td>
                  </tr>
                </tbody>
                <tfoot className="table-light fw-bold">
                  <tr>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td className="text-center">{currentPlan.plainBottleStock || 0}</td>
                    <td className="text-center">{currentPlan.orderQty || 0}</td>
                    <td></td>
                    <td></td>
                    <td className="text-center">{currentPlan.noOfBoxes || 0}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    {(currentPlan.componentHeadersList || []).map((_, hIdx) => (
                      <td key={`comp_foot_${hIdx}`}></td>
                    ))}
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </div>

            <div className="d-flex gap-2 mt-4 user-form-actions border-top pt-4">
              <button type="button" onClick={() => navigate('/printing-plan')} className="btn-ghost px-5 py-3 text-decoration-none text-center">
                Back to List
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
