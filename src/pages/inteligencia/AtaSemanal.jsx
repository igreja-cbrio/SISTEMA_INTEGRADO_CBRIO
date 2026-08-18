// ATA Semanal · reunião ministerial de segunda-feira
//
// De onde vem o conteúdo: a reunião é gravada no Plaud e a ata é redigida por
// IA a partir da transcrição. Esta tela NÃO gera nada — ela lê
// `governance_meetings` (tipo Ministerial) e deixa a pessoa fazer as duas
// coisas que a máquina não consegue: dizer QUEM ficou responsável e transformar
// a pendência em tarefa de alguém.
//
// ⚠️ POR QUE O RESPONSÁVEL É PREENCHIDO AQUI, E NÃO PELA IA:
// a gravação do Plaud não identifica falante. Conferido em 18/08/2026 nas duas
// pontas — `get_transcript` devolve segmentos sem campo de falante, e o bloco
// "Summary" numera 172 vozes distintas numa reunião de ~15 pessoas. Atribuir
// decisão à pessoa errada numa ata é pior do que não atribuir.
//
// ⚠️ A ATA É UM DOCUMENTO CORRIDO, NÃO UM ACORDEÃO.
// A primeira versão quebrava cada tópico num bloco recolhível e fechado. Vista
// em uso, a tela abria como um índice de 12 títulos onde não se lia nada —
// pedido do Matheus para voltar a documento único, estilo Notion (18/08/2026).
// As PENDÊNCIAS seguem recolhíveis, porque ali a pessoa age em vez de ler.

import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import {
  FileText, Clock, Users, CircleAlert, Check,
  ChevronRight, ChevronDown, ListTodo, ArrowUpRight, Loader2,
} from 'lucide-react';
import { ataSemanal as api } from '../../api';
import { formatErro } from '../../lib/formatErro';
import { C } from '../governanca/compartilhado';
import SeletorResponsavel from '../../components/ata-semanal/SeletorResponsavel';

// ⚠️ Os valores vêm do CHECK de governance_tasks.status. A primeira versão
// mandava 'andamento' e o banco recusa — só aceita 'em_andamento'. Errar aqui
// não dá erro de compilação, só falha no clique do usuário.
const STATUS_TAREFA = [
  { valor: 'pendente',      rotulo: 'Pendente' },
  { valor: 'em_andamento',  rotulo: 'Em andamento' },
  { valor: 'concluida',     rotulo: 'Concluída' },
  { valor: 'nao_executada', rotulo: 'Não executada' },
  { valor: 'cancelada',     rotulo: 'Cancelada' },
];

function fmtDataLonga(iso) {
  if (!iso) return '—';
  // `date` vem como AAAA-MM-DD puro. `new Date(iso)` interpretaria como UTC e
  // mostraria o dia anterior no Brasil — o clássico "reunião de domingo" que
  // nunca existiu.
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

function fmtDataCurta(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Quebra a ata pelos títulos `## `. O que vier antes do primeiro é preâmbulo.
function secoesDaAta(md) {
  const secoes = [];
  const preambulo = [];
  let atual = null;

  for (const linha of String(md || '').split('\n')) {
    const t = linha.match(/^##\s+(.*)$/);
    if (t) {
      if (atual) secoes.push(atual);
      atual = { titulo: t[1].trim(), corpo: [] };
    } else if (atual) {
      atual.corpo.push(linha);
    } else if (!/^#\s/.test(linha)) {
      preambulo.push(linha); // o `# título` é redundante com o cabeçalho da tela
    }
  }
  if (atual) secoes.push(atual);

  return {
    preambulo: preambulo.join('\n').trim(),
    secoes: secoes.map((s) => ({ ...s, corpo: s.corpo.join('\n').trim() })),
  };
}

// Estilos do markdown como componentes, não via classe CSS de outro módulo:
// a formatação da ata não pode depender de folha de estilo alheia continuar
// existindo. Medidas escolhidas para leitura corrida (linha alta, respiro
// entre parágrafos), que é como uma ata é lida.
const MD = {
  p:      (p) => <p className="mb-3 leading-7" {...p} />,
  strong: (p) => <strong className="font-semibold" {...p} />,
  em:     (p) => <em {...p} />,
  ul:     (p) => <ul className="list-disc pl-6 mb-3 space-y-1.5 leading-7" {...p} />,
  ol:     (p) => <ol className="list-decimal pl-6 mb-3 space-y-1.5 leading-7" {...p} />,
  li:     (p) => <li {...p} />,
  h3:     (p) => <h3 className="font-semibold text-[15px] mt-5 mb-2" {...p} />,
  h4:     (p) => <h4 className="font-semibold text-sm mt-4 mb-1.5" {...p} />,
  hr:     () => <hr className="my-5" style={{ borderColor: C.border }} />,
  blockquote: (p) => (
    <blockquote className="border-l-2 pl-4 my-4 leading-7"
                style={{ borderColor: C.primary, color: C.t2 }} {...p} />
  ),
  table:  (p) => (
    <div className="overflow-x-auto my-4 rounded-lg border" style={{ borderColor: C.border }}>
      <table className="text-sm border-collapse w-full" {...p} />
    </div>
  ),
  th:     (p) => <th className="text-left font-semibold px-3 py-2 border-b text-xs uppercase tracking-wide"
                     style={{ borderColor: C.border, color: C.t3 }} {...p} />,
  td:     (p) => <td className="px-3 py-2 border-b align-top" style={{ borderColor: C.border }} {...p} />,
  code:   (p) => <code className="text-[13px] px-1.5 py-0.5 rounded" style={{ background: C.inputBg }} {...p} />,
  a:      (p) => <a className="underline" style={{ color: C.primary }} target="_blank" rel="noreferrer" {...p} />,
};

function Recolhivel({ titulo, subtitulo, aberto, onToggle, children, destaque }) {
  return (
    <section className="rounded-xl border overflow-hidden"
             style={{ background: C.card, borderColor: destaque ? C.primary : C.border }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 text-left" aria-expanded={aberto}>
        {aberto ? <ChevronDown size={16} style={{ color: C.t3 }} />
                : <ChevronRight size={16} style={{ color: C.t3 }} />}
        <span className="text-sm font-semibold flex-1">{titulo}</span>
        {subtitulo && <span className="text-xs" style={{ color: C.t3 }}>{subtitulo}</span>}
      </button>
      {aberto && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: C.border }}>
          <div className="pt-3">{children}</div>
        </div>
      )}
    </section>
  );
}

export default function AtaSemanal() {
  const [reunioes, setReunioes] = useState([]);
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [salvandoId, setSalvandoId] = useState(null);
  const [enviandoId, setEnviandoId] = useState(null);
  const [pendAberta, setPendAberta] = useState(true);
  const [verConcluidas, setVerConcluidas] = useState(false);
  const [colaboradores, setColaboradores] = useState([]);

  const carregarLista = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const dados = await api.reunioes();
      setReunioes(dados || []);
      setSelecionadaId((atual) => atual ?? (dados || [])[0]?.id ?? null);
    } catch (e) {
      toast.error(formatErro(e, 'Não foi possível carregar as reuniões'));
    } finally {
      setCarregandoLista(false);
    }
  }, []);

  useEffect(() => { carregarLista(); }, [carregarLista]);

  // Lista de colaboradores para o seletor. Falha em silêncio de propósito: sem
  // ela o seletor fica vazio, mas a ata continua legível — e ler é o uso
  // principal da tela.
  useEffect(() => {
    let cancelado = false;
    api.colaboradores()
      .then((d) => { if (!cancelado) setColaboradores(d || []); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!selecionadaId) { setDetalhe(null); return; }
    let cancelado = false;
    setCarregandoDetalhe(true);
    api.reuniao(selecionadaId)
      .then((d) => { if (!cancelado) setDetalhe(d); })
      .catch((e) => { if (!cancelado) toast.error(formatErro(e, 'Não foi possível abrir a ata')); })
      .finally(() => { if (!cancelado) setCarregandoDetalhe(false); });
    return () => { cancelado = true; };
  }, [selecionadaId]);

  const { preambulo, secoes } = useMemo(() => secoesDaAta(detalhe?.ata), [detalhe?.ata]);

  const tarefas = useMemo(
    () => [...(detalhe?.tasks || [])].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0)),
    [detalhe],
  );

  // Sem dono primeiro: é a fila de trabalho de quem abre a tela.
  const { semDono, comDono, encerradas } = useMemo(() => {
    const temDono = (t) => (t.responsaveis?.length ? true : Boolean(String(t.responsavel || '').trim()));
    const fim = (t) => ['concluida', 'cancelada', 'nao_executada'].includes(t.status);
    const abertas = tarefas.filter((t) => !fim(t));
    return {
      // Um array vazio conta como SEM dono: `responsaveis: []` chega assim
      // depois de alguém limpar a lista.
      semDono:    abertas.filter((t) => !temDono(t)),
      comDono:    abertas.filter((t) => temDono(t)),
      encerradas: tarefas.filter(fim),
    };
  }, [tarefas]);

  const patchLocal = useCallback((id, campos) => {
    setDetalhe((d) => ({
      ...d,
      tasks: (d?.tasks || []).map((t) => (t.id === id ? { ...t, ...campos } : t)),
    }));
  }, []);

  // Atualização otimista: a linha muda na hora e volta atrás se o servidor
  // recusar. Sem isso, preencher 16 pendências vira 16 esperas.
  const salvarTarefa = useCallback(async (tarefa, campos) => {
    const anterior = { ...tarefa };
    patchLocal(tarefa.id, campos);
    setSalvandoId(tarefa.id);
    try {
      await api.salvarTarefa(tarefa.id, campos);
    } catch (e) {
      patchLocal(tarefa.id, anterior);
      toast.error(formatErro(e, 'Não foi possível salvar'));
    } finally {
      setSalvandoId(null);
    }
  }, [patchLocal]);

  const enviarParaTarefas = useCallback(async (tarefa) => {
    setEnviandoId(tarefa.id);
    try {
      const r = await api.enviarParaMinhasTarefas(tarefa.id);
      patchLocal(tarefa.id, { tarefas_pessoais_ids: r.tarefas_ids, tarefa_pessoal_id: r.tarefas_ids?.[0] });
      if (r.criada) {
        const nomes = r.responsaveis || [];
        toast.success(nomes.length
          ? `Enviada para ${nomes.length > 1 ? 'as tarefas de ' + nomes.join(', ') : 'as tarefas de ' + nomes[0]}`
          : 'Enviada para Minhas Tarefas');
      } else {
        toast.info('Esta pendência já havia sido enviada');
      }
    } catch (e) {
      toast.error(formatErro(e, 'Não foi possível enviar'));
    } finally {
      setEnviandoId(null);
    }
  }, [patchLocal]);

  const geradaPorIa = String(detalhe?.observacoes || '').includes('Gerada por IA');

  const LinhaTarefa = (t) => {
    const jaEnviada = Boolean(t.tarefas_pessoais_ids?.length || t.tarefa_pessoal_id);
    return (
      <li key={t.id} className="px-4 py-3 border-b last:border-b-0" style={{ borderColor: C.border }}>
        <div className="text-sm mb-2">{t.titulo}</div>
        <div className="flex flex-wrap gap-2 items-center">
          <SeletorResponsavel
            valores={t.responsaveis || (t.responsavel ? [t.responsavel] : [])}
            colaboradores={colaboradores}
            cores={C}
            onChange={(nomes) => salvarTarefa(t, {
              responsaveis: nomes,
              // Espelho local para a UI não piscar: o backend faz o mesmo na
              // coluna antiga, que o módulo de governança continua lendo.
              responsavel: nomes.length ? nomes.join(', ') : null,
            })}
          />
          <input
            type="date"
            defaultValue={t.prazo || ''}
            onChange={(e) => salvarTarefa(t, { prazo: e.target.value || null })}
            className="text-xs rounded-md px-2 py-1 border"
            style={{ background: C.inputBg, borderColor: C.border, color: C.text }}
          />
          <select
            value={t.status || 'pendente'}
            onChange={(e) => salvarTarefa(t, { status: e.target.value })}
            className="text-xs rounded-md px-2 py-1 border"
            style={{ background: C.inputBg, borderColor: C.border, color: C.text }}
          >
            {STATUS_TAREFA.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
          </select>

          {/* A tarefa vai para o Minhas Tarefas do RESPONSÁVEL da pendência,
              não de quem clica — ver o endpoint /tarefas/:id/enviar. Se não
              houver responsável, fica com quem clicou. */}
          {jaEnviada ? (
            <span className="text-xs flex items-center gap-1" style={{ color: C.primary }}>
              <Check size={12} /> em Minhas Tarefas
            </span>
          ) : (
            <button
              onClick={() => enviarParaTarefas(t)}
              disabled={enviandoId === t.id}
              className="text-xs rounded-md px-2 py-1 border flex items-center gap-1"
              style={{ background: 'transparent', borderColor: C.primary, color: C.primary }}
            >
              {enviandoId === t.id
                ? <><Loader2 size={12} className="animate-spin" /> enviando…</>
                : <><ArrowUpRight size={12} /> virar tarefa</>}
            </button>
          )}

          {salvandoId === t.id && <span className="text-xs" style={{ color: C.t3 }}>salvando…</span>}
        </div>
      </li>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto" style={{ color: C.text }}>
      <header className="mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText size={22} style={{ color: C.primary }} />
          ATA Semanal
        </h1>
        <p className="text-sm mt-1" style={{ color: C.t2 }}>
          Reunião ministerial de segunda-feira · ata redigida a partir da gravação
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-5 items-start">
        {/* ── Reuniões ───────────────────────────────────────────────────── */}
        <aside className="rounded-xl border overflow-hidden lg:sticky lg:top-4"
               style={{ background: C.card, borderColor: C.border }}>
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide border-b flex items-center justify-between"
               style={{ color: C.t3, borderColor: C.border }}>
            <span>Reuniões</span><span>{reunioes.length}</span>
          </div>

          {carregandoLista ? (
            <div className="p-4 text-sm" style={{ color: C.t3 }}>Carregando…</div>
          ) : reunioes.length === 0 ? (
            <div className="p-4 text-sm" style={{ color: C.t3 }}>Nenhuma reunião registrada ainda.</div>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto">
              {reunioes.map((r) => {
                const ativa = r.id === selecionadaId;
                const temAta = Boolean(String(r.ata || '').trim());
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelecionadaId(r.id)}
                      className="w-full text-left px-4 py-2.5 border-b transition-colors"
                      style={{ borderColor: C.border, background: ativa ? C.primaryBg : 'transparent' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{fmtDataCurta(r.date)}</span>
                        <span className="text-[11px] flex items-center gap-1"
                              style={{ color: temAta ? C.primary : C.t3 }}>
                          {temAta ? <><Check size={11} /> ata</> : <><CircleAlert size={11} /> sem ata</>}
                        </span>
                      </div>
                      <div className="text-[11px] mt-0.5 capitalize" style={{ color: C.t3 }}>
                        {fmtDataLonga(r.date).split(',')[0]}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ── Conteúdo ───────────────────────────────────────────────────── */}
        <main className="min-w-0 flex flex-col gap-4">
          {carregandoDetalhe && !detalhe ? (
            <div className="rounded-xl border p-6 text-sm"
                 style={{ background: C.card, borderColor: C.border, color: C.t3 }}>Carregando ata…</div>
          ) : !detalhe ? (
            <div className="rounded-xl border p-6 text-sm"
                 style={{ background: C.card, borderColor: C.border, color: C.t3 }}>Selecione uma reunião.</div>
          ) : (
            <>
              {/* Cabeçalho */}
              <div className="rounded-xl border p-5" style={{ background: C.card, borderColor: C.border }}>
                <h2 className="text-lg font-semibold capitalize mb-2">{fmtDataLonga(detalhe.date)}</h2>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" style={{ color: C.t2 }}>
                  <span className="flex items-center gap-1.5"><Clock size={14} /> 10h30 – 12h30</span>
                  <span className="flex items-center gap-1.5">
                    <Users size={14} /> {detalhe.participantes?.length || 0} mencionados
                  </span>
                  <span className="flex items-center gap-1.5"><ListTodo size={14} /> {tarefas.length} pendências</span>
                </div>
                {geradaPorIa && (
                  <div className="mt-3 text-xs rounded-lg px-3 py-2" style={{ background: C.primaryBg, color: C.t2 }}>
                    Rascunho gerado por IA a partir da gravação. A transcrição não identifica
                    quem falou — confira antes de tratar como registro oficial.
                  </div>
                )}
              </div>

              {/* Pendências · seguem recolhíveis porque aqui a pessoa AGE */}
              {tarefas.length > 0 && (
                <Recolhivel
                  titulo="Pendências"
                  subtitulo={`${semDono.length} sem responsável · ${comDono.length} atribuídas${encerradas.length ? ` · ${encerradas.length} encerradas` : ''}`}
                  aberto={pendAberta}
                  onToggle={() => setPendAberta((v) => !v)}
                  destaque={semDono.length > 0}
                >
                  {semDono.length > 0 && (
                    <>
                      <div className="text-xs font-semibold mb-1 flex items-center gap-1.5" style={{ color: '#b45309' }}>
                        <CircleAlert size={13} /> Sem responsável ({semDono.length})
                      </div>
                      <ul className="rounded-lg border mb-4" style={{ borderColor: C.border }}>
                        {semDono.map(LinhaTarefa)}
                      </ul>
                    </>
                  )}
                  {comDono.length > 0 && (
                    <>
                      <div className="text-xs font-semibold mb-1" style={{ color: C.t2 }}>
                        Atribuídas ({comDono.length})
                      </div>
                      <ul className="rounded-lg border" style={{ borderColor: C.border }}>
                        {comDono.map(LinhaTarefa)}
                      </ul>
                    </>
                  )}
                  {encerradas.length > 0 && (
                    <div className="mt-3">
                      <button onClick={() => setVerConcluidas((v) => !v)} className="text-xs underline" style={{ color: C.t3 }}>
                        {verConcluidas ? 'ocultar' : 'mostrar'} {encerradas.length} encerradas
                      </button>
                      {verConcluidas && (
                        <ul className="rounded-lg border mt-2" style={{ borderColor: C.border }}>
                          {encerradas.map(LinhaTarefa)}
                        </ul>
                      )}
                    </div>
                  )}
                </Recolhivel>
              )}

              {/* ── A ata · documento único ──────────────────────────────── */}
              {!String(detalhe.ata || '').trim() ? (
                <div className="rounded-xl border p-5 text-sm"
                     style={{ background: C.card, borderColor: C.border, color: C.t3 }}>
                  Esta reunião ainda não tem ata. A gravação está no Plaud —
                  {' '}{String(detalhe.observacoes || '').replace(/^Gravação Plaud /, 'id ')}
                </div>
              ) : (
                <article className="rounded-xl border px-6 py-6 md:px-10 md:py-8"
                         style={{ background: C.card, borderColor: C.border }}>
                  {/* Largura de leitura contida: linha longa demais cansa, e uma
                      ata é lida do começo ao fim. */}
                  <div className="max-w-[72ch]">
                    {preambulo && (
                      <div className="text-[13px] pb-5 mb-6 border-b" style={{ borderColor: C.border, color: C.t2 }}>
                        <ReactMarkdown components={MD}>{preambulo}</ReactMarkdown>
                      </div>
                    )}

                    {secoes.map((s, i) => (
                      <section key={`${s.titulo}-${i}`} className={i > 0 ? 'mt-8' : ''}>
                        <h2 className="text-[17px] font-bold mb-3 scroll-mt-4">{s.titulo}</h2>
                        <div className="text-[15px]">
                          <ReactMarkdown components={MD}>{s.corpo}</ReactMarkdown>
                        </div>
                      </section>
                    ))}
                  </div>
                </article>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
