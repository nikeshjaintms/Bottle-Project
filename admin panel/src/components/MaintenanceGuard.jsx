import React from 'react';
import { useMaintenance } from '../context/MaintenanceContext';
import ModuleMaintenanceScreen from './ModuleMaintenanceScreen';

export default function MaintenanceGuard({ module: moduleKey, children }) {
  const { isModuleBlocked, maintenance } = useMaintenance();

  if (maintenance.loading) {
    return <>{children}</>;
  }

  const blockInfo = isModuleBlocked(moduleKey);

  if (blockInfo && blockInfo.blocked) {
    return <ModuleMaintenanceScreen moduleInfo={blockInfo} />;
  }

  return <>{children}</>;
}

