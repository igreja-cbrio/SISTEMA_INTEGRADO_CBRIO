import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { voluntariado } from '@/api';
import { toast } from 'sonner';
import {
  User, Mail, Phone, IdCard, Scan, Camera, SwitchCamera, Loader2, CheckCircle2, Save,
  UserPlus, AlertCircle,
} from 'lucide-react';
import { useFaceDetection } from './hooks';

function useMe() {
  return useQuery({
    queryKey: ['vol', 'me'],
    queryFn: () => voluntariado.me.get(),
  });
}

function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { full_name?: string; cpf?: string; phone?: string; email?: string }) =>
      voluntariado.me.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'me'] }),
  });
}

function useRegisterMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { nome: string; sobrenome: string; cpf: string; celular: string }) =>
      (voluntariado.me as any).registerMember(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'me'] }),
  });
}

function useSaveMyFace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { descriptor: number[]; photo_url?: string }) =>
      (voluntariado.me as any).saveFace(data.descriptor, data.photo_url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'me'] }),
  });
}

export default function VolMeuPerfil() {
  const { data: meData, isLoading } = useMe();
  const updateMe = useUpdateMe();
  const registerMember = useRegisterMember();
  const saveFace = useSaveMyFace();
  const {
    videoRef, canvasRef, isLoading: faceLoading, isDetecting,
    startCamera, stopCamera, detectFace, switchCamera,
  } = useFaceDetection();

  const [editMode, setEditMode] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');

  const [cameraActive, setCameraActive] = useState(false);
  const [faceStatus, setFaceStatus] = useState('');

  // Dialog de cadastro de membro (quando o CPF nao existe em mem_membros)
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [regNome, setRegNome] = useState('');
  const [regSobrenome, setRegSobrenome] = useState('');
  const [regCpf, setRegCpf] = useState('');
  const [regCelular, setRegCelular] = useState('');

  const profile = meData?.profile;
  const hasFace = !!profile?.face_descriptor;

  const beginEdit = () => {
    setFullName(profile?.full_name || '');
    setPhone(profile?.phone || '');
    setCpf(profile?.cpf || '');
    setEditMode(true);
  };

  const openMemberDialog = (triedCpf: string) => {
    // pre-preenche a partir do que o usuario ja tinha digitado
    const [first, ...rest] = (fullName.trim() || profile?.full_name || '').split(/\s+/);
    setRegNome(first || '');
    setRegSobrenome(rest.join(' ') || '');
    setRegCpf(triedCpf || cpf.replace(/\D/g, ''));
    setRegCelular(phone.replace(/\D/g, '') || profile?.phone || '');
    setMemberDialogOpen(true);
  };

  const handleSave = () => {
    if (!fullName.trim()) return toast.error('Nome obrigatorio');
    updateMe.mutate(
      { full_name: fullName.trim(), phone: phone.replace(/\D/g, '') || undefined, cpf: cpf.replace(/\D/g, '') || undefined },
      {
        onSuccess: () => { toast.success('Perfil atualizado'); setEditMode(false); },
        onError: (err: any) => {
          if (err?.code === 'MEMBER_NOT_FOUND') {
            openMemberDialog(err.cpf || cpf.replace(/\D/g, ''));
            return;
          }
          toast.error(err?.message || 'Erro ao atualizar');
        },
      }
    );
  };

  const handleRegisterMember = () => {
    if (!regNome.trim()) return toast.error('Nome obrigatorio');
    if (!regSobrenome.trim()) return toast.error('Sobrenome obrigatorio');
    const cleanCpf = regCpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) return toast.error('CPF invalido');
    const cleanCel = regCelular.replace(/\D/g, '');
    if (cleanCel.length < 10) return toast.error('Celular invalido');

    registerMember.mutate(
      { nome: regNome.trim(), sobrenome: regSobrenome.trim(), cpf: cleanCpf, celular: cleanCel },
      {
        onSuccess: () => {
          toast.success('Cadastro realizado e perfil vinculado');
          setMemberDialogOpen(false);
          setEditMode(false);
        },
        onError: (err: any) => toast.error(err?.message || 'Erro ao cadastrar membro'),
      }
    );
  };

  const handleStartCamera = async () => {
    await startCamera();
    setCameraActive(true);
    setFaceStatus('Posicione seu rosto no centro e clique em Capturar.');
  };

  const handleCapture = useCallback(async () => {
    setFaceStatus('Detectando rosto...');
    const descriptor = await detectFace();
    if (!descriptor) {
      setFaceStatus('Nenhum rosto detectado. Tente novamente com boa iluminacao.');
      return;
    }
    setFaceStatus('Salvando reconhecimento facial...');
    try {
      await saveFace.mutateAsync({ descriptor: Array.from(descriptor) });
      setFaceStatus('Reconhecimento facial salvo! Voce ja pode fazer check-in pelo rosto.');
      toast.success('Reconhecimento facial salvo');
      stopCamera();
      setCameraActive(false);
    } catch (err: any) {
      setFaceStatus(err?.message || 'Erro ao salvar');
      toast.error('Erro ao salvar reconhecimento facial');
    }
  }, [detectFace, saveFace, stopCamera]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Perfil de voluntario nao encontrado.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>

      {/* Dados pessoais */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" /> Dados pessoais
          </CardTitle>
          {!editMode && (
            <Button size="sm" variant="outline" onClick={beginEdit}>Editar</Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!editMode ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{profile.full_name || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{profile.email || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{profile.phone || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <IdCard className="h-4 w-4" />
                <span>{profile.cpf ? profile.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Nome completo</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(21) 99999-9999" />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setEditMode(false)} disabled={updateMe.isPending}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} disabled={updateMe.isPending} className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90">
                  {updateMe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconhecimento facial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Scan className="h-5 w-5" /> Reconhecimento facial
            {hasFace && (
              <Badge className="ml-2 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {hasFace
              ? 'Ja existe uma foto cadastrada. Voce pode atualizar capturando novamente.'
              : 'Cadastre seu rosto para fazer check-in sem precisar do QR code.'}
          </p>

          <div className="relative w-full max-w-sm mx-auto aspect-[4/3] bg-black/10 rounded-lg overflow-hidden">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {faceLoading && cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/60 text-muted-foreground text-sm">
                Camera desligada
              </div>
            )}
          </div>

          {faceStatus && (
            <p className="text-sm text-center text-muted-foreground">{faceStatus}</p>
          )}

          <div className="flex gap-2 justify-center flex-wrap">
            {!cameraActive ? (
              <Button onClick={handleStartCamera} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90">
                <Camera className="h-4 w-4" />
                {hasFace ? 'Atualizar foto' : 'Cadastrar foto'}
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleCapture}
                  disabled={isDetecting || saveFace.isPending}
                  className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90"
                >
                  {isDetecting || saveFace.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Scan className="h-4 w-4" />}
                  Capturar
                </Button>
                <Button variant="outline" onClick={switchCamera} size="icon">
                  <SwitchCamera className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => { stopCamera(); setCameraActive(false); setFaceStatus(''); }}
                >
                  Parar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de cadastro obrigatorio de membro */}
      <Dialog
        open={memberDialogOpen}
        onOpenChange={(open) => { if (!registerMember.isPending) setMemberDialogOpen(open); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[#00B39D]" /> Cadastro de membro
            </DialogTitle>
            <DialogDescription>
              Esse CPF ainda nao esta cadastrado na membresia da CBRio. Preencha os dados
              abaixo para concluir o cadastro e vincular ao seu perfil de voluntario.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-900/10 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-yellow-800 dark:text-yellow-300">
              Todos os campos sao obrigatorios.
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={regNome}
                  onChange={(e) => setRegNome(e.target.value)}
                  placeholder="Maria"
                  disabled={registerMember.isPending}
                />
              </div>
              <div>
                <Label>Sobrenome</Label>
                <Input
                  value={regSobrenome}
                  onChange={(e) => setRegSobrenome(e.target.value)}
                  placeholder="Silva"
                  disabled={registerMember.isPending}
                />
              </div>
            </div>
            <div>
              <Label>CPF</Label>
              <Input
                value={regCpf}
                onChange={(e) => setRegCpf(e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
                disabled={registerMember.isPending}
              />
            </div>
            <div>
              <Label>Celular</Label>
              <Input
                value={regCelular}
                onChange={(e) => setRegCelular(e.target.value)}
                placeholder="(21) 99999-9999"
                inputMode="tel"
                disabled={registerMember.isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMemberDialogOpen(false)}
              disabled={registerMember.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRegisterMember}
              disabled={registerMember.isPending}
              className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90"
            >
              {registerMember.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <UserPlus className="h-4 w-4" />}
              Concluir cadastro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
