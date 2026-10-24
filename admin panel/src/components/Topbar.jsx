import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import userAvatar from '../assets/hero.png';

export default function Topbar({ collapsed, onToggle, onLogout }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const userRole = typeof user?.role === 'object' ? user.role.name : user?.role;
  const displayName = user?.name || (userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'Admin');

  const goToChangePassword = () => {
    setShowDropdown(false);
    navigate('/change-password');
  };

  return (
    <header className="topbar no-print">
      <button className="topbar-toggle" onClick={onToggle} title="Toggle Sidebar">
        <i className={`bi ${collapsed ? 'bi-layout-sidebar' : 'bi-layout-sidebar-inset'}`} />
      </button>

      <div className="ms-auto topbar-actions">
        <div
          className="user-dropdown"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <div className="topbar-avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <span className="user-name-text">Hi, {displayName}</span>
          <i className={`bi bi-chevron-down ms-2 ${showDropdown ? 'rotate-180' : ''}`} style={{ fontSize: '10px', color: 'var(--text-muted)', transition: 'transform 0.2s' }} />

          <div
            className={`dropdown-menu ${showDropdown ? 'show' : ''}`}
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
          >
            <div className="px-3 py-2 border-bottom">
              <p className="mb-0 fw-bold text-white" style={{ fontSize: '13px' }}>{displayName}</p>
              <p className="mb-0 text-muted" style={{ fontSize: '11px' }}>{user?.email || 'admin@nexus.io'}</p>
            </div>
            <button className="dropdown-item" onClick={goToChangePassword}>
              <i className="bi bi-shield-lock" />
              <span>Change Password</span>
            </button>
            <div className="dropdown-divider" />
            <button className="dropdown-item text-danger" onClick={() => {
              setShowDropdown(false);
              onLogout();
            }}>
              <i className="bi bi-box-arrow-right" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
