"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import TopNav from "@/components/TopNav";
import type { SafeUser } from "@/lib/types";

export default function VerifyIndexPage() {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [code, setCode] = useState("EG-DEMO2026");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: SafeUser | null }) => setUser(d.user))
      .catch(() => {});
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed) {
      router.push(`/verify/${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8FA]">
      <TopNav user={user} />

      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-2xl rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6">
          <div className="flex items-center gap-2.5 text-[#1D4ED8]">
            <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
            <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
              Verify an issued result report
            </h1>
          </div>

          <p className="mt-2 text-sm text-[#475569]">
            Enter the verification identifier printed on a candidate&apos;s PDF
            report or scan its QR code. Public verification confirms exam title,
            masked candidate name, total score, and submission timestamp while
            keeping email addresses and answer scripts private.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap gap-2">
            <label htmlFor="lookup-code" className="sr-only">
              Verification code
            </label>
            <input
              id="lookup-code"
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="EG-DEMO2026"
              className="min-h-[40px] min-w-[200px] flex-1 rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 font-mono text-sm text-[#0F172A]"
            />
            <button
              type="submit"
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Verify report</span>
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[rgba(15,23,42,0.10)] pt-4 text-xs text-[#64748B]">
            <span>Sample seeded codes:</span>
            <Link
              href="/verify/EG-DEMO2026"
              className="rounded-md bg-[#EFF6FF] px-2 py-1 font-mono font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
            >
              EG-DEMO2026
            </Link>
            <Link
              href="/verify/EG-SANA2026"
              className="rounded-md bg-[#EFF6FF] px-2 py-1 font-mono font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
            >
              EG-SANA2026
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
