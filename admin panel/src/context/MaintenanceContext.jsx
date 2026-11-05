import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../services/api';

const MaintenanceContext = createContext(null);

export function MaintenanceProvider({ children }) {
  const [maintenance, setMaintenance] = useState({
    isGlobalMaintenance: false,
    message: '',
    estimatedEndTime: '',
    allowedRoles: ['admin', 'super admin', 'superadmin'],
    modules: [],
    canBypass: false,
    loading: true,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await API.get('/system-maintenance/status');
      if (res.data?.success && res.data?.data) {
        setMaintenance(prev => ({
          ...prev,
          ...res.data.data,
          loading: false,
        }));
      }
    } catch (err) {
      console.warn('Could not fetch maintenance status:', err.message);
      setMaintenance(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Re-check periodically every 60 seconds
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Check if a specific module is under maintenance
  const isModuleBlocked = useCallback(
    (moduleKey) => {
      if (!moduleKey) return false;
      if (maintenance.loading) return false;
      // If user can bypass (Admin), they are never blocked
      if (maintenance.canBypass) return false;

      // If global maintenance is active, everything is blocked
      if (maintenance.isGlobalMaintenance) {
        return {
          blocked: true,
          isGlobal: true,
          name: 'Global System',
          message: maintenance.message || 'System maintenance is currently in progress.',
          estimatedEndTime: maintenance.estimatedEndTime,
        };
      }

      // Check module level
      const mod = maintenance.modules.find((m) => m.key === moduleKey);
      if (mod && mod.isUnderMaintenance) {
        return {
          blocked: true,
          isGlobal: false,
          name: mod.name,
          message: mod.message || `${mod.name} is temporarily under scheduled maintenance.`,
          estimatedEndTime: maintenance.estimatedEndTime,
        };
      }

      return false;
    },
    [maintenance]
  );

  const toggleGlobal = async (isGlobal, message, estimatedEndTime) => {
    const res = await API.post('/system-maintenance/toggle-global', {
      isGlobalMaintenance: isGlobal,
      message,
      estimatedEndTime,
    });
    if (res.data?.success) {
      await fetchStatus();
    }
    return res.data;
  };

  const toggleModule = async (moduleKey, isUnderMaintenance, message) => {
    const res = await API.post('/system-maintenance/toggle-module', {
      moduleKey,
      isUnderMaintenance,
      message,
    });
    if (res.data?.success) {
      await fetchStatus();
    }
    return res.data;
  };

  const updateSettings = async (payload) => {
    const res = await API.put('/system-maintenance/update-settings', payload);
    if (res.data?.success) {
      await fetchStatus();
    }
    return res.data;
  };

  return (
    <MaintenanceContext.Provider
      value={{
        maintenance,
        isModuleBlocked,
        refreshMaintenance: fetchStatus,
        toggleGlobal,
        toggleModule,
        updateSettings,
      }}
    >
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance() {
  const context = useContext(MaintenanceContext);
  if (!context) {
    throw new Error('useMaintenance must be used within a MaintenanceProvider');
  }
  return context;
}

