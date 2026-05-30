// Estilos escopados em `.ns` — compartilhados pela home (NovoSite) e Quem Somos.
export const NS_CSS = `
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

/* botões (dupla classe p/ a cor vencer o reset .ns a{color:inherit} quando o botão é <a>) */
.ns-btn{ display:inline-flex; align-items:center; gap:.55rem; font-weight:700; font-size:1rem;
  padding:.92rem 1.7rem; border-radius:var(--radius-pill); border:1.6px solid transparent; text-decoration:none;
  cursor:pointer; transition:transform var(--dur-fast) var(--ease), background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast); }
.ns-btn:hover{ transform:translateY(-2px); }
.ns-btn.ns-btn-sm{ padding:.6rem 1.25rem; font-size:.92rem; }
.ns-btn.ns-btn-primary{ background:var(--cb-petrol); color:#fff; box-shadow:var(--shadow-soft); }
.ns-btn.ns-btn-primary:hover{ background:var(--cb-turquoise); color:#fff; }
.ns-btn.ns-btn-secondary{ background:var(--cb-turquoise-light); color:var(--cb-petrol); }
.ns-btn.ns-btn-secondary:hover{ background:#fff; color:var(--cb-petrol); }
.ns-btn.ns-btn-outline{ background:transparent; color:#fff; border-color:rgba(255,255,255,.65); }
.ns-btn.ns-btn-outline:hover{ background:rgba(255,255,255,.14); color:#fff; }

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
.ns-drawer-nav a{ font-size:1.6rem; font-weight:800; padding-block:.6rem; border-bottom:1px solid rgba(255,255,255,.12); color:#fff; }
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
.ns-card{ background:#fff; border-radius:var(--radius-card); padding:1.7rem 1.5rem; display:flex; flex-direction:column; align-items:flex-start; box-shadow:var(--shadow-soft); transition:transform var(--dur-fast) var(--ease); text-decoration:none; }
.ns-card:hover{ transform:translateY(-6px); }
.ns-card-soon{ cursor:default; }
.ns-card-soon:hover{ transform:none; }
.ns-card-icon{ display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:14px; background:var(--cb-turquoise-light); color:var(--cb-petrol); margin-bottom:1.1rem; }
.ns-card-title{ color:var(--cb-petrol); font-size:1.3rem; font-weight:800; margin-bottom:.5rem; }
.ns-card-text{ color:#5d5852; font-size:.98rem; line-height:1.55; flex:1; }
.ns-card-cta{ display:inline-flex; align-items:center; gap:.35rem; margin-top:1.1rem; color:var(--cb-turquoise); font-weight:700; font-size:.92rem; }
.ns-card-cta.soon{ color:#a99f95; }

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

/* historia (home teaser) + Quem Somos (blocos foto+texto) */
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
.ns-footer-col a{ display:block; padding-block:.32rem; font-size:.96rem; transition:color var(--dur-fast); cursor:pointer; }
.ns-footer-col a:hover{ color:var(--cb-turquoise-light); }
.ns-social{ display:flex; gap:.6rem; margin-top:.9rem; }
.ns-social-ic{ display:inline-flex; align-items:center; justify-content:center; width:38px; height:38px; border-radius:999px; border:1px solid rgba(255,255,255,.22); color:#fff; padding:0; transition:background var(--dur-fast); }
.ns-social-ic:hover{ background:rgba(255,255,255,.12); }
.ns-footer-base{ display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-top:3rem; padding-top:1.5rem; border-top:1px solid rgba(255,255,255,.12); font-size:.85rem; color:rgba(255,255,255,.55); }
.ns-footer-base a{ color:rgba(255,255,255,.72); transition:color var(--dur-fast); }
.ns-footer-base a:hover{ color:var(--cb-turquoise-light); }

/* ===== Quem Somos ===== */
.ns-qs-hero{ position:relative; min-height:clamp(440px,72vh,720px); display:flex; align-items:flex-end; padding:8rem 0 clamp(3rem,7vw,5.5rem); overflow:hidden; isolation:isolate; }
.ns-qs-hero-bg{ position:absolute; inset:0; background-size:cover; background-position:center 35%; z-index:-2; transform:scale(1.03); }
.ns-qs-hero-ov{ position:absolute; inset:0; z-index:-1; background:linear-gradient(180deg, rgba(0,48,60,.5) 0%, rgba(0,40,52,.32) 42%, rgba(0,38,50,.86) 100%); }
.ns-qs-hero-in{ position:relative; color:#fff; max-width:860px; }
.ns-qs-hero .ns-hero-title{ font-size:clamp(2.1rem,5.6vw,4.4rem); }
.ns-qs-lead-dark{ margin-top:1.3rem; font-size:clamp(1.05rem,1.6vw,1.3rem); max-width:60ch; color:rgba(255,255,255,.9); line-height:1.6; }
.ns-qs-fig img{ border-radius:var(--radius-img); box-shadow:var(--shadow-soft); width:100%; aspect-ratio:4/3; object-fit:cover; }
.ns-qs-grid-rev .ns-qs-fig{ order:2; }
.ns-qs-prose .ns-lead + .ns-lead{ margin-top:1rem; }
.ns-qs-missao{ text-align:center; }
.ns-qs-missao .ns-h2{ max-width:22ch; margin-inline:auto; }
.ns-qs-missao .ns-lead{ margin-inline:auto; }

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
  .ns-qs-grid-rev .ns-qs-fig{ order:0; }
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
