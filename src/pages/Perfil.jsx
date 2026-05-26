import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTutorial } from '../contexts/TutorialContext';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { auth } from '../api';
import { Camera, ShieldCheck, FileText, KeyRound, GraduationCap, Check, RotateCcw } from 'lucide-react';
import TrocarSenhaForm from '../components/auth/TrocarSenhaForm';
import { processarImagemPerfil, isHeic } from '../lib/imageUpload';
import { getQualifyingTours } from '../data/tutorials';

function mascaraTelefone(v) {
  const d = (v || '').replace(/\D+/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Perfil() {
  const auth_ctx = useAuth();
  const { profile, role, cargoNome, refreshProfile } = auth_ctx;
  const cargoLabel = cargoNome || role || 'Membro';
  const navigate = useNavigate();
  const tutorial = useTutorial();
  const meusTours = getQualifyingTours(auth_ctx);
  const [telefone, setTelefone] = useState(profile?.telefone || '');
  const [savingTel, setSavingTel] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [statusFoto, setStatusFoto] = useState('');
  const fileInputRef = useRef(null);

  const initials = (profile?.name || '??')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function handleFotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ehHeic = isHeic(file);
    if (!file.type.startsWith('image/') && !ehHeic) {
      toast.error('Selecione uma imagem');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('Imagem precisa ter no maximo 25 MB');
      return;
    }
    setUploadingFoto(true);
    setStatusFoto(ehHeic ? 'Convertendo foto do iPhone...' : 'Preparando foto...');
    try {
      const pronto = await processarImagemPerfil(file, {
        onProgress: (etapa) => {
          if (etapa === 'convertendo') setStatusFoto('Convertendo foto do iPhone...');
          else if (etapa === 'comprimindo') setStatusFoto('Otimizando foto...');
        },
      });
      setStatusFoto('Enviando foto...');
      await auth.uploadFoto(pronto);
      await refreshProfile?.();
      toast.success('Foto atualizada');
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar foto');
    } finally {
      setUploadingFoto(false);
      setStatusFoto('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function salvarTelefone() {
    if (!profile?.id || !supabase) return;
    setSavingTel(true);
    try {
      const digits = telefone.replace(/\D+/g, '');
      if (digits && digits.length < 10) {
        toast.error('Telefone invalido. Informe DDD + numero.');
        setSavingTel(false);
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .update({ telefone: digits ? mascaraTelefone(digits) : null })
        .eq('id', profile.id);
      if (error) throw error;
      toast.success('Telefone atualizado · voce passa a receber notificacoes no WhatsApp');
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSavingTel(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative group">
            <Avatar className="h-20 w-20">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={profile.name || ''} /> : null}
              <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFoto}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground border-2 border-card shadow-md flex items-center justify-center hover:scale-105 transition disabled:opacity-50"
              title="Trocar foto"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              onChange={handleFotoChange}
              className="hidden"
            />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{profile?.name || '—'}</h2>
            <p className="text-sm text-muted-foreground">{profile?.email || '—'}</p>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary mt-1 inline-block">
              {cargoLabel}
            </span>
            {uploadingFoto ? <p className="text-xs text-muted-foreground mt-1">{statusFoto || 'Enviando foto...'}</p> : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <p className="text-sm text-foreground mt-1">{profile?.name || '—'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-mail</label>
              <p className="text-sm text-foreground mt-1">{profile?.email || '—'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Área</label>
              <p className="text-sm text-foreground mt-1">{profile?.area || '—'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cargo</label>
              <p className="text-sm text-foreground mt-1">{cargoNome || role || '—'}</p>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <label className="text-xs font-medium text-muted-foreground">Celular (WhatsApp)</label>
            <p className="text-xs text-muted-foreground/80 mt-1 mb-2">
              Usado para enviar atualizacoes de pedidos do Mercado Livre vinculados as suas solicitacoes.
            </p>
            <div className="flex gap-2">
              <Input
                value={telefone}
                onChange={e => setTelefone(mascaraTelefone(e.target.value))}
                placeholder="(21) 99999-9999"
                className="max-w-xs"
                inputMode="tel"
                autoComplete="tel"
                maxLength={16}
              />
              <Button
                size="sm"
                onClick={salvarTelefone}
                disabled={savingTel || telefone === (profile?.telefone || '')}
              >
                {savingTel ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Card · tutoriais */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Tutoriais guiados</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Refaça os tours dos módulos que você usa. Útil pra revisar o que cada botão faz.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {meusTours.map((t) => {
            const completo = tutorial.completedTours.has(t.id);
            const rota = typeof t.route === 'string' ? t.route : null;
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border bg-background"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {completo ? (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-amber-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                    {rota && (
                      <p className="text-[11px] text-muted-foreground truncate">{rota}</p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await tutorial.restartTour(t.id);
                    if (rota && rota !== '/perfil') navigate(rota);
                  }}
                  className="flex-shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  {completo ? 'Refazer' : 'Iniciar'}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card · trocar senha */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Alterar senha</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Informe a senha atual e escolha uma nova de pelo menos 6 caracteres.
            </p>
          </div>
        </div>
        <TrocarSenhaForm />
      </div>

      {/* Card LGPD · direitos do titular */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Seus dados · LGPD</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lei Geral de Proteção de Dados (Lei 13.709/2018)
            </p>
          </div>
        </div>

        <div className="space-y-3 text-sm text-foreground/90">
          <p>
            A CBRio respeita seus direitos como titular dos seus dados pessoais.
            Você pode solicitar a qualquer momento:
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground pl-4">
            <li className="flex items-start gap-2">
              <FileText className="h-3.5 w-3.5 mt-0.5 text-primary flex-shrink-0" />
              <span>
                <strong className="text-foreground">Acesso</strong> · um relatório completo
                com todos os seus dados que armazenamos
              </span>
            </li>
            <li className="flex items-start gap-2">
              <FileText className="h-3.5 w-3.5 mt-0.5 text-primary flex-shrink-0" />
              <span>
                <strong className="text-foreground">Correção</strong> · ajustes em dados
                desatualizados ou incorretos
              </span>
            </li>
            <li className="flex items-start gap-2">
              <FileText className="h-3.5 w-3.5 mt-0.5 text-primary flex-shrink-0" />
              <span>
                <strong className="text-foreground">Exclusão</strong> · remoção de dados que
                não sejam necessários para fins legítimos (financeiros, fiscais, históricos)
              </span>
            </li>
          </ul>
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-3">
            <p className="text-sm text-foreground">
              <strong>Como solicitar:</strong> presencialmente na secretaria da CBRio
              (com documento de identidade) ou por telefone (CPF + dados do contato
              cadastrado serão verificados). Resposta em até 15 dias úteis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
