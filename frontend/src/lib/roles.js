export const ROLES = {
  ADMIN: 'admin',
  PURCHASING: 'purchasing',
  FINANCE: 'finance',
  OPERATION1: 'operation1',
  USER: 'user',
}

export const ROLE_LABELS = {
  admin: 'Admin',
  purchasing: 'Purchasing',
  finance: 'Finance',
  operation1: 'Operation1',
  user: 'User',
}

// Hanya Admin yang mengelola akun (mirror aturan di BE)
export const MANAGEABLE_ROLES = {
  admin: ['admin', 'purchasing', 'finance', 'operation1', 'user'],
  purchasing: [],
  finance: [],
  operation1: [],
  user: [],
}

// Role yang melihat semua lokasi dan harga
export const isPrivileged = (role) => ['admin', 'purchasing', 'finance'].includes(role)
