import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle } from 'lucide-react';
import { cadastroPublico } from '@/api';
import MemberWalletPass from './MemberWalletPass';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-preenche o CPF (ex.: voluntario ja tem CPF na sessao) */
  initialCpf?: string;
  /** Pre-preenche a DOB (ex.: logo apos cadastro, ja temos o valor) */
  initialDob?: string;
}

function maskCpf(v: string) {
  const d = v.replace(/\D+/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Fluxo:
 *  1. Pede CPF + DOB
 *  2. Valida via /wallet/verify
 *  3. Se encontrado, renderiza <MemberWalletPass /> com os mesmos dados
 *  4. Se nao encontrado, instrui a preencher o formulario
 */
export default function MemberWalletDialog({ open, onOpenChange, initialCpf = '', initialDob = '' }: Props) {
  const [cpf, setCpf] = useState(maskCpf(initialCpf));
  const [dob, setDob] = useState(initialDob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);

  const reset = () => {
    setCpf(maskCpf(initialCpf));
    setDob(initialDob);
    setError('');
    setVerified(false);
    setBusy(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleVerify = async () => {
    const clean = cpf.replace(/\D+/g, '');
    if (clean.length !== 11) {
      setError('Digite um CPF valido (11 digitos).');
      return;
    }
    if (!dob) {
      setError('Informe sua data de nascimento.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await cadastroPublico.walletVerify(clean, dob);
      if (!r.found) {
        setError('Nao encontramos seu cadastro com esses dados. Confira ou preencha o formulario acima.');
        return;
      }
      setVerified(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar cadastro');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm bg-gray-900 border-gray-700 text-white rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img src="/logo-cbrio-icon.png" alt="CBRio" className="h-6 w-6" />
            <span style={{ fontFamily: 'iBrand, sans-serif' }}>CBRio</span>
            <span className="text-white/60 text-sm font-normal">— Meu QR de membro</span>
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {verified
              ? 'Cadastro confirmado. Escolha como quer guardar seu QR.'
              : 'Informe seu CPF e data de nascimento. Se seu cadastro ja existir, geramos seu QR.'}
          </DialogDescription>
        </DialogHeader>

        {!verified ? (
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-white/80">CPF</Label>
              <Input
                inputMode="numeric"
                autoFocus
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))}
                placeholder="000.000.000-00"
                className="bg-gray-800 border-gray-700 text-white rounded-xl"
              />
            </div>
            <div>
              <Label className="text-white/80">Data de nascimento</Label>
              <Input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white rounded-xl"
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button
              className="w-full bg-[#00B39D] hover:bg-[#00B39D]/90 min-h-[48px] rounded-xl"
              onClick={handleVerify}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar meu QR'}
            </Button>
          </div>
        ) : (
          <MemberWalletPass
            cpf={cpf.replace(/\D+/g, '')}
            dataNascimento={dob}
            inline
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
