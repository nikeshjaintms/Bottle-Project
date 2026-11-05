import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function ModuleMaintenanceScreen({ moduleInfo }) {
  const navigate = useNavigate();
  const name = moduleInfo?.name || 'This Module';
  const message =
    moduleInfo?.message ||
    'This section of the ERP is temporarily paused for scheduled maintenance or data auditing.';
  const estimatedEndTime = moduleInfo?.estimatedEndTime;

  return (
    <div className="page-content d-flex align-items-center justify-content-center" style={{ minHeight: '75vh' }}>
      <div
        className="dash-card border-0 shadow-sm text-center p-5"
        style={{ maxWidth: 640, width: '100%', borderRadius: 16 }}
      >
        <div
          className="mx-auto mb-4 d-flex align-items-center justify-content-center"
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
            color: '#d97706',
            fontSize: 36,
          }}
        >
          <i className="bi bi-cone-striped" />
        </div>

        <h3 className="fw-bold mb-2 text-dark">{name} Under Maintenance</h3>
        <p className="text-muted mb-4" style={{ fontSize: '15px', lineHeight: 1.6 }}>
          {message}
        </p>

        {estimatedEndTime && (
          <div
            className="alert alert-warning border-0 d-inline-flex align-items-center gap-2 px-3 py-2 rounded-3 mb-4 text-warning-emphasis"
            style={{ fontSize: '13px' }}
          >
            <i className="bi bi-clock-history" />
            <span>
              Estimated Completion: <strong>{estimatedEndTime}</strong>
            </span>
          </div>
        )}

        <div
          className="p-3 rounded-3 mb-4 text-start"
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '13px' }}
        >
          <div className="fw-semibold text-secondary mb-1">
            <i className="bi bi-check-circle-fill text-success me-2" />
            Other Modules Are Operational
          </div>
          <div className="text-muted">
            The rest of the system remains online. You may safely switch to other operational modules
            (such as Production, Dispatch, Incoming, or Delivery Challans) to continue your tasks.
          </div>
        </div>

        <div className="d-flex justify-content-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="btn btn-outline-secondary px-4 py-2 rounded-3"
            style={{ fontWeight: 600 }}
          >
            <i className="bi bi-arrow-left me-2" /> Go Back
          </button>
          <Link to="/" className="btn-accent px-4 py-2 rounded-3 text-white text-decoration-none" style={{ fontWeight: 600 }}>
            <i className="bi bi-grid-1x2-fill me-2" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

