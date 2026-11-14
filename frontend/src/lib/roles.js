export const ROLES = {
  ADMIN: 'admin',
  CO_ADMIN: 'co_admin',
  USER: 'user',
  OPERATION1: 'operation1',
}

export const ROLE_LABELS = {
  admin: 'Admin',
  co_admin: 'Co-Admin',
  user: 'User',
  operation1: 'Operation1',
}

// Role yang boleh diberikan, tergantung role yang sedang login (mirror aturan di BE)
export const MANAGEABLE_ROLES = {
  admin: ['admin', 'co_admin', 'user', 'operation1'],
  co_admin: ['user', 'operation1'],
  user: [],
  operation1: [],
}
