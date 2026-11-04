import React from 'react';
import { usePermissions } from '../hooks/usePermissions';
import { PermissionAction } from '../utils/permissions';

export interface PermissionGateProps {
  module: string;
  action?: PermissionAction | 'create' | 'update' | string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * High-Order Wrapper component `<PermissionGate module="..." action="...">`
 * Conditionally renders child elements (such as Edit/Delete buttons)
 * based on the active user's permissions evaluated via usePermissions hook.
 *
 * Usage Example:
 * <PermissionGate module="anggota" action="delete">
 *   <button onClick={() => handleDelete(item.id)}>Hapus Data</button>
 * </PermissionGate>
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  module,
  action = 'view',
  fallback = null,
  children,
}) => {
  const { hasPermission } = usePermissions();

  const normalizedAction: PermissionAction =
    action === 'create' ? 'add' :
    action === 'update' ? 'edit' :
    (action as PermissionAction);

  if (hasPermission(module, normalizedAction)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

export default PermissionGate;
