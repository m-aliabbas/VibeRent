import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { getSessionViewer } from "@/server/auth/session";
import { getDesktopLicenseStatus } from "@/server/desktop/license-service";

export const metadata: Metadata = {
  title: "VibeRent — Rental operations",
  description: "A clear view of your rental business.",
};

const authPaths = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/check-email", "/accept-invitation", "/onboarding", "/license"];

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const path = (await headers()).get("x-viberent-path") ?? "/";
  const license = getDesktopLicenseStatus();
  const licenseBlocked = license.enforced && license.state !== "active";
  if (licenseBlocked && path !== "/license") redirect("/license");
  if (!licenseBlocked && path === "/license") redirect("/");
  const isAuthPath = authPaths.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  let content = children;
  if (!isAuthPath) {
    const viewer = await getSessionViewer();
    if (!viewer) redirect(`/sign-in?callbackUrl=${encodeURIComponent(path)}`);
    if (!viewer.activeAgencyId) redirect("/onboarding");
    if (!viewer.active) redirect("/sign-in?reason=membership-inactive");
    content = <AppShell viewer={viewer}>{children}</AppShell>;
  }
  return (
    <html lang="en">
      <body>{content}</body>
    </html>
  );
}
