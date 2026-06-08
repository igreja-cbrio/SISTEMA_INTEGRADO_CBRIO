import {
  LayoutDashboard, BarChart3, CalendarDays, Users, Heart, HandHelping,
  Search, Bell, ArrowUpRight, ArrowDownRight, Plus, Sparkles, Church,
  TrendingUp, ChevronRight, Flame, Wallet, Activity,
} from 'lucide-react';

/**
 * DesignPreview · /design-preview
 *
 * Refação "dark premium fintech · ousado" do estilo Rondesignlab adaptada
 * ao CBRio: fundo escuro profundo com glows, grid BENTO (cards de tamanhos
 * diferentes), números gigantes, gauge e gráficos com brilho neon teal,
 * formas decorativas de fundo. Acento da marca teal #00B39D preservado,
 * potencializado com um neon (#1FE6C8) só pros brilhos.
 *
 * Showcase ISOLADO — não toca nenhuma tela de produção. CSS escopado em `.rdf`.
 */
export default function DesignPreview() {
  return (
    <div className="rdf">
      <style>{CSS}</style>

      <RdfDefs />

      {/* glows decorativos de fundo */}
      <div className="rdf-bg">
        <span className="rdf-blob rdf-blob-1" />
        <span className="rdf-blob rdf-blob-2" />
        <span className="rdf-grid" />
      </div>

      <div className="rdf-banner">
        <Sparkles size={14} />
        <span><b>Preview de design</b> · dark premium · estilo Rondesignlab adaptado ao CBRio · não está em produção</span>
      </div>

      <div className="rdf-app">
        {/* ── Sidebar ── */}
        <aside className="rdf-sidebar">
          <div className="rdf-brand">
            <span className="rdf-brand-mark"><Church size={17} /></span>
            <span className="rdf-brand-name">CBRio</span>
          </div>
          <nav className="rdf-nav">
            <NavItem icon={LayoutDashboard} label="Painel" active />
            <NavItem icon={BarChart3} label="Minha área" />
            <NavItem icon={CalendarDays} label="Cultos" badge="4" />
            <NavItem icon={Users} label="Membresia" />
            <NavItem icon={Heart} label="Cuidados" />
            <NavItem icon={HandHelping} label="Voluntariado" />
          </nav>
          <div className="rdf-streak">
            <Flame size={16} />
            <div>
              <b>12 semanas</b>
              <span>de dados completos</span>
            </div>
          </div>
        </aside>

        {/* ── Conteúdo ── */}
        <main className="rdf-main">
          {/* Topbar */}
          <header className="rdf-topbar">
            <div>
              <p className="rdf-eyebrow">Quinta · 28 maio · 18h</p>
              <h1 className="rdf-h1">Boa noite, Marcos</h1>
            </div>
            <div className="rdf-actions">
              <div className="rdf-search"><Search size={15} /><input placeholder="Buscar…" /><kbd>⌘K</kbd></div>
              <button className="rdf-iconbtn"><Bell size={17} /><i /></button>
              <div className="rdf-avatar">MP</div>
            </div>
          </header>

          {/* Bento grid */}
          <section className="rdf-bento">
            {/* HERO · saúde institucional */}
            <div className="rdf-card rdf-hero">
              <div className="rdf-hero-top">
                <span className="rdf-pill"><Activity size={13} /> Saúde da CBRio</span>
                <span className="rdf-trend up"><ArrowUpRight size={13} /> +6 pts</span>
              </div>
              <Gauge value={86} />
              <div className="rdf-hero-foot">
                <div><b>78%</b><span>NSM engajado</span></div>
                <div><b>1.667</b><span>frequência</span></div>
                <div><b>42</b><span>decisões</span></div>
              </div>
            </div>

            {/* Dízimos · número gigante */}
            <div className="rdf-card rdf-money">
              <span className="rdf-pill ghost"><Wallet size={13} /> Dízimos · mês</span>
              <p className="rdf-bignum">R$ 312<small>k</small></p>
              <div className="rdf-money-foot">
                <span className="rdf-trend down"><ArrowDownRight size={12} /> 4,1%</span>
                <span className="rdf-muted">vs. abril</span>
              </div>
              <Bars data={[60, 75, 52, 80, 68, 90, 72]} />
            </div>

            {/* mini stats */}
            <MiniStat label="Frequência" value="1.667" delta="+13,6%" up spark={[8,11,9,13,12,15,17]} />
            <MiniStat label="Decisões" value="42" delta="+8" up spark={[3,5,4,6,5,8,7]} />
            <MiniStat label="Voluntários" value="284" delta="-2,3%" up={false} spark={[20,19,21,18,17,18,16]} />

            {/* Chart grande */}
            <div className="rdf-card rdf-chart-card">
              <div className="rdf-card-head">
                <div>
                  <h3 className="rdf-ctitle">Movimento dos cultos</h3>
                  <p className="rdf-csub">Frequência &amp; decisões · 8 semanas</p>
                </div>
                <div className="rdf-seg">
                  <button>Sem</button><button className="active">Mês</button><button>Ano</button>
                </div>
              </div>
              <GlowArea />
              <div className="rdf-legend">
                <span><i className="g-teal" /> Frequência</span>
                <span><i className="g-violet" /> Decisões</span>
              </div>
            </div>

            {/* NSM radial */}
            <div className="rdf-card rdf-nsm">
              <div className="rdf-card-head">
                <h3 className="rdf-ctitle">NSM da semana</h3>
                <TrendingUp size={15} />
              </div>
              <Ring value={78} />
              <p className="rdf-nsm-cap">novos convertidos engajados em ≥1 valor</p>
              <button className="rdf-btn primary block"><Plus size={14} /> Registrar engajamento</button>
            </div>

            {/* Solicitações */}
            <div className="rdf-card rdf-list">
              <div className="rdf-card-head">
                <h3 className="rdf-ctitle">Solicitações recentes</h3>
                <button className="rdf-link">Ver todas <ChevronRight size={13} /></button>
              </div>
              {ROWS.map((r) => (
                <div className="rdf-row" key={r.titulo}>
                  <span className={`rdf-tag t-${r.cor}`}>{r.area}</span>
                  <div className="rdf-row-info">
                    <p className="rdf-row-title">{r.titulo}</p>
                    <p className="rdf-row-sub">{r.por}</p>
                  </div>
                  <span className={`rdf-status s-${r.st}`}>{r.statusLabel}</span>
                </div>
              ))}
            </div>

            {/* Próximos cultos */}
            <div className="rdf-card rdf-events">
              <div className="rdf-card-head"><h3 className="rdf-ctitle">Próximos cultos</h3></div>
              {EVENTS.map((e) => (
                <div className="rdf-event" key={e.nome}>
                  <div className="rdf-edate"><b>{e.dia}</b><span>{e.mes}</span></div>
                  <div className="rdf-einfo"><p>{e.nome}</p><span>{e.hora}</span></div>
                  <div className="rdf-team">{e.team.map((t, i) => <span key={i}>{t}</span>)}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Referência */}
          <section className="rdf-card rdf-ref">
            <div className="rdf-card-head">
              <div>
                <h3 className="rdf-ctitle">Sistema de design</h3>
                <p className="rdf-csub">Tipografia · paleta · componentes</p>
              </div>
            </div>
            <div className="rdf-ref-grid">
              <div>
                <p className="rdf-reflabel">Tipografia · Inter</p>
                <p className="rdf-t-display">Display 56 / 800</p>
                <p className="rdf-t-h">Título 20 / 700</p>
                <p className="rdf-t-body">Corpo 14 / 400 — respiro confortável, neutro frio.</p>
                <p className="rdf-t-cap">CAPTION 11 / 700 · TRACKING +0.1EM</p>
              </div>
              <div>
                <p className="rdf-reflabel">Paleta</p>
                <div className="rdf-sw">
                  <Sw name="Teal (marca)" hex="#00B39D" />
                  <Sw name="Teal neon" hex="#1FE6C8" />
                  <Sw name="Fundo" hex="#070809" border />
                  <Sw name="Superfície" hex="#15181C" border />
                  <Sw name="Tinta" hex="#F2F5F7" />
                  <Sw name="Violeta" hex="#8B5CF6" />
                  <Sw name="Âmbar" hex="#F5A524" />
                  <Sw name="Rosa" hex="#F31260" />
                </div>
              </div>
              <div>
                <p className="rdf-reflabel">Componentes</p>
                <div className="rdf-comp">
                  <button className="rdf-btn primary">Primário</button>
                  <button className="rdf-btn ghost">Secundário</button>
                  <div className="rdf-chips">
                    <span className="rdf-tag t-mint">Concluído</span>
                    <span className="rdf-tag t-amber">Pendente</span>
                    <span className="rdf-tag t-rose">Atrasado</span>
                    <span className="rdf-tag t-violet">Marketing</span>
                  </div>
                  <input className="rdf-input" placeholder="Campo de texto" />
                </div>
              </div>
            </div>
          </section>

          <footer className="rdf-footer">Bento · glows · neon teal #1FE6C8 sobre marca #00B39D · números display · raio 22-26px</footer>
        </main>
      </div>
    </div>
  );
}

/* ───────── Subcomponentes ───────── */

/** Todos os gradientes + filtro de glow num único bloco oculto, referenciados por id. */
function RdfDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id="rdfStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00B39D" /><stop offset="100%" stopColor="#1FE6C8" />
        </linearGradient>
        <linearGradient id="rdfGauge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0d8f7f" /><stop offset="60%" stopColor="#00B39D" /><stop offset="100%" stopColor="#1FE6C8" />
        </linearGradient>
        <linearGradient id="rdfRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00B39D" /><stop offset="100%" stopColor="#1FE6C8" />
        </linearGradient>
        <linearGradient id="rdfFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00B39D" stopOpacity="0.35" /><stop offset="100%" stopColor="#00B39D" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="rdfLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00B39D" /><stop offset="100%" stopColor="#1FE6C8" />
        </linearGradient>
        <filter id="rdfGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
    </svg>
  );
}

function NavItem({ icon: Icon, label, active, badge }: { icon: any; label: string; active?: boolean; badge?: string }) {
  return (
    <button className={`rdf-navitem ${active ? 'active' : ''}`}>
      <Icon size={17} /><span>{label}</span>
      {badge && <i className="rdf-navbadge">{badge}</i>}
    </button>
  );
}

function MiniStat({ label, value, delta, up, spark }: { label: string; value: string; delta: string; up?: boolean; spark: number[] }) {
  const max = Math.max(...spark), min = Math.min(...spark);
  const pts = spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${26 - ((v - min) / (max - min || 1)) * 22 - 2}`).join(' ');
  return (
    <div className="rdf-card rdf-mini">
      <p className="rdf-mini-label">{label}</p>
      <p className="rdf-mini-value">{value}</p>
      <div className="rdf-mini-foot">
        <span className={`rdf-trend ${up ? 'up' : 'down'}`}>{up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{delta}</span>
        <svg className="rdf-mini-spark" viewBox="0 0 100 26" preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke="url(#rdfStroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const R = 92, C = Math.PI * R; // semicircle
  const off = C - (value / 100) * C;
  return (
    <div className="rdf-gauge">
      <svg viewBox="0 0 220 130">
        <path d="M18 118 A92 92 0 0 1 202 118" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="14" strokeLinecap="round" />
        <path d="M18 118 A92 92 0 0 1 202 118" fill="none" stroke="url(#rdfGauge)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} filter="url(#rdfGlow)" />
      </svg>
      <div className="rdf-gauge-center">
        <span className="rdf-gauge-num">{value}</span>
        <span className="rdf-gauge-lbl">de 100 · saudável</span>
      </div>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 50, c = 2 * Math.PI * r;
  return (
    <div className="rdf-ring">
      <svg viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="12" />
        <circle cx="65" cy="65" r={r} fill="none" stroke="url(#rdfRing)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} transform="rotate(-90 65 65)" filter="url(#rdfGlow)" />
      </svg>
      <div className="rdf-ring-center"><b>{value}%</b></div>
    </div>
  );
}

function Bars({ data }: { data: number[] }) {
  const max = Math.max(...data);
  return (
    <div className="rdf-bars">
      {data.map((v, i) => (
        <span key={i} className="rdf-bar" style={{ height: `${(v / max) * 100}%`, opacity: i === data.length - 1 ? 1 : 0.45 }} />
      ))}
    </div>
  );
}

function GlowArea() {
  const a = [42, 58, 48, 72, 64, 86, 90, 96];
  const b = [12, 18, 14, 24, 20, 30, 26, 34];
  const W = 600, H = 200, P = 6, max = 110;
  const line = (arr: number[]) => arr.map((v, i) => `${P + (i / (arr.length - 1)) * (W - P * 2)},${H - P - (v / max) * (H - P * 2)}`);
  const area = `M${line(a)[0]} L${line(a).join(' L')} L${W - P},${H - P} L${P},${H - P} Z`;
  return (
    <svg className="rdf-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={P} x2={W - P} y1={H * g} y2={H * g} stroke="rgba(255,255,255,.05)" />)}
      <path d={area} fill="url(#rdfFill)" />
      <polyline points={line(a).join(' ')} fill="none" stroke="url(#rdfLine)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#rdfGlow)" />
      <polyline points={line(b).join(' ')} fill="none" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.85" />
    </svg>
  );
}

function Sw({ name, hex, border }: { name: string; hex: string; border?: boolean }) {
  return (
    <div className="rdf-swatch">
      <span className="rdf-swchip" style={{ background: hex, border: border ? '1px solid rgba(255,255,255,.12)' : 'none' }} />
      <span className="rdf-swname">{name}</span><span className="rdf-swhex">{hex}</span>
    </div>
  );
}

/* ───────── Dados mock ───────── */
const ROWS = [
  { area: 'Cozinha', cor: 'amber', titulo: 'Café · reunião de líderes', por: 'Pedro Paiva · 2h', st: 'pend', statusLabel: 'Pendente' },
  { area: 'TI', cor: 'violet', titulo: 'Acesso ao painel de KPIs', por: 'Lorena · 5h', st: 'prog', statusLabel: 'Em atend.' },
  { area: 'Manut.', cor: 'rose', titulo: 'Ar-condicionado do auditório', por: 'Amaury · ontem', st: 'late', statusLabel: 'Atrasado' },
  { area: 'Reserva', cor: 'mint', titulo: 'Sala 3 · ensaio de louvor', por: 'Renata · ontem', st: 'done', statusLabel: 'Concluído' },
];
const EVENTS = [
  { dia: '28', mes: 'MAI', nome: 'Quarta com Deus', hora: '20:00 · Auditório', team: ['JS', 'PF'] },
  { dia: '31', mes: 'MAI', nome: 'Bridge', hora: '17:00 · Salão', team: ['LX', 'AC'] },
  { dia: '01', mes: 'JUN', nome: 'Domingo 10h', hora: '10:00 · Sede', team: ['MG', 'PP', 'YT'] },
];

/* ───────── Estilos escopados (.rdf) ───────── */
const CSS = `
.rdf {
  --bg:#070809; --bg2:#0B0D10;
  --surface:rgba(255,255,255,.035); --surface-2:rgba(255,255,255,.06);
  --border:rgba(255,255,255,.08); --border-2:rgba(255,255,255,.14);
  --text:#F2F5F7; --text-2:#98A2AB; --text-3:#5A646C;
  --teal:#00B39D; --neon:#1FE6C8; --violet:#8B5CF6;
  font-family:'Inter',-apple-system,sans-serif; min-height:100vh; position:relative;
  background:var(--bg); color:var(--text); overflow-x:hidden;
}
.rdf * { box-sizing:border-box; }

/* fundo decorativo */
.rdf-bg { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
.rdf-blob { position:absolute; border-radius:50%; filter:blur(120px); opacity:.5; }
.rdf-blob-1 { width:520px; height:520px; top:-180px; left:-120px;
  background:radial-gradient(circle,rgba(0,179,157,.45),transparent 70%); }
.rdf-blob-2 { width:480px; height:480px; bottom:-200px; right:-120px;
  background:radial-gradient(circle,rgba(139,92,246,.30),transparent 70%); opacity:.4; }
.rdf-grid { position:absolute; inset:0;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
  background-size:46px 46px; mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,#000,transparent 75%); }

.rdf-banner { position:relative; z-index:2; display:flex; align-items:center; gap:8px;
  padding:9px 20px; font-size:12.5px; color:var(--text-2);
  background:rgba(0,179,157,.07); border-bottom:1px solid var(--border); }
.rdf-banner b { color:var(--text); } .rdf-banner svg { color:var(--neon); }

.rdf-app { position:relative; z-index:1; display:grid; grid-template-columns:240px 1fr; gap:22px;
  padding:22px; max-width:1460px; margin:0 auto; }

/* sidebar */
.rdf-sidebar { position:sticky; top:22px; height:fit-content; display:flex; flex-direction:column; gap:24px;
  background:var(--surface); border:1px solid var(--border); border-radius:24px; padding:22px 15px;
  backdrop-filter:blur(12px); }
.rdf-brand { display:flex; align-items:center; gap:10px; padding:0 6px; }
.rdf-brand-mark { width:34px; height:34px; border-radius:11px; display:grid; place-items:center; color:#04130f;
  background:linear-gradient(135deg,var(--neon),var(--teal)); box-shadow:0 0 22px -4px var(--teal); }
.rdf-brand-name { font-size:18px; font-weight:800; letter-spacing:-.02em; }
.rdf-nav { display:flex; flex-direction:column; gap:4px; }
.rdf-navitem { display:flex; align-items:center; gap:12px; width:100%; text-align:left; cursor:pointer;
  padding:11px 13px; border-radius:13px; border:1px solid transparent; background:transparent;
  color:var(--text-2); font-size:14px; font-weight:600; font-family:inherit; transition:all .15s; }
.rdf-navitem:hover { background:var(--surface-2); color:var(--text); }
.rdf-navitem.active { color:var(--text); border-color:var(--border-2);
  background:linear-gradient(135deg,rgba(0,179,157,.22),rgba(31,230,200,.05));
  box-shadow:inset 0 0 0 1px rgba(31,230,200,.18), 0 8px 24px -12px var(--teal); }
.rdf-navitem.active svg { color:var(--neon); }
.rdf-navbadge { margin-left:auto; font-style:normal; font-size:11px; font-weight:700; padding:1px 8px;
  border-radius:999px; background:rgba(31,230,200,.16); color:var(--neon); }
.rdf-streak { display:flex; align-items:center; gap:11px; padding:13px;
  border:1px solid var(--border); border-radius:16px; background:var(--surface); }
.rdf-streak svg { color:#F5A524; flex-shrink:0; }
.rdf-streak b { display:block; font-size:14px; } .rdf-streak span { font-size:11.5px; color:var(--text-3); }

/* main */
.rdf-main { display:flex; flex-direction:column; gap:22px; min-width:0; }
.rdf-topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.rdf-eyebrow { font-size:12px; font-weight:600; color:var(--text-3); margin:0 0 3px; letter-spacing:.02em; }
.rdf-h1 { font-size:30px; font-weight:800; letter-spacing:-.03em; margin:0;
  background:linear-gradient(120deg,#fff 30%,var(--neon)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.rdf-actions { display:flex; align-items:center; gap:10px; }
.rdf-search { display:flex; align-items:center; gap:8px; padding:9px 13px; border-radius:999px;
  background:var(--surface); border:1px solid var(--border); color:var(--text-3); }
.rdf-search input { border:none; background:transparent; outline:none; color:var(--text); font-size:13.5px; width:140px; font-family:inherit; }
.rdf-search kbd { font-size:10px; font-weight:600; padding:2px 6px; border-radius:6px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-3); }
.rdf-iconbtn { position:relative; width:42px; height:42px; border-radius:13px; display:grid; place-items:center; cursor:pointer;
  background:var(--surface); border:1px solid var(--border); color:var(--text-2); transition:all .15s; }
.rdf-iconbtn:hover { color:var(--neon); border-color:var(--border-2); }
.rdf-iconbtn i { position:absolute; top:9px; right:10px; width:7px; height:7px; border-radius:50%; background:var(--neon); box-shadow:0 0 8px var(--neon); }
.rdf-avatar { width:42px; height:42px; border-radius:13px; display:grid; place-items:center; font-size:13px; font-weight:700; color:#04130f;
  background:linear-gradient(135deg,var(--neon),var(--teal)); }

/* bento */
.rdf-bento { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; grid-auto-flow:dense; }
.rdf-card { background:var(--surface); border:1px solid var(--border); border-radius:22px; padding:20px;
  backdrop-filter:blur(12px); position:relative; overflow:hidden; }
.rdf-card::before { content:''; position:absolute; top:0; left:24px; right:24px; height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent); }
.rdf-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:14px; }
.rdf-card-head svg { color:var(--neon); }
.rdf-ctitle { font-size:15px; font-weight:700; letter-spacing:-.01em; margin:0; }
.rdf-csub { font-size:12px; color:var(--text-3); margin:3px 0 0; }
.rdf-link { display:inline-flex; align-items:center; gap:2px; border:none; background:none; cursor:pointer; font-family:inherit;
  color:var(--neon); font-size:12.5px; font-weight:600; }
.rdf-pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; padding:5px 11px; border-radius:999px;
  background:rgba(31,230,200,.12); color:var(--neon); border:1px solid rgba(31,230,200,.22); }
.rdf-pill.ghost { background:var(--surface-2); color:var(--text-2); border-color:var(--border); }
.rdf-trend { display:inline-flex; align-items:center; gap:2px; font-size:12px; font-weight:700; padding:3px 9px; border-radius:999px; }
.rdf-trend.up { color:#34D399; background:rgba(52,211,153,.12); }
.rdf-trend.down { color:#FB7185; background:rgba(251,113,133,.12); }
.rdf-muted { color:var(--text-3); font-size:12px; }

/* HERO */
.rdf-hero { grid-column:span 2; grid-row:span 2; display:flex; flex-direction:column;
  background:radial-gradient(120% 100% at 0% 0%,rgba(0,179,157,.20),transparent 55%), var(--surface);
  border-color:rgba(31,230,200,.18); box-shadow:0 24px 60px -30px rgba(0,179,157,.6); }
.rdf-hero-top { display:flex; align-items:center; justify-content:space-between; }
.rdf-gauge { position:relative; flex:1; display:grid; place-items:center; margin:6px 0; }
.rdf-gauge svg { width:100%; max-width:300px; height:auto; }
.rdf-gauge-center { position:absolute; bottom:6px; left:0; right:0; text-align:center; }
.rdf-gauge-num { display:block; font-size:60px; font-weight:800; letter-spacing:-.04em; line-height:1;
  background:linear-gradient(120deg,#fff,var(--neon)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.rdf-gauge-lbl { font-size:12px; color:var(--text-3); }
.rdf-hero-foot { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding-top:14px; border-top:1px solid var(--border); }
.rdf-hero-foot div { text-align:center; } .rdf-hero-foot b { display:block; font-size:20px; font-weight:800; letter-spacing:-.02em; }
.rdf-hero-foot span { font-size:11px; color:var(--text-3); }

/* MONEY */
.rdf-money { grid-column:span 2; display:flex; flex-direction:column; gap:10px; }
.rdf-bignum { font-size:52px; font-weight:800; letter-spacing:-.04em; margin:6px 0 0; line-height:1; }
.rdf-bignum small { font-size:28px; color:var(--text-3); font-weight:700; }
.rdf-money-foot { display:flex; align-items:center; gap:8px; }
.rdf-bars { display:flex; align-items:flex-end; gap:7px; height:54px; margin-top:auto; padding-top:8px; }
.rdf-bar { flex:1; border-radius:6px 6px 3px 3px; background:linear-gradient(180deg,var(--neon),var(--teal)); min-height:6px; }

/* MINI */
.rdf-mini { display:flex; flex-direction:column; gap:7px; }
.rdf-mini-label { font-size:12.5px; color:var(--text-3); font-weight:600; margin:0; }
.rdf-mini-value { font-size:28px; font-weight:800; letter-spacing:-.03em; margin:0; }
.rdf-mini-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:auto; }
.rdf-mini-spark { width:62px; height:26px; }

/* CHART */
.rdf-chart-card { grid-column:span 2; }
.rdf-chart { width:100%; height:200px; display:block; }
.rdf-legend { display:flex; gap:18px; margin-top:12px; font-size:12.5px; color:var(--text-2); font-weight:600; }
.rdf-legend span { display:inline-flex; align-items:center; gap:6px; }
.rdf-legend i { width:10px; height:10px; border-radius:3px; }
.rdf-legend .g-teal { background:linear-gradient(90deg,var(--teal),var(--neon)); }
.rdf-legend .g-violet { background:var(--violet); }

/* NSM */
.rdf-nsm { grid-column:span 2; display:flex; flex-direction:column; align-items:center; }
.rdf-ring { position:relative; width:130px; margin:4px auto; }
.rdf-ring svg { width:130px; height:130px; }
.rdf-ring-center { position:absolute; inset:0; display:grid; place-items:center; }
.rdf-ring-center b { font-size:28px; font-weight:800; letter-spacing:-.03em; }
.rdf-nsm-cap { text-align:center; font-size:12px; color:var(--text-3); margin:8px 0 14px; line-height:1.4; }

/* LIST */
.rdf-list { grid-column:span 2; }
.rdf-row { display:flex; align-items:center; gap:11px; padding:11px 8px; border-radius:13px; transition:background .15s; }
.rdf-row:hover { background:var(--surface-2); }
.rdf-row-info { flex:1; min-width:0; }
.rdf-row-title { font-size:13.5px; font-weight:600; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rdf-row-sub { font-size:11.5px; color:var(--text-3); margin:2px 0 0; }
.rdf-tag { font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap; }
.rdf-tag.t-mint { color:#34D399; background:rgba(52,211,153,.14); }
.rdf-tag.t-amber { color:#F5A524; background:rgba(245,165,36,.14); }
.rdf-tag.t-rose { color:#FB7185; background:rgba(251,113,133,.14); }
.rdf-tag.t-violet { color:#A78BFA; background:rgba(139,92,246,.16); }
.rdf-status { font-size:11px; font-weight:600; padding:4px 10px; border-radius:999px; white-space:nowrap; }
.rdf-status.s-done { color:#34D399; background:rgba(52,211,153,.12); }
.rdf-status.s-prog { color:var(--neon); background:rgba(31,230,200,.12); }
.rdf-status.s-pend { color:var(--text-2); background:var(--surface-2); }
.rdf-status.s-late { color:#FB7185; background:rgba(251,113,133,.12); }

/* EVENTS */
.rdf-events { grid-column:span 2; }
.rdf-event { display:flex; align-items:center; gap:12px; padding:9px; border-radius:13px; transition:background .15s; }
.rdf-event:hover { background:var(--surface-2); }
.rdf-edate { width:46px; height:46px; border-radius:13px; flex-shrink:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:rgba(31,230,200,.1); border:1px solid rgba(31,230,200,.18); color:var(--neon); }
.rdf-edate b { font-size:16px; font-weight:800; line-height:1; } .rdf-edate span { font-size:9px; font-weight:700; letter-spacing:.05em; margin-top:2px; }
.rdf-einfo { flex:1; min-width:0; } .rdf-einfo p { font-size:13.5px; font-weight:600; margin:0; } .rdf-einfo span { font-size:11.5px; color:var(--text-3); }
.rdf-team { display:flex; }
.rdf-team span { width:26px; height:26px; border-radius:50%; margin-left:-8px; display:grid; place-items:center; font-size:10px; font-weight:700;
  background:var(--surface-2); border:2px solid #0d0f12; color:var(--text-2); }

/* buttons */
.rdf-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; cursor:pointer; font-family:inherit;
  font-size:13.5px; font-weight:600; padding:11px 18px; border-radius:999px; border:1px solid transparent; transition:all .15s; }
.rdf-btn.block { width:100%; }
.rdf-btn.primary { color:#04130f; background:linear-gradient(135deg,var(--neon),var(--teal)); box-shadow:0 10px 26px -10px var(--teal); }
.rdf-btn.primary:hover { filter:brightness(1.08); transform:translateY(-1px); }
.rdf-btn.ghost { background:var(--surface-2); color:var(--text); border-color:var(--border); }
.rdf-btn.ghost:hover { border-color:var(--border-2); }

/* reference */
.rdf-ref { grid-column:auto; }
.rdf-ref-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:28px; }
.rdf-reflabel { font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-3); margin:0 0 14px; }
.rdf-t-display { font-size:40px; font-weight:800; letter-spacing:-.04em; margin:0 0 8px;
  background:linear-gradient(120deg,#fff,var(--neon)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.rdf-t-h { font-size:20px; font-weight:700; letter-spacing:-.02em; margin:0 0 8px; }
.rdf-t-body { font-size:14px; color:var(--text-2); margin:0 0 8px; line-height:1.6; }
.rdf-t-cap { font-size:11px; font-weight:700; letter-spacing:.1em; color:var(--text-3); margin:0; }
.rdf-sw { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.rdf-swatch { display:flex; align-items:center; gap:8px; }
.rdf-swchip { width:26px; height:26px; border-radius:9px; flex-shrink:0; }
.rdf-swname { font-size:12px; font-weight:600; } .rdf-swhex { font-size:10.5px; color:var(--text-3); margin-left:auto; }
.rdf-comp { display:flex; flex-direction:column; gap:12px; align-items:flex-start; }
.rdf-chips { display:flex; flex-wrap:wrap; gap:7px; }
.rdf-input { width:100%; padding:10px 14px; border-radius:13px; border:1px solid var(--border); background:var(--surface-2);
  color:var(--text); font-size:13.5px; outline:none; font-family:inherit; }
.rdf-input:focus { border-color:var(--neon); box-shadow:0 0 0 3px rgba(31,230,200,.12); }

.rdf-footer { text-align:center; font-size:11.5px; color:var(--text-3); padding:4px 0 14px; }

/* responsivo */
@media (max-width:1100px) {
  .rdf-app { grid-template-columns:1fr; }
  .rdf-sidebar { position:static; }
  .rdf-bento { grid-template-columns:repeat(2,1fr); }
  .rdf-hero, .rdf-money, .rdf-chart-card, .rdf-nsm, .rdf-list, .rdf-events { grid-column:span 2; }
  .rdf-hero { grid-row:auto; }
  .rdf-ref-grid { grid-template-columns:1fr; gap:24px; }
}
@media (max-width:560px) {
  .rdf-bento { grid-template-columns:1fr; }
  .rdf-hero, .rdf-money, .rdf-chart-card, .rdf-nsm, .rdf-list, .rdf-events { grid-column:span 1; }
  .rdf-search input { width:90px; }
}
`;
