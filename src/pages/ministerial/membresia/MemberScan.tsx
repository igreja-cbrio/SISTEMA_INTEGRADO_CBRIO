import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { membresia } from '@/api';
import {
  QrCode, ArrowLeft, Loader2, CheckCircle2, XCircle, Phone, Mail,
  MapPin, Heart, Users, UserCheck, Calendar, AlertCircle, RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ScanState = 'idle' | 'scanning' | 'loading' | 'found' | 'not_found' | 'error';

interface MembroIdentidade {
  id: string;
  nome: string;
  foto_url?: string | null;
  status?: string | null;
  email?: string | null;
  telefone?: string | null;
  data_nascimento?: string | null;
  cpf?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado_civil?: string | null;
  familia?: { id: string; nome: string } | null;
  grupo_atual?: {
    id: string;
    nome: string;
    categoria?: string | null;
    local?: string | null;
    dia_semana?: string | null;
    horario?: string | null;
  } | null;
  ministerios?: Array<{ id: string; nome: string; cor?: string | null }>;
  ultima_contribuicao?: string | null;
  nivel_generosidade?: string | null;
  ultimo_checkin?: string | null;
  nivel_servico?: string | null;
}

interface CadastroPendente {
  id: string;
  nome: string;
  foto_url?: string | null;
  email?: string | null;
  telefone?: string | null;
  data_nascimento?: string | null;
  cpf?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado_civil?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface LookupResult {
  found: boolean;
  pending: boolean;
  membro?: MembroIdentidade;
  cadastro?: CadastroPendente;
}

const containerId = 'mem-scan-qr-reader';

function idade(dataNascimento?: string | null) {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos -= 1;
  return anos;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return format(new Date(iso), "dd 'de' MMM yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

function nivelBadge(nivel?: string | null): { label: string; className: string } | null {
  if (!nivel) return null;
  const map: Record<string, { label: string; className: string }> = {
    ativo: { label: 'Ativo', className: 'bg-green-500/20 text-green-300 border-green-500/30' },
    irregular: { label: 'Irregular', className: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    inativo: { label: 'Inativo', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
    nunca_contribuiu: { label: 'Sem contribuicao', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
    ausente: { label: 'Ausente', className: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    nunca_serviu: { label: 'Sem servico', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  };
  return map[nivel] || null;
}

export default function MemberScan() {
  const navigate = useNavigate();
  const [state, setState] = useState<ScanState>('idle');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);

  const stopScanning = useCallback(async () => {
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
      scannerRef.current = null;
    } catch {
      // silencioso — camera pode ja estar parada
    }
  }, []);

  const handleScan = useCallback(async (token: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    await stopScanning();
    setState('loading');
    try {
      const r = await membresia.qrLookup(token);
      setResult(r);
      setState(r.found ? 'found' : 'not_found');
    } catch (err: any) {
      if (err.status === 404) {
        setState('not_found');
      } else {
        setErrorMsg(err.message || 'Erro ao consultar QR');
        setState('error');
      }
    }
  }, [stopScanning]);

  const startScanning = useCallback(async () => {
    setErrorMsg('');
    setResult(null);
    processingRef.current = false;
    setState('scanning');
    try {
      await new Promise((r) => setTimeout(r, 150));
      const el = document.getElementById(containerId);
      if (!el) return;
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 280 } },
        handleScan,
        () => {},
      );
    } catch (err: any) {
      setErrorMsg('Nao foi possivel acessar a camera. Verifique permissoes.');
      setState('error');
    }
  }, [handleScan]);

  useEffect(() => {
    startScanning();
    return () => {
      stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setResult(null);
    setErrorMsg('');
    startScanning();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-white/50 hover:text-white gap-1.5"
          onClick={() => { stopScanning(); navigate('/ministerial/membresia'); }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar</span>
        </Button>
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-[#00B39D]" />
          <span className="text-sm md:text-base font-semibold">Identidade de membro</span>
        </div>
        <div className="w-16" />
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12">
        {/* Scanning */}
        {state === 'scanning' && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10" style={{ aspectRatio: '1 / 1' }}>
              <div id={containerId} className="w-full h-full" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-[70%] aspect-square border-2 border-[#00B39D] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <p className="text-center text-sm text-white/60">
              Posicione o QR do membro dentro do quadrado
            </p>
          </div>
        )}

        {/* Loading */}
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-[#00B39D]" />
            <p className="text-white/70">Consultando cadastro...</p>
          </div>
        )}

        {/* Not found */}
        {state === 'not_found' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <XCircle className="h-16 w-16 text-red-400" />
            <div>
              <h2 className="text-xl font-bold">QR nao reconhecido</h2>
              <p className="text-sm text-white/60 mt-1">
                Este QR nao corresponde a nenhum cadastro da CBRio.
              </p>
            </div>
            <Button className="bg-[#00B39D] hover:bg-[#00B39D]/90 mt-2" onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Escanear outro
            </Button>
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <AlertCircle className="h-16 w-16 text-red-400" />
            <div>
              <h2 className="text-xl font-bold">Erro</h2>
              <p className="text-sm text-white/60 mt-1">{errorMsg}</p>
            </div>
            <Button className="bg-[#00B39D] hover:bg-[#00B39D]/90 mt-2" onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Found — identity card */}
        {state === 'found' && result?.found && (
          <div className="space-y-4">
            {result.pending && result.cadastro ? (
              <PendingCard cadastro={result.cadastro} />
            ) : result.membro ? (
              <MemberCard membro={result.membro} onOpenMembro={() => navigate('/ministerial/membresia')} />
            ) : null}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-white/20 text-white bg-transparent hover:bg-white/10" onClick={reset}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Escanear outro
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-componentes ──

function MemberCard({ membro, onOpenMembro }: { membro: MembroIdentidade; onOpenMembro: () => void }) {
  const age = idade(membro.data_nascimento);
  const generosidade = nivelBadge(membro.nivel_generosidade);
  const servico = nivelBadge(membro.nivel_servico);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Header com foto + nome */}
      <div className="flex items-center gap-4 p-5 border-b border-white/10 bg-gradient-to-r from-[#00B39D]/20 to-transparent">
        <div className="relative">
          {membro.foto_url ? (
            <img
              src={membro.foto_url}
              alt={membro.nome}
              className="h-20 w-20 rounded-full object-cover border-2 border-[#00B39D]"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-[#00B39D]/20 border-2 border-[#00B39D] flex items-center justify-center">
              <span className="text-2xl font-bold text-[#00B39D]">
                {(membro.nome || '?').slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-gray-900">
            <CheckCircle2 className="h-3 w-3 text-white" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-white truncate">{membro.nome}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {membro.status && (
              <Badge variant="outline" className="text-xs border-[#00B39D]/40 text-[#00B39D] bg-[#00B39D]/10">
                {membro.status}
              </Badge>
            )}
            {age !== null && (
              <span className="text-xs text-white/60">{age} anos</span>
            )}
            {membro.estado_civil && (
              <span className="text-xs text-white/60">· {membro.estado_civil}</span>
            )}
          </div>
        </div>
      </div>

      {/* Contato */}
      {(membro.email || membro.telefone) && (
        <Section title="Contato">
          {membro.telefone && (
            <InfoLine icon={Phone} label="Telefone" value={membro.telefone} />
          )}
          {membro.email && (
            <InfoLine icon={Mail} label="Email" value={membro.email} />
          )}
        </Section>
      )}

      {/* Endereco */}
      {(membro.endereco || membro.bairro || membro.cidade) && (
        <Section title="Endereco">
          <InfoLine
            icon={MapPin}
            label=""
            value={[membro.endereco, membro.bairro, membro.cidade].filter(Boolean).join(', ')}
          />
        </Section>
      )}

      {/* Familia */}
      {membro.familia && (
        <Section title="Familia">
          <InfoLine icon={Users} label="" value={membro.familia.nome} />
        </Section>
      )}

      {/* Grupo de Conexao */}
      {membro.grupo_atual && (
        <Section title="Grupo de Conexao">
          <div className="text-sm text-white/90">
            <p className="font-medium">{membro.grupo_atual.nome}</p>
            {(membro.grupo_atual.dia_semana || membro.grupo_atual.horario) && (
              <p className="text-xs text-white/60 mt-0.5">
                {[membro.grupo_atual.dia_semana, membro.grupo_atual.horario].filter(Boolean).join(' · ')}
              </p>
            )}
            {membro.grupo_atual.local && (
              <p className="text-xs text-white/50 mt-0.5">{membro.grupo_atual.local}</p>
            )}
          </div>
        </Section>
      )}

      {/* Ministerios */}
      {membro.ministerios && membro.ministerios.length > 0 && (
        <Section title="Ministerios">
          <div className="flex flex-wrap gap-2">
            {membro.ministerios.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border"
                style={{
                  borderColor: m.cor ? `${m.cor}60` : 'rgba(255,255,255,0.2)',
                  color: m.cor || 'rgba(255,255,255,0.9)',
                  backgroundColor: m.cor ? `${m.cor}15` : 'rgba(255,255,255,0.05)',
                }}
              >
                <UserCheck className="h-3 w-3" />
                {m.nome}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Engajamento */}
      <Section title="Engajamento">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/50">
              <Heart className="h-3 w-3" /> Generosidade
            </div>
            <div className="mt-1.5">
              {generosidade ? (
                <Badge variant="outline" className={`text-xs ${generosidade.className}`}>
                  {generosidade.label}
                </Badge>
              ) : (
                <span className="text-xs text-white/40">—</span>
              )}
            </div>
            {membro.ultima_contribuicao && (
              <p className="text-[11px] text-white/50 mt-1">
                Ultima: {formatDate(membro.ultima_contribuicao)}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/50">
              <Calendar className="h-3 w-3" /> Servico
            </div>
            <div className="mt-1.5">
              {servico ? (
                <Badge variant="outline" className={`text-xs ${servico.className}`}>
                  {servico.label}
                </Badge>
              ) : (
                <span className="text-xs text-white/40">—</span>
              )}
            </div>
            {membro.ultimo_checkin && (
              <p className="text-[11px] text-white/50 mt-1">
                Ultimo: {formatDate(membro.ultimo_checkin)}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* Acoes */}
      <div className="p-4 border-t border-white/10 bg-black/30">
        <Button
          className="w-full bg-[#00B39D] hover:bg-[#00B39D]/90"
          onClick={onOpenMembro}
        >
          Abrir ficha completa
        </Button>
      </div>
    </div>
  );
}

function PendingCard({ cadastro }: { cadastro: CadastroPendente }) {
  const age = idade(cadastro.data_nascimento);
  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
      <div className="flex items-center gap-4 p-5 border-b border-yellow-500/20 bg-gradient-to-r from-yellow-500/10 to-transparent">
        <div className="h-20 w-20 rounded-full bg-yellow-500/20 border-2 border-yellow-400 flex items-center justify-center">
          {cadastro.foto_url ? (
            <img src={cadastro.foto_url} alt={cadastro.nome} className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-yellow-300">
              {(cadastro.nome || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-white truncate">{cadastro.nome}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-xs border-yellow-500/40 text-yellow-300 bg-yellow-500/10">
              Cadastro pendente
            </Badge>
            {age !== null && <span className="text-xs text-white/60">{age} anos</span>}
          </div>
        </div>
      </div>

      <Section title="Contato">
        {cadastro.telefone && <InfoLine icon={Phone} label="Telefone" value={cadastro.telefone} />}
        {cadastro.email && <InfoLine icon={Mail} label="Email" value={cadastro.email} />}
      </Section>

      {(cadastro.endereco || cadastro.bairro || cadastro.cidade) && (
        <Section title="Endereco">
          <InfoLine
            icon={MapPin}
            label=""
            value={[cadastro.endereco, cadastro.bairro, cadastro.cidade].filter(Boolean).join(', ')}
          />
        </Section>
      )}

      <div className="p-4 border-t border-yellow-500/20 bg-yellow-500/5">
        <p className="text-xs text-yellow-200/80">
          Este cadastro ainda nao foi aprovado. Aprove pela tela de Membresia {'->'} aba Cadastros.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 border-b border-white/10">
      <h3 className="text-[11px] uppercase tracking-wider text-white/40 mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-white/90">
      <Icon className="h-4 w-4 text-white/40 mt-0.5 shrink-0" />
      <div className="min-w-0">
        {label && <span className="text-xs text-white/50 mr-1">{label}:</span>}
        <span className="break-words">{value}</span>
      </div>
    </div>
  );
}
