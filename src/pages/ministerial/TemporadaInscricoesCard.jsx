import { useEffect, useState } from 'react';
import { grupos as api } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import { Loader2, DoorOpen, DoorClosed, Save } from 'lucide-react';

// Card de controle da TEMPORADA DE INSCRIÇÕES (flag global app_grupos_temporada).
// Quando "Aberta", os membros podem se inscrever em grupos pelo app (o app já lê
// essa flag). A escrita é guardada no backend (admin/diretor ou líder de grupos);
// `podeEditar` só desabilita os controles no front pra dar feedback.
export default function TemporadaInscricoesCard({ podeEditar = false }) {
  const [estado, setEstado] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await api.temporadaInscricoes.get();
      setEstado(d);
      setTitulo(d?.titulo || '');
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar a temporada');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function salvar(patch) {
    setSaving(true);
    try {
      const d = await api.temporadaInscricoes.set(patch);
      setEstado(d);
      if (patch.titulo === undefined) setTitulo(d?.titulo || '');
      return d;
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function toggle() {
    if (!podeEditar || saving) return;
    const nova = !estado?.aberta;
    try { await salvar({ aberta: nova }); toast.success(nova ? 'Inscrições ABERTAS' : 'Inscrições FECHADAS'); } catch { /* toast já exibido */ }
  }
  async function salvarTitulo() {
    if (!podeEditar || saving) return;
    try { await salvar({ titulo }); toast.success('Título salvo'); } catch { /* noop */ }
  }

  const aberta = !!estado?.aberta;
  const tituloMudou = (estado?.titulo || '') !== titulo;
  const ultima = estado?.atualizado_em
    ? new Date(estado.atualizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className="rounded-xl border p-4 mb-4"
      style={{
        borderColor: aberta ? '#10b98155' : 'var(--cbrio-border)',
        background: aberta ? '#10b98112' : 'var(--cbrio-card)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: aberta ? '#10b98122' : '#73737318', color: aberta ? '#10b981' : '#737373' }}
          >
            {aberta ? <DoorOpen className="h-5 w-5" /> : <DoorClosed className="h-5 w-5" />}
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Temporada de inscrições</div>
            <div className="flex items-center gap-2 mt-0.5">
              {loading ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> carregando…</span>
              ) : (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: aberta ? '#10b98122' : '#73737318', color: aberta ? '#10b981' : '#737373' }}
                >
                  {aberta ? '● Aberta' : '● Fechada'}
                </span>
              )}
              {estado?.titulo && <span className="text-xs text-muted-foreground">· {estado.titulo}</span>}
            </div>
          </div>
        </div>

        <Button
          onClick={toggle}
          disabled={!podeEditar || loading || saving}
          variant={aberta ? 'outline' : 'default'}
          className="gap-1.5"
          title={podeEditar ? undefined : 'Apenas a liderança de grupos pode alterar'}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (aberta ? <DoorClosed className="h-4 w-4" /> : <DoorOpen className="h-4 w-4" />)}
          {aberta ? 'Fechar inscrições' : 'Abrir inscrições'}
        </Button>
      </div>

      {podeEditar && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Título da temporada</label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Grupos 2026.1"
              maxLength={120}
              className="mt-1"
            />
          </div>
          <Button variant="outline" onClick={salvarTitulo} disabled={saving || !tituloMudou} className="gap-1.5">
            <Save className="h-4 w-4" /> Salvar título
          </Button>
        </div>
      )}

      <div className="mt-2 text-[11px] text-muted-foreground">
        {aberta
          ? 'Os membros podem se inscrever em grupos pelo app enquanto estiver aberta.'
          : 'Inscrições pelo app estão bloqueadas. Abra para liberar a auto-inscrição dos membros.'}
        {ultima ? ` · Última mudança: ${ultima}` : ''}
      </div>
    </div>
  );
}
