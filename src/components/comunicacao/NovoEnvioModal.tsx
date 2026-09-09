// "Novo envio" da aba Envios (F3 do redesenho · 09/09/2026).
//
// Um modal para as três formas de mandar mensagem pela Comunicação:
//   AGORA      → entra na FILA (whatsapp_envios) · quem entrega é o cron horário
//   AGENDADO   → wa_agendamentos com data única (o cron horário dispara)
//   RECORRENTE → wa_agendamentos diária/semanal/mensal
// A PRÉVIA (destinatários válidos, corpo preenchido, custo estimado, avisos) é
// montada pelo SERVIDOR (POST /comunicacao/envios/previa · utils/novoEnvio):
// uma régua só, e a mesma que valida o envio. Aqui só se desenha e se confirma.
//
// ⚠️ "Agora" exige digitar a quantidade que a prévia mostrou — o mesmo freio
// dos disparos em massa dos grupos e do censo. Não é enfeite: é a única ação
// irreversível da tela.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Loader2, Repeat, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { comunicacao } from '../../api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { DIAS_SEMANA, type Agendamento } from './Agendados';

type Modo = 'agora' | 'agendado' | 'recorrente';
type Template = { id: string; nome: string; idioma?: string; categoria?: string | null; status_meta?: string | null; params_body?: number | null; ativo?: boolean };
type Previa = {
  destinatarios: { validos: number; lista: string[]; invalidos: string[]; invalidos_total: number; duplicados: number };
  tipo: 'template' | 'texto';
  template: { nome: string; categoria: string | null; status_meta: string | null; params_body: number | null } | null;
  template_encontrado: boolean;
  params: { ok: boolean; esperado: number | null; recebido: number; conhecido: boolean; faltando?: number; sobrando?: number };
  previa: { texto: string; faltando: number[] };
  custo: { categoria: string | null; tarifa: number | null; total: number | null };
  avisos: { codigo: string; texto: string }[];
};

const VAZIO = {
  nome: '', destinatarios: '', usarTexto: false, template_nome: '', texto: '', params: [] as string[],
  modo: 'agora' as Modo, quando: '', recorrencia: 'semanal' as 'diaria' | 'semanal' | 'mensal', dia_semana: '1', dia_mes: '1', hora: '09:00',
  confirmacao: '',
};
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
/** ISO → valor de <input type="datetime-local"> no fuso do navegador. */
function paraDatetimeLocal(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso); if (!Number.isFinite(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function NovoEnvioModal({ aberto, editar, onFechar, onSalvo }: {
  aberto: boolean; editar?: Agendamento | null; onFechar: () => void; onSalvo: (destino: 'agendados' | 'enviados') => void;
}) {
  const [form, setForm] = useState({ ...VAZIO });
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [previaErro, setPreviaErro] = useState(false);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ao abrir: limpa ou carrega o agendamento em edição. Templates: só os
  // APROVADOS e ativos (a fila recusa os outros de qualquer jeito).
  useEffect(() => {
    if (!aberto) return;
    setPrevia(null); setPreviaErro(false);
    if (editar) {
      setForm({
        ...VAZIO,
        nome: editar.nome || '',
        destinatarios: (editar.audiencia?.telefones || []).join('\n'),
        usarTexto: !editar.template_nome && !!editar.texto,
        template_nome: editar.template_nome || '',
        texto: editar.texto || '',
        params: Array.isArray(editar.params) ? editar.params.map(String) : [],
        modo: editar.recorrencia ? 'recorrente' : 'agendado',
        quando: paraDatetimeLocal(editar.quando),
        recorrencia: editar.recorrencia || 'semanal',
        dia_semana: String(editar.dia_semana ?? 1),
        dia_mes: String(editar.dia_mes ?? 1),
        hora: (editar.hora || '09:00').slice(0, 5),
      });
    } else setForm({ ...VAZIO });
    if (!templates) {
      comunicacao.templates.list()
        .then((r: Template[]) => setTemplates((r || []).filter(t => String(t.status_meta || '').toUpperCase() === 'APPROVED' && t.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome))))
        .catch(() => setTemplates([]));
    }
  }, [aberto, editar]); // eslint-disable-line react-hooks/exhaustive-deps

  const templateSel = useMemo(() => (templates || []).find(t => t.nome === form.template_nome) || null, [templates, form.template_nome]);
  const nParams = previa?.template?.params_body ?? templateSel?.params_body ?? null;

  // Prévia pelo servidor, com debounce: destinatários, template, texto e params.
  useEffect(() => {
    if (!aberto) return;
    if (timer.current) clearTimeout(timer.current);
    const temAlgo = form.destinatarios.trim() || (form.usarTexto ? form.texto.trim() : form.template_nome);
    if (!temAlgo) { setPrevia(null); return; }
    setCarregandoPrevia(true);
    timer.current = setTimeout(() => {
      comunicacao.envios.previa({
        destinatarios: form.destinatarios,
        template_nome: form.usarTexto ? '' : form.template_nome,
        texto: form.usarTexto ? form.texto : '',
        params: form.params,
      }).then((r: Previa) => { setPrevia(r); setPreviaErro(false); })
        .catch(() => { setPreviaErro(true); })
        .finally(() => setCarregandoPrevia(false));
    }, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [aberto, form.destinatarios, form.template_nome, form.texto, form.usarTexto, form.params]);

  function setParam(i: number, v: string) {
    setForm(f => { const p = [...f.params]; while (p.length <= i) p.push(''); p[i] = v; return { ...f, params: p }; });
  }
  const validos = previa?.destinatarios.validos ?? 0;
  const confirmado = form.modo !== 'agora' || (validos > 0 && Number(form.confirmacao) === validos);

  async function salvar() {
    if (!previa) { toast.error('Aguarde a prévia carregar.'); return; }
    if (validos === 0) { toast.error('Informe ao menos um telefone válido (DDD + número).'); return; }
    const conteudoTemplate = !form.usarTexto;
    if (conteudoTemplate && !form.template_nome) { toast.error('Escolha um template ou escreva o texto.'); return; }
    if (!conteudoTemplate && !form.texto.trim()) { toast.error('Escreva o texto da mensagem.'); return; }
    if (conteudoTemplate && previa.params.conhecido && !previa.params.ok) { toast.error('Preencha todos os parâmetros do template.'); return; }
    setSalvando(true);
    try {
      if (form.modo === 'agora') {
        const r = await comunicacao.envios.agora({
          nome: form.nome.trim(),
          destinatarios: form.destinatarios,
          template_nome: conteudoTemplate ? form.template_nome : '',
          texto: conteudoTemplate ? '' : form.texto,
          params: form.params,
          confirmar_quantidade: Number(form.confirmacao),
        });
        toast.success(`${r.na_fila} de ${r.total} mensagens entraram na fila. Saem na próxima rodada (a cada hora), até 2 por telefone por rodada.`, { duration: 9000 });
        if (r.bloqueados_template > 0) toast.warning(`${r.bloqueados_template} não entraram: template bloqueado na Meta.`);
        onSalvo('enviados');
        return;
      }
      if (!form.nome.trim()) { toast.error('Dê um nome ao agendamento.'); return; }
      const body: Record<string, unknown> = {
        nome: form.nome.trim(),
        template_nome: conteudoTemplate ? form.template_nome : null,
        texto: conteudoTemplate ? null : form.texto.trim(),
        params: form.params.filter((_, i) => nParams === null || i < nParams),
        audiencia: { tipo: 'telefones', telefones: previa.destinatarios.lista },
      };
      if (form.modo === 'agendado') {
        if (!form.quando) { toast.error('Informe a data e a hora do envio.'); return; }
        const t = new Date(form.quando);
        if (!Number.isFinite(t.getTime())) { toast.error('Data inválida.'); return; }
        if (t.getTime() <= Date.now()) { toast.error('A data do envio já passou.'); return; }
        body.quando = t.toISOString(); body.recorrencia = null; body.dia_semana = null; body.dia_mes = null; body.hora = null;
      } else {
        body.quando = null; body.recorrencia = form.recorrencia; body.hora = form.hora;
        body.dia_semana = form.recorrencia === 'semanal' ? Number(form.dia_semana) : null;
        body.dia_mes = form.recorrencia === 'mensal' ? Number(form.dia_mes) : null;
      }
      if (editar) { await comunicacao.agendamentos.atualizar(editar.id, body); toast.success('Agendamento atualizado'); }
      else { await comunicacao.agendamentos.criar(body); toast.success(form.modo === 'agendado' ? 'Envio agendado' : 'Recorrência criada'); }
      onSalvo('agendados');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Erro ao salvar', { duration: 9000 });
    } finally { setSalvando(false); }
  }

  const ModoBtn = ({ m, icone: Icone, rotulo }: { m: Modo; icone: typeof Zap; rotulo: string }) => (
    <Button type="button" size="sm" variant={form.modo === m ? 'default' : 'outline'} className="gap-1.5" disabled={!!editar && m === 'agora'}
      onClick={() => setForm(f => ({ ...f, modo: m, confirmacao: '' }))}>
      <Icone className="h-3.5 w-3.5" />{rotulo}
    </Button>
  );

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>{editar ? 'Editar agendamento' : 'Novo envio'}</DialogTitle>
          <DialogDescription>
            Quem entrega é a fila de WhatsApp (cron horário, com retentativa). A prévia e o custo vêm do servidor — o que você vê aqui é o que vai sair.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-4 md:grid-cols-2">
            {/* ── coluna 1 · o envio ── */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <ModoBtn m="agora" icone={Zap} rotulo="Agora" />
                <ModoBtn m="agendado" icone={CalendarClock} rotulo="Agendar" />
                <ModoBtn m="recorrente" icone={Repeat} rotulo="Repetir" />
              </div>
              {form.modo === 'agendado' && (
                <Input type="datetime-local" value={form.quando} onChange={(e) => setForm(f => ({ ...f, quando: e.target.value }))} className="h-9" />
              )}
              {form.modo === 'recorrente' && (
                <div className="grid grid-cols-2 gap-2">
                  <Select value={form.recorrencia} onValueChange={(v) => setForm(f => ({ ...f, recorrencia: v as typeof f.recorrencia }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria">Diária</SelectItem>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="time" value={form.hora} onChange={(e) => setForm(f => ({ ...f, hora: e.target.value }))} className="h-9" />
                  {form.recorrencia === 'semanal' && (
                    <Select value={form.dia_semana} onValueChange={(v) => setForm(f => ({ ...f, dia_semana: v }))}>
                      <SelectTrigger className="h-9 col-span-2"><SelectValue /></SelectTrigger>
                      <SelectContent>{DIAS_SEMANA.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {form.recorrencia === 'mensal' && (
                    <Input type="number" min={1} max={31} placeholder="Dia do mês" value={form.dia_mes} onChange={(e) => setForm(f => ({ ...f, dia_mes: e.target.value }))} className="h-9 col-span-2" />
                  )}
                </div>
              )}
              <Input placeholder={form.modo === 'agora' ? 'Nome (opcional · fica no histórico)' : 'Nome do agendamento'} value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} />

              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Destinatários — um telefone por linha (DDD + número)</span>
                  {previa && (
                    <span className="tabular-nums">
                      <b className={validos > 0 ? 'text-foreground' : 'text-red-600'}>{validos}</b> válidos
                      {previa.destinatarios.duplicados > 0 && <> · {previa.destinatarios.duplicados} repetidos</>}
                      {previa.destinatarios.invalidos_total > 0 && <> · <span className="text-red-600">{previa.destinatarios.invalidos_total} inválidos</span></>}
                    </span>
                  )}
                </div>
                <textarea rows={6} value={form.destinatarios} onChange={(e) => setForm(f => ({ ...f, destinatarios: e.target.value, confirmacao: '' }))}
                  placeholder={'21999998888\n(21) 98888-7777'}
                  className="w-full resize-y rounded-lg border border-border bg-background p-2 font-mono text-xs outline-none focus:border-primary" />
                {previa && previa.destinatarios.invalidos.length > 0 && (
                  <p className="mt-1 text-[11px] text-red-600">Não entram: {previa.destinatarios.invalidos.slice(0, 8).join(' · ')}{previa.destinatarios.invalidos_total > 8 ? ` · +${previa.destinatarios.invalidos_total - 8}` : ''}</p>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5"><input type="radio" checked={!form.usarTexto} onChange={() => setForm(f => ({ ...f, usarTexto: false }))} /> Template aprovado</label>
                <label className="flex items-center gap-1.5"><input type="radio" checked={form.usarTexto} onChange={() => setForm(f => ({ ...f, usarTexto: true }))} /> Texto livre</label>
              </div>
              {!form.usarTexto ? (
                <>
                  <Select value={form.template_nome || '_none'} onValueChange={(v) => setForm(f => ({ ...f, template_nome: v === '_none' ? '' : v, params: [] }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Escolha o template" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— escolha o template —</SelectItem>
                      {(templates || []).map(t => (
                        <SelectItem key={t.id} value={t.nome}>{t.nome} · {t.categoria || 'sem categoria'}{t.params_body ? ` · ${t.params_body} param.` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {templates && templates.length === 0 && <p className="text-[11px] text-amber-600">Nenhum template aprovado no espelho. Sincronize em Configurações → Templates.</p>}
                  {nParams !== null && nParams > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {Array.from({ length: nParams }).map((_, i) => (
                        <Input key={i} className="h-9" placeholder={`{{${i + 1}}}`} value={form.params[i] || ''} onChange={(e) => setParam(i, e.target.value)} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <textarea rows={4} value={form.texto} onChange={(e) => setForm(f => ({ ...f, texto: e.target.value }))} placeholder="Texto da mensagem"
                  className="w-full resize-y rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary" />
              )}
            </div>

            {/* ── coluna 2 · a prévia ── */}
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>Prévia</span>
                  {carregandoPrevia && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </div>
                {previaErro ? (
                  <p className="text-sm text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Não deu para montar a prévia agora.</p>
                ) : !previa ? (
                  <p className="text-sm text-muted-foreground">Cole os telefones e escolha o conteúdo — a prévia aparece aqui.</p>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap rounded-md bg-background p-3 text-sm shadow-sm min-h-[72px]">
                      {previa.previa.texto || <span className="text-muted-foreground">(sem corpo — o template não tem texto no espelho)</span>}
                    </div>
                    {previa.previa.faltando.length > 0 && (
                      <p className="mt-2 text-[11px] text-amber-700">Complete antes de enviar: {previa.previa.faltando.map(n => `{{${n}}}`).join(' ')}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {previa.template && (
                        <>
                          <Badge variant="secondary">{previa.template.categoria || 'sem categoria'}</Badge>
                          <Badge variant={String(previa.template.status_meta).toUpperCase() === 'APPROVED' ? 'outline' : 'destructive'}>{previa.template.status_meta || 'sem status'}</Badge>
                        </>
                      )}
                      {previa.tipo === 'texto' && <Badge variant="secondary">texto livre · janela 24h</Badge>}
                    </div>
                    <div className="mt-3 border-t pt-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo estimado</div>
                      {previa.custo.total === null ? (
                        <div className="text-sm text-amber-700">Não dá para estimar: template sem categoria/tarifa.</div>
                      ) : (
                        <div className="text-lg font-bold tabular-nums">
                          {brl(previa.custo.total)}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {validos} × {brl(previa.custo.tarifa || 0)} ({previa.custo.categoria}) · estimativa, não a fatura da Meta
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              {previa && previa.avisos.length > 0 && (
                <ul className="space-y-1">
                  {previa.avisos.map(a => (
                    <li key={a.codigo} className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{a.texto}</span>
                    </li>
                  ))}
                </ul>
              )}
              {form.modo === 'agora' && previa && validos > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="text-xs font-semibold text-red-800">Confirmação</div>
                  <p className="mt-0.5 text-[11px] text-red-800/80">Digite <b>{validos}</b> para confirmar que leu a prévia. Depois de entrar na fila não dá para desfazer.</p>
                  <Input className="mt-2 h-9 w-32 tabular-nums" inputMode="numeric" placeholder={String(validos)} value={form.confirmacao} onChange={(e) => setForm(f => ({ ...f, confirmacao: e.target.value.replace(/\D/g, '') }))} />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button className="gap-1.5" disabled={salvando || !previa || validos === 0 || !confirmado} onClick={salvar}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : form.modo === 'agora' ? <Send className="h-4 w-4" /> : form.modo === 'agendado' ? <CalendarClock className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
            {form.modo === 'agora' ? `Enviar agora (${validos})` : editar ? 'Salvar' : form.modo === 'agendado' ? 'Agendar' : 'Criar recorrência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
