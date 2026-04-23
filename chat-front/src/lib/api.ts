function getDefaultApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }

  return 'http://localhost:8080';
}

function getDefaultWsUrl() {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:8080`;
  }

  return 'ws://localhost:8080';
}

type ApiOptions = RequestInit & {
  token?: string | null;
};

export function getApiUrl() {
  return getDefaultApiUrl();
}

export function getWsUrl() {
  return getDefaultWsUrl();
}

export function getStoredTokens() {
  if (typeof window === 'undefined') {
    return {
      accessToken: null,
      refreshToken: null,
    };
  }

  try {
    const raw = window.localStorage.getItem('auth:tokens');
    if (!raw) {
      return {
        accessToken: null,
        refreshToken: null,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      accessToken: parsed.accessToken || null,
      refreshToken: parsed.refreshToken || null,
    };
  } catch {
    return {
      accessToken: null,
      refreshToken: null,
    };
  }
}

export async function apiFetch<T>(pathname: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const response = await fetch(`${getApiUrl()}${pathname}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: `Request failed with ${response.status}` }));
    throw new Error(data.error || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export function getServerDownloadUrl(relativeOrAbsolute: string) {
  const resolvedUrl = new URL(toAbsoluteAssetUrl(relativeOrAbsolute));
  resolvedUrl.searchParams.set('download', '1');
  return resolvedUrl.toString();
}

export function downloadServerFile(relativeOrAbsolute: string, filename: string) {
  const resolvedUrl = getServerDownloadUrl(relativeOrAbsolute);
  const anchor = document.createElement('a');
  anchor.href = resolvedUrl;
  anchor.download = filename;
  anchor.rel = 'noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function toAbsoluteAssetUrl(relativeOrAbsolute: string) {
  if (!relativeOrAbsolute) {
    return '';
  }

  try {
    return new URL(relativeOrAbsolute, getApiUrl()).toString();
  } catch {
    return relativeOrAbsolute;
  }
}
