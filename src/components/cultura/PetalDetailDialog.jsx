import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const fmt = (n) => (n == null ? '—' : Intl.NumberFormat('pt-BR').format(n));

const META = {
  seguir: {
    title: 'Seguir a Jesus',
    desc: 'Frequência média semanal — presencial e online (DS).',
    color: '#3B82F6',
  },
  conectar: {
    title: 'Conectar-se com Pessoas',
    desc: 'Pessoas atualmente em grupos (mem_grupo_membros ativos).',
    color: '#00B39D',
  },
  investir: {
    title: 'Investir Tempo com Deus',
    desc: 'Views diárias médias dos vídeos PENSE no YouTube.',
    color: '#008B7A',
  },
  servir: {
    title: 'Servir em Comunidade',
    desc: 'Voluntários distintos com check-in nos últimos 90 dias.',
    color: '#00B39D',
  },
  generosidade: {
    title: 'Generosidade',
    desc: 'Dizimistas e ofertantes do mês (lançamento manual).',
    color: '#3B82F6',
  },
};

export default function PetalDetailDialog({ open, onClose, petalKey, data }) {
  if (!petalKey) return null;
  const meta = META[petalKey];
  if (!meta) return null;

  const renderRows = () => {
    if (!data) return null;
    switch (petalKey) {
      case 'seguir':
        return (
          <>
            <Row label="Presencial total" value={fmt(data.seguir_jesus?.presencial_total)} />
            <Row label="Online (DS) total" value={fmt(data.seguir_jesus?.online_total)} />
            <Row label="Semanas no mês" value={fmt(data.semanas_no_mes)} />
            <Row label="Média presencial / semana" value={fmt(data.seguir_jesus?.presencial)} accent={meta.color} />
            <Row label="Média online / semana" value={fmt(data.seguir_jesus?.online)} accent={meta.color} />
          </>
        );
      case 'conectar':
        return <Row label="Pessoas em grupos ativos" value={fmt(data.conectar_pessoas)} accent={meta.color} />;
      case 'investir':
        return (
          <>
            <Row label="Views totais no mês (PENSE)" value={fmt(data.investir_deus_total)} />
            <Row label="Dias no mês" value={fmt(data.dias_no_mes)} />
            <Row label="Média de views / dia" value={fmt(data.investir_deus)} accent={meta.color} />
          </>
        );
      case 'servir':
        return <Row label="Voluntários ativos (últimos 90d)" value={fmt(data.servir_comunidade)} accent={meta.color} />;
      case 'generosidade':
        return (
          <>
            <Row label="Dizimistas" value={fmt(data.generosidade?.dizimistas)} accent={meta.color} />
            <Row label="Ofertantes" value={fmt(data.generosidade?.ofertantes)} accent={meta.color} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="h-1 w-12 rounded-full mb-3" style={{ background: meta.color }} />
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>{meta.desc}</DialogDescription>
        </DialogHeader>
        <div className="mt-2 divide-y divide-border">
          {renderRows()}
        </div>
        {data?.mes && (
          <div className="text-xs text-muted-foreground mt-3">
            Referência: {data.mes}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}
