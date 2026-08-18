// ATA Semanal · reunião ministerial de segunda-feira
//
// De onde vem o conteúdo: a reunião é gravada no Plaud e a ATA é redigida por
// IA a partir da transcrição. Esta tela NÃO gera nada — ela lê
// `governance_meetings` (tipo Ministerial, sigla MIN) e deixa a pessoa fazer a
// única coisa que a máquina não consegue: dizer QUEM ficou responsável.
//
// ⚠️ POR QUE O RESPONSÁVEL É PREENCHIDO AQUI, E NÃO PELA IA:
// a gravação do Plaud não identifica falante. A transcrição vem sem nenhuma
// marcação de quem disse o quê — conferido em 18/08/2026 nas duas pontas
// (`get_transcript` devolve segmentos sem campo de falante, e o bloco de
// "Summary" numera 172 vozes distintas numa reunião de ~15 pessoas). Atribuir
// decisão à pessoa errada numa ata é pior do que não atribuir, então a IA
// registra o encaminhamento e deixa o dono em branco. Quem estava na sala
// completa aqui, em dois minutos.
//
// Reaproveita `governance_*` de propósito: pauta, ata, deliberações, temas e
// tarefas já estavam modelados e sem uso. Ver a decisão no PR que criou o tipo
// Ministerial (migration `governance_tipo_ministerial_semanal`).

import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { FileText, Calendar, Clock, Users, CircleAlert, Check } from 'lucide-react';
import { governanca as gov } from '../../api';
import { formatErro } from '../../lib/formatErro';
import { C } from '../governanca/compartilhado';

const SIGLA = 'MIN';

const STATUS_TAREFA = [
  { valor: 'pendente',  rotulo: 'Pendente'  },
  { valor: 'andamento', rotulo: 'Em andamento' },
  { valor: 'concluida', rotulo: 'Concluída' },
  { valor: 'cancelada', rotulo: 'Cancelada' },
];

function fmtDataLonga(iso) {
  if (!iso) return '—';
  // `date` vem como AAAA-MM-DD puro. Construir com `new Date(iso)` interpretaria
  // como UTC e mostraria o dia anterior no Brasil — o clássico "reunião de
  // domingo" que nunca existiu.
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

export default function AtaSemanal() {
  const [reunioes, setReunioes] = useState([]);
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [salvandoId, setSalvandoId] = useState(null);

  const carregarLista = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const dados = await gov.meetings.list({ sigla: SIGLA });
      // O endpoint devolve em ordem crescente de data; aqui a mais recente
      // primeiro, porque é a que alguém abre a tela para ler.
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
    gov.meetings.get(selecionadaId)
      .then((d) => { if (!cancelado) setDetalhe(d); })
      .catch((e) => { if (!cancelado) toast.error(formatErro(e, 'Não foi possível abrir a ata')); })
      .finally(() => { if (!cancelado) setCarregandoDetalhe(false); });
    return () => { cancelado = true; };
  }, [selecionadaId]);

  const tarefas = useMemo(
    () => [...(detalhe?.tasks || [])].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0)),
    [detalhe],
  );

  const semDono = useMemo(
    () => tarefas.filter((t) => !String(t.responsavel || '').trim()).length,
    [tarefas],
  );

  // Atualização otimista: a linha muda na hora e volta atrás se o servidor
  // recusar. Sem isso, escolher responsável em 16 pendências vira 16 esperas.
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

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        {/* ── Coluna: reuniões ───────────────────────────────────────────── */}
        <aside
          className="rounded-xl border overflow-hidden"
          style={{ background: C.card, borderColor: C.border }}
        >
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide border-b"
               style={{ color: C.t3, borderColor: C.border }}>
            Reuniões
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
                      className="w-full text-left px-4 py-3 border-b transition-colors"
                      style={{
                        borderColor: C.border,
                        background: ativa ? C.primaryBg : 'transparent',
                      }}
                    >
                      <div className="text-sm font-medium capitalize">{fmtDataLonga(r.date)}</div>
                      <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: C.t3 }}>
                        {temAta
                          ? <><Check size={12} /> ata pronta</>
                          : <><CircleAlert size={12} /> sem ata</>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ── Coluna: conteúdo ───────────────────────────────────────────── */}
        <main className="min-w-0">
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
              {/* Cabeçalho da reunião */}
              <div className="rounded-xl border p-5 mb-5"
                   style={{ background: C.card, borderColor: C.border }}>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" style={{ color: C.t2 }}>
                  <span className="flex items-center gap-1.5 capitalize">
                    <Calendar size={14} /> {fmtDataLonga(detalhe.date)}
                  </span>
                  <span className="flex items-center gap-1.5"><Clock size={14} /> 10h30 – 12h30</span>
                  <span className="flex items-center gap-1.5">
                    <Users size={14} /> {detalhe.participantes?.length || 0} mencionados
                  </span>
                </div>

                {geradaPorIa && (
                  // Marcar a origem não é rodapé decorativo: quem lê uma ata
                  // precisa saber que ela é rascunho de máquina antes de citá-la
                  // como registro do que foi decidido.
                  <div className="mt-3 text-xs rounded-lg px-3 py-2"
                       style={{ background: C.primaryBg, color: C.t2 }}>
                    Rascunho gerado por IA a partir da gravação. A transcrição não identifica
                    quem falou — confira antes de tratar como registro oficial.
                  </div>
                )}
              </div>

              {/* Pendências */}
              <section className="rounded-xl border mb-5" style={{ background: C.card, borderColor: C.border }}>
                <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap"
                     style={{ borderColor: C.border }}>
                  <h2 className="text-sm font-semibold">Pendências ({tarefas.length})</h2>
                  {semDono > 0 && (
                    <span className="text-xs px-2 py-1 rounded-md"
                          style={{ background: '#f59e0b22', color: '#b45309' }}>
                      {semDono} sem responsável
                    </span>
                  )}
                </div>

                {tarefas.length === 0 ? (
                  <div className="p-5 text-sm" style={{ color: C.t3 }}>
                    Nenhuma pendência registrada nesta reunião.
                  </div>
                ) : (
                  <ul>
                    {tarefas.map((t) => (
                      <li key={t.id} className="px-5 py-3 border-b last:border-b-0"
                          style={{ borderColor: C.border }}>
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
                            {STATUS_TAREFA.map((s) => (
                              <option key={s.valor} value={s.valor}>{s.rotulo}</option>
                            ))}
                          </select>
                          {salvandoId === t.id && (
                            <span className="text-xs" style={{ color: C.t3 }}>salvando…</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* A ata */}
              <section className="rounded-xl border p-5" style={{ background: C.card, borderColor: C.border }}>
                <h2 className="text-sm font-semibold mb-3">Ata</h2>
                {String(detalhe.ata || '').trim() ? (
                  <div className="text-sm leading-relaxed governanca-md">
                    <ReactMarkdown>{detalhe.ata}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: C.t3 }}>
                    Esta reunião ainda não tem ata.
                  </p>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
