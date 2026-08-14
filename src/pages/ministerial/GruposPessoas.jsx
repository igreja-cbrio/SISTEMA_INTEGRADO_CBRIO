// ============================================================================
// Aba "Pessoas" do /grupos · CENSO de quem está nos grupos
//
// Marcos (2026-06-22): a aba deixou de ser "quem-é-quem na hierarquia" (com a
// linha Lidera/Supervisiona + botão Promover — gestão de papel já vive no
// detalhe do grupo, na Supervisão e no Organograma) e virou um CENSO pra
// filtrar e achar gente: Função · Status de frequência · Última frequência ·
// Grupo. Filtros: busca + grupo + status (+ os cards-contador por função).
//
// Status de frequência = derivado da última presença em encontros de grupo
// (fn_grupos_ultima_frequencia): 🟢 Frequenta ≤30d · 🟡 Atenção 31-60d ·
// 🔴 Ausente >60d (já frequentou e sumiu) · ⚪ Sem presença (nunca teve chamada
// lançada · neutro). A função vem da `funcao` real (o trigger fn_grupo_auto_membro
// mantém visitante→membro no 4º check-in) — sem rebaixar por contagem de presenças.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { grupos as api } from '../../api';
import { Input } from '../../components/ui/input';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Search, Users, GraduationCap, Star, Crown, Eye, UserMinus, ChevronRight } from 'lucide-react';
import Paginacao, { usePaginacaoLocal } from '../../components/Paginacao';
import MarcadoresJornada from '../../components/MarcadoresJornada';
import VinculosDuplicadosBloco from '../../components/grupos/VinculosDuplicadosBloco';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
  green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', violet: '#8b5cf6',
};

// Função efetiva → rótulo/cor/ícone (ordem = hierarquia, do topo pra base)
const PAPEIS = {
  coordenador: { label: 'Coordenador', plural: 'Coordenadores', cor: '#8b5cf6', Icon: Crown },
  supervisor: { label: 'Supervisor', plural: 'Supervisores', cor: '#3b82f6', Icon: Eye },
  lider: { label: 'Líder', plural: 'Líderes', cor: '#00B39D', Icon: Star },
  co_lider: { label: 'Co-líder', plural: 'Co-líderes', cor: '#0ea5e9', Icon: Star },
  lider_treinamento: { label: 'Em treinamento', plural: 'Em treinamento', cor: '#f59e0b', Icon: GraduationCap },
  frequentador: { label: 'Membro', plural: 'Membros', cor: '#10b981', Icon: Users },
  visitante: { label: 'Visitante', plural: 'Visitantes', cor: '#94a3b8', Icon: Users },
};

// Status de frequência (derivado da última presença em grupo · bola colorida).
// Régua alinhada à frequência MENSAL (Marcos 2026-07-23): 1 mês sem presença =
// atenção, 3 meses = ausente. "Sem chamada ainda" é NEUTRO (nunca teve presença
// lançada) — cobre quem acabou de entrar e o período em que a frequência ainda
// não rodou; NÃO alarma.
const STATUS = {
  frequenta: { label: 'Em dia', cor: '#10b981' },              // 🟢 presença no último mês (≤30d)
  atencao: { label: 'Atenção', cor: '#f59e0b' },               // 🟡 1-3 meses sem presença (31-90d)
  ausente: { label: 'Ausente', cor: '#ef4444' },               // 🔴 3+ meses sem presença (>90d)
  sem_presenca: { label: 'Sem chamada ainda', cor: '#94a3b8' },// ⚪ nunca teve presença lançada (neutro)
};

const fmtData = (d) => { if (!d) return null; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

function statusDe(p) {
  if (!p.ultima_frequencia) return 'sem_presenca'; // nunca teve presença lançada (neutro, não vermelho)
  let dias;
  try { dias = Math.floor((Date.now() - new Date(p.ultima_frequencia + 'T12:00:00').getTime()) / 86400000); }
  catch { return 'sem_presenca'; }
  if (dias <= 30) return 'frequenta';   // presença no último mês
  if (dias <= 90) return 'atencao';     // 1 a 3 meses sem presença
  return 'ausente';                     // 3+ meses sem presença
}

// Item somente-leitura da ficha cadastral (modal da pessoa)
function FichaItem({ rotulo, valor }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700 }}>{rotulo}</div>
      <div style={{ color: valor ? C.t2 : C.t3 }}>{valor || '—'}</div>
    </div>
  );
}

// Campo editável da ficha (input pequeno com rótulo)
function FichaCampo({ rotulo, valor, onChange, type = 'text', inputMode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700, marginBottom: 4 }}>{rotulo}</div>
      <input
        type={type}
        inputMode={inputMode}
        value={valor}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 12.5 }}
      />
    </div>
  );
}

// Grupos da pessoa pra exibir/filtrar: participações; se não tiver, cai pros
// grupos que lidera/supervisiona (pra líder/supervisor não ficar sem grupo).
// ⚠️ DEDUPLICA por `grupo_id`. `p.grupos` é uma linha por PARTICIPAÇÃO, e desde
// que a UNIQUE de vínculo ativo foi dropada (20260721170000, pra formalizar o
// multi-grupo) a mesma pessoa pode ter VÁRIAS linhas ativas no MESMO grupo — aí
// a coluna repetia "JOVENS - ESTUDO DA MENSAGEM DO CULTO AMI" 5 vezes na mesma
// pessoa (caso real, 13/08/2026). `gruposDetalhados` já deduplicava com um Map;
// era só esta função que não, então a lista e o modal discordavam da contagem.
function gruposDe(p) {
  const map = new Map();
  (p.grupos || []).forEach(g => {
    if (g.grupo_id && !map.has(g.grupo_id)) map.set(g.grupo_id, { id: g.grupo_id, nome: g.grupo_nome || 'Grupo' });
  });
  [...(p.lidera || []), ...(p.supervisiona || [])].forEach(g => {
    if (g.id && !map.has(g.id)) map.set(g.id, { id: g.id, nome: g.nome || 'Grupo' });
  });
  return [...map.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
}

// Detalhe de CADA grupo da pessoa (participações + grupos que lidera/supervisiona),
// com a função, presenças e entrada — pro modal "ver grupos da pessoa".
function gruposDetalhados(p) {
  const map = new Map();
  (p.grupos || []).forEach(g => map.set(g.grupo_id, {
    id: g.grupo_id, nome: g.grupo_nome || 'Grupo', funcao: g.funcao || 'frequentador',
    presencas: g.presencas || 0, entrou_em: g.entrou_em || null, supervisiona: false,
    participacao_id: g.participacao_id || null,
  }));
  (p.lidera || []).forEach(g => {
    const e = map.get(g.id);
    if (e) e.funcao = 'lider';
    else map.set(g.id, { id: g.id, nome: g.nome || 'Grupo', funcao: 'lider', presencas: 0, entrou_em: null, supervisiona: false });
  });
  (p.supervisiona || []).forEach(g => {
    const e = map.get(g.id);
    if (e) e.supervisiona = true;
    else map.set(g.id, { id: g.id, nome: g.nome || 'Grupo', funcao: 'supervisor', presencas: 0, entrou_em: null, supervisiona: true });
  });
  return [...map.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
}

// ============================================================================
// Aba Pessoas
// ============================================================================
export default function GruposPessoas({ onOpenGrupo, gruposOptions = [], onVerDuplicatas, podeEditarDados = false, podeEditar = false, podeRemoverVinculo = false }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  // Etiqueta "possível duplicata" (Marcos · 14/07): ids que caíram em algum
  // cluster da análise de duplicatas. Falha silenciosa (nível <3 recebe 403).
  const [dupIds, setDupIds] = useState(() => new Set());
  const [dupPares, setDupPares] = useState(0); // nº de casos/pares (a aba Duplicatas mostra isso)
  useEffect(() => {
    api.duplicatas.list()
      .then(r => {
        const s = new Set();
        (r?.clusters || []).forEach(c => c.pessoas.forEach(p => s.add(p.id)));
        setDupIds(s);
        setDupPares((r?.clusters || []).length);
      })
      .catch(() => {});
  }, []);
  const [selected, setSelected] = useState(null); // pessoa aberta no modal de grupos
  const [filtro, setFiltro] = useState('todos');     // função: todos | <papel> | lideres
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  // ⚠️ Declarado AQUI, antes do useMemo que o usa nas deps: array de deps de
  // hook avalia NO RENDER (fix TDZ do reporte do Ariel · PR #2113).
  const [soIncompletos, setSoIncompletos] = useState(false);
  const [busca, setBusca] = useState('');
  // Import do consolidado de participantes (pessoas × grupos)
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importReconciliar, setImportReconciliar] = useState(false);

  async function importAnalisar() {
    if (!importFile) return;
    setImportBusy(true); setImportResult(null);
    try {
      const r = await api.importarParticipantes(importFile, { dryRun: true, reconciliar: importReconciliar });
      setImportPreview(r);
    } catch (e) {
      toast.error(e?.message || 'Erro ao analisar a planilha');
    } finally { setImportBusy(false); }
  }
  async function importAplicar() {
    if (!importFile) return;
    const extra = importReconciliar ? ` Vai DESATIVAR ${importPreview?.desativar_vinculos ?? '?'} vínculos e ${importPreview?.desativar_grupos ?? '?'} grupos fora do consolidado.` : '';
    if (!window.confirm(`Confirma aplicar? Vai criar ${importPreview?.criar ?? '?'} pessoas, atualizar ${importPreview?.atualizar ?? '?'}, criar ${importPreview?.grupos_criar ?? '?'} grupos e ${importPreview?.vinculos_criar ?? '?'} vínculos.${extra}`)) return;
    setImportBusy(true);
    try {
      const r = await api.importarParticipantes(importFile, { dryRun: false, reconciliar: importReconciliar });
      setImportResult(r);
      toast.success(`Importado · ${r.criar} criadas, ${r.vinculos_criar} vínculos${importReconciliar ? `, ${r.desativar_vinculos} desativados` : ''}`);
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Erro ao importar');
    } finally { setImportBusy(false); }
  }

  const carregar = useCallback(async () => {
    try {
      const r = await api.pessoasPapeis();
      setDados(r);
    } catch {
      toast.error('Erro ao carregar pessoas');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Ficha cadastral da pessoa do modal (Marcos · 15/07: editar/limpar
  // dados direto na área de Pessoas). Campo salvo em branco APAGA o dado.
  const [ficha, setFicha] = useState(null);        // dados carregados (ou null)
  const [fichaEditando, setFichaEditando] = useState(false);
  const [fichaForm, setFichaForm] = useState({});
  const [fichaSalvando, setFichaSalvando] = useState(false);
  // CPF já pertence a outro cadastro → mesma pessoa (Marcos · 15/07): em vez
  // de só recusar, oferece fundir os dois na hora escolhendo qual manter.
  const [fichaConflito, setFichaConflito] = useState(null); // { outroId, outroNome }
  useEffect(() => {
    setFicha(null); setFichaEditando(false); setFichaConflito(null);
    if (!selected?.membro_id) return;
    let vivo = true;
    api.pessoaFicha(selected.membro_id)
      .then(f => { if (vivo) setFicha(f); })
      .catch(() => {}); // sem nível/fora do universo → seção não aparece
    return () => { vivo = false; };
  }, [selected?.membro_id]);

  // Frequência da pessoa POR grupo (Marcos 2026-07-23: "vai no A, não vai no B").
  // Mapa grupo_id → { presencas, ultima, status, total_encontros }.
  const [freqPessoa, setFreqPessoa] = useState(null); // { map, tem_encontro } | null
  useEffect(() => {
    setFreqPessoa(null);
    if (!selected?.membro_id) return;
    let vivo = true;
    api.frequenciaPessoa(selected.membro_id)
      .then(r => {
        if (!vivo) return;
        const map = {};
        (r?.grupos || []).forEach(g => { map[g.grupo_id] = g; });
        setFreqPessoa({ map, tem_encontro: !!r?.tem_encontro });
      })
      .catch(() => { if (vivo) setFreqPessoa({ map: {}, tem_encontro: false }); });
    return () => { vivo = false; };
  }, [selected?.membro_id]);

  // Manda pra PRÓPRIA pessoa o link do censo. O servidor decide o canal (a régua
  // e as travas são as mesmas da campanha) e devolve o motivo quando não dá.
  const [pedindoDados, setPedindoDados] = useState(false);
  const pedirDados = async () => {
    if (!selected?.membro_id) return;
    setPedindoDados(true);
    try {
      const r = await api.pedirDadosPessoa(selected.membro_id);
      toast.success(`Pedido enviado por ${(r.canais || []).join(' e ')} — ela completa o cadastro pelo link.`);
    } catch (e) {
      // ⚠️ Motivo em PORTUGUÊS, não slug: "sem_canal" no rodapé de um toast verde
      // foi exatamente o que fez o disparo do censo parecer bem-sucedido em 05/08.
      const MOTIVOS = {
        sem_canal: 'Essa pessoa não tem telefone nem e-mail utilizável no cadastro — preencha um contato primeiro.',
        ja_convidado: 'Ela já foi convidada nesta rodada — aguarde a resposta antes de insistir.',
        template_nao_configurado: 'O canal de WhatsApp não está configurado e ela não tem e-mail.',
        canal_nao_configurado: 'Nenhum canal de envio está configurado no servidor.',
        pessoa_nao_encontrada: 'Cadastro não encontrado.',
      };
      const m = e?.motivo || e?.body?.motivo;
      toast.error(MOTIVOS[m] || e?.detalhe || e?.message || 'Não foi possível enviar o pedido.');
    } finally { setPedindoDados(false); }
  };

  const abrirEdicaoFicha = () => {
    setFichaForm({
      nome: ficha?.nome || '',
      telefone: ficha?.telefone || '',
      email: ficha?.email || '',
      cpf: ficha?.cpf || '',
      data_nascimento: ficha?.data_nascimento || '',
      genero: ficha?.genero || '',
      observacoes: ficha?.observacoes || '',
    });
    setFichaEditando(true);
  };

  const salvarFicha = async () => {
    setFichaSalvando(true);
    try {
      const r = await api.pessoaFichaSalvar(selected.membro_id, fichaForm);
      setFicha(r);
      setFichaEditando(false);
      toast.success('Ficha atualizada');
      if (r.nome !== selected.nome) setSelected(s => ({ ...s, nome: r.nome }));
      // ⚠️ Recarrega SEMPRE (antes só quando o nome mudava): completar CPF ou
      // sexo muda o selo "faltam dados" e pode ter promovido a pessoa de
      // visitante a participante pelo trigger. Sem isto a tela continuaria
      // cobrando um dado que acabou de ser preenchido.
      carregar();
    } catch (e) {
      if (e.codigo === 'cpf_em_uso' && e.outro?.id) setFichaConflito({ outroId: e.outro.id, outroNome: e.outro.nome });
      else toast.error(e.message || 'Erro ao salvar a ficha');
    } finally { setFichaSalvando(false); }
  };

  // Funde os dois cadastros do conflito de CPF. Mantendo o ATUAL, a fusão
  // puxa o CPF do outro (é o mesmo) e o modal continua; mantendo o OUTRO,
  // o cadastro aberto deixa de existir → fecha o modal.
  const fundirConflito = async (keepId) => {
    const mergeId = keepId === selected.membro_id ? fichaConflito.outroId : selected.membro_id;
    setFichaSalvando(true);
    try {
      await api.duplicatas.fundir(keepId, [mergeId]);
      toast.success('Cadastros fundidos em um só — nada se perdeu');
      setFichaConflito(null); setFichaEditando(false);
      if (keepId === selected.membro_id) {
        const f = await api.pessoaFicha(selected.membro_id).catch(() => null);
        if (f) setFicha(f);
      } else {
        setSelected(null);
      }
      carregar();
    } catch (e) { toast.error(e.message || 'Erro ao fundir'); }
    finally { setFichaSalvando(false); }
  };

  // Remover a pessoa de UM grupo direto do modal (Marcos · 18/07): resolver os
  // casos de baixa/nenhuma frequência sem sair da aba Pessoas. Reversível
  // (saiu_em · não apaga histórico), com confirmação, e SÓ pra membro do roster
  // (frequentador/visitante) — líderes/supervisores ficam de fora (regra da
  // "revisão de fim de temporada"). O backend exige grupos nível ≥3 (podeEditar).
  const [saindo, setSaindo] = useState({});
  const sairDoGrupo = async (g) => {
    if (!g.participacao_id || !selected) return;
    if (!window.confirm(`Retirar ${selected.nome} do grupo "${g.nome}"? A pessoa é retirada do grupo (reversível). Faça só se confirmou que ela realmente não participa mais.`)) return;
    setSaindo(s => ({ ...s, [g.participacao_id]: true }));
    try {
      await api.sairMembro(g.participacao_id, { motivo: 'Sem frequência — revisão na aba Pessoas' });
      toast.success(`${selected.nome} não está mais em "${g.nome}"`);
      setSelected(s => s ? { ...s, grupos: (s.grupos || []).filter(x => x.participacao_id !== g.participacao_id) } : s);
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Erro ao remover do grupo');
    } finally {
      setSaindo(s => { const n = { ...s }; delete n[g.participacao_id]; return n; });
    }
  };

  const pessoas = dados?.pessoas || [];

  const contagens = useMemo(() => {
    const c = {};
    Object.keys(PAPEIS).forEach(k => { c[k] = 0; });
    // Frequentador/Visitante = DERIVADOS da presença (Marcos 2026-07-23):
    // foi a ≥1 encontro (tem última frequência) = frequentador; nunca foi = visitante.
    let freq = 0, visit = 0;
    for (const p of pessoas) {
      c[p.papel] = (c[p.papel] || 0) + 1;
      if (p.ultima_frequencia) freq++; else visit++;
    }
    c.lideres_total = (c.lider || 0) + (c.co_lider || 0);
    c.frequentadores = freq;
    c.visitantes = visit;
    c.com_presenca = freq > 0; // a frequência já começou a ser preenchida?
    return c;
  }, [pessoas]);
  const inscritos = dados?.inscritos ?? null; // vínculos (participações)

  const filtradas = useMemo(() => {
    let lista = pessoas;
    if (busca) {
      const s = busca.toLowerCase();
      lista = lista.filter(p =>
        p.nome?.toLowerCase().includes(s) ||
        gruposDe(p).some(g => g.nome?.toLowerCase().includes(s)));
    }
    if (filtro === 'lideres') lista = lista.filter(p => p.papel === 'lider' || p.papel === 'co_lider');
    else if (filtro === 'frequentadores') lista = lista.filter(p => !!p.ultima_frequencia);
    else if (filtro === 'visitantes') lista = lista.filter(p => !p.ultima_frequencia);
    else if (filtro !== 'todos') lista = lista.filter(p => p.papel === filtro);
    if (filtroGrupo !== 'todos') lista = lista.filter(p => gruposDe(p).some(g => g.id === filtroGrupo));
    if (filtroStatus !== 'todos') lista = lista.filter(p => statusDe(p) === filtroStatus);
    // ⚠️ `=== false` (não `!p.cadastro_completo`): bundle novo contra backend
    // antigo traz o campo `undefined`, e a negação simples marcaria TODO MUNDO
    // como incompleto. Ausência de informação não é "faltam dados".
    if (soIncompletos) lista = lista.filter(p => p.cadastro_completo === false);
    return lista;
  }, [pessoas, busca, filtro, filtroGrupo, filtroStatus, soIncompletos]);

  const totalIncompletos = useMemo(
    () => pessoas.filter(p => p.cadastro_completo === false).length,
    [pessoas],
  );

  const { pageItems: filtradasPag, paginacaoProps: gruposPessoasPagProps } = usePaginacaoLocal(filtradas, 25);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando pessoas...</div>;

  // Cards-contador (clicáveis = filtram). Pessoas = distintas; Frequentador/
  // Visitante DERIVAM da presença e só aparecem quando a frequência já começou
  // (Marcos 2026-07-23: até lá, todos são só "inscritos" aguardando a chamada).
  const CARDS = [
    { key: 'todos', label: 'Pessoas', value: pessoas.length, cor: C.text },
    ...(contagens.com_presenca ? [
      { key: 'frequentadores', label: 'Frequentadores', value: contagens.frequentadores, cor: '#10b981' },
      { key: 'visitantes', label: 'Visitantes', value: contagens.visitantes, cor: '#94a3b8' },
    ] : []),
    { key: 'lideres', label: 'Líderes', value: contagens.lideres_total || 0, cor: PAPEIS.lider.cor },
    { key: 'supervisor', label: 'Supervisores', value: contagens.supervisor || 0, cor: PAPEIS.supervisor.cor },
    ...(contagens.coordenador ? [{ key: 'coordenador', label: 'Coordenadores', value: contagens.coordenador, cor: PAPEIS.coordenador.cor }] : []),
    ...(contagens.lider_treinamento ? [{ key: 'lider_treinamento', label: 'Líderes em treinamento', value: contagens.lider_treinamento, cor: PAPEIS.lider_treinamento.cor }] : []),
  ];

  const opcoesGrupo = [...gruposOptions].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  const temFiltro = filtro !== 'todos' || filtroGrupo !== 'todos' || filtroStatus !== 'todos' || soIncompletos || !!busca;

  return (
    <div>
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Pessoas dos grupos</h3>
          <p style={{ fontSize: 12, color: C.t3, margin: '4px 0 0', maxWidth: 660, lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>{pessoas.length} pessoas</strong>
            {inscritos != null && <> · <strong style={{ color: C.text }}>{inscritos} inscrições</strong> (uma pessoa pode estar em vários grupos)</>}.
            Cada pessoa aparece <strong>uma vez</strong>, no papel de maior nível.
            {!contagens.com_presenca && <> <strong style={{ color: '#f59e0b' }}>Frequência ainda não registrada</strong> — todos são inscritos aguardando a 1ª chamada; quando a frequência entrar, aparecem os cards Frequentadores e Visitantes.</>}
          </p>
          {/* Legenda dos status de frequência (dots coloridos · sem emoji) */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
            {[
              [STATUS.frequenta.cor, 'Em dia', 'presença no último mês'],
              [STATUS.atencao.cor, 'Atenção', '1–3 meses sem presença'],
              [STATUS.ausente.cor, 'Ausente', '3+ meses sem presença'],
              [STATUS.sem_presenca.cor, 'Sem chamada ainda', 'nunca teve presença lançada'],
            ].map(([cor, label, hint]) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.t3 }} title={hint}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <button onClick={() => { setImportOpen(true); setImportPreview(null); setImportResult(null); setImportFile(null); }}
          style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Importar participantes
        </button>
      </div>

      {/* Modal · importar consolidado de participantes (dry-run → aplicar) */}
      {importOpen && (
        <div onClick={() => !importBusy && setImportOpen(false)} style={{ position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 14, padding: 20, width: 560, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Importar participantes (XLSX)</h3>
              <button onClick={() => !importBusy && setImportOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: C.t3, cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: C.t3, marginTop: 0 }}>
              Cria quem não existe, ignora quem já existe e completa CPF/telefone faltantes. Não duplica pessoas nem vínculos.
              <strong> Rode "Analisar" primeiro</strong> pra ver a prévia antes de aplicar.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={e => { setImportFile(e.target.files?.[0] || null); setImportPreview(null); setImportResult(null); }} style={{ fontSize: 13, marginBottom: 10, display: 'block' }} />

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: C.text, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={importReconciliar} onChange={e => { setImportReconciliar(e.target.checked); setImportPreview(null); setImportResult(null); }} style={{ marginTop: 2 }} />
              <span><strong>Reconciliar (substituir pela temporada)</strong> — desativa os vínculos e grupos que <u>não estão</u> no consolidado, pra a contagem/mandala bater exatamente o arquivo. Reversível. Deixe a prévia mostrar quantos antes de aplicar.</span>
            </label>

            {(importPreview || importResult) && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, fontSize: 13, color: C.text, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{importResult ? '✅ Resultado' : 'Prévia (nada gravado ainda)'}</div>
                {(() => { const r = importResult || importPreview; return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <span>Pessoas na planilha: <strong>{r.pessoas_planilha}</strong></span>
                    <span>Criar pessoas: <strong>{r.criar}</strong></span>
                    <span>Atualizar (CPF/tel): <strong>{r.atualizar}</strong></span>
                    <span>Ignorar (já existem): <strong>{r.ignorar}</strong></span>
                    <span>Ambíguos (revisar): <strong style={{ color: r.ambiguos ? C.amber : C.text }}>{r.ambiguos}</strong></span>
                    <span>Grupos: <strong>{r.grupos_existentes}</strong> existem / <strong>{r.grupos_criar}</strong> criar</span>
                    <span>Vínculos criar: <strong>{r.vinculos_criar}</strong></span>
                    <span>Vínculos já existem: <strong>{r.vinculos_existentes}</strong></span>
                    {r.desativar_vinculos != null && <span style={{ color: C.red }}>Desativar vínculos: <strong>{r.desativar_vinculos}</strong></span>}
                    {r.desativar_grupos != null && <span style={{ color: C.red }}>Desativar grupos: <strong>{r.desativar_grupos}</strong></span>}
                  </div>
                ); })()}
                {!importResult && importPreview?.ambiguos > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.t3 }}>
                    Ambíguos (mesmo nome de +1 pessoa no sistema · não serão criados/fundidos): {(importPreview.exemplos?.ambiguos || []).slice(0, 8).join(' · ')}…
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={importAnalisar} disabled={!importFile || importBusy} style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: importFile && !importBusy ? 'pointer' : 'not-allowed', opacity: !importFile || importBusy ? 0.6 : 1 }}>
                {importBusy && !importResult ? 'Analisando…' : 'Analisar (prévia)'}
              </button>
              <button onClick={importAplicar} disabled={!importPreview || importBusy || importResult} style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: importPreview && !importBusy && !importResult ? 'pointer' : 'not-allowed', opacity: !importPreview || importBusy || importResult ? 0.6 : 1 }}>
                {importBusy && importPreview ? 'Aplicando…' : 'Aplicar import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso de duplicatas — leva pra visualização de resolução */}
      {dupIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '9px 14px', marginBottom: 12, borderRadius: 10,
          background: `${C.amber}14`, border: `1px solid ${C.amber}55`, fontSize: 12.5, color: C.text,
        }}>
          <span>
            <strong>{dupIds.size}</strong> pessoa{dupIds.size === 1 ? '' : 's'}
            {dupPares > 0 && <> em <strong>{dupPares}</strong> possíve{dupPares === 1 ? 'l duplicata' : 'is duplicatas'}</>}
            {' '}com cadastro duplicado — as linhas marcadas abaixo precisam de revisão.
            {dupPares > 0 && <span style={{ color: C.t3 }}> (a aba Duplicatas mostra os {dupPares} casos; aqui contamos as {dupIds.size} pessoas envolvidas).</span>}
          </span>
          {onVerDuplicatas && (
            <button onClick={onVerDuplicatas} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: 0 }}>
              Resolver duplicatas →
            </button>
          )}
        </div>
      )}

      {/* Cards-filtro por função */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10, marginBottom: 12 }}>
        {CARDS.map(k => {
          const ativo = filtro === k.key;
          return (
            <button key={k.key} onClick={() => setFiltro(k.key)} style={{
              background: ativo ? `${k.cor}12` : C.card, borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer',
              border: ativo ? `2px solid ${k.cor}` : `1px solid ${C.border}`, transition: 'border-color 0.12s',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.cor }}>{k.value}</div>
              <div style={{ fontSize: 11, color: ativo ? k.cor : C.t3, fontWeight: ativo ? 600 : 400 }}>{k.label}</div>
            </button>
          );
        })}
      </div>

      {/* Controles: busca + grupo + status */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
          <Input placeholder="Buscar por nome ou grupo..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
        <ShadSelect value={filtroGrupo} onValueChange={setFiltroGrupo}>
          <SelectTrigger style={{ width: 200 }}><SelectValue placeholder="Grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os grupos</SelectItem>
            {opcoesGrupo.map(g => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
          </SelectContent>
        </ShadSelect>
        <ShadSelect value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger style={{ width: 170 }}><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
          </SelectContent>
        </ShadSelect>
        {/* Fila de trabalho do cadastro. Só aparece quando há o que fazer —
            chip permanente marcando zero vira ruído. */}
        {totalIncompletos > 0 && (
          <button
            type="button"
            onClick={() => setSoIncompletos(v => !v)}
            title="Pessoas sem os dados que a inscrição pede (nome completo, CPF, telefone, e-mail, nascimento, sexo)"
            style={{
              background: soIncompletos ? '#64748b' : C.card,
              color: soIncompletos ? '#fff' : C.text,
              border: `1px solid ${soIncompletos ? '#64748b' : C.border}`,
              borderRadius: 10, padding: '0 14px', height: 36,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            Faltam dados · {totalIncompletos}
          </button>
        )}
      </div>

      {/* Saneamento: a MESMA pessoa com 2+ linhas ativas no MESMO grupo.
          Bloco recolhível aqui em cima (não aba nova · a Caixa de entrada dos
          Grupos já provou que separar em aba faz ninguém achar). O cabeçalho
          carrega a contagem, então recolhido não esconde que há trabalho. */}
      <VinculosDuplicadosBloco podeResolver={podeRemoverVinculo} onResolvido={carregar} />

      {/* Lista */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.t3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{filtradas.length} pessoa{filtradas.length !== 1 ? 's' : ''}</span>
          {temFiltro && (
            <button onClick={() => { setFiltro('todos'); setFiltroGrupo('todos'); setFiltroStatus('todos'); setSoIncompletos(false); setBusca(''); }}
              style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Limpar filtros
            </button>
          )}
        </div>
        {filtradas.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Ninguém nesse filtro.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                  {['Pessoa', 'Função', 'Status', 'Jornada', 'Grupo', 'Última frequência', 'Último envio', 'Presenças'].map((h, i, arr) => (
                    <th key={h} style={{ textAlign: i === arr.length - 1 ? 'right' : 'left', padding: '8px 16px', fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradasPag.map(p => {
                  const pap = PAPEIS[p.papel] || PAPEIS.frequentador;
                  const st = STATUS[statusDe(p)];
                  const gs = gruposDe(p);
                  return (
                    <tr key={p.membro_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '10px 16px' }}>
                        <button
                          type="button"
                          onClick={() => setSelected(p)}
                          title="Ver grupos da pessoa"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.foto_url ? `url(${p.foto_url}) center/cover` : `${pap.cor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: pap.cor }}>
                            {!p.foto_url && (p.nome?.charAt(0) || '?')}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>{p.nome}</span>
                          {dupIds.has(p.membro_id) && (
                            <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: `${C.amber}20`, color: C.amber, fontWeight: 700, whiteSpace: 'nowrap' }}>
                              Possível duplicata
                            </span>
                          )}
                          {/* ⚠️ É esta a fila de trabalho do "pegar os dados
                              dele" (Matheus · 13/08). Sem o selo, ninguém sabe
                              de quem cobrar — e o visitante fica visitante pra
                              sempre porque o cadastro nunca fecha. O que falta
                              vem do SERVIDOR (mesma régua do trigger que
                              promove); os VALORES não trafegam. */}
                          {p.cadastro_completo === false && (
                            <span
                              title={`Falta: ${(p.cadastro_rotulos || []).join(' · ')}`}
                              style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: '#64748b20', color: '#64748b', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              Faltam dados
                            </span>
                          )}
                        </button>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${pap.cor}18`, color: pap.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <pap.Icon size={10} /> {pap.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${st.cor}18`, color: st.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.cor }} /> {st.label}
                        </span>
                      </td>
                      {/* Jornada — é ESTA a coluna do pedido do Pr. Nélio via
                          Arthur Serpa: o líder olha a turma e vê em que etapa
                          cada um está. Generosidade não vem pra quem só tem o
                          módulo `grupos` (o servidor decide). */}
                      <td style={{ padding: '10px 16px', maxWidth: 210 }}>
                        <MarcadoresJornada marcadores={p.marcadores} />
                      </td>
                      {/* Coluna Grupo · CONSOLIDADA (pedido do Matheus, 13/08/2026:
                          "tem pessoas que estão em mais de um grupo e a lista fica
                          feia"). Quem está em 1 grupo já aparece de cara; quem está
                          em vários vira um chip "N grupos" que abre no clique.
                          ⚠️ Nomes de grupo são longos ("ONLINE - MULHER ÚNICA") e
                          juntá-los com vírgula fazia a linha da pessoa quebrar em
                          3-4 alturas — a tabela deixava de ser varrível, que é a
                          única coisa que esta aba faz. */}
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.t2, maxWidth: 260 }}>
                        {gs.length === 0 ? (
                          <span style={{ color: C.t3 }}>Sem grupo</span>
                        ) : gs.length === 1 ? (
                          <button onClick={() => onOpenGrupo?.(gs[0].id)} title={gs[0].nome}
                            style={{ background: 'none', border: 'none', padding: 0, color: C.t2, cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left' }}>
                            {gs[0].nome}
                          </button>
                        ) : (
                          // ⚠️ ABRE O MODAL DA PESSOA, não expande na linha
                          // (Matheus, 13/08/2026: "queria que abrisse um pop up,
                          // acho mais amigável"). A 1ª versão expandia inline e a
                          // linha virava uma coluna de nomes quebrados de 700px
                          // de altura. O modal já existe, já deduplica e ainda
                          // mostra função, desde quando e frequência POR GRUPO —
                          // não valia construir um segundo popup ao lado dele.
                          <button onClick={() => setSelected(p)}
                            title={gs.map(g => g.nome).join(' · ')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: `${C.primary}14`, border: `1px solid ${C.primary}33`, borderRadius: 99, padding: '2px 9px', color: C.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {gs.length} grupos <ChevronRight size={12} />
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: p.ultima_frequencia ? C.t2 : C.t3, whiteSpace: 'nowrap' }}>
                        {p.ultima_frequencia ? fmtData(p.ultima_frequencia) : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: p.ultimo_envio ? C.t2 : C.t3, whiteSpace: 'nowrap' }}
                          title={p.ultimo_envio ? `Último: ${p.ultimo_envio.template || 'mensagem'}` : 'Nenhum envio de grupos registrado'}>
                        {p.ultimo_envio?.em ? fmtData(String(p.ultimo_envio.em).slice(0, 10)) : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.t2, textAlign: 'right' }}>
                        {p.presencas_total || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Paginacao {...gruposPessoasPagProps} itemLabel="pessoas" />
      </div>

      {/* Modal · grupos da pessoa */}
      {selected && (() => {
        const pap = PAPEIS[selected.papel] || PAPEIS.frequentador;
        const gs = gruposDetalhados(selected);
        return (
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 14, width: 520, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', border: `1px solid ${C.border}` }}>
              {/* Cabeçalho */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 20, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: selected.foto_url ? `url(${selected.foto_url}) center/cover` : `${pap.cor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, fontWeight: 700, color: pap.cor }}>
                  {!selected.foto_url && (selected.nome?.charAt(0) || '?')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{selected.nome}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: pap.cor, fontWeight: 700 }}>
                    <pap.Icon size={11} /> {pap.label}
                  </div>
                  {/* Contexto pra decidir a remoção: status de frequência + última presença */}
                  {(() => { const st = STATUS[statusDe(selected)]; return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${st.cor}18`, color: st.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.cor }} /> {st.label}
                      </span>
                      <span style={{ fontSize: 11, color: C.t3 }}>
                        {selected.ultima_frequencia ? `última presença ${fmtData(selected.ultima_frequencia)}` : 'sem presença registrada'}
                      </span>
                    </div>
                  ); })()}
                  {/* Jornada por extenso · aqui cabe o rótulo completo */}
                  <div style={{ marginTop: 7 }}>
                    <MarcadoresJornada marcadores={selected.marcadores} variante="ficha" />
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 22, lineHeight: 1, color: C.t3, cursor: 'pointer' }}>×</button>
              </div>

              {/* Ficha cadastral · ver + editar (limpar um campo apaga o dado) */}
              {ficha && (
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Dados da pessoa</span>
                    {podeEditarDados && !fichaEditando && (
                      <button onClick={abrirEdicaoFicha} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}>
                        Editar dados
                      </button>
                    )}
                  </div>

                  {fichaConflito ? (
                    <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}55`, borderRadius: 10, padding: 12 }}>
                      <p style={{ fontSize: 12.5, color: C.text, margin: '0 0 10px', lineHeight: 1.6 }}>
                        Este CPF já pertence ao cadastro de <strong>{fichaConflito.outroNome}</strong>.
                        Mesmo CPF é a mesma pessoa — em vez de dois cadastros, funda os dois em um.
                        Nada se perde: o histórico é movido e os dados diferentes são somados nas observações.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button onClick={() => fundirConflito(selected.membro_id)} disabled={fichaSalvando}
                          style={{ background: C.primary, border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, color: '#fff', cursor: fichaSalvando ? 'wait' : 'pointer', textAlign: 'left' }}>
                          Manter «{selected.nome}» e fundir o outro cadastro neste
                        </button>
                        <button onClick={() => fundirConflito(fichaConflito.outroId)} disabled={fichaSalvando}
                          style={{ background: 'transparent', border: `1px solid ${C.primary}`, borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, color: C.primary, cursor: fichaSalvando ? 'wait' : 'pointer', textAlign: 'left' }}>
                          Manter «{fichaConflito.outroNome}» e fundir este cadastro nele
                        </button>
                        <button onClick={() => setFichaConflito(null)} disabled={fichaSalvando}
                          style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', fontSize: 12, padding: '2px 0', textAlign: 'left' }}>
                          Cancelar — voltar pra edição
                        </button>
                      </div>
                    </div>
                  ) : !fichaEditando ? (
                    <>
                    {/* ⚠️ "O líder deve ter o papel de pegar os dados dele"
                        (Matheus · 13/08). Quem PREENCHE é a própria pessoa, pelo
                        link pessoal do censo enviado ao contato DELA — o link
                        abre o cadastro preenchido e editável, então ele nunca
                        passa por quem clica aqui. Quando o cadastro fecha, o
                        trigger promove visitante → participante sozinho. */}
                    {selected?.cadastro_completo === false && (
                      <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: '#64748b12', border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 12, color: C.text, fontWeight: 600, marginBottom: 2 }}>
                          Faltam dados: {(selected.cadastro_rotulos || []).join(' · ')}
                        </div>
                        <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.5, marginBottom: 8 }}>
                          Preencha na ficha se você já tem os dados. Se não tiver, peça — a pessoa
                          recebe um link pessoal e completa o cadastro dela mesma.
                        </div>
                        <button onClick={pedirDados} disabled={pedindoDados}
                          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: C.text, cursor: pedindoDados ? 'wait' : 'pointer' }}>
                          {pedindoDados ? 'Enviando…' : 'Pedir os dados à pessoa'}
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 16px', fontSize: 12.5 }}>
                      <FichaItem rotulo="Telefone" valor={ficha.telefone} />
                      <FichaItem rotulo="E-mail" valor={ficha.email} />
                      <FichaItem rotulo="CPF" valor={ficha.cpf} />
                      <FichaItem rotulo="Nascimento" valor={ficha.data_nascimento ? fmtData(ficha.data_nascimento) : null} />
                      <FichaItem rotulo="Sexo" valor={ficha.genero} />
                      {ficha.observacoes && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700 }}>Observações</div>
                          <div style={{ color: C.t2, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{ficha.observacoes}</div>
                        </div>
                      )}
                    </div>
                    </>
                  ) : (
                    <div>
                      <p style={{ fontSize: 11.5, color: C.amber, margin: '0 0 10px', lineHeight: 1.5 }}>
                        Deixar um campo em branco <strong>apaga o dado</strong> da ficha ao salvar. Toda alteração fica registrada na auditoria.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                        <FichaCampo rotulo="Nome completo" valor={fichaForm.nome} onChange={v => setFichaForm(f => ({ ...f, nome: v }))} />
                        <FichaCampo rotulo="Telefone" valor={fichaForm.telefone} onChange={v => setFichaForm(f => ({ ...f, telefone: v }))} inputMode="tel" />
                        <FichaCampo rotulo="E-mail" valor={fichaForm.email} onChange={v => setFichaForm(f => ({ ...f, email: v }))} type="email" />
                        <FichaCampo rotulo="CPF" valor={fichaForm.cpf} onChange={v => setFichaForm(f => ({ ...f, cpf: v }))} inputMode="numeric" />
                        <div>
                          <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700, marginBottom: 4 }}>Nascimento</div>
                          <BirthDatePicker value={fichaForm.data_nascimento || ''} onChange={v => setFichaForm(f => ({ ...f, data_nascimento: v }))} />
                        </div>
                        {/* ⚠️ Sexo ENTROU em 13/08: o GET da ficha já o trazia e
                            o PATCH o descartava, então era impossível fechar um
                            cadastro por aqui — e é um dos 6 campos que a régua
                            exige. `masculino|feminino`, nunca "outro" (canônico
                            do Contrato de Inscrição em todas as 7 portas). */}
                        <div>
                          <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700, marginBottom: 4 }}>Sexo</div>
                          <select
                            value={String(fichaForm.genero || '').toLowerCase() === 'm' ? 'masculino'
                              : String(fichaForm.genero || '').toLowerCase() === 'f' ? 'feminino'
                                : (fichaForm.genero || '')}
                            onChange={e => setFichaForm(f => ({ ...f, genero: e.target.value }))}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 12.5, fontFamily: 'inherit' }}>
                            <option value="">Não informado</option>
                            <option value="masculino">Masculino</option>
                            <option value="feminino">Feminino</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700, marginBottom: 4 }}>Observações</div>
                        <textarea
                          value={fichaForm.observacoes}
                          onChange={e => setFichaForm(f => ({ ...f, observacoes: e.target.value }))}
                          rows={3}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                        <button onClick={() => setFichaEditando(false)} disabled={fichaSalvando}
                          style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: C.t2, cursor: 'pointer' }}>
                          Cancelar
                        </button>
                        <button onClick={salvarFicha} disabled={fichaSalvando}
                          style={{ background: C.primary, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: fichaSalvando ? 'wait' : 'pointer' }}>
                          {fichaSalvando ? 'Salvando...' : 'Salvar ficha'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lista de grupos */}
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
                  {gs.length} grupo{gs.length !== 1 ? 's' : ''}
                </div>
                {gs.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Não participa de nenhum grupo.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {gs.map(g => {
                      const fp = PAPEIS[g.funcao] || { label: g.funcao || 'Membro', cor: C.t2, Icon: Users };
                      // Frequência DESTE grupo (Marcos 2026-07-23: vai no A, não no B)
                      const fg = freqPessoa?.map?.[g.id];
                      const stg = fg ? STATUS[fg.status] : null;
                      return (
                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <button
                              onClick={() => { setSelected(null); onOpenGrupo?.(g.id); }}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'left' }}
                            >
                              {g.nome}
                            </button>
                            <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                              {g.entrou_em ? `desde ${fmtData(g.entrou_em)}` : 'participante'}
                              {fg && fg.total_encontros > 0
                                ? ` · ${fg.presencas}/${fg.total_encontros} encontro${fg.total_encontros !== 1 ? 's' : ''}`
                                : (g.presencas ? ` · ${g.presencas} presença${g.presencas !== 1 ? 's' : ''}` : '')}
                              {g.supervisiona ? ' · supervisiona' : ''}
                            </div>
                            {/* Status de frequência NESTE grupo · só quando já houve chamada */}
                            {stg && fg.total_encontros > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${stg.cor}18`, color: stg.cor, fontWeight: 700 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: stg.cor }} />
                                {fg.status === 'sem_presenca' ? 'não foi ainda' : stg.label}
                                {fg.ultima ? ` · ${fmtData(fg.ultima)}` : ''}
                              </span>
                            )}
                          </div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${fp.cor}18`, color: fp.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            <fp.Icon size={10} /> {fp.label}
                          </span>
                          {/* Retirar do grupo · só membro do roster (não líder/supervisor) e com nível ≥3 */}
                          {podeEditar && g.participacao_id && !g.supervisiona && (g.funcao === 'frequentador' || g.funcao === 'visitante') && (
                            <button
                              onClick={() => sairDoGrupo(g)}
                              disabled={!!saindo[g.participacao_id]}
                              title="Retirar do grupo (reversível)"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 9px', fontSize: 11, fontWeight: 600, color: saindo[g.participacao_id] ? C.t3 : C.red, cursor: saindo[g.participacao_id] ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                            >
                              <UserMinus size={12} /> {saindo[g.participacao_id] ? 'Retirando…' : 'Retirar do grupo'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
