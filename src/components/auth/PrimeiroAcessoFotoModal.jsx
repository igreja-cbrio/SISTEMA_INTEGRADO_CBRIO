import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Camera, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../../api';
import { isHeic } from '../../lib/imageUpload';
import FotoCropper from '../FotoCropper';

/**
 * No primeiro acesso, convida (sem obrigar) a pessoa a subir a foto de perfil.
 * Aparece quando o usuário ainda não tem `avatar_url`. Não bloqueia o uso do
 * sistema e some pra sempre quando a foto é adicionada (aí avatar_url passa a
 * existir) ou quando a pessoa escolhe "Agora não" (lembrado por usuário neste
 * dispositivo). Espera o modal de troca de senha (mais importante) sair antes
 * de aparecer, pra não empilhar dois modais no primeiro login.
 *
 * Ao escolher o arquivo, o corpo do modal vira o editor (cortar/zoom/enquadrar)
 * e o upload só acontece depois do recorte.
 */
export default function PrimeiroAcessoFotoModal() {
  const { user, profile, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fotoParaEditar, setFotoParaEditar] = useState(null);
  const fileRef = useRef(null);

  const dismissKey = profile?.id ? `cbrio_foto_prompt_dismissed_${profile.id}` : null;

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.avatar_url) return; // já tem foto
    // Não colidir com o modal de troca de senha (login email sem senha trocada).
    const provider = user?.app_metadata?.provider;
    if ((!provider || provider === 'email') && !profile.password_changed_at) return;
    try {
      if (dismissKey && localStorage.getItem(dismissKey) === '1') return;
    } catch { /* ignore */ }
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, [user, profile, dismissKey]);

  function dispensar() {
    try { if (dismissKey) localStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
    setFotoParaEditar(null);
    setOpen(false);
  }

  function aoEscolherArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !isHeic(file)) {
      toast.error('Selecione uma imagem');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('Imagem precisa ter no máximo 25 MB');
      return;
    }
    // Abre o editor (cortar/zoom/enquadrar) · o upload acontece após o recorte
    setFotoParaEditar(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function enviarFotoRecortada(recortada) {
    setEnviando(true);
    try {
      await auth.uploadFoto(recortada);
      await refreshProfile?.();
      try { if (dismissKey) localStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
      toast.success('Foto adicionada! Ficou com a sua cara. 😊');
      setFotoParaEditar(null);
      setOpen(false);
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar foto');
    } finally {
      setEnviando(false);
    }
  }

  const initials = (profile?.name || '??')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const editando = !!fotoParaEditar;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !enviando) dispensar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              {editando ? <Camera className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <DialogTitle>{editando ? 'Ajuste sua foto' : 'Deixe o sistema com a sua cara'}</DialogTitle>
          </div>
          <DialogDescription className="text-left">
            {editando ? (
              'Corte, dê zoom e enquadre a foto como preferir.'
            ) : (
              <>
                Que tal adicionar uma foto de perfil? Fica mais legal e ajuda a galera a te
                reconhecer pelo sistema. É rapidinho — e totalmente opcional, dá pra fazer
                depois em <em>Meu Perfil</em>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {editando ? (
          <FotoCropper
            file={fotoParaEditar}
            confirmando={enviando}
            onCancelar={() => setFotoParaEditar(null)}
            onConfirmar={enviarFotoRecortada}
          />
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 py-2">
              <Avatar className="h-20 w-20">
                {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={profile?.name || ''} /> : null}
                <AvatarFallback className="bg-primary/15 text-primary text-lg font-bold">{initials}</AvatarFallback>
              </Avatar>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={aoEscolherArquivo}
            />

            <div className="flex gap-2 mt-2">
              <Button variant="outline" className="flex-1" onClick={dispensar} disabled={enviando}>
                Agora não
              </Button>
              <Button className="flex-1" onClick={() => fileRef.current?.click()} disabled={enviando}>
                <Camera className="h-4 w-4 mr-2" />
                Adicionar foto
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
