// ============================================================================
// Totem Kids · Modal "Editar etiqueta" (simples · Marcos 2026-07-23)
// ============================================================================
// Auto-serviço SEGURO pra equipe do Kids: só TAMANHO geral + LOGO. Tudo o que é
// crítico (código de segurança, alerta de saúde, posições, cores) fica TRAVADO —
// não vira opção. A prévia é HONESTA (tamanho real 90x29mm, preto-e-branco,
// dados de PIOR CASO) pra o que sairia esquisito na Brother já aparecer aqui,
// antes de imprimir. Sem drag-and-drop/canvas de propósito (conselho 2026-07-23:
// numa etiqueta térmica de segurança, editor livre é armadilha — a consistência
// do layout É o controle de segurança). O editor AVANÇADO (fonte, tamanho do
// nome, dados de teste) segue no admin (/admin/totem-kids · aba Etiqueta).
// ============================================================================

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Baby, Loader2, Upload, Trash2, Printer, RotateCcw, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { imprimirEtiquetas, gerarHtmlPreviewCrianca, gerarHtmlPreviewAniversario } from './lib/imprimir';
import type { DadosImpressao, EtiquetaLayout } from './lib/imprimir';

type Cfg = { nome_tamanho: string; fonte: string; escala_fonte: string; logo_aniversario_url?: string | null };
const PADRAO: Cfg = { nome_tamanho: 'auto', fonte: 'sans', escala_fonte: 'M', logo_aniversario_url: null };
const TAMANHOS: { v: string; label: string }[] = [
  { v: 'P', label: 'Pequeno' }, { v: 'M', label: 'Médio' }, { v: 'G', label: 'Grande' }, { v: 'GG', label: 'Extra' },
];

function lerArquivoComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    r.readAsDataURL(file);
  });
}

export default function EditarEtiquetaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cfg, setCfg] = useState<Cfg>(PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const logoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setCarregando(true);
    totemKids.etiquetaConfig.get()
      .then((c: Cfg | null) => {
        if (c) setCfg({
          nome_tamanho: c.nome_tamanho || 'auto', fonte: c.fonte || 'sans',
          escala_fonte: c.escala_fonte || 'M', logo_aniversario_url: c.logo_aniversario_url || null,
        });
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [open]);

  // Dados de PIOR CASO: nome comprido + alergia comprida + necessidade + SEM foto
  // (câmera cortada) → a linha mais apertada aparece antes de imprimir de verdade.
  const dadosPiorCaso: DadosImpressao = {
    checkinId: 'preview',
    crianca: {
      nome: 'Maria Eduarda Constança de Albuquerque',
      idadeLabel: '4 anos', idadeAnos: 4,
      salaNome: 'Infantil 2', salaCor: '#EC4899',
      observacoesMedicas: null,
      alergia: 'amendoim, leite, ovo, frutos do mar',
      necessidade: 'Espectro',
      fotoAutorizada: false,
      aniversarioSemana: false,
    },
    responsavel: { nome: 'Cláudia dos Santos Albuquerque' },
    codigoSeguranca: 'W8K3', codigoBarras: 'W8K3',
    dataHora: '', cultoNome: 'Domingo 10:00', cultoDiaHora: 'Domingo 10:00',
    layout: { fonte: cfg.fonte, escalaFonte: cfg.escala_fonte, nomeTamanho: cfg.nome_tamanho } as EtiquetaLayout,
    logoAniversarioUrl: cfg.logo_aniversario_url || null,
  };

  async function salvar() {
    setSalvando(true);
    try {
      await totemKids.etiquetaConfig.save(cfg);
      toast.success('Tamanho salvo · vale pras próximas impressões');
      onClose();
    } catch (e) { toast.error((e as { message?: string })?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  async function restaurarPadrao() {
    const novo = { ...cfg, escala_fonte: 'M' };
    setCfg(novo);
    setSalvando(true);
    try { await totemKids.etiquetaConfig.save(novo); toast.success('Tamanho voltou ao padrão (Médio)'); }
    catch (e) { toast.error((e as { message?: string })?.message || 'Erro ao restaurar'); }
    finally { setSalvando(false); }
  }

  async function enviarLogo(file?: File | null) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast.error('Use PNG, JPG ou WEBP');
    if (file.size > 3 * 1024 * 1024) return toast.error('Imagem muito grande (máx 3MB)');
    setEnviandoLogo(true);
    try {
      const dataUrl = await lerArquivoComoDataUrl(file);
      const { logo_aniversario_url } = await totemKids.etiquetaConfig.uploadLogoAniversario(dataUrl);
      setCfg(c => ({ ...c, logo_aniversario_url }));
      toast.success('Logo salva');
    } catch (e) { toast.error((e as { message?: string })?.message || 'Erro ao salvar a logo'); }
    finally { setEnviandoLogo(false); }
  }

  async function removerLogo() {
    setEnviandoLogo(true);
    try {
      await totemKids.etiquetaConfig.removerLogoAniversario();
      setCfg(c => ({ ...c, logo_aniversario_url: null }));
      toast.success('Logo removida');
    } catch (e) { toast.error((e as { message?: string })?.message || 'Erro ao remover'); }
    finally { setEnviandoLogo(false); }
  }

  async function imprimirTeste() {
    setImprimindo(true);
    try {
      await imprimirEtiquetas(dadosPiorCaso, false, true);
      toast.success('Impressão de teste enviada · confira a Brother');
    } catch (e) { toast.error((e as { message?: string })?.message || 'Erro ao imprimir'); }
    finally { setImprimindo(false); }
  }

  const previewStyle: CSSProperties = {
    width: '90mm', height: '29mm', border: '1px solid #ccc', background: '#fff',
    display: 'block', filter: 'grayscale(1) contrast(1.35)',
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Baby className="h-5 w-5 text-pink-500" /> Editar etiqueta</DialogTitle>
          <DialogDescription>
            Ajuste o tamanho geral e a logo. O código de segurança e o alerta de saúde são fixos e sempre aparecem.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-pink-500" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
            {/* Tamanho geral */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tamanho geral</label>
              <div className="flex gap-2">
                {TAMANHOS.map(s => (
                  <button
                    key={s.v} type="button" onClick={() => setCfg(c => ({ ...c, escala_fonte: s.v }))}
                    className={`flex-1 h-11 rounded-lg border text-sm font-semibold transition-colors ${
                      cfg.escala_fonte === s.v
                        ? 'border-pink-500 bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300'
                        : 'bg-card hover:border-pink-300'}`}
                  >{s.label}</button>
                ))}
              </div>
            </div>

            {/* Logo */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Logo (recibo e etiqueta de aniversário)</label>
              <div className="flex items-center gap-3">
                <div className="h-12 w-20 rounded border bg-white flex items-center justify-center overflow-hidden shrink-0">
                  {cfg.logo_aniversario_url
                    ? <img src={cfg.logo_aniversario_url} alt="" className="max-h-full max-w-full object-contain" />
                    : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                </div>
                <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={e => { enviarLogo(e.target.files?.[0]); e.target.value = ''; }} />
                <Button size="sm" variant="outline" disabled={enviandoLogo} onClick={() => logoRef.current?.click()}>
                  {enviandoLogo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  {cfg.logo_aniversario_url ? 'Trocar logo' : 'Enviar logo'}
                </Button>
                {cfg.logo_aniversario_url && (
                  <Button size="sm" variant="ghost" disabled={enviandoLogo} onClick={removerLogo}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Use imagem simples de alto contraste — a impressora é preto-e-branco (foto/cor/gradiente viram borrão).
              </p>
            </div>

            {/* Prévia honesta */}
            <div className="space-y-2 border-t pt-3">
              <div className="text-sm font-medium">Prévia — como sai na impressora</div>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Tamanho real (90×29mm), preto-e-branco, com um nome comprido e uma alergia comprida (pior caso) pra você ver se cabe.
              </p>
              <div className="rounded-lg border bg-neutral-100 dark:bg-neutral-800 p-3 space-y-2 overflow-x-auto">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Etiqueta da criança</div>
                <iframe title="Prévia da etiqueta da criança" srcDoc={gerarHtmlPreviewCrianca(dadosPiorCaso)} style={previewStyle} />
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">Etiqueta de aniversário (mostra a logo)</div>
                <iframe title="Prévia da etiqueta de aniversário" srcDoc={gerarHtmlPreviewAniversario(dadosPiorCaso)} style={previewStyle} />
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button variant="outline" size="sm" disabled={imprimindo || carregando} onClick={imprimirTeste}>
            {imprimindo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />} Imprimir teste
          </Button>
          <Button variant="ghost" size="sm" disabled={salvando || carregando} onClick={restaurarPadrao}>
            <RotateCcw className="h-4 w-4 mr-1" /> Restaurar padrão
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={salvando}>Fechar</Button>
            <Button className="bg-pink-600 hover:bg-pink-700 text-white" onClick={salvar} disabled={salvando || carregando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
