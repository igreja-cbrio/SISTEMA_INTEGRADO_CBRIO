import { useCallback, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Scan, SwitchCamera, Loader2, UserPlus, Link2, Trash2, ShieldAlert, Users, UserCheck, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFaceDetection } from '@/pages/ministerial/voluntariado/hooks/useVolFace';
import { face, membresia } from '@/api';

const PRIMARY = '#00B39D';

// Captura o melhor frame da webcam (best-shot) como JPEG dataURL.
function capturarBestShot(video: HTMLVideoElement | null): string | null {
  if (!video || !video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  const w = Math.min(video.videoWidth, 480);
  const scale = w / video.videoWidth;
  canvas.width = w;
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function fmtData(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ── Aba 1 · Reconhecimento (teste com webcam) ───────────────────────────────
function AbaReconhecer() {
  const { videoRef, canvasRef, isDetecting, startCamera, stopCamera, detectFace, switchCamera } = useFaceDetection();
  const [ativa, setAtiva] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [status, setStatus] = useState('');
  const reconhecer = useMutation({ mutationFn: (data: any) => face.reconhecer(data) });

  const ligar = useCallback(async () => {
    setConectando(true); setStatus('');
    try { await startCamera(); setAtiva(true); }
    catch (e: any) { setStatus(e?.message || 'Não consegui acessar a câmera. Permita o acesso no navegador.'); }
    finally { setConectando(false); }
  }, [startCamera]);
  const desligar = useCallback(() => { stopCamera(); setAtiva(false); }, [stopCamera]);

  const escanear = useCallback(async () => {
    setStatus('Detectando rosto...'); setResultado(null);
    const d = await detectFace();
    if (!d) { setStatus('Nenhum rosto detectado. Tente novamente.'); return; }
    const best_shot = capturarBestShot(videoRef.current);
    setStatus('Reconhecendo...');
    try {
      const r = await reconhecer.mutateAsync({ descriptor: Array.from(d), entrada: 'teste-webcam', best_shot });
      setResultado(r);
      setStatus('');
    } catch (e: any) { setStatus(e?.message || 'Erro no reconhecimento'); }
  }, [detectFace, reconhecer, videoRef]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl overflow-hidden bg-black relative" style={{ aspectRatio: '4/3', maxWidth: 520 }}>
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {!ativa && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">Câmera desligada</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!ativa ? (
          <Button onClick={ligar} disabled={conectando} style={{ background: PRIMARY }}>
            {conectando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />} Ligar câmera
          </Button>
        ) : (
          <>
            <Button onClick={escanear} disabled={isDetecting || reconhecer.isPending} style={{ background: PRIMARY }}>
              {(isDetecting || reconhecer.isPending) ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Scan className="w-4 h-4 mr-1" />} Escanear
            </Button>
            <Button variant="outline" onClick={switchCamera}><SwitchCamera className="w-4 h-4 mr-1" /> Trocar</Button>
            <Button variant="ghost" onClick={desligar}>Desligar</Button>
          </>
        )}
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {resultado && (
        <Card><CardContent className="p-4">
          {resultado.tipo === 'membro' && (
            <div className="flex items-center gap-2 text-green-600"><UserCheck className="w-5 h-5" />
              <span><b>{resultado.membro?.nome}</b> — membro identificado · confiança {Math.round((resultado.confianca || 0) * 100)}%</span>
            </div>
          )}
          {resultado.tipo === 'anonimo_recorrente' && (
            <div className="flex items-center gap-2 text-amber-600"><Repeat className="w-5 h-5" />
              <span>Anônimo <b>recorrente</b> — {resultado.visitas} visitas. Aparece em "Rostos a resolver".</span>
            </div>
          )}
          {resultado.tipo === 'anonimo_novo' && (
            <div className="flex items-center gap-2 text-muted-foreground"><Users className="w-5 h-5" />
              <span>Rosto <b>novo</b> guardado como anônimo (1ª vez). Se voltar, vira recorrente.</span>
            </div>
          )}
        </CardContent></Card>
      )}
      <p className="text-xs text-muted-foreground">
        Teste com webcam. Em produção, o device na entrada chama o mesmo reconhecimento em tempo real.
      </p>
    </div>
  );
}

// ── Diálogo · vincular a um membro existente ────────────────────────────────
function VincularDialog({ anon, onClose }: { anon: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const { data: membros, isFetching } = useQuery({
    queryKey: ['face-busca-membro', busca],
    queryFn: () => membresia.membros.list({ busca, status: '', papel: '', faixa: '' } as any),
    enabled: busca.trim().length >= 2,
  });
  const vincular = useMutation({
    mutationFn: (membro_id: string) => face.vincular(anon.id, membro_id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['face-anonimos'] }); onClose(); },
  });
  const lista = Array.isArray(membros) ? membros : (membros as any)?.membros || (membros as any)?.data || [];
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Vincular rosto a um membro</DialogTitle></DialogHeader>
        <Input placeholder="Buscar por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
        <div className="max-h-72 overflow-y-auto space-y-1 mt-2">
          {isFetching && <p className="text-sm text-muted-foreground p-2">Buscando...</p>}
          {!isFetching && busca.length >= 2 && lista.length === 0 && <p className="text-sm text-muted-foreground p-2">Nenhum membro encontrado.</p>}
          {lista.slice(0, 30).map((m: any) => (
            <button key={m.id} onClick={() => vincular.mutate(m.id)} disabled={vincular.isPending}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted flex items-center justify-between">
              <span>{m.nome}</span>
              <span className="text-xs text-muted-foreground">{m.telefone || m.email || ''}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Ao vincular, o rosto vira o reconhecimento desse membro (com consentimento) e o histórico de visitas migra pro cadastro.</p>
      </DialogContent>
    </Dialog>
  );
}

// ── Diálogo · cadastrar nova pessoa a partir do rosto ───────────────────────
function CadastrarDialog({ anon, onClose }: { anon: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ nome: '', telefone: '', email: '' });
  const cadastrar = useMutation({
    mutationFn: () => face.cadastrar(anon.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['face-anonimos'] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cadastrar nova pessoa</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input placeholder="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
          <Input placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          <Input placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => cadastrar.mutate()} disabled={form.nome.trim().length < 2 || cadastrar.isPending} style={{ background: PRIMARY }}>
            {cadastrar.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />} Cadastrar e vincular rosto
          </Button>
        </DialogFooter>
        <p className="text-xs text-muted-foreground">Cria a pessoa na Membresia (como visitante) já com o rosto e o histórico de visitas.</p>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba 2 · Rostos a resolver ───────────────────────────────────────────────
function AbaResolver() {
  const qc = useQueryClient();
  const [soRecorrentes, setSoRecorrentes] = useState(true);
  const { data, isLoading } = useQuery({
    queryKey: ['face-anonimos', soRecorrentes],
    queryFn: () => face.anonimos({ min_visitas: soRecorrentes ? 2 : 1, limit: 200 }),
  });
  const [vincularAnon, setVincularAnon] = useState<any>(null);
  const [cadastrarAnon, setCadastrarAnon] = useState<any>(null);
  const descartar = useMutation({
    mutationFn: (id: string) => face.descartar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['face-anonimos'] }),
  });
  const lista = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={soRecorrentes ? 'default' : 'outline'} onClick={() => setSoRecorrentes(true)} style={soRecorrentes ? { background: PRIMARY } : {}}>Recorrentes (2+ visitas)</Button>
        <Button size="sm" variant={!soRecorrentes ? 'default' : 'outline'} onClick={() => setSoRecorrentes(false)} style={!soRecorrentes ? { background: PRIMARY } : {}}>Todos</Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && lista.length === 0 && (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum rosto anônimo a resolver.</CardContent></Card>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {lista.map((a: any) => (
          <Card key={a.id}><CardContent className="p-3 space-y-2">
            <div className="flex gap-3">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {a.best_shot_url ? <img src={a.best_shot_url} alt="rosto" className="w-full h-full object-cover" /> : <Users className="w-8 h-8 text-muted-foreground" />}
              </div>
              <div className="text-sm space-y-1">
                <Badge variant="secondary">{a.visitas} {a.visitas > 1 ? 'visitas' : 'visita'}</Badge>
                <p className="text-muted-foreground text-xs">1ª vez: {fmtData(a.primeira_vez)}</p>
                <p className="text-muted-foreground text-xs">Última: {fmtData(a.ultima_vez)}</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setVincularAnon(a)}><Link2 className="w-3.5 h-3.5 mr-1" /> Vincular</Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setCadastrarAnon(a)}><UserPlus className="w-3.5 h-3.5 mr-1" /> Cadastrar</Button>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm('Descartar este rosto? (passante/equipe)')) descartar.mutate(a.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </CardContent></Card>
        ))}
      </div>
      {vincularAnon && <VincularDialog anon={vincularAnon} onClose={() => setVincularAnon(null)} />}
      {cadastrarAnon && <CadastrarDialog anon={cadastrarAnon} onClose={() => setCadastrarAnon(null)} />}
    </div>
  );
}

// ── Aba 3 · Presença ────────────────────────────────────────────────────────
function AbaPresenca() {
  const [dias, setDias] = useState(30);
  const { data, isLoading } = useQuery({ queryKey: ['face-resumo', dias], queryFn: () => face.resumo(dias) });
  const r: any = data || {};
  const cards = [
    { label: 'Reconhecimentos', valor: r.total_reconhecimentos, icon: Scan },
    { label: 'Membros identificados', valor: r.membros_identificados, icon: UserCheck },
    { label: 'Anônimos distintos', valor: r.anonimos_distintos, icon: Users },
    { label: 'Anônimos recorrentes', valor: r.anonimos_recorrentes, icon: Repeat },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={dias === d ? 'default' : 'outline'} onClick={() => setDias(d)} style={dias === d ? { background: PRIMARY } : {}}>{d} dias</Button>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => (
            <Card key={c.label}><CardContent className="p-4">
              <c.icon className="w-5 h-5 mb-2" style={{ color: PRIMARY }} />
              <p className="text-2xl font-semibold">{c.valor ?? 0}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Anônimos recorrentes = prováveis frequentadores ainda não identificados — bons candidatos a acolher/integrar.</p>
    </div>
  );
}

export default function ReconhecimentoFacial() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reconhecimento Facial</h1>
        <p className="text-muted-foreground text-sm">Presença na entrada · membros identificados + rostos anônimos a resolver.</p>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50/40 dark:bg-amber-500/10 p-3 text-sm">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-muted-foreground">
          <b>LGPD:</b> rosto é dado biométrico sensível. Membros entram com consentimento; anônimos são pseudonimizados e expurgados por retenção. Go-live exige aviso na entrada + aval do jurídico/DPO.
        </p>
      </div>
      <Tabs defaultValue="resolver">
        <TabsList>
          <TabsTrigger value="resolver">Rostos a resolver</TabsTrigger>
          <TabsTrigger value="presenca">Presença</TabsTrigger>
          <TabsTrigger value="reconhecer">Reconhecimento (teste)</TabsTrigger>
        </TabsList>
        <TabsContent value="resolver" className="mt-4"><AbaResolver /></TabsContent>
        <TabsContent value="presenca" className="mt-4"><AbaPresenca /></TabsContent>
        <TabsContent value="reconhecer" className="mt-4"><AbaReconhecer /></TabsContent>
      </Tabs>
    </div>
  );
}
