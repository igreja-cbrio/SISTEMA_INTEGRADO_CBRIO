// ============================================================================
// /admin/cruzamentos · cruzamento livre de critérios sobre pessoas
//
// Cada critério tem 3 estados clicando no chip:
//   ○ indiferente (não filtra · default)
//   ✓ tem (filtra pra quem TEM)
//   ✕ não tem (filtra pra quem NÃO TEM)
//
// Combinacoes úteis exemplos:
// - "Servir ✓ + Generosidade ✓" · voluntários que dizimam
// - "Seguir ✓ + Conectar ✕" · convertidos que NÃO estão em grupo (acompanhar)
// - "NEXT ✓ + Servir ✕" · participaram do NEXT mas ainda não servem
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { jornada as jornadaApi } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Users, Filter, Download, Check, X, Heart, Link2, Activity, HandHeart, Sparkles, UserCheck, UserPlus, ChevronDown, BookOpenCheck, Droplets, GraduationCap, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { formatErro } from '../../lib/formatErro';
import { SkeletonBlock } from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import Paginacao from '../../components/Paginacao';
import { COLORS, btnGhostSm } from '../../lib/uiTokens';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)',
};

// Catalogo de critérios disponíveis
const CRITERIOS = [
  {
    grupo: 'Valores da Jornada',
    desc: 'Calculado em tempo real · pessoa "tem" se atende ao critério do valor',
    itens: [
      { key: 'seguir',       label: 'Seguir a Jesus',  cor: COLORS.purple, Icone: BookOpenCheck, info: 'Convertido (conversao/primeiro contato/batismo concluido)' },
      { key: 'conectar',     label: 'Conectar Pessoas', cor: COLORS.blue,  Icone: Link2,         info: 'Em grupo ativo (mem_grupo_membros sem saída)' },
      { key: 'investir',     label: 'Investir Tempo',   cor: COLORS.amber, Icone: Sparkles,      info: 'Encontro Jornada 180 nos últimos 90 dias' },
      { key: 'servir',       label: 'Servir',           cor: COLORS.green, Icone: HandHeart,     info: 'Voluntário ativo (mem_voluntarios sem saída)' },
      { key: 'generosidade', label: 'Generosidade',     cor: COLORS.pink,  Icone: Heart,         info: 'Contribuição nos últimos 90 dias' },
    ],
  },
  {
    grupo: 'Papéis no sistema',
    desc: 'Status binario · sem janela de tempo',
    itens: [
      { key: 'voluntario',     label: 'Voluntário ativo',   cor: COLORS.green, Icone: UserCheck, info: 'Tem entrada em vol_profiles — hoje é exatamente o mesmo conjunto do valor Servir (as duas leituras vivem em sincronia por trigger)' },
      { key: 'visitante',      label: 'Já foi visitante',   cor: COLORS.amber, Icone: UserPlus,  info: 'Tem entrada em int_visitantes' },
      { key: 'inscrito_next',  label: 'Inscrito no NEXT',   cor: COLORS.blue,  Icone: Activity,  info: 'Tem entrada em next_inscricoes — SE INSCREVEU, não necessariamente concluiu' },
      { key: 'grupo_ativo',    label: 'Em grupo ativo',     cor: COLORS.blue,  Icone: Link2,     info: 'mem_grupo_membros sem saída (mesmo set do Conectar)' },
      { key: 'contribuinte',   label: 'Contribuinte (90d)', cor: COLORS.pink,  Icone: Heart,     info: 'Mesmo set da Generosidade' },
    ],
  },
  {
    grupo: 'Marcos da jornada',
    desc: 'O que o sistema tem REGISTRO de — ausência de registro não é prova de que não aconteceu',
    itens: [
      { key: 'batizado',  label: 'Batismo registrado', cor: COLORS.purple, Icone: Droplets,
        info: 'Cerimônia registrada (batismo_inscricoes realizado) OU marcação "batizei em outra igreja". ⚠️ O registro começa em 02/2024 — quem se batizou antes pode não ter linha.' },
      { key: 'fez_next',  label: 'Concluiu o NEXT',    cor: COLORS.blue,   Icone: GraduationCap,
        info: 'Presença em ao menos um encontro (vw_next_formado_pessoa) — a fonte única do sistema. Diferente de "Inscrito no NEXT".' },
      { key: 'convertido', label: 'Convertido',        cor: COLORS.amber,  Icone: Flame,
        info: 'Tem linha em cui_convertidos (decidiu num culto e entrou na fila do cuidado pastoral). Com a janela ao lado, vira "recém-convertido".' },
    ],
  },
];

// Janelas para recortar "recém-convertido". Só valem com o critério
// "Convertido ✓" ativo — em "não tem" a pessoa não tem data, e aplicar a janela
// devolveria zero sem explicar por quê.
const JANELAS_CONVERSAO = [
  { dias: null, label: 'qualquer época' },
  { dias: 90,   label: 'últimos 90 dias' },
  { dias: 180,  label: 'últimos 6 meses' },
  { dias: 365,  label: 'último ano' },
];

// Perguntas que a liderança faz de verdade (pedido do Matheus · 20/08/2026),
// cada uma virando a combinação de chips que a responde.
const PERGUNTAS_PRONTAS = [
  {
    label: 'Voluntários com batismo registrado',
    criterios: { servir: 'tem', batizado: 'tem' },
    info: 'Serve ativamente e tem batismo registrado no sistema',
  },
  {
    label: 'Voluntários sem registro de batismo',
    criterios: { servir: 'tem', batizado: 'nao_tem' },
    info: 'Serve ativamente e NÃO tem batismo registrado — lista para conferir e regularizar, não contagem de não-batizados',
  },
  {
    label: 'Concluíram o NEXT e são recém-convertidos',
    criterios: { fez_next: 'tem', convertido: 'tem' },
    dias: 180,
    info: 'Presença em ao menos um encontro do NEXT + decisão nos últimos 6 meses',
  },
  {
    label: 'Inscreveram no NEXT e são recém-convertidos',
    criterios: { inscrito_next: 'tem', convertido: 'tem' },
    dias: 180,
    info: 'Se inscreveram (concluíram ou não) + decisão nos últimos 6 meses',
  },
  {
    label: 'Recém-convertidos que ainda não fizeram o NEXT',
    criterios: { convertido: 'tem', fez_next: 'nao_tem' },
    dias: 180,
    info: 'A fila de convite para o NEXT',
  },
  {
    label: 'Convertidos sem batismo registrado',
    criterios: { convertido: 'tem', batizado: 'nao_tem' },
    info: 'Decidiram num culto e não têm batismo registrado — o trilho do batismo',
  },
  {
    label: 'Batizados que não servem',
    criterios: { batizado: 'tem', servir: 'nao_tem' },
    info: 'Têm batismo registrado e não estão em nenhuma escala ativa',
  },
];

// 3 estados do chip
function nextEstado(estado) {
  if (!estado) return 'tem';
  if (estado === 'tem') return 'nao_tem';
  return null;
}

const PAGE_SIZE = 100;

export default function CruzamentosPessoas() {
  // ⚠️ ESPELHO do guard do servidor (`authorizeModule('membresia', 2)` em
  // backend/routes/jornada.js), não uma régua própria. Antes era
  // `['admin','diretor'].includes(profile.role)` — que deixava de fora
  // coordenação com cargo alto e role `assistente` (o caso do Pedro Paiva, e o
  // padrão nesta base), e pior: era o ÚNICO guard, porque o backend não tinha
  // nenhum. `canAccessModule` já embute o bypass de admin/diretor.
  const { canAccessModule } = useAuth();
  const isAdmin = canAccessModule(['membresia'], 'leitura', 2);
  const [criterios, setCriterios] = useState({});  // { seguir: 'tem', servir: 'tem', ... }
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLista, setShowLista] = useState(true);
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Janela de "recém-convertido" (null = qualquer época). Vive fora de
  // `criterios` porque não é um chip de 3 estados — é um recorte do critério
  // "Convertido ✓".
  const [convertidoDias, setConvertidoDias] = useState(null);

  const toggleCriterio = (key) => {
    setCriterios(c => {
      const novo = { ...c };
      const next = nextEstado(c[key]);
      if (next === null) delete novo[key];
      else novo[key] = next;
      return novo;
    });
    setPage(0);
  };

  const limparTudo = () => { setCriterios({}); setConvertidoDias(null); setPage(0); };

  const ativos = useMemo(() =>
    Object.entries(criterios).filter(([, v]) => v === 'tem' || v === 'nao_tem'),
    [criterios]
  );

  // ⚠️ A janela só entra no payload quando "Convertido ✓" está ativo: em
  // "não tem" a pessoa não tem data de conversão, e mandar a janela devolveria
  // zero sem a tela explicar por quê. O servidor tem a mesma guarda.
  const payload = useMemo(() => (
    criterios.convertido === 'tem' && convertidoDias
      ? { ...criterios, convertido_dias: convertidoDias }
      : criterios
  ), [criterios, convertidoDias]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await jornadaApi.cruzar(payload, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      setResultado(r);
    } catch (e) {
      toast.error(formatErro(e, 'cruzamento'));
    } finally { setLoading(false); }
  }, [payload, page]);

  const forcarRefresh = async () => {
    setRefreshing(true);
    try {
      await jornadaApi.refreshPapeis();
      toast.success('Dados atualizados · view refresh OK');
      carregar();
    } catch (e) {
      toast.error(formatErro(e));
    } finally { setRefreshing(false); }
  };

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
        Acesso restrito · cruzamentos exigem nível 2 em Membresia (a lista traz nome, e-mail e telefone).
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300, margin: '0 auto' }}>
      <header style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Filter size={22} style={{ color: COLORS.primary }} />
            Cruzamentos de pessoas
          </h1>
          <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
            Combine criterios pra responder perguntas como "quantos voluntários dizimam?",
            "convertidos que ainda não estão em grupos", "NEXT + contribuintes recorrentes". Cada chip alterna entre <strong>indiferente</strong> ⟶ <strong style={{ color: COLORS.green }}>tem ✓</strong> ⟶ <strong style={{ color: COLORS.red }}>não tem ✕</strong>.
          </p>
        </div>
        <button
          onClick={forcarRefresh}
          disabled={refreshing}
          style={{ ...btnGhostSm, opacity: refreshing ? 0.5 : 1 }}
          title="Force refresh da view materializada · use após inserir dados em massa"
        >
          {refreshing ? 'Atualizando...' : '↻ Atualizar dados'}
        </button>
      </header>

      {/* Perguntas prontas · leva direto à combinação de chips.
          ⚠️ NÃO é um segundo caminho de consulta: cada atalho só SETA os chips,
          então o que a tela mostra depois é exatamente o que os chips dizem —
          a pessoa vê a combinação e pode ajustar. Um atalho que consultasse por
          conta própria daria duas respostas para a mesma pergunta. */}
      <section style={{
        background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)',
        border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)',
        borderRadius: 16, padding: 14, marginBottom: 16,
      }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: C.t2, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Perguntas prontas
        </h3>
        <p style={{ fontSize: 11, color: C.t3, margin: '0 0 10px' }}>
          Um clique monta a combinação de chips — dá para ajustar depois
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PERGUNTAS_PRONTAS.map(p => (
            <button
              key={p.label}
              onClick={() => { setCriterios(p.criterios); setConvertidoDias(p.dias ?? null); setPage(0); }}
              title={p.info}
              style={{
                padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Painel de critérios · 3 grupos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        {CRITERIOS.map(grupo => (
          <section key={grupo.grupo} style={{
            background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)',
            border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)',
            borderRadius: 16, padding: 14,
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

            {/* Janela de "recém-convertido" · só aparece com Convertido ✓ ativo.
                ⚠️ Seletor que não faz nada é pior que seletor ausente: em
                "não tem" a pessoa não tem data e a janela não se aplica. */}
            {grupo.grupo === 'Marcos da jornada' && criterios.convertido === 'tem' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: C.t3 }}>Converteu em:</span>
                {JANELAS_CONVERSAO.map(j => {
                  const ativo = (convertidoDias || null) === j.dias;
                  return (
                    <button
                      key={j.label}
                      onClick={() => { setConvertidoDias(j.dias); setPage(0); }}
                      style={{
                        padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.15s',
                        border: `1px solid ${ativo ? COLORS.amber : C.border}`,
                        background: ativo ? COLORS.amber + '20' : 'transparent',
                        color: ativo ? COLORS.amber : C.t2,
                      }}
                    >
                      {j.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ⚠️⚠️ A RESSALVA MAIS IMPORTANTE DESTA TELA.
                Medido em 20/08/2026: `batismo_inscricoes` começa em 02/2024 e
                1.208 dos 1.699 membros ativos não têm linha. Numa igreja
                batista membro é batizado por definição — então "sem registro"
                é lacuna de CADASTRO, não ausência de batismo. Sem isto escrito
                ao lado do número, "495 voluntários não batizados" vira decisão
                pastoral em cima de um artefato. */}
            {grupo.grupo === 'Marcos da jornada' && criterios.batizado === 'nao_tem' && (
              <div style={{
                marginTop: 10, padding: '8px 10px', borderRadius: 10, fontSize: 11.5, lineHeight: 1.5,
                border: `1px solid ${COLORS.amber}`, background: COLORS.amber + '14', color: C.t2,
              }}>
                <strong>Isto é “sem registro”, não “não batizado”.</strong> O registro de batismos
                do sistema começa em <strong>fevereiro de 2024</strong>, e quem se batizou antes
                (ou em outra igreja, sem ter marcado no app) não tem linha. Use como
                <strong> lista para conferir e regularizar</strong> — não como contagem de
                não-batizados.
              </div>
            )}
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
        background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)',
        border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)',
        borderRadius: 16, padding: 18, marginBottom: 16,
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
                  {ativos.length > 0 && ` · com ${ativos.length} critério${ativos.length > 1 ? 's' : ''}`}
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
            <div style={{ background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
              <Paginacao
                page={page + 1}
                pageSize={PAGE_SIZE}
                total={resultado.total_match}
                onPageChange={(p) => setPage(p - 1)}
                itemLabel="pessoas"
                className="px-4 pt-3"
              />
              <div style={{ maxHeight: 540, overflowY: 'auto' }}>
                {resultado.membros.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px', borderTop: `1px solid ${C.border}`,
                  }}>
                    {m.foto_url ? (
                      <img data-foto-avatar="" src={m.foto_url} alt={m.nome} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
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
