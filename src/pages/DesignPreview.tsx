import { useState } from 'react';
import {
  LayoutDashboard, Users, Heart, HandHelping, CalendarDays, BarChart3,
  Settings, Search, Bell, Plus, ArrowUpRight, ArrowDownRight, MoreHorizontal,
  Sun, Moon, ChevronRight, Sparkles, TrendingUp, Church,
} from 'lucide-react';

/**
 * DesignPreview · /design-preview
 *
 * Showcase ISOLADO (não toca nenhuma tela de produção) que adapta a
 * linguagem visual do Rondesignlab pro CBRio: cantos suaves, respiro
 * generoso, tipografia bold com tracking apertado, sombras macias,
 * pílulas e chips pastéis — mantendo o acento teal #00B39D da marca.
 *
 * Toggle Claro / Dark pra comparar as duas variantes lado a lado.
 * Todo o CSS é escopado em `.rdl` pra não vazar pro resto do app.
 */
export default function DesignPreview() {
  const [dark, setDark] = useState(false);

  return (
    <div className={`rdl ${dark ? 'rdl-dark' : 'rdl-light'}`}>
      <style>{CSS}</style>

      {/* Barra de contexto do preview (não faz parte do design proposto) */}
      <div className="rdl-banner">
        <div className="rdl-banner-left">
          <Sparkles size={15} />
          <span><b>Preview de design</b> · estilo Rondesignlab adaptado ao CBRio · ainda não está em produção</span>
        </div>
        <button className="rdl-toggle" onClick={() => setDark((d) => !d)}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
          {dark ? 'Ver versão clara' : 'Ver versão dark'}
        </button>
      </div>

      <div className="rdl-app">
        {/* ── Sidebar flutuante ── */}
        <aside className="rdl-sidebar">
          <div className="rdl-brand">
            <span className="rdl-brand-mark"><Church size={18} /></span>
            <span className="rdl-brand-name">CBRio</span>
          </div>

          <nav className="rdl-nav">
            <span className="rdl-nav-label">Geral</span>
            <NavItem icon={LayoutDashboard} label="Painel" active />
            <NavItem icon={BarChart3} label="Minha área" />
            <NavItem icon={CalendarDays} label="Cultos" badge="4" />
            <span className="rdl-nav-label">Ministerial</span>
            <NavItem icon={Users} label="Membresia" />
            <NavItem icon={Heart} label="Cuidados" />
            <NavItem icon={HandHelping} label="Voluntariado" />
          </nav>

          <div className="rdl-upsell">
            <p className="rdl-upsell-title">Ritual mensal</p>
            <p className="rdl-upsell-sub">3 reuniões aguardando a diretoria esta semana.</p>
            <button className="rdl-btn rdl-btn-light rdl-btn-sm">Abrir ritual</button>
          </div>
        </aside>

        {/* ── Conteúdo ── */}
        <main className="rdl-main">
          {/* Topbar */}
          <header className="rdl-topbar">
            <div>
              <p className="rdl-eyebrow">Quarta-feira · 28 de maio</p>
              <h1 className="rdl-h1">Bom te ver, Marcos 👋</h1>
            </div>
            <div className="rdl-topbar-actions">
              <div className="rdl-search">
                <Search size={15} />
                <input placeholder="Buscar pessoas, cultos, KPIs…" />
                <kbd>⌘K</kbd>
              </div>
              <button className="rdl-icon-btn"><Bell size={17} /><i className="rdl-dot" /></button>
              <div className="rdl-avatar rdl-avatar-me">MP</div>
            </div>
          </header>

          {/* Stat cards */}
          <section className="rdl-stats">
            <Stat label="Frequência total" value="1.667" delta="+13,6%" up spark={[8,10,9,12,11,14,16,15]} />
            <Stat label="Novas decisões" value="42" delta="+8 vs. semana" up spark={[3,5,4,6,5,7,6,9]} />
            <Stat label="NSM engajados" value="78%" delta="meta 85%" up={false} tone="warn" spark={[60,64,62,68,70,72,75,78]} />
            <Stat label="Dízimos do mês" value="R$ 312k" delta="-4,1%" up={false} spark={[40,38,42,39,37,36,35,33]} />
          </section>

          {/* Grid principal */}
          <section className="rdl-grid">
            {/* Coluna esquerda */}
            <div className="rdl-col">
              <div className="rdl-card">
                <div className="rdl-card-head">
                  <div>
                    <h3 className="rdl-card-title">Frequência &amp; decisões</h3>
                    <p className="rdl-card-sub">Últimas 8 semanas · todos os cultos</p>
                  </div>
                  <div className="rdl-seg">
                    <button>Semana</button>
                    <button className="active">Mês</button>
                    <button>Ano</button>
                  </div>
                </div>
                <AreaChart />
                <div className="rdl-legend">
                  <span><i style={{ background: 'var(--accent)' }} /> Frequência</span>
                  <span><i style={{ background: 'var(--violet)' }} /> Decisões</span>
                </div>
              </div>

              <div className="rdl-card">
                <div className="rdl-card-head">
                  <div>
                    <h3 className="rdl-card-title">Solicitações recentes</h3>
                    <p className="rdl-card-sub">Fila administrativa</p>
                  </div>
                  <button className="rdl-link">Ver todas <ChevronRight size={14} /></button>
                </div>
                <div className="rdl-table">
                  {ROWS.map((r) => (
                    <div className="rdl-row" key={r.titulo}>
                      <div className="rdl-row-main">
                        <span className={`rdl-tag rdl-tag-${r.cor}`}>{r.area}</span>
                        <div>
                          <p className="rdl-row-title">{r.titulo}</p>
                          <p className="rdl-row-sub">{r.por}</p>
                        </div>
                      </div>
                      <span className={`rdl-status rdl-status-${r.st}`}>{r.statusLabel}</span>
                      <MoreHorizontal size={16} className="rdl-row-more" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Coluna direita */}
            <div className="rdl-col rdl-col-side">
              <div className="rdl-card rdl-card-accent">
                <div className="rdl-card-head">
                  <h3 className="rdl-card-title">NSM da semana</h3>
                  <TrendingUp size={16} />
                </div>
                <Donut value={78} />
                <p className="rdl-donut-cap">novos convertidos engajados em ≥1 valor</p>
                <button className="rdl-btn rdl-btn-primary rdl-btn-block">
                  <Plus size={15} /> Registrar engajamento
                </button>
              </div>

              <div className="rdl-card">
                <div className="rdl-card-head">
                  <h3 className="rdl-card-title">Próximos cultos</h3>
                </div>
                <div className="rdl-events">
                  {EVENTS.map((e) => (
                    <div className="rdl-event" key={e.nome}>
                      <div className="rdl-event-date"><b>{e.dia}</b><span>{e.mes}</span></div>
                      <div className="rdl-event-info">
                        <p className="rdl-event-name">{e.nome}</p>
                        <p className="rdl-event-time">{e.hora}</p>
                      </div>
                      <div className="rdl-avatars">
                        {e.team.map((t, i) => <span key={i} className="rdl-avatar rdl-avatar-xs">{t}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Referência de estilo ── */}
          <section className="rdl-card rdl-ref">
            <div className="rdl-card-head">
              <div>
                <h3 className="rdl-card-title">Referência do sistema de design</h3>
                <p className="rdl-card-sub">Tipografia, paleta e componentes propostos</p>
              </div>
            </div>

            <div className="rdl-ref-grid">
              <div>
                <p className="rdl-ref-label">Tipografia · Inter</p>
                <p className="rdl-type-display">Display 32 / 800</p>
                <p className="rdl-type-h">Título 20 / 700</p>
                <p className="rdl-type-body">Corpo 14 / 400 — leitura confortável com bastante respiro entre as linhas.</p>
                <p className="rdl-type-cap">CAPTION 11 / 600 · TRACKING +0.08EM</p>
              </div>

              <div>
                <p className="rdl-ref-label">Paleta</p>
                <div className="rdl-swatches">
                  <Swatch name="Teal (marca)" hex="#00B39D" />
                  <Swatch name="Tinta" hex={dark ? '#ECEFF1' : '#11181C'} />
                  <Swatch name="Superfície" hex={dark ? '#171A1D' : '#FFFFFF'} border />
                  <Swatch name="Fundo" hex={dark ? '#0E1113' : '#F5F6F8'} border />
                  <Swatch name="Menta" hex="#16A34A" />
                  <Swatch name="Âmbar" hex="#D97706" />
                  <Swatch name="Rosa" hex="#E11D48" />
                  <Swatch name="Violeta" hex="#7C3AED" />
                </div>
              </div>

              <div>
                <p className="rdl-ref-label">Componentes</p>
                <div className="rdl-comp">
                  <button className="rdl-btn rdl-btn-primary">Botão primário</button>
                  <button className="rdl-btn rdl-btn-light">Secundário</button>
                  <div className="rdl-chips">
                    <span className="rdl-tag rdl-tag-mint">Concluído</span>
                    <span className="rdl-tag rdl-tag-amber">Pendente</span>
                    <span className="rdl-tag rdl-tag-rose">Atrasado</span>
                    <span className="rdl-tag rdl-tag-violet">Marketing</span>
                  </div>
                  <div className="rdl-input">
                    <input placeholder="Campo de texto" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <footer className="rdl-footer">
            Radius 20px · sombras macias · pílulas · acento teal #00B39D mantido · escala 4/8/12/16/24/32
          </footer>
        </main>
      </div>
    </div>
  );
}

/* ─────────────────────────── Subcomponentes ─────────────────────────── */

function NavItem({ icon: Icon, label, active, badge }: { icon: any; label: string; active?: boolean; badge?: string }) {
  return (
    <button className={`rdl-nav-item ${active ? 'active' : ''}`}>
      <Icon size={17} />
      <span>{label}</span>
      {badge && <i className="rdl-nav-badge">{badge}</i>}
    </button>
  );
}

function Stat({ label, value, delta, up, tone, spark }: { label: string; value: string; delta: string; up?: boolean; tone?: string; spark: number[] }) {
  const max = Math.max(...spark), min = Math.min(...spark);
  const pts = spark.map((v, i) => {
    const x = (i / (spark.length - 1)) * 100;
    const y = 28 - ((v - min) / (max - min || 1)) * 24 - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <div className="rdl-stat">
      <p className="rdl-stat-label">{label}</p>
      <div className="rdl-stat-row">
        <span className="rdl-stat-value">{value}</span>
        <svg className="rdl-spark" viewBox="0 0 100 28" preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span className={`rdl-delta ${tone === 'warn' ? 'warn' : up ? 'up' : 'down'}`}>
        {tone === 'warn' ? null : up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
        {delta}
      </span>
    </div>
  );
}

function AreaChart() {
  const a = [42, 55, 48, 70, 62, 84, 90, 86];
  const b = [12, 18, 14, 22, 19, 28, 24, 31];
  const W = 560, H = 180, P = 8;
  const max = 100;
  const line = (arr: number[]) => arr.map((v, i) => {
    const x = P + (i / (arr.length - 1)) * (W - P * 2);
    const y = H - P - (v / max) * (H - P * 2);
    return `${x},${y}`;
  });
  const areaPath = `M${line(a)[0]} L${line(a).join(' L')} L${W - P},${H - P} L${P},${H - P} Z`;
  return (
    <svg className="rdl-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="rdlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={P} x2={W - P} y1={H * g} y2={H * g} stroke="var(--border)" strokeDasharray="3 5" />
      ))}
      <path d={areaPath} fill="url(#rdlFill)" />
      <polyline points={line(a).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line(b).join(' ')} fill="none" stroke="var(--violet)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Donut({ value }: { value: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="rdl-donut">
      <svg viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--track)" strokeWidth="14" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke="var(--accent)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="rdl-donut-center">
        <b>{value}%</b>
      </div>
    </div>
  );
}

function Swatch({ name, hex, border }: { name: string; hex: string; border?: boolean }) {
  return (
    <div className="rdl-swatch">
      <span className="rdl-swatch-chip" style={{ background: hex, border: border ? '1px solid var(--border)' : 'none' }} />
      <span className="rdl-swatch-name">{name}</span>
      <span className="rdl-swatch-hex">{hex}</span>
    </div>
  );
}

/* ─────────────────────────── Dados mock ─────────────────────────── */

const ROWS = [
  { area: 'Cozinha', cor: 'amber', titulo: 'Café para reunião de líderes', por: 'Pedro Paiva · há 2h', st: 'pend', statusLabel: 'Pendente' },
  { area: 'TI', cor: 'violet', titulo: 'Acesso ao painel de KPIs', por: 'Lorena Andrade · há 5h', st: 'prog', statusLabel: 'Em atendimento' },
  { area: 'Manutenção', cor: 'rose', titulo: 'Ar-condicionado do auditório', por: 'Amaury · ontem', st: 'late', statusLabel: 'Atrasado' },
  { area: 'Reserva', cor: 'mint', titulo: 'Sala 3 · ensaio de louvor', por: 'Renata Martins · ontem', st: 'done', statusLabel: 'Concluído' },
];

const EVENTS = [
  { dia: '28', mes: 'MAI', nome: 'Quarta com Deus', hora: '20:00 · Auditório', team: ['JS', 'PF', 'AL'] },
  { dia: '31', mes: 'MAI', nome: 'Bridge', hora: '17:00 · Salão', team: ['LX', 'AC'] },
  { dia: '01', mes: 'JUN', nome: 'Culto Domingo 10h', hora: '10:00 · Sede', team: ['MG', 'PP', 'YT'] },
];

/* ─────────────────────────── Estilos escopados ─────────────────────────── */

const CSS = `
.rdl { --accent:#00B39D; --violet:#7C3AED; font-family:'Inter',-apple-system,sans-serif; min-height:100vh; }
.rdl-light {
  --bg:#F5F6F8; --surface:#FFFFFF; --surface-2:#FBFBFC; --text:#11181C; --text-2:#5B6670;
  --text-3:#97A0A8; --border:#ECEEF1; --accent-soft:rgba(0,179,157,.10); --track:#EFF1F4;
  --shadow:0 1px 2px rgba(16,24,40,.04), 0 10px 28px -16px rgba(16,24,40,.18);
  --shadow-sm:0 1px 2px rgba(16,24,40,.05);
}
.rdl-dark {
  --bg:#0E1113; --surface:#171A1D; --surface-2:#1C2024; --text:#ECEFF1; --text-2:#9AA4AD;
  --text-3:#6B757D; --border:#262B30; --accent-soft:rgba(0,179,157,.16); --track:#262B30;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 14px 32px -18px rgba(0,0,0,.7);
  --shadow-sm:0 1px 2px rgba(0,0,0,.4);
}
.rdl { background:var(--bg); color:var(--text); }
.rdl * { box-sizing:border-box; }

/* Banner */
.rdl-banner { display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:10px 20px; background:var(--surface); border-bottom:1px solid var(--border); flex-wrap:wrap; }
.rdl-banner-left { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-2); }
.rdl-banner-left b { color:var(--text); }
.rdl-banner-left svg { color:var(--accent); }
.rdl-toggle { display:flex; align-items:center; gap:6px; padding:7px 14px; border-radius:999px;
  border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:12.5px;
  font-weight:600; cursor:pointer; transition:all .15s; }
.rdl-toggle:hover { border-color:var(--accent); color:var(--accent); }

/* App shell */
.rdl-app { display:grid; grid-template-columns:248px 1fr; gap:20px; padding:20px; max-width:1400px; margin:0 auto; }

/* Sidebar */
.rdl-sidebar { background:var(--surface); border:1px solid var(--border); border-radius:24px;
  padding:22px 16px; box-shadow:var(--shadow); display:flex; flex-direction:column; gap:22px;
  height:fit-content; position:sticky; top:20px; }
.rdl-brand { display:flex; align-items:center; gap:10px; padding:0 6px; }
.rdl-brand-mark { width:34px; height:34px; border-radius:11px; background:var(--accent);
  color:#fff; display:grid; place-items:center; }
.rdl-brand-name { font-size:18px; font-weight:800; letter-spacing:-.02em; }
.rdl-nav { display:flex; flex-direction:column; gap:3px; }
.rdl-nav-label { font-size:10.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
  color:var(--text-3); padding:12px 10px 5px; }
.rdl-nav-item { display:flex; align-items:center; gap:11px; padding:10px 12px; border-radius:13px;
  border:none; background:transparent; color:var(--text-2); font-size:14px; font-weight:600;
  cursor:pointer; transition:all .15s; text-align:left; width:100%; }
.rdl-nav-item:hover { background:var(--surface-2); color:var(--text); }
.rdl-nav-item.active { background:var(--accent); color:#fff; box-shadow:0 6px 16px -6px var(--accent); }
.rdl-nav-badge { margin-left:auto; font-size:11px; font-weight:700; font-style:normal;
  background:rgba(255,255,255,.25); padding:1px 8px; border-radius:999px; }
.rdl-nav-item:not(.active) .rdl-nav-badge { background:var(--accent-soft); color:var(--accent); }
.rdl-upsell { background:linear-gradient(160deg,var(--accent),#0d8f7f); border-radius:18px;
  padding:16px; color:#fff; }
.rdl-upsell-title { font-size:14px; font-weight:700; margin:0 0 4px; }
.rdl-upsell-sub { font-size:12px; opacity:.9; margin:0 0 12px; line-height:1.4; }

/* Main */
.rdl-main { display:flex; flex-direction:column; gap:20px; min-width:0; }
.rdl-topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.rdl-eyebrow { font-size:12px; font-weight:600; color:var(--text-3); margin:0 0 2px; }
.rdl-h1 { font-size:28px; font-weight:800; letter-spacing:-.025em; margin:0; }
.rdl-topbar-actions { display:flex; align-items:center; gap:10px; }
.rdl-search { display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--border);
  border-radius:999px; padding:9px 14px; box-shadow:var(--shadow-sm); color:var(--text-3); }
.rdl-search input { border:none; background:transparent; outline:none; font-size:13.5px; color:var(--text);
  width:200px; font-family:inherit; }
.rdl-search kbd { font-size:10px; font-weight:600; background:var(--surface-2); border:1px solid var(--border);
  border-radius:6px; padding:2px 6px; color:var(--text-3); }
.rdl-icon-btn { position:relative; width:42px; height:42px; border-radius:13px; border:1px solid var(--border);
  background:var(--surface); color:var(--text-2); display:grid; place-items:center; cursor:pointer;
  box-shadow:var(--shadow-sm); transition:all .15s; }
.rdl-icon-btn:hover { color:var(--accent); border-color:var(--accent); }
.rdl-dot { position:absolute; top:9px; right:10px; width:7px; height:7px; border-radius:50%;
  background:var(--accent); border:2px solid var(--surface); }
.rdl-avatar { border-radius:50%; background:var(--accent-soft); color:var(--accent); font-weight:700;
  display:grid; place-items:center; font-size:13px; }
.rdl-avatar-me { width:42px; height:42px; }
.rdl-avatar-xs { width:26px; height:26px; font-size:10px; border:2px solid var(--surface); margin-left:-8px; }
.rdl-avatars { display:flex; }

/* Stats */
.rdl-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
.rdl-stat { background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:18px;
  box-shadow:var(--shadow-sm); transition:transform .18s, box-shadow .18s; }
.rdl-stat:hover { transform:translateY(-3px); box-shadow:var(--shadow); }
.rdl-stat-label { font-size:12.5px; font-weight:600; color:var(--text-3); margin:0 0 10px; }
.rdl-stat-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.rdl-stat-value { font-size:26px; font-weight:800; letter-spacing:-.03em; }
.rdl-spark { width:64px; height:28px; }
.rdl-delta { display:inline-flex; align-items:center; gap:2px; font-size:12px; font-weight:700;
  margin-top:10px; padding:3px 9px; border-radius:999px; }
.rdl-delta.up { color:#16A34A; background:rgba(22,163,74,.10); }
.rdl-delta.down { color:#E11D48; background:rgba(225,29,72,.10); }
.rdl-delta.warn { color:#D97706; background:rgba(217,119,6,.12); }

/* Grid */
.rdl-grid { display:grid; grid-template-columns:1.7fr 1fr; gap:20px; align-items:start; }
.rdl-col { display:flex; flex-direction:column; gap:20px; min-width:0; }

/* Card */
.rdl-card { background:var(--surface); border:1px solid var(--border); border-radius:24px; padding:22px;
  box-shadow:var(--shadow-sm); }
.rdl-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; }
.rdl-card-title { font-size:16px; font-weight:700; letter-spacing:-.015em; margin:0; }
.rdl-card-sub { font-size:12.5px; color:var(--text-3); margin:3px 0 0; }
.rdl-card-accent .rdl-card-head svg { color:var(--accent); }
.rdl-link { display:inline-flex; align-items:center; gap:2px; border:none; background:transparent;
  color:var(--accent); font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; }
.rdl-seg { display:flex; background:var(--surface-2); border:1px solid var(--border); border-radius:999px; padding:3px; }
.rdl-seg button { border:none; background:transparent; padding:5px 13px; border-radius:999px; font-size:12.5px;
  font-weight:600; color:var(--text-3); cursor:pointer; font-family:inherit; }
.rdl-seg button.active { background:var(--surface); color:var(--text); box-shadow:var(--shadow-sm); }

/* Chart */
.rdl-chart { width:100%; height:180px; display:block; }
.rdl-legend { display:flex; gap:18px; margin-top:14px; font-size:12.5px; color:var(--text-2); font-weight:600; }
.rdl-legend span { display:inline-flex; align-items:center; gap:6px; }
.rdl-legend i { width:10px; height:10px; border-radius:3px; }

/* Table */
.rdl-table { display:flex; flex-direction:column; }
.rdl-row { display:flex; align-items:center; gap:12px; padding:12px 8px; border-radius:14px; transition:background .15s; }
.rdl-row:hover { background:var(--surface-2); }
.rdl-row-main { display:flex; align-items:center; gap:12px; flex:1; min-width:0; }
.rdl-row-title { font-size:13.5px; font-weight:600; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rdl-row-sub { font-size:11.5px; color:var(--text-3); margin:2px 0 0; }
.rdl-row-more { color:var(--text-3); cursor:pointer; flex-shrink:0; }
.rdl-tag { font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap; }
.rdl-tag-mint { color:#16A34A; background:rgba(22,163,74,.12); }
.rdl-tag-amber { color:#D97706; background:rgba(217,119,6,.13); }
.rdl-tag-rose { color:#E11D48; background:rgba(225,29,72,.11); }
.rdl-tag-violet { color:#7C3AED; background:rgba(124,58,237,.12); }
.rdl-status { font-size:11.5px; font-weight:600; padding:4px 11px; border-radius:999px; white-space:nowrap; flex-shrink:0; }
.rdl-status-done { color:#16A34A; background:rgba(22,163,74,.10); }
.rdl-status-prog { color:var(--accent); background:var(--accent-soft); }
.rdl-status-pend { color:var(--text-2); background:var(--surface-2); border:1px solid var(--border); }
.rdl-status-late { color:#E11D48; background:rgba(225,29,72,.10); }

/* Side */
.rdl-col-side .rdl-card-accent { background:linear-gradient(165deg,var(--surface),var(--surface-2)); }
.rdl-donut { position:relative; width:140px; margin:6px auto 0; }
.rdl-donut svg { width:140px; height:140px; }
.rdl-donut-center { position:absolute; inset:0; display:grid; place-items:center; }
.rdl-donut-center b { font-size:30px; font-weight:800; letter-spacing:-.03em; }
.rdl-donut-cap { text-align:center; font-size:12px; color:var(--text-3); margin:8px 0 16px; line-height:1.4; }
.rdl-events { display:flex; flex-direction:column; gap:6px; }
.rdl-event { display:flex; align-items:center; gap:12px; padding:9px; border-radius:14px; transition:background .15s; }
.rdl-event:hover { background:var(--surface-2); }
.rdl-event-date { width:44px; height:44px; border-radius:13px; background:var(--accent-soft); color:var(--accent);
  display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; }
.rdl-event-date b { font-size:15px; font-weight:800; line-height:1; }
.rdl-event-date span { font-size:9px; font-weight:700; letter-spacing:.05em; margin-top:2px; }
.rdl-event-info { flex:1; min-width:0; }
.rdl-event-name { font-size:13.5px; font-weight:600; margin:0; }
.rdl-event-time { font-size:11.5px; color:var(--text-3); margin:2px 0 0; }

/* Buttons */
.rdl-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; border-radius:999px;
  font-size:13.5px; font-weight:600; cursor:pointer; padding:11px 18px; border:1px solid transparent;
  font-family:inherit; transition:all .15s; }
.rdl-btn-sm { padding:8px 14px; font-size:12.5px; }
.rdl-btn-block { width:100%; }
.rdl-btn-primary { background:var(--accent); color:#fff; box-shadow:0 8px 18px -8px var(--accent); }
.rdl-btn-primary:hover { filter:brightness(1.05); transform:translateY(-1px); }
.rdl-btn-light { background:rgba(255,255,255,.18); color:#fff; border-color:rgba(255,255,255,.3); }
.rdl-comp .rdl-btn-light { background:var(--surface-2); color:var(--text); border-color:var(--border); }
.rdl-btn-light:hover { filter:brightness(1.05); }

/* Reference */
.rdl-ref-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:28px; }
.rdl-ref-label { font-size:10.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
  color:var(--text-3); margin:0 0 14px; }
.rdl-type-display { font-size:30px; font-weight:800; letter-spacing:-.03em; margin:0 0 8px; }
.rdl-type-h { font-size:20px; font-weight:700; letter-spacing:-.02em; margin:0 0 8px; }
.rdl-type-body { font-size:14px; color:var(--text-2); margin:0 0 8px; line-height:1.6; }
.rdl-type-cap { font-size:11px; font-weight:600; letter-spacing:.08em; color:var(--text-3); margin:0; }
.rdl-swatches { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.rdl-swatch { display:flex; align-items:center; gap:8px; }
.rdl-swatch-chip { width:26px; height:26px; border-radius:9px; flex-shrink:0; }
.rdl-swatch-name { font-size:12px; font-weight:600; }
.rdl-swatch-hex { font-size:10.5px; color:var(--text-3); margin-left:auto; }
.rdl-comp { display:flex; flex-direction:column; gap:12px; align-items:flex-start; }
.rdl-chips { display:flex; flex-wrap:wrap; gap:7px; }
.rdl-input { width:100%; }
.rdl-input input { width:100%; padding:10px 14px; border-radius:13px; border:1px solid var(--border);
  background:var(--surface-2); color:var(--text); font-size:13.5px; outline:none; font-family:inherit; }
.rdl-input input:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }

.rdl-footer { text-align:center; font-size:11.5px; color:var(--text-3); padding:6px 0 12px; }

/* Responsivo */
@media (max-width:1080px) {
  .rdl-app { grid-template-columns:1fr; }
  .rdl-sidebar { position:static; }
  .rdl-grid { grid-template-columns:1fr; }
  .rdl-stats { grid-template-columns:repeat(2,1fr); }
  .rdl-ref-grid { grid-template-columns:1fr; gap:24px; }
}
@media (max-width:560px) {
  .rdl-stats { grid-template-columns:1fr; }
  .rdl-search input { width:120px; }
}
`;
