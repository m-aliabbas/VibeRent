import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { RequestContext, StaffRole } from "@/server/context/request-context";
import { staffRoles } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { auth } from "@/server/auth/auth";
import { sqlite } from "@/db/connection";

type BetterSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type SessionViewer = {
  authUserId: string;
  staffUserId?: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
  activeAgencyId?: string;
  activeAgencyName?: string;
  membershipId?: string;
  role?: StaffRole;
  active: boolean;
  branchIds: string[];
  organizations: Array<{ id: string; name: string; slug: string; role: StaffRole }>;
};

export async function getOptionalWebSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getSessionViewer(requestHeaders?: Headers): Promise<SessionViewer | null> {
  const session = await auth.api.getSession({ headers: requestHeaders ?? await headers() });
  if (!session) return null;
  return resolveViewer(session);
}

export async function getWebRequestContext(): Promise<RequestContext> {
  const viewer = await getSessionViewer();
  return viewerToContext(viewer);
}

export async function getApiRequestContext(request: Request): Promise<RequestContext> {
  const viewer = await getSessionViewer(request.headers);
  return viewerToContext(viewer);
}

function viewerToContext(viewer: SessionViewer | null): RequestContext {
  if (!viewer?.staffUserId || !viewer.activeAgencyId || !viewer.membershipId || !viewer.role || !viewer.active) {
    throw new DomainError("UNAUTHENTICATED", "Authentication and an active agency membership are required.", 401);
  }
  return {
    requestId: `req_${randomUUID()}`,
    userId: viewer.staffUserId,
    authUserId: viewer.authUserId,
    agencyId: viewer.activeAgencyId,
    membershipId: viewer.membershipId,
    branchId: viewer.branchIds.length === 1 ? viewer.branchIds[0] : undefined,
    branchIds: viewer.branchIds,
    roles: [viewer.role],
  };
}

function resolveViewer(session: BetterSession): SessionViewer {
  const memberships = sqlite.prepare(`
    SELECT m.id, m.organization_id AS organizationId, m.role, o.name, o.slug,
           CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS hasAgency
    FROM member m
    JOIN organization o ON o.id = m.organization_id
    LEFT JOIN agencies a ON a.id = m.organization_id
    WHERE m.user_id = ?
    ORDER BY m.created_at ASC
  `).all(session.user.id) as Array<{ id: string; organizationId: string; role: string; name: string; slug: string; hasAgency: number }>;

  const organizations = memberships
    .filter(item => item.hasAgency === 1 && isStaffRole(item.role))
    .map(item => ({ id: item.organizationId, name: item.name, slug: item.slug, role: item.role as StaffRole }));
  const requestedAgencyId = session.session.activeOrganizationId;
  const activeMembership = memberships.find(item => item.organizationId === requestedAgencyId && item.hasAgency === 1)
    ?? memberships.find(item => item.hasAgency === 1);

  if (!activeMembership || !isStaffRole(activeMembership.role)) {
    return {
      authUserId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      emailVerified: session.user.emailVerified,
      active: false,
      branchIds: [],
      organizations,
    };
  }

  const staff = syncStaffProfile({
    authUserId: session.user.id,
    membershipId: activeMembership.id,
    agencyId: activeMembership.organizationId,
    email: session.user.email,
    name: session.user.name,
    role: activeMembership.role,
  });
  const branchIds = sqlite.prepare("SELECT branch_id AS branchId FROM member_branch_access WHERE membership_id=? ORDER BY branch_id")
    .all(activeMembership.id).map(row => (row as { branchId: string }).branchId);

  return {
    authUserId: session.user.id,
    staffUserId: staff.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    emailVerified: session.user.emailVerified,
    activeAgencyId: activeMembership.organizationId,
    activeAgencyName: activeMembership.name,
    membershipId: activeMembership.id,
    role: activeMembership.role,
    active: Boolean(staff.active),
    branchIds,
    organizations,
  };
}

function syncStaffProfile(input: { authUserId: string; membershipId: string; agencyId: string; email: string; name: string; role: StaffRole }) {
  const existing = sqlite.prepare("SELECT id, active, role FROM users WHERE agency_id=? AND (auth_user_id=? OR lower(email)=lower(?)) LIMIT 1")
    .get(input.agencyId, input.authUserId, input.email) as { id: string; active: number; role: string } | undefined;
  const now = new Date().toISOString();

  if (existing) {
    sqlite.prepare("UPDATE users SET auth_user_id=?, membership_id=?, email=?, name=?, role=?, updated_at=?, version=version+1 WHERE id=?")
      .run(input.authUserId, input.membershipId, input.email.toLowerCase(), input.name, input.role, now, existing.id);
    return { id: existing.id, active: existing.active };
  }

  const id = `usr_${randomUUID()}`;
  sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO users (id, auth_user_id, membership_id, agency_id, branch_id, email, name, role, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 1, 1, ?, ?)")
      .run(id, input.authUserId, input.membershipId, input.agencyId, input.email.toLowerCase(), input.name, input.role, now, now);
    const invite = sqlite.prepare("SELECT id FROM invitation WHERE organization_id=? AND lower(email)=lower(?) AND status='accepted' ORDER BY created_at DESC LIMIT 1")
      .get(input.agencyId, input.email) as { id: string } | undefined;
    if (invite) {
      sqlite.prepare("INSERT OR IGNORE INTO member_branch_access (membership_id, branch_id) SELECT ?, branch_id FROM invitation_branch_access WHERE invitation_id=?")
        .run(input.membershipId, invite.id);
    }
    sqlite.prepare("INSERT INTO audit_events (id, agency_id, actor_id, action, entity_type, entity_id, metadata, occurred_at) VALUES (?, ?, ?, 'staff.joined', 'user', ?, ?, ?)")
      .run(`aud_${randomUUID()}`, input.agencyId, id, id, JSON.stringify({ role: input.role }), now);
  })();
  return { id, active: 1 };
}

function isStaffRole(value: string): value is StaffRole {
  return (staffRoles as readonly string[]).includes(value);
}
