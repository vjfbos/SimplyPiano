// Dunne laag over de Spotify Web API: wat speelt er, zoeken en (met Premium) afspelen.
import { accessToken } from './auth.js';

const API = 'https://api.spotify.com/v1';

async function call(path, { method = 'GET', body, retry = true } = {}) {
  const token = await accessToken();
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) {
    await accessToken(true);
    return call(path, { method, body, retry: false });
  }
  if (res.status === 204 || res.status === 202) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    const err = new Error(res.status === 403 && method !== 'GET' ? 'Afspelen bedienen kan alleen met Spotify Premium. Start het nummer dan zelf in Spotify.' : `Spotify: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function simplifyTrack(t) {
  if (!t) return null;
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).join(', '),
    image: t.album?.images?.slice(-2)[0]?.url || t.album?.images?.[0]?.url || null,
    durationMs: t.duration_ms,
    url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
  };
}

/** Wat speelt er nu? null als er niets speelt (of geen nummer, bijv. een podcast). */
export async function currentlyPlaying() {
  const data = await call('/me/player/currently-playing');
  if (!data?.item || data.currently_playing_type !== 'track') return null;
  return { track: simplifyTrack(data.item), progressMs: data.progress_ms ?? 0, isPlaying: !!data.is_playing };
}

export async function searchTracks(q) {
  const data = await call(`/search?type=track&limit=12&q=${encodeURIComponent(q)}`);
  return (data?.tracks?.items || []).map(simplifyTrack);
}

export const me = () => call('/me');
export const play = (uri, positionMs = 0) => call('/me/player/play', { method: 'PUT', body: uri ? { uris: [uri], position_ms: positionMs } : undefined });
export const pause = () => call('/me/player/pause', { method: 'PUT' });
export const seek = (ms) => call(`/me/player/seek?position_ms=${Math.max(0, Math.round(ms))}`, { method: 'PUT' });
