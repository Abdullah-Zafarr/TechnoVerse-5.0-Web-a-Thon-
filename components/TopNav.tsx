"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck, LogOut, QrCode, Menu, X } from "lucide-react";
import { clearCachedSessionUser } from "@/lib/clientSession";
import type { SafeUser } from "@/lib/types";

interface TopNavProps {
  user: SafeUser | null;
}

export default function TopNav({ user }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setMenuOpen(false);
    clearCachedSessionUser();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const navLinkCls = (active: boolean) =>
    `inline-flex min-h-[44px] md:min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-[#0F172A] text-white"
        : "text-[#0F172A] hover:bg-[#EEF2F6]"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-[rgba(15,23,42,0.10)] bg-[#FFFFFF]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 md:py-3">
        <div className="flex items-center gap-4 md:gap-6">
          <Link
            href="/"
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-base font-semibold tracking-tight text-[#0F172A] md:min-h-[40px]"
          >
            <ShieldCheck className="h-5 w-5 text-[#1D4ED8]" aria-hidden="true" />
            <span>ExamGuard</span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-1.5 md:flex"
          >
            {user?.role === "admin" && (
              <Link
                href="/admin"
                className={navLinkCls(pathname.startsWith("/admin"))}
              >
                Admin console
              </Link>
            )}
            {(user?.role === "examiner" || user?.role === "admin") && (
              <Link
                href="/examiner"
                className={navLinkCls(pathname.startsWith("/examiner"))}
              >
                Examiner workspace
              </Link>
            )}
            {user?.role === "candidate" && (
              <Link
                href="/candidate"
                className={navLinkCls(pathname.startsWith("/candidate"))}
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

        {/* Desktop account controls */}
        <div className="hidden items-center gap-3 md:flex">
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

        {/* Mobile quick action + menu toggle */}
        <div className="flex items-center gap-2 md:hidden">
          {!user && (
            <Link
              href="/login"
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-[#1D4ED8] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
            >
              Sign in
            </Link>
          )}
          <button
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-[rgba(15,23,42,0.12)] bg-white text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
          >
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile collapsible navigation drawer */}
      {menuOpen && (
        <div className="border-t border-[rgba(15,23,42,0.08)] bg-white px-4 pb-4 pt-3 md:hidden">
          <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
            {user?.role === "admin" && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className={`${navLinkCls(pathname.startsWith("/admin"))} w-full`}
              >
                Admin console
              </Link>
            )}
            {(user?.role === "examiner" || user?.role === "admin") && (
              <Link
                href="/examiner"
                onClick={() => setMenuOpen(false)}
                className={`${navLinkCls(pathname.startsWith("/examiner"))} w-full`}
              >
                Examiner workspace
              </Link>
            )}
            {user?.role === "candidate" && (
              <Link
                href="/candidate"
                onClick={() => setMenuOpen(false)}
                className={`${navLinkCls(pathname.startsWith("/candidate"))} w-full`}
              >
                Candidate portal
              </Link>
            )}
            <Link
              href="/verify"
              onClick={() => setMenuOpen(false)}
              className={`inline-flex min-h-[44px] w-full cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname.startsWith("/verify")
                  ? "bg-[#0F172A] text-white"
                  : "text-[#475569] hover:bg-[#EEF2F6] hover:text-[#0F172A]"
              }`}
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              <span>Verify report</span>
            </Link>
          </nav>

          {user && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.08)] pt-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#0F172A]">
                  {user.name}
                </p>
                <p className="text-xs capitalize text-[#64748B]">{user.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
