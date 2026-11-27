"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ShieldX, Search } from "lucide-react";
import TopNav from "@/components/TopNav";
import type { SafeUser } from "@/lib/types";

interface VerifyResponse {
  valid: boolean;
  error?: string;
  verificationCode?: string;
  examCode?: string;
  examTitle?: string;
  candidateMaskedName?: string;
  totalAwardedMarks?: number;
  totalPossibleMarks?: number;
  gradingState?: string;
  submittedAt?: string;
}

export default function VerifyReportPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [lookupCode, setLookupCode] = useState(params.code || "EG-DEMO2026");
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: SafeUser | null }) => setUser(d.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const code = params.code;
    if (!code) return;
    setLoading(true);
    fetch(`/api/verify/${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((data: VerifyResponse) => {
        setResult(data);
        setLoading(false);
      })
      .catch(() => {
        setResult({ valid: false, error: "Verification request failed" });
        setLoading(false);
      });
  }, [params.code]);

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = lookupCode.trim();
    if (cleaned) {
      router.push(`/verify/${encodeURIComponent(cleaned)}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8FA]">
      <TopNav user={user} />

      <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
            Verify report authenticity
          </h1>
          <p className="mt-2 text-sm text-[#475569]">
            Confirms official score and submission timestamp while masking
            private candidate details
          </p>

          <form onSubmit={handleLookup} className="mt-6 flex flex-wrap gap-2">
            <label htmlFor="verify-code" className="sr-only">
              Verification code
            </label>
            <input
              id="verify-code"
              type="text"
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value)}
              placeholder="EG-DEMO2026"
              className="min-h-[40px] min-w-[200px] flex-1 rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 font-mono text-sm text-[#0F172A]"
            />
            <button
              type="submit"
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Verify</span>
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6">
            {loading ? (
              <p className="text-sm text-[#475569]">Checking report ledger...</p>
            ) : result?.valid ? (
              <div>
                <div className="flex items-center gap-2 text-[#0F766E]">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  <span className="text-base font-semibold">
                    Verified official report
                  </span>
                </div>
                <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-[rgba(15,23,42,0.10)] pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-[#64748B]">Verification code</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-[#0F172A]">
                      {result.verificationCode}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#64748B]">
                      Candidate (masked)
                    </dt>
                    <dd className="mt-0.5 font-medium text-[#0F172A]">
                      {result.candidateMaskedName}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-[#64748B]">Examination</dt>
                    <dd className="mt-0.5 font-medium text-[#0F172A]">
                      {result.examTitle}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#64748B]">Awarded score</dt>
                    <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-[#1D4ED8]">
                      {result.totalAwardedMarks} / {result.totalPossibleMarks}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#64748B]">Submitted at</dt>
                    <dd className="mt-0.5 font-mono text-xs tabular-nums text-[#0F172A]">
                      {result.submittedAt
                        ? new Date(result.submittedAt).toLocaleString()
                        : "Not recorded"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 text-[#B91C1C]">
                <ShieldX className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Verification failed</p>
                  <p className="mt-1 text-sm text-[#475569]">
                    {result?.error ?? "Code not found or report unpublished."}
                  </p>
                  <Link
                    href="/verify"
                    className="mt-3 inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-[rgba(15,23,42,0.14)] px-3 py-1.5 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                  >
                    Try another verification code
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
