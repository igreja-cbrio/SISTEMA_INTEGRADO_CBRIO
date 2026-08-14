import { useState, useEffect, useCallback, useMemo } from 'react';
import { marketing as api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import MarketingNav from './MarketingNav';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { ChartGradients, gradFill } from '../../components/charts/ChartGradients';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Megaphone, Loader2, AlertTriangle, CalendarDays, ListChecks, Inbox,
  ExternalLink, CalendarClock, Check, X, ChevronRight, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================================
// DASHBOARD do Marketing · pedido do Pedro Paiva (2026-08-14)
//
// 3 blocos, como ele desenhou:
//   esquerda-topo   · as próximas entregas INTERNAS de quem está vendo
//   esquerda-baixo  · pulso das solicitações (feitas × resolvidas) + as próximas
//   direita         · calendário SEMANAL do ciclo criativo
//
// ⚠️ A régua de "em que fase o ciclo está nesta semana" mora no SERVIDOR
// (backend/utils/marketingSemanas.js · no gate de deploy). Esta tela só desenha
// o que ele devolve — recalcular aqui daria duas respostas pra mesma pergunta.
// ============================================================================

// Cores do gráfico. ⚠️ NÃO trocar sem revalidar:
// `node scripts/validate_palette.js "#00897B,#8b5cf6"` passa as 6 checagens
// (banda de luminosidade, croma, separação para daltonismo, piso de visão
// normal e contraste) nos DOIS temas — claro e escuro — com as MESMAS duas
// cores, e as duas já estão registradas em GRADIENT_PALETTE.
const COR_FEITAS = '#8b5cf6';
const COR_RESOLVIDAS = '#00897B';

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// 'YYYY-MM-DD' → '14/08'. Fatiando string, sem `new Date` (que cairia no fuso
// local e mostraria o dia anterior à noite).
const ddmm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');
const rotuloMes = (m) => (m ? `${MES_CURTO[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}` : '—');

const ESTADO_ROTULO = {
  triagem: 'Triagem', backlog: 'Backlog', pesquisa: 'Pesquisa', producao: 'Produção',
  revisao: 'Revisão', concluido: 'Concluído',
  fila: 'Backlog', em_producao: 'Produção', aguardando_solicitante: 'Revisão',
};

const STATUS_SOLIC = {
  pendente: 'Pendente', em_analise: 'Em análise', aprovado: 'Aprovado',
  em_atendimento: 'Em atendimento', em_cotacao: 'Em cotação',
  aguardando_entrega: 'Aguardando entrega',
  aguardando_aprovacao_financeira: 'Aguardando financeiro',
  aguardando_aprovacao_origem: 'Aguardando diretor',
};

function Faixa({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

export default function MarketingDashboard() {
  const { isAdmin, modulePerms } = useAuth();
  const isCoord = isAdmin || (modulePerms?.marketing?.escrita || 0) >= 5;

  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [semanasAdiante, setSemanasAdiante] = useState(6);
  const [faseAberta, setFaseAberta] = useState(null);
  const [verMembro, setVerMembro] = useState('');   // '' = minhas

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const params = { semanas: semanasAdiante };
      if (verMembro) params.membro_id = verMembro;
      setDados(await api.dashboard.get(params));
    } catch (e) {
      // ⚠️ Erro NÃO se disfarça de tela vazia: "não há nada" e "não carregou"
      // levam a decisões opostas.
      setErro(e.message || 'Não foi possível carregar o dashboard');
    } finally { setLoading(false); }
  }, [semanasAdiante, verMembro]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suas entregas, o pulso das solicitações e em que fase cada ciclo criativo está por semana
          </p>
        </div>
        <div className="shrink-0"><MarketingNav /></div>
      </div>

      {erro && <Faixa>{erro} <button onClick={carregar} className="underline font-medium">Tentar de novo</button></Faixa>}
      {(dados?.avisos || []).map((a, i) => <Faixa key={i}>{a}</Faixa>)}

      {loading && !dados ? (
        <div className="flex justify-center my-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : dados ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 space-y-4">
            <BoxMinhasTarefas
              dados={dados.minhas_tarefas}
              equipe={dados.equipe}
              verMembro={verMembro}
              onVerMembro={setVerMembro}
              isCoord={isCoord}
              onMudou={carregar}
            />
            <BoxSolicitacoes dados={dados.solicitacoes} />
          </div>
          <div className="lg:col-span-7">
            <BoxCiclo
              ciclo={dados.ciclo}
              semanas={dados.semanas}
              adiante={semanasAdiante}
              onAdiante={setSemanasAdiante}
              onAbrirFase={setFaseAberta}
            />
          </div>
        </div>
      ) : null}

      <DialogFase celula={faseAberta} onClose={() => setFaseAberta(null)} />
    </div>
  );
}

// ─── Bloco 1 · minhas próximas entregas ─────────────────────────────────────
function BoxMinhasTarefas({ dados, equipe, verMembro, onVerMembro, isCoord, onMudou }) {
  if (!dados) return null;
  const nomeVisto = verMembro ? (equipe || []).find(m => m.id === verMembro)?.nome : null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2 text-sm">
          <ListChecks className="h-4 w-4 text-primary" />
          {nomeVisto ? `Próximas entregas · ${nomeVisto}` : 'Minhas próximas entregas'}
        </h2>
        <div className="flex items-center gap-2">
          {dados.total > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {dados.itens.length} de {dados.total}
              {dados.atrasadas > 0 && <span className="text-rose-600 dark:text-rose-400 font-medium"> · {dados.atrasadas} atrasada{dados.atrasadas > 1 ? 's' : ''}</span>}
            </span>
          )}
          {/* O coordenador distribui e não pega tarefa interna — sem este
              seletor a caixa dele nasceria sempre vazia. */}
          {isCoord && (equipe || []).length > 0 && (
            <select
              value={verMembro}
              onChange={e => onVerMembro(e.target.value)}
              className="h-7 rounded-md border border-border bg-card px-2 text-[11px] max-w-[150px]"
              title="Ver a fila de outra pessoa"
            >
              <option value="">Minhas tarefas</option>
              {equipe.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          )}
        </div>
      </div>

      {dados.erro ? (
        <Faixa>{dados.erro}</Faixa>
      ) : dados.sou_membro === false && !verMembro ? (
        // ⚠️ Não é lista vazia — é "você não está na equipe". Devolver zero
        // tarefas sem dizer isso se lê como "não tenho nada a fazer".
        <p className="text-xs text-muted-foreground py-4">
          Você não está cadastrado como membro da equipe de Marketing, então não há
          tarefas vinculadas ao seu nome.
          {isCoord && (equipe || []).length > 0 && ' Use o seletor acima para ver a fila de cada pessoa.'}
        </p>
      ) : dados.itens.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">
          {nomeVisto
            ? `Nenhuma tarefa interna em aberto atribuída a ${nomeVisto}.`
            : 'Nenhuma tarefa interna em aberto atribuída a você.'}
          {' '}As tarefas do ciclo criativo aparecem no calendário à direita.
        </p>
      ) : (
        <>
          <ol className="space-y-1.5">
            {dados.itens.map((t, i) => (
              <LinhaTarefa key={t.id} n={i + 1} tarefa={t} isCoord={isCoord} onMudou={onMudou} />
            ))}
          </ol>
          {/* ⚠️ Declarado: sem prazo a ordem é a da fila do Kanban, não uma data. */}
          {dados.sem_prazo > 0 && (
            <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
              {dados.sem_prazo === dados.total
                ? 'Nenhuma tem prazo definido ainda — a ordem aqui é a da fila do Kanban.'
                : `${dados.sem_prazo} sem prazo definido (vão para o fim da lista, na ordem da fila).`}
              {isCoord && ' Clique no calendário ao lado de cada uma para definir.'}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function LinhaTarefa({ n, tarefa, isCoord, onMudou }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(tarefa.prazo || '');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      // `prazo_producao` é o prazo INTERNO (o que o coletor do MKT-PRAZO prefere).
      await api.atualizarCard(tarefa.id, { prazo_producao: valor || null });
      toast.success(valor ? `Prazo definido para ${ddmm(valor)}` : 'Prazo removido');
      setEditando(false);
      onMudou();
    } catch (e) { toast.error(e.message || 'Não foi possível salvar o prazo'); }
    finally { setSalvando(false); }
  }

  return (
    <li className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40 transition-colors">
      <span className="text-[11px] text-muted-foreground tabular-nums w-4 shrink-0 mt-0.5">{n}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate flex items-center gap-1.5">
          {tarefa.raia_rapida && <Zap className="h-3 w-3 text-amber-500 shrink-0" title="Raia rápida" />}
          {tarefa.titulo}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">{ESTADO_ROTULO[tarefa.estado] || tarefa.estado}</span>
          {tarefa.origem === 'solicitacao' && <span className="text-[10px] text-muted-foreground">· de solicitação</span>}
        </div>
      </div>

      {editando ? (
        <div className="flex items-center gap-1 shrink-0">
          <Input type="date" value={valor} onChange={e => setValor(e.target.value)} className="h-7 w-[130px] text-xs" />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={salvar} disabled={salvando} title="Salvar">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditando(false); setValor(tarefa.prazo || ''); }} title="Cancelar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : tarefa.prazo ? (
        <button
          onClick={() => isCoord && setEditando(true)}
          disabled={!isCoord}
          className={`shrink-0 text-[11px] tabular-nums rounded px-1.5 py-0.5 font-medium ${
            tarefa.atrasado
              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
              : 'bg-muted text-muted-foreground'} ${isCoord ? 'hover:ring-1 hover:ring-border' : ''}`}
          title={isCoord ? 'Alterar prazo' : undefined}
        >
          {ddmm(tarefa.prazo)}
        </button>
      ) : isCoord ? (
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditando(true)} title="Definir prazo">
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      ) : (
        <span className="shrink-0 text-[10px] text-muted-foreground">sem prazo</span>
      )}
    </li>
  );
}

// ─── Bloco 2 · pulso das solicitações ───────────────────────────────────────
function BoxSolicitacoes({ dados }) {
  // ⚠️ useMemo ANTES de qualquer return condicional (regra de hooks) — e as deps
  // são lidas com `dados?.` porque o bloco pode não ter chegado.
  const serie = useMemo(
    () => (dados?.serie || []).map(m => ({ ...m, rotulo: rotuloMes(m.mes) })),
    [dados?.serie],
  );
  if (!dados) return null;

  const totalFeitas = serie.reduce((a, m) => a + m.criadas, 0);
  const totalResolvidas = serie.reduce((a, m) => a + m.resolvidas, 0);
  const semDado = totalFeitas === 0 && totalResolvidas === 0;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="font-semibold flex items-center gap-2 text-sm">
          <Inbox className="h-4 w-4 text-primary" />
          Solicitações para o Marketing
        </h2>
        {/* ⚠️ A JANELA vai colada no número: "10 pedidas" sem período faz um
            número certo parecer errado (lição do censo). */}
        <span className="text-[10px] text-muted-foreground">últimos 6 meses</span>
      </div>

      {dados.erro ? <Faixa>{dados.erro}</Faixa> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* gráfico */}
          <div>
            <div className="flex items-baseline gap-3 mb-1">
              <div>
                <p className="text-lg font-bold tabular-nums leading-none">{totalFeitas}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COR_FEITAS }} />
                  pedidas
                </p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums leading-none">{totalResolvidas}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COR_RESOLVIDAS }} />
                  entregues
                </p>
              </div>
            </div>

            {semDado ? (
              <p className="text-xs text-muted-foreground py-6">Nenhuma solicitação nos últimos 6 meses.</p>
            ) : (
              <div className="h-[104px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie} barGap={2} barCategoryGap="24%">
                    <ChartGradients colors={[COR_FEITAS, COR_RESOLVIDAS]} />
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={20} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      labelFormatter={(l) => `Mês de ${l}`}
                      formatter={(v, k) => [v, k === 'criadas' ? 'Pedidas' : 'Entregues']}
                    />
                    {/* radius nas pontas de dado, ancoradas na linha de base */}
                    <Bar dataKey="criadas" name="criadas" fill={gradFill(COR_FEITAS)} radius={[4, 4, 0, 0]} maxBarSize={16} />
                    <Bar dataKey="resolvidas" name="resolvidas" fill={gradFill(COR_RESOLVIDAS)} radius={[4, 4, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* ⚠️ "Pedidas" e "entregues" medem coisas DIFERENTES (entrada × saída)
                e a divergência é o diagnóstico — não é para somar nem subtrair. */}
            <p className="text-[10px] text-muted-foreground mt-1">
              Entrada × saída no mês. Uma solicitação entregue em agosto pode ter entrado em julho.
            </p>
          </div>

          {/* próximas por prazo */}
          <div className="sm:border-l sm:border-border sm:pl-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-medium">Próximas por prazo</p>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {dados.abertas} aberta{dados.abertas === 1 ? '' : 's'}
                {dados.atrasadas > 0 && <span className="text-rose-600 dark:text-rose-400 font-medium"> · {dados.atrasadas} atrasada{dados.atrasadas > 1 ? 's' : ''}</span>}
              </span>
            </div>

            {(dados.proximas || []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">Nenhuma solicitação em aberto.</p>
            ) : (
              <ul className="space-y-1">
                {dados.proximas.map(s => (
                  <li key={s.id} className="flex items-start gap-2 text-xs">
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${s.atrasada ? 'bg-rose-500' : s.eh_urgente ? 'bg-amber-500' : 'bg-muted-foreground/40'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate flex items-center gap-1">
                        {s.eh_urgente && <Badge className="h-4 px-1 text-[9px] bg-rose-500/15 text-rose-700 dark:text-rose-400">urgente</Badge>}
                        {s.titulo}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {STATUS_SOLIC[s.status] || s.status}
                        {s.prazo && (
                          <>
                            {' · '}
                            <span className={s.atrasada ? 'text-rose-600 dark:text-rose-400 font-medium' : ''}>
                              {ddmm(s.prazo)}
                            </span>
                            {/* ⚠️ DIZ qual prazo é: a data que o solicitante pediu
                                ou o SLA interno. Sem isso o mesmo número significa
                                duas coisas diferentes de linha para linha. */}
                            {s.prazo_origem === 'sla' ? ' (SLA)' : ' (pedida)'}
                          </>
                        )}
                        {!s.prazo && ' · sem data'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <a href="/solicitacoes" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-2">
              Abrir Solicitações <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Bloco 3 · calendário semanal do ciclo criativo ─────────────────────────
function BoxCiclo({ ciclo, semanas, adiante, onAdiante, onAbrirFase }) {
  // Pivot: o servidor devolve linha por EVENTO; a tela mostra por SEMANA (é a
  // pergunta do Pedro: "por semana, qual fase do ciclo nós estamos").
  // ⚠️ useMemo ANTES do return condicional (regra de hooks).
  const porSemana = useMemo(() => {
    return (semanas || []).map(s => ({
      ...s,
      itens: (ciclo?.linhas || [])
        .map(l => ({ evento: l, celula: l.celulas.find(c => c.semana_idx === s.idx) }))
        .filter(x => x.celula && !x.celula.vazio),
    }));
  }, [semanas, ciclo?.linhas]);
  if (!ciclo) return null;

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-primary" />
            Ciclo criativo por semana
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Em que fase cada evento/série está em cada semana. Clique para ver o que o Marketing tem a entregar.
          </p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          {[4, 6, 10].map(n => (
            <button
              key={n}
              onClick={() => onAdiante(n)}
              className={`px-2 py-1 text-[11px] font-medium transition-colors ${adiante === n ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}`}
            >
              {n} sem
            </button>
          ))}
        </div>
      </div>

      {ciclo.erro ? <Faixa>{ciclo.erro}</Faixa> : (ciclo.linhas || []).length === 0 ? (
        <p className="text-xs text-muted-foreground py-8">
          Nenhum ciclo criativo ativo com fase nesta janela.
          {ciclo.ciclos_ativos > 0 && ` Há ${ciclo.ciclos_ativos} ciclo(s) ativo(s), mas todos começam depois — aumente a janela acima.`}
        </p>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)] pr-1">
            {porSemana.map(s => (
              <div
                key={s.idx}
                className={`rounded-lg border p-2 ${s.eh_atual ? 'border-primary/50 bg-primary/5' : 'border-border'}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold tabular-nums">{ddmm(s.ini)} – {ddmm(s.fim)}</span>
                  {s.eh_atual && <Badge className="h-4 px-1.5 text-[9px] bg-primary/15 text-primary">esta semana</Badge>}
                  {s.offset === 1 && <Badge className="h-4 px-1.5 text-[9px] bg-muted text-muted-foreground">próxima</Badge>}
                  {s.itens.length === 0 && <span className="text-[10px] text-muted-foreground">nenhum ciclo em andamento</span>}
                </div>

                {/* Um retângulo por evento, cobrindo a semana inteira. */}
                <div className="space-y-1">
                  {s.itens.map(({ evento, celula }) => (
                    <button
                      key={evento.id}
                      onClick={() => onAbrirFase({ ...celula, evento_nome: evento.nome, semana: s })}
                      className="w-full text-left rounded-md border border-border bg-card hover:bg-accent/50 hover:border-primary/40 transition-colors px-2 py-1.5 flex items-center gap-2"
                    >
                      <span className="text-xs font-medium truncate flex-1 min-w-0">{evento.nome}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
                        Fase {celula.numero_fase}
                      </span>
                      <Badge className="h-5 px-1.5 text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-300 shrink-0 max-w-[45%] truncate">
                        {celula.nome_fase}
                      </Badge>
                      {/* A semana em que o ciclo VIRA de fase é a que a equipe
                          mais precisa ver — por isso a virada é declarada. */}
                      {celula.transicao && (
                        <span className="text-[10px] text-muted-foreground shrink-0 hidden md:inline" title={`Entra na fase ${celula.transicao.numero_fase} · ${celula.transicao.nome_fase} nesta semana`}>
                          → F{celula.transicao.numero_fase}
                        </span>
                      )}
                      {celula.mkt_pendentes > 0 ? (
                        <Badge className="h-5 px-1.5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0 tabular-nums">
                          {celula.mkt_pendentes} a entregar
                        </Badge>
                      ) : celula.mkt_total > 0 ? (
                        <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
                          entregue
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground shrink-0 hidden lg:inline">sem tarefa</span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ⚠️ Ciclo ativo que NÃO aparece porque começa depois da janela é
              DECLARADO: "só vejo 4 séries" com 7 ciclos ativos parece bug. */}
          {(ciclo.fora_da_janela > 0 || ciclo.sem_data > 0) && (
            <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border">
              {ciclo.fora_da_janela > 0 && `${ciclo.fora_da_janela} de ${ciclo.ciclos_ativos} ciclos ativos começam depois desta janela. `}
              {ciclo.sem_data > 0 && `${ciclo.sem_data} fase(s) sem data prevista não puderam ser posicionadas.`}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Detalhe da fase (clique no retângulo) ──────────────────────────────────
function DialogFase({ celula, onClose }) {
  const [det, setDet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!celula?.fase_id) { setDet(null); setErro(null); return; }
    let vivo = true;
    setLoading(true); setErro(null); setDet(null);
    api.dashboard.fase(celula.fase_id)
      .then(d => { if (vivo) setDet(d); })
      .catch(e => { if (vivo) setErro(e.message || 'Não foi possível carregar a fase'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [celula?.fase_id]);

  return (
    <Dialog open={!!celula} onOpenChange={o => !o && onClose()}>
      {/* Padrão da casa para modal alto: flex-col SEM overflow no container,
          corpo com flex-1 overflow-y-auto min-h-0 (senão corta em vez de rolar). */}
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {celula?.evento_nome}
            <span className="block text-xs font-normal text-muted-foreground mt-1">
              Fase {celula?.numero_fase} · {celula?.nome_fase}
              {celula?.semana && ` · semana de ${ddmm(celula.semana.ini)} a ${ddmm(celula.semana.fim)}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : erro ? (
            <Faixa>{erro}</Faixa>
          ) : det ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="tabular-nums">{ddmm(det.fase.de)} a {ddmm(det.fase.ate)}</span>
                {det.fase.area && <span>· área da fase: {det.fase.area}</span>}
                {det.evento?.link && (
                  <a href={det.evento.link} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 ml-auto">
                    Abrir no Eventos <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {det.vazio ? (
                // ⚠️ Mensagem pedida nominalmente pelo Pedro. Dizer O MOTIVO
                // ("a fase é de produção" × "a fase é de marketing mas ninguém
                // cadastrou tarefa") muda o que a pessoa faz a seguir.
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium">Não há atividade do Marketing programada para essa etapa.</p>
                  <p className="text-xs text-muted-foreground mt-1">{det.motivo_vazio}</p>
                  {det.entregas_padrao && (
                    <p className="text-xs text-muted-foreground mt-3">
                      <span className="font-medium text-foreground">O que essa fase normalmente entrega:</span> {det.entregas_padrao}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {det.pendentes} de {det.total} pendente{det.pendentes === 1 ? '' : 's'} nesta fase.
                  </p>
                  <div className="space-y-2">
                    {det.itens.map(it => (
                      <div key={it.tarefa_id} className={`rounded-lg border border-border p-3 ${it.feito ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              {it.feito && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                              {it.titulo}
                            </p>
                            {it.descricao && <p className="text-xs text-muted-foreground mt-0.5">{it.descricao}</p>}
                            {it.entrega && <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium">Entrega:</span> {it.entrega}</p>}
                          </div>
                          {it.is_critical && <Badge className="text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-400 shrink-0">crítica</Badge>}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                          {it.card ? (
                            <>
                              <span>
                                <span className="font-medium text-foreground">{ESTADO_ROTULO[it.card.estado] || it.card.estado}</span> no Kanban
                              </span>
                              <span>{it.card.dono ? `Dono: ${it.card.dono}` : 'Sem dono'}</span>
                              {it.card.etiqueta && <span>{it.card.etiqueta}</span>}
                            </>
                          ) : (
                            // Espelho ausente é DECLARADO — a tarefa existe no
                            // /eventos e não tem card no Kanban do Marketing.
                            <span className="text-amber-700 dark:text-amber-400">Sem card no Kanban do Marketing</span>
                          )}
                          {(it.prazo || it.card?.prazo) && <span className="tabular-nums">Prazo {ddmm(it.prazo || it.card.prazo)}</span>}
                          {it.responsavel_eventos && <span>Responsável no Eventos: {it.responsavel_eventos}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {det.entregas_padrao && (
                    <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
                      <span className="font-medium text-foreground">Padrão da fase:</span> {det.entregas_padrao}
                    </p>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
