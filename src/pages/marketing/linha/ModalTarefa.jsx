import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { marketing, marketingLinha } from '../../../api';
import { NOME_FRENTE, ddmm, ddmmaaaa, rotuloCulto, nomeMembro, textoEsforco } from './layout';
import { tituloTarefa } from './CartaoTarefa';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function semanaTexto(dados, n) {
  if (n === 0) return `Antes de ${dados.ano}`;
  if (n == null) return 'Sem data';
  const w = (dados.semanas || []).find(s => s.n === n);
  return w ? `Semana ${n} · ${ddmm(w.inicio)} a ${ddmm(w.fim)}` : `Semana ${n}`;
}

function Fato({ rotulo, children }) {
  return (
    <span className="text-xs text-muted-foreground">
      <b className="mr-1 text-[10px] uppercase tracking-wider font-semibold">{rotulo}</b>{children}
    </span>
  );
}

export default function ModalTarefa({ tarefa, dados, onClose, onChanged }) {
  const [marcando, setMarcando] = useState(null);
  const [override, setOverride] = useState({});
  const [erro, setErro] = useState(null);
  const [registroDe, setRegistroDe] = useState(null);
  const [registroTexto, setRegistroTexto] = useState('');

  // Dado novo do servidor substitui a marcação otimista.
  useEffect(() => { setOverride({}); }, [tarefa]);

  if (!tarefa) return null;
  const membros = dados.membros || [];
  const ehRotina = tarefa.frente === 'rot';
  const rotinaTravada = ehRotina && dados.frentes?.rot?.marcavel === false;
  const itens = tarefa.itens || [];
  const hoje = dados.hoje;
  const algumBloqueado = !ehRotina && itens.some(i => i.pode_marcar === false);
  const donoId = ehRotina ? tarefa.membro_id : tarefa.atribuido_a;

  async function gravar(item, feito, registro) {
    setMarcando(item.id);
    setErro(null);
    setOverride(o => ({ ...o, [item.id]: feito }));
    try {
      if (ehRotina) {
        if (feito) await marketingLinha.marcarRotina(item.compromisso_id, tarefa.semana_inicio, item.membro_id);
        else await marketingLinha.desmarcarRotina(item.compromisso_id, tarefa.semana_inicio, item.membro_id);
      } else {
        await marketing.checklist.update(item.id, registro !== undefined ? { feito, registro } : { feito });
      }
      setRegistroDe(null);
      setRegistroTexto('');
      await onChanged();
    } catch (e) {
      setOverride(o => { const n = { ...o }; delete n[item.id]; return n; });
      if (e?.codigo === 'registro_obrigatorio') {
        setRegistroDe(item.id);
        setRegistroTexto(item.registro || '');
      } else {
        setErro(e?.message || 'Não foi possível salvar.');
      }
    } finally {
      setMarcando(null);
    }
  }

  function aoMarcar(item, feito) {
    if (feito && item.exige_registro && !(item.registro || '').trim()) {
      setRegistroDe(item.id);
      setRegistroTexto('');
      return;
    }
    gravar(item, feito);
  }

  let grupoAnterior;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogDescription className="text-xs">
            {NOME_FRENTE[tarefa.frente] || 'Tarefa'} · {semanaTexto(dados, tarefa.semana)}
          </DialogDescription>
          <DialogTitle className="text-lg">{tituloTarefa(tarefa, membros)}</DialogTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {tarefa.prazo && <Fato rotulo="Prazo">{ddmmaaaa(tarefa.prazo)}</Fato>}
            {tarefa.entrega_final && <Fato rotulo="Entrega final">{ddmmaaaa(tarefa.entrega_final)}</Fato>}
            {!ehRotina && tarefa.culto && <Fato rotulo="Culto">{rotuloCulto(tarefa.culto)}</Fato>}
            <Fato rotulo={ehRotina ? 'Pessoa' : 'Responsável'}>
              {donoId ? nomeMembro(membros, donoId) : 'Sem responsável'}
            </Fato>
            {itens.length > 0 && (
              <Fato rotulo="Feito">
                {itens.filter(i => (override[i.id] ?? i.feito)).length} de {itens.length}
              </Fato>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
          {tarefa.pedido && (
            <section className="space-y-1">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Pedido original</h3>
              <div className="border-l-2 border-border pl-3 text-sm">
                {tarefa.pedido.titulo && <p className="font-medium">{tarefa.pedido.titulo}</p>}
                {tarefa.pedido.descricao && <p className="text-muted-foreground whitespace-pre-wrap">{tarefa.pedido.descricao}</p>}
                {tarefa.pedido.data_necessaria && (
                  <p className="text-xs text-muted-foreground mt-1">Pedido para {ddmmaaaa(tarefa.pedido.data_necessaria)}</p>
                )}
              </div>
            </section>
          )}

          {!ehRotina && tarefa.descricao && (
            <section className="space-y-1">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Descrição</h3>
              <p className="text-sm whitespace-pre-wrap">{tarefa.descricao}</p>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              {ehRotina ? 'Compromissos da semana' : 'Subtarefas'}
            </h3>
            {algumBloqueado && (
              <p className="text-xs text-muted-foreground">Nesta etapa quem marca é o líder do Marketing.</p>
            )}
            {rotinaTravada && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                A rotina ainda não pode ser marcada: falta aplicar a migration da Fase 3.
              </p>
            )}
            {erro && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {erro}
              </div>
            )}
            {itens.length === 0 && <p className="text-sm text-muted-foreground">Esta tarefa não tem subtarefas.</p>}
            <ul className="space-y-1.5">
              {itens.map(item => {
                const feito = override[item.id] ?? item.feito;
                const bloqueado = rotinaTravada || item.pode_marcar === false;
                const quem = nomeMembro(membros, item.membro_id);
                const esforco = textoEsforco(item.esforco_valor, item.esforco_unidade);
                const atrasado = !feito && item.prazo && hoje && item.prazo < hoje;
                const cabecalho = !ehRotina && item.grupo && item.grupo !== grupoAnterior ? item.grupo : null;
                grupoAnterior = item.grupo;
                const horaRot = ehRotina
                  ? [DIAS[item.dia_semana], item.hora_inicio ? String(item.hora_inicio).slice(0, 5) : null].filter(Boolean).join(' ')
                  : null;
                return (
                  <li key={item.id}>
                    {cabecalho && <p className="text-xs font-semibold mt-2 mb-1">{cabecalho}</p>}
                    <div className={`rounded-lg border border-border bg-muted/40 px-3 py-2 ${bloqueado ? 'opacity-80' : ''}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-[#00B39D]"
                          checked={!!feito}
                          disabled={bloqueado || marcando === item.id}
                          title={bloqueado ? (ehRotina ? 'Só a própria pessoa ou o líder do Marketing marca esta rotina' : 'Nesta etapa quem marca é o líder do Marketing') : undefined}
                          onChange={(e) => aoMarcar(item, e.target.checked)}
                        />
                        <span className={`flex-1 text-sm ${feito ? 'line-through text-muted-foreground' : ''}`}>
                          {item.texto || 'Sem descrição'}
                          {item.exige_registro && <span className="ml-1 text-[10px] uppercase text-muted-foreground">· exige registro</span>}
                        </span>
                        {marcando === item.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 pl-7 text-[11px] text-muted-foreground">
                        {horaRot && <span>{horaRot}</span>}
                        {!ehRotina && <span>{quem || 'Sem responsável'}</span>}
                        {esforco && <span>{esforco}</span>}
                        {item.prazo && <span>até {ddmm(item.prazo)}</span>}
                        {atrasado && <span className="font-semibold text-destructive">Atrasada</span>}
                      </div>
                      {item.registro && registroDe !== item.id && (
                        <p className="mt-1 pl-7 text-xs italic text-muted-foreground whitespace-pre-wrap">Registro: {item.registro}</p>
                      )}
                      {registroDe === item.id && (
                        <div className="mt-2 pl-7 space-y-2">
                          <label className="text-xs font-medium" htmlFor={`reg-${item.id}`}>Registro (obrigatório para concluir)</label>
                          <Textarea
                            id={`reg-${item.id}`}
                            rows={3}
                            value={registroTexto}
                            onChange={(e) => setRegistroTexto(e.target.value)}
                            placeholder="Escreva o que foi decidido ou feito"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!registroTexto.trim() || marcando === item.id}
                              onClick={() => gravar(item, true, registroTexto.trim())}
                            >
                              Salvar e concluir
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setRegistroDe(null); setRegistroTexto(''); }}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
