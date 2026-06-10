import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { Check, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { prepararParaEdicao, recortarImagem } from '../lib/imageUpload';

/**
 * Editor de foto de perfil: recorte circular com zoom (slider + pinça/scroll)
 * e arrastar pra enquadrar. Recebe o File cru escolhido pelo usuário (converte
 * HEIC do iPhone antes de exibir), e devolve em onConfirmar um File JPEG
 * quadrado já recortado e otimizado (máx. 1024px), pronto pro upload.
 *
 * Componente inline (sem Dialog próprio) pra poder viver tanto dentro de um
 * Dialog dedicado (Meu Perfil) quanto trocando o corpo de um modal já aberto
 * (convite do primeiro acesso) sem empilhar modais.
 */
export default function FotoCropper({ file, onConfirmar, onCancelar, confirmando = false }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [arquivoPronto, setArquivoPronto] = useState(null);
  const [erro, setErro] = useState('');
  const [status, setStatus] = useState('Preparando foto...');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [recortando, setRecortando] = useState(false);
  const areaRef = useRef(null);

  useEffect(() => {
    let cancelado = false;
    let url = null;
    setImageUrl(null);
    setArquivoPronto(null);
    setErro('');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    areaRef.current = null;
    (async () => {
      try {
        const pronto = await prepararParaEdicao(file, {
          onProgress: (etapa) => {
            if (etapa === 'convertendo') setStatus('Convertendo foto do iPhone...');
          },
        });
        if (cancelado) return;
        url = URL.createObjectURL(pronto);
        setArquivoPronto(pronto);
        setImageUrl(url);
        setStatus('');
      } catch (e) {
        if (!cancelado) setErro(e?.message || 'Não consegui abrir a imagem');
      }
    })();
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  const onCropComplete = useCallback((_area, areaPixels) => {
    areaRef.current = areaPixels;
  }, []);

  async function confirmar() {
    if (!arquivoPronto || !areaRef.current) return;
    setRecortando(true);
    try {
      const recortado = await recortarImagem(arquivoPronto, areaRef.current);
      await onConfirmar(recortado);
    } catch (e) {
      setErro(e?.message || 'Erro ao recortar a foto');
    } finally {
      setRecortando(false);
    }
  }

  if (erro) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive text-center">{erro}</p>
        <Button variant="outline" className="w-full" onClick={onCancelar}>
          Voltar
        </Button>
      </div>
    );
  }

  const ocupado = recortando || confirmando;

  return (
    <div className="space-y-4">
      <div className="relative w-full h-72 rounded-lg overflow-hidden bg-zinc-900">
        {imageUrl ? (
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            minZoom={1}
            maxZoom={4}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        ) : (
          <div className="h-full flex items-center justify-center gap-2 text-sm text-white/80">
            <Loader2 className="h-4 w-4 animate-spin" />
            {status || 'Preparando foto...'}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
        <Slider
          value={[zoom]}
          min={1}
          max={4}
          step={0.01}
          onValueChange={([v]) => setZoom(v)}
          disabled={!imageUrl || ocupado}
          aria-label="Zoom da foto"
        />
        <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Arraste pra enquadrar · dê zoom pelo controle, pinça ou scroll
      </p>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={confirmar} disabled={!imageUrl || ocupado}>
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
          {confirmando ? 'Enviando...' : 'Usar foto'}
        </Button>
      </div>
    </div>
  );
}
