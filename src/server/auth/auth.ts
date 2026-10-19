import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { bearer, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { getDatabaseTarget } from "@/db/database-target";
import { queryOne } from "@/db/query";
import { sendAuthEmail } from "@/server/auth/email";
import { organizationAccess, organizationRoles } from "@/server/auth/permissions";
import { authPolicy } from "@/server/auth/policy";

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const trustedOrigins = [
  baseUrl,
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map(value => value.trim()).filter(Boolean) ?? []),
];

const databaseAdapter = await (async () => {
  if (getDatabaseTarget() === "postgres") {
    const [{ postgresDb }, schema] = await Promise.all([
      import("@/db/postgres/connection"),
      import("@/db/postgres/schema"),
    ]);
    return drizzleAdapter(postgresDb, { provider: "pg", schema });
  }
  const [{ db }, schema] = await Promise.all([
    import("@/db/connection"),
    import("@/db/schema"),
  ]);
  return drizzleAdapter(db, { provider: "sqlite", schema });
})();

export const auth = betterAuth({
  appName: "VibeRent",
  baseURL: baseUrl,
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "viberent-development-secret-change-before-production"),
  trustedOrigins: [...new Set(trustedOrigins)],
  database: databaseAdapter,
  databaseHooks: {
    user: {
      create: {
        before: async user => {
          return { data: { ...user, emailVerified: true } };
        },
      },
    },
    session: {
      create: {
        before: async session => {
          const firstMembership = await queryOne<{ organizationId: string }>(
            "SELECT organization_id AS \"organizationId\" FROM member WHERE user_id=? ORDER BY created_at LIMIT 1",
            [session.userId],
          );
          return { data: { ...session, activeOrganizationId: firstMembership?.organizationId } };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: authPolicy.requireEmailVerification,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Reset your VibeRent password",
        heading: "Reset your password",
        message: "Use the secure link below to choose a new password. The link expires in one hour.",
        actionLabel: "Reset password",
        actionUrl: url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: authPolicy.requireEmailVerification,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Verify your VibeRent email",
        heading: "Verify your email",
        message: "Confirm this email address to finish setting up your VibeRent account.",
        actionLabel: "Verify email",
        actionUrl: url,
      });
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
  plugins: [
    organization({
      ac: organizationAccess,
      roles: organizationRoles,
      creatorRole: "agency_owner",
      organizationLimit: 10,
      membershipLimit: 100,
      invitationExpiresIn: 60 * 60 * 48,
      requireEmailVerificationOnInvitation: false,
      cancelPendingInvitationsOnReInvite: true,
      disableOrganizationDeletion: true,
      async sendInvitationEmail(data) {
        const url = new URL(`/accept-invitation/${data.id}`, baseUrl).toString();
        await sendAuthEmail({
          to: data.email,
          subject: `Join ${data.organization.name} on VibeRent`,
          heading: `You’re invited to ${data.organization.name}`,
          message: `${data.inviter.user.name} invited you to join their rental operations team as ${data.role.replaceAll("_", " ")}.`,
          actionLabel: "Review invitation",
          actionUrl: url,
        });
      },
    }),
    // Native clients (mobile app): turns `Authorization: Bearer <token>` into
    // the session cookie and returns the token in `set-auth-token`. Only
    // signed tokens are accepted.
    bearer({ requireSignature: true }),
    nextCookies(),
  ],
});
