import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { loadExaminerWorkspaceData } from "@/lib/examinerWorkspace";

export async function GET() {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const data = await loadExaminerWorkspaceData(auth.user);
  return NextResponse.json({
    user: auth.user,
    ...data,
    serverNow: new Date().toISOString(),
  });
}
