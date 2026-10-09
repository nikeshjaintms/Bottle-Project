import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const ViewPendingSheet = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}/api/pending-sheet/${id}`, { withCredentials: true });
        if (response.data.success) {
          setData(response.data.data);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>;
  }

  if (!data) {
    return <div className="text-center py-5 text-danger">Record not found!</div>;
  }

  return (
    <div className="page-content">
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div className="d-flex align-items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost border-0 shadow-sm" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h1 className="page-title mb-0">View Pending Sheet</h1>
            <p className="page-subtitle mb-0">Detailed view of pending sheet entry</p>
          </div>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-xl-12 col-lg-12">
          <div className="dash-card border-0 shadow-sm p-0">
          <table className="table table-borderless table-striped mb-0">
            <tbody>
              <tr>
                <th width="30%" className="ps-4 pt-4">Date</th>
                <td className="pt-4">{new Date(data.date).toLocaleDateString()}</td>
              </tr>
              <tr>
                <th className="ps-4">Description (Bottle)</th>
                <td className="fw-500">{data.bottleName}</td>
              </tr>
              <tr>
                <th className="ps-4">Brand</th>
                <td className="fw-500">{data.brandId ? data.brandId.name : '-'}</td>
              </tr>
              <tr>
                <th className="ps-4">Variant Name</th>
                <td className="fw-500">{data.variantName}</td>
              </tr>
              <tr>
                <th className="ps-4">Coated</th>
                <td className="text-primary fw-bold">{data.coated}</td>
              </tr>
              <tr>
                <th className="ps-4">Order Qty</th>
                <td className="text-dark fw-bold">{data.order}</td>
              </tr>
              <tr>
                <th className="ps-4">Ready</th>
                <td className="text-success fw-bold">{data.ready}</td>
              </tr>
              <tr>
                <th className="ps-4">Ready To Dispatch</th>
                <td className="fw-500">{data.readyToDispatch}</td>
              </tr>
              <tr>
                <th className="ps-4 pb-4">Dispatch</th>
                <td className="fw-500 pb-4">{data.dispatch}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewPendingSheet;
