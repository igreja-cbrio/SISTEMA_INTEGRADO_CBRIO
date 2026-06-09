// ============================================================================
// /painel/nsm/pessoas — Camada 4 do drilldown (Sistema OKR/NSM 2026)
//
// Convertidos da NSM + engajamento por valor/atividade. Substitui a antiga
// leitura de int_visitantes pela fonte real (cultos_decisoes_pessoas).
//
// Filtros:
//   - Ano + Janela (30/60/90/Ano acumulado) · a janela vale pra tudo: quem
//     decidiu no recorte E o horizonte de engajamento.
//   - Origem da decisão: Todos / Presencial / Online. Aceita deep link
//     (?tipo=online ou ?segmento=online · os cards NSM do /painel usam).
//   - 5 cards de valores (multi-seleção) · cada um abre nas atividades.
//     "Seguir a Jesus" sem atividade não filtra ninguém: a própria conversão
//     já cumpre o valor — as atividades (1º Contato/Batismo/Next) refinam.
//   - Status: Todos / Engajados / Não engajados.
//   - E entre valores, OU entre atividades do mesmo valor.
//   - Os 4 cards de números acompanham o filtro ativo (match_* do backend).
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { painel as painelApi } from '../api';
import { ArrowLeft, Phone, Mail, Calendar, Users, EyeOff, Check, Filter, X } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', primary: '#00B39D',
};

const VALOR_CORES = {
  seguir:       '#8B5CF6',
  conectar:     '#3B82F6',
  investir:     '#F59E0B',
  servir:       '#10B981',
  generosidade: '#EC4899',
};

const VALOR_LABELS = {
  seguir:       'Seguir a Jesus',
  conectar:     'Conectar com Pessoas',
  investir:     'Investir Tempo com Deus',
  servir:       'Servir em Comunidade',
  generosidade: 'Viver Generosamente',
};

const VALOR_ORDER = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];

// Catálogo de atividades por valor (espelha o backend · "1º Contato", não "Café").
const CATALOGO = {
  seguir:       [{ id: 'primeiro_contato', label: '1º Contato' }, { id: 'batismo', label: 'Batismo' }, { id: 'next', label: 'Next' }],
  conectar:     [{ id: 'grupo', label: 'Em grupo' }],
  investir:     [{ id: 'devocional', label: 'Devocional' }, { id: 'jornada180', label: 'Jornada 180' }, { id: 'aconselhamento', label: 'Aconselhamento' }],
  servir:       [{ id: 'voluntario', label: 'Voluntário' }],
  generosidade: [{ id: 'dizimo', label: 'Dízimo' }, { id: 'oferta', label: 'Oferta' }],
};

const labelAtividade = (valor, id) => CATALOGO[valor]?.find(a => a.id === id)?.label || id;

const JANELAS = [
  { id: '30', label: '30 dias' },
  { id: '60', label: '60 dias' },
  { id: '90', label: '90 dias' },
  { id: 'acumulado', label: 'Ano acumulado' },
];

const STATUS_OPCOES = [
  { id: 'todos', label: 'Todos' },
  { id: 'engajados', label: 'Engajados' },
  { id: 'nao_engajados', label: 'Não engajados' },
];

const TIPO_OPCOES = [
  { id: 'todos', label: 'Todos' },
  { id: 'presencial', label: 'Presencial' },
  { id: 'online', label: 'Online' },
];

export default function PainelNsmPessoas() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const anoAtual = new Date().getFullYear();

  const [tab, setTab] = useState('pessoas');            // pessoas | sem_dados
  const [ano, setAno] = useState(anoAtual);
  const [janela, setJanela] = useState('60');
  // Deep links do /painel: ?segmento=online (card NSM Online) e ?engajados=false
  const [statusF, setStatusF] = useState(() => {
    const s = (searchParams.get('status') || '').toLowerCase();
    if (STATUS_OPCOES.some(o => o.id === s)) return s;
    const eng = searchParams.get('engajados');
    if (eng === 'false') return 'nao_engajados';
    if (eng === 'true') return 'engajados';
    return 'todos';
  });
  const [tipoF, setTipoF] = useState(() => {
    const t = (searchParams.get('tipo') || searchParams.get('segmento') || '').toLowerCase();
    return ['presencial', 'online'].includes(t) ? t : 'todos';
  });
  const [valoresSel, setValoresSel] = useState(() => new Set());
  const [atividadesSel, setAtividadesSel] = useState(() => new Set()); // "valor:atividade"

  const [data, setData] = useState(null);
  const [semDados, setSemDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const anos = useMemo(() => {
    const arr = [];
    for (let y = anoAtual; y >= 2024; y--) arr.push(y);
    return arr;
  }, [anoAtual]);

  const valoresKey = [...valoresSel].sort().join(',');
  const atividadesKey = [...atividadesSel].sort().join(',');

  useEffect(() => {
    if (tab !== 'pessoas') return;
    setLoading(true); setErro(null);
    painelApi.nsmPessoas({
      ano, janela, status: statusF, tipo: tipoF,
      valores: valoresKey,
      atividades: atividadesKey,
    })
      .then(setData)
      .catch(e => setErro(e?.message || 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [tab, ano, janela, statusF, tipoF, valoresKey, atividadesKey]);

  useEffect(() => {
    if (tab !== 'sem_dados') return;
    setLoading(true); setErro(null);
    const diasMap = { '30': 30, '60': 60, '90': 90, acumulado: 366 };
    painelApi.nsmSemDados({ dias: diasMap[janela] || 90 })
      .then(setSemDados)
      .catch(e => setErro(e?.message || 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [tab, janela]);

  const toggleValor = (v) => {
    setValoresSel(prev => {
      const n = new Set(prev);
      if (n.has(v)) {
        n.delete(v);
        setAtividadesSel(a => new Set([...a].filter(x => !x.startsWith(v + ':'))));
      } else {
        n.add(v);
      }
      return n;
    });
  };

  const toggleAtividade = (v, atvId) => {
    const key = `${v}:${atvId}`;
    setAtividadesSel(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
    setValoresSel(prev => new Set(prev).add(v)); // marca o valor junto
  };

  const limparFiltros = () => { setValoresSel(new Set()); setAtividadesSel(new Set()); };
  const temFiltro = valoresSel.size > 0 || atividadesSel.size > 0;
  // Filtros que recortam DENTRO do universo de convertidos (origem muda o
  // próprio universo na fonte, então não entra aqui).
  const filtraDentro = temFiltro || statusF !== 'todos';

  const descricaoRecorte = useMemo(() => {
    const base = janela === 'acumulado'
      ? (ano === anoAtual ? `${ano} acumulado (até hoje)` : `${ano} (ano completo)`)
      : `${ano} · últimos ${janela} dias`;
    if (tipoF === 'online') return `${base} · decisões online`;
    if (tipoF === 'presencial') return `${base} · decisões presenciais`;
    return base;
  }, [ano, janela, anoAtual, tipoF]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={() => navigate('/painel')} style={btnVoltar}>
        <ArrowLeft size={14} /> Voltar ao painel
      </button>

      <div style={{ marginTop: 16, marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={22} style={{ color: C.primary }} />
          Pessoas convertidas
        </h1>
        <p style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
          Drilldown da NSM · {descricaoRecorte} · quem decidiu por Jesus e como engajou nos valores
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'inline-flex', gap: 4, marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4 }}>
        {[
          { v: 'pessoas',   l: 'Pessoas',   Icon: Users },
          { v: 'sem_dados', l: 'Sem dados', Icon: EyeOff },
        ].map(opt => {
          const Ic = opt.Icon;
          const ativo = tab === opt.v;
          return (
            <button key={opt.v} onClick={() => setTab(opt.v)} style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: ativo ? C.primary + '1a' : 'transparent', color: ativo ? C.primary : C.t2,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Ic size={13} /> {opt.l}
            </button>
          );
        })}
      </div>

      {/* Controles de tempo (valem para as duas abas) */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <Campo label="Ano">
          <select value={ano} onChange={e => setAno(Number(e.target.value))} style={selectStyle}>
            {anos.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </Campo>
        <Campo label="Janela">
          <Segmented value={janela} onChange={setJanela} options={JANELAS} />
        </Campo>
        {tab === 'pessoas' && (
          <Campo label="Origem da decisão">
            <Segmented value={tipoF} onChange={setTipoF} options={TIPO_OPCOES} />
          </Campo>
        )}
        {tab === 'pessoas' && (
          <Campo label="Engajamento">
            <Segmented value={statusF} onChange={setStatusF} options={STATUS_OPCOES} />
          </Campo>
        )}
      </div>

      {tab === 'pessoas' && (
        <>
          {/* Cards de valores + atividades */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Filter size={12} /> Filtrar por valores e atividades
              </span>
              {temFiltro && (
                <button onClick={limparFiltros} style={{ ...btnVoltar, padding: '4px 10px', fontSize: 11 }}>
                  <X size={12} /> Limpar
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              {VALOR_ORDER.map(v => (
                <ValorCard
                  key={v}
                  vkey={v}
                  label={VALOR_LABELS[v]}
                  cor={VALOR_CORES[v]}
                  ativo={valoresSel.has(v)}
                  atividades={CATALOGO[v] || []}
                  atividadesSel={atividadesSel}
                  onToggleValor={toggleValor}
                  onToggleAtividade={toggleAtividade}
                  hint={v === 'seguir' ? 'A própria conversão já cumpre este valor — todos entram. Marque uma atividade para refinar.' : null}
                />
              ))}
            </div>
            {temFiltro && (
              <p style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
                Mostrando quem fez <strong>todos</strong> os valores marcados (e qualquer atividade marcada dentro de cada um).
              </p>
            )}
          </div>

          {/* Stats · acompanham o filtro ativo (status + valores/atividades) */}
          {data && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <Stat
                  label={filtraDentro ? 'Pessoas no filtro' : 'Convertidos no recorte'}
                  value={data.total_match ?? data.total_convertidos}
                  cor={C.t2}
                />
                <Stat label="Engajados" value={data.match_engajados ?? data.total_engajados} cor="#10B981" />
                <Stat label="Não engajados" value={data.match_nao_engajados ?? data.total_nao_engajados} cor="#EF4444" />
                <Stat label="% engajamento" value={(data.match_pct ?? data.pct_engajamento ?? 0) + '%'} cor={C.primary} />
              </div>
              {filtraDentro && (
                <p style={{ fontSize: 11, color: C.t3, margin: '8px 0 0' }}>
                  Números do filtro atual · o recorte completo tem <strong>{data.total_convertidos}</strong>{' '}
                  {data.total_convertidos === 1 ? 'convertido' : 'convertidos'} ({data.total_engajados}{' '}
                  {data.total_engajados === 1 ? 'engajado' : 'engajados'}, {data.pct_engajamento ?? 0}%).
                </p>
              )}
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>
          ) : erro ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>{erro}</div>
          ) : !data?.pessoas?.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13, background: C.card, borderRadius: 10, border: `1px dashed ${C.border}` }}>
              {temFiltro ? 'Ninguém corresponde a essa combinação no recorte.' : 'Sem convertidos nesse recorte.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.pessoas.map(p => <PessoaCard key={p.id} pessoa={p} />)}
            </div>
          )}
        </>
      )}

      {tab === 'sem_dados' && (
        <>
          {semDados?.resumo && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
              <Stat label="Cultos com decisões" value={semDados.resumo.total_cultos} cor={C.t2} />
              <Stat label="Total decisões" value={semDados.resumo.total_decisoes} cor="#3B82F6" />
              <Stat label="Pessoas registradas" value={semDados.resumo.total_registradas} cor="#10B981" />
              <Stat label="Sem dados (gap)" value={semDados.resumo.total_sem_dados} cor="#EF4444" />
            </div>
          )}
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>
          ) : erro ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>{erro}</div>
          ) : !semDados?.items?.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13, background: C.card, borderRadius: 10, border: `1px dashed ${C.border}` }}>
              Todas as decisões do recorte têm pessoa registrada.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {semDados.items.map(c => <CultoSemDadosCard key={c.culto_id} culto={c} navigate={navigate} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
function Campo({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const selectStyle = {
  padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, cursor: 'pointer',
};

function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4, flexWrap: 'wrap' }}>
      {options.map(o => {
        const ativo = String(o.id) === String(value);
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: ativo ? C.primary + '18' : 'transparent', color: ativo ? C.primary : C.t2,
          }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ValorCard({ vkey, label, cor, ativo, atividades, atividadesSel, onToggleValor, onToggleAtividade, hint }) {
  return (
    <div style={{
      background: C.card, border: `1.5px solid ${ativo ? cor : C.border}`,
      borderRadius: 12, padding: 12, transition: 'border-color .15s',
    }}>
      <button onClick={() => onToggleValor(vkey)} style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: cor, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, flex: 1, textAlign: 'left' }}>{label}</span>
        <span style={{
          width: 18, height: 18, borderRadius: 6, flexShrink: 0,
          border: `1.5px solid ${ativo ? cor : C.border}`, background: ativo ? cor : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {ativo && <Check size={12} color="#fff" strokeWidth={3} />}
        </span>
      </button>
      {ativo && atividades.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {atividades.map(a => {
            const sel = atividadesSel.has(`${vkey}:${a.id}`);
            return (
              <button key={a.id} onClick={() => onToggleAtividade(vkey, a.id)} style={{
                padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${sel ? cor : C.border}`, background: sel ? cor + '20' : 'transparent', color: sel ? cor : C.t2,
              }}>
                {a.label}
              </button>
            );
          })}
        </div>
      )}
      {ativo && hint && (
        <p style={{ fontSize: 10, color: C.t3, margin: '8px 0 0', lineHeight: 1.4 }}>{hint}</p>
      )}
    </div>
  );
}

function Stat({ label, value, cor }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.t3, marginTop: 4, letterSpacing: 0.3 }}>{label}</div>
    </div>
  );
}

function PessoaCard({ pessoa }) {
  const eng = pessoa.engajado;
  const cor = eng ? '#10B981' : '#EF4444';

  // agrupa atividades por valor (ordem canônica)
  const porValor = {};
  (pessoa.atividades || []).forEach(a => {
    (porValor[a.valor] = porValor[a.valor] || new Set()).add(a.atividade);
  });

  const dataFmt = pessoa.data_decisao
    ? new Date(pessoa.data_decisao + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—';

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cor}`,
      borderRadius: 10, padding: 12, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: cor + '20', color: cor,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0,
      }}>
        {(pessoa.nome || '?').charAt(0).toUpperCase()}
      </div>

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, color: C.text }}>{pessoa.nome || 'Sem nome'}</strong>
          {pessoa.tipo_decisao && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: C.inputBg, color: C.t2, fontWeight: 600 }}>
              {pessoa.tipo_decisao}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Calendar size={11} /> Decisão {dataFmt} · {pessoa.dias_decorridos}d atrás
          </span>
          {pessoa.telefone && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Phone size={11} /> {pessoa.telefone}
            </span>
          )}
          {pessoa.email && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Mail size={11} /> {pessoa.email}
            </span>
          )}
        </div>
      </div>

      <div style={{ minWidth: 180, maxWidth: 360, textAlign: 'right' }}>
        {eng ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {VALOR_ORDER.filter(v => porValor[v]).map(v => (
              <span key={v} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                background: VALOR_CORES[v] + '18', color: VALOR_CORES[v],
                border: `1px solid ${VALOR_CORES[v]}40`,
              }}>
                {[...porValor[v]].map(id => labelAtividade(v, id)).join(' · ')}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>Ainda não engajou</span>
        )}
      </div>
    </div>
  );
}

const btnVoltar = {
  background: 'transparent', border: `1px solid ${C.border}`,
  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  color: C.t2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
};

// ----------------------------------------------------------------------------
function CultoSemDadosCard({ culto, navigate }) {
  const corBorda = culto.gap_status === 'nenhuma_registrada' ? '#EF4444'
                 : culto.gap_status === 'parcial'            ? '#F59E0B'
                 :                                             '#10B981';
  const labelGap = culto.gap_status === 'nenhuma_registrada' ? 'Nenhuma registrada'
                 : culto.gap_status === 'parcial'            ? `${culto.sem_dados} sem dados`
                 :                                             'Completo';

  const dataFmt = culto.data_culto
    ? new Date(culto.data_culto + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—';

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${corBorda}`,
      borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 90 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{dataFmt}</div>
        <div style={{ fontSize: 9, color: C.t3 }}>{culto.service_type_name || culto.culto_nome}</div>
      </div>
      <div style={{ flex: 1, minWidth: 180, fontSize: 11, color: C.t2 }}>
        <strong>{culto.total_decisoes}</strong> decisões registradas, <strong>{culto.total_registradas}</strong> pessoas cadastradas
        {culto.com_membro_vinculado > 0 && (
          <span style={{ color: C.t3 }}> · {culto.com_membro_vinculado} já com membro vinculado</span>
        )}
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: `${corBorda}1a`, color: corBorda }}>
        {labelGap}
      </span>
      <button onClick={() => navigate(`/ministerial/integracao?tab=frequencia&culto=${culto.culto_id}`)} style={{ ...btnVoltar, padding: '4px 10px', fontSize: 10 }}>
        Abrir culto
      </button>
    </div>
  );
}
