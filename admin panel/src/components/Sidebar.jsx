import { NavLink, useLocation } from 'react-router-dom';
import { useContext, useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchUnits } from '../redux/slices/unitSlice';
import { getUnitNumberByName } from '../utils/unitMapper';
import { AbilityContext, Can } from '../context/AbilityContext';
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
      { to: '/shifts', icon: 'bi-clock-fill', label: 'Shift', action: 'sidebar', subject: 'shift' },
      { to: '/operators', icon: 'bi-person-badge-fill', label: 'Operator Name', action: 'sidebar', subject: 'operator' },
      { to: '/units', icon: 'bi-hdd-network-fill', label: 'Units', action: 'sidebar', subject: 'unit' },
      { to: '/raw-materials', icon: 'bi-box-seam', label: 'Raw Material', action: 'sidebar', subject: 'raw-material' },
      { to: '/item-types', icon: 'bi-tags', label: 'Item Types', action: 'sidebar', subject: 'itemType' },
      { to: '/companies', icon: 'bi-building-fill', label: 'Companies', action: 'sidebar', subject: 'company' },
      { to: '/brands', icon: 'bi-award-fill', label: 'Brands', action: 'sidebar', subject: 'brand' },
      { to: '/bottle-per-box', icon: 'bi-box-fill', label: 'Bottle Per Box', action: 'sidebar', subject: 'bottleperbox' },

      { to: '/printing-types', icon: 'bi-printer-fill', label: 'Printing Types', action: 'sidebar', subject: 'printing-type' },
      { to: '/printing-colors', icon: 'bi-palette-fill', label: 'Printing Colors', action: 'sidebar', subject: 'printing-color' },
      { to: '/bottle-specs', icon: 'bi-droplet-fill', label: 'Bottle Specs', action: 'sidebar', subject: 'bottlespec' },
      { to: '/variants', icon: 'bi-layers-fill', label: 'Variants', action: 'sidebar', subject: 'variant' },
      { to: '/productions', icon: 'bi-box-seam-fill', label: 'Printing Production', action: 'sidebar', subject: 'production' },
      { to: '/coating-types', icon: 'bi-brush-fill', label: 'Coating Types', action: 'sidebar', subject: 'coating-type' },
      { to: '/coating-specs', icon: 'bi-shield-shaded', label: 'Coating Specs', action: 'sidebar', subject: 'coatingspec' },
      {
        icon: 'bi-box-fill',
        label: 'Coating Production',
        action: 'sidebar',
        subject: 'coatingproduction',
        subLinks: [
          { to: '/coating-productions/unit/1', label: '1 Unit', icon: 'bi-1-circle-fill' },
          { to: '/coating-productions/unit/2', label: '2 Unit', icon: 'bi-2-circle-fill' },
          { to: '/coating-productions/unit/3', label: '3 Unit', icon: 'bi-3-circle-fill' },
          { to: '/coating-productions/unit/4', label: '4 Unit', icon: 'bi-4-circle-fill' },
        ]
      },
      { to: '/formulas', icon: 'bi-funnel-fill', label: 'Formula', action: 'sidebar', subject: 'formula' },
      { to: '/stock-summary', icon: 'bi-box-seam', label: 'Stock Entry', action: 'sidebar', subject: 'stock_entry' },
      {
        icon: 'bi-tags-fill',
        label: 'SG Labels',
        action: 'sidebar',
        subject: 'sg-label',
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
        subLinks: [
          { to: '/incoming', label: 'Incoming', icon: 'bi-list-ul', action: 'read', subject: 'incoming' },
          { to: `/shreno-incoming`, label: 'Shreno Incoming', icon: 'bi-building-fill-down', action: 'read', subject: 'incoming' }
        ]
      },
      { to: '/lacquer-plan', icon: 'bi-calendar-check-fill', label: 'Lacquer Plan', action: 'sidebar', subject: 'lacquerplan' },
      { to: '/printing-plan', icon: 'bi-printer-fill', label: 'Printing Plan', action: 'sidebar', subject: 'printingplan' },
      { to: '/dispatch', icon: 'bi-truck', label: 'Dispatch', action: 'sidebar', subject: 'dispatch' },
      { to: '/summary', icon: 'bi-file-earmark-diff', label: 'Summary', action: 'sidebar', subject: 'dispatch' },
      { to: '/pending-sheet', icon: 'bi-clipboard-check-fill', label: 'Ready Stock', action: 'sidebar', subject: 'pending-sheet' },

    ],
  },
  {
    section: 'System',
    links: [
      { to: '/permissions', icon: 'bi-key-fill', label: 'Permissions', action: 'sidebar', subject: 'permission' },
      { to: '/roles', icon: 'bi-shield-lock-fill', label: 'Roles', action: 'sidebar', subject: 'role' },
    ],
  },
];

export default function Sidebar({ collapsed, onClose }) {
  const ability = useContext(AbilityContext);
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
        if (num === null) return null;
        return {
          to: `/coating-productions/unit/${num}`,
          label: u.name,
          icon: num <= 9 ? `bi-${num}-circle-fill` : 'bi-circle-fill',
          num
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.num - b.num);

    return navItems.map(section => ({
      ...section,
      links: section.links.map(link => {
        if (link.label === 'Coating Production') {
          return {
            ...link,
            subLinks: coatingProductionSubLinks
          };
        }
        return link;
      })
    }));
  }, [units]);

  useEffect(() => {
    // Auto-expand menus if a sublink is active
    const newExpanded = { ...expandedMenus };
    dynamicNavItems.forEach(section => {
      section.links.forEach(link => {
        if (link.subLinks && link.subLinks.some(sub => location.pathname.startsWith(sub.to.split('?')[0]))) {
          newExpanded[link.label] = true;
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
                if (link.subLinks) {
                  const isExpanded = expandedMenus[link.label];
                  return (
                    <div key={link.label} className="nav-item-container">
                      <div
                        className="nav-item"
                        onClick={() => toggleMenu(link.label)}
                        style={{ cursor: 'pointer' }}
                      >
                        <i className={`bi ${link.icon} nav-icon me-2`} />
                        <span className="nav-label">{link.label}</span>
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
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <i className={`bi ${link.icon} nav-icon me-2`} />
                    <span className="nav-label">{link.label}</span>
                    {link.badge && <span className="nav-badge">{link.badge}</span>}
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
