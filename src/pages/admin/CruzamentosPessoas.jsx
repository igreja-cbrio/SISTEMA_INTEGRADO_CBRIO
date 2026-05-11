// ============================================================================
// /admin/cruzamentos · cruzamento livre de criterios sobre pessoas
//
// Cada criterio tem 3 estados clicando no chip:
//   ○ indiferente (nao filtra · default)
//   ✓ tem (filtra pra quem TEM)
//   ✕ nao tem (filtra pra quem NAO TEM)
//
// Combinacoes uteis exemplos:
// - "Servir ✓ + Generosidade ✓" · voluntarios que dizimam
// - "Seguir ✓ + Conectar ✕" · convertidos que NAO estao em grupo (acompanhar)
// - "NEXT ✓ + Servir ✕" · participaram do NEXT mas ainda nao servem
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { jornada as jornadaApi } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Users, Filter, Download, Check, X, Heart, Link2, Activity, HandHeart, Sparkles, UserCheck, UserPlus, ChevronDown, BookOpenCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatErro } from '../../lib/formatErro';
import { SkeletonBlock } from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import { COLORS, btnGhostSm } from '../../lib/uiTokens';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)',
};

// Catalogo de criterios disponiveis
const CRITERIOS = [
  {
    grupo: 'Valores da Jornada',
    desc: 'Calculado em tempo real · pessoa "tem" se atende ao criterio do valor',
    itens: [
      { key: 'seguir',       label: 'Seguir a Jesus',  cor: COLORS.purple, Icone: BookOpenCheck, info: 'Convertido (conversao/primeiro contato/batismo concluido)' },
      { key: 'conectar',     label: 'Conectar Pessoas', cor: COLORS.blue,  Icone: Link2,         info: 'Em grupo ativo (mem_grupo_membros sem saida)' },
      { key: 'investir',     label: 'Investir Tempo',   cor: COLORS.amber, Icone: Sparkles,      info: 'Encontro Jornada 180 nos ultimos 90 dias' },
      { key: 'servir',       label: 'Servir',           cor: COLORS.green, Icone: HandHeart,     info: 'Voluntario ativo (mem_voluntarios sem saida)' },
      { key: 'generosidade', label: 'Generosidade',     cor: COLORS.pink,  Icone: Heart,         info: 'Contribuicao nos ultimos 90 dias' },
    ],
  },
  {
    grupo: 'Papéis no sistema',
    desc: 'Status binario · sem janela de tempo',
    itens: [
      { key: 'voluntario',     label: 'Voluntário ativo',   cor: COLORS.green, Icone: UserCheck, info: 'Tem entrada em vol_profiles' },
      { key: 'visitante',      label: 'Já foi visitante',   cor: COLORS.amber, Icone: UserPlus,  info: 'Tem entrada em int_visitantes' },
      { key: 'inscrito_next',  label: 'Inscrito no NEXT',   cor: COLORS.blue,  Icone: Activity,  info: 'Tem entrada em next_inscricoes' },
      { key: 'grupo_ativo',    label: 'Em grupo ativo',     cor: COLORS.blue,  Icone: Link2,     info: 'mem_grupo_membros sem saida (mesmo set do Conectar)' },
      { key: 'contribuinte',   label: 'Contribuinte (90d)', cor: COLORS.pink,  Icone: Heart,     info: 'Mesmo set da Generosidade' },
    ],
  },
];

// 3 estados do chip
function nextEstado(estado) {
  if (!estado) return 'tem';
  if (estado === 'tem') return 'nao_tem';
  return null;
}

export default function CruzamentosPessoas() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);
  const [criterios, setCriterios] = useState({});  // { seguir: 'tem', servir: 'tem', ... }
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLista, setShowLista] = useState(true);

  const toggleCriterio = (key) => {
    setCriterios(c => {
      const novo = { ...c };
      const next = nextEstado(c[key]);
      if (next === null) delete novo[key];
      else novo[key] = next;
      return novo;
    });
  };

  const limparTudo = () => setCriterios({});

  const ativos = useMemo(() =>
    Object.entries(criterios).filter(([, v]) => v === 'tem' || v === 'nao_tem'),
    [criterios]
  );

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await jornadaApi.cruzar(criterios);
      setResultado(r);
    } catch (e) {
      toast.error(formatErro(e, 'cruzamento'));
    } finally { setLoading(false); }
  }, [criterios]);

  useEffect(() => { carregar(); }, [carregar]);

  const copiarEmails = () => {
    if (!resultado?.membros) return;
    const emails = resultado.membros.map(m => m.email).filter(Boolean).join(', ');
    navigator.clipboard.writeText(emails);
    toast.success(`${emails.split(',').length} emails copiados`);
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>
        Acesso restrito · cruzamentos sao exclusivos para admin/diretor.
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300, margin: '0 auto' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Filter size={22} style={{ color: COLORS.primary }} />
          Cruzamentos de pessoas
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          Combine criterios pra responder perguntas como "quantos voluntarios dizimam?",
          "convertidos que ainda nao estao em grupos", "NEXT + contribuintes recorrentes". Cada chip alterna entre <strong>indiferente</strong> ⟶ <strong style={{ color: COLORS.green }}>tem ✓</strong> ⟶ <strong style={{ color: COLORS.red }}>nao tem ✕</strong>.
        </p>
      </header>

      {/* Painel de criterios · 2 grupos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        {CRITERIOS.map(grupo => (
          <section key={grupo.grupo} style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 14,
          }}>
            <div style={{ marginBottom: 10 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: C.t2, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {grupo.grupo}
              </h3>
              <p style={{ fontSize: 11, color: C.t3, margin: '2px 0 0' }}>{grupo.desc}</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {grupo.itens.map(it => {
                const estado = criterios[it.key];
                const Icone = it.Icone;
                const borda = estado === 'tem' ? it.cor
                            : estado === 'nao_tem' ? COLORS.red
                            : C.border;
                const fundo = estado === 'tem' ? it.cor + '20'
                            : estado === 'nao_tem' ? COLORS.redBg
                            : 'transparent';
                const corTexto = estado === 'tem' ? it.cor
                              : estado === 'nao_tem' ? COLORS.red
                              : C.t2;
                return (
                  <button
                    key={it.key}
                    onClick={() => toggleCriterio(it.key)}
                    title={it.info}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 99,
                      border: `1px solid ${borda}`,
                      background: fundo,
                      color: corTexto,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s',
                    }}
                  >
                    <Icone size={13} />
                    {it.label}
                    {estado === 'tem' && <Check size={13} strokeWidth={3} />}
                    {estado === 'nao_tem' && <X size={13} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {ativos.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={limparTudo} style={btnGhostSm}>Limpar filtros</button>
          </div>
        )}
      </div>

      {/* Resultado · contagem + barra + lista */}
      <section style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: 18, marginBottom: 16,
      }}>
        {loading && !resultado ? (
          <SkeletonBlock height={100} />
        ) : resultado ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{
                background: COLORS.primaryBg, color: COLORS.primaryDark,
                width: 64, height: 64, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Users size={28} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: C.text, lineHeight: 1 }}>
                  {resultado.total_match.toLocaleString('pt-BR')}
                  <span style={{ fontSize: 16, color: C.t3, fontWeight: 500, marginLeft: 8 }}>
                    de {resultado.total_geral.toLocaleString('pt-BR')} pessoas
                  </span>
                </div>
                <div style={{ fontSize: 13, color: C.t2, marginTop: 6 }}>
                  {resultado.percentual}% do total
                  {ativos.length === 0 && ' · sem filtros, mostrando todos'}
                  {ativos.length > 0 && ` · com ${ativos.length} criterio${ativos.length > 1 ? 's' : ''}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowLista(s => !s)} style={btnGhostSm}>
                  <ChevronDown size={12} style={{ transform: showLista ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  {showLista ? 'Esconder lista' : 'Ver lista'}
                </button>
                {resultado.membros?.length > 0 && (
                  <button onClick={copiarEmails} style={btnGhostSm}>
                    <Download size={12} /> Copiar emails
                  </button>
                )}
              </div>
            </div>

            {/* Barra de progresso */}
            <div style={{ marginTop: 14, height: 8, background: C.inputBg, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                width: `${resultado.percentual}%`,
                height: '100%',
                background: COLORS.primary,
                transition: 'width 0.4s',
              }} />
            </div>
          </>
        ) : null}
      </section>

      {/* Lista de pessoas */}
      {showLista && resultado && (
        <section>
          {resultado.membros.length === 0 ? (
            <EmptyState
              tom="neutro"
              icone={Users}
              titulo="Ninguém atende a combinação atual"
              mensagem="Tente afrouxar 1 ou 2 critérios · talvez algum 'tem' esteja vazio."
            />
          ) : (
            <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{
                padding: '10px 16px', background: 'var(--cbrio-table-header)',
                fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {resultado.total_match > 200 ? `Primeiras 200 pessoas (de ${resultado.total_match.toLocaleString('pt-BR')})` : `${resultado.membros.length} pessoa${resultado.membros.length > 1 ? 's' : ''}`}
              </div>
              <div style={{ maxHeight: 540, overflowY: 'auto' }}>
                {resultado.membros.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px', borderTop: `1px solid ${C.border}`,
                  }}>
                    {m.foto_url ? (
                      <img src={m.foto_url} alt={m.nome} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: COLORS.primaryBg, color: COLORS.primaryDark,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {(m.nome || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.nome}</div>
                      <div style={{ fontSize: 10, color: C.t3 }}>
                        {m.email || '—'}
                        {m.telefone && ` · ${m.telefone}`}
                      </div>
                    </div>
                    {m.status && (
                      <span style={{
                        fontSize: 9, padding: '2px 8px', borderRadius: 99,
                        background: C.inputBg, color: C.t2, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>
                        {m.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
