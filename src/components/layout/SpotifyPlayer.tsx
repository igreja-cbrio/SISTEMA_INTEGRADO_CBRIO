"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Music2, Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1,
  X, ChevronDown, Loader2, ExternalLink, Search, LogOut,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSpotify } from '@/hooks/useSpotify';

const SPOTIFY_GREEN = '#1DB954';

const STORAGE_KEYS = {
  open: 'sp_widget_open',
  embedUri: 'sp_embed_uri',
};

const PRESETS: Array<{ label: string; emoji: string; uri: string }> = [
  { label: 'Foco / Lo-fi', emoji: '🎧', uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn' },
  { label: 'Adoração', emoji: '🙏', uri: 'spotify:playlist:37i9dQZF1DXcb6CQIjdqKy' },
  { label: 'Instrumental', emoji: '🎹', uri: 'spotify:playlist:37i9dQZF1DWZbgKdIyHjmw' },
  { label: 'Top Brasil', emoji: '🇧🇷', uri: 'spotify:playlist:37i9dQZEVXbMXbN3EUUhlg' },
];

function toEmbedUrl(uriOrUrl: string): string | null {
  if (!uriOrUrl) return null;
  let id = '';
  let kind: 'playlist' | 'track' | 'album' | 'episode' | 'show' = 'playlist';
  if (uriOrUrl.startsWith('spotify:')) {
    const parts = uriOrUrl.split(':');
    kind = parts[1] as any;
    id = parts[2];
  } else if (uriOrUrl.includes('open.spotify.com')) {
    const m = uriOrUrl.match(/open\.spotify\.com\/(playlist|track|album|episode|show)\/([a-zA-Z0-9]+)/);
    if (!m) return null;
    kind = m[1] as any;
    id = m[2];
  } else return null;
  if (!id) return null;
  return `https://open.spotify.com/embed/${kind}/${id}?theme=0`;
}

function formatTime(ms: number): string {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Slider customizado (do 21st.dev, adaptado) ───────────────────────────────
function CustomSlider({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <motion.div
      className={cn(
        'relative w-full h-1 bg-white/20 rounded-full cursor-pointer group',
        className,
      )}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        onChange(Math.min(Math.max(percentage, 0), 100));
      }}
    >
      <motion.div
        className="absolute top-0 left-0 h-full bg-white rounded-full"
        style={{ width: `${value}%` }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />
    </motion.div>
  );
}

// ── Player Premium (SDK) ─────────────────────────────────────────────────────
function SDKPlayerCard({ sp }: { sp: ReturnType<typeof useSpotify> }) {
  const trackName = sp.state?.track?.name;
  const artistName = sp.state?.track?.artists?.map(a => a.name).join(', ');
  const cover = sp.state?.track?.album?.images?.[0]?.url;
  const position = sp.state?.position ?? 0;
  const duration = sp.state?.duration ?? 0;
  const progress = duration > 0 ? (position / duration) * 100 : 0;
  const isPlaying = sp.state && !sp.state.paused;

  const handleSeek = (pct: number) => {
    if (duration > 0) sp.seek((pct / 100) * duration);
  };

  return (
    <motion.div
      className="relative flex flex-col rounded-3xl overflow-hidden bg-[#11111198] shadow-[0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-sm p-3 w-full"
      initial={{ opacity: 0, filter: 'blur(10px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.3, ease: 'easeInOut', type: 'spring' }}
      layout
    >
      <motion.div className="flex flex-col relative" layout>
        {/* Cover */}
        <motion.div className="bg-white/10 overflow-hidden rounded-[16px] h-[180px] w-full relative">
          {cover ? (
            <img
              src={cover}
              alt={trackName || 'cover'}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music2 className="h-12 w-12 text-white/30" />
            </div>
          )}
        </motion.div>

        <motion.div className="flex flex-col w-full gap-y-2">
          {/* Title */}
          <motion.div className="flex flex-col items-center mt-2">
            <h3 className="text-white font-bold text-sm text-center truncate w-full">
              {trackName || 'Nada tocando'}
            </h3>
            {artistName && (
              <p className="text-white/60 text-xs text-center truncate w-full">
                {artistName}
              </p>
            )}
          </motion.div>

          {/* Slider */}
          <motion.div className="flex flex-col gap-y-1">
            <CustomSlider value={progress} onChange={handleSeek} className="w-full" />
            <div className="flex items-center justify-between">
              <span className="text-white/80 text-xs tabular-nums">{formatTime(position)}</span>
              <span className="text-white/80 text-xs tabular-nums">{formatTime(duration)}</span>
            </div>
          </motion.div>

          {/* Controls */}
          <motion.div className="flex items-center justify-center w-full mt-1">
            <div className="flex items-center gap-1 w-fit bg-[#11111198] rounded-[16px] p-1.5">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={sp.toggleShuffle}
                  className={cn(
                    'text-white hover:bg-[#111111d1] hover:text-white h-8 w-8 rounded-full',
                    sp.shuffle && 'bg-[#111111d1] text-[#1DB954]',
                  )}
                  title="Embaralhar"
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={sp.previous}
                  className="text-white hover:bg-[#111111d1] hover:text-white h-8 w-8 rounded-full"
                  title="Anterior"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  onClick={sp.togglePlay}
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-[#111111d1] hover:text-white h-9 w-9 rounded-full"
                  title={isPlaying ? 'Pausar' : 'Tocar'}
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={sp.next}
                  className="text-white hover:bg-[#111111d1] hover:text-white h-8 w-8 rounded-full"
                  title="Próxima"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={sp.cycleRepeat}
                  className={cn(
                    'text-white hover:bg-[#111111d1] hover:text-white h-8 w-8 rounded-full',
                    sp.repeat !== 'off' && 'bg-[#111111d1] text-[#1DB954]',
                  )}
                  title={`Repetir: ${sp.repeat}`}
                >
                  {sp.repeat === 'track' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ── Player principal ─────────────────────────────────────────────────────────
export default function SpotifyPlayer() {
  const sp = useSpotify();
  const [open, setOpen] = useState<boolean>(() => localStorage.getItem(STORAGE_KEYS.open) === '1');
  const [embedUri, setEmbedUri] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.embedUri) || PRESETS[0].uri);
  const [pasteInput, setPasteInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'atalhos' | 'buscar' | 'minhas'>('atalhos');
  const searchTimerRef = useRef<any>(null);

  useEffect(() => { localStorage.setItem(STORAGE_KEYS.open, open ? '1' : '0'); }, [open]);
  useEffect(() => { if (embedUri) localStorage.setItem(STORAGE_KEYS.embedUri, embedUri); }, [embedUri]);

  const embedUrl = useMemo(() => toEmbedUrl(embedUri), [embedUri]);
  const usingSdk = sp.authed && sp.isPremium && sp.isReady;
  const showEmbed = !usingSdk;

  // Busca funciona pra qualquer usuario authed (Free ou Premium) — so precisa de OAuth
  useEffect(() => {
    if (!sp.authed || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await sp.search(searchQuery);
        setSearchResults(r);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, sp.authed, sp]);

  // Play universal: SDK se Premium ready, senao embed
  const playSmart = (uri: string) => {
    if (usingSdk) {
      sp.playUri(uri);
    } else {
      setEmbedUri(uri);
    }
  };

  const handlePaste = () => {
    const url = toEmbedUrl(pasteInput.trim());
    if (url) {
      setEmbedUri(pasteInput.trim());
      setPasteInput('');
    }
  };

  // IMPORTANTE: o painel fica SEMPRE montado (mesmo minimizado) pra que o
  // iframe do embed continue tocando. Usamos opacity + pointer-events em
  // vez de unmount.
  return (
    <>
      {/* Botao flutuante (visivel quando minimizado) */}
      <motion.button
        onClick={() => setOpen(true)}
        title="Abrir player Spotify"
        aria-label="Abrir player Spotify"
        className="fixed z-40 rounded-full shadow-lg flex items-center justify-center"
        style={{
          right: 16,
          bottom: 16,
          width: 48,
          height: 48,
          background: SPOTIFY_GREEN,
          color: 'white',
          pointerEvents: open ? 'none' : 'auto',
        }}
        animate={{
          opacity: open ? 0 : 1,
          scale: open ? 0.5 : 1,
        }}
        whileHover={open ? undefined : { scale: 1.1 }}
        whileTap={open ? undefined : { scale: 0.9 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
      >
        <Music2 className="h-5 w-5" />
      </motion.button>

      {/* Painel — sempre montado pra preservar audio */}
      <motion.div
        initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
        animate={{
          opacity: open ? 1 : 0,
          y: open ? 0 : 20,
          filter: open ? 'blur(0px)' : 'blur(8px)',
          scale: open ? 1 : 0.95,
        }}
        transition={{ duration: 0.25, type: 'spring' }}
        className="fixed z-40"
        style={{
          right: 16,
          bottom: 16,
          width: 304,
          maxHeight: 'calc(100vh - 32px)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <div className="flex flex-col gap-2 max-h-[calc(100vh-32px)]">
          {/* Card principal: SDK ou estado de auth */}
          {sp.configured && !sp.authed && (
            <motion.div
              className="rounded-3xl bg-[#11111198] backdrop-blur-sm p-4 text-white space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music2 className="h-4 w-4" style={{ color: SPOTIFY_GREEN }} />
                  <span className="text-sm font-semibold">Spotify</span>
                </div>
                <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">
                Tem <strong className="text-white">Premium</strong>? Conecte para usar o player completo.
                Senão, o player básico abaixo funciona pra qualquer conta.
              </p>
              <Button
                onClick={sp.login}
                className="w-full text-white"
                style={{ background: SPOTIFY_GREEN }}
              >
                <Music2 className="h-4 w-4 mr-2" />
                Conectar com Spotify
              </Button>
            </motion.div>
          )}

          {usingSdk && (
            <div className="relative">
              <SDKPlayerCard sp={sp} />
              {/* Header overlay com nome + minimizar */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm pointer-events-auto">
                  <Music2 className="h-3 w-3" style={{ color: SPOTIFY_GREEN }} />
                  <span className="text-[10px] font-bold text-white">PREMIUM</span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:text-white pointer-events-auto"
                  title="Minimizar (continua tocando)"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {sp.authed && !sp.isPremium && sp.user && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-foreground">
              Sua conta é <strong>Free</strong>. Player completo precisa de Premium — usando player básico abaixo.{' '}
              <button onClick={sp.logout} className="underline text-amber-600 ml-1">desconectar</button>
            </div>
          )}

          {sp.authed && sp.isPremium && !sp.isReady && (
            <motion.div
              className="rounded-3xl bg-[#11111198] backdrop-blur-sm p-4 flex items-center gap-2 text-xs text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: SPOTIFY_GREEN }} />
              Inicializando player Premium...
            </motion.div>
          )}

          {sp.error && (
            <div className="rounded-2xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-100 flex items-center justify-between gap-2">
              <span className="flex-1 truncate" title={sp.error}>{sp.error}</span>
              <button onClick={sp.clearError} className="text-red-200/70 hover:text-red-100">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Embed (free / nao conectado) */}
          {showEmbed && embedUrl && (
            <motion.div
              className="rounded-3xl overflow-hidden bg-[#11111198] backdrop-blur-sm p-3 space-y-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <Music2 className="h-4 w-4" style={{ color: SPOTIFY_GREEN }} />
                  <span className="text-sm font-semibold">Spotify</span>
                </div>
                <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <iframe
                src={embedUrl}
                width="100%"
                height="232"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                title="Spotify Embed"
                style={{ borderRadius: 12 }}
              />
            </motion.div>
          )}

          {/* Painel de atalhos / busca / minhas playlists com tabs */}
          <motion.div
            className="rounded-2xl bg-[#11111198] backdrop-blur-sm p-3 space-y-3 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Tabs */}
            <div className="flex gap-1 border-b border-white/10 -mt-1">
              {([
                ['atalhos', 'Atalhos'],
                ...(sp.authed ? [['buscar', 'Buscar'], ['minhas', 'Minhas']] : []),
              ] as Array<[typeof activeTab, string]>).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'px-2.5 py-1.5 text-[11px] font-medium border-b-2 -mb-px transition-colors',
                    activeTab === id
                      ? 'border-[#1DB954] text-white'
                      : 'border-transparent text-white/50 hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab: Atalhos */}
            {activeTab === 'atalhos' && (
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map(p => (
                  <button
                    key={p.uri}
                    onClick={() => playSmart(p.uri)}
                    className={cn(
                      'text-[11px] px-2 py-1.5 rounded-lg border transition-colors text-left flex items-center gap-1 text-white',
                      !usingSdk && embedUri === p.uri
                        ? 'border-[#1DB954] bg-[#1DB954]/15'
                        : 'border-white/10 hover:border-[#1DB954] hover:bg-[#1DB954]/10',
                    )}
                  >
                    <span>{p.emoji}</span>
                    <span className="truncate">{p.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Tab: Buscar */}
            {activeTab === 'buscar' && sp.authed && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/50" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar música ou playlist..."
                    autoFocus
                    className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/40 outline-none focus:border-[#1DB954]"
                  />
                  {searching && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-white/50" />
                  )}
                </div>
                {searchResults && (
                  <div className="space-y-0.5 max-h-44 overflow-y-auto">
                    {searchResults.tracks?.items?.slice(0, 5).map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => playSmart(t.uri)}
                        className="w-full text-left px-2 py-1 rounded hover:bg-white/10 text-[11px] text-white flex items-center gap-1.5"
                      >
                        <Play className="h-2.5 w-2.5 shrink-0" style={{ color: SPOTIFY_GREEN }} />
                        <span className="flex-1 truncate">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-white/50"> · {t.artists?.[0]?.name}</span>
                        </span>
                      </button>
                    ))}
                    {searchResults.playlists?.items?.slice(0, 3).map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => playSmart(p.uri)}
                        className="w-full text-left px-2 py-1 rounded hover:bg-white/10 text-[11px] text-white flex items-center gap-1.5"
                      >
                        <Music2 className="h-2.5 w-2.5 shrink-0" style={{ color: SPOTIFY_GREEN }} />
                        <span className="flex-1 truncate">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-white/50"> · playlist</span>
                        </span>
                      </button>
                    ))}
                    {!searchResults.tracks?.items?.length && !searchResults.playlists?.items?.length && (
                      <p className="text-[10px] text-white/40 text-center py-2">Nenhum resultado</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Minhas Playlists */}
            {activeTab === 'minhas' && sp.authed && (
              <div className="space-y-1">
                {sp.loadingPlaylists ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                  </div>
                ) : sp.myPlaylists.length === 0 ? (
                  <div className="space-y-2 py-3 text-center">
                    <p className="text-[10px] text-white/50">Nenhuma playlist.</p>
                    <button
                      onClick={sp.loadMyPlaylists}
                      className="text-[10px] text-white/70 hover:text-white underline"
                    >
                      Recarregar
                    </button>
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {sp.myPlaylists.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => playSmart(p.uri)}
                        className="w-full text-left px-1.5 py-1 rounded hover:bg-white/10 text-[11px] text-white flex items-center gap-2"
                      >
                        <div
                          className="w-7 h-7 rounded shrink-0 bg-white/10 overflow-hidden"
                          style={p.images?.[0]?.url ? { backgroundImage: `url(${p.images[0].url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                        >
                          {!p.images?.[0]?.url && <Music2 className="w-full h-full p-1.5 text-white/30" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{p.name}</p>
                          <p className="text-white/50 text-[9px] truncate">
                            {p.tracks?.total || 0} faixas
                          </p>
                        </div>
                        <Play className="h-3 w-3 shrink-0 opacity-60" style={{ color: SPOTIFY_GREEN }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cole URL — sempre disponivel pra qualquer modo */}
            <div className="space-y-1.5 border-t border-white/10 pt-2.5">
              <p className="text-[10px] uppercase tracking-wider text-white/50">Cole URL ou ID</p>
              <div className="flex gap-1.5">
                <input
                  value={pasteInput}
                  onChange={e => setPasteInput(e.target.value)}
                  placeholder="open.spotify.com/playlist/..."
                  className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/40 outline-none focus:border-[#1DB954]"
                  onKeyDown={e => { if (e.key === 'Enter') handlePaste(); }}
                />
                <Button
                  onClick={handlePaste}
                  disabled={!pasteInput.trim()}
                  className="h-7 px-2.5 text-xs text-white"
                  style={{ background: SPOTIFY_GREEN }}
                >
                  OK
                </Button>
              </div>
            </div>

            {sp.user && (
              <div className="border-t border-white/10 pt-2 flex items-center justify-between text-[10px] text-white/60">
                <span className="truncate">Conectado: {sp.user.display_name || sp.user.email}</span>
                <button onClick={sp.logout} className="hover:text-white flex items-center gap-1 ml-2">
                  <LogOut className="h-3 w-3" />
                </button>
              </div>
            )}

            <a
              href="https://open.spotify.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-white/50 hover:text-white flex items-center gap-1"
            >
              Abrir Spotify completo <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}
