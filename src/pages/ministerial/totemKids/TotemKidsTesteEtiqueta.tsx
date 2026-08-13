// ============================================================================
// Totem Kids · Teste de Etiqueta
// ============================================================================
// Página pra gerar e visualizar as 2 etiquetas sem precisar fazer check-in.
// 2 modos:
//   - Preview · abre em popup visível (Ctrl+P pra ver dialogo)
//   - Imprimir · dispara pra impressora padrão (Brother no totem)
//
// Útil pra:
//   - Calibrar impressora Brother antes do primeiro culto
//   - Conferir layout 62x100mm
//   - Testar troca de etiqueta (DK-22251 etc)
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Eye, Printer, ArrowLeft, Loader2, Baby, Image as ImageIcon, Upload, Trash2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { imprimirEtiquetas, gerarHtmlPreviewCrianca, gerarHtmlPreviewAniversario, type EtiquetaLayout } from './lib/imprimir';
import { formatIdadeShort } from './lib/idade';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Lê um arquivo de imagem como dataURL (base64) pra mandar pro backend
function lerArquivoComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// Logos por categoria (sala) · configuração da logo que sai na etiqueta
// ============================================================================
// Cada sala do Kids é uma categoria com faixa de idade (ex.: "Elevate 1"). A
// criança é sugerida pra sala pela idade no check-in, então a logo da sala é a
// logo que sai na etiqueta daquela criança. Aqui a equipe sobe/troca/remove a
// logo de cada categoria.
export function LogosEtiquetaManager() {
  const [salas, setSalas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  async function carregar() {
    setCarregando(true);
    try { setSalas(await totemKids.salas.list()); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  async function enviar(salaId: string, file?: File | null) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast.error('Use PNG, JPG ou WEBP');
    if (file.size > 3 * 1024 * 1024) return toast.error('Imagem muito grande (máx 3MB)');
    setEnviandoId(salaId);
    try {
      const dataUrl = await lerArquivoComoDataUrl(file);
      const { logo_url } = await totemKids.salas.uploadLogo(salaId, dataUrl);
      setSalas(prev => prev.map(s => (s.id === salaId ? { ...s, logo_url } : s)));
      toast.success('Logo salva');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar a logo');
    } finally {
      setEnviandoId(null);
    }
  }

  async function remover(salaId: string) {
    setEnviandoId(salaId);
    try {
      await totemKids.salas.removerLogo(salaId);
      setSalas(prev => prev.map(s => (s.id === salaId ? { ...s, logo_url: null } : s)));
      toast.success('Logo removida');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover');
    } finally {
      setEnviandoId(null);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-semibold text-pink-700 dark:text-pink-300 flex items-center gap-2">
          <Tag className="h-4 w-4" /> Logos por categoria (sala)
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Cada sala é uma categoria por faixa de idade. A criança é encaixada na sala
          pela idade no check-in — a logo da sala é impressa na etiqueta dela.
        </p>
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : (
          <div className="space-y-2">
            {salas.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma sala cadastrada. Crie salas na aba Salas.</p>
            )}
            {salas.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2.5 border rounded-lg gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-11 w-16 rounded border bg-white flex items-center justify-center overflow-hidden shrink-0">
                    {s.logo_url
                      ? <img src={s.logo_url} alt="" className="max-h-full max-w-full object-contain" />
                      : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2 truncate">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: s.cor }} />
                      {s.nome} {!s.ativo && <span className="text-[10px] text-muted-foreground">(inativa)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatIdadeShort(s.faixa_etaria_min_meses)}–{formatIdadeShort(s.faixa_etaria_max_meses)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    ref={el => { inputsRef.current[s.id] = el; }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={e => { enviar(s.id, e.target.files?.[0]); e.target.value = ''; }}
                  />
                  <Button size="sm" variant="outline" disabled={enviandoId === s.id}
                    onClick={() => inputsRef.current[s.id]?.click()}>
                    {enviandoId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">{s.logo_url ? 'Trocar' : 'Enviar'}</span>
                  </Button>
                  {s.logo_url && (
                    <Button size="sm" variant="ghost" disabled={enviandoId === s.id} onClick={() => remover(s.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground border-t pt-2">
          PNG/JPG/WEBP até 3MB · fundo transparente (PNG) fica melhor na etiqueta.
        </p>
      </CardContent>
    </Card>
  );
}

// Form reusável de teste de etiqueta (usado na página standalone e dentro do
// modo totem do check-in). Estado próprio · não cria check-in real.
export function EtiquetaTesteForm() {
  const [criancaNome, setCriancaNome] = useState('Maria Clara Teste');
  const [salaNome, setSalaNome] = useState('Infantil 1');
  const [salaCor, setSalaCor] = useState('#EC4899');
  const [idadeLabel, setIdadeLabel] = useState('4 anos');
  const [obsMedica, setObsMedica] = useState('Alergia a amendoim');
  const [responsavelNome, setResponsavelNome] = useState('Cláudia Teste');
  const [cultoNome, setCultoNome] = useState('Domingo Manhã');
  const [codigoSeguranca, setCodigoSeguranca] = useState('F8K3');
  const [processando, setProcessando] = useState(false);
  const [fotoOk, setFotoOk] = useState(true);
  const [pagerTeste, setPagerTeste] = useState('');

  // Layout da etiqueta (config persistida · snake do backend)
  const [cfg, setCfg] = useState<{ nome_tamanho: string; fonte: string; escala_fonte: string; logo_aniversario_url?: string | null }>(
    { nome_tamanho: 'auto', fonte: 'sans', escala_fonte: 'M', logo_aniversario_url: null }
  );
  const [salvandoLayout, setSalvandoLayout] = useState(false);
  const [enviandoLogoAniv, setEnviandoLogoAniv] = useState(false);
  const logoAnivInputRef = useRef<HTMLInputElement | null>(null);

  async function enviarLogoAniv(file?: File | null) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast.error('Use PNG, JPG ou WEBP');
    if (file.size > 3 * 1024 * 1024) return toast.error('Imagem muito grande (máx 3MB)');
    setEnviandoLogoAniv(true);
    try {
      const dataUrl = await lerArquivoComoDataUrl(file);
      const { logo_aniversario_url } = await totemKids.etiquetaConfig.uploadLogoAniversario(dataUrl);
      setCfg(c => ({ ...c, logo_aniversario_url }));
      toast.success('Logo de aniversário salva');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar a logo');
    } finally {
      setEnviandoLogoAniv(false);
    }
  }
  async function removerLogoAniv() {
    setEnviandoLogoAniv(true);
    try {
      await totemKids.etiquetaConfig.removerLogoAniversario();
      setCfg(c => ({ ...c, logo_aniversario_url: null }));
      toast.success('Logo removida');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover');
    } finally {
      setEnviandoLogoAniv(false);
    }
  }

  const layout: EtiquetaLayout = {
    fonte: cfg.fonte as EtiquetaLayout['fonte'],
    escalaFonte: cfg.escala_fonte as EtiquetaLayout['escalaFonte'],
    nomeTamanho: cfg.nome_tamanho as EtiquetaLayout['nomeTamanho'],
  };

  useEffect(() => { totemKids.etiquetaConfig.get().then((c) => c && setCfg(c)).catch(() => {}); }, []);

  async function salvarLayout() {
    setSalvandoLayout(true);
    try {
      await totemKids.etiquetaConfig.save(cfg);
      toast.success('Layout salvo · vale pras próximas impressões');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar layout');
    } finally {
      setSalvandoLayout(false);
    }
  }

  // Dados da etiqueta da criança pra prévia ao vivo
  const dadosPreview = {
    checkinId: 'preview-only',
    crianca: {
      nome: criancaNome, idadeLabel, idadeAnos: 6, salaNome, salaCor,
      observacoesMedicas: obsMedica || null, alergia: obsMedica || null,
      fotoAutorizada: fotoOk, aniversarioSemana: false,
    },
    responsavel: { nome: responsavelNome },
    codigoSeguranca, codigoBarras: codigoSeguranca,
    dataHora: '', cultoNome, cultoDiaHora: cultoNome, layout,
    pagerNumero: pagerTeste || undefined,
    logoAniversarioUrl: cfg.logo_aniversario_url || null,
  };

  function gerarCodigo() {
    const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 4; i++) c += alfa[Math.floor(Math.random() * alfa.length)];
    setCodigoSeguranca(c);
  }

  async function executar(preview: boolean) {
    setProcessando(true);
    try {
      await imprimirEtiquetas({
        checkinId: 'preview-only',
        crianca: {
          nome: criancaNome,
          idadeLabel,
          salaNome,
          salaCor,
          observacoesMedicas: obsMedica || null,
          alergia: obsMedica || 'Amendoim',
          fotoAutorizada: fotoOk,
          aniversarioSemana: true,
        },
        responsavel: { nome: responsavelNome },
        codigoSeguranca,
        codigoBarras: codigoSeguranca,
        dataHora: format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
        cultoNome,
        cultoDiaHora: cultoNome,
        layout,
        pagerNumero: pagerTeste || undefined,
      }, preview);

      if (preview) {
        toast.success('2 popups abriram com as etiquetas · use Ctrl+P pra ver o preview de impressão');
      } else {
        toast.success('Impressão enviada · confira a Brother');
      }
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro');
    } finally {
      setProcessando(false);
    }
  }

  return (
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="text-sm font-semibold text-pink-700 dark:text-pink-300 flex items-center gap-2">
            <Baby className="h-4 w-4" /> Dados da etiqueta (editáveis)
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nome da criança</label>
              <Input value={criancaNome} onChange={e => setCriancaNome(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Idade (texto livre)</label>
              <Input value={idadeLabel} onChange={e => setIdadeLabel(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Sala</label>
              <Input value={salaNome} onChange={e => setSalaNome(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Cor da sala (hex)</label>
              <div className="flex gap-2 items-center">
                <Input value={salaCor} onChange={e => setSalaCor(e.target.value)} />
                <span className="h-8 w-8 rounded border" style={{ background: salaCor }} />
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Observação médica (em destaque na etiqueta da criança)</label>
              <Input value={obsMedica} onChange={e => setObsMedica(e.target.value)} placeholder="ex: alergia a amendoim · vazio = sem destaque" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Responsável</label>
              <Input value={responsavelNome} onChange={e => setResponsavelNome(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Culto</label>
              <Input value={cultoNome} onChange={e => setCultoNome(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Código segurança (4 chars)</label>
              <div className="flex gap-2">
                <Input value={codigoSeguranca} onChange={e => setCodigoSeguranca(e.target.value.toUpperCase().slice(0, 4))} maxLength={4} className="font-mono uppercase tracking-widest" />
                <Button variant="outline" size="sm" onClick={gerarCodigo}>Gerar</Button>
              </div>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input id="fotoOk" type="checkbox" checked={fotoOk} onChange={e => setFotoOk(e.target.checked)} />
              <label htmlFor="fotoOk" className="text-xs text-muted-foreground">Foto autorizada (desmarque pra ver o ícone de câmera cortada)</label>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <label htmlFor="pagerTeste" className="text-xs text-muted-foreground shrink-0">Nº do pager (só pra ver o "Pager X" na etiqueta)</label>
              <Input id="pagerTeste" value={pagerTeste} inputMode="numeric" placeholder="ex.: 12"
                onChange={e => setPagerTeste(e.target.value.replace(/\D/g, '').slice(0, 4))} className="h-8 w-24" />
            </div>
          </div>

          {/* Prévia ao vivo da etiqueta da criança (reflete logo + layout) */}
          <div className="border-t pt-4 space-y-2">
            <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Prévia da etiqueta</div>
            <div className="rounded-lg border bg-neutral-100 dark:bg-neutral-800 p-4 flex justify-center overflow-x-auto">
              <div style={{ width: '90mm', transform: 'scale(1.5)', transformOrigin: 'top center' }}>
                <iframe
                  title="Prévia da etiqueta"
                  srcDoc={gerarHtmlPreviewCrianca(dadosPreview)}
                  style={{ width: '90mm', height: '29mm', border: '1px solid #ccc', background: '#fff', display: 'block' }}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Tamanho real 90×29mm (ampliado 1,5× aqui). Muda ao vivo conforme a fonte/tamanho abaixo.</p>
          </div>

          {/* Etiqueta de aniversário · logo do Kids + prévia */}
          <div className="border-t pt-4 space-y-2">
            <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Etiqueta de aniversário</div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Sai uma etiqueta extra na semana do aniversário da criança. Suba aqui a logo do Kids que aparece nela.
            </p>
            <div className="flex items-center gap-3">
              <div className="h-12 w-20 rounded border bg-white flex items-center justify-center overflow-hidden shrink-0">
                {cfg.logo_aniversario_url
                  ? <img src={cfg.logo_aniversario_url} alt="" className="max-h-full max-w-full object-contain" />
                  : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
              </div>
              <input ref={logoAnivInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={e => { enviarLogoAniv(e.target.files?.[0]); e.target.value = ''; }} />
              <Button size="sm" variant="outline" disabled={enviandoLogoAniv} onClick={() => logoAnivInputRef.current?.click()}>
                {enviandoLogoAniv ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                {cfg.logo_aniversario_url ? 'Trocar logo' : 'Enviar logo'}
              </Button>
              {cfg.logo_aniversario_url && (
                <Button size="sm" variant="ghost" disabled={enviandoLogoAniv} onClick={removerLogoAniv}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>
            <div className="rounded-lg border bg-neutral-100 dark:bg-neutral-800 p-4 flex justify-center overflow-x-auto">
              <div style={{ width: '90mm', transform: 'scale(1.5)', transformOrigin: 'top center' }}>
                <iframe
                  title="Prévia da etiqueta de aniversário"
                  srcDoc={gerarHtmlPreviewAniversario(dadosPreview)}
                  style={{ width: '90mm', height: '29mm', border: '1px solid #ccc', background: '#fff', display: 'block' }}
                />
              </div>
            </div>
          </div>

          {/* Layout da etiqueta (persistido · vale pra impressão real) */}
          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Layout da etiqueta</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Fonte</label>
                <select className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  value={cfg.fonte} onChange={e => setCfg({ ...cfg, fonte: e.target.value })}>
                  <option value="sans">Padrão (sem serifa)</option>
                  <option value="condensada">Condensada (nomes longos)</option>
                  <option value="arredondada">Arredondada</option>
                  <option value="serif">Com serifa</option>
                  <option value="mono">Monoespaçada</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Tamanho da fonte</label>
                <select className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  value={cfg.escala_fonte} onChange={e => setCfg({ ...cfg, escala_fonte: e.target.value })}>
                  <option value="P">Pequena</option>
                  <option value="M">Média</option>
                  <option value="G">Grande</option>
                  <option value="GG">Muito grande</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Tamanho do nome</label>
                <select className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  value={cfg.nome_tamanho} onChange={e => setCfg({ ...cfg, nome_tamanho: e.target.value })}>
                  <option value="auto">Automático (cabe o nome todo)</option>
                  <option value="P">Pequeno</option>
                  <option value="M">Médio</option>
                  <option value="G">Grande</option>
                </select>
              </div>
            </div>
            <Button onClick={salvarLayout} disabled={salvandoLayout} size="sm" className="bg-pink-600 hover:bg-pink-700">
              {salvandoLayout ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar layout
            </Button>
          </div>

          <div className="border-t pt-4 flex flex-wrap gap-2">
            <Button onClick={() => executar(true)} disabled={processando} variant="outline">
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Ver preview (2 popups)
            </Button>
            <Button onClick={() => executar(false)} disabled={processando} className="bg-pink-600 hover:bg-pink-700">
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
              Imprimir teste (envia pra impressora padrão)
            </Button>
          </div>

          <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
            <p><b>Preview</b>: abre as 2 etiquetas em popups separados. Aperte Ctrl+P em cada um pra ver o preview de impressão do browser.</p>
            <p><b>Imprimir</b>: envia direto pra impressora padrão do sistema operacional (a Brother, se configurada).</p>
            <p><b>Tamanho da etiqueta</b>: 62mm × 100mm (DK-22251).</p>
          </div>
        </CardContent>
      </Card>
  );
}

export default function TotemKidsTesteEtiqueta() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Teste de Etiqueta</h1>
          <p className="text-sm text-muted-foreground">
            Calibre a impressora antes do culto · gera dados fake, NÃO cria check-in real
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/kids')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Kids
        </Button>
      </div>
      <EtiquetaTesteForm />
    </div>
  );
}
