export const USER_ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];
