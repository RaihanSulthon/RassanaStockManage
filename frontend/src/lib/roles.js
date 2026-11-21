export const ROLES = {
  ADMIN: 'admin',
  PURCHASING: 'purchasing',
  FINANCE: 'finance',
  LOGISTIC: 'logistic',
  OPERATION1: 'operation1',
  USER: 'user',
}

export const ROLE_LABELS = {
  admin: 'Admin',
  purchasing: 'Purchasing',
  finance: 'Finance',
  logistic: 'Logistic',
  operation1: 'Operation1',
  user: 'User',
}

// Hanya Admin yang mengelola akun (mirror aturan di BE)
export const MANAGEABLE_ROLES = {
  admin: ['admin', 'purchasing', 'finance', 'logistic', 'operation1', 'user'],
  purchasing: [],
  logistic: [],
  finance: [],
  operation1: [],
  user: [],
}

// Role yang melihat semua lokasi dan harga
export const isPrivileged = (role) => ['admin', 'purchasing', 'finance'].includes(role)

// Role lapangan: tidak pernah melihat stok gudang
export const isFieldRole = (role) => ['operation1', 'user'].includes(role)

// Boleh mengubah stok/barang gudang (Logistic hanya gudang yang ditugaskan; dicek ulang di BE)
export const canManageWarehouse = (role) => isPrivileged(role) || role === 'logistic'
