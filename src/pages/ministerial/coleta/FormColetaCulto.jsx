import { useState } from 'react';
import { integracao as intApi } from '../../../api';
import { ArrowLeft, Minus, Plus, Users, Heart, Send, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

function fmtData(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
  const dt = new Date(y, m - 1, d);
  return `${dias[dt.getDay()]} ${String(d).padStart(2,'0')}/${meses[m-1]}`;
}

export default function FormColetaCulto({ culto, ambiente, onVoltar, onEnviado }) {
  const isKids = ambiente === 'kids';
  const cor = isKids ? '#EC4899' : '#00B39D';
  const icone = isKids ? <Heart className="h-5 w-5" /> : <Users className="h-5 w-5" />;
  const titulo = isKids ? 'Kids' : 'Templo (adultos)';

  // Contador (opcional · ajuda a contar pessoas em tempo real)
  const [contador, setContador] = useState(0);
  const [presencial, setPresencial] = useState('');
  const [decisoes, setDecisoes] = useState('');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  function inc(n = 1) { setContador(c => Math.max(0, c + n)); }
  function reset() { setContador(0); }
  function usarContador() {
    setPresencial(String(contador));
    toast.success(`Presencial preenchido com ${contador}`);
  }

  async function handleEnviar() {
    if (!presencial || Number(presencial) < 0 || !Number.isFinite(Number(presencial))) {
      toast.error('Informe a frequencia presencial');
      return;
    }
    const dec = Number(decisoes || 0);
    if (!Number.isFinite(dec) || dec < 0) {
      toast.error('Aceitacoes invalidas');
      return;
    }
    setEnviando(true);
    try {
      await intApi.coleta.submeter({
        culto_id: culto.id,
        ambiente,
        presencial: Number(presencial),
        decisoes: dec,
        observacao: observacao.trim() || null,
      });
      onEnviado?.();
    } catch (e) {
      const msg = e?.body?.error || e.message || 'Erro ao enviar';
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  const sNome = culto.service_type?.name || 'Culto';
  const sHora = culto.service_type?.recurrence_time ? String(culto.service_type.recurrence_time).slice(0,5) : '';

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={onVoltar}
          className="h-9 w-9 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">{sNome} · {fmtData(culto.data)}{sHora ? ` · ${sHora}` : ''}</p>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full flex items-center justify-center text-white" style={{ background: cor }}>
              {icone}
            </div>
            <h1 className="text-base font-bold text-foreground">{titulo}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-5">
        {/* Contador opcional */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Contador</p>
              <p className="text-xs text-muted-foreground">Use pra contar as pessoas em tempo real (opcional)</p>
            </div>
          </div>

          <div className="px-4 py-6">
            <div className="text-center mb-4">
              <div
                className="text-6xl font-bold tabular-nums"
                style={{ color: cor }}
              >
                {contador}
              </div>
              <p className="text-xs text-muted-foreground mt-1">pessoas contadas</p>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                onClick={() => inc(-1)}
                disabled={contador === 0}
                className="h-14 rounded-xl bg-secondary text-foreground font-semibold text-lg active:scale-95 transition disabled:opacity-40"
              >
                <Minus className="h-5 w-5 mx-auto" />
              </button>
              <button
                onClick={() => inc(1)}
                className="h-14 rounded-xl text-white font-semibold text-lg active:scale-95 transition"
                style={{ background: cor }}
              >
                <Plus className="h-5 w-5 mx-auto" />
              </button>
              <button
                onClick={() => inc(10)}
                className="h-14 rounded-xl text-white font-semibold text-base active:scale-95 transition"
                style={{ background: cor, opacity: 0.85 }}
              >
                +10
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={reset}
                disabled={contador === 0}
                className="flex-1 h-10 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Zerar
              </button>
              <button
                onClick={usarContador}
                disabled={contador === 0}
                className="flex-1 h-10 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 disabled:opacity-40"
              >
                Usar abaixo &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-2">
              Frequencia presencial *
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={presencial}
              onChange={(e) => setPresencial(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full text-3xl font-bold text-center py-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 tabular-nums"
              style={{ '--tw-ring-color': cor }}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground mt-1 text-center">Total de {isKids ? 'criancas' : 'adultos'} no {isKids ? 'Kids' : 'Templo'}</p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-2">
              Aceitacoes / decisoes
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={decisoes}
              onChange={(e) => setDecisoes(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full text-3xl font-bold text-center py-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 tabular-nums"
              style={{ '--tw-ring-color': cor }}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground mt-1 text-center">Quantos levantaram a mão / aceitaram a Jesus</p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-2">
              Observacao (opcional)
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Algo importante deste culto..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': cor }}
            />
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground px-4">
          Os dados vao para aprovacao do coordenador da Integracao antes de entrar nas estatisticas.
        </p>
      </div>

      {/* Bottom bar fixa · botao enviar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-3 z-20">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleEnviar}
            disabled={enviando || !presencial}
            className="w-full h-12 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
            style={{ background: cor }}
          >
            {enviando ? 'Enviando...' : (
              <>
                <Send className="h-4 w-4" /> Enviar pra aprovacao
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
