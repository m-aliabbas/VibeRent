import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db, sqlite } from "@/db/connection";
import * as schema from "@/db/schema";
import { sendAuthEmail } from "@/server/auth/email";
import { organizationAccess, organizationRoles } from "@/server/auth/permissions";

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  appName: "VibeRent",
  baseURL: baseUrl,
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "viberent-development-secret-change-before-production"),
  trustedOrigins: [baseUrl],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
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
          const firstMembership = sqlite.prepare("SELECT organization_id AS organizationId FROM member WHERE user_id=? ORDER BY created_at LIMIT 1")
            .get(session.userId) as { organizationId: string } | undefined;
          return { data: { ...session, activeOrganizationId: firstMembership?.organizationId } };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
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
    sendOnSignUp: false,
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
    nextCookies(),
  ],
});
