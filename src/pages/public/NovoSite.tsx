import { useEffect, useRef, useState } from 'react';
import {
  UserPlus, Users, Droplet, HandHeart, ArrowUpRight, Play, MapPin, Clock, BookOpen, DoorOpen,
} from 'lucide-react';
import {
  Heart, Wave, Action, SiteHeader, SiteFooter, Badge, useChrome, useHashScroll, useGo, LINKS, QUEM_SOMOS,
} from './novosite/shared';
import { NS_CSS } from './novosite/styles';

/**
 * /novosite — Home do novo site público da CBRio (cbrio.com.br).
 * Página pública, standalone, não-listada e noindex (ver novosite/shared).
 * Header/footer/estilos vêm de novosite/shared + novosite/styles (compartilhados
 * com /novosite/quem-somos).
 */

const VALORES = [
  { n: '01', nome: 'Seguir a Jesus', ref: 'Efésios 2:8' },
  { n: '02', nome: 'Conectar-se com pessoas', ref: 'Hebreus 10:24-25' },
  { n: '03', nome: 'Investir tempo com Deus', ref: 'João 15:5' },
  { n: '04', nome: 'Servir em comunidade', ref: 'Gálatas 5:13-14' },
  { n: '05', nome: 'Viver generosamente', ref: '2 Coríntios 9:7' },
];

const JORNADA = [
  { Icon: UserPlus, titulo: 'Seja Membro', texto: 'Sinta-se em casa e faça parte da CBRio. Vai ser um prazer ter você com a gente.', cta: 'Quero ser membro', href: LINKS.membro },
  { Icon: Users, titulo: 'Grupos', texto: 'Conecte-se com pessoas e viva amizades de verdade. Sempre tem um grupo certo pra você.', cta: 'Participe de um grupo', href: LINKS.grupos },
  { Icon: Droplet, titulo: 'Batismo', texto: 'Declare ao mundo o seu amor por Jesus num mergulho inesquecível.', cta: 'Quero ser batizado', href: LINKS.batismo },
  { Icon: HandHeart, titulo: 'Voluntariado', texto: 'Servindo, você cresce em fé e amadurece na sua jornada. Deixe Deus agir.', cta: 'Servir como voluntário', href: LINKS.voluntariado },
  { Icon: BookOpen, titulo: 'Investir tempo com Deus', texto: 'No Quarta com Deus, toda quarta às 20h, estudamos a Bíblia e oramos uns pelos outros.', cta: 'Quarta com Deus', hash: 'visita' },
  { Icon: DoorOpen, titulo: 'Next', texto: 'A porta de entrada pra você conhecer nossa cultura e descobrir como se envolver na CBRio.', cta: 'Inscreva-se no Next', href: LINKS.next },
];

const STATS = [
  { de: '200', para: '1.704', label: 'Decisões por Cristo' },
  { de: '1.014', para: '2.362', label: 'Presença semanal' },
  { de: '245', para: '1.090', label: 'Pequenos grupos' },
  { de: '243', para: '523', label: 'Voluntários' },
  { de: '282', para: '837', label: 'Generosidade · doadores' },
  { de: '1.116', para: '8.365', label: 'Oração e devocionais' },
];

// Galeria em bento: 1º item = destaque (2x2). Verticais usam `pos` p/ o recorte.
const GALERIA = [
  { src: 'g-oracao.webp', alt: 'Mulher em oração durante o culto' },
  { src: 'g-kids.webp', alt: 'Criança no ministério infantil' },
  { src: 'g-ceia.webp', alt: 'Dia de Ceia na CBRio' },
  { src: 'g-comunidade.webp', alt: 'Comunidade reunida no culto', pos: 'center 28%' },
  { src: 'g-adoracao.webp', alt: 'Momento de adoração com mãos erguidas', pos: 'center 22%' },
  { src: 'g-palavra.webp', alt: 'Mensagem da Palavra no culto' },
];

const MARQUEE = ['Seguir a Jesus', 'Conectar-se com pessoas', 'Investir tempo com Deus', 'Servir em comunidade', 'Viver generosamente'];

function JornadaCard({ item }: { item: typeof JORNADA[number] }) {
  const go = useGo();
  const { Icon, titulo, texto, cta } = item;
  const href = (item as { href?: string }).href;
  const hash = (item as { hash?: string }).hash;
  const soon = (item as { soon?: boolean }).soon;
  const inner = (
    <>
      <span className="ns-card-icon"><Icon size={24} /></span>
      <h3 className="ns-card-title">{titulo}</h3>
      <p className="ns-card-text">{texto}</p>
      <span className={`ns-card-cta${soon ? ' soon' : ''}`}>{cta} <ArrowUpRight size={16} /></span>
    </>
  );
  if (href) return <a className="ns-card ns-reveal" href={href} target="_blank" rel="noopener noreferrer">{inner}</a>;
  if (hash) return <a className="ns-card ns-reveal" href={`#${hash}`} onClick={go({ hash })}>{inner}</a>;
  return <div className="ns-card ns-card-soon ns-reveal">{inner}</div>;
}

export default function NovoSite() {
  const { scrolled, menuOpen, setMenuOpen, rootRef } = useChrome();
  useHashScroll();
  const [useVideo, setUseVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  return (
    <div className="ns" ref={rootRef}>
      <style>{NS_CSS}</style>
      <SiteHeader scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      {/* ░░ HERO ░░ */}
      <section id="inicio" className="ns-hero">
        <div className="ns-hero-bg" style={{ backgroundImage: 'url(/novosite/hero.webp)' }} />
        {useVideo && (
          <video
            ref={videoRef}
            className={`ns-hero-video${videoReady ? ' playing' : ''}`}
            autoPlay muted loop playsInline preload="auto"
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
            <Action variant="secondary" hash="visita">Comece aqui</Action>
            <a className="ns-btn ns-btn-outline" href={LINKS.online} target="_blank" rel="noopener noreferrer"><Play size={16} /> Assistir online</a>
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
              <li><Clock size={20} /><div><strong>Cultos de domingo</strong><span>09:30 · 11:30 · 19:00</span></div></li>
              <li><Clock size={20} /><div><strong>Sábado · jovens e teens</strong><span>Bridge (adolescentes) 17h · AMI (jovens) 20h</span></div></li>
              <li><Clock size={20} /><div><strong>Quarta com Deus</strong><span>Quartas, às 20h</span></div></li>
              <li><Droplet size={20} /><div><strong>Batismos</strong><span>Todo 4º domingo do mês</span></div></li>
              <li><MapPin size={20} /><div><strong>Onde estamos</strong><span>Av. das Américas, 7907 · Shopping Open Mall (subsolo) · Rio de Janeiro</span></div></li>
            </ul>
            <div className="ns-hero-actions">
              <Action variant="primary" href={LINKS.maps}>Como chegar</Action>
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
            {JORNADA.map((item) => <JornadaCard key={item.titulo} item={item} />)}
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
            <a className="ns-btn ns-btn-secondary" href={LINKS.online} target="_blank" rel="noopener noreferrer"><Play size={16} /> Assistir online</a>
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
            <Action variant="primary" to={QUEM_SOMOS} className="ns-mt">Conheça nossa história</Action>
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
            <Action variant="secondary" hash="visita">Comece aqui</Action>
            <Action variant="outline" href={LINKS.voluntariado} icon={false}>Servir como voluntário</Action>
          </div>
        </div>
      </section>

      <SiteFooter />
      <Badge />
    </div>
  );
}
