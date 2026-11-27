import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
    return NextResponse.json(
      {
        ok: false,
        database: "disconnected",
        error:
          process.env.NODE_ENV === "production"
            ? "Database unavailable"
            : err instanceof Error
              ? err.message
              : "Database unavailable",
      },
      { status: 503 }
    );
  }
}
