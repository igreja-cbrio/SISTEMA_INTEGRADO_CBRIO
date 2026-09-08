// Kids · Apresentação de Crianças — respostas do formulário público e do app,
// agrupadas por turma (data_apresentacao · 2º domingo do mês), estilo batismo.
//
// 08/09/2026 (pedido do Marcos, via Milena): (1) cada inscrição mostra o CULTO em
// que a criança será apresentada — atribuído no envio pela régua "9h30 até o
// limite, depois 11h30" (catálogo `apresentacao_horarios`, editável no card
// "Horários da apresentação" aqui); a equipe corrige o culto por criança.
// (2) "Ver ficha" abre TUDO que a pessoa preencheu no formulário — foi o caso
// Isabella (mãe dobrada no certificado) que motivou: qualquer problema, a
// equipe vê a origem. (3) Nomes de pai/mãe iguais saem uma vez só.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { hrefWhatsapp } from '@/lib/conversas';
import { nomesDosPaisUnicos, paisIguais } from '@/lib/apresentacaoPais';
import { totemKids as api } from '../../../api';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, Baby, Loader2, Phone, Search, Copy, Share2, Check, Award, Download,
  Clock, ChevronDown, FileText, Plus, Trash2, AlertTriangle,
} from 'lucide-react';
import { gerarCertificadoApresentacao, gerarCertificadosApresentacaoLote } from '../../../lib/gerarCertificadoApresentacao';

const fmt = (d?: string | null) => { if (!d) return '—'; try { return new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR'); } catch { return d || '—'; } };
const fmtDataHora = (d?: string | null) => { if (!d) return '—'; try { return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch { return d || '—'; } };
const fmtCpf = (v?: string | null) => { const s = String(v || '').replace(/\D/g, ''); return s.length === 11 ? s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (v || '—'); };
const fmtTel = (v?: string | null) => { const s = String(v || '').replace(/\D/g, ''); if (s.length === 11) return s.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); if (s.length === 10) return s.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3'); return v || '—'; };
// '09:30' → '9h30' (como a igreja fala) · usado quando o horário não está mais no catálogo
const rotuloHora = (h?: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h ?? '')); if (!m) return null; return m[2] === '00' ? `${Number(m[1])}h` : `${Number(m[1])}h${m[2]}`; };

const STATUS_COR: Record<string, string> = {
  pendente: 'bg-amber-500/10 text-amber-600',
  confirmado: 'bg-emerald-500/10 text-emerald-600',
  realizado: 'bg-muted text-muted-foreground',
  cancelado: 'bg-red-500/10 text-red-600',
};
const STATUS_OPCOES = ['pendente', 'confirmado', 'realizado', 'cancelado'];
const SEM_HORARIO = '__sem__';
const ORIGEM_ROTULO: Record<string, string> = { publico: 'Formulário público', app: 'App de membros', manual: 'Cadastro manual' };

type Horario = { id: string; horario: string; label: string; aberto: boolean; limite: number | null; ordem: number; inscritos?: number };

// ── Catálogo dos cultos da apresentação ─────────────────────────────────────
// Gêmeo do `BatismoHorarios` (Batismos.tsx). A diferença: no batismo a pessoa
// escolhe; aqui o SISTEMA atribui na ordem — o 1º aberto com vaga recebe.
function HorariosCard({ onChanged }: { onChanged: (lista: Horario[]) => void }) {
  const [info, setInfo] = useState<{ data_apresentacao?: string; horarios: Horario[]; sem_horario?: number }>({ horarios: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState({ horario: '', label: '', limite: '' });
  const [criando, setCriando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await api.apresentacaoHorarios.list();
      const lista: Horario[] = Array.isArray(r?.horarios) ? r.horarios : [];
      setInfo({ data_apresentacao: r?.data_apresentacao, horarios: lista, sem_horario: r?.sem_horario || 0 });
      onChanged(lista);
    } catch { toast.error('Erro ao carregar os horários da apresentação'); }
    finally { setLoading(false); }
  }, [onChanged]);
  useEffect(() => { load(); }, [load]);

  const patchLocal = (id: string, patch: Partial<Horario>) =>
    setInfo(prev => {
      const horarios = prev.horarios.map(h => (h.id === id ? { ...h, ...patch } : h));
      onChanged(horarios);
      return { ...prev, horarios };
    });

  // Otimista: muda na hora, persiste em background, reverte se falhar.
  const aplicar = async (h: Horario, body: Partial<Horario>, anterior: Partial<Horario>) => {
    setBusy(h.id);
    patchLocal(h.id, body);
    try { await api.apresentacaoHorarios.update(h.id, body); }
    catch (e: any) { patchLocal(h.id, anterior); toast.error(e?.message || 'Não foi possível atualizar'); }
    finally { setBusy(null); }
  };
  const toggleAberto = (h: Horario) => aplicar(h, { aberto: !h.aberto }, { aberto: h.aberto });
  const salvarLimite = (h: Horario, raw: string) => {
    const v = String(raw).trim();
    const n = v === '' ? null : Math.max(0, parseInt(v, 10) || 0);
    if (n === (h.limite ?? null)) return;
    aplicar(h, { limite: n }, { limite: h.limite });
  };
  const salvarLabel = (h: Horario, raw: string) => {
    const v = String(raw).trim();
    if (!v || v === h.label) return;
    aplicar(h, { label: v }, { label: h.label });
  };
  const criar = async () => {
    const horario = novo.horario.trim();
    if (!/^\d{2}:\d{2}$/.test(horario)) { toast.error('Horário no formato HH:MM (ex.: 09:30)'); return; }
    setCriando(true);
    try {
      await api.apresentacaoHorarios.create({ horario, label: novo.label.trim() || undefined, limite: novo.limite.trim() === '' ? null : parseInt(novo.limite, 10), ordem: (info.horarios.at(-1)?.ordem ?? 0) + 1 });
      setNovo({ horario: '', label: '', limite: '' });
      toast.success('Horário adicionado');
      load();
    } catch (e: any) { toast.error(e?.message || 'Erro ao adicionar horário'); }
    finally { setCriando(false); }
  };
  const remover = async (h: Horario) => {
    if (!window.confirm(`Remover "${h.label}" do catálogo? As inscrições já atribuídas a ${h.horario} continuam com esse horário.`)) return;
    setBusy(h.id);
    try { await api.apresentacaoHorarios.remove(h.id); toast.success('Horário removido'); load(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao remover'); }
    finally { setBusy(null); }
  };

  return (
    <Card className="p-3">
      <button type="button" className="w-full flex items-center justify-between gap-2 text-left" onClick={() => setAberto(v => !v)}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-fuchsia-500" /> Horários da apresentação
          <span className="text-xs font-normal text-muted-foreground">· próxima turma: {info.data_apresentacao ? fmt(info.data_apresentacao) : '—'}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Cada inscrição nova entra no <b>primeiro horário aberto com vaga</b>, nesta ordem. Vazio em "Limite" = sem teto (recebe o transbordo).
            Irmãos da mesma inscrição ficam sempre no mesmo culto. Você pode mudar o culto de qualquer criança na lista abaixo.
          </p>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : info.horarios.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhum horário cadastrado — as inscrições novas entram sem culto até você adicionar um.</p>
          ) : info.horarios.map((h, i) => {
            const lotado = h.limite != null && (h.inscritos || 0) >= h.limite;
            return (
              <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
                <span className="text-[10px] text-muted-foreground w-4">{i + 1}º</span>
                <div className="flex-1 min-w-[160px]">
                  <Input defaultValue={h.label} className="h-7 text-sm font-medium border-transparent px-1 hover:border-border focus:border-border" onBlur={(e) => salvarLabel(h, e.target.value)} title="Nome que aparece pra família (clique pra editar)" />
                  <p className="text-xs text-muted-foreground px-1">
                    {h.horario} · {h.inscritos || 0} inscrit{(h.inscritos || 0) === 1 ? 'a' : 'as'} na próxima turma
                    {h.limite != null ? ` / ${h.limite}` : ' · sem limite'}
                    {lotado && <span className="ml-1 font-medium text-red-600">· lotado</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Limite</span>
                  <Input type="number" min="0" className="w-16 h-8" defaultValue={h.limite ?? ''} placeholder="—" onBlur={(e) => salvarLimite(h, e.target.value)} />
                </div>
                <Badge variant={h.aberto ? 'default' : 'secondary'}>{h.aberto ? 'Aberto' : 'Fechado'}</Badge>
                <Button size="sm" variant={h.aberto ? 'outline' : 'default'} disabled={busy === h.id} onClick={() => toggleAberto(h)}>
                  {busy === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (h.aberto ? 'Fechar' : 'Abrir')}
                </Button>
                <button type="button" onClick={() => remover(h)} disabled={busy === h.id} className="text-muted-foreground hover:text-red-600 p-1" title="Remover do catálogo"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
          {(info.sem_horario || 0) > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {info.sem_horario} inscriç{info.sem_horario === 1 ? 'ão' : 'ões'} da próxima turma ainda sem culto — defina na lista abaixo.</p>
          )}
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-2.5">
            <div><div className="text-[10px] text-muted-foreground mb-0.5">Horário</div><Input value={novo.horario} onChange={(e) => setNovo(n => ({ ...n, horario: e.target.value }))} placeholder="09:30" className="h-8 w-20" /></div>
            <div className="flex-1 min-w-[140px]"><div className="text-[10px] text-muted-foreground mb-0.5">Nome (opcional)</div><Input value={novo.label} onChange={(e) => setNovo(n => ({ ...n, label: e.target.value }))} placeholder="Culto das 9h30" className="h-8" /></div>
            <div><div className="text-[10px] text-muted-foreground mb-0.5">Limite</div><Input type="number" min="0" value={novo.limite} onChange={(e) => setNovo(n => ({ ...n, limite: e.target.value }))} placeholder="—" className="h-8 w-16" /></div>
            <Button size="sm" onClick={criar} disabled={criando}>{criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar</>}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── A ficha: o que a pessoa preencheu ───────────────────────────────────────
function Linha({ k, v, alerta }: { k: string; v: React.ReactNode; alerta?: boolean }) {
  return (
    <div className="flex gap-2 text-sm py-1 border-b border-border/40 last:border-0">
      <span className="w-40 shrink-0 text-xs text-muted-foreground pt-0.5">{k}</span>
      <span className={`flex-1 min-w-0 break-words ${alerta ? 'text-amber-600' : ''}`}>{v ?? '—'}</span>
    </div>
  );
}
const simNao = (v: any) => (v === true ? 'Sim' : v === false ? 'Não' : 'não perguntado');
const CONSENT_ROTULO: Record<string, string> = { menor_responsavel: 'Autorização do responsável (LGPD art. 14)', imagem: 'Uso de imagem', whatsapp: 'Avisos no WhatsApp', termos_lgpd: 'Termos LGPD' };

function FichaDialog({ id, horarios, onClose, onSaved }: { id: string | null; horarios: Horario[]; onClose: () => void; onSaved: (patch: any) => void }) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [pais, setPais] = useState({ nome_pai: '', nome_mae: '' });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!id) { setD(null); return; }
    setLoading(true); setErro('');
    api.apresentacaoDetalhe(id)
      .then((r: any) => { setD(r); setPais({ nome_pai: r?.nome_pai || '', nome_mae: r?.nome_mae || '' }); })
      .catch((e: any) => setErro(e?.message || 'Não foi possível carregar a ficha'))
      .finally(() => setLoading(false));
  }, [id]);

  const paisMudaram = d && (pais.nome_pai !== (d.nome_pai || '') || pais.nome_mae !== (d.nome_mae || ''));
  const dobrado = paisIguais(d?.nome_pai, d?.nome_mae);
  const salvarPais = async () => {
    if (!id) return;
    if (paisIguais(pais.nome_pai, pais.nome_mae)) { toast.error('Pai e mãe estão com o mesmo nome. Deixe um dos campos em branco.'); return; }
    if (!pais.nome_pai.trim() && !pais.nome_mae.trim()) { toast.error('Informe ao menos um responsável.'); return; }
    setSalvando(true);
    try {
      const r: any = await api.apresentacaoUpdate(id, { nome_pai: pais.nome_pai.trim() || null, nome_mae: pais.nome_mae.trim() || null });
      setD((x: any) => ({ ...x, nome_pai: r?.nome_pai ?? null, nome_mae: r?.nome_mae ?? null }));
      onSaved({ id, nome_pai: r?.nome_pai ?? null, nome_mae: r?.nome_mae ?? null });
      toast.success('Responsáveis atualizados');
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  const hLabel = (h?: string | null) => h ? (horarios.find(x => x.horario === h)?.label || rotuloHora(h) || h) : 'sem culto definido';
  const kid = d?.crianca_kids;

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-fuchsia-500" /> Ficha da inscrição</DialogTitle>
          <DialogDescription>Tudo o que foi preenchido no formulário, como chegou. Só pai/mãe são editáveis aqui.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : erro ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600">{erro}</div>
          ) : d ? (
            <div className="space-y-4">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Inscrição</h3>
                <Linha k="Enviada em" v={fmtDataHora(d.created_at)} />
                <Linha k="Origem" v={ORIGEM_ROTULO[d.origem] || d.origem || '—'} />
                <Linha k="Turma" v={fmt(d.data_apresentacao)} />
                <Linha k="Culto" v={hLabel(d.horario_culto)} alerta={!d.horario_culto} />
                <Linha k="Status" v={<span className={`inline-block rounded px-1.5 py-0.5 text-xs capitalize ${STATUS_COR[d.status] || ''}`}>{d.status}</span>} />
                {d.observacoes && <Linha k="Observações" v={d.observacoes} />}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Criança</h3>
                <Linha k="Nome" v={d.crianca_nome} />
                <Linha k="Nascimento" v={d.crianca_data_nascimento ? `${fmt(d.crianca_data_nascimento)}${d.crianca_idade ? ` · ${d.crianca_idade} na inscrição` : ''}` : (d.crianca_idade || '—')} />
                <Linha k="Sexo" v={d.crianca_sexo ? (d.crianca_sexo === 'feminino' ? 'Feminino' : 'Masculino') : 'não informado'} />
                <Linha k="Ficha no Kids" v={kid ? <>ligada{kid.visitante ? ' · visitante' : ''}</> : (d.crianca_id ? 'ligada (ficha não carregou)' : 'não ligada')} alerta={!d.crianca_id} />
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Responsáveis</h3>
                {dobrado && (
                  <div className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Pai e mãe estão com o <b>mesmo nome</b> — provavelmente a pessoa preencheu o próprio nome nos dois campos. A lista e o certificado já mostram uma vez só; se quiser, apague um dos campos abaixo.</span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><div className="text-[11px] text-muted-foreground mb-0.5">Nome do pai</div><Input value={pais.nome_pai} onChange={(e) => setPais(p => ({ ...p, nome_pai: e.target.value }))} className="h-8" placeholder="—" /></div>
                  <div><div className="text-[11px] text-muted-foreground mb-0.5">Nome da mãe</div><Input value={pais.nome_mae} onChange={(e) => setPais(p => ({ ...p, nome_mae: e.target.value }))} className="h-8" placeholder="—" /></div>
                </div>
                {paisMudaram && (
                  <div className="flex justify-end mt-2">
                    <Button size="sm" onClick={salvarPais} disabled={salvando}>{salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar responsáveis'}</Button>
                  </div>
                )}
                <div className="mt-2">
                  <Linha k="Telefone" v={fmtTel(d.telefone)} />
                  <Linha k="CPF do responsável" v={fmtCpf(d.cpf_responsavel)} />
                  <Linha k="E-mail" v={d.email || '—'} />
                  <Linha k="Endereço" v={d.endereco || '—'} />
                  <Linha k="No cadastro da igreja" v={d.responsavel_membro ? `${d.responsavel_membro.nome}${d.responsavel_membro.status ? ` · ${d.responsavel_membro.status}` : ''}` : 'não ligado a nenhum cadastro'} alerta={!d.responsavel_membro} />
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Saúde e inclusão (ficha do Kids)</h3>
                {kid ? (
                  <>
                    <Linha k="Alergia" v={`${simNao(kid.tem_alergia)}${kid.alergia_qual ? ` · ${kid.alergia_qual}` : ''}`} />
                    <Linha k="Espectro autista" v={`${simNao(kid.tem_espectro)}${kid.espectro_qual ? ` · ${kid.espectro_qual}` : ''}`} alerta={kid.tem_espectro === true} />
                    <Linha k="Limitação física" v={`${simNao(kid.tem_limitacao_fisica)}${kid.limitacao_fisica_qual ? ` · ${kid.limitacao_fisica_qual}` : ''}`} alerta={kid.tem_limitacao_fisica === true} />
                  </>
                ) : <p className="text-sm text-muted-foreground">Sem ficha ligada no Kids — as respostas de saúde ficam na ficha da criança.</p>}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Consentimentos registrados</h3>
                {Array.isArray(d.consentimentos) && d.consentimentos.length > 0 ? d.consentimentos.map((c: any, i: number) => (
                  <Linha key={i} k={CONSENT_ROTULO[c.tipo] || c.tipo} v={<>{c.aceito ? <span className="text-emerald-600">aceito</span> : <span className="text-muted-foreground">não aceito</span>} <span className="text-xs text-muted-foreground">· {fmtDataHora(c.em)}</span></>} />
                )) : <p className="text-sm text-muted-foreground">Nenhum consentimento registrado (inscrição anterior ao contrato de 28/07/2026, ou feita pelo app).</p>}
              </section>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── A página ────────────────────────────────────────────────────────────────
export default function ApresentacaoCriancas() {
  const navigate = useNavigate();
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [generos, setGeneros] = useState<Record<string, 'menino' | 'menina'>>({});
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [gerandoLote, setGerandoLote] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [fichaId, setFichaId] = useState<string | null>(null);

  const toggleSel = (id: string) => setSelecionados(s => ({ ...s, [id]: !s[id] }));

  // O certificado escreve "filha"/"filho" — o sexo da inscrição decide, e o
  // seletor manual continua existindo pra linha antiga sem sexo.
  const generoDe = (b: any): 'menino' | 'menina' => generos[b.id] || (b.crianca_sexo === 'feminino' ? 'menina' : 'menino');

  const itemParaCert = (b: any) => ({
    criancaNome: b.crianca_nome,
    nomePai: b.nome_pai,
    nomeMae: b.nome_mae,
    dataApresentacao: b.data_apresentacao,
    genero: generoDe(b),
  });

  const gerarCert = async (b: any) => {
    setGerandoId(b.id);
    try { await gerarCertificadoApresentacao(itemParaCert(b)); }
    catch (e: any) { toast.error(e?.message || 'Erro ao gerar certificado'); }
    finally { setGerandoId(null); }
  };

  const gerarLote = async () => {
    const escolhidos = lista.filter(b => selecionados[b.id]);
    const semData = escolhidos.filter(b => !b.data_apresentacao);
    const prontos = escolhidos.filter(b => b.data_apresentacao);
    if (prontos.length === 0) { toast.error('Defina a data da turma das crianças selecionadas antes de gerar.'); return; }
    setGerandoLote(true);
    setProgresso({ feitos: 0, total: prontos.length });
    try {
      const n = await gerarCertificadosApresentacaoLote(prontos.map(itemParaCert), { onProgresso: (feitos, total) => setProgresso({ feitos, total }) });
      if (semData.length > 0) toast.success(`${n} certificado${n !== 1 ? 's' : ''} baixado${n !== 1 ? 's' : ''} · ${semData.length} sem data ficaram de fora`);
      else toast.success(`${n} certificado${n !== 1 ? 's' : ''} baixado${n !== 1 ? 's' : ''} num único .zip`);
    } catch (e: any) { toast.error(e?.message || 'Erro ao gerar certificados'); }
    finally { setGerandoLote(false); setProgresso(null); }
  };

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api.apresentacoes()
      .then((d: any) => setLista(Array.isArray(d) ? d : []))
      .catch(() => { if (!silent) toast.error('Erro ao carregar'); })
      .finally(() => { if (!silent) setLoading(false); });
  };
  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 20000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, []);

  const patchLinha = (id: string, patch: any) => setLista(l => l.map(x => (x.id === id ? { ...x, ...patch } : x)));

  const mudarStatus = async (id: string, status: string) => {
    try { await api.apresentacaoUpdate(id, { status }); patchLinha(id, { status }); toast.success('Status atualizado'); }
    catch { toast.error('Erro ao atualizar'); }
  };
  const mudarData = async (id: string, data_apresentacao: string) => {
    if (!data_apresentacao) return;
    try { await api.apresentacaoUpdate(id, { data_apresentacao }); patchLinha(id, { data_apresentacao }); toast.success('Turma (data) atualizada'); }
    catch { toast.error('Erro ao atualizar data'); }
  };
  const mudarHorario = async (id: string, v: string) => {
    const horario_culto = v === SEM_HORARIO ? null : v;
    const anterior = lista.find(x => x.id === id)?.horario_culto ?? null;
    patchLinha(id, { horario_culto });
    try { await api.apresentacaoUpdate(id, { horario_culto }); toast.success(horario_culto ? 'Culto atualizado' : 'Culto removido'); }
    catch (e: any) { patchLinha(id, { horario_culto: anterior }); toast.error(e?.message || 'Erro ao atualizar o culto'); }
  };

  const hLabel = (h?: string | null) => h ? (horarios.find(x => x.horario === h)?.label || rotuloHora(h) || h) : null;
  // Opções do seletor: o catálogo + qualquer horário já gravado que saiu do catálogo
  const opcoesHorario = useMemo(() => {
    const set = new Map<string, string>();
    horarios.forEach(h => set.set(h.horario, h.label));
    lista.forEach(b => { if (b.horario_culto && !set.has(b.horario_culto)) set.set(b.horario_culto, `${rotuloHora(b.horario_culto) || b.horario_culto} (fora do catálogo)`); });
    return [...set.entries()];
  }, [horarios, lista]);

  const formUrl = `${window.location.origin}/apresentacao-criancas`;
  const [copiado, setCopiado] = useState(false);
  const copiarLink = async () => {
    try { await navigator.clipboard.writeText(formUrl); setCopiado(true); setTimeout(() => setCopiado(false), 2000); toast.success('Link copiado'); }
    catch { toast.error('Não consegui copiar'); }
  };
  const compartilharWpp = () => {
    const texto = `Inscreva sua criança para a Apresentação de Crianças na CBRio: ${formUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  };

  const t = busca.trim().toLowerCase();
  const filtradas = lista.filter((b) =>
    !t || `${b.crianca_nome || ''} ${b.nome_pai || ''} ${b.nome_mae || ''} ${b.telefone || ''}`.toLowerCase().includes(t));

  // Agrupa por turma (data_apresentacao) · mais recente primeiro
  const grupos = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtradas.forEach((b) => { const k = b.data_apresentacao || 'sem-data'; (map[k] = map[k] || []).push(b); });
    return Object.entries(map).sort((a, b) => {
      if (a[0] === 'sem-data') return 1;
      if (b[0] === 'sem-data') return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [filtradas]);

  // "9h30: 4 · 11h30: 2 · sem culto: 1" no cabeçalho da turma
  const resumoHorarios = (items: any[]) => {
    const c: Record<string, number> = {};
    items.forEach(b => { if (b.status === 'cancelado') return; const k = b.horario_culto || SEM_HORARIO; c[k] = (c[k] || 0) + 1; });
    const partes = Object.entries(c)
      .sort(([a], [b]) => (a === SEM_HORARIO ? 1 : b === SEM_HORARIO ? -1 : a.localeCompare(b)))
      .map(([k, n]) => `${k === SEM_HORARIO ? 'sem culto' : (hLabel(k) || k)}: ${n}`);
    return partes.join(' · ');
  };

  const idsSelecionados = useMemo(() => Object.keys(selecionados).filter(id => selecionados[id]), [selecionados]);
  const totalSel = idsSelecionados.length;
  const toggleTurma = (items: any[], marcar: boolean) => {
    setSelecionados(s => { const novo = { ...s }; items.forEach(b => { novo[b.id] = marcar; }); return novo; });
  };
  const turmaTodaMarcada = (items: any[]) => items.length > 0 && items.every(b => selecionados[b.id]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate('/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Kids</button>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Baby className="h-5 w-5 text-fuchsia-500" /> Apresentação de Crianças</h1>
        <p className="text-sm text-muted-foreground">Inscrições do formulário público e do app (sempre no 2º domingo do mês), separadas por turma. O culto de cada criança é definido no envio e pode ser ajustado aqui.</p>
      </div>

      <Card className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium">Link do formulário de inscrição</div>
          <a href={formUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary truncate block">{formUrl}</a>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={copiarLink} className="inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-2.5 py-1.5 hover:bg-muted transition-colors">
            {copiado ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} {copiado ? 'Copiado' : 'Copiar link'}
          </button>
          <button onClick={compartilharWpp} className="inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 text-white transition-opacity hover:opacity-90" style={{ background: '#25D366' }}>
            <Share2 className="h-3.5 w-3.5" /> Compartilhar no WhatsApp
          </button>
        </div>
      </Card>

      <HorariosCard onChanged={setHorarios} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar criança, pai, mãe ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtradas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma inscrição de apresentação no momento.</Card>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{filtradas.length} inscriç{filtradas.length !== 1 ? 'ões' : 'ão'} · {grupos.length} turma{grupos.length !== 1 ? 's' : ''}</div>
          {grupos.map(([data, items]) => (
            <div key={data} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Selecionar toda a turma">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[#407F96] cursor-pointer" checked={turmaTodaMarcada(items)} onChange={(e) => toggleTurma(items, e.target.checked)} />
                  <span className="text-sm font-semibold">{data === 'sem-data' ? 'Sem data definida' : `Turma · ${fmt(data)}`}</span>
                </label>
                <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {resumoHorarios(items) || '—'}</span>
              </div>
              {items.map((b) => {
                const pais = nomesDosPaisUnicos(b.nome_pai, b.nome_mae);
                const dobrado = paisIguais(b.nome_pai, b.nome_mae);
                return (
                  <Card key={b.id} className={`p-3 flex flex-col gap-2 ${selecionados[b.id] ? 'ring-1 ring-[#407F96]/50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" className="h-4 w-4 mt-3 accent-[#407F96] cursor-pointer shrink-0" checked={!!selecionados[b.id]} onChange={() => toggleSel(b.id)} title="Selecionar para baixar em lote" />
                      <div className="h-10 w-10 rounded-full bg-fuchsia-500/10 flex items-center justify-center shrink-0"><Baby className="h-5 w-5 text-fuchsia-500" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{b.crianca_nome}{b.crianca_idade ? ` · ${b.crianca_idade}` : ''}</div>
                        <div className="text-xs text-muted-foreground truncate" title={dobrado ? 'Pai e mãe vieram com o mesmo nome no formulário — mostrando uma vez. Abra a ficha pra corrigir.' : undefined}>
                          {pais.join(' / ') || '—'}
                          {dobrado && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {b.horario_culto ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 text-fuchsia-700 px-2 py-0.5 text-[11px]"><Clock className="h-3 w-3" /> {hLabel(b.horario_culto)}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 px-2 py-0.5 text-[11px]"><AlertTriangle className="h-3 w-3" /> sem culto definido</span>
                          )}
                          {b.origem && b.origem !== 'publico' && <span className="text-[10px] text-muted-foreground">{ORIGEM_ROTULO[b.origem] || b.origem}</span>}
                          {b.observacoes && <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">{b.observacoes}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
                        <DatePicker value={b.data_apresentacao || ''} onChange={(v) => mudarData(b.id, v)} className="h-7 text-[11px] rounded-md border border-border bg-background px-1.5 text-muted-foreground" />
                        <Select value={b.horario_culto || SEM_HORARIO} onValueChange={(v) => mudarHorario(b.id, v)}>
                          <SelectTrigger className="h-7 text-[11px] w-[140px]" title="Culto em que a criança será apresentada"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM_HORARIO} className="text-xs">Sem culto</SelectItem>
                            {opcoesHorario.map(([h, label]) => <SelectItem key={h} value={h} className="text-xs">{label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={b.status || 'pendente'} onValueChange={(v) => mudarStatus(b.id, v)}>
                          <SelectTrigger className={`h-7 text-[11px] w-[120px] ${STATUS_COR[b.status] || ''}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPCOES.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {hrefWhatsapp(b.telefone) && (
                          <a href={hrefWhatsapp(b.telefone)!} target="_blank" rel="noopener noreferrer" className="text-emerald-600" title="Falar com a família no seu WhatsApp"><Phone className="h-4 w-4" /></a>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-end border-t border-border/50 pt-2">
                      <button onClick={() => setFichaId(b.id)} className="inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-2.5 py-1.5 hover:bg-muted transition-colors mr-auto" title="Ver tudo o que a pessoa preencheu no formulário">
                        <FileText className="h-3.5 w-3.5" /> Ver ficha
                      </button>
                      <select value={generoDe(b)} onChange={(e) => setGeneros(g => ({ ...g, [b.id]: e.target.value as 'menino' | 'menina' }))} title="Usado na concordância do certificado (filho/filha)" className="h-7 text-[11px] rounded-md border border-border bg-background px-1.5">
                        <option value="menino">Menino</option>
                        <option value="menina">Menina</option>
                      </select>
                      <button onClick={() => gerarCert(b)} disabled={gerandoId === b.id || !b.data_apresentacao} title={!b.data_apresentacao ? 'Defina a data da apresentação primeiro' : 'Gerar certificado (.pptx)'} className="inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: '#407F96' }}>
                        {gerandoId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Award className="h-3.5 w-3.5" />} Gerar certificado
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <FichaDialog id={fichaId} horarios={horarios} onClose={() => setFichaId(null)} onSaved={(p) => patchLinha(p.id, p)} />

      {totalSel > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
            <span className="text-xs text-muted-foreground">{progresso ? `Gerando ${progresso.feitos}/${progresso.total}...` : `${totalSel} selecionada${totalSel !== 1 ? 's' : ''}`}</span>
            <button onClick={() => setSelecionados({})} disabled={gerandoLote} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">Limpar</button>
            <button onClick={gerarLote} disabled={gerandoLote} className="inline-flex items-center gap-1.5 text-xs rounded-full px-3.5 py-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: '#407F96' }}>
              {gerandoLote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Baixar certificados (.zip)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
