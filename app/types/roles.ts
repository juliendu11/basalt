/**
 * Organization role, attached to the (user, organization) pair via
 * OrganizationMembership — never a global role on the user. See
 * docs/plans/03-organizations.md § Permissions.
 */
export const ORGANIZATION_ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]

const ROLE_RANK: Record<OrganizationRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
}

/** True when `role` grants at least the privileges of `minimum`. */
export function roleAtLeast(role: OrganizationRole, minimum: OrganizationRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}
