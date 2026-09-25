import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { marketingLinha } from '../../../api';
import { CULTOS, ddmm, ddmmaaaa, nomeMembro } from './layout';

// Editor do líder na linha do tempo (Fase 4). Três modos, UMA tela:
//  alocar · pedido do formulário (Pendentes) vira tarefa, já com a pessoa sugerida
//  nova   · "+ Nova tarefa" (Interno)
//  editar · título, responsável, prioridade, culto, descrição e subtarefas
// Quem valida é o servidor (utils/marketingAlocacao); aqui só se monta o pedido.
// DOIS TEMPOS: cada subtarefa tem esforço + prazo próprios; a ENTREGA FINAL é a
// data que o solicitante vê, e não pode ser antes do último prazo.

const PRIORIDADES = [
  { v: 'baixa', l: 'Baixa' }, { v: 'normal', l: 'Normal' }, { v: 'alta', l: 'Alta' }, { v: 'urgente', l: 'Urgente' },
];
const HORAS_POR_DIA = 8; // espelho de utils/marketingAlocacao até a Fase 5 trazer a capacidade real

let seq = 0;
const novaChave = () => `n${++seq}`;
const numero = (v) => {
  if (v === '' || v == null) return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const horas = (valor, unidade) => {
  const n = numero(valor);
  if (!(n > 0)) return 0;
  return unidade === 'dias' ? n * HORAS_POR_DIA : n;
};
const fmtH = (h) => `${(Math.round(h * 10) / 10).toString().replace('.', ',')}h`;

function itemVazio(membroId = '', prazo = '', texto = '') {
  return { chave: novaChave(), texto, membro_id: membroId, esforco_valor: '', esforco_unidade: 'horas', prazo };
}

function estadoInicial(modo, { pendente, tarefa }) {
  if (modo === 'alocar') {
    const sug = pendente.sugerido_membro_id || '';
    const quando = pendente.data_necessaria || '';
    return {
      titulo: pendente.titulo || '', atribuido: sug, prioridade: '', culto: '', descricao: '', entrega: quando,
      itens: [itemVazio(sug, quando, pendente.titulo || '')],
    };
  }
  if (modo === 'editar') {
    return {
      titulo: tarefa.titulo || '', atribuido: tarefa.atribuido_a || '', prioridade: tarefa.prioridade || '',
      culto: tarefa.culto || '', descricao: tarefa.descricao || '', entrega: tarefa.entrega_final || '',
      itens: (tarefa.itens || []).map(i => ({
        chave: `e${i.id}`, id: i.id, texto: i.texto || '', membro_id: i.membro_id || '',
        esforco_valor: i.esforco_valor == null || Number(i.esforco_valor) === 0 ? '' : String(i.esforco_valor),
        esforco_unidade: i.esforco_unidade || 'horas', prazo: i.prazo || '', feito: !!i.feito,
      })),
    };
  }
  return { titulo: '', atribuido: '', prioridade: '', culto: '', descricao: '', entrega: '', itens: [itemVazio()] };
}

function Campo({ rotulo, dica, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{rotulo}</span>
      {children}
      {dica && <span className="block text-[11px] text-muted-foreground">{dica}</span>}
    </label>
  );
}

const selCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground';

export default function EditorTarefa({ modo, pendente, tarefa, dados, onClose, onSalvo }) {
  const [f, setF] = useState(() => estadoInicial(modo, { pendente, tarefa }));
  const [removidos, setRemovidos] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const membros = dados.membros || [];
  const temEntrega = modo === 'alocar' || (modo === 'editar' && tarefa?.frente === 'sis');
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const setItem = (chave, k, v) => setF(s => ({ ...s, itens: s.itens.map(i => (i.chave === chave ? { ...i, [k]: v } : i)) }));

  // Responsável trocado: subtarefas que estavam com o anterior acompanham.
  function trocarResponsavel(novo) {
    setF(s => ({
      ...s, atribuido: novo,
      itens: s.itens.map(i => (!i.membro_id || i.membro_id === s.atribuido ? { ...i, membro_id: novo } : i)),
    }));
  }

  function removerItem(item) {
    if (item.id) setRemovidos(r => [...r, item.id]);
    setF(s => ({ ...s, itens: s.itens.filter(i => i.chave !== item.chave) }));
  }

  const semanaDe = (d) => {
    const ws = dados.semanas || [];
    if (!d || !ws.length) return null;
    if (d < ws[0].inicio) return 1;
    const w = ws.find(x => d >= x.inicio && d <= x.fim);
    return w ? w.n : null;
  };

  // Carga ao vivo: o que a pessoa já tem na semana + o que este editor acrescenta.
  // No modo editar, o que ESTA tarefa já somava sai da base (senão conta duas vezes).
  const carga = useMemo(() => {
    const porChave = new Map();
    const chaveDe = (m, s) => `${m}|${s}`;
    const add = (m, s, campo, h) => {
      if (!m || s == null || !(h > 0)) return;
      const k = chaveDe(m, s);
      const atual = porChave.get(k) || { membro: m, semana: s, base: 0, desta: 0 };
      atual[campo] += h;
      porChave.set(k, atual);
    };
    for (const i of f.itens) add(i.membro_id, semanaDe(i.prazo), 'desta', horas(i.esforco_valor, i.esforco_unidade));
    for (const reg of porChave.values()) {
      reg.base = Number(dados.carga?.[reg.membro]?.[reg.semana]) || 0;
    }
    if (modo === 'editar') {
      for (const i of tarefa?.itens || []) {
        if (i.feito) continue;
        const reg = porChave.get(chaveDe(i.membro_id, semanaDe(i.prazo || tarefa.prazo)));
        if (reg) reg.base = Math.max(0, reg.base - horas(i.esforco_valor, i.esforco_unidade));
      }
    }
    return [...porChave.values()].sort((a, b) => a.semana - b.semana);
  }, [f.itens, dados, modo, tarefa]);

  const ultimoPrazo = f.itens.map(i => i.prazo).filter(Boolean).sort().pop() || null;
  const entregaCedo = temEntrega && f.entrega && ultimoPrazo && f.entrega < ultimoPrazo;

  function payloadItem(i) {
    const o = { texto: i.texto, membro_id: i.membro_id || null, esforco_unidade: i.esforco_unidade, prazo: i.prazo || null };
    const n = numero(i.esforco_valor);
    if (n !== undefined) o.esforco_valor = n;
    return o;
  }

  async function salvar() {
    setErro(null);
    const base = {
      titulo: f.titulo, descricao: f.descricao, atribuido_a: f.atribuido || null,
      prioridade: f.prioridade || null, culto: f.culto || null,
    };
    setSalvando(true);
    try {
      if (modo === 'alocar') {
        await marketingLinha.alocar(pendente.id, { ...base, prazo_entrega: f.entrega || null, itens: f.itens.map(payloadItem) });
      } else if (modo === 'nova') {
        await marketingLinha.criarTarefa({ ...base, itens: f.itens.map(payloadItem) });
      } else {
        const originais = new Map((tarefa.itens || []).map(i => [i.id, i]));
        const atualizar = [];
        const novos = [];
        for (const i of f.itens) {
          if (!i.id) { novos.push(payloadItem(i)); continue; }
          const o = originais.get(i.id) || {};
          const p = payloadItem(i);
          const mudou = p.texto !== (o.texto || '') || (p.membro_id || null) !== (o.membro_id || null)
            || p.esforco_unidade !== (o.esforco_unidade || 'horas') || (p.prazo || null) !== (o.prazo || null)
            || (p.esforco_valor ?? 0) !== (Number(o.esforco_valor) || 0);
          if (mudou) atualizar.push({ id: i.id, ...p });
        }
        const body = { ...base, atualizar_itens: atualizar, novos_itens: novos, remover_itens: removidos };
        if (temEntrega && f.entrega && f.entrega !== (tarefa.entrega_final || '')) body.prazo_entrega = f.entrega;
        await marketingLinha.editarTarefa(tarefa.id, body);
      }
      await onSalvo();
    } catch (e) {
      setErro(e?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  const titulo = modo === 'alocar' ? 'Alocar pedido' : modo === 'nova' ? 'Nova tarefa' : 'Editar tarefa';
  const subtitulo = modo === 'alocar'
    ? 'Etiquete o pedido e diga quem faz o quê. O solicitante vê só a entrega final.'
    : modo === 'nova' ? 'Demanda interna do líder para a equipe.' : (tarefa?.titulo || '');

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvando) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogDescription className="text-xs">{subtitulo}</DialogDescription>
          <DialogTitle className="text-lg">{titulo}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
          {modo === 'alocar' && (
            <section className="border-l-2 border-border pl-3 text-sm space-y-1">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Pedido original</h3>
              <p className="font-medium">{pendente.titulo}</p>
              {pendente.descricao && <p className="text-muted-foreground whitespace-pre-wrap">{pendente.descricao}</p>}
              <p className="text-xs text-muted-foreground">
                {pendente.solicitante ? `De ${pendente.solicitante}` : 'Solicitante não identificado'}
                {pendente.data_necessaria ? ` · pedido para ${ddmmaaaa(pendente.data_necessaria)}` : ' · sem data pedida'}
              </p>
              {!pendente.sugerido_membro_id && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Sem pessoa sugerida: o pedido não disse o formato. Escolha quem faz.</p>
              )}
            </section>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Título"><Input value={f.titulo} onChange={set('titulo')} /></Campo>
            </div>
            <Campo rotulo="Responsável">
              <select className={selCls} value={f.atribuido} onChange={(e) => trocarResponsavel(e.target.value)}>
                <option value="">Escolha…</option>
                {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Prioridade">
              <select className={selCls} value={f.prioridade} onChange={set('prioridade')}>
                <option value="">Escolha…</option>
                {PRIORIDADES.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Culto" dica="Opcional · a etiqueta decide quem vê a tarefa nas séries.">
              <select className={selCls} value={f.culto} onChange={set('culto')}>
                <option value="">Sem culto</option>
                {Object.entries(CULTOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Campo>
            {temEntrega && (
              <Campo rotulo="Entrega final" dica="A data que o solicitante vê em Solicitações.">
                <Input type="date" value={f.entrega} onChange={set('entrega')} />
              </Campo>
            )}
            <div className="sm:col-span-2">
              <Campo rotulo={modo === 'alocar' ? 'O que você espera desta entrega' : 'Descrição'}>
                <Textarea rows={3} value={f.descricao} onChange={set('descricao')}
                  placeholder={modo === 'alocar' ? 'Explique pra equipe o que precisa ser entregue' : ''} />
              </Campo>
            </div>
          </div>

          {entregaCedo && (
            <p className="text-xs text-destructive">
              A entrega final ({ddmm(f.entrega)}) está antes do último prazo de subtarefa ({ddmm(ultimoPrazo)}).
            </p>
          )}

          <section className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Subtarefas · quem faz, esforço e prazo</h3>
            {f.itens.map((i) => (
              <div key={i.chave} className="rounded-lg border border-border bg-muted/40 p-2 space-y-2">
                <div className="flex gap-2">
                  <Input value={i.texto} placeholder="O que precisa ser feito"
                    onChange={(e) => setItem(i.chave, 'texto', e.target.value)} />
                  <Button type="button" size="icon" variant="ghost" className="shrink-0" aria-label="Remover subtarefa"
                    onClick={() => removerItem(i)} disabled={f.itens.length === 1 && modo !== 'editar'}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                  <select className={`${selCls} col-span-2 sm:col-span-1`} value={i.membro_id}
                    onChange={(e) => setItem(i.chave, 'membro_id', e.target.value)}>
                    <option value="">Quem faz…</option>
                    {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <Input inputMode="decimal" placeholder="Esforço" value={i.esforco_valor}
                    onChange={(e) => setItem(i.chave, 'esforco_valor', e.target.value)} />
                  <select className={selCls} value={i.esforco_unidade}
                    onChange={(e) => setItem(i.chave, 'esforco_unidade', e.target.value)}>
                    <option value="horas">horas</option>
                    <option value="dias">dias</option>
                  </select>
                  <Input type="date" className="col-span-2 sm:col-span-1" value={i.prazo}
                    onChange={(e) => setItem(i.chave, 'prazo', e.target.value)} />
                </div>
                {i.feito && <p className="text-[11px] text-muted-foreground">Já concluída.</p>}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline"
              onClick={() => setF(s => ({ ...s, itens: [...s.itens, itemVazio(s.atribuido)] }))}>
              <Plus className="h-4 w-4 mr-1" /> Subtarefa
            </Button>
          </section>

          <section className="space-y-1">
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Carga na semana de cada prazo</h3>
            {carga.length === 0
              ? <p className="text-xs text-muted-foreground">Informe quem faz, esforço e prazo para ver a agenda de cada pessoa.</p>
              : (
                <ul className="space-y-0.5 text-xs">
                  {carga.map(c => {
                    const w = (dados.semanas || []).find(s => s.n === c.semana);
                    return (
                      <li key={`${c.membro}-${c.semana}`}>
                        <b>{nomeMembro(membros, c.membro)}</b> · semana {c.semana}{w ? ` (${ddmm(w.inicio)}–${ddmm(w.fim)})` : ''}:{' '}
                        {fmtH(c.base)} já na agenda + {fmtH(c.desta)} desta = <b>{fmtH(c.base + c.desta)}</b>
                      </li>
                    );
                  })}
                </ul>
              )}
            <p className="text-[11px] text-muted-foreground">Um dia conta 8h até a capacidade de cada pessoa entrar no planner.</p>
          </section>

          {erro && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {erro}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {modo === 'alocar' ? 'Alocar' : modo === 'nova' ? 'Criar tarefa' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
