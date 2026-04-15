import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { voluntariado } from '@/api';
import { toast } from 'sonner';
import { CheckCircle2, User, Phone, CreditCard, Loader2 } from 'lucide-react';

interface Props {
  onComplete: () => void;
  initialData?: { full_name?: string; email?: string; cpf?: string; phone?: string } | null;
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function VolProfileComplete({ onComplete, initialData }: Props) {
  const [name, setName] = useState(initialData?.full_name || '');
  const [cpf, setCpf] = useState(initialData?.cpf || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [saving, setSaving] = useState(false);
  const [matched, setMatched] = useState<{ id: string; nome: string } | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Preencha seu nome completo');

    setSaving(true);
    try {
      const result = await voluntariado.me.update({
        full_name: name.trim(),
        cpf: cpf.replace(/\D/g, '') || null,
        phone: phone.replace(/\D/g, '') || null,
        email: initialData?.email || null,
      });

      if (result.membresiaMatch) {
        setMatched(result.membresiaMatch);
        toast.success(`Vinculado ao cadastro de ${result.membresiaMatch.nome}`);
        setTimeout(() => onComplete(), 2000);
      } else {
        toast.success('Perfil salvo com sucesso');
        onComplete();
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  if (matched) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">Perfil vinculado!</h2>
            <p className="text-muted-foreground">Encontramos seu cadastro como membro: <strong>{matched.nome}</strong></p>
            <p className="text-sm text-muted-foreground mt-2">Redirecionando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-[#00B39D]/10 flex items-center justify-center mb-2">
            <User className="h-6 w-6 text-[#00B39D]" />
          </div>
          <CardTitle className="text-xl">Complete seu perfil</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Precisamos de algumas informacoes para continuar
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Nome completo *
            </Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo" />
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> CPF
            </Label>
            <Input
              value={cpf}
              onChange={e => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Se voce ja e membro da CBRio, o CPF vincula seu cadastro automaticamente
            </p>
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Telefone
            </Label>
            <Input
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="(21) 99999-9999"
              inputMode="tel"
            />
          </div>

          <Button
            className="w-full bg-[#00B39D] hover:bg-[#00B39D]/90 mt-2"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar e continuar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
