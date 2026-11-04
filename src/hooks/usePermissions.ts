import { usePPDI } from '../context/PPDIContext';
import { PermissionAction } from '../utils/permissions';

export function usePermissions() {
  const { currentUser, hasPermission, appSettings } = usePPDI();

  return {
    currentUser,
    userRole: currentUser?.role,
    hasPermission,
    can: (module: string, action: PermissionAction = 'view') => hasPermission(module, action),
    canView: (module: string) => hasPermission(module, 'view'),
    canAdd: (module: string) => hasPermission(module, 'add'),
    canEdit: (module: string) => hasPermission(module, 'edit'),
    canDelete: (module: string) => hasPermission(module, 'delete'),
    rolePermissions: appSettings?.rolePermissions,
  };
}

export default usePermissions;
