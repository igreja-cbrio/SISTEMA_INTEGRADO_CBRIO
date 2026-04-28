import { useState, useEffect } from 'react';
import { next as nextApi } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Loader2, CheckCircle2, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const C = { primary: '#00B39D' };

type Evento = { id: string; data: string; titulo?: string };

function maskCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

export default function InscricaoNext() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [form, setForm] = useState({
    evento_id: '',
    nome: '', sobrenome: '',
    cpf: '', telefone: '', email: '',
    data_nascimento: '',
    observacoes: '',
    website: '', // honeypot
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    nextApi.publicEventos().then((evs: Evento[]) => {
      setEventos(evs || []);
      if (evs && evs[0]) setForm(f => ({ ...f, evento_id: evs[0].id }));
    }).catch(() => {});
  }, []);

  const setField = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = maskCpf(v);
    if (k === 'telefone') v = maskPhone(v);
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || form.nome.trim().length < 2) return toast.error('Informe seu nome');
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return toast.error('Email invalido');
    if (!form.telefone || form.telefone.replace(/\D/g, '').length < 10) return toast.error('Telefone invalido');

    setSubmitting(true);
    try {
      await nextApi.publicInscrever({
        evento_id: form.evento_id || null,
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim() || null,
        cpf: form.cpf || null,
        telefone: form.telefone,
        email: form.email,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes || null,
        website: form.website,
      });
      setSuccess(true);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar inscricao');
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--cbrio-bg)' }}>
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full flex items-center justify-center" style={{ background: `${C.primary}20` }}>
            <CheckCircle2 className="h-8 w-8" style={{ color: C.primary }} />
          </div>
          <h1 className="text-xl font-bold text-foreground">Inscricao confirmada!</h1>
          <p className="text-sm text-muted-foreground">
            Voce esta inscrito(a) no NEXT. Em breve nossa equipe entrara em contato com mais detalhes.
          </p>
          <p className="text-xs text-muted-foreground">
            Nos vemos no domingo!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--cbrio-bg)' }}>
      <div className="max-w-xl mx-auto space-y-6">
        <header className="text-center pt-8">
          <h1 className="text-3xl font-bold text-foreground">Inscricao no NEXT</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            O NEXT e a porta de entrada da CBRio — onde voce conhece nossa cultura,
            como funciona cada area e descobre como dar os proximos passos.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 space-y-4">
          {/* Honeypot */}
          <input type="text" name="website" value={form.website} onChange={setField('website')} className="hidden" tabIndex={-1} autoComplete="off" />

          {eventos.length > 0 && (
            <div>
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Em qual domingo voce vai participar?
              </Label>
              <select
                value={form.evento_id}
                onChange={e => setForm(f => ({ ...f, evento_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-input text-foreground text-sm mt-1"
              >
                {eventos.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {new Date(ev.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={setField('nome')} required />
            </div>
            <div>
              <Label>Sobrenome</Label>
              <Input value={form.sobrenome} onChange={setField('sobrenome')} />
            </div>
          </div>

          <div>
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={setField('email')} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Telefone *</Label>
              <Input value={form.telefone} onChange={setField('telefone')} placeholder="(00) 00000-0000" required />
            </div>
            <div>
              <Label>CPF (opcional)</Label>
              <Input value={form.cpf} onChange={setField('cpf')} placeholder="000.000.000-00" />
            </div>
          </div>

          <div>
            <Label>Data de nascimento (opcional)</Label>
            <Input type="date" value={form.data_nascimento} onChange={setField('data_nascimento')} />
          </div>

          <div>
            <Label>Quer compartilhar algo com a gente? (opcional)</Label>
            <Textarea value={form.observacoes} onChange={setField('observacoes')} rows={3} placeholder="Como nos conheceu, o que espera do NEXT, etc." />
          </div>

          <Button type="submit" disabled={submitting} className="w-full gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar inscricao
          </Button>

          <p className="text-[10px] text-center text-muted-foreground">
            Ao se inscrever, voce concorda em receber contato da equipe da CBRio sobre o NEXT.
          </p>
        </form>
      </div>
    </div>
  );
}
