// ATA Semanal · reunião ministerial de segunda-feira
//
// De onde vem o conteúdo: a reunião é gravada no Plaud e a ata é redigida por
// IA a partir da transcrição. Esta tela NÃO gera nada — ela lê
// `governance_meetings` (tipo Ministerial, sigla MIN) e deixa a pessoa fazer a
// única coisa que a máquina não consegue: dizer QUEM ficou responsável.
//
// ⚠️ POR QUE O RESPONSÁVEL É PREENCHIDO AQUI, E NÃO PELA IA:
// a gravação do Plaud não identifica falante. Conferido em 18/08/2026 nas duas
// pontas — `get_transcript` devolve segmentos sem campo de falante, e o bloco
// "Summary" numera 172 vozes distintas numa reunião de ~15 pessoas. Atribuir
// decisão à pessoa errada numa ata é pior do que não atribuir, então a IA
// registra o encaminhamento e deixa o dono em branco.
//
// ⚠️ POR QUE A ATA É QUEBRADA EM TÓPICOS RECOLHÍVEIS:
// uma ministerial rende ~7.000 caracteres em 11 assuntos sem relação entre si.
// Renderizado corrido, vira parede de texto e ninguém acha o que procura
// (reclamação do Matheus na primeira versão, 18/08). Os tópicos entram
// FECHADOS de propósito: a tela abre como índice do que foi tratado, e você
// abre só o que interessa.

import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import {
  FileText, Calendar, Clock, Users, CircleAlert, Check,
  ChevronRight, ChevronDown, ListTodo,
} from 'lucide-react';
import { governanca as gov } from '../../api';
import { formatErro } from '../../lib/formatErro';
import { C } from '../governanca/compartilhado';

const SIGLA = 'MIN';

const STATUS_TAREFA = [
  { valor: 'pendente',  rotulo: 'Pendente' },
  { valor: 'andamento', rotulo: 'Em andamento' },
  { valor: 'concluida', rotulo: 'Concluída' },
  { valor: 'cancelada', rotulo: 'Cancelada' },
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

// Quebra a ata em tópicos pelos títulos `## `. O que vier antes do primeiro é
// preâmbulo (cabeçalho e avisos) e fica sempre visível.
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
      // O `# título` da ata é redundante com o cabeçalho da tela.
      preambulo.push(linha);
    }
  }
  if (atual) secoes.push(atual);

  return {
    preambulo: preambulo.join('\n').trim(),
    secoes: secoes.map((s) => ({ ...s, corpo: s.corpo.join('\n').trim() })),
  };
}

// Estilos do markdown declarados como componentes, e não via classe CSS: assim
// a formatação da ata não depende de nenhuma folha de estilo de outro módulo
// continuar existindo.
const MD = {
  p:      (p) => <p className="mb-2 leading-relaxed" {...p} />,
  strong: (p) => <strong className="font-semibold" {...p} />,
  ul:     (p) => <ul className="list-disc pl-5 mb-2 space-y-1" {...p} />,
  ol:     (p) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...p} />,
  li:     (p) => <li className="leading-relaxed" {...p} />,
  h3:     (p) => <h3 className="font-semibold mt-3 mb-1.5" {...p} />,
  h4:     (p) => <h4 className="font-semibold mt-2 mb-1" {...p} />,
  blockquote: (p) => (
    <blockquote className="border-l-2 pl-3 my-2 italic"
                style={{ borderColor: C.primary, color: C.t2 }} {...p} />
  ),
  table:  (p) => (
    <div className="overflow-x-auto my-2">
      <table className="text-xs border-collapse w-full" {...p} />
    </div>
  ),
  th:     (p) => <th className="text-left font-semibold px-2 py-1 border-b" style={{ borderColor: C.border }} {...p} />,
  td:     (p) => <td className="px-2 py-1 border-b align-top" style={{ borderColor: C.border }} {...p} />,
  code:   (p) => <code className="text-xs px-1 py-0.5 rounded" style={{ background: C.inputBg }} {...p} />,
};

function Recolhivel({ titulo, subtitulo, aberto, onToggle, children, destaque }) {
  return (
    <section className="rounded-xl border overflow-hidden"
             style={{ background: C.card, borderColor: destaque ? C.primary : C.border }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        aria-expanded={aberto}
      >
        {aberto ? <ChevronDown size={16} style={{ color: C.t3 }} />
                : <ChevronRight size={16} style={{ color: C.t3 }} />}
        <span className="text-sm font-semibold flex-1">{titulo}</span>
        {subtitulo && <span className="text-xs" style={{ color: C.t3 }}>{subtitulo}</span>}
      </button>
      {aberto && (
        <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: C.border }}>
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
  const [abertas, setAbertas] = useState({});          // tópicos da ata
  const [pendAberta, setPendAberta] = useState(true);  // bloco de pendências
  const [verConcluidas, setVerConcluidas] = useState(false);

  const carregarLista = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const dados = await gov.meetings.list({ sigla: SIGLA });
      const ordenadas = [...(dados || [])].sort((x, y) => String(y.date).localeCompare(String(x.date)));
      setReunioes(ordenadas);
      setSelecionadaId((atual) => atual ?? ordenadas[0]?.id ?? null);
    } catch (e) {
      toast.error(formatErro(e, 'Não foi possível carregar as reuniões'));
    } finally {
      setCarregandoLista(false);
    }
  }, []);

  useEffect(() => { carregarLista(); }, [carregarLista]);

  useEffect(() => {
    if (!selecionadaId) { setDetalhe(null); return; }
    let cancelado = false;
    setCarregandoDetalhe(true);
    setAbertas({}); // trocar de reunião fecha tudo — a nova abre como índice
    gov.meetings.get(selecionadaId)
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
  const { semDono, comDono, concluidas } = useMemo(() => {
    const encerrada = (t) => ['concluida', 'cancelada'].includes(t.status);
    const abertas_ = tarefas.filter((t) => !encerrada(t));
    return {
      semDono:    abertas_.filter((t) => !String(t.responsavel || '').trim()),
      comDono:    abertas_.filter((t) => String(t.responsavel || '').trim()),
      concluidas: tarefas.filter(encerrada),
    };
  }, [tarefas]);

  const todosAbertos = secoes.length > 0 && secoes.every((_, i) => abertas[i]);
  const alternarTodos = useCallback(() => {
    setAbertas(todosAbertos ? {} : Object.fromEntries(secoes.map((_, i) => [i, true])));
  }, [todosAbertos, secoes]);

  // Atualização otimista: a linha muda na hora e volta atrás se o servidor
  // recusar. Sem isso, preencher 16 pendências vira 16 esperas.
  const salvarTarefa = useCallback(async (tarefa, campos) => {
    const anterior = { ...tarefa };
    setDetalhe((d) => ({
      ...d,
      tasks: (d?.tasks || []).map((t) => (t.id === tarefa.id ? { ...t, ...campos } : t)),
    }));
    setSalvandoId(tarefa.id);
    try {
      await gov.tasks.update(tarefa.id, campos);
    } catch (e) {
      setDetalhe((d) => ({
        ...d,
        tasks: (d?.tasks || []).map((t) => (t.id === tarefa.id ? anterior : t)),
      }));
      toast.error(formatErro(e, 'Não foi possível salvar'));
    } finally {
      setSalvandoId(null);
    }
  }, []);

  const geradaPorIa = String(detalhe?.observacoes || '').includes('Gerada por IA');

  const LinhaTarefa = (t) => (
    <li key={t.id} className="px-4 py-3 border-b last:border-b-0" style={{ borderColor: C.border }}>
      <div className="text-sm mb-2">{t.titulo}</div>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          defaultValue={t.responsavel || ''}
          placeholder="responsável…"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (t.responsavel || '')) salvarTarefa(t, { responsavel: v || null });
          }}
          className="text-xs rounded-md px-2 py-1 border w-44"
          style={{ background: C.inputBg, borderColor: C.border, color: C.text }}
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
        {salvandoId === t.id && <span className="text-xs" style={{ color: C.t3 }}>salvando…</span>}
      </div>
    </li>
  );

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
        <aside className="rounded-xl border overflow-hidden"
               style={{ background: C.card, borderColor: C.border }}>
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide border-b flex items-center justify-between"
               style={{ color: C.t3, borderColor: C.border }}>
            <span>Reuniões</span>
            <span>{reunioes.length}</span>
          </div>

          {carregandoLista ? (
            <div className="p-4 text-sm" style={{ color: C.t3 }}>Carregando…</div>
          ) : reunioes.length === 0 ? (
            <div className="p-4 text-sm" style={{ color: C.t3 }}>
              Nenhuma reunião ministerial registrada ainda.
            </div>
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
                 style={{ background: C.card, borderColor: C.border, color: C.t3 }}>
              Carregando ata…
            </div>
          ) : !detalhe ? (
            <div className="rounded-xl border p-6 text-sm"
                 style={{ background: C.card, borderColor: C.border, color: C.t3 }}>
              Selecione uma reunião.
            </div>
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

              {/* Pendências */}
              {tarefas.length > 0 && (
                <Recolhivel
                  titulo="Pendências"
                  subtitulo={`${semDono.length} sem responsável · ${comDono.length} atribuídas${concluidas.length ? ` · ${concluidas.length} encerradas` : ''}`}
                  aberto={pendAberta}
                  onToggle={() => setPendAberta((v) => !v)}
                  destaque={semDono.length > 0}
                >
                  {semDono.length > 0 && (
                    <>
                      <div className="text-xs font-semibold mb-1 flex items-center gap-1.5"
                           style={{ color: '#b45309' }}>
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

                  {concluidas.length > 0 && (
                    <div className="mt-3">
                      <button onClick={() => setVerConcluidas((v) => !v)}
                              className="text-xs underline" style={{ color: C.t3 }}>
                        {verConcluidas ? 'ocultar' : 'mostrar'} {concluidas.length} encerradas
                      </button>
                      {verConcluidas && (
                        <ul className="rounded-lg border mt-2" style={{ borderColor: C.border }}>
                          {concluidas.map(LinhaTarefa)}
                        </ul>
                      )}
                    </div>
                  )}
                </Recolhivel>
              )}

              {/* Ata em tópicos */}
              {secoes.length === 0 && !String(detalhe.ata || '').trim() ? (
                <div className="rounded-xl border p-5 text-sm"
                     style={{ background: C.card, borderColor: C.border, color: C.t3 }}>
                  Esta reunião ainda não tem ata. A gravação está no Plaud —
                  {' '}{String(detalhe.observacoes || '').replace(/^Gravação Plaud /, 'id ')}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold" style={{ color: C.t2 }}>
                      Ata · {secoes.length} tópicos
                    </h2>
                    <button onClick={alternarTodos} className="text-xs underline" style={{ color: C.t3 }}>
                      {todosAbertos ? 'recolher tudo' : 'expandir tudo'}
                    </button>
                  </div>

                  {preambulo && (
                    <div className="rounded-xl border p-4 text-xs" style={{ background: C.card, borderColor: C.border, color: C.t2 }}>
                      <ReactMarkdown components={MD}>{preambulo}</ReactMarkdown>
                    </div>
                  )}

                  {secoes.map((s, i) => (
                    <Recolhivel
                      key={`${s.titulo}-${i}`}
                      titulo={s.titulo}
                      aberto={Boolean(abertas[i])}
                      onToggle={() => setAbertas((a) => ({ ...a, [i]: !a[i] }))}
                    >
                      <div className="text-sm">
                        <ReactMarkdown components={MD}>{s.corpo}</ReactMarkdown>
                      </div>
                    </Recolhivel>
                  ))}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
