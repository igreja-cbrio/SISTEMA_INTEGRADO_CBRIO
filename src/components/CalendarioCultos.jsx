// ============================================================================
// CalendarioCultos — Lista cultos do mes com status de preenchimento
// Click num culto abre modal para preencher os campos nativos da tabela `cultos`.
// Usado em /minha-area (aba Dados) como forma principal de entrada de dados de culto.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { cultos as cultosApi } from '../api';
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
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function pad(n) { return String(n).padStart(2, '0'); }

function rangeMes(ano, mes) {
  const inicio = `${ano}-${pad(mes + 1)}-01`;
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  const fim = `${ano}-${pad(mes + 1)}-${pad(ultimo)}`;
  return { inicio, fim };
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
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [cultos, setCultos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);

  const ehMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth();

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { inicio, fim } = rangeMes(ano, mes);
      const data = await cultosApi.list({ data_inicio: inicio, data_fim: fim, limit: 200 });
      setCultos(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(formatErro(e, 'cultos'));
      setCultos([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  const irMes = (delta) => {
    let m = mes + delta;
    let a = ano;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    // Trava no mes atual · so navega pra tras
    if (a > hoje.getFullYear() || (a === hoje.getFullYear() && m > hoje.getMonth())) return;
    setMes(m);
    setAno(a);
  };

  const { totalPreenchidos, totalPendentes } = useMemo(() => {
    let p = 0, n = 0;
    cultos.forEach(c => { preenchido(c) ? p++ : n++; });
    return { totalPreenchidos: p, totalPendentes: n };
  }, [cultos]);

  return (
    <section style={{ marginBottom: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          <Calendar size={11} style={{ color: C.primary }} /> Cultos do mês
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => irMes(-1)} title="Mês anterior" style={btnNav}>
            <ChevronLeft size={14} />
          </button>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 130, textAlign: 'center' }}>
            {MESES[mes]} {ano}
          </div>
          <button
            onClick={() => irMes(1)}
            disabled={ehMesAtual}
            title={ehMesAtual ? 'Não navega para o futuro' : 'Próximo mês'}
            style={{ ...btnNav, opacity: ehMesAtual ? 0.3 : 1, cursor: ehMesAtual ? 'not-allowed' : 'pointer' }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </header>

      {!loading && cultos.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11, color: C.t3 }}>
          <span><strong style={{ color: '#10B981' }}>{totalPreenchidos}</strong> preenchidos</span>
          <span><strong style={{ color: '#F59E0B' }}>{totalPendentes}</strong> pendentes</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.t3, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
          Carregando cultos...
        </div>
      ) : cultos.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.t3, background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12 }}>
          Nenhum culto cadastrado em {MESES[mes]} {ano}.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {cultos.map(c => <CardCulto key={c.id} culto={c} onClick={() => setEditando(c)} />)}
        </div>
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
// CardCulto — visual de cada culto na grade
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Pico online (simultâneos)">
              <input type="number" min="0" value={form.online_pico} onChange={e => set('online_pico', e.target.value)} style={inp} placeholder="Opcional" />
            </Field>
            <Field label="YouTube Video ID">
              <input type="text" value={form.youtube_video_id} onChange={e => set('youtube_video_id', e.target.value)} style={inp} placeholder="Opcional" />
            </Field>
          </div>

          <p style={{ fontSize: 10, color: C.t3, marginTop: 12, fontStyle: 'italic' }}>
            Views D+1 e D+7 são coletadas automaticamente pelo coletor do YouTube.
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
