// ============================================================================
// IdentidadePendenciasPanel · aba Identidade de /ministerial/membresia
//
// Fila humana dos conflitos de identidade por CPF (identidade_pendencias ·
// migration 20260716150000). A reconciliação automática NUNCA funde nem
// grava CPF de fonte suja sozinha — o que ela não resolve cai aqui:
//   · cpf_para_confirmar → CPF chegou por sinal fraco (wifi / telefone da
//     família) sem nascimento conferível. Ação: Confirmar (grava no cadastro)
//     ou Descartar ("não é dessa pessoa" · o cron não recria).
//   · cpf_conflito → CPF chegou pra cadastro sem CPF mas já pertence a outro
//     membro vivo (provável mesma pessoa em 2 cadastros). Ação: Fundir.
//   · cpf_divergente / vinculo_divergente → decisão manual no cadastro;
//     marcar Resolvida quando tratado.
// ============================================================================

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { membresia as membresiaApi } from '../api';
import { toast } from 'sonner';
import {
  ShieldQuestion, RefreshCw, Loader2, Check, X, GitMerge, IdCard,
  Phone, Calendar, AlertTriangle, CheckCircle2, Wifi, Inbox,
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';

const TIPOS = {
  cpf_para_confirmar: { label: 'CPF a confirmar', cor: '#0EA5E9', hint: 'CPF chegou por sinal fraco (wifi / telefone da família) — confirme que é da pessoa antes de virar identidade.' },
  cpf_conflito: { label: 'Provável duplicata', cor: '#DC2626', hint: 'O CPF já pertence a outro membro vivo — provavelmente a mesma pessoa em 2 cadastros (fundir).' },
  cpf_divergente: { label: 'CPF divergente', cor: '#EA580C', hint: 'O membro já tinha OUTRO CPF quando este chegou — conferir qual é o certo no cadastro.' },
  vinculo_divergente: { label: 'Vínculo divergente', cor: '#7C3AED', hint: 'Uma inscrição/linha aponta pra um membro diferente do dono do CPF — corrigir o vínculo manualmente.' },
  inscricao_sem_vinculo: { label: 'Inscrição sem cadastro', cor: '#0891B2', hint: 'A inscrição não aponta pra cadastro nenhum, mas há um candidato na base. Ligar resolve TODAS as inscrições dessa pessoa de uma vez. Confira nome e telefone ANTES — telefone é compartilhado em família, e ligar errado gruda a inscrição de uma pessoa no cadastro de outra.' },
};

const ORIGENS = {
  wifi: 'Portal Wi-Fi',
  vol_ficha: 'Ficha de Voluntariado',
  backfill_vol: 'Importação do Voluntariado',
  backfill_batismo: 'Importação do Batismo',
  batismo_checkin: 'Check-in do Batismo',
  next_matricula: 'Matrícula do Next',
  decisao_edicao: 'Edição de decisão',
};

const digits = (v) => String(v || '').replace(/\D/g, '');
function maskCpf(v) {
  const d = digits(v);
  if (d.length !== 11) return v || '—';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function maskTelefone(v) {
  const d = digits(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '—';
}
const fmtDataHora = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

function MembroBox({ titulo, m }) {
  if (!m) return null;
  return (
    <div className="flex-1 min-w-[220px] rounded-lg border border-border p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{titulo}</div>
      <div className="font-semibold text-sm flex items-center gap-2">
        {m.nome || 'Sem nome'}
        {m.deleted_at && <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">deletado</Badge>}
        {m.status && <Badge variant="outline" className="text-[10px]">{m.status}</Badge>}
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><IdCard className="size-3" /> {maskCpf(m.cpf)}</div>
        <div className="flex items-center gap-1.5"><Phone className="size-3" /> {maskTelefone(m.telefone)}</div>
        {m.data_nascimento && <div className="flex items-center gap-1.5"><Calendar className="size-3" /> {new Date(m.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>}
      </div>
    </div>
  );
}

// O que a PESSOA digitou na inscrição órfã. ⚠️ Existe porque o card mostrava só
// o CADASTRO candidato: o CPF informado no formulário não aparecia em lugar
// nenhum, e era isso que fazia o chip "Só com CPF" listar card com o CPF em
// branco (a chave `cpf:` do `origem_id` é da INSCRIÇÃO, não do cadastro).
function InscricaoBox({ ev }) {
  if (!ev?.insc) return null;
  const i = ev.insc;
  return (
    <div className="flex-1 min-w-[220px] rounded-lg border border-cyan-300/60 bg-cyan-500/5 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400 mb-1">
        O que a pessoa preencheu
      </div>
      <div className="font-semibold text-sm">{i.nome || 'Sem nome'}</div>
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><IdCard className="size-3" /> {maskCpf(i.cpf)}</div>
        <div className="flex items-center gap-1.5"><Phone className="size-3" /> {maskTelefone(i.telefone)}</div>
        {i.data_nascimento && (
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3" />
            {new Date(String(i.data_nascimento).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR')}
          </div>
        )}
      </div>
      {ev.linhas > 1 && (
        <div className="text-[11px] text-cyan-700 dark:text-cyan-400 mt-1.5">
          {ev.linhas} inscrições desta pessoa ({(ev.portas || []).join(', ')}) — ligar resolve todas
        </div>
      )}
    </div>
  );
}

// Selo da FORÇA da evidência. É a resposta pra "dá pra ligar sem conferir?" —
// e não é a mesma pergunta que "tem CPF em algum lado".
function SeloForca({ ev }) {
  if (!ev) return null;
  if (!ev.chave_viva) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        já ligada em outro cadastro
      </Badge>
    );
  }
  const forte = ev.forca === 'forte_cpf' || ev.forca === 'forte_telefone_nome';
  const cor = forte ? '#059669' : ev.veto ? '#DC2626' : '#B45309';
  const label = ev.forca === 'forte_cpf' ? 'CPF confere'
    : ev.forca === 'forte_telefone_nome' ? 'telefone + nome completo'
    : ev.veto === 'nascimento_divergente' ? 'nascimento divergente'
    : ev.veto === 'cpf_divergente' ? 'CPF divergente'
    : 'precisa conferir';
  return (
    <Badge
      variant="outline"
      className="text-[10px]"
      style={{ color: cor, borderColor: `${cor}55` }}
      title={ev.motivo || ''}
    >
      {label}
    </Badge>
  );
}

export default function IdentidadePendenciasPanel({ statusFixo = null, ocultarFiltros = false }) {
  const qc = useQueryClient();
  const [statusLocal, setStatus] = useState('pendente');
  const status = statusFixo || statusLocal;
  const [tipo, setTipo] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmar, setConfirmar] = useState(null); // pendência do dialog "Confirmar CPF"
  const [fundir, setFundir] = useState(null);       // pendência do dialog "Fundir"

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['identidade-pendencias', status, tipo],
    queryFn: () => membresiaApi.identidade.list({ status, ...(tipo ? { tipo } : {}) }),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const todosItens = data?.items || [];

  // Filtro por CPF (pedido do Matheus 2026-08-04: "se tiver cpf, eu vou ligar o
  // cadastro dela"). São DUAS coisas diferentes, e a distinção é de risco:
  //  · CPF na INSCRIÇÃO (`origem_id` = 'cpf:...') → o vínculo é pela chave mais
  //    forte que existe. Ligar é seguro. Medido em 04/08: 16 casos.
  //  · CPF só no CADASTRO candidato → a inscrição casou por telefone+nome, e o
  //    próprio aviso da tela lembra que telefone é compartilhado em família.
  //    Aqui ligar exige conferir nome antes. Medido: ~108 casos.
  // Por isso são chips separados em vez de um "tem CPF" que junta os dois.
  //
  // ⚠️⚠️ CORREÇÃO DE SEMÂNTICA (05/08 · o bug que o Matheus reportou: "marco o
  // filtro de só quem tem CPF preenchido e ele mostra pessoas sem CPF"):
  // `origem_id = 'cpf:...'` diz que a INSCRIÇÃO trouxe CPF — **não** que o
  // candidato foi achado por ele, e muito menos que o cadastro tem CPF. Medido
  // nas 7 pendências com chave `cpf:`: 4 casaram por telefone+nome com cadastro
  // SEM CPF nenhum (caso Ana Luisa Dib Silvestre — CPF na inscrição, cadastro
  // em branco, e o card mostrando "—" porque só exibia o lado do cadastro).
  // Os chips continuam porque servem aos 218 `cpf_para_confirmar`; o que mudou
  // foram os RÓTULOS (agora dizem de qual lado é o CPF) e a tooltip, que
  // prometia "ligar é seguro sem conferir nome" pra um match feito por telefone.
  // Quem responde "dá pra ligar?" é a FORÇA (`evidencia.forca`), no chip próprio.
  const cpfDaInscricao = (p) => String(p?.origem_id || '').startsWith('cpf:');
  const cpfDoCadastro = (p) => !!String(p?.membro?.cpf || '').trim();
  const temCpf = (p) => cpfDaInscricao(p) || cpfDoCadastro(p);
  const podeLote = (p) => !!p?.evidencia?.pode_lote;
  const [filtroCpf, setFiltroCpf] = useState('todos'); // todos | com | inscricao | sem | lote

  const contagemCpf = useMemo(() => ({
    com: todosItens.filter(temCpf).length,
    inscricao: todosItens.filter(cpfDaInscricao).length,
    sem: todosItens.filter((p) => !temCpf(p)).length,
    lote: todosItens.filter(podeLote).length,
  }), [todosItens]);

  const items = useMemo(() => todosItens.filter((p) => {
    if (filtroCpf === 'com') return temCpf(p);
    if (filtroCpf === 'inscricao') return cpfDaInscricao(p);
    if (filtroCpf === 'sem') return !temCpf(p);
    if (filtroCpf === 'lote') return podeLote(p);
    return true;
  }), [todosItens, filtroCpf]);

  // ── Seleção pra ligar em lote ───────────────────────────────────────────────
  // ⚠️ Só entram na seleção pendências com evidência FORTE (`pode_lote`), e o
  // servidor REAVALIA cada uma no POST: aqui é conveniência, não autoridade.
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [loteBusy, setLoteBusy] = useState(false);
  const [loteResultado, setLoteResultado] = useState(null);
  const [confirmarLote, setConfirmarLote] = useState(false);

  const elegiveis = useMemo(() => items.filter(podeLote), [items]);
  const selecionadosVisiveis = useMemo(
    () => elegiveis.filter((p) => selecionados.has(p.id)),
    [elegiveis, selecionados],
  );

  const alternarSelecao = (id) => setSelecionados((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const resumo = data?.resumo || {};
  const podeAgir = !!data?.pode_agir;
  const pendentesPorTipo = resumo.pendente || {};
  const totalPendentes = useMemo(() => Object.values(pendentesPorTipo).reduce((a, b) => a + b, 0), [pendentesPorTipo]);

  // ⚠️ Ação NÃO refaz a busca. `invalidateQueries` aqui obrigava a lista inteira a
  // voltar do servidor a cada clique, e a tela levava segundos pra responder — a
  // reclamação do Matheus em 04/08 ("demora pra atualizar, quero algo fluido").
  // A ação já foi confirmada pelo servidor: a linha só precisa SAIR da lista.
  // As outras chaves (status/tipo) ficam marcadas como stale SEM refetch, então
  // recalculam só quando a pessoa realmente abrir aquela aba.
  const removerLocal = (id) => {
    qc.setQueryData(['identidade-pendencias', status, tipo], (old) => {
      if (!old?.items) return old;
      const items = old.items.filter((x) => x.id !== id);
      if (items.length === old.items.length) return old;
      // O resumo alimenta os contadores por tipo — desconta o que saiu.
      const saiu = old.items.find((x) => x.id === id);
      let resumoNovo = old.resumo;
      if (saiu && old.resumo?.[saiu.status]?.[saiu.tipo]) {
        resumoNovo = {
          ...old.resumo,
          [saiu.status]: {
            ...old.resumo[saiu.status],
            [saiu.tipo]: Math.max(0, old.resumo[saiu.status][saiu.tipo] - 1),
          },
        };
      }
      return { ...old, items, resumo: resumoNovo };
    });
    qc.invalidateQueries({ queryKey: ['identidade-pendencias'], refetchType: 'none' });
  };

  // Lote · MESMA régua de fluidez do clique individual: as linhas ligadas saem
  // da lista sem refetch. Recalcular a fila aqui pagaria os ~10s que a decisão
  // de 04/08 existe pra evitar.
  async function ligarLote(ids) {
    setLoteBusy(true);
    try {
      const r = await membresiaApi.identidade.ligarLote(ids);
      for (const g of (r?.detalhe_ligadas || [])) removerLocal(g.id);
      setSelecionados((s) => {
        const n = new Set(s);
        for (const g of (r?.detalhe_ligadas || [])) n.delete(g.id);
        return n;
      });
      setLoteResultado(r);
      if (r?.ligadas) {
        toast.success(`${r.ligadas} pessoa(s) ligada(s) · ${r.linhas_ligadas} inscrição(ões) resolvida(s)`);
      } else {
        toast.warning('Nenhuma foi ligada — veja os motivos');
      }
    } catch (e) {
      toast.error(e.message || 'Erro ao ligar em lote');
    } finally {
      setLoteBusy(false);
      setConfirmarLote(false);
    }
  }

  // `okMsg` pode ser função da resposta: a ligação de inscrição resolve N linhas
  // e dizer "1 inscrição ligada" quando foram 4 esconde o que aconteceu.
  async function agir(id, fn, okMsg) {
    setBusyId(id);
    try {
      const r = await fn();
      toast.success(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      removerLocal(id);
    } catch (e) {
      toast.error(e?.message || 'Erro ao atualizar a pendência');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmarCpf(p) {
    setBusyId(p.id);
    try {
      const r = await membresiaApi.identidade.confirmarCpf(p.id);
      if (r.acao === 'cpf_preenchido') toast.success('CPF consolidado no cadastro');
      else if (r.acao === 'ja_tinha') toast.success('O cadastro já tinha este CPF');
      else toast.warning('Um conflito foi detectado agora — uma nova pendência foi aberta com o par certo');
      // ⚠️ No caminho de conflito o servidor ABRE uma pendência nova — essa a
      // lista não tem. Aí a busca é necessária, senão o par certo não aparece.
      if (r.acao === 'cpf_preenchido' || r.acao === 'ja_tinha') removerLocal(p.id);
      else qc.invalidateQueries({ queryKey: ['identidade-pendencias'] });
    } catch (e) {
      toast.error(e?.message || 'Erro ao confirmar o CPF');
    } finally {
      setBusyId(null);
      setConfirmar(null);
    }
  }

  async function fundirCadastros(p, keepId) {
    const mergeId = keepId === p.membro?.id ? p.conflito?.id : p.membro?.id;
    if (!keepId || !mergeId) return;
    setBusyId(p.id);
    try {
      await membresiaApi.duplicados.merge({
        keep_id: keepId,
        merge_ids: [mergeId],
        observacao: `Fusão via fila de identidade (pendência ${p.id} · ${p.tipo})`,
      });
      await membresiaApi.identidade.setStatus(p.id, 'resolvida');
      toast.success('Cadastros fundidos');
      // Fundir some com um cadastro: qualquer OUTRA pendência que o cite ficou
      // órfã, então elas saem junto — clicar numa delas daria erro.
      qc.setQueryData(['identidade-pendencias', status, tipo], (old) => {
        if (!old?.items) return old;
        const items = old.items.filter((x) => x.id !== p.id
          && x.membro_id !== mergeId && x.membro_conflito_id !== mergeId);
        return items.length === old.items.length ? old : { ...old, items };
      });
      qc.invalidateQueries({ queryKey: ['identidade-pendencias'], refetchType: 'none' });
    } catch (e) {
      toast.error(e?.message || 'Erro ao fundir os cadastros');
    } finally {
      setBusyId(null);
      setFundir(null);
    }
  }

  return (
    <div>
      {/* Filtros · a fila unificada controla status/tipo externamente */}
      {!ocultarFiltros && <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          {[['pendente', 'Pendentes'], ['resolvida', 'Resolvidas'], ['descartada', 'Descartadas']].map(([k, l]) => (
            <Button key={k} size="sm" variant={status === k ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setStatus(k)}>
              {l}{k === 'pendente' && totalPendentes > 0 ? ` (${totalPendentes})` : ''}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Button size="sm" variant={!tipo ? 'secondary' : 'ghost'} className="h-8 text-xs" onClick={() => setTipo('')}>Todos os tipos</Button>
          {Object.entries(TIPOS).map(([k, t]) => (
            <Button key={k} size="sm" variant={tipo === k ? 'secondary' : 'ghost'} className="h-8 text-xs" onClick={() => setTipo(tipo === k ? '' : k)}>
              <span className="inline-block size-2 rounded-full mr-1.5" style={{ background: t.cor }} />
              {t.label}{status === 'pendente' && pendentesPorTipo[k] ? ` (${pendentesPorTipo[k]})` : ''}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs ml-auto" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          <span className="ml-1.5">Atualizar</span>
        </Button>
      </div>}

      {/* Filtro por CPF.
          ⚠️ NÃO fica atrás de `ocultarFiltros`: essa prop existe pra esconder os
          chips de status/tipo quando a ABA já define o contexto (é o caso do
          /entradas), e na 1ª tentativa eu pendurei este filtro na mesma condição —
          resultado: ele não aparecia justamente na tela onde foi pedido. */}
      {todosItens.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-4">
          <span className="text-[11px] text-muted-foreground mr-1">CPF:</span>
          {[
            ['todos', `Todos (${todosItens.length})`, 'Sem filtrar por CPF'],
            ['com', `CPF em algum lado (${contagemCpf.com})`, 'Tem CPF na inscrição OU no cadastro candidato. ⚠️ Não significa que os dois CPFs conferem, nem que o candidato foi achado pelo CPF — pra isso, use "Pode ligar em lote".'],
            ['inscricao', `CPF na inscrição (${contagemCpf.inscricao})`, 'A pessoa informou CPF no formulário. ⚠️ Se o cadastro candidato está sem CPF, o match foi por telefone+nome — o CPF não participou, então confira o nome antes de ligar.'],
            ['sem', `Sem CPF (${contagemCpf.sem})`, 'Nenhum dos lados tem CPF'],
            ...(contagemCpf.lote > 0
              ? [['lote', `Pode ligar em lote (${contagemCpf.lote})`, 'Evidência forte: o CPF da inscrição é o do cadastro, OU telefone igual com nome completo idêntico (os ramos do matcher canônico). Nascimento divergente ou primeiro nome só ficam fora.']]
              : []),
          ].map(([k, label, dica]) => (
            <Button
              key={k}
              size="sm"
              variant={filtroCpf === k ? 'secondary' : 'ghost'}
              className="h-8 text-xs"
              title={dica}
              onClick={() => setFiltroCpf(k)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {!podeAgir && !isLoading && (
        <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
          <ShieldQuestion className="size-3.5" /> Você tem acesso de leitura — as ações exigem nível 3 em Membresia/Integração.
        </div>
      )}

      {data?.aviso && (
        <div className="text-xs text-amber-700 dark:text-amber-500 mb-3 flex items-start gap-1.5">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {data.aviso}
        </div>
      )}

      {/* Ligar em lote · aparece só quando há candidata com evidência forte. */}
      {podeAgir && status === 'pendente' && elegiveis.length > 0 && (
        <div className="mb-4 rounded-lg border border-emerald-300/60 bg-emerald-500/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-foreground">
              <strong>{elegiveis.length}</strong> pendência(s) com evidência forte
              {selecionadosVisiveis.length > 0 && <> · <strong>{selecionadosVisiveis.length}</strong> selecionada(s)</>}
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <Button
                size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => setSelecionados(new Set(elegiveis.map((p) => p.id)))}
                disabled={loteBusy || selecionadosVisiveis.length === elegiveis.length}
              >
                Selecionar as {elegiveis.length}
              </Button>
              {selecionadosVisiveis.length > 0 && (
                <Button
                  size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground"
                  onClick={() => setSelecionados(new Set())} disabled={loteBusy}
                >
                  Limpar
                </Button>
              )}
              <Button
                size="sm" className="h-8 text-xs"
                disabled={loteBusy || !selecionadosVisiveis.length}
                onClick={() => setConfirmarLote(true)}
              >
                {loteBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                <span className="ml-1.5">Ligar {selecionadosVisiveis.length || ''} ao cadastro</span>
              </Button>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">
            Entram só as pendências em que o CPF da inscrição é o do cadastro, ou o telefone
            é o mesmo E o nome completo é idêntico. Primeiro nome igual e nascimento
            divergente ficam de fora — é o caso mãe/filha no telefone da casa.
          </div>
        </div>
      )}

      {isLoading && <div className="py-16 text-center text-muted-foreground"><Loader2 className="size-6 animate-spin inline-block" /></div>}

      {!isLoading && items.length === 0 && (
        <Card><CardContent className="py-14 text-center text-muted-foreground">
          <Inbox className="size-8 mx-auto mb-2 opacity-50" />
          Nenhuma pendência {status === 'pendente' ? 'aberta' : status === 'resolvida' ? 'resolvida' : 'descartada'}{tipo ? ` deste tipo` : ''}.
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {items.map((p) => {
          const t = TIPOS[p.tipo] || { label: p.tipo, cor: '#64748B', hint: '' };
          const busy = busyId === p.id;
          const selecionavel = podeAgir && status === 'pendente' && podeLote(p);
          const marcado = selecionados.has(p.id);
          return (
            <Card key={p.id} style={{ borderLeft: `4px solid ${t.cor}` }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {selecionavel && (
                    <input
                      type="checkbox"
                      className="size-4 accent-emerald-600 cursor-pointer"
                      checked={marcado}
                      disabled={loteBusy}
                      onChange={() => alternarSelecao(p.id)}
                      aria-label="Selecionar para ligar em lote"
                    />
                  )}
                  <Badge style={{ background: `${t.cor}18`, color: t.cor, border: `1px solid ${t.cor}40` }}>{t.label}</Badge>
                  <SeloForca ev={p.evidencia} />
                  {p.origem === 'wifi' && <Badge variant="outline" className="text-[10px]"><Wifi className="size-3 mr-1" />{ORIGENS.wifi}</Badge>}
                  {p.origem && p.origem !== 'wifi' && <Badge variant="outline" className="text-[10px]">{ORIGENS[p.origem] || p.origem}</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">{fmtDataHora(p.created_at)}</span>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <InscricaoBox ev={p.evidencia} />
                  <MembroBox titulo={p.tipo === 'inscricao_sem_vinculo' ? 'Cadastro candidato' : 'Cadastro'} m={p.membro} />
                  {p.conflito && <MembroBox titulo="Dono atual do CPF" m={p.conflito} />}
                  {p.tipo === 'cpf_para_confirmar' && p.cpf_proposto && (
                    <div className="flex-1 min-w-[220px] rounded-lg border border-sky-300/60 bg-sky-500/5 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-600 mb-1">CPF proposto</div>
                      <div className="font-mono font-semibold text-sm">{maskCpf(p.cpf_proposto)}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">Confirme com a pessoa antes de gravar — vira a identidade dela em todas as portas.</div>
                    </div>
                  )}
                </div>

                {p.detalhe && <div className="text-xs text-muted-foreground mt-2">{p.detalhe}</div>}
                {t.hint && status === 'pendente' && <div className="text-[11px] text-muted-foreground/80 mt-1 flex items-center gap-1"><AlertTriangle className="size-3" />{t.hint}</div>}

                {podeAgir && status === 'pendente' && (
                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    {p.tipo === 'cpf_para_confirmar' && p.cpf_proposto && p.membro && (
                      <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => setConfirmar(p)}>
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        <span className="ml-1.5">Confirmar CPF</span>
                      </Button>
                    )}
                    {/* ⚠️ Chave morta = as inscrições já foram ligadas a algum
                        cadastro; o clique só devolveria 409. Aqui a saída é
                        "Resolvida" — dizer isso na tela evita o clique que erra
                        (o Matheus passou 110 pendências na mão em 05/08). */}
                    {p.tipo === 'inscricao_sem_vinculo' && p.evidencia && !p.evidencia.chave_viva && (
                      <span className="text-[11px] text-muted-foreground">
                        Nada a ligar — as inscrições dessa pessoa já apontam pra um cadastro.
                      </span>
                    )}
                    {p.tipo === 'inscricao_sem_vinculo' && p.membro && !p.membro.deleted_at
                      && p.evidencia?.chave_viva !== false && (
                      <Button size="sm" className="h-8 text-xs" disabled={busy}
                        onClick={() => agir(p.id, () => membresiaApi.identidade.ligarInscricao(p.id), (r) => {
                          const n = r?.ligadas || 1;
                          const base = n > 1 ? `${n} inscrições ligadas ao cadastro` : 'Inscrição ligada ao cadastro';
                          const resto = (r?.nao_mapeadas || []).length
                            ? ` · ${r.nao_mapeadas.join(', ')} precisa(m) do módulo dono`
                            : '';
                          return base + resto;
                        })}>
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        <span className="ml-1.5">Ligar ao cadastro</span>
                      </Button>
                    )}
                    {(p.tipo === 'cpf_conflito' || p.tipo === 'cpf_divergente') && p.membro && p.conflito && !p.membro.deleted_at && !p.conflito.deleted_at && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => setFundir(p)}>
                        <GitMerge className="size-3.5" /><span className="ml-1.5">Fundir cadastros</span>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy}
                      onClick={() => agir(p.id, () => membresiaApi.identidade.setStatus(p.id, 'resolvida'), 'Pendência marcada como resolvida')}>
                      <CheckCircle2 className="size-3.5" /><span className="ml-1.5">Resolvida</span>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" disabled={busy}
                      onClick={() => agir(p.id, () => membresiaApi.identidade.setStatus(p.id, 'descartada'), 'Pendência descartada — não será recriada')}>
                      <X className="size-3.5" /><span className="ml-1.5">Descartar</span>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog · Confirmar o LOTE. Mostra os nomes: ligar é criar vínculo de
          pessoa, e a decisão precisa ser sobre gente com nome, não sobre "N". */}
      <AlertDialog open={confirmarLote} onOpenChange={(o) => { if (!o) setConfirmarLote(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ligar {selecionadosVisiveis.length} inscrição(ões) ao cadastro?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cada pessoa abaixo passa a apontar para o cadastro candidato em TODAS as
              inscrições dela. O servidor reconfere a evidência de cada uma antes de ligar —
              quem não passar fica na fila para decisão manual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {selecionadosVisiveis.map((p) => (
              <div key={p.id} className="p-2.5 text-xs">
                <div className="font-medium">
                  {p.evidencia?.insc?.nome || '—'}
                  <span className="text-muted-foreground font-normal"> → {p.membro?.nome || '—'}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {p.evidencia?.motivo}
                  {p.evidencia?.linhas > 1 ? ` · ${p.evidencia.linhas} inscrições` : ''}
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={loteBusy}
              onClick={(e) => { e.preventDefault(); ligarLote(selecionadosVisiveis.map((p) => p.id)); }}
            >
              {loteBusy ? 'Ligando…' : 'Ligar ao cadastro'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog · Resultado do lote (quem ficou de fora e por quê) */}
      <AlertDialog open={!!loteResultado} onOpenChange={(o) => { if (!o) setLoteResultado(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resultado do lote</AlertDialogTitle>
            <AlertDialogDescription>
              {loteResultado?.ligadas || 0} pessoa(s) ligada(s) ·{' '}
              {loteResultado?.linhas_ligadas || 0} inscrição(ões) resolvida(s)
              {loteResultado?.recusadas ? ` · ${loteResultado.recusadas} para decisão manual` : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!!loteResultado?.detalhe_recusadas?.length && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-amber-300/60 bg-amber-500/5 p-2.5 text-xs space-y-1.5">
              <div className="font-semibold text-amber-700 dark:text-amber-500">Ficaram na fila:</div>
              {loteResultado.detalhe_recusadas.map((r) => (
                <div key={r.id} className="text-muted-foreground">{r.motivo}</div>
              ))}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLoteResultado(null)}>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog · Confirmar CPF */}
      <AlertDialog open={!!confirmar} onOpenChange={(o) => { if (!o) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar o CPF no cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              O CPF <strong>{maskCpf(confirmar?.cpf_proposto)}</strong> será gravado em{' '}
              <strong>{confirmar?.membro?.nome}</strong> e passa a ser a identidade dessa pessoa
              em todas as portas (batismo, Next, voluntários, Kids, wifi). Confirme que o
              documento é realmente dela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmar && confirmarCpf(confirmar)}>Confirmar CPF</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog · Fundir */}
      <AlertDialog open={!!fundir} onOpenChange={(o) => { if (!o) setFundir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fundir os dois cadastros?</AlertDialogTitle>
            <AlertDialogDescription>
              A fusão soma os dados e o histórico (nada se perde) e o cadastro não mantido é
              removido. Escolha qual cadastro <strong>manter</strong>:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 flex-wrap">
            {[fundir?.conflito, fundir?.membro].filter(Boolean).map((m) => (
              <button key={m.id}
                className="flex-1 min-w-[200px] rounded-lg border border-border p-3 text-left hover:border-primary transition-colors"
                onClick={() => fundir && fundirCadastros(fundir, m.id)}>
                <div className="font-semibold text-sm">{m.nome}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{maskCpf(m.cpf)} · {maskTelefone(m.telefone)}</div>
                <div className="text-[11px] font-medium text-primary mt-1.5">Manter este</div>
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
