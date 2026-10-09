import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchGst, deleteGst, setSearchTerm } from '../../redux/slices/gstSlice';
import Swal from 'sweetalert2';

export default function GstList() {
  const dispatch = useDispatch();
  const { gstList, loading, page, totalPages, total, searchTerm } = useSelector((state) => state.gst);
  const search = searchTerm || "";
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = searchParams.get('page') || '';
  const currentPage = Number(urlPage) || page || 1;
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleDelete = (id, gstNumber) => {
    Swal.fire({
      title: 'Delete GST Entry?',
      text: `Are you sure you want to delete GST Number ${gstNumber}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e91e63',
      confirmButtonText: 'Yes, delete!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(deleteGst(id)).then(res => {
          if (!res.error) Swal.fire('Deleted!', 'GST entry removed.', 'success');
          else Swal.fire('Error!', res.payload || 'Failed to delete.', 'error');
        });
      }
    });
  };

  useEffect(() => {
    dispatch(fetchGst({
      page: urlPage,
      limit: itemsPerPage,
      search,
    }));
  }, [dispatch, urlPage, itemsPerPage, search]);

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center justify-content-between">
        <div>
          <h1 className="page-title">GST Master</h1>
          <p className="page-subtitle">Manage GST registration numbers</p>
        </div>
        <Link to="/gst/add" className="btn-accent">
          <i className="bi bi-plus-circle-fill me-2" /> Add GST
        </Link>
      </div>

      <div className="dash-card">
        <div className="dash-card-header d-flex align-items-center justify-content-between p-3 border-bottom bg-white">
          <div className="d-flex align-items-center gap-2 text-muted small fw-500">
            <span>Show</span>
            <select
              className="form-select form-select-sm shadow-none border-light-subtle bg-light"
              style={{ width: 70, borderRadius: 8, cursor: 'pointer' }}
              value={itemsPerPage}
              onChange={(e) => {
                setSearchParams({ page: 1 });
                setItemsPerPage(Number(e.target.value));
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <span>entries</span>
          </div>
          <div className="search-input-wrapper position-relative">
            <i className="bi bi-search text-muted position-absolute top-50 start-0 translate-middle-y ms-3" style={{ pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-control form-control-sm border-light-subtle bg-light ps-5 py-2 shadow-none"
              placeholder="Search by GST number..."
              value={search}
              onChange={(e) => {
                const val = e.target.value;
                dispatch(setSearchTerm(val));
                setSearchParams({ page: 1 });
              }}
              style={{ borderRadius: 10, fontSize: 13 }}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 dash-table">
            <thead className="bg-light">
              <tr>
                <th className="py-3 ps-4 text-muted small text-uppercase" style={{ width: '40%' }}>GST Number</th>
                <th className="py-3 text-muted small text-uppercase text-center">Status</th>
                <th className="py-3 pe-4 text-muted small text-uppercase text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="3" className="text-center py-5">
                    <div className="spinner-border text-primary" role="status" />
                  </td>
                </tr>
              ) : gstList.length === 0 ? (
                <tr>
                  <td colSpan="3" className="text-center py-5">
                    <div className="empty-state">
                      <i className="bi bi-inbox text-muted" style={{ fontSize: '2rem' }}></i>
                      <p className="mt-2 text-muted">No GST entries found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                gstList.map((gst) => (
                  <tr key={gst._id}>
                    <td className="ps-4">
                      <div className="d-flex align-items-center gap-3">
                        <div className="avatar-sm rounded-circle d-flex align-items-center justify-content-center text-white fw-bold shadow-sm" style={{ background: 'linear-gradient(135deg,#00aeef,#008ecc)' }}>
                          #
                        </div>
                        <span className="fw-bold text-dark">{gst.gstNumber}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      <span className={`badge rounded-pill ${gst.status ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}>
                        {gst.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="pe-4 text-end">
                      <div className="btn-group shadow-sm" style={{ borderRadius: 8 }}>
                        <Link to={`/gst/edit/${gst._id}`} className="btn btn-sm btn-light border-light-subtle text-primary">
                          <i className="bi bi-pencil-square" />
                        </Link>
                        <button onClick={() => handleDelete(gst._id, gst.gstNumber)} className="btn btn-sm btn-light border-light-subtle text-danger">
                          <i className="bi bi-trash3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalPages > 1 && (
          <div className="dash-card-footer p-3 border-top d-flex align-items-center justify-content-between bg-light">
            <div className="text-muted small">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, total)} of {total} entries
            </div>
            <div className="pagination-wrapper">
              <ul className="pagination pagination-sm mb-0">
                <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                  <button className="page-link shadow-none" onClick={() => setSearchParams({ page: currentPage - 1 })}>
                    <i className="bi bi-chevron-left"></i>
                  </button>
                </li>
                {[...Array(totalPages)].map((_, i) => (
                  <li key={i} className={`page-item ${currentPage === i + 1 ? 'active' : ''}`}>
                    <button className="page-link shadow-none" onClick={() => setSearchParams({ page: i + 1 })}>
                      {i + 1}
                    </button>
                  </li>
                ))}
                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                  <button className="page-link shadow-none" onClick={() => setSearchParams({ page: currentPage + 1 })}>
                    <i className="bi bi-chevron-right"></i>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
