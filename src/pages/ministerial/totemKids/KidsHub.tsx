// Kids · Hub central — ponto único de entrada do ministério infantil.
// Reúne os atalhos pras telas (check-in/totem, crianças, vínculos, decisões,
// configurações, painel) + indicadores. Evita as entradas espalhadas no menu.
import { useNavigate } from 'react-router-dom';
import { Card } from '../../../components/ui/card';
import { Baby, ScanLine, Users, ShieldCheck, Sparkles, Settings, Monitor, BarChart3, Printer } from 'lucide-react';

const ITENS = [
  { titulo: 'Check-in (Totem)', desc: 'Entrada e saída das crianças no culto', icon: ScanLine, path: '/ministerial/totem-kids', cor: '#ec4899' },
  { titulo: 'Crianças', desc: 'Gestão, ficha, atendimentos e frequência', icon: Users, path: '/ministerial/totem-kids/criancas', cor: '#00B39D' },
  { titulo: 'Vínculos', desc: 'Pedidos de vínculo criança ↔ responsável', icon: ShieldCheck, path: '/ministerial/totem-kids/vinculos', cor: '#3b82f6' },
  { titulo: 'Decisões', desc: 'Decisões de fé registradas no Kids', icon: Sparkles, path: '/ministerial/totem-kids/decisoes', cor: '#8b5cf6' },
  { titulo: 'Painel ao vivo', desc: 'Quem está em cada sala agora', icon: Monitor, path: '/ministerial/totem-kids/painel', cor: '#f59e0b' },
  { titulo: 'Etiqueta (teste)', desc: 'Testar impressão da etiqueta', icon: Printer, path: '/ministerial/totem-kids/teste-etiqueta', cor: '#64748b' },
  { titulo: 'Configurações', desc: 'Sessões, salas, estações, pagers, auditoria', icon: Settings, path: '/ministerial/totem-kids/configuracoes', cor: '#64748b' },
  { titulo: 'Indicadores (KPIs)', desc: 'Saúde e metas do ministério infantil', icon: BarChart3, path: '/kids', cor: '#ef4444' },
];

export default function KidsHub() {
  const navigate = useNavigate();
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Baby className="h-6 w-6 text-pink-500" /> Kids</h1>
        <p className="text-sm text-muted-foreground">Hub do ministério infantil — tudo num lugar só.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ITENS.map(it => (
          <Card
            key={it.path}
            onClick={() => navigate(it.path)}
            className="p-4 cursor-pointer hover:border-primary/40 transition-colors flex items-start gap-3"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${it.cor}1a` }}>
              <it.icon className="h-5 w-5" style={{ color: it.cor }} />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm">{it.titulo}</div>
              <div className="text-xs text-muted-foreground">{it.desc}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
