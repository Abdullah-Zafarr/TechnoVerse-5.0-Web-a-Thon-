import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#F6F8FA]">
      <header className="border-b border-[rgba(15,23,42,0.10)] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-base font-semibold tracking-tight text-[#0F172A]"
          >
            <ShieldCheck className="h-5 w-5 text-[#1D4ED8]" aria-hidden="true" />
            <span>ExamGuard</span>
          </Link>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto flex max-w-[1440px] items-center justify-center px-4 py-16 sm:px-6"
      >
        <div className="w-full max-w-md rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6">
          <p className="font-mono text-xs font-medium text-[#1D4ED8]">404</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0F172A]">
            Page not found
          </h1>
          <p className="mt-2 text-sm text-[#475569]">
            The requested examination route does not exist or has been moved.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Return to home</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
