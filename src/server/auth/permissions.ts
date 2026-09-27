import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const organizationAccess = createAccessControl(defaultStatements);

export const agencyOwnerRole = organizationAccess.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
});

const staffRole = organizationAccess.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
});

export const organizationRoles = {
  agency_owner: agencyOwnerRole,
  fleet_manager: staffRole,
  rental_agent: staffRole,
  accountant: staffRole,
};
