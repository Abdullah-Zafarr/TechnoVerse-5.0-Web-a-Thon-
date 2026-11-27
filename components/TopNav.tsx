"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck, LogOut, QrCode } from "lucide-react";
import type { SafeUser } from "@/lib/types";

interface TopNavProps {
  user: SafeUser | null;
}

export default function TopNav({ user }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[rgba(15,23,42,0.10)] bg-[#FFFFFF]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Link
            href="/"
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-base font-semibold tracking-tight text-[#0F172A]"
          >
            <ShieldCheck className="h-5 w-5 text-[#1D4ED8]" aria-hidden="true" />
            <span>ExamGuard</span>
          </Link>

          <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-1.5">
            {user?.role === "admin" && (
              <Link
                href="/admin"
                className={`inline-flex min-h-[40px] cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-[#0F172A] text-white"
                    : "text-[#0F172A] hover:bg-[#EEF2F6]"
                }`}
              >
                Admin console
              </Link>
            )}
            {(user?.role === "examiner" || user?.role === "admin") && (
              <Link
                href="/examiner"
                className={`inline-flex min-h-[40px] cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  pathname.startsWith("/examiner")
                    ? "bg-[#0F172A] text-white"
                    : "text-[#0F172A] hover:bg-[#EEF2F6]"
                }`}
              >
                Examiner workspace
              </Link>
            )}
            {user?.role === "candidate" && (
              <Link
                href="/candidate"
                className={`inline-flex min-h-[40px] cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  pathname.startsWith("/candidate")
                    ? "bg-[#0F172A] text-white"
                    : "text-[#0F172A] hover:bg-[#EEF2F6]"
                }`}
              >
                Candidate portal
              </Link>
            )}
            <Link
              href="/verify"
              className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname.startsWith("/verify")
                  ? "bg-[#0F172A] text-white"
                  : "text-[#475569] hover:bg-[#EEF2F6] hover:text-[#0F172A]"
              }`}
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              <span>Verify report</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="text-right">
                <p className="text-sm font-medium text-[#0F172A]">{user.name}</p>
                <p className="text-xs capitalize text-[#64748B]">{user.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
