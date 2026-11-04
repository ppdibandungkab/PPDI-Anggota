import { DEFAULT_ROLE_PERMISSIONS, RoleConfig, UserRole } from '../types/ppdi';

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete';

/**
 * Normalizes any value into a strict boolean.
 * Treats string "false", "0", null, undefined, 0, or false strictly as false.
 * Treats true, 1, "true", "1" strictly as true.
 */
export function normalizeBoolean(value: any): boolean {
  if (value === true || value === 1 || value === 'true' || value === '1') {
    return true;
  }
  return false;
}

/**
 * Sanitizes an entire RoleConfig object to ensure all permission values are
 * strict booleans (never strings like "false", null, or undefined).
 */
export function sanitizeRolePermissions(config: RoleConfig | undefined | null): RoleConfig {
  const result: RoleConfig = {};
  const base = config || DEFAULT_ROLE_PERMISSIONS;

  Object.keys(base).forEach((role) => {
    result[role] = {};
    const modules = base[role] || {};
    Object.keys(modules).forEach((mod) => {
      const perms = modules[mod] || {};
      result[role][mod] = {
        view: normalizeBoolean(perms.view),
        add: normalizeBoolean(perms.add),
        edit: normalizeBoolean(perms.edit),
        delete: normalizeBoolean(perms.delete),
      };
    });
  });

  return result;
}

/**
 * Checks if a user role has permission to perform an action on a module.
 *
 * Rules:
 * 1. Superadmin_Kabupaten always has full, unrestricted access to all modules and actions.
 * 2. Checks appSettings.rolePermissions if defined.
 * 3. Falls back to DEFAULT_ROLE_PERMISSIONS.
 * 4. Strictly returns boolean false if not explicitly true.
 */
export function checkUserPermission(
  userRole: UserRole | string | undefined | null,
  moduleId: string,
  action: PermissionAction = 'view',
  customPermissions?: RoleConfig | null
): boolean {
  if (!userRole) return false;

  // 1. Superadmin_Kabupaten has absolute unrestricted permissions across all modules
  if (userRole === 'Superadmin_Kabupaten') {
    return true;
  }

  // 2. Check custom role permissions from appSettings
  const activeRoleConfig = customPermissions?.[userRole];
  if (activeRoleConfig && activeRoleConfig[moduleId]) {
    const actionVal = activeRoleConfig[moduleId][action];
    if (actionVal !== undefined && actionVal !== null) {
      return normalizeBoolean(actionVal);
    }
  }

  // 3. Fallback to default system permissions
  const defaultRoleConfig = DEFAULT_ROLE_PERMISSIONS[userRole];
  if (defaultRoleConfig && defaultRoleConfig[moduleId]) {
    const defaultVal = defaultRoleConfig[moduleId][action];
    return normalizeBoolean(defaultVal);
  }

  return false;
}
