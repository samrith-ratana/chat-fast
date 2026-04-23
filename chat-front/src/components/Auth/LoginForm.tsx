'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, error, clearError } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setIsLoading(true);

    try {
      await login(email, password);
      router.push('/conversations');
    } catch {
      // The auth context already stores a user-friendly error message for the form.
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="surface-card relative overflow-hidden rounded-[2.2rem] p-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,rgba(15,118,110,0.2),transparent_65%)] lg:block" />
          <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
            Secure Access
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
            Sign in to a workspace that looks ready for clients and teams.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
            RelayChat combines secure sign-in, organized conversation flows, and realtime collaboration in one clear experience built for public use.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="rounded-[1.4rem] border border-slate-200 bg-white/70 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Trusted Entry</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">WebSocket transport with reconnect sync and micro-batched updates.</p>
            </article>
            <article className="rounded-[1.4rem] border border-slate-200 bg-white/70 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Security</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">Protected sessions, guarded room access, and clearer account workflows for a serious product feel.</p>
            </article>
            <article className="rounded-[1.4rem] border border-slate-200 bg-white/70 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Continuity</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">Conversations reopen cleanly so returning users can continue without friction.</p>
            </article>
          </div>
          </div>
        </section>

        <div className="w-full max-w-md justify-self-center lg:max-w-none">
          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-3xl font-semibold text-slate-950">Welcome back</h2>
            <p className="mt-2 text-slate-600">Enter your credentials to reopen your workspace and continue live collaboration.</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="surface-card-strong space-y-6 rounded-[2rem] p-8"
          >
            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-slate-950 outline-none transition focus:border-emerald-500 focus:bg-white"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-slate-950 outline-none transition focus:border-emerald-500 focus:bg-white"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>

            <div className="text-center text-sm text-slate-500">
              Don&apos;t have an account?{' '}
              <Link href="/auth/register" className="font-semibold text-emerald-600 hover:text-emerald-700">
                Create one
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
