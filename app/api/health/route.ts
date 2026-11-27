import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return NextResponse.json({
        ok: true,
        database: "connected",
        realtimeConfigured: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ),
      });
    } catch (err) {
      lastErr = err;
    }
  }
  return NextResponse.json(
    {
      ok: false,
      database: "disconnected",
      error:
        process.env.NODE_ENV === "production"
          ? "Database unavailable"
          : lastErr instanceof Error
            ? lastErr.message
            : "Database unavailable",
    },
    { status: 503 }
  );
}
