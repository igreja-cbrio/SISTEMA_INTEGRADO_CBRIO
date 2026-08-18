import { useState, useEffect } from 'react';
import { marketing as api } from '../../api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, Plus, User2, Zap, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

// Sheet de triagem de uma campanha (a "dor"): definir complexidade, prazo de
// entrega ao solicitante e criar os entregáveis (cards) com dono/datas + aviso
// de capacidade. Extraído de MarketingTriagem p/ ser reusado dentro do Kanban
// (coluna Triagem) na consolidação do módulo (F-B).
// Ocupações oferecidas, em DIAS ÚTEIS. ⚠️ Espelha `OCUPACOES_DIAS` de
// `backend/utils/marketingOcupacao.js` — que é quem MANDA (o servidor calcula o
// fim e recusa valor inválido). Aqui é só o atalho da tela; mudou lá, muda aqui.
// Inteiros porque a coluna `duracao_dias` é integer.
const OCUPACOES = [1, 2, 3, 5];

// "Hoje" em data local (só pra sugerir o início · o servidor ajusta pro próximo
// dia útil e devolve o intervalo efetivo).
function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const COMPLEXIDADE = [
  { value: 'simples',  label: 'Simples · 3–4 semanas' },
  { value: 'media',    label: 'Média · ~1 mês' },
  { value: 'complexa', label: 'Complexa · 5–8 semanas' },
];

export function fmtData(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function MarketingTriagemSheet({ campanha, tipos, membros, onClose, onChanged }) {
  const open = !!campanha;
  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState({ complexidade: '', prazo_entrega: '' });
  // ⚠️⚠️ ANTES eram dois DatePickers (Início e Fim) OPCIONAIS — e o resultado
  // medido em 14/08 foi **0 de 83 cards com datas**, ou seja o Planner nunca teve
  // uma barra e "atribuir" não ocupava ninguém. Agora o Pedro informa QUANTO
  // OCUPA (em dias úteis) e o fim é calculado; a ocupação é OBRIGATÓRIA pra
  // adicionar o entregável (pedido do Marcos: "Pedro já colocar nos campos
  // quanto tempo deve ocupar na semana de cada um").
  const [novo, setNovo] = useState({
    titulo: '', etiqueta_tipo_id: '', atribuido_a: '',
    // Início sugerido = hoje. ⚠️ Se cair em fim de semana, quem anda pro dia
    // útil é o SERVIDOR (régua única) — e a prévia mostra a data efetiva.
    data_inicio: hojeLocal(), ocupa_dias: '', pode_paralelo: true,
  });
  const [salvando, setSalvando] = useState(false);
  const [capInfo, setCapInfo] = useState(null);

  useEffect(() => {
    if (!campanha) { setDetalhe(null); return; }
    setMeta({
      complexidade: campanha.complexidade || '',
      prazo_entrega: campanha.prazo_entrega ? campanha.prazo_entrega.slice(0, 10) : '',
    });
    setLoading(true);
    api.campanhas.get(campanha.id).then(setDetalhe).catch(e => toast.error(e.message)).finally(() => setLoading(false));
  }, [campanha]);

  async function salvarPrazo(valorISO, patchExtra) {
    try { await api.campanhas.update(campanha.id, { prazo_entrega: valorISO, ...(patchExtra || {}) }); onChanged(); }
    catch (e) { toast.error(e.message); }
  }
  async function salvarMeta(patch) {
    try { await api.campanhas.update(campanha.id, patch); }
    catch (e) { toast.error(e.message); }
  }

  async function addEntregavel() {
    if (!novo.titulo.trim()) { toast.error('Informe o título do entregável'); return; }
    // ⚠️ Ocupação é OBRIGATÓRIA — e é uma escolha EXPLÍCITA, não um default que o
    // sistema chuta: entregável sem ocupação não aparece no Planner, e era assim
    // que "atribuí pra alguém e não ocupou nada" acontecia (0 de 83 cards).
    if (!novo.ocupa_dias) { toast.error('Informe quantos dias úteis isso vai ocupar a pessoa'); return; }
    if (!novo.data_inicio) { toast.error('Informe quando começa'); return; }
    setSalvando(true);
    try {
      await api.campanhas.criarCard(campanha.id, {
        titulo: novo.titulo.trim(),
        etiqueta_tipo_id: novo.etiqueta_tipo_id || null,
        atribuido_a: novo.atribuido_a || null,
        data_inicio: novo.data_inicio,
        // O FIM é calculado no servidor (régua única) — o cliente não recalcula.
        ocupa_dias: Number(novo.ocupa_dias),
        pode_paralelo: novo.pode_paralelo,
      });
      toast.success('Entregável criado · já ocupa a agenda no Planner');
      setNovo({
        titulo: '', etiqueta_tipo_id: '', atribuido_a: '',
        data_inicio: novo.data_inicio, ocupa_dias: '', pode_paralelo: true,
      });
      setDetalhe(await api.campanhas.get(campanha.id));
      onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setSalvando(false); }
  }

  // Aviso de capacidade + PRÉVIA do período. O servidor devolve o intervalo
  // efetivo (início pode andar se cair em fim de semana) e a ocupação já
  // existente do dono, pela régua única (utils/marketingOcupacao).
  // ⚠️ O cliente NÃO recalcula o fim nem a carga — duas réguas dariam duas
  // respostas para "cabe na agenda dele?".
  useEffect(() => {
    const { atribuido_a, data_inicio, ocupa_dias, pode_paralelo } = novo;
    if (!atribuido_a || !data_inicio || !ocupa_dias) { setCapInfo(null); return; }
    let cancel = false;
    const h = setTimeout(() => {
      api.capacidadeDia(atribuido_a, data_inicio, { ocupa_dias: Number(ocupa_dias) }).then(r => {
        if (cancel) return;
        const slots = r?.slots_dia || 3;
        const dias = r?.dias || {};
        const de = r?.data_inicio || data_inicio;
        const ate = r?.data_fim;
        let cheios = 0, total = 0;
        for (const [d, info] of Object.entries(dias)) {
          if (ate && (d < de || d > ate)) continue;
          total++;
          if ((info?.ocupados || 0) + (pode_paralelo ? 1 : slots) > slots) cheios++;
        }
        // ⚠️ `total` aqui conta os dias que JÁ tinham algo. O nº de dias do
        // período vem do servidor (`dias_uteis`) — contar no cliente era o que
        // reintroduzia a régua duplicada.
        const periodo = r?.dias_uteis || Number(ocupa_dias);
        setCapInfo({
          cheio: cheios > 0,
          periodo: de && ate ? `${fmtData(de)} → ${fmtData(ate)}` : null,
          msg: cheios > 0
            ? `Ocupa ${periodo} dia(s) útil(eis), mas sobrecarrega o dono em ${cheios} dia(s) (máx ${slots}/dia). Veja outra data, outro dono, ou menos dias.`
            : `Ocupa ${periodo} dia(s) útil(eis) e cabe na agenda do dono (≤ ${slots}/dia).`,
        });
      }).catch(() => { if (!cancel) setCapInfo(null); });
    }, 350);
    return () => { cancel = true; clearTimeout(h); };
  }, [novo]);

  const dataPedida = detalhe?.data_pedida ? detalhe.data_pedida.slice(0, 10) : '';
  // Entrega interna = maior data_fim entre os entregáveis (trabalho em paralelo)
  const entregaInterna = (detalhe?.cards || []).map(c => c.data_fim).filter(Boolean).sort().pop() || null;
  const prazoMudou = meta.prazo_entrega && dataPedida && meta.prazo_entrega !== dataPedida;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>{campanha?.titulo}</SheetTitle></SheetHeader>
        {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : detalhe && (
          <div className="space-y-5 mt-4">
            {/* A dor + o que o cliente pediu */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">A dor / objetivo</Label>
              <p className="text-sm whitespace-pre-wrap">{detalhe.dor_descricao || '—'}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                {detalhe.eh_urgente && <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 gap-1"><Zap className="h-3 w-3" />Urgente</Badge>}
                {fmtData(detalhe.data_pedida)
                  ? <Badge variant="outline" className="gap-1"><CalendarClock className="h-3 w-3" />Cliente pediu p/ {fmtData(detalhe.data_pedida)}</Badge>
                  : <span className="text-muted-foreground">Sem data pedida</span>}
              </div>
            </div>

            {/* Complexidade + prazo de entrega ao solicitante (seguir ou mudar) */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Complexidade</Label>
                  <Select value={meta.complexidade} onValueChange={v => { setMeta(m => ({ ...m, complexidade: v })); salvarMeta({ complexidade: v }); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {COMPLEXIDADE.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Entrega ao solicitante</Label>
                  <DatePicker value={meta.prazo_entrega}
                    onChange={v => { setMeta(m => ({ ...m, prazo_entrega: v })); salvarPrazo(v ? new Date(v + 'T12:00:00').toISOString() : null); }} />
                </div>
              </div>
              {dataPedida && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {prazoMudou
                      ? `Você mudou a data pedida (${fmtData(dataPedida)}) → o solicitante será avisado.`
                      : 'Seguindo a data que o cliente pediu.'}
                  </span>
                  {prazoMudou && (
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => { setMeta(m => ({ ...m, prazo_entrega: dataPedida })); salvarPrazo(new Date(dataPedida + 'T12:00:00').toISOString()); }}>
                      Seguir a data pedida
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Entregáveis */}
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Entregáveis ({detalhe.cards?.length || 0})</Label>
                {entregaInterna && <span className="text-xs text-muted-foreground">Entrega interna: {fmtData(entregaInterna)}</span>}
              </div>
              {(detalhe.cards || []).map(card => (
                <Card key={card.id} className="p-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{card.titulo}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{card.pode_paralelo ? 'paralela' : 'foco'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{card.dono_nome || 'sem dono'}</span>
                    {(card.data_inicio || card.data_fim) && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {fmtData(card.data_inicio) || '?'} → {fmtData(card.data_fim) || '?'}
                      </span>
                    )}
                  </div>
                </Card>
              ))}

              {/* Form novo entregável */}
              <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                <Input placeholder="Novo entregável (ex: Reels de divulgação)" value={novo.titulo}
                  onChange={e => setNovo(n => ({ ...n, titulo: e.target.value }))} className="h-8 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={novo.etiqueta_tipo_id || '__none__'} onValueChange={v => setNovo(n => ({ ...n, etiqueta_tipo_id: v === '__none__' ? '' : v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(sem etiqueta)</SelectItem>
                      {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={novo.atribuido_a || '__none__'} onValueChange={v => setNovo(n => ({ ...n, atribuido_a: v === '__none__' ? '' : v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Dono" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(sem dono)</SelectItem>
                      {membros.map(m => <SelectItem key={m.id} value={m.id}>{(m.profile?.name || m.nome_display || '—')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Começa em</Label>
                    <DatePicker value={novo.data_inicio}
                      onChange={v => setNovo(n => ({ ...n, data_inicio: v }))} className="h-8 text-xs" />
                  </div>
                  {/* ⚠️ "Fim" SAIU: o Pedro informa QUANTO OCUPA e o servidor
                      calcula o fim (pulando fim de semana). Era pedir duas datas
                      opcionais que deixava 100% dos cards sem plano — e sem plano
                      o Planner não mostra a pessoa ocupada. */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Ocupa quantos dias? <span className="text-rose-600">*</span>
                    </Label>
                    <div className="flex gap-1">
                      {OCUPACOES.map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setNovo(n => ({ ...n, ocupa_dias: n.ocupa_dias === d ? '' : d }))}
                          className={`h-8 flex-1 rounded border text-xs font-medium transition-colors ${
                            novo.ocupa_dias === d
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background hover:bg-accent'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={novo.pode_paralelo} onChange={e => setNovo(n => ({ ...n, pode_paralelo: e.target.checked }))} />
                  Pode trabalhar em paralelo (1 slot/dia · não-urgente)
                </label>
                {capInfo && (
                  <div className={`text-xs ${capInfo.cheio ? 'text-amber-600' : 'text-emerald-600'}`}>
                    <p>{capInfo.cheio ? '⚠️ ' : '✓ '}{capInfo.msg}</p>
                    {/* O período EFETIVO vem do servidor — mostrar o que ele
                        calculou evita a tela prometer um intervalo diferente do
                        que vai ser gravado. */}
                    {capInfo.periodo && (
                      <p className="text-muted-foreground mt-0.5 tabular-nums">{capInfo.periodo}</p>
                    )}
                  </div>
                )}
                <Button size="sm" onClick={addEntregavel} disabled={salvando || !novo.titulo.trim()} className="w-full gap-1.5">
                  <Plus className="h-4 w-4" /> Adicionar entregável
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Ao adicionar o 1º entregável, a campanha sai da triagem e os cards entram no Backlog de produção.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
