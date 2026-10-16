import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "viberent",
      version: process.env.VIBERENT_VERSION ?? "development",
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-viberent-service": "viberent",
      },
    },
  );
}
