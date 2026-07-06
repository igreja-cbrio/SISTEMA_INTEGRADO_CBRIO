// Kids · módulo da aba Cultos (/kids)
// Reorganização 2026-07-06 (pedido do Matheus): além dos indicadores
// (PainelArea), este módulo recebeu a GESTÃO do ministério infantil que vivia
// no hub (/ministerial/kids) — frequência PCO, vínculos, equipe, estoque,
// batismos, apresentação de crianças e decisões. O hub ficou só com a operação
// de culto (check-in, crianças, painel ao vivo, etiqueta, config). A seção de
// gestão só aparece pra quem tem kids nível >= 2 (só-leitura vê indicadores).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  Baby, ShieldCheck, BarChart3, UserCheck, Boxes, Droplets, Sparkles,
  ArrowRight, Loader2,
} from 'lucide-react';
import PainelArea from './PainelArea';

const GESTAO = [
  { titulo: 'Frequência (PCO)', desc: 'Validar check-ins das crianças por culto', icon: BarChart3, path: '/ministerial/totem-kids/frequencia', cor: '#0ea5e9' },
  { titulo: 'Vínculos', desc: 'Pedidos de vínculo criança ↔ responsável', icon: ShieldCheck, path: '/ministerial/totem-kids/vinculos', cor: '#3b82f6' },
  { titulo: 'Equipe do Kids', desc: 'Voluntários por posição (salas, recepção...) + ficha', icon: UserCheck, path: '/ministerial/totem-kids/voluntarios', cor: '#14b8a6' },
  { titulo: 'Estoque por sala', desc: 'O que tem e o que deve ter em cada sala (Patrimônio)', icon: Boxes, path: '/ministerial/totem-kids/estoque', cor: '#f97316' },
  { titulo: 'Batismos (crianças)', desc: 'Crianças pra batizar · contatar a família', icon: Droplets, path: '/ministerial/totem-kids/batismos', cor: '#0ea5e9' },
  { titulo: 'Apresentação de crianças', desc: 'Inscrições do formulário · por turma (2º domingo)', icon: Baby, path: '/ministerial/totem-kids/apresentacao', cor: '#d946ef' },
  { titulo: 'Decisões', desc: 'Decisões de fé registradas no Kids', icon: Sparkles, path: '/ministerial/totem-kids/decisoes', cor: '#8b5cf6' },
];

function GestaoKids() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(setD).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const r = d?.resumo || {};

  return (
    <div className="px-6 pt-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Gestão do Kids</h2>
        <div className="flex gap-2 text-xs">
          {r.vinculos_pendentes > 0 && (
            <Badge variant="outline" className="border-blue-400/50 text-blue-500 cursor-pointer" onClick={() => navigate('/ministerial/totem-kids/vinculos')}>
              {r.vinculos_pendentes} vínculo{r.vinculos_pendentes === 1 ? '' : 's'} pendente{r.vinculos_pendentes === 1 ? '' : 's'}
            </Badge>
          )}
          {r.batismos_criancas > 0 && (
            <Badge variant="outline" className="border-sky-400/50 text-sky-500 cursor-pointer" onClick={() => navigate('/ministerial/totem-kids/batismos')}>
              {r.batismos_criancas} pra batizar
            </Badge>
          )}
        </div>
      </div>

      {/* Novas solicitações de vínculo (veio do hub) */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-500" /> Novas solicitações de vínculo</div>
          <button onClick={() => navigate('/ministerial/totem-kids/vinculos')} className="text-xs text-primary inline-flex items-center gap-1">ver todas <ArrowRight className="h-3 w-3" /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (d?.vinculos || []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">Nenhuma solicitação pendente.</p>
        ) : (
          <div className="space-y-2">
            {d.vinculos.map((v) => (
              <button key={v.id} onClick={() => navigate('/ministerial/totem-kids/vinculos')} className="w-full flex items-center gap-3 rounded-lg border border-border p-2 text-left hover:border-primary/40 transition-colors">
                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0"><Baby className="h-4 w-4 text-blue-500" /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{v.crianca_nome}</div>
                  <div className="text-xs text-muted-foreground truncate">{v.solicitante_nome}{v.solicitante_parentesco ? ` · ${v.solicitante_parentesco}` : ''}</div>
                </div>
                <Badge variant="secondary" className="text-[10px]">pendente</Badge>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Acessos gerenciais (vieram do hub) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {GESTAO.map((it) => (
          <Card key={it.path} onClick={() => navigate(it.path)} className="p-4 cursor-pointer hover:border-primary/40 transition-colors flex items-start gap-3">
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

export default function PainelKids() {
  const { isAdmin, modulePerms } = useAuth();
  // Gestão só pra quem tem kids nível >= 2 (voluntário só-leitura vê os indicadores)
  const podeGestao = isAdmin || (modulePerms?.kids?.leitura ?? 0) >= 2;

  return (
    <div>
      {podeGestao && <GestaoKids />}
      <PainelArea area="kids" />
    </div>
  );
}
