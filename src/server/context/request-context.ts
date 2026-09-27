export const staffRoles = [
  "agency_owner",
  "fleet_manager",
  "rental_agent",
  "accountant",
] as const;

export type StaffRole = (typeof staffRoles)[number];

export type RequestContext = {
  requestId: string;
  userId: string;
  authUserId?: string;
  agencyId: string;
  membershipId?: string;
  branchId?: string;
  branchIds?: string[];
  roles: StaffRole[];
};
