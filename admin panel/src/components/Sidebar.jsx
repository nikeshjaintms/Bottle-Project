import { NavLink, useLocation } from 'react-router-dom';
import { useContext, useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchUnits } from '../redux/slices/unitSlice';
import { getUnitNumberByName } from '../utils/unitMapper';
import { AbilityContext, Can } from '../context/AbilityContext';
import { useMaintenance } from '../context/MaintenanceContext';
import { PO_REQUIRED_COMPANY } from '../config/incomingConfig';
import logo from '../assets/hero.png';

const navItems = [
  {
    section: 'Main',
    links: [
      { to: '/', icon: 'bi-grid-1x2-fill', label: 'Dashboard', action: 'sidebar', subject: 'dashboard' },
    ],
  },
  {
    section: 'Management',
    links: [
      { to: '/users', icon: 'bi-people-fill', label: 'Users', action: 'sidebar', subject: 'user' },
      { to: '/shifts', icon: 'bi-clock-fill', label: 'Shift', action: 'sidebar', subject: 'shift', moduleKey: 'master_data' },
      { to: '/operators', icon: 'bi-person-badge-fill', label: 'Operator Name', action: 'sidebar', subject: 'operator', moduleKey: 'master_data' },
      { to: '/units', icon: 'bi-hdd-network-fill', label: 'Units', action: 'sidebar', subject: 'unit', moduleKey: 'master_data' },
      { to: '/raw-materials', icon: 'bi-box-seam', label: 'Raw Material', action: 'sidebar', subject: 'raw-material', moduleKey: 'master_data' },
      { to: '/item-types', icon: 'bi-tags', label: 'Item Types', action: 'sidebar', subject: 'itemType', moduleKey: 'master_data' },
      { to: '/companies', icon: 'bi-building-fill', label: 'Companies', action: 'sidebar', subject: 'company', moduleKey: 'master_data' },
      { to: '/company-addresses', icon: 'bi-geo-alt-fill', label: 'Company Addresses', action: 'sidebar', subject: 'company-address', moduleKey: 'master_data' },
      { to: '/brands', icon: 'bi-award-fill', label: 'Brands', action: 'sidebar', subject: 'brand', moduleKey: 'master_data' },
      { to: '/bottle-per-box', icon: 'bi-box-fill', label: 'Bottle Per Box', action: 'sidebar', subject: 'bottleperbox', moduleKey: 'master_data' },

      { to: '/printing-types', icon: 'bi-printer-fill', label: 'Printing Types', action: 'sidebar', subject: 'printing-type', moduleKey: 'master_data' },
      { to: '/printing-colors', icon: 'bi-palette-fill', label: 'Printing Colors', action: 'sidebar', subject: 'printing-color', moduleKey: 'master_data' },
      { to: '/bottle-specs', icon: 'bi-droplet-fill', label: 'Bottle Specs', action: 'sidebar', subject: 'bottlespec', moduleKey: 'master_data' },
      { to: '/variants', icon: 'bi-layers-fill', label: 'Variants', action: 'sidebar', subject: 'variant', moduleKey: 'master_data' },
      { to: '/productions', icon: 'bi-box-seam-fill', label: 'Printing Production', action: 'sidebar', subject: 'production', moduleKey: 'production' },
      { to: '/coating-types', icon: 'bi-brush-fill', label: 'Coating Types', action: 'sidebar', subject: 'coating-type', moduleKey: 'master_data' },
      { to: '/coating-specs', icon: 'bi-shield-shaded', label: 'Coating Specs', action: 'sidebar', subject: 'coatingspec', moduleKey: 'master_data' },
      {
        icon: 'bi-box-fill',
        label: 'Coating Production',
        action: 'sidebar',
        subject: 'coatingproduction',
        moduleKey: 'production',
        subLinks: [
          { to: '/coating-productions/unit/1', label: '1 Unit', icon: 'bi-1-circle-fill' },
          { to: '/coating-productions/unit/2', label: '2 Unit', icon: 'bi-2-circle-fill' },
          { to: '/coating-productions/unit/3', label: '3 Unit', icon: 'bi-3-circle-fill' },
          { to: '/coating-productions/unit/4', label: '4 Unit', icon: 'bi-4-circle-fill' },
        ]
      },
      { to: '/formulas', icon: 'bi-funnel-fill', label: 'Formula', action: 'sidebar', subject: 'formula', moduleKey: 'master_data' },
      { to: '/stock-summary', icon: 'bi-box-seam', label: 'Stock Entry', action: 'sidebar', subject: 'stock_entry', moduleKey: 'stock_entry' },
      {
        icon: 'bi-tags-fill',
        label: 'SG Labels',
        action: 'sidebar',
        subject: 'sg-label',
        moduleKey: 'master_data',
        subLinks: [
          { to: '/sg-labels', label: 'SG Label', icon: 'bi-tag-fill', action: 'read', subject: 'sg-label' },
          { to: '/sg-labels-2', label: 'SG Label 2', icon: 'bi-sticky-fill', action: 'read', subject: 'sg-label-2' }
        ]
      },
      {
        icon: 'bi-box-arrow-in-down-right',
        label: 'Incoming',
        action: 'sidebar',
        subject: 'incoming',
        moduleKey: 'incoming',
        subLinks: [
          { to: '/incoming', label: 'Incoming', icon: 'bi-list-ul', action: 'read', subject: 'incoming' },
          { to: `/shreno-incoming`, label: 'Shreno Incoming', icon: 'bi-building-fill-down', action: 'read', subject: 'shreno-incoming' }
        ]
      },
      { to: '/lacquer-plan', icon: 'bi-calendar-check-fill', label: 'Lacquer Plan', action: 'sidebar', subject: 'lacquerplan', moduleKey: 'lacquer_plan' },
      { to: '/printing-plan', icon: 'bi-printer-fill', label: 'Printing Plan', action: 'sidebar', subject: 'printingplan', moduleKey: 'printing_plan' },
      { to: '/dispatch', icon: 'bi-truck', label: 'Dispatch', action: 'sidebar', subject: 'dispatch', moduleKey: 'dispatch' },
      { to: '/ready-to-dispatch', icon: 'bi-box-seam', label: 'Ready to Dispatch', action: 'sidebar', subject: 'ready-to-dispatch', moduleKey: 'dispatch' },
      {
        icon: 'bi-receipt-cutoff',
        label: 'Delivery Challan',
        action: 'sidebar',
        subject: 'delivery-challan',
        moduleKey: 'delivery_challan',
        subLinks: [
          { to: '/delivery-challan/mcnore', label: 'Mcnore', icon: 'bi-file-earmark-text', action: 'read', subject: 'delivery-challan' },
          { to: '/delivery-challan/sherno', label: 'Sherno', icon: 'bi-file-earmark-text', action: 'read', subject: 'delivery-challan' },
          { to: '/delivery-challan/shayoona', label: 'Shayoona', icon: 'bi-file-earmark-text', action: 'read', subject: 'delivery-challan' }
        ]
      },
      { to: '/summary', icon: 'bi-file-earmark-diff', label: 'Summary', action: 'sidebar', subject: 'summary', moduleKey: 'summary' },
    ],
  },
  {
    section: 'System',
    links: [
      { to: '/permissions', icon: 'bi-key-fill', label: 'Permissions', action: 'sidebar', subject: 'permission' },
      { to: '/roles', icon: 'bi-shield-lock-fill', label: 'Roles', action: 'sidebar', subject: 'role' },
      { to: '/maintenance', icon: 'bi-cone-striped', label: 'Maintenance Mode', action: 'sidebar', subject: 'role' },
    ],
  },
];

export default function Sidebar({ collapsed, onClose }) {
  const ability = useContext(AbilityContext);
  const { isModuleBlocked, maintenance } = useMaintenance();
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState({});
  const dispatch = useDispatch();
  const { units } = useSelector((state) => state.units || { units: [] });

  useEffect(() => {
    dispatch(fetchUnits({ limit: 1000 }));
  }, [dispatch]);

  const dynamicNavItems = useMemo(() => {
    const activeUnits = (units || []).filter(u => u.status !== false && !u.isDeleted);

    const coatingProductionSubLinks = activeUnits
      .map(u => {
        const num = getUnitNumberByName(u.name);
        return {
          to: `/coating-productions/unit/${num}`,
          label: `${num} Unit`,
          icon: `bi-${num}-circle-fill`,
          action: 'sidebar',
          subject: 'coatingproduction',
          unitName: u.name
        };
      })
      .sort((a, b) => {
        const numA = parseInt(a.label);
        const numB = parseInt(b.label);
        return numA - numB;
      });

    return navItems.map(section => {
      if (section.section === 'Management') {
        return {
          ...section,
          links: section.links.map(link => {
            if (link.subject === 'coatingproduction') {
              return {
                ...link,
                subLinks: coatingProductionSubLinks.length > 0 ? coatingProductionSubLinks : link.subLinks
              };
            }
            return link;
          })
        };
      }
      return section;
    });
  }, [units]);

  useEffect(() => {
    const currentPath = location.pathname;
    const newExpanded = {};
    dynamicNavItems.forEach(section => {
      section.links.forEach(link => {
        if (link.subLinks) {
          const isChildActive = link.subLinks.some(sub => currentPath.startsWith(sub.to));
          if (isChildActive) {
            newExpanded[link.label] = true;
          }
        }
      });
    });
    setExpandedMenus(newExpanded);
  }, [location.pathname, dynamicNavItems]);

  const toggleMenu = (label) => {
    setExpandedMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand */}
      <div className="sidebar-brand" style={{ justifyContent: 'space-between', position: 'relative', overflow: 'visible' }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <img src={logo} alt="Logo" style={{ height: '60px', transform: 'scale(1.8) translateY(3px)', maxWidth: '100%', objectFit: 'contain' }} />
        </div>
        <button className="mobile-close-btn btn btn-sm btn-link text-white shadow-none p-0" onClick={onClose} style={{ position: 'absolute', right: '15px' }}>
          <i className="bi bi-x-lg fs-5"></i>
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {dynamicNavItems.map((section) => {
          const visibleLinks = section.links.filter(link => {
            if (link.subLinks) {
              return link.subLinks.some(sub => ability.can(sub.action || 'read', sub.subject || link.subject)) || ability.can(link.action || 'read', link.subject || 'all');
            }
            return ability.can(link.action || 'read', link.subject || 'all');
          });

          if (visibleLinks.length === 0) return null;

          return (
            <div key={section.section} className="mb-2">
              <div className="nav-section-title">{section.section}</div>
              {visibleLinks.map((link) => {
                const isBlocked = link.moduleKey && isModuleBlocked(link.moduleKey)?.blocked;

                if (link.subLinks) {
                  const isExpanded = expandedMenus[link.label];
                  return (
                    <div key={link.label} className="nav-item-container">
                      <div
                        className="nav-item d-flex align-items-center"
                        onClick={() => toggleMenu(link.label)}
                        style={{ cursor: 'pointer' }}
                      >
                        <i className={`bi ${link.icon} nav-icon me-2`} />
                        <span className="nav-label">{link.label}</span>
                        {isBlocked && (
                          <span
                            className="badge bg-warning text-dark ms-2"
                            style={{ fontSize: '9px', padding: '2px 5px' }}
                            title="Under Maintenance"
                          >
                            Maint
                          </span>
                        )}
                        <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} ms-auto`} style={{ fontSize: '0.8rem' }} />
                      </div>
                      {isExpanded && (
                        <div className="nav-sub-menu ps-4 pb-2">
                          {link.subLinks.map(sub => (
                            <Can key={sub.to} I={sub.action || 'read'} a={sub.subject || link.subject}>
                              <NavLink
                                to={sub.to}
                                onClick={onClose}
                                className={({ isActive }) => `nav-item nav-sub-item ${isActive ? 'active' : ''}`}
                                style={{ padding: '0.5rem 1rem', marginTop: '0.2rem' }}
                              >
                                {sub.icon && <i className={`bi ${sub.icon} nav-icon me-2`} />}
                                <span className="nav-label">{sub.label}</span>
                              </NavLink>
                            </Can>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    onClick={onClose}
                    className={({ isActive }) => `nav-item d-flex align-items-center ${isActive ? 'active' : ''}`}
                  >
                    <i className={`bi ${link.icon} nav-icon me-2`} />
                    <span className="nav-label">{link.label}</span>
                    {isBlocked && (
                      <span
                        className="badge bg-warning text-dark ms-auto"
                        style={{ fontSize: '9px', padding: '2px 5px' }}
                        title="Under Maintenance"
                      >
                        Maint
                      </span>
                    )}
                    {link.badge && <span className="nav-badge ms-auto">{link.badge}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
