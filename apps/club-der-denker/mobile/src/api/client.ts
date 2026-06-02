import Constants from 'expo-constants';
import * as Localization from 'expo-localization';
import { getToken } from '@/store/session';

/**
 * Thin API client for the Club Der Denker backend. Adds the bearer token and
 * the device's current IANA time zone (required by the unlock engine) to
 * every request.
 */
const BASE = (Constants.expoConfig?.extra as any)?.apiBaseUrl ?? 'http://localhost:3020';

export function deviceTimeZone(): string {
  return Localization.getCalendars()[0]?.timeZone ?? 'UTC';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

export const api = {
  funnelItems: (locale: string) => request<{ items: any[] }>(`/api/funnel/items?locale=${locale}`),
  funnelEvent: (deviceId: string, step: string, payload?: object) =>
    request(`/api/funnel/event`, { method: 'POST', body: JSON.stringify({ deviceId, step, payload }) }),
  saveLead: (email: string, deviceId: string, locale: string) =>
    request<{ userId: string }>(`/api/leads`, { method: 'POST', body: JSON.stringify({ email, deviceId, locale }) }),
  register: (email: string, password: string) =>
    request<{ token: string }>(`/api/auth/register`, { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<{ token: string }>(`/api/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) }),
  today: (locale: string) =>
    request<{ locked: boolean; items: any[]; dayIndex: number }>(`/api/course/today?tz=${encodeURIComponent(deviceTimeZone())}&locale=${locale}`),
  answer: (itemId: string, selectedKey: string) =>
    request<{ itemsCompleted: number; level: number; streakDays: number }>(`/api/course/answer`, {
      method: 'POST',
      body: JSON.stringify({ itemId, selectedKey, tz: deviceTimeZone() }),
    }),
  feed: (locale: string, category?: string) =>
    request<{ locked: boolean; showPaywall: boolean; posts: any[] }>(
      `/api/feed?locale=${locale}${category ? `&category=${category}` : ''}`,
    ),
  profile: () => request<any>(`/api/profile`),
  setLocale: (locale: string) => request(`/api/profile`, { method: 'PATCH', body: JSON.stringify({ locale }) }),
  deleteAccount: () => request(`/api/profile`, { method: 'DELETE' }),
};
