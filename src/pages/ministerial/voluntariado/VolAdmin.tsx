import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, UserPlus, UserMinus, History, Loader2 } from 'lucide-react';
import { useAllVolUsers, useAddVolRole, useRemoveVolRole, useSyncHistorical } from './hooks';
import { toast } from 'sonner';

export default function VolAdmin() {
  const { data: users = [], isLoading } = useAllVolUsers();
  const addRole = useAddVolRole();
  const removeRole = useRemoveVolRole();
  const syncHistorical = useSyncHistorical();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filtered = users.filter(u => u.profile.full_name.toLowerCase().includes(search.toLowerCase()) || u.profile.email?.toLowerCase().includes(search.toLowerCase()));

  const handleAddRole = async (profileId: string, role: 'volunteer' | 'leader' | 'admin') => {
    try {
      await addRole.mutateAsync({ profileId, role });
      toast.success('Role adicionada');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemoveRole = async (profileId: string, role: 'volunteer' | 'leader' | 'admin') => {
    try {
      await removeRole.mutateAsync({ profileId, role });
      toast.success('Role removida');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleHistoricalSync = async () => {
    if (!startDate || !endDate) { toast.error('Selecione datas de inicio e fim'); return; }
    try {
      const result = await syncHistorical.mutateAsync({ startDate, endDate });
      toast.success(`Sincronizado: ${result.services} cultos, ${result.newSchedules} escalas`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const roleColor = (role: string) => {
    if (role === 'admin') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (role === 'leader') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    return '';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Administracao</h1>

      {/* Historical Sync */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Sincronizacao Historica</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Sincronize cultos e escalas de um periodo especifico do Planning Center.</p>
          <div className="flex gap-2 flex-wrap">
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-auto" />
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-auto" />
            <Button onClick={handleHistoricalSync} disabled={syncHistorical.isPending}>
              {syncHistorical.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <History className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader><CardTitle>Usuarios e Roles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar usuario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filtered.map(u => (
              <div key={u.profile.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div>
                  <p className="font-medium">{u.profile.full_name}</p>
                  {u.profile.email && <p className="text-sm text-muted-foreground">{u.profile.email}</p>}
                  <div className="flex gap-1 mt-1">
                    {u.roles.map(r => (
                      <Badge key={r.id} variant="outline" className={`${roleColor(r.role)} cursor-pointer`} onClick={() => handleRemoveRole(u.profile.id, r.role)}>
                        {r.role} <UserMinus className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
                <Select onValueChange={(v) => handleAddRole(u.profile.id, v as any)}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="+ Role" /></SelectTrigger>
                  <SelectContent>
                    {['volunteer', 'leader', 'admin']
                      .filter(r => !u.roles.some(ur => ur.role === r))
                      .map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {isLoading && <p className="text-center text-muted-foreground">Carregando...</p>}
        </CardContent>
      </Card>
    </div>
  );
}
