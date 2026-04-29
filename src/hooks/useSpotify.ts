import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// useSpotify — OAuth PKCE + Web Playback SDK
//
// Hook que gerencia:
//  - Login via OAuth Authorization Code with PKCE (sem client_secret)
//  - Refresh automatico de access_token
//  - Inicializacao do Web Playback SDK (so pra Premium)
//  - Estado do player (faixa atual, paused, posicao)
//  - Controles (play, pause, next, previous, volume)
//
// Limitacoes:
//  - Web Playback SDK exige Spotify Premium
//  - Em Development Mode, so usuarios cadastrados em User Management
//    no dashboard do Spotify conseguem autenticar
//
// Para Free users, o componente SpotifyPlayer cai no embed iframe.
// ============================================================================

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const SDK_SCRIPT_URL = 'https://sdk.scdn.co/spotify-player.js';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const API_BASE = 'https://api.spotify.com/v1';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
].join(' ');

const STORAGE_KEYS = {
  accessToken: 'sp_access_token',
  refreshToken: 'sp_refresh_token',
  expiresAt: 'sp_expires_at',
  codeVerifier: 'sp_code_verifier',
  oauthState: 'sp_oauth_state',
  returnTo: 'sp_return_to',
};

export interface SpotifyUser {
  id: string;
  display_name?: string;
  email?: string;
  product: 'premium' | 'free' | 'open';
  images?: { url: string }[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
}

export interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track: SpotifyTrack | null;
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function randomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(n => possible[n % possible.length]).join('');
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Storage helpers ───────────────────────────────────────────────────────────
function readToken(): { accessToken: string | null; refreshToken: string | null; expiresAt: number | null } {
  return {
    accessToken: localStorage.getItem(STORAGE_KEYS.accessToken),
    refreshToken: localStorage.getItem(STORAGE_KEYS.refreshToken),
    expiresAt: Number(localStorage.getItem(STORAGE_KEYS.expiresAt)) || null,
  };
}

function saveTokens(accessToken: string, refreshToken: string | null, expiresIn: number) {
  localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
  if (refreshToken) localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
  localStorage.setItem(STORAGE_KEYS.expiresAt, String(Date.now() + (expiresIn - 60) * 1000));
}

function clearTokens() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  sessionStorage.removeItem(STORAGE_KEYS.codeVerifier);
  sessionStorage.removeItem(STORAGE_KEYS.oauthState);
  sessionStorage.removeItem(STORAGE_KEYS.returnTo);
}

// ── SDK loader ────────────────────────────────────────────────────────────────
let sdkPromise: Promise<typeof window.Spotify> | null = null;

function loadSDK(): Promise<typeof window.Spotify> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (window.Spotify) {
      resolve(window.Spotify);
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (window.Spotify) resolve(window.Spotify);
      else reject(new Error('Spotify SDK loaded but window.Spotify undefined'));
    };
    const existing = document.querySelector(`script[src="${SDK_SCRIPT_URL}"]`);
    if (existing) return;
    const script = document.createElement('script');
    script.src = SDK_SCRIPT_URL;
    script.async = true;
    script.onerror = () => reject(new Error('Falha ao carregar Spotify SDK'));
    document.body.appendChild(script);
  });
  return sdkPromise;
}

// ── OAuth ─────────────────────────────────────────────────────────────────────
export async function startSpotifyLogin() {
  if (!CLIENT_ID) {
    throw new Error('VITE_SPOTIFY_CLIENT_ID não configurada');
  }
  const codeVerifier = randomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomString(16);
  const redirectUri = `${window.location.origin}/spotify/callback`;

  sessionStorage.setItem(STORAGE_KEYS.codeVerifier, codeVerifier);
  sessionStorage.setItem(STORAGE_KEYS.oauthState, state);
  sessionStorage.setItem(STORAGE_KEYS.returnTo, window.location.pathname + window.location.search);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    scope: SCOPES,
    state,
  });

  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID não configurada');
  const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.codeVerifier);
  if (!codeVerifier) throw new Error('code_verifier não encontrado em sessionStorage');

  const redirectUri = `${window.location.origin}/spotify/callback`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Falha ao trocar code por token: ${err}`);
  }
  const data = await res.json();
  saveTokens(data.access_token, data.refresh_token, data.expires_in);
  sessionStorage.removeItem(STORAGE_KEYS.codeVerifier);
}

async function refreshAccessToken(): Promise<string | null> {
  if (!CLIENT_ID) return null;
  const { refreshToken } = readToken();
  if (!refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const data = await res.json();
  saveTokens(data.access_token, data.refresh_token || refreshToken, data.expires_in);
  return data.access_token;
}

async function getValidToken(): Promise<string | null> {
  const { accessToken, expiresAt } = readToken();
  if (!accessToken) return null;
  if (expiresAt && Date.now() >= expiresAt) {
    return await refreshAccessToken();
  }
  return accessToken;
}

// ── API calls ─────────────────────────────────────────────────────────────────
async function spotifyApi<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getValidToken();
  if (!token) throw new Error('Sem token Spotify');
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useSpotify() {
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [state, setState] = useState<SpotifyPlayerState | null>(null);
  const [volume, setVolumeState] = useState<number>(0.5);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean>(() => !!readToken().accessToken);
  const playerRef = useRef<any>(null);

  const isPremium = user?.product === 'premium';

  // Carrega user info quando autentica
  useEffect(() => {
    if (!authed) {
      setUser(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const me = await spotifyApi<SpotifyUser>('/me');
        if (alive) setUser(me);
      } catch (e: any) {
        if (alive) {
          setError(e.message || 'Erro ao buscar perfil');
          setAuthed(false);
          clearTokens();
        }
      }
    })();
    return () => { alive = false; };
  }, [authed]);

  // Inicializa Web Playback SDK quando user é Premium
  useEffect(() => {
    if (!authed || !isPremium) return;
    let alive = true;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const Spotify = await loadSDK();
        if (!alive) return;

        const player = new Spotify.Player({
          name: 'CBRio CRM',
          getOAuthToken: async (cb: (token: string) => void) => {
            const t = await getValidToken();
            if (t) cb(t);
          },
          volume,
        });

        player.addListener('ready', ({ device_id }: { device_id: string }) => {
          if (!alive) return;
          setDeviceId(device_id);
          setIsReady(true);
        });

        player.addListener('not_ready', () => {
          if (!alive) return;
          setIsReady(false);
        });

        player.addListener('player_state_changed', (s: any) => {
          if (!alive || !s) return;
          const track = s.track_window?.current_track;
          setState({
            paused: s.paused,
            position: s.position,
            duration: s.duration,
            track: track
              ? {
                  id: track.id,
                  name: track.name,
                  uri: track.uri,
                  duration_ms: track.duration_ms,
                  artists: track.artists,
                  album: track.album,
                }
              : null,
          });
        });

        player.addListener('initialization_error', ({ message }: any) => setError(message));
        player.addListener('authentication_error', () => {
          setError('Falha de autenticação Spotify');
          setAuthed(false);
          clearTokens();
        });
        player.addListener('account_error', ({ message }: any) => setError(message));

        await player.connect();
        playerRef.current = player;

        cleanup = () => {
          try { player.disconnect(); } catch { /* noop */ }
          playerRef.current = null;
        };
      } catch (e: any) {
        if (alive) setError(e.message || 'Erro Spotify SDK');
      }
    })();

    return () => {
      alive = false;
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, isPremium]);

  // Polling de estado a cada 5s (caso falhe player_state_changed)
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    const id = setInterval(async () => {
      try {
        const s = await playerRef.current.getCurrentState();
        if (!s) return;
        const track = s.track_window?.current_track;
        setState({
          paused: s.paused,
          position: s.position,
          duration: s.duration,
          track: track
            ? {
                id: track.id,
                name: track.name,
                uri: track.uri,
                duration_ms: track.duration_ms,
                artists: track.artists,
                album: track.album,
              }
            : null,
        });
      } catch { /* noop */ }
    }, 5000);
    return () => clearInterval(id);
  }, [isReady]);

  // ── Acoes ──
  const login = useCallback(() => startSpotifyLogin(), []);

  const logout = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.disconnect(); } catch { /* noop */ }
      playerRef.current = null;
    }
    clearTokens();
    setAuthed(false);
    setUser(null);
    setState(null);
    setIsReady(false);
    setDeviceId(null);
  }, []);

  const togglePlay = useCallback(async () => {
    if (!playerRef.current) return;
    await playerRef.current.togglePlay();
  }, []);

  const next = useCallback(async () => {
    if (!playerRef.current) return;
    await playerRef.current.nextTrack();
  }, []);

  const previous = useCallback(async () => {
    if (!playerRef.current) return;
    await playerRef.current.previousTrack();
  }, []);

  const setVolume = useCallback(async (v: number) => {
    setVolumeState(v);
    if (playerRef.current) {
      try { await playerRef.current.setVolume(v); } catch { /* noop */ }
    }
  }, []);

  const seek = useCallback(async (positionMs: number) => {
    if (!playerRef.current) return;
    try { await playerRef.current.seek(positionMs); } catch { /* noop */ }
  }, []);

  const [shuffle, setShuffleState] = useState(false);
  const [repeat, setRepeatState] = useState<'off' | 'context' | 'track'>('off');

  const toggleShuffle = useCallback(async () => {
    const next = !shuffle;
    try {
      await spotifyApi(`/me/player/shuffle?state=${next}`, { method: 'PUT' });
      setShuffleState(next);
    } catch (e: any) { setError(e.message); }
  }, [shuffle]);

  const cycleRepeat = useCallback(async () => {
    const order: Array<'off' | 'context' | 'track'> = ['off', 'context', 'track'];
    const next = order[(order.indexOf(repeat) + 1) % order.length];
    try {
      await spotifyApi(`/me/player/repeat?state=${next}`, { method: 'PUT' });
      setRepeatState(next);
    } catch (e: any) { setError(e.message); }
  }, [repeat]);

  const playUri = useCallback(async (uri: string) => {
    if (!deviceId) {
      setError('Player ainda não conectou. Aguarde 2-3s.');
      return;
    }
    const body = uri.startsWith('spotify:track:')
      ? { uris: [uri] }
      : { context_uri: uri };
    try {
      await spotifyApi(`/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      setError(e.message);
    }
  }, [deviceId]);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) return null;
    const params = new URLSearchParams({ q: query, type: 'track,playlist', limit: '8' });
    return spotifyApi(`/search?${params.toString()}`);
  }, []);

  // Playlists do usuario
  const [myPlaylists, setMyPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  const loadMyPlaylists = useCallback(async () => {
    if (!authed) return;
    setLoadingPlaylists(true);
    try {
      const r = await spotifyApi<{ items: any[] }>('/me/playlists?limit=50');
      setMyPlaylists(r.items || []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoadingPlaylists(false);
  }, [authed]);

  useEffect(() => {
    if (authed) loadMyPlaylists();
    else setMyPlaylists([]);
  }, [authed, loadMyPlaylists]);

  // Atualiza authed se localStorage mudar (outro tab fez login)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.accessToken) {
        setAuthed(!!e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return {
    // estado
    authed,
    user,
    isPremium,
    isReady,
    deviceId,
    state,
    volume,
    error,
    // acoes
    login,
    logout,
    togglePlay,
    next,
    previous,
    setVolume,
    seek,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
    playUri,
    search,
    myPlaylists,
    loadingPlaylists,
    loadMyPlaylists,
    // utilitarios
    clearError: () => setError(null),
    configured: !!CLIENT_ID,
  };
}

// Tipos globais pro SDK
declare global {
  interface Window {
    Spotify?: any;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}
