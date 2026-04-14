import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { QrCode, Search, Plus, Loader2, Eye } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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

  const allVolunteers = [
    ...qrcodes.map(q => ({
      id: q.id, name: q.volunteer_name, qr_code: q.qr_code, avatar_url: q.avatar_url,
      source: 'qrcode' as const, hasFace: !!q.face_descriptor, pcId: q.planning_center_person_id,
    })),
    ...profiles.map(p => ({
      id: p.id, name: p.full_name, qr_code: p.qr_code || '', avatar_url: p.avatar_url,
      source: 'profile' as const, hasFace: !!p.face_descriptor, pcId: p.planning_center_id,
    })),
  ];

  const filtered = allVolunteers.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) || v.pcId?.includes(search)
  );

  const handlePcSearch = async () => {
    if (pcQuery.trim().length < 2) return;
    try { await pcSearch.mutateAsync(pcQuery); } catch (err: any) { toast.error(err.message); }
  };

  const handleCreateQr = async (person: { id: string; full_name: string; avatar_url?: string | null }) => {
    try {
      await createQr.mutateAsync({ planning_center_person_id: person.id, volunteer_name: person.full_name, avatar_url: person.avatar_url || undefined });
      toast.success(`QR Code criado para ${person.full_name}`);
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <QrCode className="h-6 w-6" /> Gestao de QR Codes
          </h1>
          <p className="text-sm text-muted-foreground">Voluntarios ativos nos ultimos 3 meses</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => document.getElementById('pc-search-section')?.scrollIntoView({ behavior: 'smooth' })}>
          <Search className="h-4 w-4" /> Buscar no Planning Center
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, email ou ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Volunteer list with QR thumbnails */}
      <div className="space-y-3">
        {filtered.map(v => (
          <Card key={`${v.source}-${v.id}`} className="hover:bg-muted/30 transition-colors">
            <CardContent className="flex items-center gap-4 p-4">
              {v.qr_code ? (
                <div className="shrink-0 p-1 bg-white rounded">
                  <QRCodeSVG value={v.qr_code} size={56} level="L" />
                </div>
              ) : (
                <div className="shrink-0 h-16 w-16 rounded bg-muted flex items-center justify-center">
                  <QrCode className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{v.name}</p>
                  {v.source === 'profile' ? (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-[10px]">Com Conta</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-[10px]">QR Ativo</Badge>
                  )}
                </div>
                {v.pcId && <p className="text-xs text-muted-foreground">PC ID: {v.pcId}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {v.qr_code && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setSelectedQr({ qrCode: v.qr_code, name: v.name })}>
                    <Eye className="h-3.5 w-3.5" /> Ver QR
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading && <p className="text-center text-muted-foreground">Carregando...</p>}
      {!isLoading && filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum QR code encontrado</p>}

      {/* Add from Planning Center */}
      <Card id="pc-search-section">
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
                <div>
                  <span className="font-medium">{person.full_name}</span>
                  <p className="text-xs text-muted-foreground">PC ID: {person.id}</p>
                </div>
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
