"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#F6F8FA]">
      <main
        id="main-content"
        className="mx-auto flex min-h-screen max-w-[1440px] items-center justify-center px-4 py-16 sm:px-6"
      >
        <div className="w-full max-w-md rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6">
          <div className="flex items-center gap-2 text-[#B91C1C]">
            <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
            <h1 className="text-xl font-semibold tracking-tight text-[#0F172A]">
              Something went wrong
            </h1>
          </div>
          <p className="mt-2 text-sm text-[#475569]">
            An unexpected error interrupted this view. Any saved answers remain
            preserved in your browser queue and on the server.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Try again</span>
            </button>
            <Link
              href="/"
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Return to home</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
