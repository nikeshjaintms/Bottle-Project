import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchPermissions } from '../../redux/slices/permissionSlice';
import { createRole, updateRole, fetchRoles } from '../../redux/slices/roleSlice';
import Swal from 'sweetalert2';

export default function CreateRole() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { permissions, loading: permissionsLoading } = useSelector((state) => state.permissions);
  const { roles, loading: rolesLoading } = useSelector((state) => state.roles);

  const [roleName, setRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState([]);

  useEffect(() => {
    dispatch(fetchPermissions());
    if (id) {
      // If roles aren't loaded, fetch them first
      if (roles.length === 0) {
        dispatch(fetchRoles());
      }
    }
  }, [dispatch, id, roles.length]);

  useEffect(() => {
    if (id && roles.length > 0) {
      const role = roles.find(r => r._id === id);
      if (role) {
        setRoleName(role.name);
        setSelectedPermissions(role.permissions.map(p => typeof p === 'object' ? p._id : p));
      }
    }
  }, [id, roles]);

  const handleTogglePermission = (pId) => {
    if (selectedPermissions.includes(pId)) {
      setSelectedPermissions(selectedPermissions.filter(item => item !== pId));
    } else {
      setSelectedPermissions([...selectedPermissions, pId]);
    }
  };

  const handleSubmit = () => {
    if (!roleName) return Swal.fire('Error', 'Role name is required', 'error');
    if (selectedPermissions.length === 0) return Swal.fire('Error', 'At least one permission must be selected', 'error');

    const roleData = {
      name: roleName,
      permissions: selectedPermissions
    };

    const action = id ? updateRole({ id, roleData }) : createRole(roleData);

    dispatch(action).then((res) => {
      if (!res.error) {
        Swal.fire('Success!', `Role ${id ? 'updated' : 'created'} successfully`, 'success');
        navigate('/roles');
      } else {
        Swal.fire('Error', res.payload || 'Operation failed', 'error');
      }
    });
  };

  if (permissionsLoading || (id && rolesLoading)) {
    return (
      <div className="page-content rbac-role-page d-flex align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" />
          <p className="text-muted">Loading data...</p>
        </div>
      </div>
    );
  }

  const groupOrder = [
    'dashboard', 'user', 'operator', 'shift', 'unit', 'company', 'brand', 'printing-type', 'printing-color', 'bottlespec', 'variant', 'formula', 'production', 'incoming', 'coating-type', 'coatingspec', 'coatingproduction', 'permission', 'role', 'vision', 'all'
  ];

  const groupedPermissions = permissions.reduce((acc, p) => {
    let subject = 'other';
    const parts = p.name.split('-');

    if (p.name === 'manage-all') {
      subject = 'all';
    } else if (p.name === 'use-vision') {
      subject = 'vision';
    } else if (parts.length > 1) {
      subject = parts.slice(1).join('-');
    }

    // Group detail permissions into their parent subject
    if (subject === 'bottlespecdetail') subject = 'bottlespec';
    if (subject === 'productiondetail') subject = 'production';
    if (subject === 'coatingproductiondetail') subject = 'coatingproduction';
    if (p.name === 'production-date-validation') subject = 'production';
    if (p.name === 'coating-production-date-validation') subject = 'coatingproduction';
    if (p.name === 'production-record-unlock') subject = 'production';
    if (p.name === 'coating-production-record-unlock') subject = 'coatingproduction';

    if (!acc[subject]) acc[subject] = [];
    acc[subject].push(p);
    return acc;
  }, {});

  const sortedSubjects = Object.keys(groupedPermissions).sort((a, b) => {
    const idxA = groupOrder.indexOf(a);
    const idxB = groupOrder.indexOf(b);
    if (idxA === -1 && idxB === -1) return a.localeCompare(b);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  return (
    <div className="page-content rbac-role-page">
      <div className="page-header d-flex align-items-center gap-3 brand-form-page-header mb-4">
        <Link to="/roles" className="btn-ghost brand-form-back" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="bi bi-arrow-left" style={{ fontSize: 20 }} />
        </Link>
        <div className="min-w-0">
          <h1 className="page-title mb-0">{id ? 'Edit Role' : 'Create Role'}</h1>
          <p className="page-subtitle mb-0">Assign permissions to this role</p>
        </div>
      </div>

      <div className="dash-card border-0 shadow-sm brand-form-card rbac-role-form-card">
        <div className="dash-card-body p-4 brand-form-body">
          <div className="mb-4">
            <label className="form-label small fw-500 text-muted mb-2">Role<span className="text-danger">*</span></label>
            <input
              type="text"
              className="form-control custom-input-field rbac-role-name-input"
              placeholder="e.g. Staff"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              style={{ borderRadius: 12, height: 42 }}
            />
          </div>

          <div className="mb-4 mt-5 border-bottom pb-2 d-flex justify-content-between align-items-center">
            <h5 className="mb-0 fw-bold text-dark">Permissions Assignment</h5>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary rounded-pill px-3"
              onClick={() => setSelectedPermissions(selectedPermissions.length === permissions.length ? [] : permissions.map(p => p._id))}
            >
              {selectedPermissions.length === permissions.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="permissions-container">
            {sortedSubjects.map(subject => (
              <div key={subject} className="mb-4 bg-light p-3 rounded-4 border border-light-subtle">
                <h6 className="text-uppercase text-accent fw-bold mb-3 d-flex align-items-center" style={{ fontSize: 13, letterSpacing: 0.5 }}>
                  <i className="bi bi-shield-check me-2 fs-5"></i>
                  {subject.replace('-', ' ')} Permissions
                </h6>
                <div className="row g-3 rbac-permissions-grid">
                  {groupedPermissions[subject].map((p) => (
                    <div className="col-12 col-sm-6 col-md-4 col-lg-3" key={p._id}>
                      <div className="rbac-permission-item form-check form-switch d-flex align-items-center gap-2 p-3 rounded-3 bg-white border h-100 transition-all hover-shadow-sm">
                        <input
                          className="form-check-input shadow-none cursor-pointer flex-shrink-0 m-0"
                          type="checkbox"
                          role="switch"
                          id={`switch-${p._id}`}
                          checked={selectedPermissions.includes(p._id)}
                          onChange={() => handleTogglePermission(p._id)}
                          style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                        />
                        <label className="form-check-label small text-dark cursor-pointer rbac-permission-label mb-0 fw-600 text-truncate ms-1" htmlFor={`switch-${p._id}`} title={p.name}>
                          {p.name}
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-2 d-flex gap-2 brand-form-actions rbac-form-actions">
            <button type="button" className="btn rbac-btn-submit py-3 flex-grow-1 border-0 shadow-sm" onClick={handleSubmit}>
              Submit
            </button>
            <button type="button" className="btn rbac-btn-cancel py-3 border-0 shadow-sm" onClick={() => navigate('/roles')}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


