"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/server/auth/auth";
import { getOptionalWebSession, getWebRequestContext } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorize";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { authTimestamp } from "@/server/auth/auth-timestamp";
import { asDomainError, DomainError } from "@/server/domain/errors";
import { staffRoles, type StaffRole } from "@/server/context/request-context";
import {
  updateAgreementDesigner,
  updateRentalTerms,
  updateOrganizationProfile,
  type OrganizationSettingsDto,
} from "@/server/services/organization-settings-service";
import { composeTermsSnapshot, defaultAgreementConfig, type AgreementDesignConfig } from "@/lib/agreement-config";
import { uploadAgreementTermsImage } from "@/server/services/private-file-service";

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
    await inTransaction(async ()=>{
      await execute("UPDATE users SET name=?,phone=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?",[name,phone||null,now,context.agencyId,context.userId]);
      await execute("UPDATE user SET name=?,updated_at=? WHERE id=?",[name,authTimestamp(new Date()),context.authUserId]);
      await writeAudit(context.agencyId,context.userId,"profile.updated","user",context.userId,{phoneUpdated:Boolean(phone)});
    },{immediate:true});
    revalidatePath("/","layout");
    return {ok:true,data:{name,phone},message:"Profile updated."};
  } catch(error){return actionFailure(error);}
}

export async function updateRentalTermsAction(terms:string,language:"en"|"ur"="en"):Promise<OrganizationActionResult<{terms:string}>> {
  try { const context=await getWebRequestContext();const value=terms.trim();if(value.length<40)return {ok:false,message:"Rental terms should contain at least 40 characters.",fieldErrors:{terms:"Add the key renter obligations."}};await updateRentalTerms(context,value,language);revalidatePath("/settings");return {ok:true,data:{terms:value},message:`${language==="ur"?"Urdu":"English"} terms updated for future bookings and PDFs.`};} catch(error){return actionFailure(error);}
}

export async function updateOrganizationProfileAction(input:OrganizationSettingsDto["profile"]):Promise<OrganizationActionResult<OrganizationSettingsDto["profile"]>> {
  try{const data=await updateOrganizationProfile(await getWebRequestContext(),input);revalidatePath("/","layout");return {ok:true,data,message:"Organization profile saved."}}catch(error){return actionFailure(error)}
}

export async function updateAgreementDesignerAction(input:AgreementDesignConfig):Promise<OrganizationActionResult<AgreementDesignConfig>> {
  try{const data=await updateAgreementDesigner(await getWebRequestContext(),input);revalidatePath("/settings");return {ok:true,data,message:"Agreement design saved for future rentals."}}catch(error){return actionFailure(error)}
}

export async function uploadAgreementTermsImageAction(formData: FormData): Promise<OrganizationActionResult<NonNullable<AgreementDesignConfig["termsImage"]>>> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, message: "Choose a JPG or PNG image." };
    const saved = await uploadAgreementTermsImage(await getWebRequestContext(), file);
    return { ok: true, data: { id: saved.id, name: saved.originalName, url: saved.downloadUrl }, message: "Terms image uploaded. Save the agreement design to use it for future rentals." };
  } catch (error) { return actionFailure(error); }
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

    const existing = await queryOne<{ id: string; membershipId: string }>("SELECT o.id, m.id AS membershipId FROM organization o JOIN member m ON m.organization_id=o.id WHERE o.slug=? AND m.user_id=? LIMIT 1",[slug, session.user.id]);
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

    await inTransaction(async () => {
      await execute("INSERT OR IGNORE INTO agencies (id,name,currency,timezone,phone,address,agreement_header,agreement_locale,agreement_config,rental_terms,version,created_at,updated_at) VALUES (?,?,'PKR','Asia/Karachi',NULL,?,?,?,?,?,1,?,?)",[agencyId, name, address, defaultAgreementConfig.titleEn, defaultAgreementConfig.language, JSON.stringify(defaultAgreementConfig), composeTermsSnapshot({ ...defaultAgreementConfig, language: "en" }), now, now]);
      const existingBranch = await queryOne<{ id: string }>("SELECT id FROM branches WHERE agency_id=? ORDER BY created_at LIMIT 1",[agencyId]);
      const resolvedBranchId = existingBranch?.id ?? branchId;
      if (!existingBranch) {
        await execute("INSERT INTO branches (id,agency_id,name,city,address,active,version,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?)",[resolvedBranchId, agencyId, branchName, city, address, now, now]);
      }
      const existingStaff = await queryOne<{ id: string }>("SELECT id FROM users WHERE agency_id=? AND lower(email)=lower(?) LIMIT 1",[agencyId, session.user.email]);
      const resolvedStaffId = existingStaff?.id ?? staffId;
      if (existingStaff) {
        await execute("UPDATE users SET auth_user_id=?, membership_id=?, branch_id=?, role='agency_owner', active=1, updated_at=? WHERE id=?",[session.user.id, membershipId, resolvedBranchId, now, resolvedStaffId]);
      } else {
        await execute("INSERT INTO users (id,auth_user_id,membership_id,agency_id,branch_id,email,name,role,active,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'agency_owner',1,1,?,?)",[resolvedStaffId, session.user.id, membershipId, agencyId, resolvedBranchId, session.user.email.toLowerCase(), session.user.name, now, now]);
      }
      await execute("INSERT OR IGNORE INTO member_branch_access (membership_id,branch_id) VALUES (?,?)",[membershipId, resolvedBranchId]);
      await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,'agency.created','agency',?,?,?)",[`aud_${randomUUID()}`, agencyId, resolvedStaffId, agencyId, JSON.stringify({ slug }), now]);
    },{immediate:true});

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
    const members = await queryAll<{ id: string; membershipId: string; name: string; email: string; role: StaffRole; active: number; authUserId: string }>(`
      SELECT u.id, u.membership_id AS membershipId, u.name, u.email, u.role, u.active, u.auth_user_id AS authUserId
      FROM users u WHERE u.agency_id=? ORDER BY u.active DESC, u.name
    `,[context.agencyId]);
    const branchRows = await queryAll<{ membershipId: string; name: string }>(`SELECT mba.membership_id AS membershipId, b.name FROM member_branch_access mba JOIN branches b ON b.id=mba.branch_id WHERE b.agency_id=? ORDER BY b.name`,[context.agencyId]);
    const branchesByMembership = new Map<string, string[]>();
    for (const row of branchRows) branchesByMembership.set(row.membershipId, [...(branchesByMembership.get(row.membershipId) ?? []), row.name]);
    const invitations = await queryAll<{ id: string; email: string; role: string; status: string; expiresAt: number; branches: string | null }>(`
      SELECT i.id, i.email, i.role, i.status, i.expires_at AS expiresAt,
             group_concat(b.name, '||') AS branches
      FROM invitation i
      LEFT JOIN invitation_branch_access iba ON iba.invitation_id=i.id
      LEFT JOIN branches b ON b.id=iba.branch_id
      WHERE i.organization_id=?
      GROUP BY i.id ORDER BY i.created_at DESC
    `,[context.agencyId]);
    const branches = await queryAll<TeamData["branches"][number]>("SELECT id,name,city FROM branches WHERE agency_id=? AND active=1 ORDER BY name",[context.agencyId]);
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
    await validateBranchIds(context.agencyId, input.branchIds);
    const result = await auth.api.createInvitation({
      headers: await headers(),
      body: { email, role: input.role, organizationId: context.agencyId, resend: true },
    });
    await inTransaction(async () => {
      await execute("DELETE FROM invitation_branch_access WHERE invitation_id=?",[result.id]);
      for (const branchId of input.branchIds) await execute("INSERT INTO invitation_branch_access (invitation_id,branch_id) VALUES (?,?)",[result.id, branchId]);
      await writeAudit(context.agencyId, context.userId, "staff.invited", "invitation", result.id, { role: input.role });
    },{immediate:true});
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
    const invitation = await queryOne("SELECT id FROM invitation WHERE id=? AND organization_id=?",[invitationId, context.agencyId]);
    if (!invitation) throw new DomainError("NOT_FOUND", "Invitation not found.", 404);
    await auth.api.cancelInvitation({ headers: await headers(), body: { invitationId } });
    await writeAudit(context.agencyId, context.userId, "staff.invitation_cancelled", "invitation", invitationId);
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
    await validateBranchIds(context.agencyId, input.branchIds);
    const target = await queryOne<{ id: string; authUserId: string; role: StaffRole; active: number }>("SELECT id,auth_user_id AS authUserId,role,active FROM users WHERE agency_id=? AND membership_id=? LIMIT 1",[context.agencyId, input.membershipId]);
    if (!target) throw new DomainError("NOT_FOUND", "Team member not found.", 404);
    if (target.id === context.userId && !input.active) throw new DomainError("VALIDATION_FAILED", "You cannot deactivate your own membership.", 400);
    if (target.role === "agency_owner" && (input.role !== "agency_owner" || !input.active)) await assertAnotherOwner(context.agencyId, target.id);
    if (target.role !== input.role) {
      await auth.api.updateMemberRole({ headers: await headers(), body: { memberId: input.membershipId, role: input.role, organizationId: context.agencyId } });
    }
    await inTransaction(async () => {
      await execute("UPDATE users SET role=?,active=?,updated_at=?,version=version+1 WHERE id=?",[input.role, input.active ? 1 : 0, new Date().toISOString(), target.id]);
      await execute("DELETE FROM member_branch_access WHERE membership_id=?",[input.membershipId]);
      for (const branchId of input.branchIds) await execute("INSERT INTO member_branch_access (membership_id,branch_id) VALUES (?,?)",[input.membershipId, branchId]);
      await writeAudit(context.agencyId, context.userId, "staff.membership_updated", "user", target.id, { role: input.role, active: input.active });
    },{immediate:true});
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

    const existingStaff = await queryOne<{ id: string; active: number }>("SELECT id, active FROM users WHERE agency_id=? AND lower(email)=lower(?) LIMIT 1",[context.agencyId, email]);

    if (existingStaff) {
      if (existingStaff.active) {
        return { ok: false, message: "A team member with this email already belongs to this agency.", fieldErrors: { email: "Email already exists in this agency." } };
      } else {
        return { ok: false, message: "A team member with this email exists but is inactive. You can reactivate them from the list below." };
      }
    }

    await validateBranchIds(context.agencyId, input.branchIds);

    const existingAuthUser = await queryOne<{ id: string; name: string; email: string }>("SELECT id, name, email FROM user WHERE lower(email)=lower(?) LIMIT 1",[email]);

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
      const existingMember = await queryOne<{ id: string }>("SELECT id FROM member WHERE organization_id=? AND user_id=? LIMIT 1",[context.agencyId, existingAuthUser.id]);

      const resolvedMembershipId = existingMember?.id ?? membershipId;

      await inTransaction(async () => {
        if (!existingMember) {
          await execute("INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",[resolvedMembershipId, context.agencyId, existingAuthUser.id, input.role, authTimestamp(nowDate)]);
        }

        await execute(
          "INSERT INTO users (id, auth_user_id, membership_id, agency_id, branch_id, email, name, role, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)"
        ,[
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
        ]);

        await execute("DELETE FROM member_branch_access WHERE membership_id=?",[resolvedMembershipId]);
        for (const branchId of input.branchIds) {
          await execute("INSERT OR IGNORE INTO member_branch_access (membership_id, branch_id) VALUES (?, ?)",[resolvedMembershipId, branchId]);
        }

        await writeAudit(context.agencyId, context.userId, "staff.created", "user", staffId, {
          role: input.role,
          email,
          name,
          method: "direct",
        });
      },{immediate:true});

      revalidatePath("/settings");
      return {
        ok: true,
        data: { userId: staffId },
        message: `Added existing account (${email}) to your team as ${input.role.replaceAll("_", " ")}.`,
      };
    }

    const authUserId = `auth_${randomUUID()}`;
    const hashedPassword = await hashPassword(password);

    await inTransaction(async () => {
      await execute("INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at) VALUES (?, ?, ?, 1, NULL, ?, ?)",[authUserId, name, email, authTimestamp(nowDate), authTimestamp(nowDate)]);

      await execute("INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)",[`acc_${randomUUID()}`, authUserId, authUserId, hashedPassword, authTimestamp(nowDate), authTimestamp(nowDate)]);

      await execute("INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",[membershipId, context.agencyId, authUserId, input.role, authTimestamp(nowDate)]);

      await execute(
        "INSERT INTO users (id, auth_user_id, membership_id, agency_id, branch_id, email, name, role, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)"
      ,[
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
      ]);

      for (const branchId of input.branchIds) {
        await execute("INSERT OR IGNORE INTO member_branch_access (membership_id, branch_id) VALUES (?, ?)",[membershipId, branchId]);
      }

      await writeAudit(context.agencyId, context.userId, "staff.created", "user", staffId, {
        role: input.role,
        email,
        name,
        method: "direct",
      });
    },{immediate:true});

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

    const staff = await queryOne<{ id: string; authUserId: string; email: string; name: string }>("SELECT id, auth_user_id AS authUserId, email, name FROM users WHERE agency_id=? AND id=? LIMIT 1",[context.agencyId, input.memberUserId]);

    if (!staff || !staff.authUserId) {
      throw new DomainError("NOT_FOUND", "Team member account not found.", 404);
    }

    const hashedPassword = await hashPassword(newPassword);
    const now = authTimestamp(new Date());

    await inTransaction(async () => {
      const existingAccount = await queryOne<{ id: string }>("SELECT id FROM account WHERE user_id=? AND provider_id='credential' LIMIT 1",[staff.authUserId]);

      if (existingAccount) {
        await execute("UPDATE account SET password=?, updated_at=? WHERE id=?",[hashedPassword, now, existingAccount.id]);
      } else {
        await execute("INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)",[`acc_${randomUUID()}`, staff.authUserId, staff.authUserId, hashedPassword, now, now]);
      }

      await execute("DELETE FROM session WHERE user_id=?",[staff.authUserId]);

      await writeAudit(context.agencyId, context.userId, "staff.password_reset", "user", staff.id, {
        email: staff.email,
      });
    },{immediate:true});

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
    const rows = await queryAll<{ id: string; name: string; city: string; address: string; active: number }>(`
      SELECT id, name, city, address, active
      FROM branches
      WHERE agency_id=?
      ORDER BY active DESC, name ASC
    `,[context.agencyId]);

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

    await inTransaction(async () => {
      await execute(`
        INSERT INTO branches (id, agency_id, name, city, address, active, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
      `,[branchId, context.agencyId, name, city, address, now, now]);

      await writeAudit(context.agencyId, context.userId, "branch.created", "branch", branchId, {
        name,
        city,
      });
    },{immediate:true});

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

    const branch = await queryOne<{ id: string; name: string; city: string }>("SELECT id, name, city FROM branches WHERE id=? AND agency_id=? LIMIT 1",[input.branchId, context.agencyId]);

    if (!branch) throw new DomainError("NOT_FOUND", "Branch not found.", 404);

    const now = new Date().toISOString();
    await execute("UPDATE branches SET active=?, updated_at=?, version=version+1 WHERE id=?",[input.active ? 1 : 0, now, input.branchId]);

    await writeAudit(context.agencyId, context.userId, input.active ? "branch.activated" : "branch.deactivated", "branch", branch.id, {
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

async function validateBranchIds(agencyId: string, branchIds: string[]) {
  if (!branchIds.length) return;
  const placeholders = branchIds.map(() => "?").join(",");
  const row = (await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM branches WHERE agency_id=? AND active=1 AND id IN (${placeholders})`,[agencyId, ...branchIds]))!;
  if (row.count !== new Set(branchIds).size) throw new DomainError("VALIDATION_FAILED", "One or more branches are invalid.", 400);
}

async function assertAnotherOwner(agencyId: string, excludingId: string) {
  const row = (await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE agency_id=? AND id<>? AND role='agency_owner' AND active=1",[agencyId, excludingId]))!;
  if (row.count < 1) throw new DomainError("VALIDATION_FAILED", "Assign another active agency owner first.", 400);
}

function writeAudit(agencyId: string, actorId: string, action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>) {
  return execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[`aud_${randomUUID()}`, agencyId, actorId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null, new Date().toISOString()]);
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
