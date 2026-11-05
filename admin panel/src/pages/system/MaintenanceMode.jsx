import React, { useState, useEffect } from 'react';
import { useMaintenance } from '../../context/MaintenanceContext';
import Swal from 'sweetalert2';

const MODULE_ICONS = {
  lacquer_plan: 'bi-calendar-check-fill',
  printing_plan: 'bi-printer-fill',
  incoming: 'bi-box-arrow-in-down-right',
  production: 'bi-box-seam-fill',
  dispatch: 'bi-truck',
  delivery_challan: 'bi-receipt-cutoff',
  stock_entry: 'bi-box-seam',
  master_data: 'bi-database-fill-gear',
  summary: 'bi-file-earmark-diff',
  vision: 'bi-camera-fill',
};

const MODULE_DESCRIPTIONS = {
  lacquer_plan: 'Plan coating batches, recipe allocations, and bottle coating runs.',
  printing_plan: 'Screen printing planning, shades, and printing schedules.',
  incoming: 'Shayona & Shreno bottle incoming challans and inspection.',
  production: 'Machine units coating and printing output recording.',
  dispatch: 'Dispatch register and ready-to-dispatch packing verification.',
  delivery_challan: 'Shayona, Mcnore, and Sherno delivery challan generation.',
  stock_entry: 'Raw material stock in, invoices, and consumable ledgers.',
  master_data: 'Specs, bottles, variants, companies, operators, and units.',
  summary: 'Company summaries, reconciliations, and KPI balances.',
  vision: 'OCR bottle scanner and AI label recognition.',
};

export default function MaintenanceMode() {
  const { maintenance, toggleGlobal, toggleModule, updateSettings, refreshMaintenance } = useMaintenance();

  const [globalState, setGlobalState] = useState(false);
  const [globalMessage, setGlobalMessage] = useState('');
  const [estimatedEndTime, setEstimatedEndTime] = useState('');
  const [modulesList, setModulesList] = useState([]);
  const [search, setSearch] = useState('');
  const [savingGlobal, setSavingGlobal] = useState(false);

  useEffect(() => {
    if (maintenance) {
      setGlobalState(Boolean(maintenance.isGlobalMaintenance));
      setGlobalMessage(maintenance.message || '');
      setEstimatedEndTime(maintenance.estimatedEndTime || '');
      setModulesList(maintenance.modules || []);
    }
  }, [maintenance]);

  const activeCount = modulesList.filter((m) => !m.isUnderMaintenance).length;
  const maintenanceCount = modulesList.filter((m) => m.isUnderMaintenance).length;

  const handleGlobalToggle = async () => {
    const nextState = !globalState;
    const result = await Swal.fire({
      title: nextState ? 'Enable Global Maintenance?' : 'Disable Global Maintenance?',
      text: nextState
        ? 'All non-admin users will be blocked from accessing the ERP until disabled.'
        : 'The entire system will be restored to normal operation for all users.',
      icon: nextState ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonColor: nextState ? '#d97706' : '#10b981',
      confirmButtonText: nextState ? 'Yes, Enable Global Maintenance' : 'Yes, Restore Normal Mode',
    });

    if (result.isConfirmed) {
      setSavingGlobal(true);
      try {
        await toggleGlobal(nextState, globalMessage, estimatedEndTime);
        setGlobalState(nextState);
        Swal.fire({
          icon: 'success',
          title: nextState ? 'Global Maintenance Enabled' : 'Normal Operation Restored',
          text: nextState
            ? 'Only administrators can now access the ERP.'
            : 'All modules are now accessible according to role permissions.',
          timer: 2000,
          showConfirmButton: false,
        });
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || err.message, 'error');
      } finally {
        setSavingGlobal(false);
      }
    }
  };

  const handleSaveGlobalDetails = async (e) => {
    e.preventDefault();
    setSavingGlobal(true);
    try {
      await updateSettings({
        isGlobalMaintenance: globalState,
        message: globalMessage,
        estimatedEndTime,
      });
      Swal.fire({
        icon: 'success',
        title: 'Settings Saved',
        text: 'Maintenance announcement and estimated time updated.',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || err.message, 'error');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleModuleToggle = async (mod) => {
    const nextState = !mod.isUnderMaintenance;
    try {
      const res = await toggleModule(mod.key, nextState, mod.message);
      if (res.success) {
        setModulesList((prev) =>
          prev.map((m) => (m.key === mod.key ? { ...m, isUnderMaintenance: nextState } : m))
        );
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: nextState ? 'warning' : 'success',
          title: `${mod.name}: ${nextState ? 'Under Maintenance' : 'Operational'}`,
          showConfirmButton: false,
          timer: 2500,
        });
      }
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || err.message, 'error');
    }
  };

  const handleModuleMessageChange = (key, msg) => {
    setModulesList((prev) =>
      prev.map((m) => (m.key === key ? { ...m, message: msg } : m))
    );
  };

  const handleSaveModuleMessage = async (mod) => {
    try {
      await toggleModule(mod.key, mod.isUnderMaintenance, mod.message);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Custom reason saved for ${mod.name}`,
        showConfirmButton: false,
        timer: 2000,
      });
    } catch (err) {
      Swal.fire('Error', err.response?.data?.message || err.message, 'error');
    }
  };

  const handleSetAllModules = async (underMaintenance) => {
    const actionLabel = underMaintenance ? 'Pause All Modules' : 'Restore All Modules';
    const result = await Swal.fire({
      title: `${actionLabel}?`,
      text: underMaintenance
        ? 'This will place every single operational module into maintenance.'
        : 'This will restore every module to operational status.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionLabel}`,
      confirmButtonColor: underMaintenance ? '#d97706' : '#10b981',
    });

    if (result.isConfirmed) {
      try {
        const updatedMods = modulesList.map((m) => ({
          ...m,
          isUnderMaintenance: underMaintenance,
        }));
        await updateSettings({ modules: updatedMods });
        setModulesList(updatedMods);
        Swal.fire('Success', `All modules have been updated.`, 'success');
      } catch (err) {
        Swal.fire('Error', err.response?.data?.message || err.message, 'error');
      }
    }
  };

  const filteredModules = modulesList.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="page-title mb-1">System &amp; Module Maintenance</h1>
          <p className="page-subtitle mb-0">
            Control global maintenance or selectively pause individual modules while other modules continue working.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-2 fw-semibold">
            <i className="bi bi-shield-check me-1" /> Admin Bypass Enabled
          </span>
          <button onClick={refreshMaintenance} className="btn btn-outline-secondary py-2 px-3 shadow-none">
            <i className="bi bi-arrow-clockwise me-1" /> Refresh
          </button>
        </div>
      </div>

      {/* Row 1: Global Master Switch & Announcement Details */}
      <div className="row g-4 mb-4">
        {/* Global Master Switch Card */}
        <div className="col-lg-5 col-xl-4">
          <div
            className="dash-card border-0 shadow-sm h-100 p-4"
            style={{
              borderLeft: globalState ? '4px solid #d97706' : '4px solid #10b981',
              background: globalState ? '#fffbeb' : '#ffffff',
            }}
          >
            <div className="d-flex align-items-start justify-content-between mb-3">
              <div>
                <span className="small text-uppercase fw-bold text-muted">Master Control</span>
                <h5 className="fw-bold mt-1 text-dark">Global Maintenance</h5>
              </div>
              <span
                className={`badge px-3 py-2 fw-bold ${
                  globalState ? 'bg-warning text-dark' : 'bg-success-subtle text-success border border-success-subtle'
                }`}
              >
                {globalState ? '🟠 GLOBAL ACTIVE' : '🟢 OPERATIONAL'}
              </span>
            </div>

            <p className="small text-muted mb-4">
              When Global Maintenance is enabled, the entire ERP is paused for non-admin factory users.
              Administrators retain bypass access.
            </p>

            <div className="d-grid">
              <button
                type="button"
                onClick={handleGlobalToggle}
                disabled={savingGlobal}
                className={`btn py-2 px-4 fw-bold shadow-sm ${
                  globalState ? 'btn-success' : 'btn-warning text-dark'
                }`}
              >
                <i className={`bi ${globalState ? 'bi-play-circle-fill' : 'bi-pause-circle-fill'} me-2`} />
                {globalState ? 'Restore Normal Mode' : 'Activate Global Maintenance'}
              </button>
            </div>

            <hr className="my-3 opacity-25" />

            <div className="d-flex justify-content-between text-muted small">
              <span>Operational Modules:</span>
              <strong className="text-success">{activeCount}</strong>
            </div>
            <div className="d-flex justify-content-between text-muted small mt-1">
              <span>Paused Modules:</span>
              <strong className={maintenanceCount > 0 ? 'text-warning' : 'text-secondary'}>
                {maintenanceCount}
              </strong>
            </div>
          </div>
        </div>

        {/* Global Announcement & ETA Form */}
        <div className="col-lg-7 col-xl-8">
          <div className="dash-card border-0 shadow-sm h-100 p-4">
            <h6 className="fw-bold text-dark mb-3">
              <i className="bi bi-megaphone-fill text-primary me-2" />
              Maintenance Announcement &amp; Schedule
            </h6>

            <form onSubmit={handleSaveGlobalDetails}>
              <div className="row g-3">
                <div className="col-md-8">
                  <label className="form-label small fw-semibold text-muted">Announcement / Reason Message</label>
                  <input
                    type="text"
                    className="form-control border-light-subtle bg-light shadow-none"
                    placeholder="e.g., Scheduled system maintenance in progress. Expected back shortly."
                    value={globalMessage}
                    onChange={(e) => setGlobalMessage(e.target.value)}
                  />
                  <div className="form-text" style={{ fontSize: '11px' }}>
                    This message is displayed to non-admin users attempting to open a paused module.
                  </div>
                </div>

                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-muted">Estimated Completion (ETA)</label>
                  <input
                    type="text"
                    className="form-control border-light-subtle bg-light shadow-none"
                    placeholder="e.g., Today at 4:30 PM"
                    value={estimatedEndTime}
                    onChange={(e) => setEstimatedEndTime(e.target.value)}
                  />
                  <div className="form-text" style={{ fontSize: '11px' }}>
                    Optional estimate for users.
                  </div>
                </div>
              </div>

              <div className="d-flex justify-content-end mt-3">
                <button type="submit" disabled={savingGlobal} className="btn-accent px-4 py-2">
                  <i className="bi bi-check2-circle me-1" /> Save Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Row 2: Granular Module Matrix */}
      <div className="dash-card border-0 shadow-sm p-4">
        {/* Toolbar */}
        <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
          <div>
            <h5 className="fw-bold mb-1 text-dark">
              <i className="bi bi-grid-fill text-primary me-2" />
              Granular Module Controls
            </h5>
            <p className="text-muted small mb-0">
              Toggle specific modules offline for reconciliation or stock audit without stopping the rest of the factory.
            </p>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="position-relative" style={{ width: 220 }}>
              <i className="bi bi-search position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" />
              <input
                type="text"
                className="form-control form-control-sm border-light-subtle bg-light ps-5 shadow-none"
                placeholder="Search module..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ borderRadius: 8, height: 36 }}
              />
            </div>
            <button
              onClick={() => handleSetAllModules(false)}
              className="btn btn-sm btn-outline-success shadow-none py-2 px-3 fw-semibold"
            >
              <i className="bi bi-check-all me-1" /> Restore All
            </button>
            <button
              onClick={() => handleSetAllModules(true)}
              className="btn btn-sm btn-outline-warning text-dark shadow-none py-2 px-3 fw-semibold"
            >
              <i className="bi bi-pause-fill me-1" /> Pause All
            </button>
          </div>
        </div>

        {/* Modules Grid */}
        <div className="row g-3">
          {filteredModules.map((mod) => {
            const icon = MODULE_ICONS[mod.key] || 'bi-app';
            const desc = MODULE_DESCRIPTIONS[mod.key] || 'ERP operations and data.';
            const isDown = mod.isUnderMaintenance || globalState;

            return (
              <div key={mod.key} className="col-md-6 col-xl-4">
                <div
                  className="card h-100 border transition-all"
                  style={{
                    borderRadius: 12,
                    background: isDown ? '#fffbeb' : '#ffffff',
                    borderColor: isDown ? '#f59e0b' : '#e2e8f0',
                  }}
                >
                  <div className="card-body p-3 d-flex flex-column justify-content-between">
                    <div>
                      {/* Card Header */}
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="d-flex align-items-center gap-2">
                          <div
                            className="d-flex align-items-center justify-content-center rounded-3"
                            style={{
                              width: 38,
                              height: 38,
                              background: isDown ? '#fef3c7' : '#e0f2fe',
                              color: isDown ? '#b45309' : '#0284c7',
                              fontSize: 18,
                            }}
                          >
                            <i className={`bi ${icon}`} />
                          </div>
                          <div>
                            <h6 className="fw-bold mb-0 text-dark">{mod.name}</h6>
                            <span className="text-muted" style={{ fontSize: '11px' }}>
                              Key: <code>{mod.key}</code>
                            </span>
                          </div>
                        </div>

                        {/* Switch */}
                        <div className="form-check form-switch mb-0">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            checked={mod.isUnderMaintenance}
                            onChange={() => handleModuleToggle(mod)}
                            style={{ cursor: 'pointer', width: 44, height: 22 }}
                            title={mod.isUnderMaintenance ? 'Click to make operational' : 'Click to put under maintenance'}
                          />
                        </div>
                      </div>

                      <p className="text-muted small mb-3" style={{ fontSize: '12px', minHeight: 34 }}>
                        {desc}
                      </p>
                    </div>

                    <div>
                      {/* Status indicator */}
                      <div className="d-flex align-items-center justify-content-between pt-2 border-top">
                        <span
                          className={`badge rounded-pill fw-semibold ${
                            mod.isUnderMaintenance
                              ? 'bg-warning text-dark'
                              : 'bg-success-subtle text-success border border-success-subtle'
                          }`}
                          style={{ fontSize: '11px' }}
                        >
                          {mod.isUnderMaintenance ? '🟠 In Maintenance' : '🟢 Operational'}
                        </span>

                        {mod.isUnderMaintenance && (
                          <span className="text-warning-emphasis small fw-semibold" style={{ fontSize: '11px' }}>
                            <i className="bi bi-lock-fill me-1" /> Paused for Users
                          </span>
                        )}
                      </div>

                      {/* Custom Module Message collapse/input */}
                      {mod.isUnderMaintenance && (
                        <div className="mt-2 pt-2 border-top">
                          <div className="input-group input-group-sm">
                            <input
                              type="text"
                              className="form-control form-control-sm border-light-subtle bg-white shadow-none"
                              placeholder="Custom reason (optional)"
                              value={mod.message || ''}
                              onChange={(e) => handleModuleMessageChange(mod.key, e.target.value)}
                              style={{ fontSize: '12px' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveModuleMessage(mod)}
                              className="btn btn-sm btn-outline-secondary"
                              title="Save custom reason"
                            >
                              <i className="bi bi-save" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

