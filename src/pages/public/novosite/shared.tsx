import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Instagram, Youtube, ArrowRight } from 'lucide-react';

/**
 * Chrome compartilhado das páginas do novo site (/novosite/*): SVGs de marca,
 * tokens/estilos (NS_CSS), config de links, header+drawer, footer e hook de
 * comportamento (noindex, header sólido ao rolar, reveals no scroll).
 * Usado por NovoSite (home) e QuemSomos.
 */

/* ─────────── destinos reais (confirmados com o Marcos · 2026-05-30) ─────────── */
export const LINKS = {
  membro: 'https://www.cbrio.org/cadastro-membresia',
  grupos: 'https://www.cbrio.org/inscricao-grupos',
  batismo: 'https://www.cbrio.org/inscricao-batismo',
  voluntariado: 'https://www.cbrio.org/inscricao-voluntariado',
  online: 'https://cbrio.tv',
  instagram: 'https://www.instagram.com/igrejacbrio/',
  youtube: 'https://cbrio.tv',
  cbzap: 'https://wa.me/5521997567770',
  maps: 'https://www.google.com/maps/search/?api=1&query=CBRio',
  // next: pendente — Marcos confirma o link de inscrição depois
};

export const HOME = '/novosite';
export const QUEM_SOMOS = '/novosite/quem-somos';

export const NAV = [
  { label: 'Início', to: HOME },
  { label: 'Quem Somos', to: QUEM_SOMOS },
  { label: 'Nossa Jornada', to: HOME, hash: 'jornada' },
  { label: 'Valores', to: HOME, hash: 'valores' },
  { label: 'Agenda', to: HOME, hash: 'visita' },
  { label: 'Contato', to: HOME, hash: 'contato' },
];

/* ─────────────────────────── Brand SVGs (currentColor) ─────────────────────── */
export function Heart({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 442.39 400.24" aria-hidden="true" fill="currentColor">
      <path fillRule="nonzero" d="M 209.261719 55.910156 C 219.214844 48.441406 233.15625 42.890625 244.058594 40.25 C 358.355469 12.523438 435.679688 144.136719 359.457031 232.574219 C 317.949219 280.726562 263.503906 323.644531 220.785156 371.386719 C 192.066406 393.492188 158.839844 362.75 178.171875 332.894531 C 220.1875 285.417969 275.597656 242.699219 316.242188 194.851562 C 363.800781 138.863281 299.625 67.652344 242.316406 101.699219 C 237.460938 104.582031 234.230469 108.449219 230.035156 111.472656 C 225.382812 117.847656 217.199219 122.402344 209.535156 122.910156 C 187.25 124.390625 180.175781 103.609375 163.566406 94.730469 C 110.433594 66.332031 52.972656 124.066406 82.769531 176.902344 C 94.289062 197.328125 125.988281 207.820312 116.117188 235.523438 C 109.441406 254.273438 87.535156 259.8125 71.625 248.488281 C 27.429688 217.042969 6.105469 161.222656 23.757812 108.824219 C 49.738281 31.707031 145.464844 5.988281 208.875 55.605469 C 209.003906 55.707031 209.132812 55.808594 209.261719 55.910156 " />
    </svg>
  );
}

export function Wordmark({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 611.40 225.40" aria-label="cbrio" role="img" fill="currentColor">
      <path fillRule="nonzero" d="M 82.296875 177.285156 C 98.203125 177.285156 110.238281 170.261719 116.597656 157.792969 C 117.503906 156.015625 119.242188 154.816406 121.238281 154.816406 L 147.398438 154.816406 C 150.332031 154.816406 152.402344 157.691406 151.523438 160.488281 C 141.726562 191.765625 113.707031 210.609375 75.433594 207.917969 C 42.523438 205.605469 12.675781 176.03125 10.144531 143.136719 C 6.492188 95.65625 36.515625 63.261719 82.578125 63.261719 C 116.628906 63.261719 141.882812 81.097656 151.054688 109.46875 C 152.058594 112.582031 149.6875 115.78125 146.417969 115.78125 L 120.683594 115.78125 C 118.851562 115.78125 117.246094 114.691406 116.394531 113.066406 C 110.054688 100.988281 98.007812 94.15625 82.296875 94.15625 C 58.988281 94.15625 43.546875 109.601562 43.546875 135.71875 C 43.546875 161.835938 58.988281 177.285156 82.296875 177.285156 " />
      <path fillRule="nonzero" d="M 235.617188 93.875 C 212.308594 93.875 196.863281 109.320312 196.863281 135.4375 C 196.863281 161.554688 212.308594 177.003906 235.617188 177.003906 C 259.210938 177.003906 274.65625 161.554688 274.65625 135.4375 C 274.65625 109.320312 259.210938 93.875 235.617188 93.875 M 196.863281 14.132812 L 196.863281 68.914062 C 196.863281 72.511719 200.890625 74.527344 203.828125 72.449219 C 211.648438 66.917969 223.308594 62.984375 238.144531 62.984375 C 279.148438 62.984375 308.355469 92.1875 308.355469 135.71875 C 308.355469 178.96875 279.148438 207.894531 236.460938 207.894531 C 195.460938 207.894531 163.164062 180.933594 163.164062 135.71875 L 163.164062 14.003906 C 163.164062 11.277344 165.375 9.066406 168.105469 9.066406 L 191.796875 9.066406 C 194.59375 9.066406 196.863281 11.332031 196.863281 14.132812 " />
      <path fillRule="nonzero" d="M 390.617188 66.910156 L 390.617188 89.5 C 390.617188 91.695312 388.941406 93.578125 386.75 93.707031 C 366.613281 94.921875 354.671875 105.867188 354.671875 127.015625 L 354.671875 200.972656 C 354.671875 203.554688 352.578125 205.648438 350 205.648438 L 325.285156 205.648438 C 322.902344 205.648438 320.972656 203.714844 320.972656 201.335938 L 320.972656 127.015625 C 320.972656 85.753906 346.164062 64.167969 386.394531 62.773438 C 388.703125 62.695312 390.617188 64.601562 390.617188 66.910156 " />
      <path fillRule="nonzero" d="M 407.703125 62.703125 L 433.164062 62.703125 C 435.40625 62.703125 437.222656 64.519531 437.222656 66.761719 L 437.222656 200.769531 C 437.222656 203.460938 435.039062 205.648438 432.34375 205.648438 L 408.578125 205.648438 C 405.789062 205.648438 403.523438 203.386719 403.523438 200.59375 L 403.523438 66.882812 C 403.523438 64.574219 405.394531 62.703125 407.703125 62.703125 M 420.375 5.972656 C 430.765625 5.972656 438.910156 14.398438 438.910156 24.511719 C 438.910156 35.183594 430.765625 43.328125 420.375 43.328125 C 409.984375 43.328125 401.839844 35.183594 401.839844 24.511719 C 401.839844 14.398438 409.984375 5.972656 420.375 5.972656 " />
      <path fillRule="nonzero" d="M 521.191406 177.285156 C 544.78125 177.285156 560.226562 161.835938 560.226562 135.71875 C 560.226562 109.601562 544.78125 94.15625 521.191406 94.15625 C 497.878906 94.15625 482.433594 109.601562 482.433594 135.71875 C 482.433594 161.835938 497.878906 177.285156 521.191406 177.285156 M 521.472656 63.261719 C 558.796875 63.261719 585.382812 84.53125 592.203125 117.863281 C 604.304688 177.003906 562.320312 218.832031 503.265625 206.332031 C 469.992188 199.285156 448.738281 172.574219 448.738281 135.4375 C 448.738281 92.191406 477.941406 63.261719 521.472656 63.261719 " />
    </svg>
  );
}

/** Onda divisória. `color` = cor da seção que entra. */
export function Wave({ color, flip = false }: { color: string; flip?: boolean }) {
  const d = 'M0,64 C180,118 360,118 540,84 C720,50 900,-16 1080,8 C1260,32 1350,76 1440,92 L1440,140 L0,140 Z';
  return (
    <div className="ns-wave" style={{ color }} aria-hidden="true">
      <svg viewBox="0 0 1440 140" preserveAspectRatio="none">
        {flip ? <g transform="translate(0,140) scale(1,-1)"><path fill="currentColor" d={d} /></g> : <path fill="currentColor" d={d} />}
      </svg>
    </div>
  );
}

/* ─────────────────────────── Navegação / botões ───────────────────────────── */
type Target = { href?: string; to?: string; hash?: string };

/** Resolve um destino: externo (nova aba), âncora (scroll na página atual) ou rota SPA. */
export function useGo() {
  const navigate = useNavigate();
  const loc = useLocation();
  return (t: Target, closeMenu?: () => void) => (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (closeMenu) closeMenu();
    if (t.href) { window.open(t.href, '_blank', 'noopener,noreferrer'); return; }
    if (t.hash && document.getElementById(t.hash)) {
      document.getElementById(t.hash)!.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (t.to && t.to === loc.pathname && !t.hash) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    navigate((t.to || HOME) + (t.hash ? `#${t.hash}` : ''));
  };
}

/** Botão/CTA. href=externo (nova aba) · to/hash=interno (rota ou scroll). Sem nenhum = visual. */
export function Action({ variant = 'primary', sm, href, to, hash, icon = true, children, className = '' }:
  { variant?: 'primary' | 'secondary' | 'outline'; sm?: boolean; href?: string; to?: string; hash?: string; icon?: boolean; children: React.ReactNode; className?: string }) {
  const go = useGo();
  const cls = `ns-btn ns-btn-${variant}${sm ? ' ns-btn-sm' : ''}${className ? ' ' + className : ''}`;
  if (href) {
    return <a className={cls} href={href} target="_blank" rel="noopener noreferrer">{children}{icon && <ArrowRight size={18} />}</a>;
  }
  const dest = (to || HOME) + (hash ? `#${hash}` : '');
  return <a className={cls} href={dest} onClick={go({ to, hash })}>{children}{icon && <ArrowRight size={18} />}</a>;
}

function NavLink({ item, onClick }: { item: typeof NAV[number]; onClick?: () => void }) {
  const go = useGo();
  const dest = item.to + (item.hash ? `#${item.hash}` : '');
  return <a href={dest} className="ns-nav-link" onClick={go({ to: item.to, hash: item.hash }, onClick)}>{item.label}</a>;
}

/* ─────────────────────────── Header + Drawer ──────────────────────────────── */
export function SiteHeader({ scrolled, menuOpen, setMenuOpen }:
  { scrolled: boolean; menuOpen: boolean; setMenuOpen: (v: boolean) => void }) {
  const go = useGo();
  return (
    <>
      <header className={`ns-header${scrolled ? ' scrolled' : ''}`}>
        <div className="ns-container ns-header-in">
          <a href={HOME} onClick={go({ to: HOME })} className="ns-logo" aria-label="CBRio — início">
            <Heart className="ns-logo-heart" />
            <Wordmark className="ns-logo-word" />
          </a>
          <nav className="ns-nav">
            {NAV.map((n) => <NavLink key={n.label} item={n} />)}
          </nav>
          <div className="ns-header-cta">
            <Action variant="secondary" sm icon={false} to={HOME} hash="visita">Comece aqui</Action>
          </div>
          <button type="button" className="ns-burger" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>
            <Menu size={26} />
          </button>
        </div>
      </header>

      <div className={`ns-drawer${menuOpen ? ' open' : ''}`} role="dialog" aria-modal="true">
        <div className="ns-drawer-top">
          <Wordmark className="ns-drawer-word" />
          <button type="button" className="ns-burger" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X size={26} /></button>
        </div>
        <nav className="ns-drawer-nav">
          {NAV.map((n) => <NavLink key={n.label} item={n} onClick={() => setMenuOpen(false)} />)}
        </nav>
        <Action variant="secondary" icon={false} to={HOME} hash="visita" className="ns-drawer-cta">Comece aqui</Action>
      </div>
    </>
  );
}

/* ─────────────────────────── Footer ───────────────────────────────────────── */
export function SiteFooter() {
  const go = useGo();
  return (
    <footer id="contato" className="ns-footer">
      <div className="ns-container ns-footer-grid">
        <div className="ns-footer-brand">
          <Wordmark className="ns-footer-word" />
          <p className="ns-footer-mantra">Vivendo a transformação com leveza.</p>
        </div>
        <div className="ns-footer-col">
          <h4>Navegar</h4>
          {NAV.map((n) => <a key={n.label} href={n.to + (n.hash ? `#${n.hash}` : '')} onClick={go({ to: n.to, hash: n.hash })}>{n.label}</a>)}
        </div>
        <div className="ns-footer-col">
          <h4>Conecte-se</h4>
          <a href={LINKS.membro} target="_blank" rel="noopener noreferrer">Seja Membro</a>
          <a href={LINKS.grupos} target="_blank" rel="noopener noreferrer">Grupos</a>
          <a href={LINKS.batismo} target="_blank" rel="noopener noreferrer">Batismo</a>
          <a href={LINKS.voluntariado} target="_blank" rel="noopener noreferrer">Voluntariado</a>
        </div>
        <div className="ns-footer-col">
          <h4>Assista</h4>
          <a href={LINKS.online} target="_blank" rel="noopener noreferrer">Cultos ao vivo</a>
          <a href={LINKS.online} target="_blank" rel="noopener noreferrer">cbrio.tv</a>
          <div className="ns-social">
            <a className="ns-social-ic" href={LINKS.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"><Instagram size={18} /></a>
            <a className="ns-social-ic" href={LINKS.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube"><Youtube size={18} /></a>
          </div>
        </div>
      </div>
      <div className="ns-container ns-footer-base">
        <span>© CBRio — Comunidade Batista do Rio de Janeiro</span>
        <a href={LINKS.cbzap} target="_blank" rel="noopener noreferrer">CBZap · (21) 99756-7770</a>
      </div>
    </footer>
  );
}

/* ─────────────────────────── Hook de comportamento ────────────────────────── */
export function useChrome(title?: string) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevBg = document.body.style.background;
    document.body.style.background = '#F2ECE8';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    const prevTitle = document.title;
    document.title = title || 'CBRio · Comunidade Batista do Rio de Janeiro';
    return () => {
      document.body.style.background = prevBg;
      if (meta.parentNode) document.head.removeChild(meta);
      document.title = prevTitle;
    };
  }, [title]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll('.ns-reveal'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return { scrolled, menuOpen, setMenuOpen, rootRef };
}

/** Rola pra âncora quando a página abre com #hash (navegação vinda de outra página). */
export function useHashScroll() {
  const loc = useLocation();
  useEffect(() => {
    if (!loc.hash) return;
    const id = loc.hash.slice(1);
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 240);
    return () => clearTimeout(t);
  }, [loc.hash]);
}

export function Badge() {
  return <span className="ns-badge">prévia · /novosite</span>;
}
