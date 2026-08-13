import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { voluntariado } from '@/api';
import { toast } from 'sonner';

function soDigitos(v: string) { return (v || '').replace(/\D+/g, ''); }

function mascaraCpf(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function mascaraTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function cpfValido(v: string) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: string, fator: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += parseInt(base[i], 10) * (fator - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(d.slice(0, 9), 10) === parseInt(d[9], 10)
      && calc(d.slice(0, 10), 11) === parseInt(d[10], 10);
}

export default function ContactCaptureDialog({ volunteerId, volunteerName, onDone }: {
  volunteerId: string;
  volunteerName: string;
  onDone: () => void;
}) {
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (cpf && !cpfValido(cpf)) return toast.error('CPF inválido');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error('Email inválido');
    if (!cpf && !phone && !email) { onDone(); return; }

    setSaving(true);
    try {
      await voluntariado.updateProfileContact(volunteerId, {
        cpf: cpf || undefined,
        phone: phone || undefined,
        email: email || undefined,
      });
      toast.success('Cadastro atualizado');
      onDone();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onDone(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Completar cadastro</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          <span className="font-medium text-foreground">{volunteerName}</span> ainda não tem CPF cadastrado.
          Aproveite o check-in pra completar (opcional).
        </p>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="cap-cpf">CPF</Label>
            <Input id="cap-cpf" inputMode="numeric" placeholder="000.000.000-00"
              value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} autoFocus />
          </div>
          <div>
            <Label htmlFor="cap-phone">Telefone (WhatsApp)</Label>
            <Input id="cap-phone" inputMode="tel" placeholder="(00) 00000-0000"
              value={phone} onChange={(e) => setPhone(mascaraTelefone(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="cap-email">Email</Label>
            <Input id="cap-email" type="email" inputMode="email" placeholder="email@exemplo.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDone} disabled={saving}>Pular</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
