import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Eye, EyeOff, ClipboardList, Loader2 } from 'lucide-react';
import { voluntariado } from '@/api';
import { toast } from 'sonner';

interface FormOpcao {
  id: string;
  label: string;
  ordem: number;
  ativo: boolean;
  area_canonica: string;
  exige_dados_menor: boolean;
  aviso_titulo: string | null;
  aviso_texto: string | null;
}

const AREAS = [
  { value: 'sede', label: 'Sede' },
  { value: 'kids', label: 'Kids' },
  { value: 'ami', label: 'AMI' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'online', label: 'Online' },
];

export default function FormOpcoesManager() {
  const qc = useQueryClient();
  const { data: opcoes = [], isLoading } = useQuery<FormOpcao[]>({
    queryKey: ['vol', 'form-opcoes'],
    queryFn: () => voluntariado.formOpcoes.list() as Promise<FormOpcao[]>,
  });
  const [showForm, setShowForm] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['vol', 'form-opcoes'] });

  const toggle = useMutation({
    mutationFn: (o: FormOpcao) => voluntariado.formOpcoes.update(o.id, { ativo: !o.ativo }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => voluntariado.formOpcoes.remove(id),
    onSuccess: () => { invalidate(); toast.success('Opcao removida'); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Opcoes do formulario publico
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Controla o que aparece em "Onde voce quer servir" no formulario publico de inscricao.
          Desative uma opcao (ex: Online) quando as vagas encherem — ela some do formulario sem
          ser apagada. Kids e Bridge pedem CPF + nome da mae e mostram o aviso de antecedentes.
        </p>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90">
          <Plus className="h-4 w-4" /> Nova opcao
        </Button>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {opcoes.map(o => (
              <div
                key={o.id}
                className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border ${o.ativo ? 'bg-card' : 'bg-muted/40 opacity-70'}`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                    {o.label}
                    {!o.ativo && <Badge variant="outline" className="text-[10px]">Oculto</Badge>}
                    {o.exige_dados_menor && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                        pede CPF + mae
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground capitalize">area: {o.area_canonica}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle.mutate(o)}
                    disabled={toggle.isPending}
                    className="gap-1.5"
                    title={o.ativo ? 'Ocultar do formulario' : 'Mostrar no formulario'}
                  >
                    {o.ativo ? <><Eye className="h-3.5 w-3.5" /> Ativo</> : <><EyeOff className="h-3.5 w-3.5" /> Oculto</>}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { if (confirm(`Remover "${o.label}" do formulario?`)) remove.mutate(o.id); }}
                    disabled={remove.isPending}
                    className="text-muted-foreground hover:text-red-500"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {opcoes.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma opcao cadastrada.</p>
            )}
          </div>
        )}
      </CardContent>

      {showForm && <OpcaoFormDialog onClose={() => setShowForm(false)} onSaved={invalidate} />}
    </Card>
  );
}

function OpcaoFormDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState('');
  const [area, setArea] = useState('sede');
  const [exigeMenor, setExigeMenor] = useState(false);
  const [avisoTitulo, setAvisoTitulo] = useState('');
  const [avisoTexto, setAvisoTexto] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!label.trim()) { toast.error('Informe o nome da opcao'); return; }
    setSaving(true);
    try {
      await voluntariado.formOpcoes.create({
        label: label.trim(),
        area_canonica: area,
        exige_dados_menor: exigeMenor,
        aviso_titulo: exigeMenor && avisoTitulo.trim() ? avisoTitulo.trim() : null,
        aviso_texto: exigeMenor && avisoTexto.trim() ? avisoTexto.trim() : null,
      });
      toast.success('Opcao criada');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar opcao');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova opcao do formulario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Nome (como aparece no formulario)</label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Louvor" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Area</label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AREAS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Define a area da inscricao. Use "Sede" se nao for Kids/AMI/Bridge/Online.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={exigeMenor} onChange={e => setExigeMenor(e.target.checked)} />
            Exige dados de menor (CPF + nome da mae + aviso de antecedentes)
          </label>
          {exigeMenor && (
            <div className="space-y-2 pl-1 border-l-2 border-[#00B39D]/30">
              <div className="pl-2">
                <label className="text-xs font-medium text-muted-foreground block mb-1">Titulo do aviso (opcional)</label>
                <Input value={avisoTitulo} onChange={e => setAvisoTitulo(e.target.value)} placeholder="Para servir nesta area, precisamos de..." />
              </div>
              <div className="pl-2">
                <label className="text-xs font-medium text-muted-foreground block mb-1">Texto do aviso (opcional)</label>
                <textarea
                  value={avisoTexto}
                  onChange={e => setAvisoTexto(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  placeholder="Explique por que pedimos esses dados..."
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
            {saving ? 'Salvando...' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
