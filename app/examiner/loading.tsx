export default function ExaminerLoading() {
  return (
    <div className="min-h-screen bg-[#F6F8FA]">
      <header className="sticky top-0 z-30 border-b border-[rgba(15,23,42,0.10)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="h-6 w-28 animate-pulse rounded bg-[#E2E8F0]" />
            <div className="h-9 w-36 animate-pulse rounded-lg bg-[#E2E8F0]" />
            <div className="h-9 w-28 animate-pulse rounded-lg bg-[#EEF2F6]" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-lg bg-[#EEF2F6]" />
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#1D4ED8]">
              Examiner workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0F172A]">
              Examination control center
            </h1>
          </div>
          <div className="h-10 w-32 animate-pulse rounded-lg bg-white border border-[rgba(15,23,42,0.10)]" />
        </div>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          <aside className="shrink-0 space-y-4 lg:w-[240px]">
            <div className="space-y-2 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-full animate-pulse rounded-lg bg-[#EEF2F6]"
                />
              ))}
            </div>
          </aside>

          <div className="min-w-0 flex-1 grid gap-6 xl:grid-cols-12">
            <div className="h-[460px] animate-pulse rounded-xl border border-[rgba(15,23,42,0.10)] bg-white xl:col-span-5" />
            <div className="h-[460px] animate-pulse rounded-xl border border-[rgba(15,23,42,0.10)] bg-white xl:col-span-7" />
          </div>
        </div>
      </main>
    </div>
  );
}
