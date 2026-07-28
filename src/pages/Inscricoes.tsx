// Módulo de Inscrições · F3.2 — abas Calendário + Eventos (specs:
// docs/modulo-inscricoes/fase2-specs.md · 5 abas fechadas com o Marcos 28/07;
// Todas as inscrições, Pessoas e Dashboard chegam nas PRs seguintes).
// Todo evento nasce com os CAMPOS PADRÃO travados do Contrato de Inscrição
// (bloco informativo no form) + campos extras do form-builder (key opaca
// estável) + área obrigatória do catálogo oficial + séries/edições.
// Feedback 28/07: série recorrente = UM card na aba Eventos ("um quadrado
// Next") com TODAS as edições dentro do modal + "recorrente até" editável;
// botão Publicar de 1 clique; máscara hh:mm; "Duplicar evento".
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inscricoesApi as api } from '../api';
import InscricoesTodas from './InscricoesTodas';
import InscricoesPessoas from './InscricoesPessoas';
import InscricoesDashboard from './InscricoesDashboard';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  CalendarDays, ClipboardList, Plus, Loader2, ChevronLeft, ChevronRight,
  Users, Trash2, CopyPlus, Image as ImageIcon, Lock, Link2, Repeat, Megaphone,
} from 'lucide-react';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtData = (s?: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '';

const PERIODICIDADES = [
  { value: 'unica', label: 'Avulso (sem recorrência)' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
];
const PERIOD_LABEL: Record<string, string> = { semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual', custom: 'Recorrente' };

const STATUS_BADGE: Record<string, string> = {
  rascunho: 'bg-amber-500/15 text-amber-600',
  publicado: 'bg-emerald-500/15 text-emerald-600',
  encerrado: 'bg-foreground/10 text-muted-foreground',
  arquivado: 'bg-foreground/10 text-muted-foreground',
};

// Máscara hh:mm — digitou "1930" vira "19:30" sozinho (feedback do Marcos)
function mascaraHora(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

// key opaca estável (mesma regra do backend — o server regenera se inválida)
const novaKeyCampo = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function CamposEditor({ campos, setCampos }: { campos: any[]; setCampos: (v: any[]) => void }) {
  function add() { setCampos([...campos, { key: novaKeyCampo(), label: '', tipo: 'texto', obrigatorio: true, opcoes: [] }]); }
  function upd(i: number, patch: any) { const c = [...campos]; c[i] = { ...c[i], ...patch }; setCampos(c); }
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-muted-foreground flex items-start gap-2">
        <Lock className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
        <span><b className="text-foreground">Campos padrão em todos os formulários</b> (fixos · Contrato de Inscrição): Nome completo · WhatsApp · CPF · E-mail · Data de nascimento · Sexo · Endereço (opcional) · Aceite de termos · Opt-in WhatsApp.</span>
      </div>
      <div className="text-xs font-medium text-muted-foreground">Campos extras deste evento</div>
      {campos.map((c, i) => (
        <div key={c.key || i} className="rounded-lg border border-border p-2 space-y-2">
          <div className="flex gap-2">
            <Input placeholder="Pergunta (ex.: Em qual área você serve?)" value={c.label} onChange={e => upd(i, { label: e.target.value })} className="h-8 text-sm" />
            <select value={c.tipo} onChange={e => upd(i, { tipo: e.target.value })} className="h-8 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-1">
              <option value="texto">Texto</option>
              <option value="textarea">Parágrafo</option>
              <option value="email">E-mail extra</option>
              <option value="select">Lista suspensa</option>
              <option value="escolha">Escolha</option>
              <option value="multi">Múltipla escolha</option>
              <option value="rede_social">Rede social</option>
              <option value="imagem">Imagem (upload)</option>
              <option value="numero">Número</option>
              <option value="data">Data</option>
            </select>
            <button onClick={() => setCampos(campos.filter((_, j) => j !== i))} className="text-red-500 px-1"><Trash2 className="h-4 w-4" /></button>
          </div>
          {(c.tipo === 'select' || c.tipo === 'escolha' || c.tipo === 'multi') && (
            <textarea placeholder="Opções (uma por linha)" value={(c.opcoes || []).join('\n')} onChange={e => upd(i, { opcoes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
              className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 py-1.5 text-xs min-h-[90px]" />
          )}
          {c.tipo === 'imagem' && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Upload público — o formulário exigirá o consentimento de uso de imagem.</p>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={c.obrigatorio !== false} onChange={e => upd(i, { obrigatorio: e.target.checked })} /> Obrigatório
          </label>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar campo</Button>
    </div>
  );
}

const EVENTO_VAZIO = {
  nome: '', area: '', periodicidade: 'unica', tipo: 'evento',
  data: '', hora: '', local: '', descricao: '', capa_url: '',
  vagas: '', inscricoes_encerram_em: '', recorre_ate: '',
  msg_sucesso_titulo: '', msg_sucesso_texto: '', msg_whatsapp: '',
  tem_sorteio: false, checkin_ativo: false,
  pagamento_ativo: false, valor_centavos: '',
  status: 'rascunho',
};

function isoParaInputLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function EventoModal({ evento, areas, onClose, onSaved }: {
  evento?: any; areas: any[]; onClose: () => void; onSaved: () => void;
}) {
  const ed = !!evento;
  const [f, setF] = useState<any>(() => ed ? {
    ...EVENTO_VAZIO, ...evento,
    vagas: evento.vagas ?? '',
    valor_centavos: evento.valor_centavos != null ? String(evento.valor_centavos / 100) : '',
    inscricoes_encerram_em: isoParaInputLocal(evento.inscricoes_encerram_em),
  } : { ...EVENTO_VAZIO });
  const [campos, setCampos] = useState<any[]>(evento?.campos || []);
  const [premios, setPremios] = useState<string[]>(evento?.premios || []);
  const [salvando, setSalvando] = useState(false);
  const [enviandoCapa, setEnviandoCapa] = useState(false);
  const set = (k: string) => (e: any) => setF((s: any) => ({ ...s, [k]: e?.target ? e.target.value : e }));

  async function enviarCapa(file?: File) {
    if (!file) return;
    setEnviandoCapa(true);
    try { const r: any = await api.uploadCapa(file); setF((s: any) => ({ ...s, capa_url: r.url })); }
    catch (e: any) { toast.error(e?.message || 'Erro ao enviar a capa'); } finally { setEnviandoCapa(false); }
  }

  async function salvar() {
    if (f.nome.trim().length < 2) { toast.error('Informe o nome do evento'); return; }
    if (!f.area) { toast.error('Selecione a área (obrigatória)'); return; }
    for (const c of campos) { if (!c.label?.trim()) { toast.error('Todo campo extra precisa de uma pergunta'); return; } }
    setSalvando(true);
    try {
      const payload: any = {
        nome: f.nome, area: f.area, tipo: f.tipo, data: f.data || null, hora: f.hora || null,
        local: f.local || null, descricao: f.descricao || null, capa_url: f.capa_url || null,
        campos, premios: premios.map(p => p.trim()).filter(Boolean),
        vagas: f.vagas === '' ? null : Number(f.vagas),
        inscricoes_encerram_em: f.inscricoes_encerram_em ? new Date(f.inscricoes_encerram_em).toISOString() : null,
        msg_sucesso_titulo: f.msg_sucesso_titulo || null,
        msg_sucesso_texto: f.msg_sucesso_texto || null,
        msg_whatsapp: f.msg_whatsapp || null,
        tem_sorteio: !!f.tem_sorteio, checkin_ativo: !!f.checkin_ativo,
        pagamento_ativo: !!f.pagamento_ativo,
        valor_centavos: f.pagamento_ativo && f.valor_centavos !== '' ? Math.round(Number(String(f.valor_centavos).replace(',', '.')) * 100) : null,
      };
      if (ed) { payload.status = f.status; await api.atualizarEvento(evento.id, payload); }
      else {
        payload.periodicidade = f.periodicidade;
        if (f.periodicidade !== 'unica') payload.recorre_ate = f.recorre_ate || null;
        await api.criarEvento(payload);
      }
      toast.success(ed ? 'Evento atualizado' : 'Evento criado (em rascunho)');
      onSaved();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{ed ? 'Editar evento' : 'Novo evento de inscrição'}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {ed && evento?.serie && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Repeat className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Edição <b className="text-foreground">{evento.edicao_rotulo}</b> da série <b className="text-foreground">{evento.serie.nome}</b> · {PERIOD_LABEL[evento.serie.periodicidade] || evento.serie.periodicidade}{evento.serie.recorre_ate ? ` até ${fmtData(evento.serie.recorre_ate)}` : ' · sem data final'} — todas as edições ficam no card da série, na aba Eventos.</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Nome *</label>
              <Input value={f.nome} onChange={set('nome')} placeholder="Ex.: Celebra Agosto" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Área * (catálogo oficial)</label>
              <select value={f.area} onChange={set('area')} className="w-full h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
                <option value="">Selecione…</option>
                {areas.map((a: any) => <option key={a.id} value={a.nome}>{a.nome}</option>)}
              </select>
            </div>
            {!ed && (
              <div>
                <label className="text-xs text-muted-foreground">Recorrência</label>
                <select value={f.periodicidade} onChange={set('periodicidade')} className="w-full h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
                  {PERIODICIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            )}
            {!ed && f.periodicidade !== 'unica' && (
              <div>
                <label className="text-xs text-muted-foreground">Recorrente até (opcional)</label>
                <DatePicker value={f.recorre_ate || ''} onChange={set('recorre_ate')} />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Data</label>
              <DatePicker value={f.data || ''} onChange={set('data')} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hora</label>
              <Input value={f.hora || ''} onChange={e => setF((s: any) => ({ ...s, hora: mascaraHora(e.target.value) }))}
                placeholder="19:30" inputMode="numeric" maxLength={5} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Local</label>
              <Input value={f.local || ''} onChange={set('local')} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Descrição</label>
              <textarea value={f.descricao || ''} onChange={set('descricao')} rows={2}
                className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Vagas (vazio = ilimitado)</label>
              <Input type="number" min={1} value={f.vagas} onChange={set('vagas')} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Inscrições encerram em</label>
              <Input type="datetime-local" value={f.inscricoes_encerram_em} onChange={set('inscricoes_encerram_em')} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Capa</label>
              <div className="flex items-center gap-2">
                {f.capa_url && <img src={f.capa_url} alt="capa" className="h-10 rounded border border-border" />}
                <label className="inline-flex items-center gap-1.5 text-xs text-primary border border-primary/50 rounded-md px-2.5 py-1.5 cursor-pointer">
                  <ImageIcon className="h-3.5 w-3.5" /> {enviandoCapa ? 'Enviando…' : (f.capa_url ? 'Trocar capa' : 'Enviar capa')}
                  <input type="file" accept="image/*" className="hidden" disabled={enviandoCapa}
                    onChange={e => enviarCapa(e.target.files?.[0])} />
                </label>
              </div>
            </div>
          </div>

          <CamposEditor campos={campos} setCampos={setCampos} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.tem_sorteio} onChange={e => setF((s: any) => ({ ...s, tem_sorteio: e.target.checked }))} /> Sorteio (número da sorte)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.checkin_ativo} onChange={e => setF((s: any) => ({ ...s, checkin_ativo: e.target.checked }))} /> Check-in no dia</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.pagamento_ativo} onChange={e => setF((s: any) => ({ ...s, pagamento_ativo: e.target.checked }))} /> Inscrição paga</label>
            {f.pagamento_ativo && (
              <div>
                <label className="text-xs text-muted-foreground">Valor (R$) · Pix chega na próxima fase</label>
                <Input value={f.valor_centavos} onChange={set('valor_centavos')} placeholder="150,00" inputMode="decimal" />
              </div>
            )}
          </div>
          {f.tem_sorteio && (
            <div>
              <label className="text-xs text-muted-foreground">Prêmios (um por linha)</label>
              <textarea value={premios.join('\n')} onChange={e => setPremios(e.target.value.split('\n'))} rows={2}
                className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 py-1.5 text-sm" />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Título da mensagem de sucesso</label>
              <Input value={f.msg_sucesso_titulo || ''} onChange={set('msg_sucesso_titulo')} placeholder="Presença confirmada!" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Texto da mensagem de sucesso</label>
              <Input value={f.msg_sucesso_texto || ''} onChange={set('msg_sucesso_texto')} />
            </div>
          </div>
          {ed && (
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <select value={f.status} onChange={set('status')} className="w-full h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
                <option value="rascunho">Rascunho</option>
                <option value="publicado">Publicado</option>
                <option value="encerrado">Encerrado</option>
                <option value="arquivado">Arquivado</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">Publicado = o formulário público fica NO AR em /evento/{'{slug}'} (mesmo endereço dos QRs do Celebra). Evento pago só abre na fase do Pix.</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : (ed ? 'Salvar' : 'Criar evento')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NovaEdicaoModal({ evento, onClose, onSaved }: { evento: any; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState('');
  const [periodicidade, setPeriodicidade] = useState('mensal');
  const [salvando, setSalvando] = useState(false);
  const avulso = !evento.serie_id;
  async function criar() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { toast.error('Informe a data da nova edição'); return; }
    setSalvando(true);
    try {
      await api.novaEdicao(evento.id, { data, ...(avulso ? { periodicidade } : {}) });
      toast.success('Evento duplicado (em rascunho) — formulário e configurações copiados');
      onSaved();
    } catch (e: any) { toast.error(e?.message || 'Erro ao duplicar'); } finally { setSalvando(false); }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Duplicar evento · {evento.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">Copia o formulário e as configurações pra próxima data — vira uma nova edição da série. O dashboard compara as edições entre si.</p>
          {avulso && (
            <div>
              <label className="text-xs text-muted-foreground">Este evento vira uma série</label>
              <select value={periodicidade} onChange={e => setPeriodicidade(e.target.value)} className="w-full h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
                {PERIODICIDADES.filter(p => p.value !== 'unica').map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Data da nova edição *</label>
            <DatePicker value={data} onChange={setData} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={criar} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Duplicar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// "Um quadrado Next" — modal da série com TODAS as edições dentro (feedback 28/07)
function SerieModal({ grupo, onClose, onEditar, onDuplicar, onPublicar, onCopiarLink, onSaved }: {
  grupo: { serie: any; edicoes: any[] }; onClose: () => void;
  onEditar: (e: any) => void; onDuplicar: (e: any) => void;
  onPublicar: (e: any) => Promise<void>; onCopiarLink: (e: any) => void; onSaved: () => void;
}) {
  const navigate = useNavigate();
  const { serie, edicoes } = grupo;
  const [recorreAte, setRecorreAte] = useState(serie.recorre_ate || '');
  const [salvando, setSalvando] = useState(false);
  const mudou = (recorreAte || '') !== (serie.recorre_ate || '');

  async function salvarRecorrencia() {
    setSalvando(true);
    try {
      await api.atualizarSerie(serie.id, { recorre_ate: recorreAte || null });
      toast.success(recorreAte ? `Recorrente até ${fmtData(recorreAte)}` : 'Série sem data final');
      onSaved();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Repeat className="h-4 w-4 text-primary" /> {serie.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">
              <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5">{PERIOD_LABEL[serie.periodicidade] || serie.periodicidade}</span>
              <span className="ml-2">{edicoes.length} {edicoes.length === 1 ? 'edição' : 'edições'}</span>
            </div>
            <div className="flex items-end gap-1.5 ml-auto">
              <div>
                <label className="text-[11px] text-muted-foreground block">Recorrente até (vazio = sem data final)</label>
                <DatePicker value={recorreAte} onChange={setRecorreAte} className="h-8 text-xs" />
              </div>
              {mudou && (
                <Button size="sm" onClick={salvarRecorrencia} disabled={salvando} className="h-8">
                  {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            {edicoes.map(e => (
              <div key={e.id} className="rounded-lg border border-border px-2.5 py-2 flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[150px]">
                  <div className="text-sm font-medium">{e.edicao_rotulo || e.nome}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {e.data && <span>{fmtData(e.data)}{e.hora ? ` · ${e.hora}` : ''}</span>}
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {e.inscritos}{e.vagas ? `/${e.vagas}` : ''}</span>
                    <span className={`rounded px-1.5 py-0.5 ${STATUS_BADGE[e.status] || ''}`}>{e.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {e.status === 'rascunho' && (
                    <Button size="sm" className="h-7 text-xs" onClick={() => onPublicar(e)} title="Coloca o formulário no ar agora">
                      <Megaphone className="h-3 w-3 mr-1" /> Publicar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7" title="Inscritos e sorteio desta edição" onClick={() => navigate(`/inscricoes/evento/${e.id}`)}>
                    <Users className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7" title="Copiar o link público" onClick={() => onCopiarLink(e)}>
                    <Link2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEditar(e)}>Editar</Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-1">
            <Button size="sm" variant="outline" onClick={() => onDuplicar(edicoes[0])} title="Copiar formulário e configurações pra próxima data">
              <CopyPlus className="h-3.5 w-3.5 mr-1" /> Duplicar evento
            </Button>
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Inscricoes() {
  const navigate = useNavigate();
  const { getAccessLevel } = useAuth();
  // Aba Pessoas concentra PII (rollup por CPF/telefone) — SPEC-01: nível ≥2
  const podePessoas = getAccessLevel(['inscricoes']) >= 2;
  const [aba, setAba] = useState<'calendario' | 'eventos' | 'todas' | 'pessoas' | 'dashboard'>('calendario');
  const [eventos, setEventos] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesRef, setMesRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [modal, setModal] = useState<{ tipo: 'novo' | 'editar' | 'edicao' | 'serie'; evento?: any; serieId?: string } | null>(null);

  function carregar() {
    setLoading(true);
    Promise.all([api.listarEventos(), api.areas()])
      .then(([evs, ars]: any[]) => { setEventos(Array.isArray(evs) ? evs : []); setAreas(Array.isArray(ars) ? ars : []); })
      .catch(() => toast.error('Erro ao carregar'))
      .finally(() => setLoading(false));
  }
  useEffect(() => { carregar(); }, []);

  const porDia = useMemo(() => {
    const m: Record<string, any[]> = {};
    eventos.forEach(e => { if (e.data) (m[e.data] = m[e.data] || []).push(e); });
    return m;
  }, [eventos]);

  // Aba Eventos agrupada: série recorrente = 1 card com as edições dentro
  const { grupos, avulsos } = useMemo(() => {
    const map = new Map<string, { serie: any; edicoes: any[] }>();
    const av: any[] = [];
    eventos.forEach(e => {
      if (e.serie_id && e.serie) {
        const g = map.get(e.serie_id) || { serie: e.serie, edicoes: [] };
        g.edicoes.push(e); map.set(e.serie_id, g);
      } else av.push(e);
    });
    map.forEach(g => g.edicoes.sort((a, b) => (b.data || '').localeCompare(a.data || '')));
    return { grupos: [...map.values()], avulsos: av };
  }, [eventos]);

  const grupoAberto = useMemo(
    () => modal?.tipo === 'serie' ? grupos.find(g => g.serie.id === modal.serieId) || null : null,
    [modal, grupos],
  );

  const celulas = useMemo(() => {
    const ini = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
    const fimDia = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < ini.getDay(); i++) arr.push(null);
    for (let d = 1; d <= fimDia; d++) arr.push(new Date(mesRef.getFullYear(), mesRef.getMonth(), d));
    return arr;
  }, [mesRef]);

  const hojeStr = ymd(new Date());

  async function excluir(ev: any) {
    if (!window.confirm(`Excluir o evento "${ev.nome}"? (exclusão segura — dá pra restaurar)`)) return;
    try { await api.excluirEvento(ev.id); toast.success('Evento excluído'); carregar(); }
    catch (e: any) { toast.error(e?.message || 'Sem permissão pra excluir'); }
  }

  async function publicar(ev: any) {
    try {
      await api.atualizarEvento(ev.id, { status: 'publicado' });
      toast.success(`"${ev.nome}" publicado — o link já está no ar`);
      carregar();
    } catch (e: any) { toast.error(e?.message || 'Erro ao publicar'); }
  }

  function copiarLink(ev: any) {
    navigator.clipboard.writeText(`${window.location.origin}/evento/${ev.slug}`);
    if (ev.status === 'publicado') toast.success('Link copiado — formulário no ar');
    else toast.warning('Link copiado, mas o evento está em RASCUNHO — clique em Publicar pra ativar');
  }

  const ABAS = [
    { key: 'calendario', label: 'Calendário', on: true },
    { key: 'eventos', label: 'Eventos', on: true },
    { key: 'todas', label: 'Todas as inscrições', on: true },
    { key: 'pessoas', label: 'Pessoas', on: podePessoas, motivo: podePessoas ? undefined : 'Requer nível 2 no módulo (dados concentrados de pessoas)' },
    { key: 'dashboard', label: 'Dashboard', on: true },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><ClipboardList className="h-6 w-6 text-primary" /> Inscrições</h1>
          <p className="text-sm text-muted-foreground">Módulo central de inscrições · calendário, eventos e séries (Contrato de Inscrição).</p>
        </div>
        <Button onClick={() => setModal({ tipo: 'novo' })}><Plus className="h-4 w-4 mr-1" /> Novo evento</Button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {ABAS.map(a => (
          <button key={a.key} disabled={!a.on} onClick={() => a.on && setAba(a.key as any)}
            title={a.on ? undefined : ((a as any).motivo || 'Chega nas próximas entregas')}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${aba === a.key ? 'bg-primary text-primary-foreground border-primary' : a.on ? 'border-border hover:border-primary/50' : 'border-border opacity-40 cursor-not-allowed'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'calendario' && (
        <Card className="glass-solid p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1))} className="p-1.5 rounded hover:bg-foreground/5"><ChevronLeft className="h-4 w-4" /></button>
            <div className="font-semibold">{MESES[mesRef.getMonth()]} {mesRef.getFullYear()}</div>
            <button onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1))} className="p-1.5 rounded hover:bg-foreground/5"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
            {DIAS.map((d, i) => <div key={i}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulas.map((d, i) => {
              const key = d ? ymd(d) : `x${i}`;
              const evs = d ? (porDia[ymd(d)] || []) : [];
              return (
                <div key={key} className={`min-h-[64px] rounded-lg border p-1 text-left ${d ? 'border-border' : 'border-transparent'} ${d && ymd(d) === hojeStr ? 'ring-1 ring-primary/50' : ''}`}>
                  {d && <div className="text-xs text-muted-foreground">{d.getDate()}</div>}
                  <div className="space-y-0.5 mt-0.5">
                    {evs.map(e => (
                      <button key={e.id} onClick={() => setModal({ tipo: 'editar', evento: e })} title={`${e.nome} · ${e.area}`}
                        className="w-full truncate rounded bg-primary/15 text-primary text-[11px] px-1 py-0.5 text-left hover:bg-primary/25">
                        {e.nome}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {aba === 'todas' && <InscricoesTodas areas={areas} />}
      {aba === 'pessoas' && podePessoas && <InscricoesPessoas />}
      {aba === 'dashboard' && <InscricoesDashboard areas={areas} />}

      {aba === 'eventos' && (
        <Card className="glass-solid p-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum evento na espinha ainda — crie o primeiro. (Os eventos do módulo antigo migram na próxima entrega, sem perder nada.)</p>
          ) : (
            <div className="space-y-2">
              {grupos.map(g => {
                const totalInscritos = g.edicoes.reduce((s, e) => s + (Number(e.inscritos) || 0), 0);
                return (
                  <button key={g.serie.id} onClick={() => setModal({ tipo: 'serie', serieId: g.serie.id })}
                    className="w-full rounded-lg border border-primary/40 bg-primary/5 p-3 flex items-center gap-3 flex-wrap text-left hover:bg-primary/10 transition-colors">
                    <div className="flex-1 min-w-[220px]">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Repeat className="h-3.5 w-3.5 text-primary" /> {g.serie.nome}
                        <span className="text-[10px] rounded-full bg-primary/15 text-primary px-1.5 py-0.5">
                          {PERIOD_LABEL[g.serie.periodicidade] || g.serie.periodicidade}{g.serie.recorre_ate ? ` até ${fmtData(g.serie.recorre_ate)}` : ''}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="rounded bg-foreground/8 px-1.5 py-0.5">{g.edicoes[0]?.area}</span>
                        <span>{g.edicoes.length} {g.edicoes.length === 1 ? 'edição' : 'edições'}</span>
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {totalInscritos} no total</span>
                        {g.edicoes[0]?.data && <span>última: {fmtData(g.edicoes[0].data)}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-primary font-medium">Ver edições →</span>
                  </button>
                );
              })}
              {avulsos.map(e => (
                <div key={e.id} className="rounded-lg border border-border p-3 flex items-center gap-3 flex-wrap">
                  <button className="flex-1 min-w-[220px] text-left" onClick={() => navigate(`/inscricoes/evento/${e.id}`)}
                    title="Abrir o evento (inscritos e sorteio)">
                    <div className="font-medium text-sm hover:text-primary transition-colors">{e.nome}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="rounded bg-foreground/8 px-1.5 py-0.5">{e.area}</span>
                      {e.data && <span>{fmtData(e.data)}</span>}
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {e.inscritos}{e.vagas ? `/${e.vagas}` : ''}</span>
                      <span className={`rounded px-1.5 py-0.5 ${STATUS_BADGE[e.status] || ''}`}>{e.status}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5">
                    {e.status === 'rascunho' && (
                      <Button size="sm" onClick={() => publicar(e)} title="Coloca o formulário no ar agora">
                        <Megaphone className="h-3.5 w-3.5 mr-1" /> Publicar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => navigate(`/inscricoes/evento/${e.id}`)} title="Inscritos e sorteio">
                      <Users className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" title="Copiar o link público (/evento/…)" onClick={() => copiarLink(e)}>
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setModal({ tipo: 'edicao', evento: e })} title="Copiar formulário e configurações pra próxima data">
                      <CopyPlus className="h-3.5 w-3.5 mr-1" /> Duplicar evento
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setModal({ tipo: 'editar', evento: e })}>Editar</Button>
                    <button onClick={() => excluir(e)} className="text-red-500 p-1.5" title="Excluir (soft)"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {modal?.tipo === 'novo' && <EventoModal areas={areas} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar(); }} />}
      {modal?.tipo === 'editar' && <EventoModal evento={modal.evento} areas={areas} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar(); }} />}
      {modal?.tipo === 'edicao' && <NovaEdicaoModal evento={modal.evento} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar(); }} />}
      {grupoAberto && (
        <SerieModal grupo={grupoAberto} onClose={() => setModal(null)}
          onEditar={(e) => setModal({ tipo: 'editar', evento: e })}
          onDuplicar={(e) => setModal({ tipo: 'edicao', evento: e })}
          onPublicar={publicar} onCopiarLink={copiarLink}
          onSaved={carregar} />
      )}
    </div>
  );
}
