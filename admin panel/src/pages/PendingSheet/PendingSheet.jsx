import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { NavLink } from 'react-router-dom';
import * as XLSX from 'xlsx';

const PendingSheet = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}/api/pending-sheet`, { withCredentials: true });
      if (response.data.success) {
        setData(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this record?")) {
      try {
        await axios.delete(`${import.meta.env.VITE_API_URL?.replace('/api', '') || ''}/api/pending-sheet/${id}`, { withCredentials: true });
        fetchData();
      } catch (err) {
        console.error('Error deleting record:', err);
      }
    }
  };

  const handleExportExcel = () => {
    const exportData = data.map((item, index) => ({
      'SR. NO': index + 1,
      'DATE': new Date(item.date).toLocaleDateString(),
      'DESCRIPTION': item.bottleName || '-',
      'BRAND': item.brandId ? item.brandId.name : '-',
      'VARIANT NAME': item.variantName || '-',
      'COATED': item.coated || 0,
      'ORDER': item.order || 0,
      'READY': item.ready || 0,
      'READY TO DISPATCH': item.readyToDispatch || 0,
      'DISPATCH': item.dispatch || 0
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ready Stock');
    XLSX.writeFile(workbook, `Ready_Stock_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between companies-page-header">
        <div>
          <h1 className="page-title">Ready Stock</h1>
          <p className="page-subtitle">Manage and track ready stock entries</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn-accent companies-header-action bg-success" onClick={handleExportExcel}>
            <i className="bi bi-file-earmark-excel me-2" /> Export Excel
          </button>
          <NavLink to="/pending-sheet/add" className="btn-accent companies-header-action">
            <i className="bi bi-plus-lg me-2" /> Add Record
          </NavLink>
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-header d-flex align-items-center justify-content-end p-3 border-bottom bg-white companies-dash-toolbar flex-wrap">
          <div className="search-input-wrapper position-relative companies-search-wrap">
            <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
              placeholder="Search ready stock entries..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ borderRadius: 10, fontSize: 13, minWidth: '250px' }}
            />
          </div>
        </div>

        <div className="p-0">
          <div className="companies-list-desktop" style={{ overflowX: 'auto' }}>
            {loading ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
              </div>
            ) : (
              <table className="data-table" style={{ minWidth: '1200px' }}>
                <thead>
                  <tr>
                    <th className="py-3 text-uppercase small fw-bold text-muted ps-4 text-start" style={{ width: 60 }}>SR. NO</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">DATE</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">DESCRIPTION</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">BRAND</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">VARIANT NAME</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">COATED</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">ORDER</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">READY</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">READY TO DISPATCH</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center">DISPATCH</th>
                    <th className="py-3 text-uppercase small fw-bold text-muted text-center" style={{ width: 100 }}>ACTION</th>
                  </tr>
                </thead>
                <tbody className="align-middle text-center">
                  {data.filter(item => {
                    if (!searchTerm) return true;
                    const s = searchTerm.toLowerCase();
                    const bName = item.bottleName?.toLowerCase() || '';
                    const brand = item.brandId?.name?.toLowerCase() || '';
                    const vName = item.variantName?.toLowerCase() || '';
                    return bName.includes(s) || brand.includes(s) || vName.includes(s);
                  }).length > 0 ? (
                    data.filter(item => {
                      if (!searchTerm) return true;
                      const s = searchTerm.toLowerCase();
                      const bName = item.bottleName?.toLowerCase() || '';
                      const brand = item.brandId?.name?.toLowerCase() || '';
                      const vName = item.variantName?.toLowerCase() || '';
                      return bName.includes(s) || brand.includes(s) || vName.includes(s);
                    }).map((item, idx) => (
                      <tr key={item._id} className="align-middle border-bottom transition-all hover-bg-light">
                        <td className="py-3 ps-4 text-start">
                          <span className="text-muted fw-bold" style={{ fontSize: 13 }}>{(idx + 1).toString().padStart(2, '0')}</span>
                        </td>
                        <td className="py-3 text-center">{new Date(item.date).toLocaleDateString('en-GB')}</td>
                        <td className="py-3 text-center fw-600 text-dark" style={{ fontSize: 13 }}>{item.bottleName || '-'}</td>
                        <td className="py-3 text-center text-accent fw-500">{item.brandId ? item.brandId.name : '-'}</td>
                        <td className="py-3 text-center">
                          <span className="badge bg-soft-info text-info px-2 py-1" style={{ fontSize: 11 }}>{item.variantName || '-'}</span>
                        </td>
                        <td className="py-3 text-center text-primary fw-bold">{item.coated || 0}</td>
                        <td className="py-3 text-center fw-bold text-dark">{item.order || 0}</td>
                        <td className="py-3 text-center fw-bold text-success">{item.ready || 0}</td>
                        <td className="py-3 text-center text-muted">{item.readyToDispatch || 0}</td>
                        <td className="py-3 text-center text-muted">{item.dispatch || 0}</td>
                        <td className="py-3 text-center">
                          <div className="d-flex gap-2 justify-content-center">
                            <NavLink to={`/pending-sheet/view/${item._id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2" title="View"><i className="bi bi-eye fs-6"></i></NavLink>
                            <NavLink to={`/pending-sheet/edit/${item._id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2" title="Edit"><i className="bi bi-pencil-square fs-6"></i></NavLink>
                            <button className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2" onClick={() => handleDelete(item._id)} title="Delete"><i className="bi bi-trash fs-6"></i></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="11" className="text-center py-5 text-muted">No Pending Data Found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingSheet;
