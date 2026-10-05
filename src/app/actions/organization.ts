"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/server/auth/auth";
import { getOptionalWebSession, getWebRequestContext } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorize";
import { sqlite } from "@/db/connection";
import { asDomainError, DomainError } from "@/server/domain/errors";
import { staffRoles, type StaffRole } from "@/server/context/request-context";
import {
  updateAgreementDesigner,
  updateEnglishRentalTerms,
  updateOrganizationProfile,
  type OrganizationSettingsDto,
} from "@/server/services/organization-settings-service";
import type { AgreementDesignConfig } from "@/lib/agreement-config";

export type OrganizationActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export type TeamData = {
  members: Array<{ id: string; membershipId: string; name: string; email: string; role: StaffRole; active: boolean; branches: string[]; isCurrentUser: boolean }>;
  invitations: Array<{ id: string; email: string; role: string; status: string; expiresAt: string; branches: string[] }>;
  branches: Array<{ id: string; name: string; city: string }>;
};

export async function updateMyProfileAction(input:{name:string;phone:string}):Promise<OrganizationActionResult<{name:string;phone:string}>> {
  try {
    const context=await getWebRequestContext();
    const name=input.name.trim();const phone=input.phone.trim();
    const fieldErrors:Record<string,string>={};
    if(name.length<2)fieldErrors.name="Enter your full name.";
    if(phone&&!/^\+?[0-9 ()-]{7,20}$/.test(phone))fieldErrors.phone="Enter a valid phone number.";
    if(Object.keys(fieldErrors).length)return {ok:false,message:"Check the highlighted fields.",fieldErrors};
    const now=new Date().toISOString();
    sqlite.transaction(()=>{
      sqlite.prepare("UPDATE users SET name=?,phone=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?").run(name,phone||null,now,context.agencyId,context.userId);
      sqlite.prepare("UPDATE user SET name=?,updated_at=? WHERE id=?").run(name,Date.now(),context.authUserId);
      writeAudit(context.agencyId,context.userId,"profile.updated","user",context.userId,{phoneUpdated:Boolean(phone)});
    })();
    revalidatePath("/","layout");
    return {ok:true,data:{name,phone},message:"Profile updated."};
  } catch(error){return actionFailure(error);}
}

export async function updateRentalTermsAction(terms:string):Promise<OrganizationActionResult<{terms:string}>> {
  try { const context=await getWebRequestContext();const value=terms.trim();if(value.length<40)return {ok:false,message:"Rental terms should contain at least 40 characters.",fieldErrors:{terms:"Add the key renter obligations."}};updateEnglishRentalTerms(context,value);revalidatePath("/settings");return {ok:true,data:{terms:value},message:"English terms updated for future bookings."};} catch(error){return actionFailure(error);}
}

export async function updateOrganizationProfileAction(input:OrganizationSettingsDto["profile"]):Promise<OrganizationActionResult<OrganizationSettingsDto["profile"]>> {
  try{const data=updateOrganizationProfile(await getWebRequestContext(),input);revalidatePath("/","layout");return {ok:true,data,message:"Organization profile saved."}}catch(error){return actionFailure(error)}
}

export async function updateAgreementDesignerAction(input:AgreementDesignConfig):Promise<OrganizationActionResult<AgreementDesignConfig>> {
  try{const data=updateAgreementDesigner(await getWebRequestContext(),input);revalidatePath("/settings");return {ok:true,data,message:"Agreement design saved for future rentals."}}catch(error){return actionFailure(error)}
}

export async function createAgencyAction(input: { name: string; slug: string; city: string; branchName: string; address: string }): Promise<OrganizationActionResult<{ agencyId: string }>> {
  try {
    const session = await getOptionalWebSession();
    if (!session?.user) throw new DomainError("UNAUTHENTICATED", "Sign in before creating an agency.", 401);
    const name = input.name.trim();
    const slug = normalizeSlug(input.slug);
    const city = input.city.trim();
    const branchName = input.branchName.trim();
    const address = input.address.trim();
    const fieldErrors: Record<string, string> = {};
    if (name.length < 2) fieldErrors.name = "Enter the agency name.";
    if (slug.length < 3) fieldErrors.slug = "Use at least three letters or numbers.";
    if (!city) fieldErrors.city = "Choose a city.";
    if (branchName.length < 2) fieldErrors.branchName = "Enter the primary branch name.";
    if (address.length < 5) fieldErrors.address = "Enter the branch address.";
    if (Object.keys(fieldErrors).length) return { ok: false, message: "Check the highlighted fields.", fieldErrors };

    const existing = sqlite.prepare("SELECT o.id, m.id AS membershipId FROM organization o JOIN member m ON m.organization_id=o.id WHERE o.slug=? AND m.user_id=? LIMIT 1")
      .get(slug, session.user.id) as { id: string; membershipId: string } | undefined;
    let agencyId: string;
    let membershipId: string | undefined;
    if (existing) {
      agencyId = existing.id;
      membershipId = existing.membershipId;
    } else {
      const created = await auth.api.createOrganization({ body: { name, slug, userId: session.user.id } });
      if (!created) throw new DomainError("INTERNAL_ERROR", "The agency could not be created.", 500);
      agencyId = created.id;
      membershipId = created.members[0]?.id;
    }
    if (!membershipId) throw new DomainError("INTERNAL_ERROR", "The owner membership could not be created.", 500);
    const branchId = `br_${randomUUID()}`;
    const staffId = `usr_${randomUUID()}`;
    const now = new Date().toISOString();

    sqlite.transaction(() => {
      sqlite.prepare("INSERT OR IGNORE INTO agencies (id,name,currency,timezone,phone,address,version,created_at,updated_at) VALUES (?,?,'PKR','Asia/Karachi',NULL,?,1,?,?)")
        .run(agencyId, name, address, now, now);
      const existingBranch = sqlite.prepare("SELECT id FROM branches WHERE agency_id=? ORDER BY created_at LIMIT 1").get(agencyId) as { id: string } | undefined;
      const resolvedBranchId = existingBranch?.id ?? branchId;
      if (!existingBranch) {
        sqlite.prepare("INSERT INTO branches (id,agency_id,name,city,address,active,version,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?)")
          .run(resolvedBranchId, agencyId, branchName, city, address, now, now);
      }
      const existingStaff = sqlite.prepare("SELECT id FROM users WHERE agency_id=? AND lower(email)=lower(?) LIMIT 1").get(agencyId, session.user.email) as { id: string } | undefined;
      const resolvedStaffId = existingStaff?.id ?? staffId;
      if (existingStaff) {
        sqlite.prepare("UPDATE users SET auth_user_id=?, membership_id=?, branch_id=?, role='agency_owner', active=1, updated_at=? WHERE id=?")
          .run(session.user.id, membershipId, resolvedBranchId, now, resolvedStaffId);
      } else {
        sqlite.prepare("INSERT INTO users (id,auth_user_id,membership_id,agency_id,branch_id,email,name,role,active,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'agency_owner',1,1,?,?)")
          .run(resolvedStaffId, session.user.id, membershipId, agencyId, resolvedBranchId, session.user.email.toLowerCase(), session.user.name, now, now);
      }
      sqlite.prepare("INSERT OR IGNORE INTO member_branch_access (membership_id,branch_id) VALUES (?,?)").run(membershipId, resolvedBranchId);
      sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,'agency.created','agency',?,?,?)")
        .run(`aud_${randomUUID()}`, agencyId, resolvedStaffId, agencyId, JSON.stringify({ slug }), now);
    })();

    await auth.api.setActiveOrganization({ headers: await headers(), body: { organizationId: agencyId } });
    return { ok: true, data: { agencyId }, message: "Agency created." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function listTeamAction(): Promise<OrganizationActionResult<TeamData>> {
  try {
    const context = await getWebRequestContext();
    requireRole(context, ["agency_owner"]);
    const members = sqlite.prepare(`
      SELECT u.id, u.membership_id AS membershipId, u.name, u.email, u.role, u.active, u.auth_user_id AS authUserId
      FROM users u WHERE u.agency_id=? ORDER BY u.active DESC, u.name
    `).all(context.agencyId) as Array<{ id: string; membershipId: string; name: string; email: string; role: StaffRole; active: number; authUserId: string }>;
    const branchRows = sqlite.prepare(`SELECT mba.membership_id AS membershipId, b.name FROM member_branch_access mba JOIN branches b ON b.id=mba.branch_id WHERE b.agency_id=? ORDER BY b.name`).all(context.agencyId) as Array<{ membershipId: string; name: string }>;
    const branchesByMembership = new Map<string, string[]>();
    for (const row of branchRows) branchesByMembership.set(row.membershipId, [...(branchesByMembership.get(row.membershipId) ?? []), row.name]);
    const invitations = sqlite.prepare(`
      SELECT i.id, i.email, i.role, i.status, i.expires_at AS expiresAt,
             group_concat(b.name, '||') AS branches
      FROM invitation i
      LEFT JOIN invitation_branch_access iba ON iba.invitation_id=i.id
      LEFT JOIN branches b ON b.id=iba.branch_id
      WHERE i.organization_id=?
      GROUP BY i.id ORDER BY i.created_at DESC
    `).all(context.agencyId) as Array<{ id: string; email: string; role: string; status: string; expiresAt: number; branches: string | null }>;
    const branches = sqlite.prepare("SELECT id,name,city FROM branches WHERE agency_id=? AND active=1 ORDER BY name").all(context.agencyId) as TeamData["branches"];
    return {
      ok: true,
      data: {
        members: members.map(item => ({ ...item, active: Boolean(item.active), branches: branchesByMembership.get(item.membershipId) ?? [], isCurrentUser: item.id === context.userId })),
        invitations: invitations.map(item => ({ ...item, expiresAt: new Date(item.expiresAt).toISOString(), branches: item.branches?.split("||") ?? [] })),
        branches,
      },
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function inviteTeamMemberAction(input: { email: string; role: StaffRole; branchIds: string[] }): Promise<OrganizationActionResult> {
  try {
    const context = await getWebRequestContext();
    requireRole(context, ["agency_owner"]);
    const email = input.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } };
    if (!staffRoles.includes(input.role) || input.role === "agency_owner") return { ok: false, message: "Choose a valid staff role." };
    validateBranchIds(context.agencyId, input.branchIds);
    const result = await auth.api.createInvitation({
      headers: await headers(),
      body: { email, role: input.role, organizationId: context.agencyId, resend: true },
    });
    sqlite.transaction(() => {
      sqlite.prepare("DELETE FROM invitation_branch_access WHERE invitation_id=?").run(result.id);
      const insert = sqlite.prepare("INSERT INTO invitation_branch_access (invitation_id,branch_id) VALUES (?,?)");
      for (const branchId of input.branchIds) insert.run(result.id, branchId);
      writeAudit(context.agencyId, context.userId, "staff.invited", "invitation", result.id, { role: input.role });
    })();
    revalidatePath("/settings");
    return { ok: true, message: `Invitation sent to ${email}.` };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function cancelInvitationAction(invitationId: string): Promise<OrganizationActionResult> {
  try {
    const context = await getWebRequestContext();
    requireRole(context, ["agency_owner"]);
    const invitation = sqlite.prepare("SELECT id FROM invitation WHERE id=? AND organization_id=?").get(invitationId, context.agencyId);
    if (!invitation) throw new DomainError("NOT_FOUND", "Invitation not found.", 404);
    await auth.api.cancelInvitation({ headers: await headers(), body: { invitationId } });
    writeAudit(context.agencyId, context.userId, "staff.invitation_cancelled", "invitation", invitationId);
    return { ok: true, message: "Invitation cancelled." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateMemberAction(input: { membershipId: string; role: StaffRole; active: boolean; branchIds: string[] }): Promise<OrganizationActionResult> {
  try {
    const context = await getWebRequestContext();
    requireRole(context, ["agency_owner"]);
    if (!staffRoles.includes(input.role)) throw new DomainError("VALIDATION_FAILED", "Choose a valid role.", 400);
    validateBranchIds(context.agencyId, input.branchIds);
    const target = sqlite.prepare("SELECT id,auth_user_id AS authUserId,role,active FROM users WHERE agency_id=? AND membership_id=? LIMIT 1")
      .get(context.agencyId, input.membershipId) as { id: string; authUserId: string; role: StaffRole; active: number } | undefined;
    if (!target) throw new DomainError("NOT_FOUND", "Team member not found.", 404);
    if (target.id === context.userId && !input.active) throw new DomainError("VALIDATION_FAILED", "You cannot deactivate your own membership.", 400);
    if (target.role === "agency_owner" && (input.role !== "agency_owner" || !input.active)) assertAnotherOwner(context.agencyId, target.id);
    if (target.role !== input.role) {
      await auth.api.updateMemberRole({ headers: await headers(), body: { memberId: input.membershipId, role: input.role, organizationId: context.agencyId } });
    }
    sqlite.transaction(() => {
      sqlite.prepare("UPDATE users SET role=?,active=?,updated_at=?,version=version+1 WHERE id=?").run(input.role, input.active ? 1 : 0, new Date().toISOString(), target.id);
      sqlite.prepare("DELETE FROM member_branch_access WHERE membership_id=?").run(input.membershipId);
      const insert = sqlite.prepare("INSERT INTO member_branch_access (membership_id,branch_id) VALUES (?,?)");
      for (const branchId of input.branchIds) insert.run(input.membershipId, branchId);
      writeAudit(context.agencyId, context.userId, "staff.membership_updated", "user", target.id, { role: input.role, active: input.active });
    })();
    revalidatePath("/settings");
    return { ok: true, message: "Team member updated." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function addTeamMemberDirectAction(input: {
  name: string;
  email: string;
  password?: string;
  role: StaffRole;
  branchIds: string[];
}): Promise<OrganizationActionResult<{ userId: string }>> {
  try {
    const context = await getWebRequestContext();
    requireRole(context, ["agency_owner"]);

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password?.trim() ?? "";

    const fieldErrors: Record<string, string> = {};
    if (name.length < 2) fieldErrors.name = "Enter the user's full name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) fieldErrors.email = "Enter a valid email address.";
    if (!staffRoles.includes(input.role)) fieldErrors.role = "Choose a valid staff role.";

    const existingStaff = sqlite
      .prepare("SELECT id, active FROM users WHERE agency_id=? AND lower(email)=lower(?) LIMIT 1")
      .get(context.agencyId, email) as { id: string; active: number } | undefined;

    if (existingStaff) {
      if (existingStaff.active) {
        return { ok: false, message: "A team member with this email already belongs to this agency.", fieldErrors: { email: "Email already exists in this agency." } };
      } else {
        return { ok: false, message: "A team member with this email exists but is inactive. You can reactivate them from the list below." };
      }
    }

    validateBranchIds(context.agencyId, input.branchIds);

    const existingAuthUser = sqlite
      .prepare("SELECT id, name, email FROM user WHERE lower(email)=lower(?) LIMIT 1")
      .get(email) as { id: string; name: string; email: string } | undefined;

    if (!existingAuthUser && password.length < 10) {
      fieldErrors.password = "Password must be at least 10 characters.";
    }

    if (Object.keys(fieldErrors).length) {
      return { ok: false, message: "Check the highlighted fields.", fieldErrors };
    }

    const now = new Date().toISOString();
    const nowDate = new Date();
    const staffId = `usr_${randomUUID()}`;
    const membershipId = `mem_${randomUUID()}`;
    const primaryBranchId = input.branchIds.length === 1 ? input.branchIds[0] : null;

    if (existingAuthUser) {
      const existingMember = sqlite
        .prepare("SELECT id FROM member WHERE organization_id=? AND user_id=? LIMIT 1")
        .get(context.agencyId, existingAuthUser.id) as { id: string } | undefined;

      const resolvedMembershipId = existingMember?.id ?? membershipId;

      sqlite.transaction(() => {
        if (!existingMember) {
          sqlite.prepare("INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)")
            .run(resolvedMembershipId, context.agencyId, existingAuthUser.id, input.role, nowDate.getTime());
        }

        sqlite.prepare(
          "INSERT INTO users (id, auth_user_id, membership_id, agency_id, branch_id, email, name, role, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)"
        ).run(
          staffId,
          existingAuthUser.id,
          resolvedMembershipId,
          context.agencyId,
          primaryBranchId,
          email,
          name || existingAuthUser.name,
          input.role,
          now,
          now
        );

        sqlite.prepare("DELETE FROM member_branch_access WHERE membership_id=?").run(resolvedMembershipId);
        const insertBranch = sqlite.prepare("INSERT OR IGNORE INTO member_branch_access (membership_id, branch_id) VALUES (?, ?)");
        for (const branchId of input.branchIds) {
          insertBranch.run(resolvedMembershipId, branchId);
        }

        writeAudit(context.agencyId, context.userId, "staff.created", "user", staffId, {
          role: input.role,
          email,
          name,
          method: "direct",
        });
      })();

      revalidatePath("/settings");
      return {
        ok: true,
        data: { userId: staffId },
        message: `Added existing account (${email}) to your team as ${input.role.replaceAll("_", " ")}.`,
      };
    }

    const authUserId = `auth_${randomUUID()}`;
    const hashedPassword = await hashPassword(password);

    sqlite.transaction(() => {
      sqlite.prepare("INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at) VALUES (?, ?, ?, 1, NULL, ?, ?)")
        .run(authUserId, name, email, nowDate.getTime(), nowDate.getTime());

      sqlite.prepare("INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)")
        .run(`acc_${randomUUID()}`, authUserId, authUserId, hashedPassword, nowDate.getTime(), nowDate.getTime());

      sqlite.prepare("INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(membershipId, context.agencyId, authUserId, input.role, nowDate.getTime());

      sqlite.prepare(
        "INSERT INTO users (id, auth_user_id, membership_id, agency_id, branch_id, email, name, role, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)"
      ).run(
        staffId,
        authUserId,
        membershipId,
        context.agencyId,
        primaryBranchId,
        email,
        name,
        input.role,
        now,
        now
      );

      const insertBranch = sqlite.prepare("INSERT OR IGNORE INTO member_branch_access (membership_id, branch_id) VALUES (?, ?)");
      for (const branchId of input.branchIds) {
        insertBranch.run(membershipId, branchId);
      }

      writeAudit(context.agencyId, context.userId, "staff.created", "user", staffId, {
        role: input.role,
        email,
        name,
        method: "direct",
      });
    })();

    revalidatePath("/settings");
    return {
      ok: true,
      data: { userId: staffId },
      message: `User ${name} (${email}) created successfully as ${input.role.replaceAll("_", " ")}.`,
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function resetMemberPasswordDirectAction(input: {
  memberUserId: string;
  newPassword: string;
}): Promise<OrganizationActionResult> {
  try {
    const context = await getWebRequestContext();
    requireRole(context, ["agency_owner"]);

    const newPassword = input.newPassword.trim();
    if (newPassword.length < 10) {
      return { ok: false, message: "Password must be at least 10 characters." };
    }

    const staff = sqlite.prepare("SELECT id, auth_user_id AS authUserId, email, name FROM users WHERE agency_id=? AND id=? LIMIT 1")
      .get(context.agencyId, input.memberUserId) as { id: string; authUserId: string; email: string; name: string } | undefined;

    if (!staff || !staff.authUserId) {
      throw new DomainError("NOT_FOUND", "Team member account not found.", 404);
    }

    const hashedPassword = await hashPassword(newPassword);
    const now = Date.now();

    sqlite.transaction(() => {
      const existingAccount = sqlite.prepare("SELECT id FROM account WHERE user_id=? AND provider_id='credential' LIMIT 1")
        .get(staff.authUserId) as { id: string } | undefined;

      if (existingAccount) {
        sqlite.prepare("UPDATE account SET password=?, updated_at=? WHERE id=?")
          .run(hashedPassword, now, existingAccount.id);
      } else {
        sqlite.prepare("INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)")
          .run(`acc_${randomUUID()}`, staff.authUserId, staff.authUserId, hashedPassword, now, now);
      }

      sqlite.prepare("DELETE FROM session WHERE user_id=?").run(staff.authUserId);

      writeAudit(context.agencyId, context.userId, "staff.password_reset", "user", staff.id, {
        email: staff.email,
      });
    })();

    return { ok: true, message: `Password for ${staff.name} has been updated.` };
  } catch (error) {
    return actionFailure(error);
  }
}

export type BranchItem = {
  id: string;
  name: string;
  city: string;
  address: string;
  active: boolean;
};

export async function listBranchesAction(): Promise<OrganizationActionResult<BranchItem[]>> {
  try {
    const context = await getWebRequestContext();
    const rows = sqlite.prepare(`
      SELECT id, name, city, address, active
      FROM branches
      WHERE agency_id=?
      ORDER BY active DESC, name ASC
    `).all(context.agencyId) as Array<{ id: string; name: string; city: string; address: string; active: number }>;

    return {
      ok: true,
      data: rows.map(r => ({
        id: r.id,
        name: r.name,
        city: r.city,
        address: r.address,
        active: Boolean(r.active),
      })),
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createBranchAction(input: {
  name: string;
  city: string;
  address: string;
}): Promise<OrganizationActionResult<{ branchId: string }>> {
  try {
    const context = await getWebRequestContext();
    requireRole(context, ["agency_owner"]);

    const name = input.name.trim();
    const city = input.city.trim();
    const address = input.address.trim();

    const fieldErrors: Record<string, string> = {};
    if (name.length < 2) fieldErrors.name = "Enter the branch name.";
    if (city.length < 2) fieldErrors.city = "Enter the city name.";
    if (address.length < 3) fieldErrors.address = "Enter the branch address.";

    if (Object.keys(fieldErrors).length) {
      return { ok: false, message: "Check the highlighted fields.", fieldErrors };
    }

    const branchId = `br_${randomUUID()}`;
    const now = new Date().toISOString();

    sqlite.transaction(() => {
      sqlite.prepare(`
        INSERT INTO branches (id, agency_id, name, city, address, active, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
      `).run(branchId, context.agencyId, name, city, address, now, now);

      writeAudit(context.agencyId, context.userId, "branch.created", "branch", branchId, {
        name,
        city,
      });
    })();

    revalidatePath("/settings");
    return {
      ok: true,
      data: { branchId },
      message: `Branch "${name}" in ${city} added successfully.`,
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function toggleBranchActiveAction(input: {
  branchId: string;
  active: boolean;
}): Promise<OrganizationActionResult> {
  try {
    const context = await getWebRequestContext();
    requireRole(context, ["agency_owner"]);

    const branch = sqlite.prepare("SELECT id, name, city FROM branches WHERE id=? AND agency_id=? LIMIT 1")
      .get(input.branchId, context.agencyId) as { id: string; name: string; city: string } | undefined;

    if (!branch) throw new DomainError("NOT_FOUND", "Branch not found.", 404);

    const now = new Date().toISOString();
    sqlite.prepare("UPDATE branches SET active=?, updated_at=?, version=version+1 WHERE id=?")
      .run(input.active ? 1 : 0, now, input.branchId);

    writeAudit(context.agencyId, context.userId, input.active ? "branch.activated" : "branch.deactivated", "branch", branch.id, {
      name: branch.name,
      city: branch.city,
    });

    revalidatePath("/settings");
    return {
      ok: true,
      message: `${branch.name} ${input.active ? "activated" : "deactivated"}.`,
    };
  } catch (error) {
    return actionFailure(error);
  }
}

function validateBranchIds(agencyId: string, branchIds: string[]) {
  if (!branchIds.length) return;
  const placeholders = branchIds.map(() => "?").join(",");
  const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM branches WHERE agency_id=? AND active=1 AND id IN (${placeholders})`).get(agencyId, ...branchIds) as { count: number };
  if (row.count !== new Set(branchIds).size) throw new DomainError("VALIDATION_FAILED", "One or more branches are invalid.", 400);
}

function assertAnotherOwner(agencyId: string, excludingId: string) {
  const row = sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE agency_id=? AND id<>? AND role='agency_owner' AND active=1").get(agencyId, excludingId) as { count: number };
  if (row.count < 1) throw new DomainError("VALIDATION_FAILED", "Assign another active agency owner first.", 400);
}

function writeAudit(agencyId: string, actorId: string, action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>) {
  sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(`aud_${randomUUID()}`, agencyId, actorId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null, new Date().toISOString());
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function actionFailure(error: unknown): OrganizationActionResult<never> {
  const issue = asDomainError(error);
  if (issue.status >= 500) console.error(issue);
  const message = issue.code === "INTERNAL_ERROR" && error instanceof Error && error.message.includes("UNIQUE")
    ? "That agency slug or email is already in use."
    : issue.message;
  return { ok: false, message, fieldErrors: issue.fieldErrors };
}
