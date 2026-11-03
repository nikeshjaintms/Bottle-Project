import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSingleUser, updateUserStatus } from '../../redux/slices/userSlice';
import { getFullImageUrl } from '../../utils/imageUrl';
import Swal from 'sweetalert2';

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { singleUser: user, loading } = useSelector((state) => state.users);

  useEffect(() => {
    dispatch(fetchSingleUser(id));
  }, [dispatch, id]);

  const toggleStatus = () => {
    if (!user) return;
    const newStatus = user.status === 'active' ? 'inactive' : 'active';

    Swal.fire({
      title: `Make ${newStatus.toUpperCase()}?`,
      text: `User will be marked as ${newStatus}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: user.status === 'active' ? '#e91e63' : '#007236',
      cancelButtonColor: '#64748b',
      confirmButtonText: `Yes, ${newStatus}`
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(updateUserStatus({ id, status: newStatus })).then((res) => {
          if (!res.error) {
            Swal.fire('Updated!', `User is now ${newStatus}.`, 'success');
          } else {
            Swal.fire('Error!', res.payload || 'Failed to update status.', 'error');
          }
        });
      }
    });
  };

  if (loading && !user) return <div className="p-5 text-center"><div className="spinner-border text-primary"></div></div>;
  if (!user) return <div className="p-5 text-center text-muted">User not found</div>;

  const imageUrl = getFullImageUrl(user.image);

  return (
    <div className="page-content">
      <div className="page-header d-flex align-items-center gap-3 user-detail-page-header">
        <Link to="/users" className="btn-ghost" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div>
          <h1 className="page-title">User Detail</h1>
          <p className="page-subtitle">{user.name}</p>
        </div>
      </div>

      <div className="row mt-4 justify-content-center">
        <div className="col-lg-8">
          <div className="dash-card">
            <div className="dash-card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <h5 className="mb-0 fw-bold">User Information</h5>
              <button
                type="button"
                onClick={toggleStatus}
                disabled={loading}
                className={`btn btn-sm px-4 py-2 fw-bold rounded-pill shadow-none ${user.status === 'active' ? 'btn-outline-danger' : 'btn-outline-success'}`}
                style={{ fontSize: 12 }}
              >
                {loading ? 'Processing...' : (user.status === 'active' ? 'MARK INACTIVE' : 'MARK ACTIVE')}
              </button>
            </div>
            <div className="dash-card-body p-4">
              {/* Avatar + name */}
              <div className="d-flex align-items-center gap-4 mb-4 pb-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
                <div style={{
                  width: 100, height: 100, borderRadius: '50%', flexShrink: 0,
                  background: imageUrl ? 'transparent' : 'linear-gradient(135deg,#00aeef,#008ecc)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 40, fontWeight: 700, color: '#fff', overflow: 'hidden',
                  border: '3px solid rgba(0, 174, 239, 0.2)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                }}>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={user.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextElementSibling) {
                          e.target.nextElementSibling.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div style={{ 
                    display: imageUrl ? 'none' : 'flex',
                    width: '100%',
                    height: '100%',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                </div>
                <div>
                  <div className="fw-bold fs-5">{user.name}</div>
                  <div className="text-muted small">{user.email}</div>
                </div>
              </div>

              {/* Detail fields grid */}
              <div className="row g-3">
                <div className="col-sm-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Role</span>
                    <span className="fw-bold fs-6">{typeof user.role === 'object' ? user.role.name : (user.role || 'N/A')}</span>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Status</span>
                    <span className={`badge-status badge-${user.status || 'pending'}`}>
                      {(user.status || 'pending').toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Email</span>
                    <span className="fw-semibold" style={{ wordBreak: 'break-all' }}>{user.email}</span>
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="p-3 bg-light rounded-4 border border-light-subtle">
                    <span className="text-uppercase small fw-bold text-muted d-block mb-1">Joined</span>
                    <span className="fw-semibold">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="d-flex flex-wrap gap-2 mt-4">
                <Link to={`/users/edit/${user._id}`} className="btn-accent px-4 py-2 rounded-3">
                  <i className="bi bi-pencil-square me-2" /> Edit User
                </Link>
                <Link to="/users" className="btn-ghost px-4 py-2 rounded-3">
                  Back to Users
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
