import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useVolServiceTypes, useCreateServiceType, useUpdateServiceType,
  useDeleteServiceType, useGenerateServices,
} from './hooks';
import { Plus, Trash2, Edit2, Calendar, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { VolServiceType } from './types';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

export default function VolTiposCulto() {
  const { data: types = [], isLoading } = useVolServiceTypes();
  const [showForm, setShowForm] = useState(false);
  const [editType, setEditType] = useState<VolServiceType | null>(null);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Tipos de Culto</h1>
        <Button onClick={() => setShowForm(true)} className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90">
          <Plus className="h-4 w-4" /> Novo Tipo
        </Button>
      </div>

      {types.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhum tipo de culto cadastrado</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Crie tipos com recorrencia para gerar cultos automaticamente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {types.map(st => (
            <ServiceTypeCard
              key={st.id}
              serviceType={st}
              onEdit={() => setEditType(st)}
            />
          ))}
        </div>
      )}

      {(showForm || editType) && (
        <ServiceTypeFormDialog
          serviceType={editType}
          onClose={() => { setShowForm(false); setEditType(null); }}
        />
      )}
    </div>
  );
}

function ServiceTypeCard({ serviceType, onEdit }: { serviceType: VolServiceType; onEdit: () => void }) {
  const generateServices = useGenerateServices();
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (weeks: number) => {
    setGenerating(true);
    generateServices.mutate({ id: serviceType.id, weeks }, {
      onSuccess: (data: any) => {
        toast.success(`${data.generated} culto(s) gerado(s)`);
        setGenerating(false);
      },
      onError: () => { toast.error('Erro ao gerar cultos'); setGenerating(false); },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {serviceType.color && <div className="h-3 w-3 rounded-full" style={{ backgroundColor: serviceType.color }} />}
            <CardTitle className="text-base">{serviceType.name}</CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {serviceType.description && (
          <p className="text-sm text-muted-foreground">{serviceType.description}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {serviceType.recurrence_day != null && (
            <Badge variant="outline">{WEEKDAYS[serviceType.recurrence_day]}</Badge>
          )}
          {serviceType.recurrence_time && (
            <Badge variant="outline">{serviceType.recurrence_time.slice(0, 5)}</Badge>
          )}
          {!serviceType.is_active && <Badge variant="destructive">Inativo</Badge>}
        </div>

        {serviceType.recurrence_day != null && serviceType.recurrence_time && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1 text-xs flex-1" disabled={generating} onClick={() => handleGenerate(4)}>
              <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} /> 4 semanas
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-xs flex-1" disabled={generating} onClick={() => handleGenerate(8)}>
              <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} /> 8 semanas
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceTypeFormDialog({ serviceType, onClose }: { serviceType: VolServiceType | null; onClose: () => void }) {
  const create = useCreateServiceType();
  const update = useUpdateServiceType();
  const remove = useDeleteServiceType();

  const [name, setName] = useState(serviceType?.name || '');
  const [description, setDescription] = useState(serviceType?.description || '');
  const [recurrenceDay, setRecurrenceDay] = useState<string>(serviceType?.recurrence_day?.toString() || '');
  const [recurrenceTime, setRecurrenceTime] = useState(serviceType?.recurrence_time?.slice(0, 5) || '');
  const [color, setColor] = useState(serviceType?.color || '#00B39D');

  const handleSave = () => {
    if (!name.trim()) return toast.error('Nome obrigatorio');
    const data = {
      name: name.trim(),
      description: description.trim() || null,
      recurrence_day: recurrenceDay !== '' ? parseInt(recurrenceDay) : null,
      recurrence_time: recurrenceTime || null,
      color,
    };
    if (serviceType) {
      update.mutate({ id: serviceType.id, data }, {
        onSuccess: () => { toast.success('Tipo atualizado'); onClose(); },
        onError: () => toast.error('Erro ao atualizar'),
      });
    } else {
      create.mutate(data, {
        onSuccess: () => { toast.success('Tipo criado'); onClose(); },
        onError: () => toast.error('Erro ao criar'),
      });
    }
  };

  const handleDelete = () => {
    if (!serviceType) return;
    if (!confirm('Remover este tipo de culto?')) return;
    remove.mutate(serviceType.id, {
      onSuccess: () => { toast.success('Tipo removido'); onClose(); },
      onError: () => toast.error('Erro ao remover'),
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{serviceType ? 'Editar Tipo de Culto' : 'Novo Tipo de Culto'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Culto Domingo Manha" />
          </div>
          <div>
            <Label>Descricao</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descricao (opcional)" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Dia da Semana</Label>
              <Select value={recurrenceDay} onValueChange={setRecurrenceDay}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((day, i) => (
                    <SelectItem key={i} value={i.toString()}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Horario</Label>
              <Input type="time" value={recurrenceTime} onChange={e => setRecurrenceTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Cor</Label>
            <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-20" />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {serviceType && (
            <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> Remover
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
              {serviceType ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
