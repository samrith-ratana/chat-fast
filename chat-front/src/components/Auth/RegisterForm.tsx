'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register, error, clearError } = useAuth();
  const router = useRouter();

  const passwordStrength = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const passwordsMatch = password && password === confirmPassword;
  const isPasswordStrong = Object.values(passwordStrength).every(Boolean);
  const isFormValid = email && username && passwordsMatch && isPasswordStrong && !isLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setIsLoading(true);

    try {
      await register(email, username, password);
      router.push('/conversations');
    } catch {
      // The auth context already stores a user-friendly error message for the form.
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="surface-card relative overflow-hidden rounded-[2.2rem] p-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,rgba(201,122,56,0.16),transparent_65%)] lg:block" />
          <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
            Public Onboarding
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
            Create an account for a cleaner, more professional collaboration space.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
            The registration flow is designed to feel more platform-grade: clear requirements, immediate access, and a faster path into active conversations.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="rounded-[1.4rem] border border-slate-200 bg-white/70 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Fast Setup</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">Straightforward account creation with immediate entry into the workspace.</p>
            </article>
            <article className="rounded-[1.4rem] border border-slate-200 bg-white/70 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Strong Identity</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">Email, username, and password rules give the product a more credible first impression.</p>
            </article>
            <article className="rounded-[1.4rem] border border-slate-200 bg-white/70 p-4">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Immediate Access</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">New users can move directly into conversations without an extra sign-in loop.</p>
            </article>
          </div>
          </div>
        </section>

        <div className="w-full max-w-md justify-self-center lg:max-w-none">
          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-3xl font-semibold text-slate-950">Create account</h2>
            <p className="mt-2 text-slate-600">Set up a new profile and enter the workspace in one step.</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="surface-card-strong space-y-5 rounded-[2rem] p-8"
          >
            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error}
                {error === 'Email already registered' ? (
                  <div className="mt-2 text-xs text-rose-600">
                    Try signing in with that email instead.
                  </div>
                ) : null}
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
              <label className="mb-2 block text-sm font-medium text-slate-700">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="team.admin"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-slate-950 outline-none transition focus:border-emerald-500 focus:bg-white"
                required
                disabled={isLoading}
                minLength={3}
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

              {password && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Password requirements
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className={passwordStrength.minLength ? 'text-emerald-600' : 'text-slate-500'}>At least 8 characters</div>
                    <div className={passwordStrength.hasUppercase ? 'text-emerald-600' : 'text-slate-500'}>Uppercase letter</div>
                    <div className={passwordStrength.hasLowercase ? 'text-emerald-600' : 'text-slate-500'}>Lowercase letter</div>
                    <div className={passwordStrength.hasNumber ? 'text-emerald-600' : 'text-slate-500'}>Number</div>
                    <div className={passwordStrength.hasSpecial ? 'text-emerald-600' : 'text-slate-500'}>Special character</div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-slate-950 outline-none transition focus:border-emerald-500 focus:bg-white"
                required
                disabled={isLoading}
              />
              {confirmPassword && !passwordsMatch ? (
                <p className="mt-2 text-xs text-rose-500">Passwords don&apos;t match</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={!isFormValid}
              className="w-full rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>

            <div className="text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link href="/auth/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
                Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
