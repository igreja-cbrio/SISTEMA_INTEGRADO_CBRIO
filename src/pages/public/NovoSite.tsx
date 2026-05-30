import { useEffect, useRef, useState } from 'react';
import {
  UserPlus, Users, Droplet, HandHeart, ArrowRight, ArrowUpRight,
  Play, MapPin, Clock, Menu, X, Instagram, Youtube, BookOpen, DoorOpen,
} from 'lucide-react';

/**
 * /novosite — Prévia da home do novo site público da CBRio (cbrio.com.br).
 *
 * Página PÚBLICA, standalone (fora do AppShell e do ProtectedRoute), não-listada
 * e noindex. É um TESTE de layout: adapta o handoff de marca (brief + copy +
 * tokens + assets, originalmente pensado pra Astro) num único componente React,
 * usando os tokens como CSS vars escopadas em `.ns`. Sem funcionalidades/redirects:
 * os CTAs transacionais são botões visuais (sem href); a navegação faz scroll
 * suave dentro da própria página.
 *
 * Fonte: ~/Downloads/site cbrio (brief-site-cbrio.md, copy-ptbr-v1.md, tokens.css,
 * assets SVG, PDF "When Culture Changes Everything"). Fotos reais da igreja
 * otimizadas em /public/novosite/*.webp.
 */

/* ─────────────────────────── Brand SVGs (currentColor) ─────────────────────── */
function Heart({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 442.39 400.24" aria-hidden="true" fill="currentColor">
      <path fillRule="nonzero" d="M 209.261719 55.910156 C 219.214844 48.441406 233.15625 42.890625 244.058594 40.25 C 358.355469 12.523438 435.679688 144.136719 359.457031 232.574219 C 317.949219 280.726562 263.503906 323.644531 220.785156 371.386719 C 192.066406 393.492188 158.839844 362.75 178.171875 332.894531 C 220.1875 285.417969 275.597656 242.699219 316.242188 194.851562 C 363.800781 138.863281 299.625 67.652344 242.316406 101.699219 C 237.460938 104.582031 234.230469 108.449219 230.035156 111.472656 C 225.382812 117.847656 217.199219 122.402344 209.535156 122.910156 C 187.25 124.390625 180.175781 103.609375 163.566406 94.730469 C 110.433594 66.332031 52.972656 124.066406 82.769531 176.902344 C 94.289062 197.328125 125.988281 207.820312 116.117188 235.523438 C 109.441406 254.273438 87.535156 259.8125 71.625 248.488281 C 27.429688 217.042969 6.105469 161.222656 23.757812 108.824219 C 49.738281 31.707031 145.464844 5.988281 208.875 55.605469 C 209.003906 55.707031 209.132812 55.808594 209.261719 55.910156 " />
    </svg>
  );
}

function Wordmark({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
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

/** Onda divisória entre seções. `color` = cor da seção que está "entrando". */
function Wave({ color, flip = false }: { color: string; flip?: boolean }) {
  const d = 'M0,64 C180,118 360,118 540,84 C720,50 900,-16 1080,8 C1260,32 1350,76 1440,92 L1440,140 L0,140 Z';
  return (
    <div className="ns-wave" style={{ color }} aria-hidden="true">
      <svg viewBox="0 0 1440 140" preserveAspectRatio="none">
        {flip ? <g transform="translate(0,140) scale(1,-1)"><path fill="currentColor" d={d} /></g> : <path fill="currentColor" d={d} />}
      </svg>
    </div>
  );
}

/* ─────────────────────────── Conteúdo (copy real) ─────────────────────────── */
const NAV = [
  { label: 'Início', id: 'inicio' },
  { label: 'Quem Somos', id: 'historia' },
  { label: 'Nossa Jornada', id: 'jornada' },
  { label: 'Valores', id: 'valores' },
  { label: 'Agenda', id: 'visita' },
  { label: 'Contato', id: 'contato' },
];

const VALORES = [
  { n: '01', nome: 'Seguir a Jesus', ref: 'Efésios 2:8' },
  { n: '02', nome: 'Investir tempo com Deus', ref: 'João 15:5' },
  { n: '03', nome: 'Conectar-se com pessoas', ref: 'Hebreus 10:24-25' },
  { n: '04', nome: 'Servir em comunidade', ref: 'Gálatas 5:13-14' },
  { n: '05', nome: 'Viver generosamente', ref: '2 Coríntios 9:7' },
];

const JORNADA = [
  { Icon: UserPlus, titulo: 'Seja Membro', texto: 'Sinta-se em casa e faça parte da CBRio. Vai ser um prazer ter você com a gente.', cta: 'Quero ser membro' },
  { Icon: Users, titulo: 'Grupos', texto: 'Conecte-se com pessoas e viva amizades de verdade. Sempre tem um grupo certo pra você.', cta: 'Participe de um grupo' },
  { Icon: Droplet, titulo: 'Batismo', texto: 'Declare ao mundo o seu amor por Jesus num mergulho inesquecível.', cta: 'Quero ser batizado' },
  { Icon: HandHeart, titulo: 'Voluntariado', texto: 'Servindo, você cresce em fé e amadurece na sua jornada. Deixe Deus agir.', cta: 'Servir como voluntário' },
  { Icon: BookOpen, titulo: 'Investir tempo com Deus', texto: 'No Quarta com Deus, toda quarta às 20h, estudamos a Bíblia e oramos uns pelos outros.', cta: 'Quarta com Deus' },
  { Icon: DoorOpen, titulo: 'Next', texto: 'A porta de entrada pra você conhecer nossa cultura e descobrir como se envolver na CBRio.', cta: 'Em breve' },
];

const STATS = [
  { de: '200', para: '1.704', label: 'Decisões por Cristo' },
  { de: '1.014', para: '2.362', label: 'Presença semanal' },
  { de: '245', para: '1.090', label: 'Pequenos grupos' },
  { de: '243', para: '523', label: 'Voluntários' },
  { de: '282', para: '837', label: 'Generosidade · doadores' },
  { de: '1.116', para: '8.365', label: 'Oração e devocionais' },
];

// Galeria em bento: o 1º item é o destaque (2x2). As fotos verticais usam
// `pos` (object-position) pra o recorte manter o rosto/as mãos.
const GALERIA = [
  { src: 'g-oracao.webp', alt: 'Mulher em oração durante o culto' },
  { src: 'g-kids.webp', alt: 'Criança no ministério infantil' },
  { src: 'g-ceia.webp', alt: 'Dia de Ceia na CBRio' },
  { src: 'g-comunidade.webp', alt: 'Comunidade reunida no culto', pos: 'center 28%' },
  { src: 'g-adoracao.webp', alt: 'Momento de adoração com mãos erguidas', pos: 'center 22%' },
  { src: 'g-palavra.webp', alt: 'Mensagem da Palavra no culto' },
];

const MARQUEE = ['Seguir a Jesus', 'Investir tempo com Deus', 'Conectar-se com pessoas', 'Servir em comunidade', 'Viver generosamente'];

/* ─────────────────────────── Componente ───────────────────────────────────── */
export default function NovoSite() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [useVideo, setUseVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // noindex + título + fundo do documento (isola do tema do ERP)
  useEffect(() => {
    const prevBg = document.body.style.background;
    document.body.style.background = '#F2ECE8';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    const prevTitle = document.title;
    document.title = 'CBRio · Comunidade Batista do Rio de Janeiro';
    return () => {
      document.body.style.background = prevBg;
      if (meta.parentNode) document.head.removeChild(meta);
      document.title = prevTitle;
    };
  }, []);

  // header sólido ao rolar
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // vídeo do hero só em telas grandes e sem reduced-motion
  // (economia de dados no mobile + respeito à acessibilidade; o poster/foto cobre o resto)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)');
    const apply = () => setUseVideo(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  useEffect(() => {
    const v = videoRef.current;
    if (useVideo && v) { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  }, [useVideo]);

  // reveals no scroll
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

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="ns" ref={rootRef}>
      <style>{CSS}</style>

      {/* ░░ HEADER ░░ */}
      <header className={`ns-header${scrolled ? ' scrolled' : ''}`}>
        <div className="ns-container ns-header-in">
          <a href="#inicio" onClick={go('inicio')} className="ns-logo" aria-label="CBRio — início">
            <Heart className="ns-logo-heart" />
            <Wordmark className="ns-logo-word" />
          </a>
          <nav className="ns-nav">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} onClick={go(n.id)} className="ns-nav-link">{n.label}</a>
            ))}
          </nav>
          <div className="ns-header-cta">
            <button type="button" className="ns-btn ns-btn-secondary ns-btn-sm">Comece aqui</button>
          </div>
          <button type="button" className="ns-burger" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>
            <Menu size={26} />
          </button>
        </div>
      </header>

      {/* drawer mobile */}
      <div className={`ns-drawer${menuOpen ? ' open' : ''}`} role="dialog" aria-modal="true">
        <div className="ns-drawer-top">
          <Wordmark className="ns-drawer-word" />
          <button type="button" className="ns-burger" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X size={26} /></button>
        </div>
        <nav className="ns-drawer-nav">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} onClick={go(n.id)}>{n.label}</a>
          ))}
        </nav>
        <button type="button" className="ns-btn ns-btn-secondary ns-drawer-cta">Comece aqui</button>
      </div>

      {/* ░░ HERO ░░ */}
      <section id="inicio" className="ns-hero">
        <div className="ns-hero-bg" style={{ backgroundImage: 'url(/novosite/hero.webp)' }} />
        {useVideo && (
          <video
            ref={videoRef}
            className={`ns-hero-video${videoReady ? ' playing' : ''}`}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="/novosite/hero.webp"
            onCanPlay={() => setVideoReady(true)}
            onPlaying={() => setVideoReady(true)}
          >
            <source src="/novosite/hero.webm" type="video/webm" />
            <source src="/novosite/hero.mp4" type="video/mp4" />
          </video>
        )}
        <div className="ns-hero-overlay" />
        <Heart className="ns-hero-watermark" />
        <div className="ns-container ns-hero-in">
          <p className="ns-eyebrow ns-hero-eyebrow">Nossa missão</p>
          <h1 className="ns-hero-title">
            <span className="ns-hero-light">Empoderados por Deus para</span>{' '}
            <span className="ns-hero-black">alcançar pessoas pra Jesus.</span>
          </h1>
          <p className="ns-hero-ref">Mateus 28:19</p>
          <p className="ns-hero-sub">
            Uma comunidade de fé no coração do Rio, pra você seguir sua jornada com Cristo —
            de um jeito simples, profundo e cheio de acolhimento.
          </p>
          <div className="ns-hero-actions">
            <button type="button" className="ns-btn ns-btn-secondary">Comece aqui <ArrowRight size={18} /></button>
            <button type="button" className="ns-btn ns-btn-outline"><Play size={16} /> Assistir online</button>
          </div>
        </div>
        <Wave color="var(--cb-sand)" />
      </section>

      {/* ░░ BOAS-VINDAS / IDENTIDADE ░░ */}
      <section className="ns-section ns-theme-sand ns-welcome">
        <div className="ns-container">
          <div className="ns-reveal ns-welcome-in">
            <p className="ns-eyebrow ns-petrol-accent">Bem-vindo à CBRio</p>
            <h2 className="ns-h2">
              Não é só um culto. É uma <b>experiência de fé e comunidade.</b>
            </h2>
            <p className="ns-lead">
              Na CBRio, a gente caminha junto: conectados uns aos outros, buscando a Deus pela oração e
              pela Palavra, servindo e vivendo com generosidade pra alcançar mais pessoas pra Jesus.
              Seja você novo por aqui ou de casa há anos, há sempre um próximo passo esperando por você.
            </p>
          </div>
        </div>
      </section>

      {/* marquee dos valores */}
      <div className="ns-marquee" aria-hidden="true">
        <div className="ns-marquee-track">
          {[...MARQUEE, ...MARQUEE].map((v, i) => (
            <span key={i}>{v} <Heart className="ns-marquee-dot" /></span>
          ))}
        </div>
      </div>

      {/* ░░ COMECE AQUI / VISITA ░░ */}
      <section id="visita" className="ns-section ns-theme-offwhite has-wave ns-visita">
        <div className="ns-container ns-visita-grid">
          <div className="ns-reveal">
            <p className="ns-eyebrow ns-petrol-accent">Planeje sua visita</p>
            <h2 className="ns-h2 ns-petrol-accent">Sua primeira vez? <b>Comece por aqui.</b></h2>
            <p className="ns-lead">
              A gente adora receber quem está chegando. Venha como você está — tem um lugar pra você.
            </p>
            <ul className="ns-info">
              <li><Clock size={20} /><div><strong>Cultos de domingo</strong><span>08:30 · 10:00 · 11:30 · 19:00</span></div></li>
              <li><Clock size={20} /><div><strong>Quarta com Deus</strong><span>Quartas, às 20h</span></div></li>
              <li><Droplet size={20} /><div><strong>Batismos</strong><span>Todo 4º domingo do mês</span></div></li>
              <li><MapPin size={20} /><div><strong>Onde estamos</strong><span>Rio de Janeiro · RJ</span></div></li>
            </ul>
            <div className="ns-hero-actions">
              <button type="button" className="ns-btn ns-btn-primary">Planeje sua visita <ArrowRight size={18} /></button>
            </div>
          </div>
          <figure className="ns-reveal ns-visita-photo">
            <img src="/novosite/auditorio.webp" alt="Auditório da CBRio durante o culto" loading="lazy" />
          </figure>
        </div>
        <Wave color="var(--cb-petrol)" />
      </section>

      {/* ░░ NOSSA JORNADA ░░ */}
      <section id="jornada" className="ns-section ns-theme-petrol has-wave ns-jornada">
        <div className="ns-container">
          <div className="ns-reveal ns-section-head">
            <p className="ns-eyebrow ns-turq-light">Nossa Jornada</p>
            <h2 className="ns-h2">Sua <b>jornada</b> com a gente</h2>
            <p className="ns-lead ns-on-dark">Poucos ministérios, um caminho claro. Encontre o seu próximo passo.</p>
          </div>
          <div className="ns-cards">
            {JORNADA.map(({ Icon, titulo, texto, cta }) => (
              <article key={titulo} className="ns-card ns-reveal">
                <span className="ns-card-icon"><Icon size={24} /></span>
                <h3 className="ns-card-title">{titulo}</h3>
                <p className="ns-card-text">{texto}</p>
                <span className="ns-card-cta">{cta} <ArrowUpRight size={16} /></span>
              </article>
            ))}
          </div>
        </div>
        <Wave color="var(--cb-offwhite)" />
      </section>

      {/* ░░ VALORES ░░ */}
      <section id="valores" className="ns-section ns-theme-offwhite ns-valores">
        <div className="ns-container">
          <div className="ns-reveal ns-section-head">
            <p className="ns-eyebrow ns-petrol-accent">O que nos move</p>
            <h2 className="ns-h2 ns-petrol-accent">Cinco valores que <b>nos definem.</b></h2>
            <p className="ns-lead">Práticas que definem quem somos e quem estamos nos tornando.</p>
          </div>
          <ul className="ns-valores-list">
            {VALORES.map((v) => (
              <li key={v.n} className="ns-valor ns-reveal">
                <span className="ns-valor-n">{v.n}</span>
                <span className="ns-valor-nome">{v.nome}</span>
                <span className="ns-valor-ref">{v.ref}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ░░ ONLINE (faixa de foto) ░░ */}
      <section className="ns-online">
        <div className="ns-online-bg" style={{ backgroundImage: 'url(/novosite/online.webp)' }} />
        <div className="ns-online-overlay" />
        <div className="ns-container ns-online-in ns-reveal">
          <p className="ns-eyebrow ns-turq-light">Online</p>
          <h2 className="ns-h2">Não pôde vir? <b>Esteja com a gente de onde estiver.</b></h2>
          <p className="ns-lead ns-on-dark">Acompanhe nossos cultos ao vivo e faça parte da comunidade, esteja onde estiver.</p>
          <div className="ns-hero-actions">
            <button type="button" className="ns-btn ns-btn-secondary"><Play size={16} /> Assistir online</button>
          </div>
        </div>
      </section>

      {/* ░░ HISTÓRIA / IMPACTO ░░ */}
      <section id="historia" className="ns-section ns-theme-sand has-wave ns-historia">
        <div className="ns-container ns-historia-grid">
          <figure className="ns-reveal ns-historia-photo">
            <img src="/novosite/palavra.webp" alt="Mensagem durante o culto na CBRio" loading="lazy" />
          </figure>
          <div className="ns-reveal">
            <p className="ns-eyebrow ns-petrol-accent">Nossa história</p>
            <h2 className="ns-h2 ns-petrol-accent">Há 21 anos, <b>transformando vidas no Rio.</b></h2>
            <p className="ns-lead">
              Começamos numa sala de estar, com nada além de fé e uma missão. Hoje, somos uma
              comunidade que não para de crescer — e acredita que o melhor ainda está por vir.
            </p>
            <button type="button" className="ns-btn ns-btn-primary ns-mt">Conheça nossa história <ArrowRight size={18} /></button>
          </div>
        </div>
        <div className="ns-container">
          <div className="ns-stats ns-reveal">
            {STATS.map((s) => (
              <div key={s.label} className="ns-stat">
                <div className="ns-stat-num">{s.para}</div>
                <div className="ns-stat-de">de {s.de} em 2021</div>
                <div className="ns-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="ns-stats-cap ns-reveal">Crescimento entre 2021 e 2025. Por trás de cada número, uma pessoa.</p>
        </div>
        <Wave color="var(--cb-offwhite)" />
      </section>

      {/* ░░ GALERIA ░░ */}
      <section className="ns-section ns-theme-offwhite has-wave ns-galeria">
        <div className="ns-container">
          <div className="ns-reveal ns-section-head ns-center">
            <p className="ns-eyebrow ns-petrol-accent">Vida em comunidade</p>
            <h2 className="ns-h2 ns-petrol-accent">A vida acontece <b>juntos.</b></h2>
          </div>
          <div className="ns-gallery-bento">
            {GALERIA.map((g, i) => (
              <figure key={g.src} className={`ns-g-item ns-reveal${i === 0 ? ' ns-g-feat' : ''}`}>
                <img src={`/novosite/${g.src}`} alt={g.alt} loading="lazy" style={g.pos ? { objectPosition: g.pos } : undefined} />
              </figure>
            ))}
          </div>
        </div>
        <Wave color="var(--cb-petrol)" />
      </section>

      {/* ░░ CTA FINAL ░░ */}
      <section className="ns-section ns-theme-petrol ns-cta">
        <Heart className="ns-cta-watermark" />
        <div className="ns-container ns-center ns-reveal">
          <h2 className="ns-h2">Você <b>pertence</b> aqui.</h2>
          <p className="ns-lead ns-on-dark ns-center-x">Dê o próximo passo na sua jornada.</p>
          <div className="ns-hero-actions ns-center-x">
            <button type="button" className="ns-btn ns-btn-secondary">Comece aqui <ArrowRight size={18} /></button>
            <button type="button" className="ns-btn ns-btn-outline">Servir como voluntário</button>
          </div>
        </div>
      </section>

      {/* ░░ FOOTER ░░ */}
      <footer id="contato" className="ns-footer">
        <div className="ns-container ns-footer-grid">
          <div className="ns-footer-brand">
            <Wordmark className="ns-footer-word" />
            <p className="ns-footer-mantra">Vivendo a transformação com leveza.</p>
          </div>
          <div className="ns-footer-col">
            <h4>Navegar</h4>
            {NAV.map((n) => <a key={n.id} href={`#${n.id}`} onClick={go(n.id)}>{n.label}</a>)}
          </div>
          <div className="ns-footer-col">
            <h4>Conecte-se</h4>
            <span>Seja Membro</span><span>Grupos</span><span>Batismo</span><span>Voluntariado</span>
          </div>
          <div className="ns-footer-col">
            <h4>Assista</h4>
            <span>Cultos ao vivo</span><span>cbrio.tv</span>
            <div className="ns-social">
              <span className="ns-social-ic"><Instagram size={18} /></span>
              <span className="ns-social-ic"><Youtube size={18} /></span>
            </div>
          </div>
        </div>
        <div className="ns-container ns-footer-base">
          <span>© CBRio — Comunidade Batista do Rio de Janeiro</span>
          <span>contato@cbrio.com.br</span>
        </div>
      </footer>

      <span className="ns-badge">prévia · /novosite</span>
    </div>
  );
}

/* ─────────────────────────── Estilos (escopados em .ns) ────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700;800;900&display=swap');

.ns{
  --cb-petrol:#00839D; --cb-turquoise:#00ACB3; --cb-turquoise-light:#C3E4E3;
  --cb-olive:#8E9562; --cb-sand:#EDE0D4; --cb-sand-deep:#E0D1B9;
  --cb-offwhite:#F2ECE8; --cb-offwhite-2:#EDE8E2; --cb-white:#fff; --cb-ink:#242223;
  --fs-display-2: clamp(2.1rem, 5vw, 3.9rem);
  --section-y: clamp(3.5rem, 9vw, 8rem);
  --container: 1240px;
  --radius-pill:999px; --radius-card:20px; --radius-img:16px;
  --shadow-soft:0 16px 40px rgba(36,34,35,.10);
  --ease:cubic-bezier(.22,.61,.36,1); --dur-fast:.25s; --dur:.5s;
  font-family:'Urbanist',system-ui,-apple-system,'Segoe UI',sans-serif;
  color:var(--cb-ink); background:var(--cb-offwhite);
  line-height:1.65; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  position:relative; overflow-x:hidden;
}
.ns *,.ns *::before,.ns *::after{ box-sizing:border-box; }
.ns h1,.ns h2,.ns h3,.ns h4,.ns p,.ns ul,.ns li,.ns figure{ margin:0; padding:0; }
.ns ul{ list-style:none; }
.ns img{ display:block; max-width:100%; height:auto; }
.ns a{ color:inherit; text-decoration:none; }
.ns button{ font-family:inherit; }
.ns-container{ width:100%; max-width:var(--container); margin-inline:auto; padding-inline:clamp(1.25rem,4vw,2.5rem); }
.ns-section{ position:relative; padding-block:var(--section-y); scroll-margin-top:72px; }
.ns-section.has-wave{ padding-bottom:calc(var(--section-y) + clamp(40px,7vw,82px)); }
.ns-theme-sand{ background:var(--cb-sand); }
.ns-theme-offwhite{ background:var(--cb-offwhite); }
.ns-theme-petrol{ background:var(--cb-petrol); color:#fff; }

/* tipografia utilitária */
.ns-eyebrow{ text-transform:uppercase; letter-spacing:.22em; font-weight:700; font-size:.76rem; margin-bottom:1rem; }
.ns-petrol-accent{ color:var(--cb-petrol); }
.ns-turq-light{ color:var(--cb-turquoise-light); }
.ns-h2{ font-size:var(--fs-display-2); line-height:1.04; font-weight:300; letter-spacing:-.015em; }
.ns-h2 b{ font-weight:900; }
.ns-lead{ font-size:clamp(1.02rem,1.5vw,1.28rem); line-height:1.6; max-width:58ch; margin-top:1.2rem; opacity:.92; }
.ns-on-dark{ color:rgba(255,255,255,.86); }
.ns-section-head{ max-width:760px; margin-bottom:clamp(2rem,4vw,3.5rem); }
.ns-center{ text-align:center; }
.ns-center .ns-lead, .ns-center-x{ margin-left:auto; margin-right:auto; }
.ns-mt{ margin-top:1.6rem; }

/* botões */
.ns-btn{ display:inline-flex; align-items:center; gap:.55rem; font-weight:700; font-size:1rem;
  padding:.92rem 1.7rem; border-radius:var(--radius-pill); border:1.6px solid transparent;
  cursor:pointer; transition:transform var(--dur-fast) var(--ease), background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast); }
.ns-btn:hover{ transform:translateY(-2px); }
.ns-btn-sm{ padding:.6rem 1.25rem; font-size:.92rem; }
.ns-btn-primary{ background:var(--cb-petrol); color:#fff; box-shadow:var(--shadow-soft); }
.ns-btn-primary:hover{ background:var(--cb-turquoise); }
.ns-btn-secondary{ background:var(--cb-turquoise-light); color:var(--cb-petrol); }
.ns-btn-secondary:hover{ background:#fff; }
.ns-btn-outline{ background:transparent; color:#fff; border-color:rgba(255,255,255,.65); }
.ns-btn-outline:hover{ background:rgba(255,255,255,.14); }

/* header */
.ns-header{ position:fixed; top:0; left:0; right:0; z-index:50; transition:background var(--dur), box-shadow var(--dur), padding var(--dur); padding-block:.55rem; }
.ns-header.scrolled{ background:var(--cb-petrol); box-shadow:0 6px 24px rgba(0,0,0,.16); }
/* scrim no topo: garante o menu branco legível sobre o vídeo ao abrir; some ao rolar */
.ns-header::before{ content:''; position:absolute; top:0; left:0; right:0; height:170px; z-index:-1; pointer-events:none; background:linear-gradient(180deg, rgba(8,28,36,.62) 0%, rgba(8,28,36,.3) 45%, rgba(8,28,36,0) 100%); transition:opacity var(--dur) var(--ease); }
.ns-header.scrolled::before{ opacity:0; }
.ns-header-in{ display:flex; align-items:center; gap:1.5rem; }
.ns-header .ns-logo{ display:inline-flex; align-items:center; gap:.55rem; color:#fff; }
.ns-logo-heart{ width:34px; height:31px; }
.ns-logo-word{ width:84px; height:31px; }
.ns-nav{ display:flex; gap:1.6rem; margin-left:auto; }
.ns-header .ns-nav-link{ color:#fff; font-weight:600; font-size:.96rem; opacity:.92; position:relative; padding-block:.2rem; }
.ns-nav-link::after{ content:''; position:absolute; left:0; bottom:-2px; width:0; height:2px; background:var(--cb-turquoise-light); transition:width var(--dur-fast) var(--ease); }
.ns-nav-link:hover{ opacity:1; } .ns-nav-link:hover::after{ width:100%; }
.ns-header-cta{ margin-left:.2rem; }
.ns-burger{ display:none; background:none; border:none; color:#fff; cursor:pointer; padding:.25rem; }

/* drawer */
.ns-drawer{ position:fixed; inset:0; z-index:60; background:var(--cb-petrol); color:#fff; padding:1.5rem clamp(1.25rem,5vw,2.5rem); transform:translateX(100%); transition:transform .4s var(--ease); display:flex; flex-direction:column; }
.ns-drawer.open{ transform:none; }
.ns-drawer-top{ display:flex; align-items:center; justify-content:space-between; }
.ns-drawer-word{ width:96px; color:#fff; }
.ns-drawer-nav{ display:flex; flex-direction:column; gap:.3rem; margin-top:2.5rem; }
.ns-drawer-nav a{ font-size:1.6rem; font-weight:800; padding-block:.6rem; border-bottom:1px solid rgba(255,255,255,.12); }
.ns-drawer-cta{ margin-top:2rem; align-self:flex-start; }

/* hero */
.ns-hero{ position:relative; min-height:92vh; display:flex; align-items:flex-end; padding-bottom:clamp(5rem,11vw,9rem); padding-top:7rem; overflow:hidden; isolation:isolate; }
.ns-hero-bg{ position:absolute; inset:0; background-size:cover; background-position:center 30%; z-index:-3; transform:scale(1.04); }
.ns-hero-video{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:-2; opacity:0; transition:opacity 1.1s var(--ease); will-change:opacity; }
.ns-hero-video.playing{ opacity:1; }
.ns-hero-overlay{ position:absolute; inset:0; z-index:-1; background:
  linear-gradient(180deg, rgba(0,48,60,.55) 0%, rgba(0,42,54,.18) 32%, rgba(0,40,52,.62) 78%, rgba(0,38,50,.86) 100%); }
.ns-hero-watermark{ position:absolute; right:-3%; top:14%; width:42vw; max-width:520px; color:#fff; opacity:.06; z-index:-1; }
.ns-hero-in{ position:relative; color:#fff; max-width:880px; }
.ns-hero-eyebrow{ color:var(--cb-turquoise-light); }
.ns-hero-title{ font-size:clamp(2.3rem,6.2vw,5rem); line-height:1.02; letter-spacing:-.02em; text-wrap:balance; }
.ns-hero-light{ font-weight:300; }
.ns-hero-black{ font-weight:900; }
.ns-hero-ref{ margin-top:1.7rem; font-weight:600; letter-spacing:.16em; text-transform:uppercase; font-size:.8rem; color:var(--cb-turquoise-light); }
.ns-hero-sub{ margin-top:1.4rem; font-size:clamp(1.05rem,1.6vw,1.3rem); max-width:48ch; color:rgba(255,255,255,.9); line-height:1.6; }
.ns-hero-actions{ display:flex; flex-wrap:wrap; gap:.9rem; margin-top:2rem; }

/* wave */
.ns-wave{ position:absolute; left:0; right:0; bottom:-1px; z-index:2; line-height:0; pointer-events:none; }
.ns-wave svg{ width:100%; height:clamp(46px,7vw,100px); display:block; }

/* welcome */
.ns-welcome{ color:var(--cb-petrol); }
.ns-welcome .ns-h2{ max-width:18ch; }
.ns-welcome .ns-lead{ color:#5b6b62; opacity:1; }

/* marquee */
.ns-marquee{ background:var(--cb-petrol); color:var(--cb-turquoise-light); overflow:hidden; padding-block:1.05rem; }
.ns-marquee-track{ display:inline-flex; white-space:nowrap; animation:ns-scroll 30s linear infinite; }
.ns-marquee-track span{ display:inline-flex; align-items:center; gap:1.4rem; padding-inline:1.4rem; font-size:clamp(1.05rem,2.4vw,1.7rem); font-weight:800; }
.ns-marquee-dot{ width:18px; height:16px; color:var(--cb-turquoise); }
@keyframes ns-scroll{ from{ transform:translateX(0); } to{ transform:translateX(-50%); } }

/* visita */
.ns-visita-grid{ display:grid; grid-template-columns:1.05fr .95fr; gap:clamp(2rem,5vw,4.5rem); align-items:center; }
.ns-visita .ns-h2{ margin-top:.2rem; }
.ns-info{ display:flex; flex-direction:column; gap:1rem; margin-top:2.7rem; }
.ns-info li{ display:flex; gap:.9rem; align-items:flex-start; }
.ns-info li svg{ color:var(--cb-turquoise); flex:0 0 auto; margin-top:2px; }
.ns-info strong{ display:block; color:var(--cb-petrol); font-weight:800; }
.ns-info span{ color:#6b6560; }
.ns-visita-photo img{ border-radius:var(--radius-img); box-shadow:var(--shadow-soft); width:100%; aspect-ratio:4/3; object-fit:cover; }

/* jornada cards */
.ns-jornada{ color:#fff; }
.ns-cards{ display:grid; grid-template-columns:repeat(3,1fr); gap:1.2rem; }
.ns-card{ background:#fff; border-radius:var(--radius-card); padding:1.7rem 1.5rem; display:flex; flex-direction:column; align-items:flex-start; box-shadow:var(--shadow-soft); transition:transform var(--dur-fast) var(--ease); }
.ns-card:hover{ transform:translateY(-6px); }
.ns-card-icon{ display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:14px; background:var(--cb-turquoise-light); color:var(--cb-petrol); margin-bottom:1.1rem; }
.ns-card-title{ color:var(--cb-petrol); font-size:1.3rem; font-weight:800; margin-bottom:.5rem; }
.ns-card-text{ color:#5d5852; font-size:.98rem; line-height:1.55; flex:1; }
.ns-card-cta{ display:inline-flex; align-items:center; gap:.35rem; margin-top:1.1rem; color:var(--cb-turquoise); font-weight:700; font-size:.92rem; }
.ns-jornada-note{ margin-top:2rem; color:rgba(255,255,255,.9); font-size:1.05rem; display:flex; align-items:center; gap:1rem; flex-wrap:wrap; }
.ns-chip{ display:inline-flex; align-items:center; padding:.3rem .8rem; border:1px solid rgba(255,255,255,.4); border-radius:999px; font-size:.78rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }

/* valores */
.ns-valores-list{ display:flex; flex-direction:column; }
.ns-valor{ display:grid; grid-template-columns:auto 1fr auto; align-items:baseline; gap:1.5rem; padding:1.4rem 0; border-top:1px solid rgba(36,34,35,.12); }
.ns-valor:last-child{ border-bottom:1px solid rgba(36,34,35,.12); }
.ns-valor-n{ font-size:1rem; font-weight:800; color:var(--cb-turquoise); letter-spacing:.05em; }
.ns-valor-nome{ font-size:clamp(1.3rem,3vw,2.1rem); font-weight:800; color:var(--cb-petrol); line-height:1.1; }
.ns-valor-ref{ font-style:italic; color:#857d76; font-size:.98rem; text-align:right; }
.ns-valor:hover .ns-valor-nome{ color:var(--cb-turquoise); transition:color var(--dur-fast); }

/* online */
.ns-online{ position:relative; min-height:64vh; display:flex; align-items:center; overflow:hidden; isolation:isolate; padding-block:clamp(4rem,8vw,7rem); }
.ns-online-bg{ position:absolute; inset:0; background-size:cover; background-position:center; z-index:-2; }
.ns-online-overlay{ position:absolute; inset:0; z-index:-1; background:linear-gradient(90deg, rgba(0,40,52,.86) 0%, rgba(0,42,54,.6) 55%, rgba(0,42,54,.32) 100%); }
.ns-online-in{ color:#fff; max-width:640px; }

/* historia */
.ns-historia{ color:var(--cb-petrol); }
.ns-historia-grid{ display:grid; grid-template-columns:.9fr 1.1fr; gap:clamp(2rem,5vw,4.5rem); align-items:center; margin-bottom:clamp(2.5rem,5vw,4rem); }
.ns-historia-photo img{ border-radius:var(--radius-img); box-shadow:var(--shadow-soft); width:100%; aspect-ratio:3/4; object-fit:cover; max-height:560px; }
.ns-historia .ns-lead{ color:#5b6b62; opacity:1; }
.ns-stats{ display:grid; grid-template-columns:repeat(3,1fr); gap:1.5rem 2rem; padding-top:1rem; }
.ns-stat{ border-left:3px solid var(--cb-turquoise); padding-left:1.1rem; }
.ns-stat-num{ font-size:clamp(2rem,4.5vw,3.2rem); font-weight:900; color:var(--cb-petrol); line-height:1; letter-spacing:-.02em; }
.ns-stat-de{ font-size:.82rem; color:#9a8f85; margin-top:.3rem; font-weight:600; }
.ns-stat-label{ font-size:.98rem; color:#5b554f; margin-top:.35rem; }
.ns-stats-cap{ margin-top:1.6rem; font-style:italic; color:#857d76; }

/* galeria */
.ns-galeria .ns-section-head{ margin-inline:auto; }
.ns-gallery-bento{ display:grid; grid-template-columns:repeat(3,1fr); grid-auto-rows:clamp(132px,15.5vw,212px); gap:clamp(.6rem,1.1vw,1rem); }
.ns-g-item{ overflow:hidden; border-radius:var(--radius-img); }
.ns-g-feat{ grid-column:span 2; grid-row:span 2; }
.ns-g-item img{ width:100%; height:100%; object-fit:cover; transition:transform .7s var(--ease); }
.ns-g-item:hover img{ transform:scale(1.05); }

/* cta final */
.ns-cta{ overflow:hidden; isolation:isolate; text-align:center; }
.ns-cta-watermark{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:60vw; max-width:560px; color:#fff; opacity:.06; z-index:0; }
.ns-cta .ns-container{ position:relative; z-index:1; }
.ns-cta .ns-hero-actions{ justify-content:center; }

/* footer */
.ns-footer{ background:var(--cb-ink); color:rgba(255,255,255,.78); padding-block:clamp(3rem,6vw,5rem) 2rem; }
.ns-footer-grid{ display:grid; grid-template-columns:1.6fr 1fr 1fr 1fr; gap:2.5rem 2rem; }
.ns-footer-word{ width:150px; color:#fff; }
.ns-footer-mantra{ margin-top:1.1rem; font-size:1.15rem; color:#fff; font-weight:300; max-width:24ch; }
.ns-footer-col h4{ color:#fff; font-size:.82rem; text-transform:uppercase; letter-spacing:.14em; margin-bottom:1rem; font-weight:800; }
.ns-footer-col a, .ns-footer-col span{ display:block; padding-block:.32rem; font-size:.96rem; transition:color var(--dur-fast); }
.ns-footer-col a:hover{ color:var(--cb-turquoise-light); }
.ns-social{ display:flex; gap:.6rem; margin-top:.9rem; }
.ns-social-ic{ display:inline-flex; align-items:center; justify-content:center; width:38px; height:38px; border-radius:999px; border:1px solid rgba(255,255,255,.22); color:#fff; padding:0; }
.ns-footer-base{ display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-top:3rem; padding-top:1.5rem; border-top:1px solid rgba(255,255,255,.12); font-size:.85rem; color:rgba(255,255,255,.55); }

/* reveals */
.ns-reveal{ opacity:0; transform:translateY(26px); transition:opacity .7s var(--ease), transform .7s var(--ease); }
.ns-reveal.in{ opacity:1; transform:none; }

/* badge prévia */
.ns-badge{ position:fixed; right:12px; bottom:12px; z-index:70; background:rgba(36,34,35,.7); color:#fff; font-size:11px; font-weight:600; letter-spacing:.04em; padding:5px 10px; border-radius:999px; backdrop-filter:blur(6px); pointer-events:none; }

/* responsivo */
@media (max-width:1024px){
  .ns-cards{ grid-template-columns:repeat(2,1fr); }
  .ns-stats{ grid-template-columns:repeat(2,1fr); }
}
@media (max-width:820px){
  .ns-nav, .ns-header-cta{ display:none; }
  .ns-burger{ display:inline-flex; margin-left:auto; }
  .ns-visita-grid, .ns-historia-grid{ grid-template-columns:1fr; }
  .ns-visita-photo{ order:-1; }
  .ns-gallery-bento{ grid-template-columns:repeat(2,1fr); grid-auto-rows:clamp(120px,30vw,168px); }
  .ns-g-feat{ grid-column:span 2; grid-row:span 1; }
  .ns-valor{ grid-template-columns:auto 1fr; }
  .ns-valor-ref{ grid-column:2; text-align:left; margin-top:.2rem; }
  .ns-footer-grid{ grid-template-columns:1fr 1fr; }
}
@media (max-width:540px){
  .ns-cards, .ns-stats{ grid-template-columns:1fr; }
  .ns-footer-grid{ grid-template-columns:1fr; }
  .ns-hero{ min-height:88vh; }
}
@media (prefers-reduced-motion:reduce){
  .ns *{ animation-duration:.001ms !important; transition-duration:.001ms !important; }
  .ns-reveal{ opacity:1; transform:none; }
}
`;
