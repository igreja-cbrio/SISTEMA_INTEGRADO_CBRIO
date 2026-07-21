// Kids · Gestão de crianças — lista com filtro por idade/status, cadastro manual,
// desativar, e ficha completa com aba de Atendimentos (histórico de contatos).
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { totemKids as api } from '../../../api';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { hrefConversa } from '@/lib/conversas';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { toast } from 'sonner';
import { Baby, Search, Plus, Loader2, AlertCircle, Phone, Trash2, UserX, UserCheck, ArrowLeft, Camera, X, Copy, Sparkles, Pencil } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import DataNascimentoPicker from './DataNascimentoPicker';
import useConfirmarSaida from '../../../hooks/useConfirmarSaida';

const FAIXAS = [
  { key: 'todas', label: 'Todas as idades', min: 0, max: 9999 },
  { key: '0-2', label: '0–2 anos', min: 0, max: 35 },
  { key: '3-5', label: '3–5 anos', min: 36, max: 71 },
  { key: '6-8', label: '6–8 anos', min: 72, max: 107 },
  { key: '9-12', label: '9–12 anos', min: 108, max: 155 },
];
const TIPO_ATEND: Record<string, string> = {
  contato: 'Contato', ausencia: 'Ausência', saude: 'Saúde', observacao: 'Observação', outro: 'Outro',
};
const fmt = (d?: string | null) => { if (!d) return '—'; try { return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR'); } catch { return d; } };

export default function GestaoCriancas() {
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [faixa, setFaixa] = useState('todas');
  const [status, setStatus] = useState('ativos'); // ativos | inativos
  const [jornadaF, setJornadaF] = useState('todas'); // todas | convertidos | batizados
  const [modo, setModo] = useState<'lista' | 'faltantes'>('lista');
  const [ausentes, setAusentes] = useState<any[]>([]);
  const [loadingAus, setLoadingAus] = useState(false);
  const [sel, setSel] = useState<any>(null);     // criança aberta na ficha
  const [novoOpen, setNovoOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const cid = searchParams.get('crianca');
    if (cid) setSel({ id: cid });
  }, [searchParams]);

  const carregar = useCallback(() => {
    setLoading(true);
    api.criancas.list({ ativo: status === 'ativos' })
      .then((d: any) => setLista(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Erro ao carregar crianças'))
      .finally(() => setLoading(false));
  }, [status]);
  useEffect(() => { carregar(); }, [carregar]);

  const carregarAusentes = useCallback(() => {
    setLoadingAus(true);
    api.ausentes(3)
      .then((d: any) => setAusentes(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Erro ao carregar crianças faltantes'))
      .finally(() => setLoadingAus(false));
  }, []);
  useEffect(() => { if (modo === 'faltantes') carregarAusentes(); }, [modo, carregarAusentes]);

  const filtradas = useMemo(() => {
    const f = FAIXAS.find(x => x.key === faixa)!;
    const t = busca.trim().toLowerCase();
    return lista.filter(c => {
      const m = c.idade_meses;
      if (faixa !== 'todas' && (m == null || m < f.min || m > f.max)) return false;
      if (t) {
        const resp = (c.responsaveis || []).map((r: any) => r.membro?.nome || '').join(' ');
        if (!(`${c.nome} ${resp}`.toLowerCase().includes(t))) return false;
      }
      if (jornadaF === 'convertidos' && !c.data_conversao) return false;
      if (jornadaF === 'batizados' && !c.data_batismo) return false;
      return true;
    });
  }, [lista, faixa, busca, status, jornadaF]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate('/ministerial/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao hub do Kids</button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Baby className="h-5 w-5 text-primary" /> Crianças do Kids</h1>
          <p className="text-sm text-muted-foreground">Gerencie cada criança · ficha, atendimentos, desativar.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDupOpen(true)}><Copy className="h-4 w-4 mr-1" /> Duplicados</Button>
          <Button onClick={() => setNovoOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova criança</Button>
        </div>
      </div>

      {/* Alternância · lista completa × crianças faltando */}
      <div className="flex rounded-lg border bg-muted/40 p-0.5 w-fit">
        <button type="button" onClick={() => setModo('lista')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${modo === 'lista' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Baby className="h-4 w-4" /> Todas as crianças
        </button>
        <button type="button" onClick={() => setModo('faltantes')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${modo === 'faltantes' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <AlertCircle className="h-4 w-4" /> Faltando 3+ cultos{ausentes.length > 0 && modo !== 'faltantes' ? ` (${ausentes.length})` : ''}
        </button>
      </div>

      {modo === 'faltantes' ? (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs text-muted-foreground">
                Crianças frequentadoras ativas que ficaram <b>3+ cultos seguidos sem check-in</b> (última presença nos últimos 90 dias). Vale um contato com a família. A frequência vem dos check-ins do totem.
              </p>
            </div>
            {loadingAus ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : ausentes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma criança faltando 3+ cultos. 🎉</p>
            ) : (
              <div className="space-y-2">
                {ausentes.map(a => {
                  const resp = (a.responsaveis || []).find((r: any) => r.telefone) || (a.responsaveis || [])[0];
                  const tel = resp?.telefone ? String(resp.telefone).replace(/\D/g, '') : null;
                  const telFull = tel ? (tel.length <= 11 && !tel.startsWith('55') ? '55' + tel : tel) : null;
                  return (
                    <div key={a.crianca_id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                      <button onClick={() => setSel({ id: a.crianca_id })} className="flex-1 min-w-0 text-left">
                        <div className="font-medium text-sm truncate">{a.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="text-amber-600 font-medium">{a.cultos_perdidos} cultos sem vir</span>
                          {a.ultima_presenca ? ` · última presença ${new Date(a.ultima_presenca + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                          {resp?.nome ? ` · ${resp.nome}` : ''}
                        </div>
                      </button>
                      {telFull && (
                        <Link to={hrefConversa(telFull)}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 shrink-0" title={`WhatsApp de ${resp?.nome || 'responsável'}`}>
                          <Phone className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
      <>
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome da criança ou responsável..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={faixa} onValueChange={setFaixa}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{FAIXAS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativos">Ativos</SelectItem>
            <SelectItem value="inativos">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={jornadaF} onValueChange={setJornadaF}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda a jornada</SelectItem>
            <SelectItem value="convertidos">Convertidos</SelectItem>
            <SelectItem value="batizados">Batizados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground mb-2">{filtradas.length} criança{filtradas.length !== 1 ? 's' : ''}</div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma criança nesse filtro.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filtradas.map(c => {
                const resp = (c.responsaveis || [])[0]?.membro;
                return (
                  <button key={c.id} onClick={() => setSel(c)} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-left hover:border-primary/40 transition-colors">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                      {c.foto_url ? <img src={c.foto_url} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-bold text-primary">{c.nome?.charAt(0) || '?'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{c.nome}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.idade_label || '—'}{resp ? ` · ${resp.nome}` : ''}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {c.necessidades_especiais && <AlertCircle className="h-4 w-4 text-amber-500" />}
                      {c.visitante && <Badge variant="secondary" className="text-[10px]">visitante</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {sel && <FichaCrianca criancaId={sel.id} onClose={() => { setSel(null); if (searchParams.get('crianca')) setSearchParams({}, { replace: true }); }} onChanged={carregar} />}
      {novoOpen && <NovaCrianca onClose={() => setNovoOpen(false)} onCreated={() => { setNovoOpen(false); carregar(); }} />}
      {dupOpen && <DuplicadosModal onClose={() => setDupOpen(false)} onMerged={carregar} />}
    </div>
  );
}

// Relações do visitante temporário (mesmos slugs do banco · exibe com acento)
const RELACAO_LABEL: Record<string, string> = { amigo: 'Amigo', primo: 'Primo', vizinho: 'Vizinho', irmao: 'Irmão', outros: 'Outros' };

// ── Ficha da criança (Dados + Atendimentos) ──────────────────────────────────
function FichaCrianca({ criancaId, onClose, onChanged }: { criancaId: string; onClose: () => void; onChanged: () => void }) {
  const navigate = useNavigate();
  const [c, setC] = useState<any>(null);
  const [aba, setAba] = useState<'dados' | 'frequencia' | 'atendimentos'>('dados');
  const [atend, setAtend] = useState<any[]>([]);
  const [novoTipo, setNovoTipo] = useState('contato');
  const [novoDesc, setNovoDesc] = useState('');
  const [novoData, setNovoData] = useState(new Date().toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<any>({});
  const [promovendo, setPromovendo] = useState(false);

  // Visitante → frequentador em 1 clique (limpa prazo/relação · definitivo).
  async function tornarFrequentador() {
    setPromovendo(true);
    try {
      await api.criancas.tornarFrequentador(criancaId);
      toast.success('Agora é frequentador — o cadastro não expira mais.');
      load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao tornar frequentador');
    } finally { setPromovendo(false); }
  }

  function iniciarEdicao() {
    setForm({
      nome: c.nome || '',
      data_nascimento: c.data_nascimento || '',
      sexo: c.sexo || '',
      serie: c.serie || '',
      data_conversao: c.data_conversao || '',
      data_batismo: c.data_batismo || '',
      visitante: !!c.visitante,
      visitante_relacao: c.visitante_relacao || '',
      consent_marketing: c.consent_marketing === true,
      tem_alergia: !!c.tem_alergia,
      alergia_qual: c.alergia_qual || '',
      tem_espectro: !!c.tem_espectro,
      espectro_qual: c.espectro_qual || '',
      tem_limitacao_fisica: !!c.tem_limitacao_fisica,
      limitacao_fisica_qual: c.limitacao_fisica_qual || '',
      necessidades_especiais: c.necessidades_especiais || '',
      observacoes_medicas: c.observacoes_medicas || '',
    });
    setEditando(true);
  }

  async function salvarEdicao() {
    if (!form.nome?.trim()) { toast.error('O nome é obrigatório'); return; }
    setSalvando(true);
    try {
      const payload = {
        ...form,
        nome: form.nome.trim(),
        data_nascimento: form.data_nascimento || null,
        sexo: form.sexo || null,
        visitante_relacao: form.visitante ? (form.visitante_relacao || null) : null,
        serie: form.serie?.trim() || null,
        data_conversao: form.data_conversao || null,
        data_batismo: form.data_batismo || null,
        alergia_qual: form.tem_alergia ? (form.alergia_qual?.trim() || null) : null,
        espectro_qual: form.tem_espectro ? (form.espectro_qual?.trim() || null) : null,
        limitacao_fisica_qual: form.tem_limitacao_fisica ? (form.limitacao_fisica_qual?.trim() || null) : null,
        necessidades_especiais: form.necessidades_especiais?.trim() || null,
        observacoes_medicas: form.observacoes_medicas?.trim() || null,
      };
      await api.criancas.update(criancaId, payload);
      // Otimista (Marcos 2026-07-20): reflete a edição na ficha NA HORA, sem
      // esperar o re-fetch do load() — que segue em segundo plano reconciliando.
      setC((prev: any) => (prev ? { ...prev, ...payload } : prev));
      toast.success('Ficha atualizada');
      setEditando(false);
      load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  const load = useCallback(() => {
    api.criancas.get(criancaId).then(setC).catch(() => toast.error('Erro ao abrir ficha'));
    api.criancas.atendimentos(criancaId).then((d: any) => setAtend(Array.isArray(d) ? d : [])).catch(() => {});
  }, [criancaId]);
  useEffect(() => { load(); }, [load]);

  async function addAtend() {
    if (!novoDesc.trim()) { toast.error('Descreva o atendimento'); return; }
    setSalvando(true);
    try { await api.criancas.addAtendimento(criancaId, { tipo: novoTipo, descricao: novoDesc, data: novoData }); setNovoDesc(''); load(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setSalvando(false); }
  }
  async function delAtend(id: string) {
    try { await api.criancas.removeAtendimento(id); load(); } catch (e: any) { toast.error(e?.message || 'Erro'); }
  }
  async function toggleAtivo() {
    const inativar = c.ativo;
    if (inativar && !window.confirm('Desativar o cadastro desta criança?')) return;
    try {
      await api.criancas.inativar(criancaId, inativar ? { motivo: 'Desativado manualmente' } : { ativo: true });
      toast.success(inativar ? 'Cadastro desativado' : 'Cadastro reativado');
      load(); onChanged();
    } catch (e: any) { toast.error(e?.message || 'Erro'); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FotoAvatar crianca={c} onChanged={load} />
            <div className="min-w-0">
              <div className="truncate">{c?.nome || '...'}</div>
              <div className="text-xs font-normal text-muted-foreground">{c?.idade_label || ''}{c?.sala_sugerida ? ` · ${c.sala_sugerida.nome || ''}` : ''}{c && !c.ativo ? ' · inativo' : ''}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
        {/* Abas */}
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30 text-xs">
          {(['dados', 'frequencia', 'atendimentos'] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} className={`px-3 py-1.5 rounded-md transition-colors ${aba === a ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>
              {a === 'dados' ? 'Dados' : a === 'frequencia' ? 'Frequência' : `Atendimentos (${atend.length})`}
            </button>
          ))}
        </div>

        {!c ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : aba === 'dados' ? (
          editando ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <label className="col-span-2 text-xs">Nome
                <Input className="mt-0.5 h-9" value={form.nome} onChange={e => setForm((f: any) => ({ ...f, nome: e.target.value }))} />
              </label>
              <label className="text-xs">Nascimento
                <Input type="date" className="mt-0.5 h-9" value={form.data_nascimento || ''} onChange={e => setForm((f: any) => ({ ...f, data_nascimento: e.target.value }))} />
              </label>
              <label className="text-xs">Sexo
                <Select value={form.sexo || ''} onValueChange={v => setForm((f: any) => ({ ...f, sexo: v }))}>
                  <SelectTrigger className="mt-0.5 h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="M">Menino</SelectItem><SelectItem value="F">Menina</SelectItem></SelectContent>
                </Select>
              </label>
              <label className="text-xs">Série
                <Input className="mt-0.5 h-9" value={form.serie || ''} onChange={e => setForm((f: any) => ({ ...f, serie: e.target.value }))} />
              </label>
              <label className="text-xs">Tipo
                <Select value={form.visitante ? 'visitante' : 'membro'} onValueChange={v => setForm((f: any) => ({ ...f, visitante: v === 'visitante' }))}>
                  <SelectTrigger className="mt-0.5 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="visitante">Visitante</SelectItem><SelectItem value="membro">Frequentador</SelectItem></SelectContent>
                </Select>
              </label>
              {form.visitante && (
                <label className="text-xs">Visitante de quem?
                  <Select value={form.visitante_relacao || ''} onValueChange={v => setForm((f: any) => ({ ...f, visitante_relacao: v }))}>
                    <SelectTrigger className="mt-0.5 h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RELACAO_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              )}
              <label className="text-xs">Conversão
                <Input type="date" className="mt-0.5 h-9" value={form.data_conversao || ''} onChange={e => setForm((f: any) => ({ ...f, data_conversao: e.target.value }))} />
              </label>
              <label className="text-xs">Batismo
                <Input type="date" className="mt-0.5 h-9" value={form.data_batismo || ''} onChange={e => setForm((f: any) => ({ ...f, data_batismo: e.target.value }))} />
              </label>
            </div>
            <label className="flex items-start gap-2 text-xs rounded-md border border-border p-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={!!form.consent_marketing} onChange={e => setForm((f: any) => ({ ...f, consent_marketing: e.target.checked }))} />
              <span>Autoriza o <b>uso da imagem da criança</b> para divulgação/marketing da igreja (fotos e vídeos em redes sociais, site, etc.)</span>
            </label>
            <div className="rounded-md border border-border p-2 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Saúde</div>
              {([
                ['tem_alergia', 'alergia_qual', 'Alergia'],
                ['tem_espectro', 'espectro_qual', 'Espectro autista'],
                ['tem_limitacao_fisica', 'limitacao_fisica_qual', 'Limitação física / deficiência'],
              ] as const).map(([bk, qk, label]) => (
                <div key={bk} className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs w-52 shrink-0">
                    <input type="checkbox" checked={!!form[bk]} onChange={e => setForm((f: any) => ({ ...f, [bk]: e.target.checked }))} />
                    {label}
                  </label>
                  <Input className="h-8 flex-1" placeholder="Qual? (opcional)" disabled={!form[bk]} value={form[qk] || ''} onChange={e => setForm((f: any) => ({ ...f, [qk]: e.target.value }))} />
                </div>
              ))}
              <label className="block text-xs">Necessidades específicas
                <Input className="mt-0.5 h-9" value={form.necessidades_especiais || ''} onChange={e => setForm((f: any) => ({ ...f, necessidades_especiais: e.target.value }))} />
              </label>
              <label className="block text-xs">Mais informações
                <Textarea rows={2} className="mt-0.5" value={form.observacoes_medicas || ''} onChange={e => setForm((f: any) => ({ ...f, observacoes_medicas: e.target.value }))} />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
              <Button size="sm" onClick={salvarEdicao} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
            </div>
          </div>
          ) : (
          <div className="space-y-3 text-sm">
            <div className="flex justify-end -mb-1">
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={iniciarEdicao}>
                <Pencil className="h-3.5 w-3.5" /> Editar informações
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <CampoSempre label="Nascimento" v={c.data_nascimento ? fmt(c.data_nascimento) : ''} />
              <CampoSempre label="Idade" v={c.idade_label} />
              <CampoSempre label="Sexo" v={c.sexo === 'M' ? 'Menino' : c.sexo === 'F' ? 'Menina' : c.sexo || ''} />
              <CampoSempre label="Série" v={c.serie} />
              <CampoSempre label="Conversão" v={c.data_conversao ? fmt(c.data_conversao) : ''} />
              <CampoSempre label="Batismo" v={c.data_batismo ? fmt(c.data_batismo) : ''} />
              <CampoSempre label="Tipo" v={c.visitante ? `Visitante${c.visitante_relacao ? ` (${RELACAO_LABEL[c.visitante_relacao] || c.visitante_relacao})` : ''}` : 'Frequentador'} />
              <CampoSempre label="Uso de imagem" v={c.consent_marketing == null ? '' : (c.consent_marketing ? 'Autorizado' : 'Não autorizado')} />
            </div>
            {/* Visitante temporário (Marcos 2026-07-20): prazo visível + promoção
                em 1 clique, sem depender de sessão aberta no totem. */}
            {c.visitante && (
              <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2.5 space-y-1.5">
                <div className="text-xs text-amber-800 dark:text-amber-300">
                  <b>Visitante</b>{c.visitante_relacao ? ` · ${RELACAO_LABEL[c.visitante_relacao] || c.visitante_relacao}` : ''}
                  {c.data_limite ? <> · aparece no check-in até <b>{fmt(c.data_limite)}</b> (some da lista se não voltar)</> : null}
                  {' '}— se voltar em outro dia, vira frequentador sozinha.
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={promovendo} onClick={tornarFrequentador}>
                  {promovendo ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <UserCheck className="h-3.5 w-3.5 mr-1" />} Tornar frequentador
                </Button>
              </div>
            )}
            <div className="rounded-md border border-border p-2 space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">Saúde</div>
              <LinhaSaude label="Alergia" tem={c.tem_alergia} qual={c.alergia_qual} />
              <LinhaSaude label="Espectro autista" tem={c.tem_espectro} qual={c.espectro_qual} />
              <LinhaSaude label="Limitação física / deficiência" tem={c.tem_limitacao_fisica} qual={c.limitacao_fisica_qual} />
              <div className="text-xs"><span className="text-muted-foreground">Necessidades específicas: </span>{c.necessidades_especiais || <span className="italic text-muted-foreground">— a preencher</span>}</div>
              <div className="text-xs"><span className="text-muted-foreground">Mais informações: </span>{c.observacoes_medicas || <span className="italic text-muted-foreground">— a preencher</span>}</div>
            </div>
                        <ResponsaveisManager crianca={c} onChanged={load} />
            <div className="pt-1">
              <Button variant={c.ativo ? 'outline' : 'default'} size="sm" onClick={toggleAtivo}>
                {c.ativo ? <><UserX className="h-4 w-4 mr-1" /> Desativar cadastro</> : <><UserCheck className="h-4 w-4 mr-1" /> Reativar</>}
              </Button>
              {!c.ativo && c.motivo_inativacao && <p className="text-xs text-muted-foreground mt-1">Motivo: {c.motivo_inativacao}</p>}
            </div>
          </div>
          )
        ) : aba === 'frequencia' ? (
          <JornadaTab criancaId={criancaId} c={c} onChanged={() => { load(); onChanged(); }} />
        ) : (
          <div className="space-y-3">
            {/* Novo atendimento */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex gap-2">
                <Select value={novoTipo} onValueChange={setNovoTipo}>
                  <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPO_ATEND).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="date" className="w-40 h-9" value={novoData} onChange={e => setNovoData(e.target.value)} />
              </div>
              <Textarea rows={2} placeholder="Ex.: ligamos para a mãe, criança está doente, volta semana que vem." value={novoDesc} onChange={e => setNovoDesc(e.target.value)} />
              <Button size="sm" onClick={addAtend} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar atendimento'}</Button>
            </div>
            {/* Histórico */}
            {atend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum atendimento registrado.</p>
            ) : atend.map(a => (
              <div key={a.id} className="rounded-md border border-border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary">{TIPO_ATEND[a.tipo] || a.tipo}</Badge>
                    <span className="text-muted-foreground">{fmt(a.data)}</span>
                  </div>
                  <button onClick={() => delAtend(a.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{a.descricao}</p>
                {a.registrado_por_nome && <p className="text-[11px] text-muted-foreground mt-1">por {a.registrado_por_nome}</p>}
              </div>
            ))}
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FotoAvatar({ crianca, onChanged }: { crianca: any; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(e: any) {
    const file = e.target.files?.[0]; if (!file || !crianca?.id) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Imagem muito grande (máx 5MB)'); return; }
    setBusy(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      await api.criancas.uploadFoto(crianca.id, dataUrl);
      toast.success('Foto atualizada'); onChanged();
    } catch (err: any) { toast.error(err?.message || 'Erro ao enviar a foto'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  }
  async function remover() {
    if (!crianca?.id || !window.confirm('Remover a foto da criança?')) return;
    setBusy(true);
    try { await api.criancas.removeFoto(crianca.id); toast.success('Foto removida'); onChanged(); }
    catch (err: any) { toast.error(err?.message || 'Erro ao remover'); } finally { setBusy(false); }
  }
  return (
    <div className="relative h-11 w-11 shrink-0">
      <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : crianca?.foto_url ? <img src={crianca.foto_url} alt="" className="h-full w-full object-cover" /> : <Baby className="h-5 w-5 text-primary" />}
      </div>
      {crianca?.id && (
        <button type="button" onClick={() => inputRef.current?.click()} className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center shadow" title="Adicionar/trocar foto"><Camera className="h-3 w-3" /></button>
      )}
      {crianca?.foto_url && (
        <button type="button" onClick={remover} className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center shadow" title="Remover foto"><X className="h-2.5 w-2.5" /></button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}
// Foto do responsável (mem_membros · bucket público fotos-membros)
function FotoMembroAvatar({ membro, onChanged }: { membro: any; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(e: any) {
    const file = e.target.files?.[0]; if (!file || !membro?.id) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Imagem muito grande (máx 5MB)'); return; }
    setBusy(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      await api.criancas.uploadFotoResponsavel(membro.id, dataUrl);
      toast.success('Foto do responsável atualizada'); onChanged();
    } catch (err: any) { toast.error(err?.message || 'Erro ao enviar a foto'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  }
  return (
    <div className="relative h-10 w-10 shrink-0">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : membro?.foto_url ? <img src={membro.foto_url} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-bold text-primary">{(membro?.nome || '?').charAt(0)}</span>}
      </div>
      <button type="button" onClick={() => inputRef.current?.click()} className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center shadow" title="Adicionar/trocar foto do responsável"><Camera className="h-3 w-3" /></button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}

const PARENTESCOS: [string, string][] = [['mae', 'Mãe'], ['pai', 'Pai'], ['padrasto', 'Padrasto'], ['madrasta', 'Madrasta'], ['avo_a', 'Avô/Avó'], ['tio_a', 'Tio/Tia'], ['irmao_a', 'Irmão/Irmã'], ['tutor', 'Tutor'], ['outro', 'Outro']];

// Gerenciar responsáveis na ficha (gestão): ver + editar (nome/telefone/
// parentesco/foto) + remover + adicionar. Ações imediatas (não batelam no salvar).
function ResponsaveisManager({ crianca, onChanged }: { crianca: any; onChanged: () => void }) {
  const criancaId = crianca.id;
  const [addOpen, setAddOpen] = useState(false);
  const [novo, setNovo] = useState({ nome: '', telefone: '', cpf: '', parentesco: 'mae' });
  const [busy, setBusy] = useState(false);
  const resps = crianca.responsaveis || [];

  async function salvarRow(r: any, edit: any) {
    setBusy(true);
    try {
      const nomeMud = edit.nome.trim() && edit.nome.trim() !== (r.membro?.nome || '');
      const telMud = edit.telefone.trim() !== String(r.membro?.telefone || '');
      if ((nomeMud || telMud) && r.membro?.id) {
        const patch: any = {};
        if (nomeMud) patch.nome = edit.nome.trim();
        if (telMud) patch.telefone = edit.telefone.trim();
        await api.criancas.updateResponsavelMembro(r.membro.id, patch);
      }
      if (edit.parentesco !== (r.parentesco || 'outro')) {
        await api.criancas.updateResponsavelVinculo(criancaId, r.membro_id, { parentesco: edit.parentesco });
      }
      toast.success('Responsável atualizado'); onChanged();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); } finally { setBusy(false); }
  }
  async function remover(r: any) {
    if (!window.confirm('Remover este responsável? (não apaga o cadastro da pessoa, só o vínculo)')) return;
    try { await api.criancas.removeResponsavelVinculo(criancaId, r.membro_id); toast.success('Responsável removido'); onChanged(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao remover'); }
  }
  async function adicionar(permitirSemCpf?: unknown) {
    const dispensa = permitirSemCpf === true; // onClick passa o evento — só true explícito vale
    if (!novo.nome.trim() || !novo.telefone.trim()) { toast.error('Nome e telefone são obrigatórios'); return; }
    setBusy(true);
    let retry = false;
    try {
      await api.criancas.addResponsavelRapido(criancaId, { nome: novo.nome.trim(), telefone: novo.telefone.trim(), cpf: novo.cpf.trim() || null, parentesco: novo.parentesco, ...(dispensa ? { permitir_sem_cpf: true } : {}) });
      toast.success('Responsável adicionado');
      setNovo({ nome: '', telefone: '', cpf: '', parentesco: 'mae' }); setAddOpen(false); onChanged();
    } catch (e: any) {
      // Válvula da obrigatoriedade de CPF (esta tela não tem o PIN do totem):
      // confirma a liberação e reenvia com a dispensa — nunca travar o fluxo.
      if (e?.code === 'cpf_obrigatorio' && !dispensa
          && window.confirm('O CPF do responsável é obrigatório. Cadastrar sem CPF mesmo assim? A liberação fica registrada no histórico — colete o documento no próximo check-in.')) {
        retry = true; // busy fica true até o reenvio terminar (senão o botão reabilita com a requisição em voo → duplo submit)
      } else {
        toast.error(e?.message || 'Erro ao adicionar');
      }
    } finally { if (!retry) setBusy(false); }
    if (retry) return adicionar(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">Responsáveis</div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddOpen(v => !v)}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
      </div>
      <div className="space-y-2">
        {resps.length === 0 && !addOpen && <div className="text-xs text-muted-foreground">Nenhum responsável vinculado.</div>}
        {resps.map((r: any) => (
          <RowResp key={`${r.membro_id}-${r.membro?.nome}-${r.membro?.telefone}-${r.parentesco}`} r={r} busy={busy} onChanged={onChanged} onSave={salvarRow} onRemove={remover} />
        ))}
        {addOpen && (
          <div className="rounded-md border border-primary/40 p-2 space-y-2">
            <div className="text-[11px] font-medium text-muted-foreground">Novo responsável</div>
            <div className="grid grid-cols-2 gap-2">
              <Input className="h-8" placeholder="Nome *" value={novo.nome} onChange={e => setNovo(n => ({ ...n, nome: e.target.value }))} />
              <Input className="h-8" placeholder="Telefone *" value={novo.telefone} onChange={e => setNovo(n => ({ ...n, telefone: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input className="h-8" placeholder="CPF (opcional)" value={novo.cpf} onChange={e => setNovo(n => ({ ...n, cpf: e.target.value }))} />
              <Select value={novo.parentesco} onValueChange={v => setNovo(n => ({ ...n, parentesco: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{PARENTESCOS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={adicionar} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}</Button>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">Editar nome/telefone atualiza o cadastro da pessoa no sistema inteiro.</p>
    </div>
  );
}

function RowResp({ r, busy, onChanged, onSave, onRemove }: { r: any; busy: boolean; onChanged: () => void; onSave: (r: any, e: any) => void; onRemove: (r: any) => void }) {
  const [edit, setEdit] = useState({ nome: r.membro?.nome || '', telefone: String(r.membro?.telefone || ''), parentesco: r.parentesco || 'outro' });
  const dirty = edit.nome.trim() !== (r.membro?.nome || '') || edit.telefone.trim() !== String(r.membro?.telefone || '') || edit.parentesco !== (r.parentesco || 'outro');
  return (
    <div className="rounded-md border border-border p-2 space-y-2">
      <div className="flex items-center gap-2">
        {r.membro?.id && <FotoMembroAvatar membro={r.membro} onChanged={onChanged} />}
        <Input className="flex-1 h-8" value={edit.nome} placeholder="Nome" onChange={e => setEdit(x => ({ ...x, nome: e.target.value }))} />
        <button type="button" onClick={() => onRemove(r)} className="text-muted-foreground hover:text-red-500 shrink-0" title="Remover responsável"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input className="h-8" placeholder="Telefone" inputMode="tel" value={edit.telefone} onChange={e => setEdit(x => ({ ...x, telefone: e.target.value }))} />
        <Select value={edit.parentesco} onValueChange={v => setEdit(x => ({ ...x, parentesco: v }))}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{PARENTESCOS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {dirty && <div className="flex justify-end"><Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onSave(r, edit)}>Salvar</Button></div>}
    </div>
  );
}

function DuplicadosModal({ onClose, onMerged }: { onClose: () => void; onMerged: () => void }) {
  const [grupos, setGrupos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keep, setKeep] = useState<Record<number, string>>({});
  const [merging, setMerging] = useState(false);
  const carregar = useCallback(() => {
    setLoading(true);
    api.criancas.duplicados().then((d: any) => setGrupos(Array.isArray(d) ? d : [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function fundir(gi: number, grupo: any[]) {
    const k = keep[gi] || grupo[0].id;
    const outros = grupo.filter((c) => c.id !== k).map((c) => c.id);
    if (!outros.length) return;
    if (!window.confirm(`Fundir ${outros.length} criança(s) em "${grupo.find((c) => c.id === k)?.nome}"? Responsáveis, check-ins, atendimentos e decisões migram pra ela. Não dá pra desfazer facilmente.`)) return;
    setMerging(true);
    try { await api.criancas.merge(k, outros); toast.success('Crianças fundidas'); carregar(); onMerged(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao fundir'); } finally { setMerging(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader><DialogTitle>Crianças duplicadas</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma criança duplicada encontrada.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{grupos.length} grupo{grupos.length !== 1 ? 's' : ''} com nome igual. Escolha qual <b>manter</b> e funda as outras nela.</p>
            {grupos.map((grupo, gi) => (
              <Card key={gi} className="p-3 space-y-2">
                <div className="text-sm font-semibold">{grupo[0].nome} · {grupo.length}</div>
                {grupo.map((c: any) => (
                  <label key={c.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm cursor-pointer">
                    <input type="radio" className="mt-1" checked={(keep[gi] || grupo[0].id) === c.id} onChange={() => setKeep({ ...keep, [gi]: c.id })} />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">{c.nome}</span>{!c.ativo && <span className="text-[10px] text-muted-foreground"> · inativa</span>}
                      <span className="block text-[11px] text-muted-foreground">{c.familia ? `${c.familia} · ` : ''}{(c.responsaveis || []).join(', ') || 'sem responsável'}{c.data_nascimento ? ` · ${fmt(c.data_nascimento)}` : ''}</span>
                    </span>
                  </label>
                ))}
                <Button size="sm" onClick={() => fundir(gi, grupo)} disabled={merging}>Manter a selecionada e fundir as outras</Button>
              </Card>
            ))}
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CampoSempre({ label, v }: { label: string; v?: string | null }) {
  return <div><span className="text-xs text-muted-foreground">{label}: </span>{v ? <span>{v}</span> : <span className="italic text-muted-foreground">—</span>}</div>;
}
function LinhaSaude({ label, tem, qual }: { label: string; tem?: boolean | null; qual?: string | null }) {
  return (
    <div className="text-xs flex gap-1">
      <span className="text-muted-foreground">{label}:</span>
      {tem == null ? <span className="italic text-muted-foreground">— a preencher</span> : tem ? <span className="text-amber-600 font-medium">Sim{qual ? ` · ${qual}` : ''}</span> : <span>Não</span>}
    </div>
  );
}
function Campo({ label, v }: { label: string; v?: string | null }) {
  if (!v) return null;
  return <div><span className="text-xs text-muted-foreground">{label}: </span><span>{v}</span></div>;
}

// Seletor de foto (preview local · usado no cadastro de nova criança)
function FotoPicker({ dataUrl, onPick, onClear, label }: { dataUrl: string | null; onPick: (e: any) => void; onClear: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-12 w-12 shrink-0">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
          {dataUrl ? <img src={dataUrl} alt="" className="h-full w-full object-cover" /> : <Camera className="h-5 w-5 text-primary" />}
        </div>
        <button type="button" onClick={() => ref.current?.click()} className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center shadow" title="Adicionar foto"><Camera className="h-3 w-3" /></button>
        {dataUrl && <button type="button" onClick={onClear} className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center shadow" title="Remover"><X className="h-2.5 w-2.5" /></button>}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onPick} />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Nova criança (cadastro manual) ───────────────────────────────────────────
function NovaCrianca({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [serie, setSerie] = useState('');
  const [necessidade, setNecessidade] = useState('');
  const [consentMkt, setConsentMkt] = useState(false);
  const [fotoCrianca, setFotoCrianca] = useState<string | null>(null);
  const [resps, setResps] = useState<any[]>([{ nome: '', telefone: '', cpf: '', parentesco: 'mae', autorizado_buscar: true, foto: null }]);
  const [salvando, setSalvando] = useState(false);

  const setResp = (i: number, patch: any) => setResps(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addResp = () => setResps(rs => [...rs, { nome: '', telefone: '', cpf: '', parentesco: 'outro', autorizado_buscar: true, foto: null }]);
  const delResp = (i: number) => setResps(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs);
  const lerFoto = (cb: (v: string) => void) => (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error('Imagem muito grande (máx 5MB)'); return; }
    const r = new FileReader(); r.onload = () => cb(r.result as string); r.readAsDataURL(f);
  };

  async function salvar(permitirSemCpf?: unknown) {
    const dispensa = permitirSemCpf === true; // onClick passa o evento — só true explícito vale
    if (!nome.trim()) { toast.error('Informe o nome da criança'); return; }
    const validos = resps.filter(r => r.nome.trim() && r.telefone.trim());
    if (!validos.length) { toast.error('Informe ao menos um responsável (nome e telefone)'); return; }
    setSalvando(true);
    let retry = false;
    try {
      const r = await api.criancas.create({
        crianca: { nome: nome.trim(), data_nascimento: nascimento || null, sexo: sexo || null, serie: serie.trim() || null, necessidades_especiais: necessidade.trim() || null, consent_marketing: consentMkt },
        responsaveis: validos.map(x => ({ nome: x.nome.trim(), telefone: x.telefone.trim(), cpf: x.cpf?.trim() || null, parentesco: x.parentesco, autorizado_buscar: x.autorizado_buscar })),
        ...(dispensa ? { permitir_sem_cpf: true } : {}),
      });
      // Fotos (best-effort · não travam o cadastro se falharem). r.responsaveis
      // volta na MESMA ordem dos validos → casa a foto pelo índice.
      const cid = r?.crianca?.id;
      if (cid && fotoCrianca) { try { await api.criancas.uploadFoto(cid, fotoCrianca); } catch { /* noop */ } }
      const retResps = Array.isArray(r?.responsaveis) ? r.responsaveis : [];
      for (let i = 0; i < retResps.length; i++) {
        if (validos[i]?.foto && retResps[i]?.id) { try { await api.criancas.uploadFotoResponsavel(retResps[i].id, validos[i].foto); } catch { /* noop */ } }
      }
      toast.success('Criança cadastrada');
      onCreated();
    } catch (e: any) {
      // Válvula da obrigatoriedade de CPF (esta tela não tem o PIN do totem):
      // confirma a liberação e reenvia com a dispensa — nunca travar o fluxo.
      if (e?.code === 'cpf_obrigatorio' && !dispensa
          && window.confirm('O CPF do responsável é obrigatório. Cadastrar sem CPF mesmo assim? A liberação fica registrada no histórico — colete o documento no próximo check-in.')) {
        retry = true; // salvando fica true até o reenvio terminar (senão o botão reabilita com a requisição em voo → duplo submit)
      } else {
        toast.error(e?.message || 'Erro ao cadastrar');
      }
    } finally { if (!retry) setSalvando(false); }
    if (retry) return salvar(true);
  }

  const temAlteracoes = (
    !!nome.trim() || !!nascimento || !!sexo || !!serie.trim() || !!necessidade.trim() ||
    consentMkt || !!fotoCrianca ||
    resps.some(r => r.nome.trim() || r.telefone.trim() || (r.cpf || '').trim())
  );
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) tentarFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova criança</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Nome da criança *</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div><Label className="text-xs">Nascimento</Label><DataNascimentoPicker value={nascimento} onChange={setNascimento} /></div>
          <div>
            <Label className="text-xs">Sexo</Label>
            <Select value={sexo} onValueChange={setSexo}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent><SelectItem value="M">Menino</SelectItem><SelectItem value="F">Menina</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Série (opcional)</Label><Input value={serie} onChange={e => setSerie(e.target.value)} placeholder="Ex.: Maternal II" /></div>
          <div><Label className="text-xs">Necessidade / alergia (opcional)</Label><Textarea rows={2} value={necessidade} onChange={e => setNecessidade(e.target.value)} /></div>
          <FotoPicker dataUrl={fotoCrianca} onPick={lerFoto(setFotoCrianca)} onClear={() => setFotoCrianca(null)} label="Foto da criança (opcional)" />
          <label className="flex items-start gap-2 text-xs rounded-md border border-border p-2 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={consentMkt} onChange={e => setConsentMkt(e.target.checked)} />
            <span>Autoriza o <b>uso da imagem da criança</b> para divulgação/marketing da igreja (redes sociais, site, etc.)</span>
          </label>
          <div className="border-t border-border pt-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-muted-foreground">Responsáveis</div>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addResp}><Plus className="h-3.5 w-3.5" /> Adicionar responsável</Button>
            </div>
            {resps.map((r, i) => (
              <div key={i} className="rounded-md border border-border p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Responsável {i + 1}</span>
                  {resps.length > 1 && <button type="button" onClick={() => delResp(i)} className="text-muted-foreground hover:text-red-500"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Nome *</Label><Input value={r.nome} onChange={e => setResp(i, { nome: e.target.value })} /></div>
                  <div><Label className="text-xs">Telefone *</Label><Input value={r.telefone} onChange={e => setResp(i, { telefone: e.target.value })} placeholder="(21) 99999-9999" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">CPF (opcional)</Label><Input value={r.cpf} onChange={e => setResp(i, { cpf: e.target.value })} /></div>
                  <div>
                    <Label className="text-xs">Parentesco</Label>
                    <Select value={r.parentesco} onValueChange={v => setResp(i, { parentesco: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mae">Mãe</SelectItem><SelectItem value="pai">Pai</SelectItem>
                        <SelectItem value="avo_a">Avó/Avô</SelectItem><SelectItem value="tutor">Tutor</SelectItem><SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <FotoPicker dataUrl={r.foto} onPick={lerFoto(v => setResp(i, { foto: v }))} onClear={() => setResp(i, { foto: null })} label="Foto (opcional)" />
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={r.autorizado_buscar} onChange={e => setResp(i, { autorizado_buscar: e.target.checked })} />
                    Autorizado a buscar
                  </label>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={salvar} disabled={salvando} className="w-full">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cadastrar criança'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


// ── Aba Frequência e jornada (gráfico + conversão/batismo + família) ──────────
function JornadaTab({ criancaId, c, onChanged }: { criancaId: string; c: any; onChanged: () => void }) {
  const navigate = useNavigate();
  const [j, setJ] = useState<any>(null);
  const [conv, setConv] = useState<string>(c?.data_conversao || '');
  const [bat, setBat] = useState<string>(c?.data_batismo || '');
  const [salvando, setSalvando] = useState(false);
  const [analise, setAnalise] = useState<any>(null);
  const [analisando, setAnalisando] = useState(false);
  useEffect(() => { api.criancas.jornada(criancaId).then(setJ).catch(() => {}); setAnalise(null); }, [criancaId]);

  async function salvar() {
    setSalvando(true);
    try { await api.criancas.update(criancaId, { data_conversao: conv || null, data_batismo: bat || null }); toast.success('Jornada salva'); onChanged(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); } finally { setSalvando(false); }
  }

  async function gerarAnalise() {
    setAnalisando(true);
    try { setAnalise(await api.criancas.analiseFrequencia(criancaId)); }
    catch (e: any) { toast.error(e?.message || 'Erro ao gerar análise'); }
    finally { setAnalisando(false); }
  }

  const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesAno = (ym: string) => `${MESES_ABREV[Number(ym.slice(5, 7)) - 1] || ''}/${ym.slice(2, 4)}`;
  const dados = (j?.frequencia?.porMes || []).map((p: any) => ({ mes: mesAno(p.mes), total: p.total }));
  const freq = j?.frequencia;
  const SIT_COR: Record<string, string> = { frequente: 'text-emerald-600', regular: 'text-sky-600', esporadica: 'text-amber-600', afastada: 'text-red-600' };

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Data de conversão</Label>
          <Input type="date" value={conv} onChange={e => setConv(e.target.value)} />
          {!conv && j?.conversao_sugerida && (
            <button className="text-[11px] text-primary mt-0.5" onClick={() => setConv(j.conversao_sugerida)}>usar 1ª decisão ({fmt(j.conversao_sugerida)})</button>
          )}
        </div>
        <div>
          <Label className="text-xs">Data de batismo</Label>
          <Input type="date" value={bat} onChange={e => setBat(e.target.value)} />
        </div>
      </div>
      <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar jornada'}</Button>

      <div>
        <div className="text-xs text-muted-foreground mb-1">
          Frequência (check-ins){freq ? ` · total ${freq.total}${freq.ultima ? ` · último ${fmt(String(freq.ultima).slice(0, 10))}` : ''}` : ''}
        </div>
        {dados.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Sem check-ins registrados no sistema pra esta criança.</p>
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#00B39D" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Análise de IA da frequência */}
      <div className="rounded-lg border border-border p-3 bg-foreground/[0.02]">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-xs font-medium flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> Análise de IA</div>
          {(freq?.total ?? 0) > 0 && (
            <Button size="sm" variant="outline" onClick={gerarAnalise} disabled={analisando}>
              {analisando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (analise ? 'Atualizar' : 'Gerar análise')}
            </Button>
          )}
        </div>
        {(freq?.total ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">Sem frequência pra analisar.</p>
        ) : !analise ? (
          <p className="text-xs text-muted-foreground">Clique em "Gerar análise" pra a IA interpretar a frequência desta criança.</p>
        ) : analise.sem_dados ? (
          <p className="text-xs text-muted-foreground">{analise.motivo}</p>
        ) : (
          <div className="space-y-1.5">
            {analise.situacao && (
              <div className={`text-xs font-semibold uppercase tracking-wide ${SIT_COR[analise.situacao] || 'text-foreground'}`}>{analise.situacao}</div>
            )}
            <p className="text-sm">{analise.analise}</p>
            {analise.recomendacao && (
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Ação sugerida:</span> {analise.recomendacao}</p>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-1">Família (membros)</div>
        {(j?.familia_membros || []).length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem membros vinculados à família.</div>
        ) : (
          <div className="space-y-1">
            {j.familia_membros.map((m: any) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border border-border p-1.5 text-xs">
                <button onClick={() => navigate(`/ministerial/membresia?membro=${m.id}`)} className="flex-1 min-w-0 truncate text-left text-primary hover:underline">{m.nome}</button>
                {m.telefone && <Link to={hrefConversa(m.telefone)} className="text-primary"><Phone className="h-3.5 w-3.5" /></Link>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
