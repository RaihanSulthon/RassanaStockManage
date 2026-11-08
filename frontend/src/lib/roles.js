export const ROLES = {
  ADMIN: 'admin',
  CO_ADMIN: 'co_admin',
  USER: 'user',
}

export const ROLE_LABELS = {
  admin: 'Admin',
  co_admin: 'Co-Admin',
  user: 'User',
}

// Role yang boleh diberikan, tergantung role yang sedang login (mirror aturan di BE)
export const MANAGEABLE_ROLES = {
  admin: ['admin', 'co_admin', 'user'],
  co_admin: ['user'],
  user: [],
}
