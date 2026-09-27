import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { getSessionViewer } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "VibeRent — Rental operations",
  description: "A clear view of your rental business.",
};

const authPaths = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/check-email", "/accept-invitation", "/onboarding"];

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const path = (await headers()).get("x-viberent-path") ?? "/";
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
