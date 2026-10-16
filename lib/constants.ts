export const USER_ROLES = {
  HEAD: 'head',
  STAFF: 'staff',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

/**
 * Positions determine the display label; `role` determines authorization.
 *
 *   Head  → role 'head'  → Head Dashboard (administrator). No clock
 *                          in/out, no QR code, no required weekly hours.
 *   Staff → role 'staff' → Employee Dashboard. Clocks in/out, carries a
 *                          QR code and a required weekly hours target.
 *
 * The system has exactly two roles. The former Admin role was merged into
 * Head: an Admin account keeps its history and becomes a Head.
 */
export const POSITIONS = {
  HEAD: 'head',
  STAFF: 'staff',
} as const;

export type Position = typeof POSITIONS[keyof typeof POSITIONS];

/** The auth role a position maps to. Unknown positions fall back to staff. */
export function roleForPosition(position: string | null | undefined): UserRole {
  return position === POSITIONS.HEAD ? USER_ROLES.HEAD : USER_ROLES.STAFF;
}

/** True when the position is one of the two canonical values. */
export function isKnownPosition(position: string | null | undefined): position is Position {
  return position === POSITIONS.HEAD || position === POSITIONS.STAFF;
}
