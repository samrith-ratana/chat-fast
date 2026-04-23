'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

import { apiFetch, getApiUrl, getStoredTokens } from '@/lib/api';
import type { UserProfile } from '@/types/chat';

type AuthContextType = {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<UserProfile> & { status_message?: string }) => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = 'auth:tokens';

function persistTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      accessToken,
      refreshToken,
    }),
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredTokens();
    if (!stored.accessToken) {
      setIsLoading(false);
      return;
    }

    setAccessToken(stored.accessToken);
    setRefreshToken(stored.refreshToken);
    void fetchUserProfile(stored.accessToken);
  }, []);

  async function fetchUserProfile(token: string) {
    try {
      const profile = await apiFetch<UserProfile>('/api/users/me', {
        token,
      });
      setUser(profile);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setAccessToken(null);
      setRefreshToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    setError(null);
    setIsLoading(true);

    try {
      const data = await apiFetch<{
        user: UserProfile;
        accessToken: string;
        refreshToken: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      setUser(data.user);
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      persistTokens(data.accessToken, data.refreshToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function register(email: string, username: string, password: string) {
    setError(null);
    setIsLoading(true);

    try {
      const data = await apiFetch<{
        user: UserProfile;
        accessToken: string;
        refreshToken: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
      });

      setUser(data.user);
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      persistTokens(data.accessToken, data.refreshToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    try {
      if (accessToken) {
        await fetch(`${getApiUrl()}/api/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } finally {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function updateUser(updates: Partial<UserProfile> & { status_message?: string }) {
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    const updated = await apiFetch<Partial<UserProfile> & { status_message?: string }>('/api/users/me', {
      method: 'PUT',
      token: accessToken,
      body: JSON.stringify(updates),
    });

    setUser((current) => (current ? { ...current, ...updated } : current));
  }

  function clearError() {
    setError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        isLoading,
        error,
        login,
        register,
        logout,
        updateUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
