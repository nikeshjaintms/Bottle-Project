import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMaintenance } from '../context/MaintenanceContext';

export default function MaintenanceBanner() {
  const { maintenance } = useMaintenance();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || maintenance.loading) return null;

  const isGlobal = maintenance.isGlobalMaintenance;
  const activeModules = (maintenance.modules || []).filter((m) => m.isUnderMaintenance);

  // If no maintenance is active at all, nothing to show
  if (!isGlobal && activeModules.length === 0) return null;

  // Banner for Administrator (with bypass)
  if (maintenance.canBypass) {
    return (
      <div
        className="maintenance-admin-banner d-flex align-items-center justify-content-between px-4 py-2 text-white shadow-sm"
        style={{
          background: isGlobal
            ? 'linear-gradient(90deg, #b45309, #d97706)'
            : 'linear-gradient(90deg, #0284c7, #0369a1)',
          fontSize: '13px',
          zIndex: 1050,
          position: 'relative',
        }}
      >
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-cone-striped fs-6" />
          <span>
            <strong>
              {isGlobal ? 'Global Maintenance Active' : 'Module Maintenance Active'}:
            </strong>{' '}
            {isGlobal
              ? 'All standard users are locked out of the system.'
              : `Paused modules: ${activeModules.map((m) => m.name).join(', ')}. Other modules remain operational.`}{' '}
            <span className="badge bg-white text-dark ms-2 fw-semibold" style={{ fontSize: '11px' }}>
              Admin Bypass Active
            </span>
          </span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Link
            to="/maintenance"
            className="btn btn-sm btn-light py-1 px-3 fw-semibold shadow-none"
            style={{ fontSize: '12px' }}
          >
            Manage Maintenance
          </Link>
          <button
            type="button"
            className="btn btn-link text-white p-0 ms-2 text-decoration-none"
            onClick={() => setDismissed(true)}
            title="Dismiss notification"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
      </div>
    );
  }

  // Banner for regular user when global or partial maintenance is running
  return (
    <div
      className="maintenance-user-banner d-flex align-items-center justify-content-between px-4 py-2 text-white shadow-sm"
      style={{
        background: 'linear-gradient(90deg, #ea580c, #c2410c)',
        fontSize: '13px',
        zIndex: 1050,
        position: 'relative',
      }}
    >
      <div className="d-flex align-items-center gap-2">
        <i className="bi bi-tools fs-6" />
        <span>
          <strong>Notice:</strong>{' '}
          {isGlobal
            ? maintenance.message || 'System maintenance in progress. Certain actions may be paused.'
            : `Maintenance is in progress on: ${activeModules.map((m) => m.name).join(', ')}. All other sections are working normally.`}
          {maintenance.estimatedEndTime && (
            <span className="ms-2">
              (Est. Completion: <strong>{maintenance.estimatedEndTime}</strong>)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

