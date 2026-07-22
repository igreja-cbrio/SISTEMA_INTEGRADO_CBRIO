// ============================================================================
// Caixa de entrada UNIFICADA do /grupos (Marcos · 2026-07-13)
//
// Uma lista corrida com TUDO que quer entrar em grupo, ordenada por data:
//  · pedido de inscrição — a pessoa escolheu um grupo no form/QR (sem label);
//  · pessoa direcionada pelo NEXT — ainda sem grupo definido (label "Next";
//    precisa de contato + devolutiva; "engajou" matricula direto no grupo);
//  · NOVO LÍDER/ANFITRIÃO — candidatura do form público /inscricao-lideres
//    (Marcos 17/07). Fluxo assistido, SEM WhatsApp: aceitar/recusar e, no
//    aceite, vincular a um grupo existente (como MAIS UM líder/anfitrião/
//    líder em treinamento — nunca substitui o líder principal) ou criar um
//    grupo novo já com a pessoa de líder (abre o form de grupo pré-preenchido).
// Sem sub-abas nem botões de status: coluna de Status + filtros discretos
// (origem · status · período · busca) e ações na própria linha expandida.
//
// Público: funcionários da triagem (Naná/Nélio) — líder NÃO acessa a
// plataforma (ele aprova pelo link do WhatsApp; app mobile vem depois).
// ============================================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { grupos as api, encaminhamentos as encApi } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import { Check, X, Mail, Phone, Search, ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import Paginacao, { usePaginacaoLocal } from '../../components/Paginacao';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', greenBg: '#10b98120',
  red: '#ef4444', redBg: '#ef444420',
  amber: '#f59e0b', amberBg: '#f59e0b20',
  violet: '#8b5cf6', violetBg: '#8b5cf620',
  blue: '#3b82f6', blueBg: '#3b82f620',
};

// Status por linha — pedidos e direcionados do Next lado a lado na mesma coluna.
// Ciclo dinâmico (Marcos 13/07): Recusado → Encaminhado → Aprovado (aqui ou
// em outro pedido da pessoa → "Aprovada em outro grupo").
const STATUS_ROW = {
  pendente: { label: 'Pendente · líder', cor: C.amber, bg: C.amberBg },
  devolvido: { label: 'Recusado · na triagem', cor: C.violet, bg: C.violetBg },
  encaminhado: { label: 'Encaminhado', cor: C.blue, bg: C.blueBg },
  aprovado: { label: 'Aprovado', cor: C.green, bg: C.greenBg },
  rejeitado: { label: 'Rejeitado', cor: C.red, bg: C.redBg },
  cancelado: { label: 'Cancelado', cor: C.t3, bg: C.bg },
  resolvido: { label: 'Aprovada em outro grupo', cor: C.green, bg: C.greenBg },
  enc_pendente: { label: 'A contatar', cor: C.blue, bg: C.blueBg },
  enc_nao_respondeu: { label: 'Não respondeu', cor: C.amber, bg: C.amberBg },
  enc_em_duvida: { label: 'Em dúvida', cor: C.amber, bg: C.amberBg },
  enc_engajou: { label: 'Engajou', cor: C.green, bg: C.greenBg },
  enc_sem_interesse: { label: 'Sem interesse', cor: C.t3, bg: C.bg },
  // Candidaturas de líder/anfitrião (form /inscricao-lideres)
  lid_pendente: { label: 'Novo · a conversar', cor: C.amber, bg: C.amberBg },
  lid_aceito: { label: 'Aceito · a vincular', cor: C.blue, bg: C.blueBg },
  lid_vinculado: { label: 'Vinculado', cor: C.green, bg: C.greenBg },
  lid_recusado: { label: 'Recusado', cor: C.red, bg: C.redBg },
  // Renovação de temporada — líder respondeu que NÃO continua (triagem)
  ren_nao_continua: { label: 'Líder não continua', cor: C.red, bg: C.redBg },
  ren_triada: { label: 'Renovação triada', cor: C.green, bg: C.greenBg },
};

// Filtro de status agrupa os dois ciclos num vocabulário só. Rótulo curto na
// opção-tudo (Marcos · 14/07): o select fechado vira o nome do filtro.
const FILTRO_STATUS = [
  { key: 'todos', label: 'Status', casa: null },
  { key: 'pendente', label: 'Pendentes (líder)', casa: ['pendente'] },
  { key: 'devolvido', label: 'Recusados (na triagem)', casa: ['devolvido'] },
  { key: 'encaminhado', label: 'Encaminhados', casa: ['encaminhado'] },
  { key: 'a_contatar', label: 'Next · a contatar', casa: ['enc_pendente', 'enc_nao_respondeu', 'enc_em_duvida'] },
  { key: 'lideres_decidir', label: 'Novos líderes · a decidir', casa: ['lid_pendente', 'lid_aceito'] },
  { key: 'renovacao_triagem', label: 'Renovação · líder não continua', casa: ['ren_nao_continua'] },
  { key: 'aprovado', label: 'Aprovados / engajaram', casa: ['aprovado', 'resolvido', 'enc_engajou', 'lid_vinculado'] },
  { key: 'rejeitado', label: 'Rejeitados / sem interesse', casa: ['rejeitado', 'cancelado', 'enc_sem_interesse', 'lid_recusado'] },
];

// Funções possíveis do vínculo do novo líder num grupo EXISTENTE — entra como
// MAIS UM no roster; o líder principal (quem recebe o WhatsApp de aprovação)
// só muda se a equipe trocar na tela do grupo (Marcos · 17/07).
const FUNCOES_VINCULO = [
  { key: 'lider', label: 'Líder (mais um líder do grupo)' },
  { key: 'anfitriao', label: 'Anfitrião (cede a casa)' },
  { key: 'lider_treinamento', label: 'Líder em treinamento' },
];

const FILTRO_PERIODO = [
  { dias: 30, label: 'Últimos 30 dias' },
  { dias: 60, label: 'Últimos 60 dias' },
  { dias: 90, label: 'Últimos 90 dias' },
  { dias: 180, label: 'Últimos 180 dias' },
  { dias: 365, label: 'Último ano' },
  { dias: 1825, label: 'Últimos 5 anos' },
];

// Motivos prontos pra sugestão de outro grupo — é a frase que a PESSOA recebe
// no WhatsApp (o motivo interno do líder nunca sai do sistema).
const MOTIVOS_SUGESTAO = [
  'O grupo que você escolheu está com as vagas preenchidas',
  'O grupo que você escolheu não vai abrir nesta temporada',
  'O grupo que você escolheu mudou de dia e horário',
];

const DEVOLUTIVAS = [
  { key: 'nao_respondeu', label: 'Não respondeu' },
  { key: 'em_duvida', label: 'Ficou em dúvida' },
  { key: 'engajou', label: 'Engajou — entrou num grupo' },
  { key: 'sem_interesse', label: 'Sem interesse' },
];

const CANAIS = ['WhatsApp', 'Ligação', 'Pessoalmente'];

// Origem do pedido de inscrição (mem_grupo_pedidos.origem) → rótulo legível.
// A pessoa se inscreveu por algum canal; a coluna Origem mostra qual. Fallback
// humaniza qualquer valor novo (capitaliza + troca _ por espaço).
const ORIGEM_PEDIDO = {
  formulario_publico: 'Formulário',
  cadastro_interno: 'Cadastro manual',
  app: 'App',
  membresia_totem: 'Totem',
  totem: 'Totem',
  mapa: 'Mapa',
};
const labelOrigemPedido = (o) => {
  if (!o) return null;
  return ORIGEM_PEDIDO[o] || (o.charAt(0).toUpperCase() + o.slice(1).replace(/_/g, ' '));
};

const selStyle = {
  padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 12.5, background: 'var(--cbrio-input-bg)', color: C.text, minWidth: 150,
};

const fmtData = (d) => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return ''; } };

export default function GruposEntrada({ podeEditar = false, onMudou, onCriarGrupoParaLider, reloadKey = 0 }) {
  const [pedidos, setPedidos] = useState([]);
  const [encs, setEncs] = useState([]);
  const [lideresInsc, setLideresInsc] = useState([]);
  const [renovacoes, setRenovacoes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [busca, setBusca] = useState('');
  const [fOrigem, setFOrigem] = useState('todas');   // todas | inscricao | next
  const [fStatus, setFStatus] = useState('todos');
  const [fPeriodo, setFPeriodo] = useState(180);

  const [expandedId, setExpandedId] = useState(null);
  // Sub-painéis da linha de PEDIDO (mesma máquina do fluxo aprovar/recusar/sugerir)
  const [rejectingId, setRejectingId] = useState(null);
  const [motivoRej, setMotivoRej] = useState('');
  const [sugerindoId, setSugerindoId] = useState(null);
  const [grupoSugestao, setGrupoSugestao] = useState('');
  const [motivoSel, setMotivoSel] = useState('');
  const [motivoLivre, setMotivoLivre] = useState('');
  const [gruposAtivos, setGruposAtivos] = useState(null); // lazy
  const [enviandoSugestao, setEnviandoSugestao] = useState(false);
  // Painel de devolutiva da linha do NEXT
  const [devDevolutiva, setDevDevolutiva] = useState('');
  const [devCanal, setDevCanal] = useState('WhatsApp');
  const [devObs, setDevObs] = useState('');
  const [devGrupoId, setDevGrupoId] = useState('');
  const [salvandoDev, setSalvandoDev] = useState(false);
  // Sub-painéis da linha de NOVO LÍDER/ANFITRIÃO
  const [lidRecusandoId, setLidRecusandoId] = useState(null);
  const [lidMotivoRec, setLidMotivoRec] = useState('');
  const [lidVinculandoId, setLidVinculandoId] = useState(null);
  const [lidVincGrupoId, setLidVincGrupoId] = useState('');
  const [lidVincFuncao, setLidVincFuncao] = useState('lider');
  const [lidAcaoLoading, setLidAcaoLoading] = useState(false);
  // Aprovação em lote (renovações chegam em bloco)
  const [selected, setSelected] = useState(() => new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // Histórico do pedido (linha do tempo) — carregado ao expandir, cacheado
  const [eventosCache, setEventosCache] = useState({}); // pedidoId → rows | 'loading'
  const carregarEventos = async (pedidoId) => {
    let jaTem = false;
    setEventosCache(prev => {
      jaTem = prev[pedidoId] && prev[pedidoId] !== 'loading';
      return jaTem ? prev : { ...prev, [pedidoId]: 'loading' };
    });
    if (jaTem) return;
    try {
      const evs = await api.pedidoEventos(pedidoId);
      setEventosCache(prev => ({ ...prev, [pedidoId]: Array.isArray(evs) ? evs : [] }));
    } catch {
      setEventosCache(prev => ({ ...prev, [pedidoId]: [] }));
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const desde = new Date(Date.now() - fPeriodo * 86400000).toISOString();
      const [peds, encRows, lidRows, renRows] = await Promise.all([
        api.listarPedidos({ desde }),
        encApi.list({ destino: 'grupos' }).catch(() => []),
        // Terceira origem: candidaturas de líder/anfitrião (falha silenciosa
        // enquanto a migration não estiver aplicada — a caixa segue de pé).
        api.liderInscricoes.list({ desde }).catch(() => []),
        // Quarta origem: renovação de temporada — líderes que responderam que
        // NÃO continuam (aguardando triagem). Mesma tolerância a migration.
        api.renovacao.painel({ status: 'nao_continua' }).then(r => r?.rows || []).catch(() => []),
      ]);
      setPedidos(Array.isArray(peds) ? peds : []);
      setEncs(Array.isArray(encRows) ? encRows : []);
      setLideresInsc(Array.isArray(lidRows) ? lidRows : []);
      setRenovacoes(Array.isArray(renRows) ? renRows : []);
      setSelected(new Set());
    } catch {
      toast.error('Erro ao carregar a caixa de entrada');
    } finally {
      setLoading(false);
    }
  }, [fPeriodo]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const depois = () => { setEventosCache({}); load(); onMudou?.(); };

  // ── Normalização: pedido + direcionado do Next viram linhas da MESMA lista ──
  // rowsBase respeita origem + período + busca, mas NÃO o filtro de status:
  // os cards do resumo leem daqui (retrato por status do conjunto filtrado ·
  // Marcos 14/07) — assim, filtrar um status não zera os outros cards.
  const rowsBase = useMemo(() => {
    const desdeMs = Date.now() - fPeriodo * 86400000;
    const lista = [];
    for (const p of pedidos) {
      lista.push({
        tipo: 'pedido', key: `p_${p.id}`, data: p.created_at,
        nome: p.nome, telefone: p.telefone, email: p.email,
        // Cancelado porque a pessoa entrou em OUTRO grupo → "Aprovada em outro grupo"
        statusKey: p.status === 'cancelado' && p.resolvido_grupo_id ? 'resolvido' : p.status,
        veioNext: p.veio_next === true,
        origem: p.origem || null,
        grupoNome: p.mem_grupos?.nome || null, grupoCodigo: p.mem_grupos?.codigo || null,
        raw: p,
      });
    }
    for (const e of encs) {
      const quando = e.encaminhado_em || e.created_at;
      if (quando && new Date(quando).getTime() < desdeMs) continue;
      lista.push({
        tipo: 'enc', key: `e_${e.id}`, data: quando,
        nome: e.nome, telefone: e.telefone, email: null,
        statusKey: `enc_${e.status || 'pendente'}`,
        veioNext: e.origem === 'next',
        origemLabel: e.origem === 'next' ? 'Next' : 'Cuidados',
        grupoNome: null, grupoCodigo: null,
        raw: e,
      });
    }
    for (const l of lideresInsc) {
      lista.push({
        tipo: 'lider', key: `l_${l.id}`, data: l.created_at,
        nome: l.nome, telefone: l.telefone, email: l.email,
        statusKey: `lid_${l.status || 'pendente'}`,
        veioNext: false,
        // Vinculado mostra o grupo em que a pessoa entrou
        grupoNome: l.mem_grupos?.nome || null, grupoCodigo: l.mem_grupos?.codigo || null,
        raw: l,
      });
    }
    for (const r of renovacoes) {
      if (!r.renovacao) continue;
      const quando = r.renovacao.ultima_resposta_em || r.renovacao.enviado_em;
      if (quando && new Date(quando).getTime() < desdeMs) continue;
      lista.push({
        tipo: 'renov', key: `r_${r.renovacao.id}`, data: quando,
        nome: r.lider_nome || 'Líder', telefone: r.lider_telefone, email: null,
        statusKey: `ren_${r.renovacao.status}`,
        veioNext: false,
        grupoNome: r.grupo_nome || null, grupoCodigo: r.grupo_codigo || null,
        raw: r,
      });
    }

    const s = busca.trim().toLowerCase();
    return lista
      .filter(r => {
        if (fOrigem === 'next' && !r.veioNext) return false;
        if (fOrigem === 'inscricao' && (r.tipo !== 'pedido' || r.veioNext)) return false;
        if (fOrigem === 'lideres' && r.tipo !== 'lider') return false;
        if (fOrigem === 'renovacao' && r.tipo !== 'renov') return false;
        if (s) {
          const alvo = [r.nome, r.telefone, r.email, r.grupoNome, r.grupoCodigo].filter(Boolean).join(' ').toLowerCase();
          if (!alvo.includes(s)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.data) - new Date(a.data));
  }, [pedidos, encs, lideresInsc, renovacoes, busca, fOrigem, fPeriodo]);

  const rows = useMemo(() => {
    const bucket = FILTRO_STATUS.find(f => f.key === fStatus)?.casa || null;
    return bucket ? rowsBase.filter(r => bucket.includes(r.statusKey)) : rowsBase;
  }, [rowsBase, fStatus]);

  // ── Cards do resumo — derivados das linhas filtradas (substitui o
  // GET /pedidos/resumo global, que ignorava os filtros e contava "Recusados
  // na triagem" só pelo status novo 'devolvido' — recusas antigas ficaram
  // 'rejeitado' e o card mostrava 0 mesmo com recusados na lista). ──
  const estat = useMemo(() => {
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const agora = Date.now();
    let hoje = 0, pendentes = 0, pend24 = 0, pend72 = 0;
    let devolvidos = 0, rejeitados = 0, aprovados = 0;
    let somaDecisaoMs = 0, nDecididos = 0;
    for (const r of rowsBase) {
      if (new Date(r.data) >= hoje0) hoje += 1;
      if (r.tipo !== 'pedido') continue;
      if (r.statusKey === 'pendente') {
        pendentes += 1;
        const h = (agora - new Date(r.data)) / 36e5;
        if (h >= 24) pend24 += 1;
        if (h >= 72) pend72 += 1;
      } else if (r.statusKey === 'devolvido') devolvidos += 1;
      else if (r.statusKey === 'rejeitado') rejeitados += 1;
      else if (r.statusKey === 'aprovado' || r.statusKey === 'resolvido') aprovados += 1;
      if (['aprovado', 'rejeitado'].includes(r.raw?.status) && r.raw?.decidido_em) {
        somaDecisaoMs += new Date(r.raw.decidido_em) - new Date(r.data);
        nDecididos += 1;
      }
    }
    return {
      hoje, pendentes, pend24, pend72,
      recusados: devolvidos + rejeitados, devolvidos,
      aprovados,
      tempoMedioHoras: nDecididos ? Math.round((somaDecisaoMs / nDecididos / 36e5) * 10) / 10 : null,
    };
  }, [rowsBase]);

  const { pageItems, paginacaoProps } = usePaginacaoLocal(rows, 50);

  // ── Helpers portados do fluxo de pedidos ──
  const capacidadeInfo = (grupo) => {
    if (!grupo || grupo.capacidade == null || grupo.membros_ativos == null) return null;
    return { atual: grupo.membros_ativos, limite: grupo.capacidade, cheio: grupo.membros_ativos >= grupo.capacidade };
  };

  // Envelhecimento das linhas que precisam de ação
  const PRECISA_ACAO = ['pendente', 'devolvido', 'enc_pendente', 'enc_nao_respondeu', 'enc_em_duvida', 'lid_pendente', 'lid_aceito', 'ren_nao_continua'];
  const idadeDe = (r) => {
    if (!PRECISA_ACAO.includes(r.statusKey)) return null;
    const horas = (Date.now() - new Date(r.data)) / 36e5;
    const dias = Math.floor(horas / 24);
    const rotulo = horas < 24 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
    const cor = horas < 24 ? C.green : horas < 72 ? C.amber : C.red;
    return { rotulo, cor };
  };

  // ── Ações · PEDIDO ──
  const aprovar = async (p) => {
    const cap = capacidadeInfo(p.mem_grupos);
    const aviso = cap?.cheio
      ? `\n\nAtenção: o grupo já está com ${cap.atual} de ${cap.limite} pessoas (a capacidade é um conselho, você decide).`
      : '';
    if (!confirm(`Aprovar ${p.nome} no grupo "${p.mem_grupos?.nome}"?${aviso}`)) return;
    try {
      await api.aprovarPedido(p.id);
      toast.success('Pedido aprovado');
      depois();
    } catch (e) { toast.error(e.message || 'Erro ao aprovar'); }
  };

  const rejeitar = async (p) => {
    try {
      await api.rejeitarPedido(p.id, motivoRej.trim() || null);
      toast.success('Pedido rejeitado — encerrado');
      setRejectingId(null); setMotivoRej('');
      depois();
    } catch (e) { toast.error(e.message || 'Erro ao rejeitar'); }
  };

  const carregarGrupos = async () => {
    if (gruposAtivos !== null) return;
    try {
      const data = await api.list();
      setGruposAtivos(Array.isArray(data) ? data : []);
    } catch { toast.error('Erro ao carregar grupos'); }
  };

  const abrirSugestao = (p) => {
    setSugerindoId(p.id); setRejectingId(null);
    setGrupoSugestao(''); setMotivoSel(''); setMotivoLivre('');
    carregarGrupos();
  };

  const motivoSugestaoFinal = () => (motivoSel === '__custom__' ? motivoLivre.trim() : motivoSel);

  const sugerir = async (p) => {
    if (!grupoSugestao) return;
    setEnviandoSugestao(true);
    try {
      const r = await api.sugerirPedido(p.id, grupoSugestao, motivoSugestaoFinal() || null);
      if (r.whatsapp_enviado) toast.success('Sugestão enviada por WhatsApp — a pessoa decide pelo link');
      else toast.success('Sugestão registrada (WhatsApp não enviado' + (r.whatsapp_motivo ? `: ${r.whatsapp_motivo}` : '') + ').');
      setSugerindoId(null); setGrupoSugestao('');
      depois();
    } catch (e) { toast.error(e.message || 'Erro ao sugerir grupo'); }
    finally { setEnviandoSugestao(false); }
  };

  const pausarInscricoes = async (grupo) => {
    if (!confirm(`Pausar novas inscrições do grupo "${grupo.nome}"? Ele sai do formulário público até você reativar (no cadastro do grupo).`)) return;
    try {
      await api.setAceitandoInscricoes(grupo.id, false);
      toast.success('Inscrições pausadas — o grupo saiu do formulário público');
      depois();
    } catch (e) { toast.error(e.message || 'Erro ao pausar inscrições'); }
  };

  // ── Ações · direcionado do NEXT (contato + devolutiva) ──
  const abrirDevolutiva = (r) => {
    setExpandedId(r.key);
    setDevDevolutiva(''); setDevCanal('WhatsApp'); setDevObs(''); setDevGrupoId('');
    carregarGrupos();
  };

  const salvarDevolutiva = async (e) => {
    if (!devDevolutiva) { toast.error('Escolha a devolutiva'); return; }
    if (devDevolutiva === 'engajou' && !devGrupoId) { toast.error('Informe em qual grupo a pessoa entrou'); return; }
    setSalvandoDev(true);
    try {
      await encApi.contato(e.id, {
        devolutiva: devDevolutiva,
        canal: devCanal,
        observacao: devObs.trim() || null,
        grupo_id: devDevolutiva === 'engajou' ? devGrupoId : undefined,
      });
      toast.success(devDevolutiva === 'engajou' ? 'Pessoa matriculada no grupo' : 'Devolutiva registrada');
      setExpandedId(null);
      depois();
    } catch (err) { toast.error(err.message || 'Erro ao registrar devolutiva'); }
    finally { setSalvandoDev(false); }
  };

  // ── Ações · NOVO LÍDER/ANFITRIÃO (fluxo assistido · sem WhatsApp) ──
  const aceitarLider = async (insc) => {
    if (!confirm(`Aceitar a inscrição de ${insc.nome}? (Nada é enviado à pessoa — o contato é seu.)`)) return;
    setLidAcaoLoading(true);
    try {
      await api.liderInscricoes.aceitar(insc.id);
      toast.success('Inscrição aceita — agora vincule a pessoa a um grupo');
      depois();
    } catch (e) { toast.error(e.message || 'Erro ao aceitar'); }
    finally { setLidAcaoLoading(false); }
  };

  const recusarLider = async (insc) => {
    setLidAcaoLoading(true);
    try {
      await api.liderInscricoes.recusar(insc.id, lidMotivoRec.trim() || null);
      toast.success('Inscrição recusada (registro interno — a pessoa não é notificada)');
      setLidRecusandoId(null); setLidMotivoRec('');
      depois();
    } catch (e) { toast.error(e.message || 'Erro ao recusar'); }
    finally { setLidAcaoLoading(false); }
  };

  const abrirVinculoLider = (insc) => {
    setLidVinculandoId(insc.id); setLidRecusandoId(null);
    setLidVincGrupoId('');
    setLidVincFuncao(insc.quer_lider ? 'lider' : 'anfitriao');
    carregarGrupos();
  };

  const vincularLider = async (insc) => {
    if (!lidVincGrupoId) return;
    setLidAcaoLoading(true);
    try {
      const r = await api.liderInscricoes.vincular(insc.id, lidVincGrupoId, lidVincFuncao);
      toast.success(`${insc.nome} vinculado ao grupo ${r?.grupo?.nome || ''}`);
      setLidVinculandoId(null); setLidVincGrupoId('');
      depois();
    } catch (e) { toast.error(e.message || 'Erro ao vincular'); }
    finally { setLidAcaoLoading(false); }
  };

  // ── Aprovação em lote (só pedidos pendentes) ──
  const pendentesVisiveis = rows.filter(r => r.tipo === 'pedido' && r.statusKey === 'pendente');
  const todosSelecionados = pendentesVisiveis.length > 0 && pendentesVisiveis.every(r => selected.has(r.raw.id));
  const toggleTodos = () => {
    setSelected(todosSelecionados ? new Set() : new Set(pendentesVisiveis.map(r => r.raw.id)));
  };
  const toggleSelecionado = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const aprovarSelecionados = async () => {
    const itens = pendentesVisiveis.filter(r => selected.has(r.raw.id));
    if (!itens.length) return;
    if (!confirm(`Aprovar ${itens.length} pedido(s) selecionado(s)?`)) return;
    setBatchLoading(true);
    try {
      const ids = itens.map(r => r.raw.id);
      let aprovados = 0;
      const falhas = [];
      for (let i = 0; i < ids.length; i += 100) {
        const r = await api.aprovarPedidosLote(ids.slice(i, i + 100));
        aprovados += r.aprovados || 0;
        if (r.falhas?.length) falhas.push(...r.falhas);
      }
      if (falhas.length) toast.warning(`${aprovados} aprovado(s) · ${falhas.length} falha(s)`);
      else toast.success(`${aprovados} pedido(s) aprovado(s)`);
      depois();
    } catch (e) { toast.error(e.message || 'Erro ao aprovar em lote'); }
    finally { setBatchLoading(false); }
  };

  const toggleExpand = (r) => {
    const abrir = expandedId !== r.key;
    setExpandedId(abrir ? r.key : null);
    setRejectingId(null); setSugerindoId(null);
    setLidRecusandoId(null); setLidVinculandoId(null);
    if (abrir && r.tipo === 'enc') abrirDevolutiva(r);
    if (abrir && r.tipo === 'pedido') { carregarGrupos(); carregarEventos(r.raw.id); }
    if (abrir && r.tipo === 'lider') carregarGrupos();
  };

  return (
    <div style={{ paddingTop: 14 }}>
      {/* Pulso da fila — leitura, sem botões. Reflete os filtros de origem,
          período e busca (não o de status — é o retrato por status). */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
          <ResumoCard titulo="Entradas hoje" valor={estat.hoje} />
          <ResumoCard
            titulo="Pendentes · líder"
            valor={estat.pendentes}
            destaque={estat.pend72 > 0
              ? `${estat.pend72} há 3+ dias`
              : (estat.pend24 > 0 ? `${estat.pend24} há 1+ dia` : null)}
            corDestaque={estat.pend72 > 0 ? C.red : C.amber}
          />
          <ResumoCard
            titulo="Recusados"
            valor={estat.recusados}
            destaque={estat.devolvidos > 0 ? `${estat.devolvidos} na triagem — aguardando você` : null}
            corDestaque={C.violet}
          />
          <ResumoCard titulo="Aprovados" valor={estat.aprovados} />
          <ResumoCard
            titulo="Tempo médio de resposta"
            valor={estat.tempoMedioHoras == null ? '—'
              : estat.tempoMedioHoras < 48 ? `${estat.tempoMedioHoras}h`
              : `${Math.round(estat.tempoMedioHoras / 24)} dias`}
          />
        </div>
      )}

      {/* Filtros discretos: busca + origem + status + período */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
          <Input placeholder="Nome, telefone ou grupo..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <select value={fOrigem} onChange={e => setFOrigem(e.target.value)} style={selStyle}>
          <option value="todas">Origem</option>
          <option value="inscricao">Inscrição de grupos</option>
          <option value="next">Next</option>
          <option value="lideres">Novos líderes/anfitriões</option>
          <option value="renovacao">Renovação de temporada</option>
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={selStyle}>
          {FILTRO_STATUS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select value={fPeriodo} onChange={e => setFPeriodo(Number(e.target.value))} style={selStyle}>
          {FILTRO_PERIODO.map(p => <option key={p.dias} value={p.dias}>{p.label}</option>)}
        </select>
      </div>

      {/* Barra de lote — aparece só quando há pendentes na visão */}
      {podeEditar && pendentesVisiveis.length > 1 && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, padding: '8px 12px',
          background: selected.size ? C.primaryBg : C.card, borderRadius: 10,
          border: `1px solid ${selected.size ? C.primary : C.border}`,
        }}>
          <label style={{ fontSize: 12, color: C.t2, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} style={{ accentColor: C.primary }} />
            Selecionar pendentes ({pendentesVisiveis.length})
          </label>
          {selected.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: C.primary, fontWeight: 700 }}>{selected.size} selecionado(s)</span>
              <Button size="sm" onClick={aprovarSelecionados} disabled={batchLoading} style={{ marginLeft: 'auto' }}>
                <Check size={14} style={{ marginRight: 4 }} /> {batchLoading ? 'Aprovando...' : `Aprovar selecionados (${selected.size})`}
              </Button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: C.card, borderRadius: 16, border: '1px dashed var(--hairline)', color: C.t3, fontSize: 13 }}>
          <Inbox size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
          Nada por aqui com esses filtros.
        </div>
      ) : (
        <div style={{ background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {podeEditar && <th style={{ width: 34 }} />}
                  <Th w={92}>Data</Th>
                  <Th>Pessoa</Th>
                  <Th w={80}>Origem</Th>
                  <Th>Grupo</Th>
                  <Th w={150}>Status</Th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {pageItems.map(r => {
                  const st = STATUS_ROW[r.statusKey] || STATUS_ROW.pendente;
                  const idade = idadeDe(r);
                  const aberto = expandedId === r.key;
                  const p = r.tipo === 'pedido' ? r.raw : null;
                  return (
                    <FragmentRow key={r.key}>
                      <tr
                        onClick={() => toggleExpand(r)}
                        style={{ borderBottom: aberto ? 'none' : `1px solid ${C.border}`, cursor: 'pointer', background: aberto ? C.primaryBg : 'transparent' }}
                      >
                        {podeEditar && (
                          <td style={{ padding: '10px 6px 10px 12px' }} onClick={e => e.stopPropagation()}>
                            {r.tipo === 'pedido' && r.statusKey === 'pendente' && (
                              <input
                                type="checkbox"
                                checked={selected.has(r.raw.id)}
                                onChange={() => toggleSelecionado(r.raw.id)}
                                style={{ accentColor: C.primary, cursor: 'pointer' }}
                                aria-label={`Selecionar ${r.nome}`}
                              />
                            )}
                          </td>
                        )}
                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                          <div style={{ color: C.t2 }}>{fmtData(r.data)}</div>
                          {idade && <div style={{ fontSize: 10.5, fontWeight: 700, color: idade.cor }}>{idade.rotulo}</div>}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {r.nome}
                            {p?.observacao?.includes('[Verificar identidade]') && (
                              <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 99, background: C.amberBg, color: C.amber, fontWeight: 700 }}>
                                Verificar identidade
                              </span>
                            )}
                            {p?.contato_divergente && (
                              <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 99, background: C.blueBg, color: C.blue, fontWeight: 700 }}>
                                Contato novo
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: C.t3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {r.telefone && <span><Phone size={10} style={{ display: 'inline', marginRight: 3 }} />{r.telefone}</span>}
                            {r.email && <span><Mail size={10} style={{ display: 'inline', marginRight: 3 }} />{r.email}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {r.tipo === 'renov' ? (
                            <span style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 99, background: C.redBg, color: C.red, fontWeight: 700 }}>Renovação</span>
                          ) : r.tipo === 'lider' ? (
                            <span style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 99, background: C.primaryBg, color: C.primary, fontWeight: 700 }}>
                              {[r.raw.quer_lider && 'Líder', r.raw.quer_anfitriao && 'Anfitrião'].filter(Boolean).join(' + ')}
                            </span>
                          ) : r.veioNext ? (
                            <span style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 99, background: C.violetBg, color: C.violet, fontWeight: 700 }}>Next</span>
                          ) : r.tipo === 'enc' ? (
                            <span style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 99, background: C.bg, color: C.t3, fontWeight: 600 }}>{r.origemLabel}</span>
                          ) : r.tipo === 'pedido' && labelOrigemPedido(r.origem) ? (
                            <span style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 99, background: C.bg, color: C.t3, fontWeight: 600 }}>{labelOrigemPedido(r.origem)}</span>
                          ) : (
                            <span style={{ color: C.t3 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {r.grupoNome ? (
                            <span style={{ color: C.t2 }}>
                              {r.grupoNome}
                              {r.grupoCodigo && <code style={{ fontSize: 10, color: C.t3, fontFamily: 'monospace', marginLeft: 6 }}>{r.grupoCodigo}</code>}
                            </span>
                          ) : (
                            <span style={{ color: C.t3, fontStyle: 'italic' }}>a definir</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 99, background: st.bg, color: st.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', color: C.t3 }}>
                          {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </td>
                      </tr>

                      {aberto && (
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td colSpan={podeEditar ? 7 : 6} style={{ padding: '0 12px 14px' }}>
                            {r.tipo === 'pedido'
                              ? <PainelPedido
                                  p={p}
                                  eventos={eventosCache[p.id]}
                                  podeEditar={podeEditar}
                                  capacidadeInfo={capacidadeInfo}
                                  rejectingId={rejectingId} setRejectingId={setRejectingId}
                                  motivoRej={motivoRej} setMotivoRej={setMotivoRej}
                                  sugerindoId={sugerindoId} abrirSugestao={abrirSugestao}
                                  grupoSugestao={grupoSugestao} setGrupoSugestao={setGrupoSugestao}
                                  motivoSel={motivoSel} setMotivoSel={setMotivoSel}
                                  motivoLivre={motivoLivre} setMotivoLivre={setMotivoLivre}
                                  motivoSugestaoFinal={motivoSugestaoFinal}
                                  gruposAtivos={gruposAtivos}
                                  enviandoSugestao={enviandoSugestao}
                                  aprovar={aprovar} rejeitar={rejeitar} sugerir={sugerir}
                                  pausarInscricoes={pausarInscricoes}
                                  fecharSugestao={() => { setSugerindoId(null); setGrupoSugestao(''); setMotivoSel(''); setMotivoLivre(''); }}
                                />
                              : r.tipo === 'renov'
                              ? <PainelRenovacao row={r.raw} podeEditar={podeEditar} onTriado={depois} />
                              : r.tipo === 'lider'
                              ? <PainelLider
                                  insc={r.raw}
                                  podeEditar={podeEditar}
                                  gruposAtivos={gruposAtivos}
                                  acaoLoading={lidAcaoLoading}
                                  recusandoId={lidRecusandoId} setRecusandoId={setLidRecusandoId}
                                  motivoRec={lidMotivoRec} setMotivoRec={setLidMotivoRec}
                                  vinculandoId={lidVinculandoId} abrirVinculo={abrirVinculoLider}
                                  fecharVinculo={() => { setLidVinculandoId(null); setLidVincGrupoId(''); }}
                                  vincGrupoId={lidVincGrupoId} setVincGrupoId={setLidVincGrupoId}
                                  vincFuncao={lidVincFuncao} setVincFuncao={setLidVincFuncao}
                                  aceitar={aceitarLider} recusar={recusarLider} vincular={vincularLider}
                                  onCriarGrupo={onCriarGrupoParaLider}
                                />
                              : <PainelNext
                                  e={r.raw}
                                  podeEditar={podeEditar}
                                  devDevolutiva={devDevolutiva} setDevDevolutiva={setDevDevolutiva}
                                  devCanal={devCanal} setDevCanal={setDevCanal}
                                  devObs={devObs} setDevObs={setDevObs}
                                  devGrupoId={devGrupoId} setDevGrupoId={setDevGrupoId}
                                  gruposAtivos={gruposAtivos}
                                  salvando={salvandoDev}
                                  salvar={() => salvarDevolutiva(r.raw)}
                                />}
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 12px' }}>
            <Paginacao {...paginacaoProps} itemLabel="entradas" />
          </div>
        </div>
      )}
    </div>
  );
}

// React exige um wrapper com key pros pares <tr> — Fragment simples com children
function FragmentRow({ children }) { return <>{children}</>; }

function Th({ children, w }) {
  return (
    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: C.t3, fontWeight: 700, width: w }}>
      {children}
    </th>
  );
}

function ResumoCard({ titulo, valor, destaque, corDestaque }) {
  return (
    <div style={{ background: C.card, borderRadius: 12, padding: '10px 14px', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 11, color: C.t3 }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{valor ?? '—'}</div>
      {destaque && <div style={{ fontSize: 10.5, fontWeight: 700, color: corDestaque || C.amber }}>{destaque}</div>}
    </div>
  );
}

// ── Painel expandido de um PEDIDO (grupo alvo + ações por status + histórico) ──
function PainelPedido({
  p, eventos, podeEditar, capacidadeInfo,
  rejectingId, setRejectingId, motivoRej, setMotivoRej,
  sugerindoId, abrirSugestao, grupoSugestao, setGrupoSugestao,
  motivoSel, setMotivoSel, motivoLivre, setMotivoLivre, motivoSugestaoFinal,
  gruposAtivos, enviandoSugestao, aprovar, rejeitar, sugerir, pausarInscricoes, fecharSugestao,
}) {
  const grupo = p.mem_grupos;
  const lider = grupo?.mem_membros;
  const cap = capacidadeInfo(grupo);
  const isRejecting = rejectingId === p.id;
  const isSugerindo = sugerindoId === p.id;

  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: C.t2, display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: p.observacao ? 6 : 10 }}>
        <span><strong style={{ color: C.text }}>{grupo?.nome}</strong>{grupo?.bairro ? ` · ${grupo.bairro}` : ''}</span>
        {lider?.nome && <span>Líder: {lider.nome}</span>}
        {cap && (
          <span style={{ color: cap.cheio ? C.amber : C.t3, fontWeight: cap.cheio ? 700 : 500 }}>
            {cap.atual}/{cap.limite} pessoas{cap.cheio ? ' · no limite' : ''}
          </span>
        )}
        {grupo?.aceitando_inscricoes === false && <span style={{ color: C.t3 }}>Inscrições pausadas</span>}
        {p.origem && (
          <span style={{ color: C.t3 }}>{p.origem === 'formulario_publico' ? 'via QR/formulário' : p.origem === 'cadastro_interno' ? 'via cadastro' : 'manual'}</span>
        )}
      </div>
      {p.observacao && <div style={{ fontSize: 11.5, color: C.t2, fontStyle: 'italic', marginBottom: 10 }}>"{p.observacao}"</div>}

      {p.contato_divergente && (
        <div style={{ fontSize: 11.5, color: C.t2, marginBottom: 10, padding: '6px 10px', background: C.blueBg, borderRadius: 6, lineHeight: 1.5 }}>
          O telefone/e-mail desta inscrição é <strong>diferente do cadastro</strong> da pessoa. Ao aprovar,
          o cadastro é atualizado com o contato novo e o anterior vai pras observações — nada se perde.
        </div>
      )}

      {p.status === 'devolvido' && (
        <div style={{ fontSize: 11.5, color: C.t2, marginBottom: 10, padding: '6px 10px', background: C.violetBg, borderRadius: 6, lineHeight: 1.5 }}>
          Recusado pelo líder{p.decidido_por_nome ? <> <strong>{String(p.decidido_por_nome).replace(' (link WhatsApp)', '')}</strong></> : ''}
          {p.motivo_rejeicao ? <> — motivo interno: <em>{p.motivo_rejeicao}</em></> : ''}. A pessoa
          ainda não foi comunicada: sugira outro grupo (o motivo que você escolher vai junto no WhatsApp) ou rejeite de vez.
        </div>
      )}
      {p.status === 'encaminhado' && (
        <div style={{ fontSize: 11.5, color: C.t2, marginBottom: 10, padding: '6px 10px', background: C.blueBg, borderRadius: 6, lineHeight: 1.5 }}>
          Encaminhado{p.sugerido_em ? ` em ${new Date(p.sugerido_em).toLocaleDateString('pt-BR')}` : ''}{p.sugerido_por_nome ? ` por ${p.sugerido_por_nome}` : ''} —
          aguardando a pessoa decidir pelo link do WhatsApp. Dá pra encaminhar de novo pra outro grupo, se precisar.
        </div>
      )}
      {p.status === 'cancelado' && p.resolvido_grupo_id && (
        <div style={{ fontSize: 11.5, color: C.t2, marginBottom: 10, padding: '6px 10px', background: C.greenBg, borderRadius: 6 }}>
          A pessoa foi aprovada em outro grupo — este pedido fechou sozinho.
        </div>
      )}
      {p.status === 'rejeitado' && (
        <div style={{ fontSize: 11.5, color: C.t2, marginBottom: 10, padding: '6px 10px', background: C.redBg, borderRadius: 6, lineHeight: 1.5 }}>
          Rejeitado{p.motivo_rejeicao ? <> — motivo interno: <em>{p.motivo_rejeicao}</em></> : ''}. Se ainda houver
          caminho pra pessoa, «Sugerir outro grupo» reabre o pedido como encaminhado.
        </div>
      )}
      {p.decidido_por_nome && p.decidido_em && (
        <div style={{ fontSize: 10.5, color: C.t3, marginBottom: 10 }}>
          {p.status === 'aprovado' ? 'Aprovado' : 'Decidido'} por {p.decidido_por_nome} em {new Date(p.decidido_em).toLocaleDateString('pt-BR')}
        </div>
      )}

      {/* 'rejeitado' também mostra ação (Marcos · 14/07): encaminhar pra outro
          grupo fica sempre disponível, independente de quem recusou. */}
      {podeEditar && ['pendente', 'devolvido', 'encaminhado', 'rejeitado'].includes(p.status) && !isRejecting && !isSugerindo && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          {cap?.cheio && grupo?.aceitando_inscricoes !== false && (
            <Button size="sm" variant="ghost" onClick={() => pausarInscricoes(grupo)} style={{ marginRight: 'auto', color: C.amber }}>
              Pausar novas inscrições
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => abrirSugestao(p)} style={{ color: C.t2 }}>
            Sugerir outro grupo
          </Button>
          {p.status !== 'rejeitado' && (
            <Button size="sm" variant="outline" onClick={() => { setRejectingId(p.id); setMotivoRej(''); }}>
              <X size={14} style={{ marginRight: 4 }} /> Rejeitar de vez
            </Button>
          )}
          {p.status === 'pendente' && (
            <Button size="sm" onClick={() => aprovar(p)}>
              <Check size={14} style={{ marginRight: 4 }} /> Aprovar
            </Button>
          )}
        </div>
      )}

      {isSugerindo && (
        <div style={{ background: C.card, borderRadius: 8, padding: 10, marginTop: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>
            Sugerir outro grupo para <strong>{p.nome}</strong> — a pessoa recebe a sugestão no WhatsApp e decide pelo link.
            {p.status === 'rejeitado'
              ? ' O pedido estava rejeitado: enviar a sugestão o reabre como encaminhado.'
              : ' O pedido atual continua valendo até ela aceitar.'}
          </div>
          {gruposAtivos === null ? (
            <div style={{ fontSize: 12, color: C.t3, padding: '6px 0' }}>Carregando grupos...</div>
          ) : (
            <select
              value={grupoSugestao}
              onChange={e => setGrupoSugestao(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${C.border}`, background: C.card, color: C.text }}
            >
              <option value="">Escolha o grupo...</option>
              {gruposAtivos.filter(g => g.id !== p.grupo_id && g.aceitando_inscricoes !== false).map(g => (
                <option key={g.id} value={g.id}>{g.nome}{g.bairro ? ` · ${g.bairro}` : ''}</option>
              ))}
            </select>
          )}
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 11, color: C.t3, display: 'block', marginBottom: 4 }}>
              Motivo enviado pra pessoa (opcional · explica o que aconteceu)
            </label>
            <select
              value={motivoSel}
              onChange={e => setMotivoSel(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${C.border}`, background: C.card, color: C.text }}
            >
              <option value="">Sem motivo (mensagem padrão)</option>
              {MOTIVOS_SUGESTAO.map(m => <option key={m} value={m}>{m}</option>)}
              <option value="__custom__">Escrever outro motivo...</option>
            </select>
            {motivoSel === '__custom__' && (
              <Input
                placeholder="Escreva o motivo (curto, sem links — vai no WhatsApp da pessoa)..."
                value={motivoLivre}
                onChange={e => setMotivoLivre(e.target.value)}
                maxLength={160}
                style={{ marginTop: 6 }}
                autoFocus
              />
            )}
            <p style={{ fontSize: 11, color: C.t3, margin: '6px 0 0', fontStyle: 'italic' }}>
              A pessoa vai ler: «{motivoSugestaoFinal() ? `${motivoSugestaoFinal()} — ` : ''}a liderança indicou um grupo com vagas para você.»
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button size="sm" variant="outline" onClick={fecharSugestao}>Cancelar</Button>
            <Button size="sm" disabled={!grupoSugestao || enviandoSugestao} onClick={() => sugerir(p)}>
              {enviandoSugestao ? 'Enviando...' : 'Enviar sugestão'}
            </Button>
          </div>
        </div>
      )}

      {isRejecting && (
        <div style={{ background: C.card, borderRadius: 8, padding: 10, marginTop: 8, border: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 12, color: C.t2, margin: '0 0 8px', lineHeight: 1.5 }}>
            <strong>Rejeição definitiva</strong> — sua recusa encerra o pedido (diferente da recusa do
            líder, que cai aqui na triagem). Sempre que houver opção, prefira «Sugerir outro grupo».
          </p>
          <Input
            placeholder="Motivo (registro interno · opcional)..."
            value={motivoRej}
            onChange={e => setMotivoRej(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setMotivoRej(''); }}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={() => rejeitar(p)}>Rejeitar de vez</Button>
          </div>
        </div>
      )}

      {/* Linha do tempo do pedido — o histórico completo da pessoa (13/07) */}
      <Timeline eventos={eventos} />
    </div>
  );
}

const EVENTO_META = {
  criado: { label: 'Pedido criado', cor: C.t3 },
  recusado_lider: { label: 'Recusado pelo líder', cor: C.red },
  encaminhado: { label: 'Encaminhado pra outro grupo', cor: C.blue },
  aprovado: { label: 'Aprovado', cor: C.green },
  rejeitado_final: { label: 'Rejeitado (final)', cor: C.red },
  resolvido_outro_grupo: { label: 'Aprovada em outro grupo', cor: C.green },
  cancelado: { label: 'Cancelado', cor: C.t3 },
};

function Timeline({ eventos }) {
  if (eventos === 'loading') {
    return <div style={{ fontSize: 11.5, color: C.t3, marginTop: 10 }}>Carregando histórico...</div>;
  }
  if (!Array.isArray(eventos) || eventos.length === 0) return null;
  return (
    <div style={{ marginTop: 12, borderTop: `1px dashed ${C.border}`, paddingTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Histórico do pedido
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {eventos.map(ev => {
          const meta = EVENTO_META[ev.tipo] || { label: ev.tipo, cor: C.t3 };
          const d = ev.detalhe || {};
          const partes = [];
          if (d.grupo) partes.push(`grupo ${d.grupo}`);
          if (d.grupo_sugerido) partes.push(`sugerido: ${d.grupo_sugerido}`);
          if (d.motivo) partes.push(`motivo enviado à pessoa: “${d.motivo}”`);
          if (d.motivo_interno) partes.push(`motivo interno: “${d.motivo_interno}”`);
          if (d.origem) partes.push(d.origem === 'formulario_publico' ? 'via QR/formulário' : d.origem === 'cadastro_interno' ? 'via cadastro' : d.origem);
          const quando = new Date(ev.created_at);
          return (
            <div key={ev.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: C.t2 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.cor, marginTop: 4, flexShrink: 0 }} />
              <div style={{ lineHeight: 1.5 }}>
                <strong style={{ color: C.text }}>{meta.label}</strong>
                <span style={{ color: C.t3 }}> · {quando.toLocaleDateString('pt-BR')} {quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                {ev.autor_nome && <span style={{ color: C.t3 }}> · por {ev.autor_nome}</span>}
                {partes.length > 0 && <div style={{ color: C.t3 }}>{partes.join(' · ')}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Painel expandido de um NOVO LÍDER/ANFITRIÃO (aceitar · recusar · vincular) ──
function PainelLider({
  insc, podeEditar, gruposAtivos, acaoLoading,
  recusandoId, setRecusandoId, motivoRec, setMotivoRec,
  vinculandoId, abrirVinculo, fecharVinculo, vincGrupoId, setVincGrupoId,
  vincFuncao, setVincFuncao, aceitar, recusar, vincular, onCriarGrupo,
}) {
  const isRecusando = recusandoId === insc.id;
  const isVinculando = vinculandoId === insc.id;
  const papeis = [insc.quer_lider && 'líder', insc.quer_anfitriao && 'anfitrião'].filter(Boolean).join(' e ');
  const podeDecidir = ['pendente', 'aceito'].includes(insc.status);

  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
      <p style={{ fontSize: 12, color: C.t2, margin: '0 0 8px', lineHeight: 1.55 }}>
        Quer servir como <strong>{papeis}</strong> — inscrição do formulário público de líderes.
        Converse com a pessoa antes de decidir: <strong>nada é enviado automaticamente</strong> (nem no aceite, nem na recusa).
      </p>

      <div style={{ fontSize: 12, color: C.t2, display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
        {insc.bairro && <span>Bairro: <strong style={{ color: C.text }}>{insc.bairro}</strong></span>}
        {insc.endereco && <span>Endereço: {insc.endereco}</span>}
      </div>

      {insc.motivacao && (
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 10, padding: '8px 10px', background: C.primaryBg, borderRadius: 6, lineHeight: 1.5 }}>
          <strong style={{ color: C.text }}>O que motivou a decisão:</strong> "{insc.motivacao}"
        </div>
      )}

      {insc.status === 'vinculado' && (
        <div style={{ fontSize: 11.5, color: C.t2, marginBottom: 10, padding: '6px 10px', background: C.greenBg, borderRadius: 6 }}>
          Vinculado ao grupo <strong>{insc.mem_grupos?.nome || '—'}</strong> como{' '}
          {FUNCOES_VINCULO.find(f => f.key === insc.vinculo_funcao)?.label || insc.vinculo_funcao}
          {insc.vinculado_em ? ` em ${fmtData(insc.vinculado_em)}` : ''}.
        </div>
      )}
      {insc.status === 'recusado' && (
        <div style={{ fontSize: 11.5, color: C.t2, marginBottom: 10, padding: '6px 10px', background: C.redBg, borderRadius: 6 }}>
          Recusado{insc.motivo_recusa ? <> — motivo interno: <em>{insc.motivo_recusa}</em></> : ''}. A pessoa não foi
          notificada — a devolutiva é da equipe.
        </div>
      )}
      {insc.decidido_por_nome && insc.decidido_em && (
        <div style={{ fontSize: 10.5, color: C.t3, marginBottom: 10 }}>
          {insc.status === 'aceito' ? 'Aceito' : 'Decidido'} por {insc.decidido_por_nome} em {fmtData(insc.decidido_em)}
        </div>
      )}

      {podeEditar && podeDecidir && !isRecusando && !isVinculando && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" variant="outline" onClick={() => { setRecusandoId(insc.id); setMotivoRec(''); }}>
            <X size={14} style={{ marginRight: 4 }} /> Recusar
          </Button>
          {insc.status === 'pendente' && (
            <Button size="sm" onClick={() => aceitar(insc)} disabled={acaoLoading}>
              <Check size={14} style={{ marginRight: 4 }} /> Aceitar
            </Button>
          )}
          {insc.status === 'aceito' && (
            <>
              <Button size="sm" variant="outline" onClick={() => abrirVinculo(insc)}>
                Vincular a grupo existente
              </Button>
              {onCriarGrupo && (
                <Button size="sm" onClick={() => onCriarGrupo(insc)} disabled={acaoLoading}>
                  Criar novo grupo
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {isVinculando && (
        <div style={{ background: C.card, borderRadius: 8, padding: 10, marginTop: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 8, lineHeight: 1.5 }}>
            Vincular <strong>{insc.nome}</strong> a um grupo existente — a pessoa entra como <strong>mais um</strong> na
            equipe do grupo. O líder principal (quem recebe as aprovações no WhatsApp) <strong>não muda</strong>; se
            precisar trocar, é no cadastro do grupo.
          </div>
          {gruposAtivos === null ? (
            <div style={{ fontSize: 12, color: C.t3, padding: '6px 0' }}>Carregando grupos...</div>
          ) : (
            <select
              value={vincGrupoId}
              onChange={e => setVincGrupoId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${C.border}`, background: C.card, color: C.text }}
            >
              <option value="">Escolha o grupo...</option>
              {gruposAtivos.map(g => (
                <option key={g.id} value={g.id}>{g.nome}{g.bairro ? ` · ${g.bairro}` : ''}</option>
              ))}
            </select>
          )}
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 11, color: C.t3, display: 'block', marginBottom: 4 }}>Entra como</label>
            <select
              value={vincFuncao}
              onChange={e => setVincFuncao(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${C.border}`, background: C.card, color: C.text }}
            >
              {FUNCOES_VINCULO.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button size="sm" variant="outline" onClick={fecharVinculo}>Cancelar</Button>
            <Button size="sm" disabled={!vincGrupoId || acaoLoading} onClick={() => vincular(insc)}>
              {acaoLoading ? 'Vinculando...' : 'Vincular'}
            </Button>
          </div>
        </div>
      )}

      {isRecusando && (
        <div style={{ background: C.card, borderRadius: 8, padding: 10, marginTop: 8, border: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 12, color: C.t2, margin: '0 0 8px', lineHeight: 1.5 }}>
            <strong>Recusa silenciosa</strong> — a pessoa não recebe nada do sistema; a devolutiva é sua, no contato
            pessoal. O motivo abaixo fica só no registro interno.
          </p>
          <Input
            placeholder="Motivo (registro interno · opcional)..."
            value={motivoRec}
            onChange={e => setMotivoRec(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button size="sm" variant="outline" onClick={() => { setRecusandoId(null); setMotivoRec(''); }}>Cancelar</Button>
            <Button size="sm" variant="destructive" disabled={acaoLoading} onClick={() => recusar(insc)}>Recusar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Painel expandido de um direcionado do NEXT (contato + devolutiva) ──
function PainelNext({
  e, podeEditar, devDevolutiva, setDevDevolutiva, devCanal, setDevCanal,
  devObs, setDevObs, devGrupoId, setDevGrupoId, gruposAtivos, salvando, salvar,
}) {
  const encerrado = ['engajou', 'sem_interesse'].includes(e.status);
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
      <p style={{ fontSize: 12, color: C.t2, margin: '0 0 8px', lineHeight: 1.55 }}>
        Direcionada pelo <strong>Next</strong> — ainda sem grupo definido. Entre em contato, apresente os
        grupos disponíveis e registre a devolutiva. Marcar <strong>«Engajou»</strong> já matricula a pessoa
        no grupo escolhido.
      </p>
      {e.observacao && <div style={{ fontSize: 11.5, color: C.t2, fontStyle: 'italic', marginBottom: 8 }}>"{e.observacao}"</div>}

      {encerrado ? (
        <div style={{ fontSize: 12, color: C.t3 }}>
          Acompanhamento encerrado ({e.status === 'engajou' ? 'engajou num grupo' : 'sem interesse'}).
        </div>
      ) : !podeEditar ? (
        <div style={{ fontSize: 12, color: C.t3 }}>Somente leitura.</div>
      ) : (
        <div style={{ background: C.card, borderRadius: 8, padding: 10, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={devDevolutiva} onChange={ev => setDevDevolutiva(ev.target.value)} style={{ ...selStyle, flex: '1 1 200px' }}>
              <option value="">Devolutiva do contato...</option>
              {DEVOLUTIVAS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <select value={devCanal} onChange={ev => setDevCanal(ev.target.value)} style={{ ...selStyle, minWidth: 130 }}>
              {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {devDevolutiva === 'engajou' && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, color: C.t3, display: 'block', marginBottom: 4 }}>Em qual grupo a pessoa entrou? *</label>
              {gruposAtivos === null ? (
                <div style={{ fontSize: 12, color: C.t3 }}>Carregando grupos...</div>
              ) : (
                <select value={devGrupoId} onChange={ev => setDevGrupoId(ev.target.value)} style={{ ...selStyle, width: '100%' }}>
                  <option value="">Escolha o grupo...</option>
                  {gruposAtivos.map(g => <option key={g.id} value={g.id}>{g.nome}{g.bairro ? ` · ${g.bairro}` : ''}</option>)}
                </select>
              )}
            </div>
          )}
          <Input
            placeholder="Observação do contato (opcional)..."
            value={devObs}
            onChange={ev => setDevObs(ev.target.value)}
            style={{ marginTop: 8 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button size="sm" disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando...' : 'Registrar devolutiva'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Painel da RENOVAÇÃO DE TEMPORADA — o líder respondeu pelo WhatsApp que NÃO
// continua. O grupo NÃO fecha sozinho: a coordenação decide aqui (fechar de
// vez, procurar novo líder ou manter), sempre com uma nota curta. Trocar o
// líder é na ficha do grupo (a triagem só registra a decisão).
const TRIAGEM_ACOES = [
  { key: 'buscar_lider', label: 'Vamos procurar novo líder (grupo segue ativo)' },
  { key: 'manter', label: 'Manter como está (ex.: líder reconsiderou)' },
  { key: 'fechar_grupo', label: 'Fechar o grupo nesta temporada' },
];

function PainelRenovacao({ row, podeEditar, onTriado }) {
  const ren = row.renovacao;
  const [acao, setAcao] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const telDigits = String(row.lider_telefone || '').replace(/\D/g, '');

  const triar = async () => {
    if (!acao) { toast.error('Escolha o que foi decidido'); return; }
    if (obs.trim().length < 3) { toast.error('Escreva uma nota curta da decisão'); return; }
    if (acao === 'fechar_grupo' && !confirm(
      `Fechar o grupo "${row.grupo_nome}"? Ele sai da listagem ativa (dá pra reativar depois na ficha do grupo). As ${row.membros_ativos} pessoa(s) continuam cadastradas.`
    )) return;
    setSalvando(true);
    try {
      await api.renovacao.triar(ren.id, { acao, obs: obs.trim() });
      toast.success(acao === 'fechar_grupo' ? 'Grupo fechado e renovação triada' : 'Triagem registrada');
      onTriado?.();
    } catch (e) { toast.error(e.message || 'Erro ao registrar a triagem'); }
    finally { setSalvando(false); }
  };

  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
      <p style={{ fontSize: 12, color: C.t2, margin: '0 0 8px', lineHeight: 1.55 }}>
        O líder respondeu na <strong>renovação de temporada</strong> que <strong style={{ color: C.red }}>não
        continua</strong> com o grupo. Nada mudou pras pessoas ainda — decida o destino do grupo abaixo.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
          background: row.membros_ativos >= 10 ? C.redBg : C.amberBg,
          color: row.membros_ativos >= 10 ? C.red : C.amber,
        }}>
          {row.membros_ativos} pessoa(s) ativas no grupo
        </span>
        {ren.ultima_resposta_em && (
          <span style={{ fontSize: 11.5, color: C.t3 }}>Respondido em {fmtData(ren.ultima_resposta_em)}</span>
        )}
        {telDigits.length >= 10 && (
          <a
            href={`https://wa.me/${telDigits.length <= 11 ? '55' + telDigits : telDigits}`}
            target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: C.primary, fontWeight: 700, textDecoration: 'none' }}
            onClick={e => e.stopPropagation()}
          >
            Falar com {row.lider_nome ? row.lider_nome.split(/\s+/)[0] : 'o líder'} no WhatsApp →
          </a>
        )}
      </div>

      {ren.motivo && (
        <div style={{
          fontSize: 12.5, color: C.t2, fontStyle: 'italic', marginBottom: 10,
          borderLeft: `3px solid ${C.amber}`, paddingLeft: 10, lineHeight: 1.55,
        }}>
          "{ren.motivo}"
        </div>
      )}

      {!podeEditar ? (
        <div style={{ fontSize: 12, color: C.t3 }}>Somente leitura.</div>
      ) : (
        <div style={{ background: C.card, borderRadius: 8, padding: 10, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {TRIAGEM_ACOES.map(a => (
              <label key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.text, cursor: 'pointer' }}>
                <input
                  type="radio" name={`triagem_${ren.id}`} checked={acao === a.key}
                  onChange={() => setAcao(a.key)} style={{ accentColor: C.primary }}
                />
                {a.label}
              </label>
            ))}
          </div>
          <Input
            placeholder="Nota curta do que foi decidido (obrigatória)..."
            value={obs}
            onChange={ev => setObs(ev.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button size="sm" disabled={salvando} onClick={triar}>
              {salvando ? 'Salvando...' : 'Registrar decisão'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
