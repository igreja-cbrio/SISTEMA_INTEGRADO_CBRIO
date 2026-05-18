// ============================================================================
// CalendarioCultos — Lista cultos do mes com status de preenchimento
// Click num culto abre modal para preencher os campos nativos da tabela `cultos`.
// Usado em /minha-area (aba Dados) como forma principal de entrada de dados de culto.
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { kpis as kpisApi } from '../api';

const cultosApi = kpisApi.cultos;
import { Calendar, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, X, Save, Tv, Users, Sparkles, UserPlus, Trash2, Pencil, Search as SearchIcon, Link as LinkIcon } from 'lucide-react';
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
  // Config vinda do service_type · default conservador (presencial · sem kids · sem online)
  // pra cobrir cultos avulsos sem service_type_id setado
  const presencialLabel = culto.service_type_presencial_label || 'Presencial';
  const hasKids   = culto.service_type_has_kids   ?? false;
  const hasOnline = culto.service_type_has_online ?? false;

  // Valores iniciais (preservados pra detectar dirty)
  const valoresIniciaisRef = useRef({
    presencial_adulto:    culto.presencial_adulto ?? 0,
    presencial_kids:      culto.presencial_kids ?? 0,
    decisoes_presenciais: culto.decisoes_presenciais ?? 0,
    decisoes_online:      culto.decisoes_online ?? 0,
    decisoes_kids:        culto.decisoes_kids ?? 0,
    online_pico:          culto.online_pico ?? '',
    online_ds:            culto.online_ds ?? '',
    online_ddus:          culto.online_ddus ?? '',
    youtube_video_id:     culto.youtube_video_id ?? '',
  });

  const [form, setForm] = useState({ ...valoresIniciaisRef.current });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Detecta alteracoes nao salvas pra avisar antes de fechar
  // Marcos: "voce clica fora e zera tudo no meio da operacao"
  const isDirty = useMemo(() => {
    const orig = valoresIniciaisRef.current;
    return Object.keys(orig).some(k => String(orig[k] ?? '') !== String(form[k] ?? ''));
  }, [form]);

  const tentarFechar = useCallback(() => {
    if (saving) return; // nao fecha durante salvamento
    if (isDirty) {
      const ok = window.confirm(
        'Tem dados preenchidos que ainda não foram salvos.\n\n'
        + 'Tem certeza que quer fechar e perder essas alterações?'
      );
      if (!ok) return;
    }
    onClose?.();
  }, [isDirty, onClose, saving]);

  // ESC tambem usa tentarFechar
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') tentarFechar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tentarFechar]);

  const submit = async () => {
    setSaving(true);
    try {
      // Zera campos que esse tipo de culto nao usa · evita lixo no banco
      // se alguem editou e depois o tipo mudou de config
      const payload = {
        presencial_adulto:    Number(form.presencial_adulto) || 0,
        presencial_kids:      hasKids ? (Number(form.presencial_kids) || 0) : 0,
        decisoes_presenciais: Number(form.decisoes_presenciais) || 0,
        decisoes_online:      hasOnline ? (Number(form.decisoes_online) || 0) : 0,
        decisoes_kids:        hasKids ? (Number(form.decisoes_kids) || 0) : 0,
        online_pico:          hasOnline ? (form.online_pico === '' ? null : Number(form.online_pico)) : null,
        online_ds:            hasOnline ? (form.online_ds === '' ? null : Number(form.online_ds)) : null,
        online_ddus:          hasOnline ? (form.online_ddus === '' ? null : Number(form.online_ddus)) : null,
        youtube_video_id:     hasOnline ? (form.youtube_video_id.trim() || null) : null,
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
    <div onClick={tentarFechar}
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
              {isDirty && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: '#F59E0B22', color: '#B45309', letterSpacing: 0.3 }}>NÃO SALVO</span>}
            </h2>
            <p style={{ fontSize: 11, color: C.t3, margin: '4px 0 0', textTransform: 'capitalize' }}>
              {diaSemana} · {dia} {MESES[Number(culto.data.split('-')[1]) - 1]} {culto.data.split('-')[0]}
              {culto.hora && <> · {culto.hora.slice(0, 5)}</>}
              {culto.service_type_name && <> · {culto.service_type_name}</>}
            </p>
          </div>
          <button onClick={tentarFechar} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}>
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: 16 }}>
          <SecaoTitulo icone={Users} cor="#3B82F6" titulo="Frequência presencial" />
          <div style={{ display: 'grid', gridTemplateColumns: hasKids ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 16 }}>
            <Field label={presencialLabel}>
              <input type="number" min="0" value={form.presencial_adulto} onChange={e => set('presencial_adulto', e.target.value)} style={inp} autoFocus />
            </Field>
            {hasKids && (
              <Field label="Kids">
                <input type="number" min="0" value={form.presencial_kids} onChange={e => set('presencial_kids', e.target.value)} style={inp} />
              </Field>
            )}
          </div>

          <SecaoTitulo icone={Sparkles} cor="#8B5CF6" titulo="Decisões / conversões" />
          {(() => {
            // Layout adaptativo conforme o tipo de culto:
            //   presencial só:           1 coluna (Presenciais)
            //   presencial + online:     2 colunas
            //   presencial + kids:       2 colunas (Presenciais + Kids)
            //   presencial + online+kids: 3 colunas
            const cols = (hasOnline ? 1 : 0) + (hasKids ? 1 : 0) + 1;
            const grid = ['1fr', '1fr 1fr', '1fr 1fr 1fr'][cols - 1];
            return (
              <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, marginBottom: 12 }}>
                <Field label={(hasOnline || hasKids) ? 'Presenciais' : 'Decisões'}>
                  <input type="number" min="0" value={form.decisoes_presenciais} onChange={e => set('decisoes_presenciais', e.target.value)} style={inp} />
                </Field>
                {hasOnline && (
                  <Field label="Online">
                    <input type="number" min="0" value={form.decisoes_online} onChange={e => set('decisoes_online', e.target.value)} style={inp} />
                  </Field>
                )}
                {hasKids && (
                  <Field label="Kids">
                    <input type="number" min="0" value={form.decisoes_kids} onChange={e => set('decisoes_kids', e.target.value)} style={inp} />
                  </Field>
                )}
              </div>
            );
          })()}

          {/* Dados individuais das pessoas que decidiram */}
          <DecisoesPessoasSection
            cultoId={culto.id}
            totalEsperado={(Number(form.decisoes_presenciais) || 0) + (hasOnline ? (Number(form.decisoes_online) || 0) : 0)}
            totalKidsEsperado={hasKids ? (Number(form.decisoes_kids) || 0) : 0}
            hasOnline={hasOnline}
            hasKids={hasKids}
          />

          {hasOnline && (
            <>
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
            </>
          )}
        </div>

        <footer style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={tentarFechar} disabled={saving} style={btnGhost}>Cancelar</button>
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

// ============================================================================
// DecisoesPessoasSection · captura nome/contato de cada pessoa que decidiu
//
// Marcos: "sempre que for preenchido as decisoes de pessoas, tenha um campo
//          para ser inserido os dados de cada um que toma essa decisao em
//          todos os cultos".
//
// UX:
// - Mostra contador "X de Y registradas" baseado no valor de decisoes_presenciais
//   + decisoes_online (totalEsperado) e quantas pessoas ja foram registradas
// - Botao "+ Adicionar pessoa" abre form inline (nome obrigatorio, resto
//   opcional · CPF tenta vincular a mem_membros existente no backend)
// - Lista as pessoas ja registradas · click pra editar/remover
// ============================================================================
function DecisoesPessoasSection({ cultoId, totalEsperado, totalKidsEsperado = 0, hasOnline, hasKids }) {
  const [pessoas, setPessoas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null); // id da pessoa em edicao

  const carregar = useCallback(async () => {
    if (!cultoId) return;
    setLoading(true);
    try {
      const data = await cultosApi.decisoesPessoas.list(cultoId);
      setPessoas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[decisoes-pessoas]', e);
    } finally {
      setLoading(false);
    }
  }, [cultoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const handleSaved = () => {
    setShowForm(false);
    setEditando(null);
    carregar();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remover registro desta pessoa?')) return;
    try {
      await cultosApi.decisoesPessoas.remove(id);
      toast.success('Removido');
      carregar();
    } catch (e) { toast.error(formatErro(e)); }
  };

  // Contadores separados · kids tem fluxo proprio (sem trilha/NSM)
  const pessoasAdultos = pessoas.filter(p => p.tipo_decisao !== 'kids');
  const pessoasKids    = pessoas.filter(p => p.tipo_decisao === 'kids');
  const registradas    = pessoasAdultos.length;
  const registradasKids = pessoasKids.length;
  const faltando       = Math.max(0, totalEsperado - registradas);
  const faltandoKids   = Math.max(0, totalKidsEsperado - registradasKids);
  const completo       = totalEsperado > 0 && registradas >= totalEsperado;

  // Sempre mostra a secao (mesmo sem decisoes preenchidas) pra ficar visivel
  // como funcionalidade · so esconde quando culto ainda nao foi salvo

  return (
    <div style={{
      marginBottom: 16, padding: 12, borderRadius: 8,
      background: 'linear-gradient(to bottom right, #8B5CF608, var(--cbrio-input-bg))',
      border: `2px solid ${faltando > 0 ? '#8B5CF6' : C.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#8B5CF6' }}>
            <UserPlus size={13} /> Dados das pessoas que decidiram Jesus
          </div>
          <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
            Nome + telefone bastam · CPF e nascimento podem ser preenchidos depois (censo)
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: completo ? '#10B981' : faltando > 0 ? '#F59E0B' : C.t3, whiteSpace: 'nowrap', textAlign: 'right' }}>
          <div>
            {registradas} de {totalEsperado || registradas} registrada{registradas === 1 ? '' : 's'}
            {faltando > 0 && ` · faltam ${faltando}`}
          </div>
          {hasKids && totalKidsEsperado > 0 && (
            <div style={{ fontSize: 10, color: '#EC4899', marginTop: 2 }}>
              Kids: {registradasKids} de {totalKidsEsperado}
              {faltandoKids > 0 && ` · faltam ${faltandoKids}`}
            </div>
          )}
        </div>
      </div>
      {totalEsperado === 0 && registradas === 0 && (
        <div style={{ fontSize: 10, color: C.t3, padding: '6px 0', fontStyle: 'italic' }}>
          Preencha o número de decisões acima · ou clique em "Adicionar pessoa" pra registrar diretamente
        </div>
      )}

      {/* Banner de aviso quando há gap · accountability NSM */}
      {faltando > 0 && (
        <div style={{
          background: '#F59E0B18', borderLeft: '3px solid #F59E0B',
          padding: '8px 12px', borderRadius: 4, marginBottom: 10,
          fontSize: 11, color: 'var(--cbrio-text)', display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <AlertCircle size={14} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>{faltando} decisão{faltando === 1 ? '' : 'ões'} sem nome registrado.</strong>{' '}
            Essas pessoas entram no <strong>denominador da NSM</strong> mas não conseguem ser
            acompanhadas (sem identidade · sem trilha de valor). Registre os dados pra que
            apareçam no painel de cuidados pastorais.
          </div>
        </div>
      )}

      {/* Lista de pessoas ja registradas */}
      {pessoas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {pessoas.map(p => editando === p.id ? (
            <DecisaoPessoaForm
              key={p.id}
              cultoId={cultoId}
              pessoa={p}
              hasOnline={hasOnline}
              hasKids={hasKids}
              onSaved={handleSaved}
              onCancel={() => setEditando(null)}
            />
          ) : (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              background: C.card, border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${(!p.cpf || !p.data_nascimento) ? '#F59E0B' : '#8B5CF6'}`,
              borderRadius: 4, fontSize: 11,
            }}>
              <span style={{ fontWeight: 600, color: C.text, flex: 1, minWidth: 120 }}>
                {p.nome}
                {(!p.cpf || !p.data_nascimento) && (
                  <span style={{ marginLeft: 6, fontSize: 8, padding: '1px 5px', borderRadius: 99, background: '#F59E0B22', color: '#B45309', fontWeight: 700, letterSpacing: 0.3 }} title="Faltam dados pra cruzar na jornada">
                    INCOMPLETO
                  </span>
                )}
              </span>
              {p.telefone && <span style={{ color: C.t3 }}>{p.telefone}</span>}
              {p.email && <span style={{ color: C.t3, fontSize: 10 }}>{p.email}</span>}
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600 }}>
                {p.tipo_decisao}
              </span>
              {p.membro_id && (
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#10B98118', color: '#047857', fontWeight: 700 }}>vinculada a membro</span>
              )}
              <button onClick={() => setEditando(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t2, padding: 4 }} title="Editar">
                <Pencil size={11} />
              </button>
              <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }} title="Remover">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Form de adicionar */}
      {showForm && (
        <DecisaoPessoaForm
          cultoId={cultoId}
          pessoa={null}
          hasOnline={hasOnline}
          hasKids={hasKids}
          onSaved={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Botao adicionar */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          disabled={loading}
          style={{
            ...btnGhost, width: '100%', justifyContent: 'center',
            color: faltando > 0 ? '#8B5CF6' : C.t2,
            borderColor: faltando > 0 ? '#8B5CF6' : C.border,
          }}
        >
          <UserPlus size={12} /> Adicionar pessoa{faltando > 0 ? ` (faltam ${faltando})` : ''}
        </button>
      )}
    </div>
  );
}

// Calcula idade a partir da data de nascimento
function calcularIdade(dataNasc) {
  if (!dataNasc) return null;
  const hoje = new Date();
  const nasc = new Date(dataNasc);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const mes = hoje.getMonth() - nasc.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade >= 0 && idade <= 120 ? idade : null;
}

// Mascaras BR · 11 digitos exatos pra CPF e telefone (DDD + 9 + numero)
function maskCpfBr(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskTelefoneBr(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function DecisaoPessoaForm({ cultoId, pessoa, hasOnline, hasKids, onSaved, onCancel }) {
  const ehEdicao = !!pessoa;
  const [form, setForm] = useState({
    nome: pessoa?.nome || '',
    telefone: pessoa?.telefone || '',
    email: pessoa?.email || '',
    data_nascimento: pessoa?.data_nascimento || '',
    cpf: pessoa?.cpf || '',
    membro_id: pessoa?.membro_id || null,
    tipo_decisao: pessoa?.tipo_decisao || 'presencial',
    observacoes: pessoa?.observacoes || '',
    // Kids · dados do responsavel (LGPD: crianca nao da os dados dela)
    responsavel_nome:     pessoa?.responsavel_nome || '',
    responsavel_telefone: pessoa?.responsavel_telefone || '',
    responsavel_cpf:      pessoa?.responsavel_cpf || '',
  });
  const ehKids = form.tipo_decisao === 'kids';
  const [saving, setSaving] = useState(false);

  // Autocomplete state · busca membro existente
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarBusca, setMostrarBusca] = useState(!ehEdicao);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Debounce da busca
  useEffect(() => {
    if (!mostrarBusca || busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const timer = setTimeout(async () => {
      try {
        const data = await cultosApi.decisoesPessoas.buscarMembro(busca);
        setResultados(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('[buscar-membro]', e);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [busca, mostrarBusca]);

  const selecionarMembro = (m) => {
    setForm({
      nome: m.nome || '',
      telefone: m.telefone || '',
      email: m.email || '',
      data_nascimento: m.data_nascimento || '',
      cpf: m.cpf || '',
      membro_id: m.id,
      tipo_decisao: form.tipo_decisao,
      observacoes: form.observacoes,
    });
    setMostrarBusca(false);
    setBusca('');
    setResultados([]);
  };

  const limparVinculo = () => {
    setForm(f => ({ ...f, membro_id: null }));
    setMostrarBusca(true);
  };

  const idadeCalc = calcularIdade(form.data_nascimento);

  const submit = async () => {
    if (!form.nome.trim() || form.nome.trim().length < 2) {
      toast.error(ehKids ? 'Nome da criança obrigatório' : 'Nome obrigatório (mínimo 2 caracteres)');
      return;
    }

    if (ehKids) {
      // Kids · valida dados do responsavel (crianca nao tem CPF/telefone proprios obrigatorios)
      if (!form.responsavel_nome.trim() || form.responsavel_nome.trim().length < 2) {
        toast.error('Nome do responsável obrigatório');
        return;
      }
      const respTelDigits = (form.responsavel_telefone || '').replace(/\D/g, '');
      if (respTelDigits.length !== 11) {
        toast.error('Telefone do responsável deve ter 11 dígitos');
        return;
      }
      const respCpfDigits = (form.responsavel_cpf || '').replace(/\D/g, '');
      if (respCpfDigits && respCpfDigits.length !== 11) {
        toast.error('CPF do responsável deve ter 11 dígitos (ou deixe vazio)');
        return;
      }
    } else {
      // Presencial/Online · valida dados da pessoa
      const telDigits = (form.telefone || '').replace(/\D/g, '');
      if (telDigits.length !== 11) {
        toast.error('Telefone deve ter 11 dígitos (DDD + 9 + número)');
        return;
      }
      const cpfDigits = (form.cpf || '').replace(/\D/g, '');
      if (cpfDigits && cpfDigits.length !== 11) {
        toast.error('CPF deve ter 11 dígitos (ou deixe vazio)');
        return;
      }
    }

    setSaving(true);
    try {
      const cpfDigits = (form.cpf || '').replace(/\D/g, '');
      const payload = {
        nome: form.nome.trim(),
        telefone: form.telefone || null,
        email: ehKids ? null : (form.email || null),
        data_nascimento: form.data_nascimento || null,
        idade: idadeCalc,
        cpf: cpfDigits || null,
        membro_id: ehKids ? null : (form.membro_id || null),
        tipo_decisao: form.tipo_decisao,
        observacoes: form.observacoes || null,
        responsavel_nome:     ehKids ? form.responsavel_nome.trim() : null,
        responsavel_telefone: ehKids ? form.responsavel_telefone : null,
        responsavel_cpf:      ehKids ? ((form.responsavel_cpf || '').replace(/\D/g, '') || null) : null,
      };
      if (ehEdicao) {
        await cultosApi.decisoesPessoas.update(pessoa.id, payload);
      } else {
        await cultosApi.decisoesPessoas.create(cultoId, payload);
      }
      toast.success(ehEdicao ? 'Pessoa atualizada' : 'Pessoa registrada · vinculada à jornada');
      onSaved();
    } catch (e) {
      toast.error(formatErro(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: C.card, border: `2px solid #8B5CF6`, borderRadius: 6,
      padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Busca de membro existente */}
      {mostrarBusca && !ehEdicao && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#8B5CF6', display: 'flex', alignItems: 'center', gap: 4 }}>
            <SearchIcon size={10} /> Buscar pessoa existente
          </label>
          <input
            type="text" value={busca} autoFocus
            onChange={e => setBusca(e.target.value)}
            style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
            placeholder="Nome, CPF, e-mail ou telefone (mín 2 chars)"
          />
          {buscando && (
            <div style={{ fontSize: 10, color: C.t3, paddingLeft: 4 }}>buscando…</div>
          )}
          {resultados.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 160, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 4, background: 'var(--cbrio-input-bg)' }}>
              {resultados.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selecionarMembro(m)}
                  style={{
                    textAlign: 'left', padding: '6px 10px', background: 'transparent',
                    border: 'none', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                    fontSize: 11, color: C.text, display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{m.nome}</div>
                  <div style={{ fontSize: 10, color: C.t3 }}>
                    {m.cpf && <>CPF {m.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}{' · '}</>}
                    {m.email && <>{m.email}{' · '}</>}
                    {m.telefone && <>{m.telefone}</>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {busca.length >= 2 && !buscando && resultados.length === 0 && (
            <div style={{ fontSize: 10, color: C.t3, padding: '4px 0' }}>
              Nenhuma pessoa encontrada · preencha os campos abaixo pra cadastrar nova
            </div>
          )}
          <button
            type="button"
            onClick={() => setMostrarBusca(false)}
            style={{ ...btnGhost, fontSize: 10, padding: '4px 8px', alignSelf: 'flex-start' }}
          >
            Pular busca e cadastrar nova pessoa
          </button>
        </div>
      )}

      {/* Indicador de membro vinculado */}
      {form.membro_id && !mostrarBusca && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
          background: '#10B98115', borderRadius: 4, fontSize: 10, color: '#047857',
        }}>
          <LinkIcon size={10} />
          <span style={{ fontWeight: 600 }}>Pessoa já cadastrada · dados preenchidos</span>
          <button
            type="button"
            onClick={limparVinculo}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#047857', fontSize: 10, textDecoration: 'underline' }}
          >
            buscar outra
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>
            {ehKids ? 'Nome da criança *' : 'Nome completo *'}
          </label>
          <input
            type="text" value={form.nome}
            onChange={e => set('nome', e.target.value)}
            style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
            placeholder={ehKids ? 'Primeiro nome da criança' : 'Nome completo'}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>Tipo</label>
          <select
            value={form.tipo_decisao}
            onChange={e => set('tipo_decisao', e.target.value)}
            style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
          >
            <option value="presencial">Presencial</option>
            {hasOnline && <option value="online">Online</option>}
            {hasKids && <option value="kids">Kids</option>}
          </select>
        </div>
      </div>

      {/* Bloco do responsavel · so aparece quando tipo='kids' (LGPD pra menores) */}
      {ehKids && (
        <div style={{ background: '#EC489915', border: '1px solid #EC489940', borderRadius: 6, padding: 10, marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#EC4899', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Dados do responsável (LGPD)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>Nome do responsável *</label>
              <input
                type="text" value={form.responsavel_nome}
                onChange={e => set('responsavel_nome', e.target.value)}
                style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
                placeholder="Pai · mãe · responsável legal"
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#EC4899', display: 'block', marginBottom: 2 }}>Telefone *</label>
              <input
                type="text" value={form.responsavel_telefone} maxLength={15}
                onChange={e => set('responsavel_telefone', maskTelefoneBr(e.target.value))}
                style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
                placeholder="(21) 99999-0000"
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>
              CPF do responsável <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(opcional)</span>
            </label>
            <input
              type="text" value={form.responsavel_cpf} maxLength={14}
              onChange={e => set('responsavel_cpf', maskCpfBr(e.target.value))}
              style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
              placeholder="000.000.000-00"
            />
          </div>
        </div>
      )}

      {!ehKids && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: '#8B5CF6', display: 'block', marginBottom: 2 }}>Telefone *</label>
              <input
                type="text" value={form.telefone} maxLength={15}
                onChange={e => set('telefone', maskTelefoneBr(e.target.value))}
                style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
                placeholder="(21) 99999-0000"
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>
                CPF <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(opcional · 11 dígitos)</span>
              </label>
              <input
                type="text" value={form.cpf} maxLength={14}
                onChange={e => set('cpf', maskCpfBr(e.target.value))}
                style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
                placeholder="000.000.000-00"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>
                Data nascimento <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(opcional)</span>
                {idadeCalc !== null && <span style={{ fontWeight: 400, color: C.t3 }}> · {idadeCalc} anos</span>}
              </label>
              <input
                type="date" value={form.data_nascimento}
                onChange={e => set('data_nascimento', e.target.value)}
                style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.t3, display: 'block', marginBottom: 2 }}>E-mail</label>
              <input
                type="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                style={{ ...inp, padding: '6px 10px', fontSize: 11 }}
                placeholder="opcional"
              />
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
        <span style={{ flex: 1, fontSize: 9, color: C.t3, fontStyle: 'italic' }}>
          {ehKids
            ? 'Kids · só nome da criança + dados do responsável (LGPD). NÃO entra no NSM.'
            : 'Nome + telefone obrigatórios · CPF e nascimento podem ser preenchidos depois (censo)'}
        </span>
        <button onClick={onCancel} disabled={saving} style={btnGhost}>Cancelar</button>
        <button onClick={submit} disabled={saving} style={{ ...btnPrimary, background: '#8B5CF6' }}>
          {saving ? 'Salvando...' : (ehEdicao ? 'Atualizar' : 'Registrar')}
        </button>
      </div>
    </div>
  );
}
