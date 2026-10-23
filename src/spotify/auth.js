// Inloggen bij Spotify met de Authorization Code Flow + PKCE. Er is geen server of geheime sleutel nodig:
// alleen een Client ID van een app die je zelf aanmaakt op developer.spotify.com.
import { prefs } from '../core/store.js';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SCOPES = ['user-read-currently-playing', 'user-read-playback-state', 'user-modify-playback-state'];

/** Client ID uit de build (VITE_SPOTIFY_CLIENT_ID) of uit de instellingen. */
export function getClientId() {
  return prefs.get('spotify:clientId') || import.meta.env?.VITE_SPOTIFY_CLIENT_ID || '';
}

export function setClientId(id) {
  prefs.set('spotify:clientId', id.trim());
}

/** Spotify staat alleen https of een loopback-IP (127.0.0.1) toe; "localhost" wordt geweigerd. */
export function redirectUri(loc = window.location) {
  const base = import.meta.env?.BASE_URL || '/';
  const host = loc.hostname === 'localhost' ? '127.0.0.1' : loc.hostname;
  return `${loc.protocol}//${host}${loc.port ? ':' + loc.port : ''}${base}`;
}

function randomString(len = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function login(returnHash = '#/spotify') {
  const clientId = getClientId();
  if (!clientId) throw new Error('Vul eerst een Spotify Client ID in.');
  if (window.location.hostname === 'localhost') {
    // Spotify accepteert geen localhost; ga eerst naar 127.0.0.1 zodat de opgeslagen gegevens daar staan.
    window.location.href = window.location.href.replace('//localhost', '//127.0.0.1');
    return;
  }
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem('spotify:verifier', verifier);
  sessionStorage.setItem('spotify:state', state);
  sessionStorage.setItem('spotify:return', returnHash);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    redirect_uri: redirectUri(),
    state,
  });
  window.location.href = `${AUTH_URL}?${params}`;
}

/** Na terugkeer van Spotify: ?code=… omruilen voor tokens. Geeft de hash terug waar de gebruiker heen wil. */
export async function handleRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return null;
  const state = url.searchParams.get('state');
  const back = sessionStorage.getItem('spotify:return') || '#/spotify';
  history.replaceState(null, '', url.pathname + back);
  if (error) throw new Error(error === 'access_denied' ? 'Je hebt geen toestemming gegeven aan Spotify.' : 'Spotify gaf een fout: ' + error);
  if (state !== sessionStorage.getItem('spotify:state')) throw new Error('Inloggen bij Spotify mislukt (state klopt niet). Probeer het opnieuw.');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: getClientId(),
    code_verifier: sessionStorage.getItem('spotify:verifier') || '',
  });
  await requestToken(body);
  sessionStorage.removeItem('spotify:verifier');
  sessionStorage.removeItem('spotify:state');
  return back;
}

async function requestToken(body) {
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Spotify-token mislukt: ' + (data.error_description || data.error || res.status));
  const old = prefs.get('spotify:token') || {};
  prefs.set('spotify:token', {
    access: data.access_token,
    refresh: data.refresh_token || old.refresh,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  });
}

export function isLoggedIn() {
  return !!prefs.get('spotify:token')?.refresh;
}

export function logout() {
  prefs.set('spotify:token', null);
}

let refreshing = null;
/** Geldig access-token, zo nodig ververst. */
export async function accessToken(force = false) {
  const t = prefs.get('spotify:token');
  if (!t?.refresh) throw new Error('Niet verbonden met Spotify.');
  if (!force && t.access && Date.now() < t.expires) return t.access;
  refreshing ||= requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: getClientId() }))
    .finally(() => (refreshing = null));
  await refreshing;
  return prefs.get('spotify:token').access;
}
