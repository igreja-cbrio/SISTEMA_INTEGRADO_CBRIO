// ============================================================================
// Entradas · porta de entrada de quem chega na igreja (resolução de identidade)
//
// Console do funil de novos convertidos (Marcos · 2026-06-15; renomeado de
// "Next - Batismo" → "Entradas" em 2026-06-19). NÃO faz CRUD/presença —
// Integração confirma presença e consome as identidades limpas. Lentes:
//   1. Duplicatas possíveis · funde (mantém um, absorve o outro) ou marca
//      "não é a mesma pessoa". Detecta convertido recém-chegado (nome parecido
//      sem CPF/nascimento · revisão humana · NUNCA auto-funde).
//   2. Vincular famílias · só mostra pessoas sem família quando existe evidência
//      de convivência com outro cadastro (telefone ou endereço completo iguais).
//   3. Conflitos de identidade · dado forte dos dois lados e o CPF não bate.
//   4. CPF a confirmar · CPF que chegou por sinal fraco (wifi / telefone da casa).
//   5. Inscrição sem cadastro · inscrição órfã com candidato na base.
//   ⚠️ 3, 4 e 5 saíram da MESMA aba ("Conflitos de CPF") em 14/08 — a régua do
//   corte e o porquê estão em FILTROS_FILA, no fim deste arquivo.
// ============================================================================

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { nextBatismo as api, membresia as membresiaApi } from '../../api';
import { toast } from 'sonner';
import MergeFieldPicker from '../../components/dedup/MergeFieldPicker';
import {
  UserSearch, GitMerge, X, RefreshCw, Loader2, ArrowLeft, ArrowRight,
  Phone, Mail, Calendar, User as UserIcon, IdCard, Link2, UserPlus, Users,
  DoorOpen, Search, Heart, Droplets, Footprints, Eye, Network, HelpCircle,
  Sparkles, MapPin, Home, ShieldQuestion, CheckCircle2, History,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../../components/ui/dialog';
import IdentidadePendenciasPanel from '../../components/IdentidadePendenciasPanel';

const MOTIVO_LABELS = {
  cpf_igual:         { label: 'Mesmo CPF',          cor: '#DC2626' },
  nome_e_nascimento: { label: 'Nome + nascimento',  cor: '#7C3AED' },
  telefone_e_nome:   { label: 'Telefone + nome',    cor: '#EA580C' },
  email_e_nome:      { label: 'E-mail + nome',      cor: '#0EA5E9' },
  nome_muito_parecido: { label: 'Nomes muito parecidos', cor: '#CA8A04' },
  nome:              { label: 'Nome',               cor: '#CA8A04' },
};

// As filas operacionais permanecem na memória durante toda a sessão. Elas só
// são atualizadas por ação explícita ou depois de uma resolução da própria fila.
const FILA_CACHE = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};

function maskCpf(v) {
  if (!v) return '';
  const d = String(v).replace(/\D/g, '');
  if (d.length !== 11) return v;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function maskTelefone(v) {
  if (!v) return '';
  const d = String(v).replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}
function fmtData(iso) {
  if (!iso) return '';
  const s = String(iso);
  const d = s.length <= 10 ? new Date(s + 'T12:00:00') : new Date(s);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============================================================================
export default function Entradas() {
  const [visao, setVisao] = useState('pendentes');
  const [filtro, setFiltro] = useState('duplicidade');
  const [fichaId, setFichaId] = useState(null); // membro_id da Ficha de Entrada aberta
  const { data: resumo } = useQuery({
    queryKey: ['next-batismo', 'resumo'],
    queryFn: () => api.resumo(),
    ...FILA_CACHE,
  });
  // Contador da fila de identidade (mesma queryKey do painel · cache compartilhado)
  const { data: identidade } = useQuery({
    queryKey: ['identidade-pendencias', 'pendente', ''],
    queryFn: () => membresiaApi.identidade.list({ status: 'pendente' }),
    ...FILA_CACHE,
  });
  // ⚠️ `resumo.pendente` vem do SERVIDOR e é keyed por TIPO — as contagens dos 3
  // chips saem dele, não de `items.filter(...)`: a lista é capada e contar o que
  // veio na página faria o chip mentir quando a fila crescer.
  const porTipo = identidade?.resumo?.pendente || {};
  const somaTipos = (lista) => lista.reduce((a, t) => a + (porTipo[t] || 0), 0);
  const pendenciasIdentidade = Object.values(porTipo).reduce((a, b) => a + b, 0);
  // ⚠️ Tipo NOVO em `identidade_pendencias` (o CHECK da tabela pode crescer sem
  // este arquivo saber) cai na fila de conflitos, que é a que gente lê. Sem esta
  // sobra ele contaria no total do cabeçalho e não apareceria em seção nenhuma —
  // trabalho pendente invisível, que é pior que trabalho na aba errada.
  const tiposDeIdentidade = useMemo(() => {
    const cobertos = new Set([...TIPOS_IDENTIDADE, ...TIPOS_CPF_CONFIRMAR, ...TIPOS_INSCRICAO_ORFA]);
    const sobrando = Object.keys(porTipo).filter((t) => !cobertos.has(t));
    return [...TIPOS_IDENTIDADE, ...sobrando];
  }, [identidade]);
  const contagensIdentidade = {
    identidade: somaTipos(tiposDeIdentidade),
    cpf_confirmar: somaTipos(TIPOS_CPF_CONFIRMAR),
    inscricao_orfa: somaTipos(TIPOS_INSCRICAO_ORFA),
  };
  const totalPendentes = (resumo?.duplicatas || 0) + (resumo?.familias_pendentes || 0) + pendenciasIdentidade;

  const escolherFiltro = (valor) => {
    setVisao('pendentes');
    setFiltro(valor);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <DoorOpen className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Entradas</h1>
          <p className="text-sm text-muted-foreground">
            A porta de entrada de quem chega na igreja · garante <strong>uma pessoa = um cadastro</strong>
            {' '}antes de seguir pra Membresia.
          </p>
        </div>
      </div>

      {/* Saúde da identidade · a régua da corrida contra duplicatas */}
      {resumo?.saude && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Base com CPF</div>
            <div className="text-2xl font-bold text-foreground">{resumo.saude.pct_cpf}%</div>
            <div className="text-xs text-muted-foreground">{resumo.saude.com_cpf} de {resumo.saude.pessoas} pessoas vivas</div>
          </div>
          <button className="rounded-xl border p-3 text-left hover:border-primary transition-colors" onClick={() => escolherFiltro('identidade')}>
            {/* ⚠️ O card mostra o número da fila em que ele CAI (conflitos), não o
                total das 3 — clicar e ver um número menor do que o card prometia
                é a divergência que fez o Marcos duvidar do retrato dos grupos
                (03/08). O total da aba continua no chip "Pendentes". */}
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conflitos de identidade</div>
            <div className="text-2xl font-bold text-foreground">{contagensIdentidade.identidade}</div>
            <div className="text-xs text-muted-foreground">
              CPF divergente ou já em uso
              {pendenciasIdentidade > contagensIdentidade.identidade
                ? ` · +${pendenciasIdentidade - contagensIdentidade.identidade} em triagem nas outras filas`
                : ''}
            </div>
          </button>
          <button className="rounded-xl border p-3 text-left hover:border-primary transition-colors" onClick={() => escolherFiltro('duplicidade')}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Duplicatas possíveis</div>
            <div className="text-2xl font-bold text-foreground">{resumo.duplicatas ?? '—'}</div>
            <div className="text-xs text-muted-foreground">pares do funil pra revisão humana</div>
          </button>
        </div>
      )}

      {/* Fluxo operacional · só há trabalho pendente e histórico resolvido */}
      <div className="flex gap-2 border-b overflow-x-auto">
        <TabBtn active={visao === 'pendentes'} onClick={() => setVisao('pendentes')}
          icon={DoorOpen} label="Pendentes" count={totalPendentes} />
        <TabBtn active={visao === 'resolvidos'} onClick={() => setVisao('resolvidos')}
          icon={CheckCircle2} label="Resolvidos" />
      </div>

      <FiltrosFila visao={visao} filtro={filtro} onChange={setFiltro}
        contagens={{ duplicidade: resumo?.duplicatas || 0, sem_vinculo: resumo?.familias_pendentes || 0, ...contagensIdentidade }} />

      {visao === 'pendentes' ? (
        <div className="space-y-7">
          {filtro === 'duplicidade' && (
            <SecaoFila titulo="Possíveis duplicidades" descricao="Cadastros com evidências combinadas de que podem representar a mesma pessoa.">
              <DuplicadosTab onVerFicha={setFichaId} />
            </SecaoFila>
          )}
          {filtro === 'sem_vinculo' && (
            <SecaoFila titulo="Vincular famílias" descricao="Pessoas distintas com evidência de convivência que ainda precisam entrar na mesma família.">
              <FamiliasPendentesTab onVerFicha={setFichaId} />
            </SecaoFila>
          )}
          {filtro === 'identidade' && (
            <SecaoFila titulo="Conflitos de identidade"
              descricao="Os casos difíceis: dado forte dos dois lados e o CPF não bate. Alguém tem que dizer qual é o certo — o sistema não decide.">
              <IdentidadePendenciasPanel statusFixo="pendente" ocultarFiltros tipos={tiposDeIdentidade} />
            </SecaoFila>
          )}
          {filtro === 'cpf_confirmar' && (
            <SecaoFila titulo="CPF a confirmar"
              descricao="Triagem de sinal fraco: o CPF chegou por wi‑fi ou telefone da família, sem nascimento conferível. A pergunta é se ele é mesmo dessa pessoa.">
              <IdentidadePendenciasPanel statusFixo="pendente" ocultarFiltros tipos={TIPOS_CPF_CONFIRMAR} />
            </SecaoFila>
          )}
          {filtro === 'inscricao_orfa' && (
            <SecaoFila titulo="Inscrição sem cadastro"
              descricao="A inscrição não aponta pra cadastro nenhum e existe um candidato na base. Não é conflito de CPF — a pergunta é se esse cadastro é essa pessoa."
            >
              <IdentidadePendenciasPanel statusFixo="pendente" ocultarFiltros tipos={TIPOS_INSCRICAO_ORFA} />
            </SecaoFila>
          )}
        </div>
      ) : <ResolvidosTab filtro={filtro} onVerFicha={setFichaId} />}

      <FichaEntrada id={fichaId} onClose={() => setFichaId(null)} onVerFicha={setFichaId} />
    </div>
  );
}

// ⚠️ A antiga aba "Conflitos de CPF" virou TRÊS filas (14/08 · Marcos: "deveriam
// ser pessoas que possuem dados fortíssimos mas estão com CPF diferente, só os
// casos mais difíceis; ela não foi feita para juntar possíveis duplicatas
// quaisquer"). Ele estava certo: `identidade_pendencias` guarda 5 tipos com
// TRABALHOS diferentes na mesma lista, e o de maior volume — os
// `cpf_para_confirmar`, que são triagem de sinal FRACO (wifi / telefone da
// família) — soterrava justamente os casos difíceis. Medido em 05/08: 218
// `cpf_para_confirmar` contra 67 `inscricao_sem_vinculo` e um punhado de
// conflitos reais.
//
// O recorte é por PERGUNTA, não por tabela:
//   · identidade      → "qual CPF é o certo?" · dado forte dos dois lados
//   · cpf_confirmar   → "esse CPF é mesmo dessa pessoa?" · sinal fraco
//   · inscricao_orfa  → "esse cadastro é essa pessoa?" · nem é conflito de CPF
const TIPOS_IDENTIDADE = ['cpf_divergente', 'vinculo_divergente', 'cpf_conflito'];
const TIPOS_CPF_CONFIRMAR = ['cpf_para_confirmar'];
const TIPOS_INSCRICAO_ORFA = ['inscricao_sem_vinculo'];

const FILTROS_FILA = [
  ['duplicidade', 'Possíveis duplicidades'],
  ['sem_vinculo', 'Vincular famílias'],
  ['identidade', 'Conflitos de identidade'],
  ['cpf_confirmar', 'CPF a confirmar'],
  ['inscricao_orfa', 'Inscrição sem cadastro'],
];

// ⚠️ `entradas_resolucoes.tipo` só conhece as 3 FILAS originais
// (duplicidade | sem_vinculo | identidade) — as chaves novas são recorte de
// EXIBIÇÃO. Sem este mapa, o histórico da aba nova iria pro servidor com
// `tipo=cpf_confirmar`, o `.eq()` não casaria linha nenhuma e a tela diria
// "Nenhuma resolução neste filtro" — erro se disfarçando de fila vazia.
const RESOLUCAO_TIPO = {
  duplicidade: 'duplicidade',
  sem_vinculo: 'sem_vinculo',
  identidade: 'identidade',
  cpf_confirmar: 'identidade',
  inscricao_orfa: 'identidade',
};

function FiltrosFila({ visao, filtro, onChange, contagens }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label={`Filtros de ${visao}`}>
      {FILTROS_FILA.map(([key, label]) => {
        const count = visao === 'pendentes' && key !== 'todos' ? contagens[key] : null;
        return (
          <Button key={key} size="sm" variant={filtro === key ? 'secondary' : 'ghost'}
            className="h-8 shrink-0 text-xs" onClick={() => onChange(key)}>
            {label}{count ? ` (${count})` : ''}
          </Button>
        );
      })}
    </div>
  );
}

function SecaoFila({ titulo, descricao, children }) {
  return (
    <section className="space-y-3">
      <div className="border-b pb-2">
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>
      </div>
      {children}
    </section>
  );
}

const ACAO_RESOLVIDA = {
  fundido: 'Cadastros fundidos',
  pessoas_distintas: 'Pessoas distintas',
  vinculado: 'Registro vinculado',
  cadastro_criado: 'Cadastro criado',
  cpf_confirmado: 'CPF confirmado',
  resolvido: 'Conflito resolvido',
  descartado: 'Conflito descartado',
};

function ResolvidosTab({ filtro, onVerFicha }) {
  const tipo = RESOLUCAO_TIPO[filtro] || filtro;
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['next-batismo', 'resolucoes', tipo],
    queryFn: () => api.resolucoes(tipo ? { tipo } : {}),
    ...FILA_CACHE,
  });
  const items = data?.items || [];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Histórico de resoluções</h2>
          <p className="text-xs text-muted-foreground mt-0.5">O que foi fundido, vinculado, criado ou descartado pela equipe.</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {isLoading ? <Centro><Loader2 className="size-5 animate-spin mr-2" /> Carregando histórico...</Centro> : null}
      {!isLoading && items.length === 0 ? (
        <Vazio icon={History} titulo="Nenhuma resolução neste filtro"
          texto="As decisões tomadas na fila aparecerão aqui para consulta e auditoria." />
      ) : null}

      {items.map((r) => {
        const principal = r.membro_principal;
        const secundario = r.membro_secundario;
        const nomeDetalhe = r.detalhe?.nome || r.detalhe?.nome_principal;
        return (
          <Card key={r.id}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="size-9 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-foreground">{ACAO_RESOLVIDA[r.acao] || r.acao}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {r.tipo === 'duplicidade' ? 'Duplicidade' : r.tipo === 'sem_vinculo' ? 'Família' : 'CPF'}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground ml-auto">{fmtData(r.resolvido_em)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2">
                  {principal ? (
                    <button type="button" className="hover:text-primary hover:underline" onClick={() => onVerFicha?.(principal.id)}>
                      {principal.nome}
                    </button>
                  ) : nomeDetalhe ? <span>{nomeDetalhe}</span> : <span>Registro de origem</span>}
                  {secundario && <><span>·</span><span>{secundario.nome}</span></>}
                  {r.origem && <><span>·</span><span>origem: {r.origem}</span></>}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="size-4" />
      {label}
      {count != null && count > 0 && (
        <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
          {count}
        </span>
      )}
    </button>
  );
}

// ----------------------------------------------------------------------------
// LENTE 1 · Duplicatas
// ----------------------------------------------------------------------------
function DuplicadosTab({ onVerFicha }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['next-batismo', 'duplicados'],
    queryFn: () => api.duplicados(),
    ...FILA_CACHE,
  });
  const [mergeDialog, setMergeDialog] = useState(null); // { par, keep_id }
  const [mergeCampos, setMergeCampos] = useState({}); // overrides "melhor de cada"
  const [busca, setBusca] = useState('');
  const [prioridade, setPrioridade] = useState('todas');
  const [limiteVisivel, setLimiteVisivel] = useState(100);
  const [vista, setVista] = useState('fila'); // 'fila' | 'adiados'
  const [loteDialog, setLoteDialog] = useState(false);
  const adiadosQ = useQuery({
    queryKey: ['next-batismo', 'duplicados-adiados'],
    queryFn: () => api.duplicadosAdiados(),
    enabled: vista === 'adiados',
    ...FILA_CACHE,
  });

  const recarregarMut = useMutation({
    mutationFn: () => (vista === 'adiados' ? api.duplicadosAdiados({ refresh: 1 }) : api.duplicados({ refresh: 1 })),
    onSuccess: (resultado) => {
      qc.setQueryData(['next-batismo', vista === 'adiados' ? 'duplicados-adiados' : 'duplicados'], resultado);
      qc.invalidateQueries({ queryKey: ['next-batismo', 'resumo'] });
    },
    onError: (e) => toast.error(e?.message || 'Erro ao recarregar'),
  });

  // ⚠️ AÇÃO NÃO REFAZ A BUSCA. Era `invalidateQueries` nas três chaves, e cada
  // clique custava ~10s: o GET /duplicados RECALCULA a fila inteira (pagina a base
  // viva, forma candidatos por CPF/telefone/e-mail/nascimento/blocos de nome e
  // aplica a duplicidadePolicy), e as ações de resolução invalidam também o cache
  // de 10 min do backend — então nem o /resumo voltava barato. Reclamação do
  // Matheus em 04/08: "demora pra atualizar, quero algo fluido".
  //
  // A ação já foi confirmada pelo servidor. O par só precisa SAIR da lista, e o
  // contador do topo desce 1. Recálculo de verdade continua existindo no botão
  // "Recarregar", que é explícito.
  const removerPares = (chave, deveSair) => {
    let removidos = 0;
    qc.setQueryData(['next-batismo', chave], (old) => {
      if (!old?.items) return old;
      const items = old.items.filter((it) => !deveSair(it));
      removidos = old.items.length - items.length;
      return removidos ? { ...old, items, total: items.length } : old;
    });
    return removidos;
  };
  const ajustarContador = (delta) => {
    if (!delta) return;
    qc.setQueryData(['next-batismo', 'resumo'], (old) => (
      old ? { ...old, duplicatas: Math.max(0, (old.duplicatas || 0) + delta) } : old
    ));
  };
  // A fila OPOSTA pode ter mudado, mas recalcular agora pagaria os ~10s que
  // estamos evitando: marca stale e deixa o refetch pro momento em que ela abrir.
  const marcarStale = (chave) => qc.invalidateQueries({
    queryKey: ['next-batismo', chave], refetchType: 'none',
  });

  const ignorarMut = useMutation({
    mutationFn: (par) => api.ignorarDuplicata({ membro_a_id: par.membro_a_id, membro_b_id: par.membro_b_id }),
    onSuccess: (_r, par) => {
      toast.success('Marcado como pessoas distintas · não aparece mais');
      ajustarContador(-removerPares('duplicados', (it) => it.par_id === par.par_id));
    },
    onError: (e) => toast.error(e?.message || 'Erro ao ignorar'),
  });
  const adiarMut = useMutation({
    mutationFn: (par) => api.adiarDuplicata({ membro_a_id: par.membro_a_id, membro_b_id: par.membro_b_id, confianca: par.confianca, prioridade: par.prioridade }),
    onSuccess: (_r, par) => {
      toast.success('Adiada · volta sozinha quando aparecer um cadastro completo');
      ajustarContador(-removerPares('duplicados', (it) => it.par_id === par.par_id));
      marcarStale('duplicados-adiados');
    },
    onError: (e) => toast.error(e?.message || 'Erro ao adiar'),
  });
  const reativarMut = useMutation({
    mutationFn: (par) => api.reativarDuplicata({ membro_a_id: par.membro_a_id, membro_b_id: par.membro_b_id }),
    onSuccess: (_r, par) => {
      toast.success('De volta pra fila');
      removerPares('duplicados-adiados', (it) => it.par_id === par.par_id);
      ajustarContador(+1);
      marcarStale('duplicados');
    },
    onError: (e) => toast.error(e?.message || 'Erro ao trazer de volta'),
  });
  const adiarLoteMut = useMutation({
    mutationFn: () => api.adiarEmLote({ criterio: 'nome_apenas' }),
    onSuccess: (r) => { toast.success(`${r?.total || 0} par(es) adiados · voltam quando um cadastro completo confirmar`); setLoteDialog(false); setVista('adiados'); setPrioridade('todas'); setBusca(''); setLimiteVisivel(100);
      // Move ~91 pares de uma vez: remove localmente os "só nome" da fila e busca
      // os adiados de verdade (a tela acabou de trocar pra essa aba).
      ajustarContador(-removerPares('duplicados', soNome));
      qc.invalidateQueries({ queryKey: ['next-batismo', 'duplicados-adiados'] });
    },
    onError: (e) => toast.error(e?.message || 'Erro ao adiar em lote'),
  });
  const mergeMut = useMutation({
    mutationFn: ({ keep_id, merge_ids, campos }) => api.fundir({ keep_id, merge_ids, campos }),
    onSuccess: (res, vars) => {
      const pedidos = Object.keys(vars?.campos || {});
      const aplicados = res?.campos_aplicados || [];
      const faltaram = pedidos.filter((k) => !aplicados.includes(k));
      if (faltaram.length) {
        // A fusão ocorreu, mas um campo escolhido colidiu com OUTRO cadastro.
        toast.warning(`Fundido, mas ${faltaram.length} campo(s) não entraram (conflito com outro cadastro): ${faltaram.join(', ')}. Ajuste direto na ficha.`);
      } else {
        toast.success(`Fundido · ${res?.merged || 1} cadastro(s) absorvido(s)${aplicados.length ? ` · ${aplicados.length} campo(s) do melhor de cada` : ''}`);
      }
      // ⚠️ Fundir A em B faz A DEIXAR DE EXISTIR: todo outro par que cite A ficou
      // órfão e tem que sair junto — clicar num deles daria erro no servidor.
      const absorvidos = new Set(vars?.merge_ids || []);
      const citaAbsorvido = (it) => absorvidos.has(it.membro_a_id) || absorvidos.has(it.membro_b_id);
      ajustarContador(-removerPares('duplicados', citaAbsorvido));
      removerPares('duplicados-adiados', citaAbsorvido);
      setMergeDialog(null); setMergeCampos({});
    },
    onError: (e) => toast.error(e?.message || 'Erro ao fundir'),
  });

  const emAdiados = vista === 'adiados';
  const carregando = emAdiados ? adiadosQ.isLoading : isLoading;
  const comErro = emAdiados ? adiadosQ.isError : isError;
  const erro = emAdiados ? adiadosQ.error : error;
  const recarregando = (emAdiados ? adiadosQ.isFetching : isFetching) || recarregarMut.isPending;
  const items = (emAdiados ? adiadosQ.data : data)?.items || [];
  // "Só bate pelo nome" = nenhum dado verificável em comum → adiável em lote.
  const soNome = (par) => {
    const a = par.membro_a || {}, b = par.membro_b || {};
    const d = (v) => String(v || '').replace(/\D/g, '');
    if (d(a.cpf).length === 11 && d(a.cpf) === d(b.cpf)) return false;
    if (d(a.telefone).length >= 10 && d(a.telefone) === d(b.telefone)) return false;
    const ea = String(a.email || '').trim().toLowerCase(), eb = String(b.email || '').trim().toLowerCase();
    if (ea.length > 3 && ea === eb) return false;
    if (a.data_nascimento && b.data_nascimento && a.data_nascimento === b.data_nascimento) return false;
    return true;
  };
  const nomeApenasCount = emAdiados ? 0 : items.filter(soNome).length;
  const termo = busca.trim().toLowerCase();
  const filtrados = items.filter((par) => {
    if (prioridade !== 'todas' && par.prioridade !== prioridade) return false;
    if (!termo) return true;
    const texto = [par.membro_a?.nome, par.membro_a?.cpf, par.membro_a?.telefone,
      par.membro_b?.nome, par.membro_b?.cpf, par.membro_b?.telefone,
      ...(par.evidencias || []), ...(par.fontes_evidencia || [])].filter(Boolean).join(' ').toLowerCase();
    const digitosBusca = termo.replace(/\D/g, '');
    return texto.includes(termo) || (digitosBusca.length >= 3 && texto.replace(/\D/g, '').includes(digitosBusca));
  });
  const visiveis = filtrados.slice(0, limiteVisivel);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5">
          <Button size="sm" variant={vista === 'fila' ? 'default' : 'outline'} className="h-8 text-xs"
            onClick={() => { setVista('fila'); setPrioridade('todas'); setBusca(''); setLimiteVisivel(100); }}>Fila</Button>
          <Button size="sm" variant={vista === 'adiados' ? 'default' : 'outline'} className="h-8 text-xs"
            onClick={() => { setVista('adiados'); setPrioridade('todas'); setBusca(''); setLimiteVisivel(100); }}>Não tenho certeza</Button>
        </div>
        <Button onClick={() => recarregarMut.mutate()} disabled={recarregando} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className={`size-3.5 ${recarregando ? 'animate-spin' : ''}`} /> Recarregar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground max-w-2xl">
        {emAdiados
          ? 'Pares que você marcou como "não tenho certeza". Voltam sozinhos pra fila quando um cadastro completo (CPF + nascimento) confirmar a identidade — ou você traz de volta na mão.'
          : (<>O sistema combina sinais antes de trazer um par. Telefone ou e-mail isolados não bastam, e CPFs diferentes eliminam a sugestão. <strong>Confira as evidências e os módulos onde cada pessoa aparece antes de fundir.</strong></>)}
      </p>

      {!emAdiados && nomeApenasCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-500/5 px-3 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-300 max-w-2xl">
            <strong>{nomeApenasCount}</strong> par(es) batem <strong>só pelo nome</strong> — sem CPF, telefone, e-mail ou nascimento em comum. Fundir seria chute.
          </p>
          <Button size="sm" variant="outline" className="h-8 text-xs shrink-0 border-amber-400 text-amber-700 dark:text-amber-300"
            onClick={() => setLoteDialog(true)} disabled={adiarLoteMut.isPending}>
            Adiar todos
          </Button>
        </div>
      )}

      <Dialog open={loteDialog} onOpenChange={(o) => !o && setLoteDialog(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adiar os que só batem pelo nome</DialogTitle>
            <DialogDescription>
              {nomeApenasCount} par(es) sem nenhum dado verificável em comum (CPF, telefone, e-mail ou nascimento) vão pra "Não tenho certeza".
              Eles voltam sozinhos pra fila quando um cadastro completo confirmar a identidade. Nada é fundido.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoteDialog(false)} disabled={adiarLoteMut.isPending}>Cancelar</Button>
            <Button onClick={() => adiarLoteMut.mutate()} disabled={adiarLoteMut.isPending} className="gap-1.5">
              {adiarLoteMut.isPending ? <><Loader2 className="size-3.5 animate-spin" /> Adiando...</> : 'Adiar todos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => { setBusca(e.target.value); setLimiteVisivel(100); }}
            placeholder="Buscar nome, CPF, telefone, evidência ou origem..." className="pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            ['todas', 'Todas'], ['quase_confirmado', 'Quase confirmadas'],
            ['alta', 'Alta'], ['media', 'Média'], ['descoberta', 'Descoberta'],
          ].map(([valor, label]) => (
            <Button key={valor} type="button" size="sm" variant={prioridade === valor ? 'default' : 'outline'}
              className="h-8 text-xs" onClick={() => { setPrioridade(valor); setLimiteVisivel(100); }}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {carregando ? (
        <Centro><Loader2 className="size-5 animate-spin mr-2" /> {emAdiados ? 'Carregando adiados...' : 'Procurando duplicatas...'}</Centro>
      ) : comErro ? (
        <div className="space-y-3">
          <Vazio icon={ShieldQuestion} titulo="Não foi possível carregar"
            texto={erro?.message || 'A verificação da base falhou. Nenhuma fila vazia será exibida enquanto houver erro.'} />
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => (emAdiados ? adiadosQ.refetch() : refetch())} className="gap-1.5">
              <RefreshCw className="size-3.5" /> Tentar novamente
            </Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <Vazio icon={GitMerge}
          titulo={emAdiados ? 'Nada adiado' : 'Nenhuma possível duplicata encontrada'}
          texto={emAdiados
            ? 'Você não marcou nenhum par como "não tenho certeza". Eles apareceriam aqui até um cadastro completo confirmar a identidade.'
            : 'A base foi verificada e, com as regras atuais, não existe nenhum par com evidências suficientes para revisão. Telefone isolado não gera duplicata.'} />
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">{filtrados.length} de {items.length} par(es) · exibindo {visiveis.length}</div>
          {visiveis.map((par) => (
            <ParCard key={par.par_id} par={par} onVerFicha={onVerFicha} emAdiados={emAdiados}
              onMerge={(keep_id) => setMergeDialog({ par, keep_id })}
              onIgnorar={() => ignorarMut.mutate(par)} ignorando={ignorarMut.isPending}
              onAdiar={() => adiarMut.mutate(par)} adiando={adiarMut.isPending}
              onReativar={() => reativarMut.mutate(par)} reativando={reativarMut.isPending} />
          ))}
          {limiteVisivel < filtrados.length && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => setLimiteVisivel((n) => n + 100)}>
                Mostrar mais {Math.min(100, filtrados.length - limiteVisivel)}
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!mergeDialog} onOpenChange={(o) => { if (!o) { setMergeDialog(null); setMergeCampos({}); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar fusão</DialogTitle>
            <DialogDescription>
              Esta ação é <strong>permanente</strong> · só dá pra auditar pelo log, não desfazer pela tela.
            </DialogDescription>
          </DialogHeader>
          {mergeDialog && (() => {
            const keep = mergeDialog.par.membro_a_id === mergeDialog.keep_id ? mergeDialog.par.membro_a : mergeDialog.par.membro_b;
            const drop = mergeDialog.par.membro_a_id === mergeDialog.keep_id ? mergeDialog.par.membro_b : mergeDialog.par.membro_a;
            return (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">Manter este</div>
                  <div className="font-semibold text-foreground">{keep.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">criado {fmtData(keep.criado_em)} · {keep.status}</div>
                </div>
                <div className="rounded-lg border bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300 mb-1">Absorver (será deletado)</div>
                  <div className="font-semibold text-foreground">{drop.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">criado {fmtData(drop.criado_em)} · {drop.status}</div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Todos os vínculos do cadastro absorvido (inscrições, decisões, grupos, contribuições, NSM) passam pro mantido. Snapshot vai pro log.
                </p>
                <MergeFieldPicker key={`${keep.id}_${drop.id}`} keep={keep} drop={drop} onCampos={setMergeCampos} />
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialog(null)} disabled={mergeMut.isPending}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!mergeDialog) return;
                const drop_id = mergeDialog.par.membro_a_id === mergeDialog.keep_id ? mergeDialog.par.membro_b_id : mergeDialog.par.membro_a_id;
                mergeMut.mutate({ keep_id: mergeDialog.keep_id, merge_ids: [drop_id], campos: mergeCampos });
              }}
              disabled={mergeMut.isPending} className="gap-1.5"
            >
              {mergeMut.isPending ? <><Loader2 className="size-3.5 animate-spin" /> Fundindo...</> : <><GitMerge className="size-3.5" /> Confirmar fusão</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ParCard({ par, onMerge, onIgnorar, ignorando, onVerFicha, emAdiados, onAdiar, adiando, onReativar, reativando }) {
  const motivos = par.motivos || [];
  const corPrincipal = par.prioridade === 'quase_confirmado' ? '#059669'
    : par.prioridade === 'alta' ? '#7C3AED' : MOTIVO_LABELS[motivos[0]]?.cor || '#6B7280';
  const prioridadeLabel = {
    quase_confirmado: 'Quase confirmada', alta: 'Evidência forte',
    media: 'Revisar evidências', descoberta: 'Descoberta por nome',
  }[par.prioridade] || 'Revisar evidências';
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2 space-y-0" style={{ borderLeft: `3px solid ${corPrincipal}`, background: 'var(--cbrio-input-bg)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] font-bold" style={{ borderColor: corPrincipal, color: corPrincipal }}>
            {prioridadeLabel}
          </Badge>
          {motivos.map((m) => {
            const def = MOTIVO_LABELS[m] || { label: m, cor: '#6B7280' };
            return <Badge key={m} variant="outline" className="text-[10px]" style={{ borderColor: def.cor, color: def.cor }}>{def.label}</Badge>;
          })}
          {par.identidade_progressiva && (par.evidencias || []).map((e) => (
            <Badge key={e} variant="outline" className="text-[10px]" style={{ borderColor: corPrincipal, color: corPrincipal }}>{e}</Badge>
          ))}
          {par.fontes_evidencia?.length > 0 && (
            <span className="text-[10px] text-muted-foreground">Fontes: {par.fontes_evidencia.join(' · ')}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {emAdiados ? (
            <Button variant="ghost" size="sm" onClick={onReativar} disabled={reativando} className="h-7 text-xs gap-1">
              <RefreshCw className="size-3" /> Trazer de volta
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onAdiar} disabled={adiando}
              className="h-7 text-xs gap-1 text-amber-600 dark:text-amber-400 hover:text-amber-700">
              <ShieldQuestion className="size-3" /> Não tenho certeza
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onIgnorar} disabled={ignorando} className="h-7 text-xs gap-1">
            <X className="size-3" /> Não é a mesma pessoa
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {par.contradicoes?.length > 0 && (
          <div className="px-3 py-2 border-b bg-amber-500/5 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5 flex-wrap">
            <ShieldQuestion className="size-3.5" />
            Atenção: {par.contradicoes.join(' · ')}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
          <MembroLado membro={par.membro_a} lado="A" onMerge={() => onMerge(par.membro_a_id)} onVerFicha={onVerFicha} />
          <MembroLado membro={par.membro_b} lado="B" onMerge={() => onMerge(par.membro_b_id)} onVerFicha={onVerFicha} />
        </div>
      </CardContent>
    </Card>
  );
}

// Porta pela qual o CADASTRO nasceu (import de grupos, Next, wifi, ficha de
// voluntariado...). Quando a pessoa não tem NENHUM vínculo operacional, essa
// origem é a pista pra descobrir quem ela é — ex.: veio do import de grupos, o
// Pr. Nélio ou a Natasha talvez reconheçam (pedido do Marcos · 2026-07-19).
const ORIGEM_CADASTRO_ROTULOS = {
  import_next_historico_2025_2026: 'Import · Next (histórico)',
  grupos_import_2026: 'Import · Grupos',
  grupos_importacao: 'Import · Grupos',
  pco_import_2026: 'Import · Planning Center',
  import_ekklesia_2026: 'Import · Ekklesia',
  wifi: 'Portal Wi-Fi',
  voluntariado: 'Ficha de voluntariado',
  voluntariado_form: 'Ficha de voluntariado',
  auth: 'Cadastro pelo login',
  app: 'Cadastro pelo app',
  next_formulario: 'Inscrição no Next',
  next_checkin: 'Check-in do Next',
  batismo_formulario: 'Inscrição de batismo',
  grupos_formulario: 'Inscrição de grupo',
  membresia_formulario: 'Cadastro de membresia',
  membresia_manual: 'Cadastro manual (Membresia)',
  face: 'Reconhecimento facial',
};

function rotuloOrigemCadastro(origem) {
  if (!origem) return null;
  const chave = String(origem).trim().toLowerCase();
  if (!chave) return null;
  if (ORIGEM_CADASTRO_ROTULOS[chave]) return ORIGEM_CADASTRO_ROTULOS[chave];
  // Slug desconhecido: tira o ano, troca _ por espaço e capitaliza; prefixa
  // "Import ·" quando o slug indica importação.
  const limpo = chave.replace(/_20\d{2}$/, '').replace(/_/g, ' ').trim();
  const humano = limpo.charAt(0).toUpperCase() + limpo.slice(1);
  return chave.includes('import') ? `Import · ${humano.replace(/^import\s*/i, '')}` : humano;
}

function MembroLado({ membro, lado, onMerge, onVerFicha }) {
  const rotuloCadastro = rotuloOrigemCadastro(membro.origem_cadastro);
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {membro.foto_url
            ? <img src={membro.foto_url} alt="" className="size-8 rounded-full object-cover" />
            : <div className="size-8 rounded-full bg-muted flex items-center justify-center"><UserIcon className="size-4 text-muted-foreground" /></div>}
          <div>
            <button type="button" onClick={() => onVerFicha?.(membro.id)}
              className="font-semibold text-sm text-foreground text-left hover:text-primary hover:underline inline-flex items-center gap-1"
              title="Ver ficha de entrada">
              {membro.nome} <Eye className="size-3 opacity-60" />
            </button>
            <div className="text-[10px] text-muted-foreground">{membro.status} · criado {fmtData(membro.criado_em)}</div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onMerge} className="gap-1 text-xs h-7" title="Fundir mantendo este cadastro">
          {lado === 'A' ? <ArrowRight className="size-3" /> : <ArrowLeft className="size-3" />} Manter este
        </Button>
      </div>
      <div className="text-xs space-y-1 pl-10">
        {membro.cpf && <Linha icon={IdCard}><span className="font-mono">{maskCpf(membro.cpf)}</span></Linha>}
        {membro.telefone && <Linha icon={Phone}>{maskTelefone(membro.telefone)}</Linha>}
        {membro.email && <Linha icon={Mail}><span className="truncate">{membro.email}</span></Linha>}
        {membro.data_nascimento && <Linha icon={Calendar}>{fmtData(membro.data_nascimento)}</Linha>}
        {membro.genero && <Linha icon={UserIcon}>Gênero: {membro.genero}</Linha>}
      </div>
      <div className="pl-10 pt-1 space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Encontrada em</div>
        {membro.origens?.length ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {membro.origens.map((origem) => (
                <RouterLink key={`${origem.tipo}_${origem.detalhe || ''}`} to={origem.rota}
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  title={`Abrir ${origem.label} para conferir este vínculo`}>
                  <MapPin className="size-3" />
                  {origem.label}{origem.detalhe ? ` · ${origem.detalhe}` : ''}
                </RouterLink>
              ))}
            </div>
            {rotuloCadastro && (
              <div className="text-[10px] text-muted-foreground">Cadastro: {rotuloCadastro}</div>
            )}
          </>
        ) : (
          <div className="flex items-start gap-1.5 rounded-md border border-dashed bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground"
            title="Sem vínculo operacional. A porta do cadastro pode ajudar a identificar quem é a pessoa.">
            <Sparkles className="size-3 shrink-0 mt-px opacity-70" />
            <span>
              Sem vínculo operacional ·{' '}
              <span className="font-medium text-foreground">{rotuloCadastro || 'origem do cadastro não registrada'}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// LENTE 2 · Vínculos familiares sugeridos
// ----------------------------------------------------------------------------
function FamiliasPendentesTab({ onVerFicha }) {
  const qc = useQueryClient();
  const [decisao, setDecisao] = useState(null);
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['next-batismo', 'familias-pendentes'],
    queryFn: () => api.familiasPendentes(),
    ...FILA_CACHE,
  });
  const recarregarMut = useMutation({
    mutationFn: () => api.familiasPendentes({ refresh: 1 }),
    onSuccess: (resultado) => {
      qc.setQueryData(['next-batismo', 'familias-pendentes'], resultado);
      qc.invalidateQueries({ queryKey: ['next-batismo', 'resumo'] });
    },
    onError: (e) => toast.error(e?.message || 'Erro ao recarregar vínculos familiares'),
  });
  const vincular = useMutation({
    mutationFn: (item) => api.vincularFamilia({ membro_id: item.pessoa.id, relativo_id: item.referencia.id }),
    onSuccess: () => {
      toast.success('Famílias vinculadas; os cadastros continuam separados');
      setDecisao(null);
      qc.invalidateQueries({ queryKey: ['next-batismo', 'familias-pendentes'] });
      qc.invalidateQueries({ queryKey: ['next-batismo', 'duplicados'] });
      qc.invalidateQueries({ queryKey: ['next-batismo', 'resumo'] });
      qc.invalidateQueries({ queryKey: ['next-batismo', 'resolucoes'] });
    },
    onError: (e) => toast.error(e?.message || 'Erro ao vincular família'),
  });
  const naoVincular = useMutation({
    mutationFn: (item) => api.ignorarFamilia({ membro_id: item.pessoa.id, relativo_id: item.referencia.id }),
    onSuccess: () => {
      toast.success('Sugestão resolvida como famílias diferentes');
      setDecisao(null);
      qc.invalidateQueries({ queryKey: ['next-batismo', 'familias-pendentes'] });
      qc.invalidateQueries({ queryKey: ['next-batismo', 'resumo'] });
      qc.invalidateQueries({ queryKey: ['next-batismo', 'resolucoes'] });
    },
    onError: (e) => toast.error(e?.message || 'Erro ao resolver sugestão familiar'),
  });
  const itens = data?.itens || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-2xl">
          Esta fila mantém os cadastros separados e apenas organiza as pessoas na mesma família.
          Telefone compartilhado exige também sobrenome em comum; endereço completo + CEP pode sugerir famílias com sobrenomes diferentes.
          <strong> Nomes abreviados ou muito semelhantes vão para Possíveis duplicidades.</strong>
        </p>
        <Button onClick={() => recarregarMut.mutate()} disabled={isFetching || recarregarMut.isPending} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className={`size-3.5 ${isFetching || recarregarMut.isPending ? 'animate-spin' : ''}`} /> Recarregar
        </Button>
      </div>

      {isLoading ? (
        <Centro><Loader2 className="size-5 animate-spin mr-2" /> Procurando vínculos familiares...</Centro>
      ) : isError ? (
        <div className="space-y-3">
          <Vazio icon={ShieldQuestion} titulo="Não foi possível carregar os vínculos familiares"
            texto={error?.message || 'A verificação da base falhou. Tente novamente.'} />
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="size-3.5" /> Tentar novamente
            </Button>
          </div>
        </div>
      ) : itens.length === 0 ? (
        <Vazio icon={Home} titulo="Nenhum vínculo familiar sugerido"
          texto="Não há pessoa sem família com evidência suficiente de parentesco ou convivência com outro cadastro." />
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{data.total} sugestão(ões) para revisar</div>
          {itens.map((item) => (
            <Card key={item.par_id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.evidencias.map((evidencia) => (
                    <Badge key={evidencia} variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-300">
                      {evidencia}
                    </Badge>
                  ))}
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {item.destino.tipo === 'existente' ? item.destino.nome : 'Nova família'}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <PessoaFamilia pessoa={item.pessoa} rotulo="Sem família" onVerFicha={onVerFicha} />
                  <ArrowRight className="size-4 text-muted-foreground mx-auto rotate-90 sm:rotate-0" />
                  <PessoaFamilia pessoa={item.referencia}
                    rotulo={item.destino.tipo === 'existente' ? item.destino.nome : 'Referência para nova família'}
                    onVerFicha={onVerFicha} />
                </div>
                <div className="flex justify-end gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                    onClick={() => setDecisao({ tipo: 'nao_vincular', item })}>
                    <X className="size-3.5" /> Não vincular
                  </Button>
                  <Button size="sm" className="h-8 text-xs gap-1.5"
                    onClick={() => setDecisao({ tipo: 'vincular', item })}>
                    <Home className="size-3.5" />
                    {item.destino.tipo === 'existente' ? 'Vincular à família' : 'Vincular famílias'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!decisao} onOpenChange={(open) => !open && setDecisao(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{decisao?.tipo === 'vincular' ? 'Confirmar vínculo entre famílias' : 'Confirmar que não são da mesma família'}</DialogTitle>
            <DialogDescription>
              {decisao?.tipo === 'vincular'
                ? (decisao?.item.destino.tipo === 'existente'
                  ? `${decisao?.item.pessoa.nome} será incluído(a) em ${decisao?.item.destino.nome}, sem fundir os cadastros.`
                  : `Uma família será criada para agrupar ${decisao?.item.pessoa.nome} e ${decisao?.item.referencia.nome}, sem fundir os cadastros.`)
                : `${decisao?.item.pessoa.nome} e ${decisao?.item.referencia.nome} sairão desta fila e continuarão em famílias separadas.`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Evidência encontrada: {decisao?.item.evidencias.join(' e ')}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisao(null)} disabled={vincular.isPending || naoVincular.isPending}>Cancelar</Button>
            <Button variant={decisao?.tipo === 'vincular' ? 'default' : 'destructive'}
              onClick={() => decisao?.tipo === 'vincular' ? vincular.mutate(decisao.item) : naoVincular.mutate(decisao.item)}
              disabled={vincular.isPending || naoVincular.isPending} className="gap-1.5">
              {(vincular.isPending || naoVincular.isPending) && <Loader2 className="size-3.5 animate-spin" />}
              {decisao?.tipo === 'vincular' ? 'Vincular famílias' : 'Não vincular'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PessoaFamilia({ pessoa, rotulo, onVerFicha }) {
  return (
    <button type="button" onClick={() => onVerFicha?.(pessoa.id)}
      className="rounded-lg border bg-muted/15 p-3 text-left hover:border-primary transition-colors min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        {pessoa.foto_url
          ? <img src={pessoa.foto_url} alt="" className="size-8 rounded-full object-cover shrink-0" />
          : <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0"><UserIcon className="size-4 text-muted-foreground" /></div>}
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{rotulo}</div>
          <div className="text-sm font-medium text-foreground truncate">{pessoa.nome}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {pessoa.telefone ? maskTelefone(pessoa.telefone) : pessoa.endereco || pessoa.status}
          </div>
        </div>
      </div>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Ficha de Entrada · a vitrine (por onde entrou · linha do tempo · conexões · quem perguntar)
// ----------------------------------------------------------------------------
const TOQUE_META = {
  decisao:  { icon: Heart,      cor: '#DB2777', label: 'Decisão' },
  next:     { icon: Sparkles,   cor: '#0EA5E9', label: 'Next' },
  batismo:  { icon: Droplets,   cor: '#2563EB', label: 'Batismo' },
  batizado: { icon: Droplets,   cor: '#1D4ED8', label: 'Batizado' },
  grupo:    { icon: Users,      cor: '#16A34A', label: 'Grupo' },
  trilha:   { icon: Footprints, cor: '#7C3AED', label: 'Trilha' },
  identidade: { icon: Network,  cor: '#059669', label: 'Identidade' },
  cadastro: { icon: UserPlus,   cor: '#6B7280', label: 'Cadastro' },
};

function FichaEntrada({ id, onClose, onVerFicha }) {
  const open = !!id;
  const { data, isLoading } = useQuery({
    queryKey: ['next-batismo', 'ficha', id],
    queryFn: () => api.pessoa(id),
    enabled: open,
    staleTime: 10_000,
  });
  const p = data?.pessoa;
  const toques = data?.toques || [];
  const conexoes = data?.conexoes || {};
  const quem = data?.quem_perguntar || [];
  const primeiro = data?.primeiro_toque;
  const pm = primeiro ? (TOQUE_META[primeiro.tipo] || TOQUE_META.cadastro) : null;
  const semConexao = !conexoes.familia?.length && !conexoes.mesmo_contato?.length && !conexoes.mesmo_grupo?.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        {(isLoading || !p) ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin mr-2" /> Montando ficha...</div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                {p.foto_url
                  ? <img src={p.foto_url} alt="" className="size-12 rounded-full object-cover" />
                  : <div className="size-12 rounded-full bg-muted flex items-center justify-center"><UserIcon className="size-6 text-muted-foreground" /></div>}
                <div className="min-w-0">
                  <DialogTitle className="truncate text-left">{p.nome}</DialogTitle>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                    <span className="capitalize">{p.status}</span>
                    {p.cpf && <span className="font-mono">{maskCpf(p.cpf)}</span>}
                    {p.telefone && <span>{maskTelefone(p.telefone)}</span>}
                  </div>
                  {(data?.contatos || []).length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span className="font-medium">Outros contatos:</span>
                      {(data.contatos || []).map((c, i) => (
                        <span key={i} title={`Visto em ${c.fonte || 'porta'}`}>
                          {c.tipo === 'telefone' ? maskTelefone(c.valor) : c.valor}
                          {c.fonte ? ` (${c.fonte})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0">
            {pm && (
              <div className="rounded-lg border p-3 flex items-center gap-3" style={{ borderLeft: `3px solid ${pm.cor}` }}>
                <div className="size-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: pm.cor + '1A' }}>
                  <pm.icon className="size-4" style={{ color: pm.cor }} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Por onde entrou</div>
                  <div className="text-sm font-semibold text-foreground">{primeiro.label}</div>
                  {primeiro.quando && <div className="text-xs text-muted-foreground">{fmtData(primeiro.quando)}</div>}
                </div>
              </div>
            )}

            <Secao icon={MapPin} titulo="Linha do tempo">
              {toques.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem toques registrados ainda.</p>
              ) : (
                <ol className="relative border-l ml-2 space-y-3 pl-4">
                  {toques.map((t, i) => {
                    const m = TOQUE_META[t.tipo] || TOQUE_META.cadastro;
                    return (
                      <li key={i} className="relative">
                        <span className="absolute -left-[1.42rem] top-1 size-3 rounded-full ring-2 ring-background" style={{ background: m.cor }} />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground inline-flex items-center gap-1.5">
                            <m.icon className="size-3.5" style={{ color: m.cor }} /> {t.titulo}
                          </span>
                          {t.quando && <span className="text-[10px] text-muted-foreground shrink-0">{fmtData(t.quando)}</span>}
                        </div>
                        {t.contexto && <div className="text-xs text-muted-foreground">{t.contexto}</div>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </Secao>

            <Secao icon={Network} titulo="Conexões">
              {semConexao ? (
                <p className="text-xs text-muted-foreground">Nenhuma conexão encontrada.</p>
              ) : (
                <>
                  <ConexaoGrupo titulo="Família" itens={conexoes.familia} onVerFicha={onVerFicha} />
                  <ConexaoGrupo titulo="Mesmo contato (possível mesma pessoa)" itens={conexoes.mesmo_contato} onVerFicha={onVerFicha} alerta />
                  <ConexaoGrupo titulo="Mesmo grupo" itens={conexoes.mesmo_grupo} onVerFicha={onVerFicha} sufixoGrupo />
                </>
              )}
            </Secao>

            <Secao icon={HelpCircle} titulo="Quem perguntar em caso de dúvida">
              {quem.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem responsável direto identificado — fale com a Integração.</p>
              ) : (
                <div className="space-y-1.5">
                  {quem.map((qp, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-foreground">
                        <strong>{qp.nome || qp.papel}</strong>
                        {qp.nome && <span className="text-muted-foreground"> · {qp.papel}</span>}
                        {qp.contexto && <span className="text-muted-foreground"> · {qp.contexto}</span>}
                      </span>
                      {qp.telefone && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{maskTelefone(qp.telefone)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Secao>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Fechar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Secao({ icon: Icon, titulo, children }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Icon className="size-3.5" /> {titulo}
      </div>
      {children}
    </div>
  );
}

function ConexaoGrupo({ titulo, itens, onVerFicha, alerta, sufixoGrupo }) {
  if (!itens || itens.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className={`text-[10px] font-medium ${alerta ? 'text-amber-600' : 'text-muted-foreground'}`}>{titulo}</div>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((it) => (
          <button key={it.id} type="button" onClick={() => onVerFicha?.(it.id)}
            className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs hover:border-primary/50 transition-colors"
            title="Ver ficha">
            <UserIcon className="size-3 text-muted-foreground" />
            {it.nome}
            {sufixoGrupo && it.grupo && <span className="text-muted-foreground">· {it.grupo}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Pequenos helpers de UI
// ----------------------------------------------------------------------------
function Linha({ icon: Icon, children }) {
  return <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="size-3" /> {children}</div>;
}
function Centro({ children }) {
  return <div className="py-12 flex items-center justify-center text-muted-foreground">{children}</div>;
}
function Vazio({ icon: Icon, titulo, texto }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
      <Icon className="size-8 mx-auto text-muted-foreground/60 mb-3" />
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{texto}</p>
    </div>
  );
}
