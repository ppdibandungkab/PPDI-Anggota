import React from 'react';
import { PermissionGate } from './PermissionGate';
import { PermissionAction } from '../utils/permissions';

export interface CanProps {
  do: PermissionAction;
  on: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Declarative component wrapper for role permissions.
 * Usage:
 * <Can do="add" on="anggota">
 *   <button onClick={onOpenAddModal}>Tambah Perangkat</button>
 * </Can>
 */
export const Can: React.FC<CanProps> = ({ do: action, on: moduleName, fallback = null, children }) => {
  return (
    <PermissionGate module={moduleName} action={action} fallback={fallback}>
      {children}
    </PermissionGate>
  );
};

export default Can;
