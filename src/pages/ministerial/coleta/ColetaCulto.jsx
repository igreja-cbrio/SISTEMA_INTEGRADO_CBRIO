import { useState, useEffect, useCallback } from 'react';
import { integracao as intApi } from '../../../api';
import { Calendar, Heart, Users, CheckCircle2, AlertCircle, ChevronRight, RefreshCw, Lock } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { toast } from 'sonner';
import FormColetaCulto from './FormColetaCulto';

const C = { primary: '#00B39D', warn: '#f59e0b', pink: '#ef476f', kids: '#EC4899' };

function fmtData(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
  const dt = new Date(y, m - 1, d);
  return `${dias[dt.getDay()]} ${String(d).padStart(2,'0')}/${meses[m-1]}`;
}

function StatusBadge({ submissao, jaEmCultos, ambiente }) {
  if (submissao?.status === 'aprovado' || jaEmCultos) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="h-3 w-3" /> Pronto
      </span>
    );
  }
  if (submissao?.status === 'pendente') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full">
        <AlertCircle className="h-3 w-3" /> Aguardando
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded-full">
      <span className="h-2 w-2 rounded-full bg-rose-500" /> Faltam dados
    </span>
  );
}

export default function ColetaCulto() {
  const [cultos, setCultos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null); // {culto, ambiente}

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const data = await intApi.coleta.cultosAbertos();
      setCultos(data || []);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar cultos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirForm(culto, ambiente) {
    const lock = culto[ambiente];
    if (lock.submissao && (lock.submissao.status === 'pendente' || lock.submissao.status === 'aprovado')) {
      toast.warning('Este ambiente já teve dados enviados deste culto.');
      return;
    }
    setAberto({ culto, ambiente });
  }

  function aposEnviar() {
    setAberto(null);
    toast.success('Dados enviados · aguardando aprovacao');
    carregar();
  }

  if (aberto) {
    return (
      <FormColetaCulto
        culto={aberto.culto}
        ambiente={aberto.ambiente}
        onVoltar={() => setAberto(null)}
        onEnviado={aposEnviar}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Coleta de Culto</h1>
          <p className="text-xs text-muted-foreground">Envie os números do culto que acabou</p>
        </div>
        <button
          onClick={carregar}
          className="h-9 w-9 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center hover:bg-secondary/80 transition"
          title="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-3">
        {erro && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg p-3 text-sm text-rose-700 dark:text-rose-300">
            {erro}
          </div>
        )}

        {!loading && cultos.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum culto recente</p>
          </div>
        )}

        {loading && (
          <div className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="h-32 rounded-xl bg-secondary/40 animate-pulse" />
            ))}
          </div>
        )}

        {cultos.map(c => (
          <CultoCard key={c.id} culto={c} onAbrir={abrirForm} />
        ))}
      </div>
    </div>
  );
}

function CultoCard({ culto, onAbrir }) {
  const sNome = culto.service_type?.name || 'Culto';
  const sHora = culto.service_type?.recurrence_time ? String(culto.service_type.recurrence_time).slice(0,5) : '';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{sNome}</p>
          <p className="text-xs text-muted-foreground">
            {fmtData(culto.data)}{sHora ? ` · ${sHora}` : ''}
          </p>
        </div>
        <Calendar className="h-5 w-5 text-muted-foreground/50" />
      </div>

      <div className="divide-y divide-border">
        <AmbienteRow
          icon={<Users className="h-5 w-5" />}
          color={C.primary}
          label="Templo (adultos)"
          info={culto.templo}
          locked={false}
          onClick={() => onAbrir(culto, 'templo')}
        />
        {culto.kids.habilitado && (
          <AmbienteRow
            icon={<Heart className="h-5 w-5" />}
            color={C.kids}
            label="Kids"
            info={culto.kids}
            locked={false}
            onClick={() => onAbrir(culto, 'kids')}
          />
        )}
      </div>
    </div>
  );
}

function AmbienteRow({ icon, color, label, info, onClick }) {
  const locked = info.submissao?.status === 'pendente' || info.submissao?.status === 'aprovado' || info.ja_em_cultos;
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={`w-full px-4 py-3 flex items-center gap-3 text-left transition ${locked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-secondary/40 active:bg-secondary/60'}`}
    >
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
        style={{ background: color }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        <div className="mt-1">
          <StatusBadge submissao={info.submissao} jaEmCultos={info.ja_em_cultos} />
        </div>
      </div>
      {locked ? (
        <Lock className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
