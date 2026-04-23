import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="surface-card relative overflow-hidden rounded-[2.4rem] p-6 sm:p-8 lg:p-10">
          <div className="absolute inset-y-0 right-0 hidden w-[34%] bg-[radial-gradient(circle_at_top,rgba(15,118,110,0.22),transparent_58%)] lg:block" />
          <div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
                Professional Messaging Platform
              </p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-6xl">
                Public-ready communication for modern teams, clients, and communities.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
                RelayChat brings secure access, resilient realtime delivery, clear conversation structure,
                and polished collaboration spaces into one platform designed to feel trustworthy from the first screen.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/auth/register"
                  className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Create account
                </Link>
                <Link
                  href="/auth/login"
                  className="rounded-full border border-slate-300 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                >
                  Sign in
                </Link>
                <Link
                  href="/conversations"
                  className="rounded-full border border-emerald-700/20 bg-emerald-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  Open workspace
                </Link>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <article className="rounded-[1.5rem] border border-slate-200/80 bg-white/75 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Professional UX</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Clear hierarchy, focused navigation, and a cleaner workspace designed for public-facing trust.
                  </p>
                </article>
                <article className="rounded-[1.5rem] border border-slate-200/80 bg-white/75 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Secure Access</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Token-based sessions, protected routes, and account workflows shaped for real deployment.
                  </p>
                </article>
                <article className="rounded-[1.5rem] border border-slate-200/80 bg-white/75 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Reliable Realtime</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Reconnect sync, delivery visibility, and file sharing that stay responsive under uneven networks.
                  </p>
                </article>
              </div>
            </div>

            <div className="grid gap-5">
              <article className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[#102136] p-5 text-slate-100 shadow-[0_26px_70px_rgba(16,33,54,0.35)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.32em] text-slate-400">
                      Platform Snapshot
                    </div>
                    <div className="mt-2 text-2xl font-semibold">Executive-grade clarity</div>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-emerald-300">
                    Live
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.3rem] bg-white/8 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Rooms</div>
                    <div className="mt-2 text-3xl font-semibold">24</div>
                    <p className="mt-1 text-xs text-slate-300">Structured across teams, client work, and support.</p>
                  </div>
                  <div className="rounded-[1.3rem] bg-white/8 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Uptime</div>
                    <div className="mt-2 text-3xl font-semibold">99.9%</div>
                    <p className="mt-1 text-xs text-slate-300">Stable session continuity with reconnect-aware delivery.</p>
                  </div>
                  <div className="rounded-[1.3rem] bg-white/8 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Response</div>
                    <div className="mt-2 text-3xl font-semibold">&lt;250ms</div>
                    <p className="mt-1 text-xs text-slate-300">Fast enough for support, coordination, and live operations.</p>
                  </div>
                </div>
              </article>

              <div className="grid gap-5 sm:grid-cols-2">
                <article className="surface-card-strong rounded-[2rem] p-5">
                  <div className="mb-3 text-xs uppercase tracking-[0.32em] text-slate-500">
                    Interface Direction
                  </div>
                  <ul className="space-y-2 text-sm leading-6 text-slate-700">
                    <li>Cleaner spacing and stronger section hierarchy for first-time visitors.</li>
                    <li>Business-friendly copy that explains value without sounding like an internal prototype.</li>
                    <li>Warmer brand surfaces and more intentional contrast across cards and actions.</li>
                  </ul>
                </article>

                <article className="surface-card-strong rounded-[2rem] p-5">
                  <div className="mb-3 text-xs uppercase tracking-[0.32em] text-slate-500">
                    Ready For
                  </div>
                  <ul className="space-y-2 text-sm leading-6 text-slate-700">
                    <li>Company communication hubs</li>
                    <li>Public communities and customer spaces</li>
                    <li>Partner rooms and delivery coordination</li>
                  </ul>
                </article>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="surface-card-strong rounded-[2rem] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
              Platform Foundation
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Built to look polished and behave reliably.
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <article className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Communication</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Direct chat, group rooms, delivery states, and attachments all live in a consistent workspace model.
                </p>
              </article>
              <article className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Operations</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  History loading, object caching, and reconnect handling support longer-running sessions.
                </p>
              </article>
              <article className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Governance</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Authenticated access paths make the product easier to present as a serious platform.
                </p>
              </article>
              <article className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Scalability</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Compact transport and incremental sync patterns keep the interface responsive as usage grows.
                </p>
              </article>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-[#fffdf8] p-5 shadow-[0_18px_55px_rgba(15,23,42,0.09)]">
            <div className="mb-3 text-xs uppercase tracking-[0.32em] text-slate-500">
              Operating Model
            </div>
            <pre className="overflow-x-auto rounded-[1.5rem] bg-[#102136] p-4 text-xs leading-6 text-slate-200">
{`Workspace Experience
  ├─ polished entry points
  ├─ secure sign-in and onboarding
  ├─ structured conversation browsing
  └─ public-ready collaboration shell

Realtime Layer
  ├─ websocket transport
  ├─ reconnect-aware sync
  ├─ delivery receipts
  └─ attachment rendering

Service Layer
  ├─ auth + conversations + files
  ├─ protected APIs
  └─ persistence-backed message history`}
            </pre>
          </section>
        </div>
      </div>
    </main>
  );
}
