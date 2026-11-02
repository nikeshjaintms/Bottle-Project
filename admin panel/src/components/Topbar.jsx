import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';

const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  return `${import.meta.env.VITE_API_URL || 'https://application.shayonaglass.com/api'}/../${imagePath}`;
};

export default function Topbar({ collapsed, onToggle, onLogout }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const userRole = typeof user?.role === 'object' ? user.role.name : user?.role;
  const displayName = user?.name || (userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'Admin');
  const imageUrl = getImageUrl(user?.image);

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
          <div className="topbar-avatar" style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={displayName}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: imageUrl ? 'none' : 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 700,
                fontSize: 16
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
          <span className="user-name-text">Hi, {displayName}</span>
          <i className={`bi bi-chevron-down ms-2 ${showDropdown ? 'rotate-180' : ''}`} style={{ fontSize: '10px', color: 'var(--text-muted)', transition: 'transform 0.2s' }} />

          <div
            className={`dropdown-menu ${showDropdown ? 'show' : ''}`}
            onClick={(e) => e.stopPropagation()}
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
