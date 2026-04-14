import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCode, Search, Plus, Loader2 } from 'lucide-react';
import { useVolunteersQrCodes, useCreateVolunteerQrCode, useSearchPlanningCenter } from './hooks';
import QrCodeModal from './components/qrcodes/QrCodeModal';
import { toast } from 'sonner';

export default function VolQrCodes() {
  const { data, isLoading } = useVolunteersQrCodes();
  const createQr = useCreateVolunteerQrCode();
  const pcSearch = useSearchPlanningCenter();
  const [search, setSearch] = useState('');
  const [pcQuery, setPcQuery] = useState('');
  const [selectedQr, setSelectedQr] = useState<{ qrCode: string; name: string } | null>(null);

  const qrcodes = data?.qrcodes || [];
  const profiles = data?.profiles || [];

  // Merge both lists for display
  const allVolunteers = [
    ...qrcodes.map(q => ({ id: q.id, name: q.volunteer_name, qr_code: q.qr_code, avatar_url: q.avatar_url, source: 'qrcode' as const, hasFace: !!q.face_descriptor })),
    ...profiles.map(p => ({ id: p.id, name: p.full_name, qr_code: p.qr_code || '', avatar_url: p.avatar_url, source: 'profile' as const, hasFace: !!p.face_descriptor })),
  ];

  const filtered = allVolunteers.filter(v => v.name.toLowerCase().includes(search.toLowerCase()));

  const handlePcSearch = async () => {
    if (pcQuery.trim().length < 2) return;
    try {
      await pcSearch.mutateAsync(pcQuery);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateQr = async (person: { id: string; full_name: string; avatar_url?: string | null }) => {
    try {
      await createQr.mutateAsync({
        planning_center_person_id: person.id,
        volunteer_name: person.full_name,
        avatar_url: person.avatar_url || undefined,
      });
      toast.success(`QR Code criado para ${person.full_name}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">QR Codes</h1>

      {/* Search existing */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar voluntario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* QR code list */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(v => (
          <Card key={`${v.source}-${v.id}`} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => v.qr_code && setSelectedQr({ qrCode: v.qr_code, name: v.name })}>
            <CardContent className="flex items-center gap-3 p-4">
              {v.avatar_url ? (
                <img src={v.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"><QrCode className="h-5 w-5 text-muted-foreground" /></div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{v.name}</p>
                <p className="text-xs text-muted-foreground">{v.hasFace ? 'Face cadastrada' : 'Sem face'}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading && <p className="text-center text-muted-foreground">Carregando...</p>}
      {!isLoading && filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum QR code encontrado</p>}

      {/* Add from Planning Center */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Adicionar do Planning Center</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Buscar no Planning Center..." value={pcQuery} onChange={e => setPcQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePcSearch()} />
            <Button onClick={handlePcSearch} disabled={pcSearch.isPending}>
              {pcSearch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {pcSearch.data?.people?.map((person: any) => (
            <div key={person.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                {person.avatar_url && <img src={person.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />}
                <span className="font-medium">{person.full_name}</span>
              </div>
              <Button size="sm" onClick={() => handleCreateQr(person)} disabled={createQr.isPending}>
                <Plus className="h-4 w-4 mr-1" /> QR Code
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {selectedQr && <QrCodeModal open={!!selectedQr} onClose={() => setSelectedQr(null)} qrCode={selectedQr.qrCode} volunteerName={selectedQr.name} />}
    </div>
  );
}
