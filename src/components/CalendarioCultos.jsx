// ============================================================================
// CalendarioCultos — Lista cultos do mes com status de preenchimento
// Click num culto abre modal para preencher os campos nativos da tabela `cultos`.
// Usado em /minha-area (aba Dados) como forma principal de entrada de dados de culto.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { kpis as kpisApi } from '../api';

const cultosApi = kpisApi.cultos;
import { Calendar, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, X, Save, Tv, Users, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { formatErro } from '../lib/formatErro';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Retorna o domingo da semana de uma data (semana comeca no domingo)
function inicioSemana(d) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - c.getDay()); // c.getDay()=0 (dom) → fica
  return c;
}

function rangeSemana(domingo) {
  const fim = new Date(domingo);
  fim.setDate(fim.getDate() + 6);
  return { inicio: toISO(domingo), fim: toISO(fim) };
}

// Gera array de 7 datas (Dom→Sáb) da semana
function diasDaSemana(domingo) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(domingo);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function mesmoDia(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function preenchido(c) {
  return (
    (c.presencial_adulto || 0) > 0 ||
    (c.presencial_kids || 0) > 0 ||
    (c.decisoes_presenciais || 0) > 0 ||
    (c.decisoes_online || 0) > 0 ||
    (c.online_pico || 0) > 0
  );
}

function formataDataCurta(dataStr) {
  const [y, m, d] = dataStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { dia: dt.getDate(), diaSemana: DIAS[dt.getDay()] };
}

export default function CalendarioCultos() {
  const hoje = new Date();
  const [semanaInicio, setSemanaInicio] = useState(() => inicioSemana(hoje));
  const [cultos, setCultos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const dias = useMemo(() => diasDaSemana(semanaInicio), [semanaInicio]);
  const ehSemanaAtual = mesmoDia(semanaInicio, inicioSemana(hoje));

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { inicio, fim } = rangeSemana(semanaInicio);
      const data = await cultosApi.list({ data_inicio: inicio, data_fim: fim, limit: 50 });
      setCultos(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(formatErro(e, 'cultos'));
      setCultos([]);
    } finally {
      setLoading(false);
    }
  }, [semanaInicio]);

  useEffect(() => { carregar(); }, [carregar]);

  const irSemana = (delta) => {
    const novo = new Date(semanaInicio);
    novo.setDate(novo.getDate() + delta * 7);
    setSemanaInicio(novo);
  };
  const voltarHoje = () => setSemanaInicio(inicioSemana(new Date()));

  // Tipos unicos pro filtro (a partir dos cultos do mes)
  const tiposDisponiveis = useMemo(() => {
    const map = new Map();
    cultos.forEach(c => {
      if (c.service_type_name) {
        map.set(c.service_type_name, c.service_type_color || C.primary);
      }
    });
    return Array.from(map.entries()).map(([nome, cor]) => ({ nome, cor }));
  }, [cultos]);

  const cultosFiltrados = useMemo(() => {
    if (filtroTipo === 'todos') return cultos;
    return cultos.filter(c => c.service_type_name === filtroTipo);
  }, [cultos, filtroTipo]);

  const { totalPreenchidos, totalPendentes } = useMemo(() => {
    let p = 0, n = 0;
    cultosFiltrados.forEach(c => { preenchido(c) ? p++ : n++; });
    return { totalPreenchidos: p, totalPendentes: n };
  }, [cultosFiltrados]);

  const ultimoDiaSemana = dias[6];
  const labelSemana =
    semanaInicio.getMonth() === ultimoDiaSemana.getMonth()
      ? `${semanaInicio.getDate()} – ${ultimoDiaSemana.getDate()} ${MESES[semanaInicio.getMonth()]} ${semanaInicio.getFullYear()}`
      : `${semanaInicio.getDate()} ${MESES_CURTO[semanaInicio.getMonth()]} – ${ultimoDiaSemana.getDate()} ${MESES_CURTO[ultimoDiaSemana.getMonth()]} ${ultimoDiaSemana.getFullYear()}`;

  return (
    <section style={{ marginBottom: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          <Calendar size={11} style={{ color: C.primary }} /> Cultos da semana
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => irSemana(-1)} title="Semana anterior" style={btnNav}>
            <ChevronLeft size={14} />
          </button>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 180, textAlign: 'center' }}>
            {labelSemana}
          </div>
          <button onClick={() => irSemana(1)} title="Próxima semana" style={btnNav}>
            <ChevronRight size={14} />
          </button>
          {!ehSemanaAtual && (
            <button onClick={voltarHoje} style={{ ...btnNav, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: C.primary, borderColor: C.primary }}>
              Hoje
            </button>
          )}
        </div>
      </header>

      {!loading && cultos.length > 0 && (
        <>
          {/* Filtro por tipo de culto · chips clicaveis */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <button
              onClick={() => setFiltroTipo('todos')}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99, cursor: 'pointer',
                border: `1px solid ${filtroTipo === 'todos' ? C.primary : C.border}`,
                background: filtroTipo === 'todos' ? C.primaryBg : 'transparent',
                color: filtroTipo === 'todos' ? C.primary : C.t2,
              }}
            >Todos ({cultos.length})</button>
            {tiposDisponiveis.map(t => {
              const sel = filtroTipo === t.nome;
              const count = cultos.filter(c => c.service_type_name === t.nome).length;
              return (
                <button key={t.nome} onClick={() => setFiltroTipo(t.nome)} style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99, cursor: 'pointer',
                  border: `1px solid ${sel ? t.cor : C.border}`,
                  background: sel ? `${t.cor}18` : 'transparent',
                  color: sel ? t.cor : C.t2,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.cor }} />
                  {t.nome} ({count})
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11, color: C.t3 }}>
            <span><strong style={{ color: '#10B981' }}>{totalPreenchidos}</strong> preenchidos</span>
            <span><strong style={{ color: '#F59E0B' }}>{totalPendentes}</strong> pendentes</span>
          </div>
        </>
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.t3, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
          Carregando cultos da semana...
        </div>
      ) : (
        <GradeSemanal
          dias={dias}
          cultos={cultosFiltrados}
          hoje={hoje}
          onClickCulto={setEditando}
        />
      )}

      {editando && (
        <ModalCulto
          culto={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); carregar(); }}
        />
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// GradeSemanal — 7 colunas (Dom-Sab) com cultos empilhados por dia
// ----------------------------------------------------------------------------
function GradeSemanal({ dias, cultos, hoje, onClickCulto }) {
  const porDia = useMemo(() => {
    const map = new Map();
    dias.forEach(d => map.set(toISO(d), []));
    cultos.forEach(c => {
      if (map.has(c.data)) map.get(c.data).push(c);
    });
    // Ordena cultos do mesmo dia por hora
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    }
    return map;
  }, [dias, cultos]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {dias.map((d, idx) => {
        const isoData = toISO(d);
        const cultosDoDia = porDia.get(isoData) || [];
        const ehHoje = mesmoDia(d, hoje);
        const ehFimSemana = d.getDay() === 0 || d.getDay() === 6;
        return (
          <div key={isoData} style={{
            background: ehHoje ? C.primaryBg : C.card,
            border: `1px solid ${ehHoje ? C.primary : C.border}`,
            borderRadius: 8, padding: 8, minHeight: 140,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ textAlign: 'center', borderBottom: `1px dashed ${C.border}`, paddingBottom: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: ehHoje ? C.primary : C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {DIAS[idx]}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: ehHoje ? C.primary : C.text, lineHeight: 1 }}>
                {d.getDate()}
              </div>
            </div>
            {cultosDoDia.length === 0 ? (
              <div style={{ fontSize: 10, color: C.t3, textAlign: 'center', padding: 14, fontStyle: 'italic' }}>
                {ehFimSemana || d.getDay() === 3 ? '—' : 'sem culto'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cultosDoDia.map(c => <MiniCardCulto key={c.id} culto={c} onClick={() => onClickCulto(c)} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// MiniCardCulto · compacto pra caber na coluna da semana
function MiniCardCulto({ culto, onClick }) {
  const ok = preenchido(culto);
  const cor = culto.service_type_color || C.primary;
  const tipo = culto.service_type_name || culto.nome;

  return (
    <button onClick={onClick} style={{
      textAlign: 'left', padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
      background: ok ? `${cor}10` : C.inputBg,
      border: `1px solid ${ok ? cor : C.border}`,
      borderLeft: `3px solid ${cor}`,
      display: 'flex', flexDirection: 'column', gap: 2,
      transition: 'transform 0.1s, box-shadow 0.1s',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: cor }}>{culto.hora?.slice(0, 5) || '--:--'}</span>
        {ok ? (
          <CheckCircle2 size={11} style={{ color: '#10B981' }} />
        ) : (
          <AlertCircle size={11} style={{ color: '#F59E0B' }} />
        )}
      </div>
      <span style={{ fontSize: 10, color: C.text, fontWeight: 600, lineHeight: 1.2 }}>
        {tipo}
      </span>
      {ok && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 1 }}>
          {((culto.presencial_adulto || 0) + (culto.presencial_kids || 0)) > 0 && (
            <span style={{ fontSize: 9, color: C.t3 }}>
              {(culto.presencial_adulto || 0) + (culto.presencial_kids || 0)} pres
            </span>
          )}
          {((culto.decisoes_presenciais || 0) + (culto.decisoes_online || 0)) > 0 && (
            <span style={{ fontSize: 9, color: '#8B5CF6' }}>
              · {(culto.decisoes_presenciais || 0) + (culto.decisoes_online || 0)} dec
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ----------------------------------------------------------------------------
// CardCulto — visual antigo (mantido pra fallback, nao usado na visao semanal)
// ----------------------------------------------------------------------------
function CardCulto({ culto, onClick }) {
  const { dia, diaSemana } = formataDataCurta(culto.data);
  const ok = preenchido(culto);
  const cor = culto.service_type_color || C.primary;

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer',
        background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cor}`,
        display: 'flex', flexDirection: 'column', gap: 8, minHeight: 110,
        transition: 'border-color 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = cor; e.currentTarget.style.borderLeftColor = cor; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.borderLeftColor = cor; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1 }}>{dia}</span>
          <span style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{diaSemana}</span>
          <span style={{ fontSize: 10, color: C.t3 }}>· {culto.hora?.slice(0, 5)}</span>
        </div>
        {ok ? (
          <span title="Preenchido" style={{ color: '#10B981', display: 'inline-flex' }}>
            <CheckCircle2 size={14} />
          </span>
        ) : (
          <span title="Pendente de preenchimento" style={{ color: '#F59E0B', display: 'inline-flex' }}>
            <AlertCircle size={14} />
          </span>
        )}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
        {culto.nome}
        {culto.service_type_name && (
          <span style={{ fontSize: 10, fontWeight: 500, color: C.t3, display: 'block', marginTop: 1 }}>
            {culto.service_type_name}
          </span>
        )}
      </div>

      {ok ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: C.t2, marginTop: 'auto' }}>
          {(culto.presencial_adulto || 0) > 0 && (
            <Chip cor="#3B82F6" icone={Users} valor={culto.presencial_adulto} label="adultos" />
          )}
          {(culto.presencial_kids || 0) > 0 && (
            <Chip cor="#EC4899" icone={Users} valor={culto.presencial_kids} label="kids" />
          )}
          {((culto.decisoes_presenciais || 0) + (culto.decisoes_online || 0)) > 0 && (
            <Chip
              cor="#8B5CF6"
              icone={Sparkles}
              valor={(culto.decisoes_presenciais || 0) + (culto.decisoes_online || 0)}
              label="decisões"
            />
          )}
          {(culto.online_pico || 0) > 0 && (
            <Chip cor="#F59E0B" icone={Tv} valor={culto.online_pico} label="online" />
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.t3, marginTop: 'auto' }}>Clique para preencher</div>
      )}
    </button>
  );
}

function Chip({ cor, icone: Icone, valor, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 6px', borderRadius: 99, background: `${cor}18`, color: cor,
      fontSize: 10, fontWeight: 600,
    }}>
      <Icone size={9} /> {Number(valor).toLocaleString('pt-BR')} {label}
    </span>
  );
}

// ----------------------------------------------------------------------------
// ModalCulto — preenche/edita os campos nativos do culto
// ----------------------------------------------------------------------------
function ModalCulto({ culto, onClose, onSaved }) {
  const [form, setForm] = useState({
    presencial_adulto:    culto.presencial_adulto ?? 0,
    presencial_kids:      culto.presencial_kids ?? 0,
    decisoes_presenciais: culto.decisoes_presenciais ?? 0,
    decisoes_online:      culto.decisoes_online ?? 0,
    online_pico:          culto.online_pico ?? '',
    online_ds:            culto.online_ds ?? '',
    online_ddus:          culto.online_ddus ?? '',
    youtube_video_id:     culto.youtube_video_id ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        presencial_adulto:    Number(form.presencial_adulto) || 0,
        presencial_kids:      Number(form.presencial_kids) || 0,
        decisoes_presenciais: Number(form.decisoes_presenciais) || 0,
        decisoes_online:      Number(form.decisoes_online) || 0,
        online_pico:          form.online_pico === '' ? null : Number(form.online_pico),
        online_ds:            form.online_ds === '' ? null : Number(form.online_ds),
        online_ddus:          form.online_ddus === '' ? null : Number(form.online_ddus),
        youtube_video_id:     form.youtube_video_id.trim() || null,
      };
      await cultosApi.update(culto.id, payload);
      toast.success('Culto atualizado');
      onSaved?.();
    } catch (e) {
      toast.error(formatErro(e, 'culto'));
    } finally {
      setSaving(false);
    }
  };

  const { dia, diaSemana } = formataDataCurta(culto.data);

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()}
        style={{ background: C.modalBg, borderRadius: 12, maxWidth: 560, width: '100%', maxHeight: '92vh', overflow: 'auto' }}
      >
        <header style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.text }}>
              {culto.nome}
            </h2>
            <p style={{ fontSize: 11, color: C.t3, margin: '4px 0 0', textTransform: 'capitalize' }}>
              {diaSemana} · {dia} {MESES[Number(culto.data.split('-')[1]) - 1]} {culto.data.split('-')[0]}
              {culto.hora && <> · {culto.hora.slice(0, 5)}</>}
              {culto.service_type_name && <> · {culto.service_type_name}</>}
            </p>
          </div>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}>
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: 16 }}>
          <SecaoTitulo icone={Users} cor="#3B82F6" titulo="Frequência presencial" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <Field label="Adultos">
              <input type="number" min="0" value={form.presencial_adulto} onChange={e => set('presencial_adulto', e.target.value)} style={inp} autoFocus />
            </Field>
            <Field label="Kids">
              <input type="number" min="0" value={form.presencial_kids} onChange={e => set('presencial_kids', e.target.value)} style={inp} />
            </Field>
          </div>

          <SecaoTitulo icone={Sparkles} cor="#8B5CF6" titulo="Decisões / conversões" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <Field label="Presenciais">
              <input type="number" min="0" value={form.decisoes_presenciais} onChange={e => set('decisoes_presenciais', e.target.value)} style={inp} />
            </Field>
            <Field label="Online">
              <input type="number" min="0" value={form.decisoes_online} onChange={e => set('decisoes_online', e.target.value)} style={inp} />
            </Field>
          </div>

          <SecaoTitulo icone={Tv} cor="#F59E0B" titulo="Transmissão online" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <Field label="Pico online (simultâneos)">
              <input type="number" min="0" value={form.online_pico} onChange={e => set('online_pico', e.target.value)} style={inp} placeholder="Opcional" />
            </Field>
            <Field label="YouTube Video ID">
              <input type="text" value={form.youtube_video_id} onChange={e => set('youtube_video_id', e.target.value)} style={inp} placeholder="Opcional" />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label={`DS · views D+1${culto.ds_coletado_em ? ' (auto)' : ''}`}>
              <input
                type="number" min="0"
                value={form.online_ds}
                onChange={e => set('online_ds', e.target.value)}
                style={inp}
                placeholder="Manual ou auto via YouTube"
              />
            </Field>
            <Field label={`DDUS · views on-demand D+7${culto.ddus_coletado_em ? ' (auto)' : ''}`}>
              <input
                type="number" min="0"
                value={form.online_ddus}
                onChange={e => set('online_ddus', e.target.value)}
                style={inp}
                placeholder="Manual ou auto via YouTube"
              />
            </Field>
          </div>

          <p style={{ fontSize: 10, color: C.t3, marginTop: 10, fontStyle: 'italic' }}>
            DS (Daily Stream · views D+1 às 10h) e DDUS (Daily Demand Users · views on-demand
            até D+7) são coletadas automaticamente quando o YouTube Video ID está preenchido.
            Você pode editar manualmente se quiser sobrescrever.
          </p>
        </div>

        <footer style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SecaoTitulo({ icone: Icone, cor, titulo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
      <Icone size={11} /> {titulo}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}

const inp = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
  fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit',
};
const btnNav = {
  padding: 6, borderRadius: 6, background: C.card, color: C.t2,
  border: `1px solid ${C.border}`, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const btnPrimary = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
  background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const btnGhost = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer',
};
