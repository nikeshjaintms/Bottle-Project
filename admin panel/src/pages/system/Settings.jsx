import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { useMaintenance } from '../../context/MaintenanceContext';

const sections = [
  { id: 'profile',        icon: 'bi-person-circle',      label: 'Profile' },
  { id: 'notifications',  icon: 'bi-bell',               label: 'Notifications' },
  { id: 'security',       icon: 'bi-shield-lock',        label: 'Security' },
  { id: 'appearance',     icon: 'bi-palette',            label: 'Appearance' },
  { id: 'maintenance',    icon: 'bi-cone-striped',       label: 'Maintenance Mode' },
  { id: 'billing',        icon: 'bi-credit-card',        label: 'Billing' },
  { id: 'integrations',   icon: 'bi-plug',               label: 'Integrations' },
];

function Toggle({ on, onToggle }) {
  return (
    <button className={`toggle-switch ${on ? 'on' : ''}`} onClick={onToggle}>
      <span className="toggle-knob" />
    </button>
  );
}

export default function Settings() {
  const [active, setActive] = useState('profile');
  const [notifs, setNotifs] = useState({ email: true, push: false, reports: true, security: true });
  const [theme, setTheme] = useState('dark');
  const { user } = useSelector((state) => state.auth);

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account preferences</p>
      </div>

      <div className="row g-3">
        {/* Sidebar Nav */}
        <div className="col-md-3">
          <div className="dash-card" style={{ padding: '10px' }}>
            {sections.map(s => (
              <button key={s.id} onClick={() => setActive(s.id)}
                className={`nav-item w-100 ${active === s.id ? 'active' : ''}`}
                style={{ border:'none', background:'none', textAlign:'left' }}>
                <i className={`bi ${s.icon} nav-icon`} />
                <span className="nav-label">{s.label}</span>
                {active === s.id && <i className="bi bi-chevron-right ms-auto" style={{ fontSize:12 }} />}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="col-md-9">
          {active === 'profile' && (
            <div className="dash-card">
              <div className="dash-card-header"><span className="dash-card-title">Profile Information</span></div>
              <div className="dash-card-body">
                <div className="d-flex align-items-center gap-4 mb-4">
                  <div style={{
                    width:80, height:80, borderRadius:18,
                    background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:32, fontWeight:700, color:'white', flexShrink:0,
                  }}>{user?.name?.charAt(0) || 'A'}</div>
                  <div>
                    <h5 style={{ color:'var(--text-primary)', marginBottom:4 }}>{user?.name || 'Admin User'}</h5>
                    <p style={{ color:'var(--text-muted)', fontSize:13, margin:0 }}>{user?.role || 'Super Administrator'}</p>
                    <button className="btn-ghost mt-2" style={{ fontSize:12, padding:'6px 14px' }}>
                      <i className="bi bi-upload" /> Upload Photo
                    </button>
                  </div>
                </div>
                <div className="row g-3">
                  <div className="col-md-12">
                    <label style={{ fontSize:12, color:'var(--text-muted)', marginBottom:6, display:'block', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>Full Name</label>
                    <input defaultValue={user?.name} style={{
                      width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid var(--card-border)',
                      borderRadius:10, padding:'10px 14px', color:'var(--text-primary)', fontSize:14, outline:'none',
                    }} />
                  </div>
                  <div className="col-md-6">
                    <label style={{ fontSize:12, color:'var(--text-muted)', marginBottom:6, display:'block', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>Email</label>
                    <input defaultValue={user?.email} disabled style={{
                      width:'100%', background:'rgba(255,255,255,0.02)', border:'1px solid var(--card-border)',
                      borderRadius:10, padding:'10px 14px', color:'var(--text-muted)', fontSize:14, outline:'none',
                    }} />
                  </div>
                  <div className="col-md-6">
                    <label style={{ fontSize:12, color:'var(--text-muted)', marginBottom:6, display:'block', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>Role</label>
                    <input defaultValue={user?.role} disabled style={{
                      width:'100%', background:'rgba(255,255,255,0.02)', border:'1px solid var(--card-border)',
                      borderRadius:10, padding:'10px 14px', color:'var(--text-muted)', fontSize:14, outline:'none',
                    }} />
                  </div>
                </div>
                <div className="d-flex gap-2 mt-4">
                  <button className="btn-accent"><i className="bi bi-check2" /> Save Changes</button>
                  <button className="btn-ghost">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {active === 'notifications' && (
            <div className="dash-card">
              <div className="dash-card-header"><span className="dash-card-title">Notification Preferences</span></div>
              <div className="dash-card-body">
                {[
                  { key:'email',    icon:'bi-envelope-fill',      label:'Email Notifications',   desc:'Receive updates via email' },
                  { key:'push',     icon:'bi-phone-fill',          label:'Push Notifications',    desc:'Browser push alerts' },
                  { key:'reports',  icon:'bi-file-earmark-fill',   label:'Weekly Reports',        desc:'Get weekly analytics digest' },
                  { key:'security', icon:'bi-shield-check-fill',   label:'Security Alerts',       desc:'Login and threat notifications' },
                ].map(n => (
                  <div key={n.key} className="d-flex align-items-center justify-content-between py-3"
                    style={{ borderBottom:'1px solid var(--card-border)' }}>
                    <div className="d-flex align-items-center gap-3">
                      <div style={{ width:40, height:40, borderRadius:10, background:'rgba(99,102,241,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <i className={`bi ${n.icon}`} style={{ color:'var(--accent)', fontSize:17 }} />
                      </div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14, color:'var(--text-primary)' }}>{n.label}</div>
                        <div style={{ fontSize:12, color:'var(--text-muted)' }}>{n.desc}</div>
                      </div>
                    </div>
                    <Toggle on={notifs[n.key]} onToggle={() => setNotifs(p => ({ ...p, [n.key]: !p[n.key] }))} />
                  </div>
                ))}
                <button className="btn-accent mt-4"><i className="bi bi-check2" /> Save Preferences</button>
              </div>
            </div>
          )}

          {active === 'security' && (
            <div className="dash-card">
              <div className="dash-card-header"><span className="dash-card-title">Security Settings</span></div>
              <div className="dash-card-body">
                <h6 style={{ color:'var(--text-primary)', marginBottom:16 }}>Change Password</h6>
                <div className="row g-3 mb-4">
                  {['Current Password','New Password','Confirm Password'].map((l,i)=>(
                    <div className="col-12" key={i}>
                      <label style={{ fontSize:12, color:'var(--text-muted)', marginBottom:6, display:'block', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>{l}</label>
                      <input type="password" placeholder="••••••••" style={{
                        width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid var(--card-border)',
                        borderRadius:10, padding:'10px 14px', color:'var(--text-primary)', fontSize:14, outline:'none',
                      }} />
                    </div>
                  ))}
                </div>
                <button className="btn-accent mb-4"><i className="bi bi-key-fill" /> Update Password</button>
                <hr style={{ borderColor:'var(--card-border)' }} />
                <h6 style={{ color:'var(--text-primary)', margin:'16px 0' }}>Two-Factor Authentication</h6>
                <div className="d-flex align-items-center justify-content-between p-3" style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12 }}>
                  <div>
                    <div style={{ fontWeight:600, color:'#10b981' }}>2FA is Enabled</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)' }}>Authenticator app configured</div>
                  </div>
                  <button className="btn-ghost" style={{ fontSize:12 }}>Manage</button>
                </div>
              </div>
            </div>
          )}

          {active === 'appearance' && (
            <div className="dash-card">
              <div className="dash-card-header"><span className="dash-card-title">Appearance</span></div>
              <div className="dash-card-body">
                <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:20 }}>Choose your preferred theme and display settings.</p>
                <div className="row g-3 mb-4">
                  {['dark','light','auto'].map(t => (
                    <div className="col-md-4" key={t}>
                      <div onClick={() => setTheme(t)} style={{
                        background: theme===t ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `2px solid ${theme===t ? 'var(--accent)' : 'var(--card-border)'}`,
                        borderRadius:14, padding:'20px 16px', cursor:'pointer', textAlign:'center', transition:'all .2s',
                      }}>
                        <i className={`bi ${t==='dark'?'bi-moon-stars-fill':t==='light'?'bi-sun-fill':'bi-circle-half'}`}
                          style={{ fontSize:28, color: theme===t ? 'var(--accent)' : 'var(--text-muted)', marginBottom:10, display:'block' }} />
                        <div style={{ fontWeight:600, color: theme===t ? 'var(--accent)' : 'var(--text-secondary)', textTransform:'capitalize' }}>{t}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn-accent"><i className="bi bi-check2" /> Apply Theme</button>
              </div>
            </div>
          )}

                    {active === 'maintenance' && (
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">System &amp; Module Maintenance</span>
              </div>
              <div className="dash-card-body p-4">
                <p className="text-muted" style={{ fontSize: '14px' }}>
                  Control granular ERP module downtime or global maintenance mode while allowing administrators to work unimpeded.
                </p>
                <div className="d-flex align-items-center gap-3 p-3 rounded-3 mb-4" style={{ background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <i className="bi bi-cone-striped text-warning fs-3" />
                  <div>
                    <h6 className="mb-1 fw-bold text-dark">Dedicated Maintenance Control Center</h6>
                    <div className="text-muted small">
                      Selectively pause modules (like Lacquer Plan or Stock Entry) during audits without shutting down the entire factory.
                    </div>
                  </div>
                </div>
                <Link to="/maintenance" className="btn-accent px-4 py-2 text-white text-decoration-none d-inline-flex align-items-center gap-2">
                  <i className="bi bi-sliders2-vertical" /> Open Maintenance Control Center
                </Link>
              </div>
            </div>
          )}

          {(active === 'billing' || active === 'integrations') && (
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">{sections.find(s=>s.id===active)?.label}</span>
              </div>
              <div className="dash-card-body" style={{ textAlign:'center', padding:'60px 20px' }}>
                <i className="bi bi-tools" style={{ fontSize:48, color:'var(--text-muted)', display:'block', marginBottom:16 }} />
                <h5 style={{ color:'var(--text-primary)' }}>Coming Soon</h5>
                <p style={{ color:'var(--text-muted)', fontSize:14 }}>This section is under construction.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
