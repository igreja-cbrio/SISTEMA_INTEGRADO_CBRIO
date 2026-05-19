import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicDevocional } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card } from '../../components/ui/card';
import { BookOpen, Loader2, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function DevocionalLogin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [err, setErr] = useState('');

  // Flag setada pelo redirect do CadastroMembresia quando a pessoa cria conta
  // mas ainda nao virou membro · entao precisa esperar admin aprovar antes
  // de ter acesso ao devocional.
  const queryParams = new URLSearchParams(window.location.search);
  const acabouDeCadastrar = queryParams.get('cadastrado') === '1';

  if (user) {
    navigate('/devocional/hoje', { replace: true });
    return null;
  }

  async function enviar() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('Informe um email valido');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      const r: any = await publicDevocional.login(email.trim().toLowerCase());
      setMaskedEmail(r.maskedEmail || email);
    } catch (e: any) {
      setErr(e.message || 'Erro ao enviar link');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--cbrio-bg)' }}>
      <Card className="w-full max-w-md p-6 space-y-5">
        <div className="text-center">
          <div className="inline-flex p-3 rounded-full bg-primary/10 mb-3">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Devocional CBRio</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesse com seu email cadastrado pra ler o devocional do dia</p>
        </div>

        {acabouDeCadastrar && !maskedEmail && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-center">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Cadastro recebido!</p>
            <p className="text-xs text-muted-foreground mt-1">
              Um lider vai aprovar seu cadastro e voce recebera um aviso por email assim que poder entrar.
            </p>
          </div>
        )}

        {maskedEmail ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center space-y-2">
            <Mail className="h-8 w-8 mx-auto text-primary" />
            <p className="text-sm font-medium">Link enviado!</p>
            <p className="text-xs text-muted-foreground">
              Verifique sua caixa de entrada em <strong>{maskedEmail}</strong> e clique no link pra entrar.
            </p>
            <p className="text-xs text-muted-foreground">Pode demorar ate 1min · cheque tambem o spam.</p>
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                onKeyDown={e => e.key === 'Enter' && enviar()}
              />
            </div>

            {err && <p className="text-sm text-destructive">{err}</p>}

            <Button onClick={enviar} disabled={busy || !email} className="w-full">
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : 'Receber link de acesso'}
            </Button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou</span></div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/cadastro-membresia?from=devocional')}
            >
              Criar conta na CBRio
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Ainda nao tem cadastro? Toque em "Criar conta" e preencha o formulario de membresia.
              Quem ja e membro, basta digitar o email e clicar em "Receber link".
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
