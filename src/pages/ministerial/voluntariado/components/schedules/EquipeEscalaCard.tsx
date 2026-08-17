import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown, ChevronUp, X, GripVertical, Plus, Star, CheckCircle2, XCircle, HelpCircle,
} from 'lucide-react';
import { format } from 'date-fns';

/**
 * Uma área na escala do culto — no formato da coluna de equipe do Planning
 * Center Services.
 *
 * ⚠️ A mudança que importa: **a vaga em aberto mora DENTRO da área**, como uma
 * linha tracejada clicável ("1 vaga em aberto · Preencher"), do jeito que o
 * `2 Needed` do Services fica. Antes, quem estava escalado aparecia aqui e o
 * que FALTAVA aparecia num card "Cobertura" separado, lá em cima — ou seja, o
 * buraco não estava no lugar onde se olha a equipe, e quem montava a escala
 * tinha que cruzar duas listas de cabeça.
 *
 * O cabeçalho traz ✓ confirmados · ✗ recusaram · ? pendentes, também como lá:
 * "escalado" e "confirmou" são coisas diferentes, e só o total escondia isso.
 */

export type GrupoFuncao = {
  item_id: string | null;
  position_id: string | null;
  position: string | null;
  alvo: number;
  faltam: number;
  escalados: any[];
};

export type AreaEscala = {
  team_id: string | null;
  team: string;
  cor?: string | null;
  minha: boolean;
  grupos: GrupoFuncao[];
  stats: { total: number; confirmados: number; recusados: number; pendentes: number };
};

function LinhaEscalado({ sch, conflito, onRemover, onDragStart, onVerDetalhe }: {
  sch: any; conflito: any[]; onRemover: () => void; onDragStart: (e: React.DragEvent) => void;
  onVerDetalhe: () => void;
}) {
  const status = sch.confirmation_status;
  return (
    <div
      draggable onDragStart={onDragStart}
      className="group flex items-center justify-between gap-2 pl-2 pr-1 py-1.5 rounded-md hover:bg-accent/40 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-2 min-w-0">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/25 shrink-0" />
        {status === 'confirmed' ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          : status === 'declined' ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          : <HelpCircle className="h-4 w-4 text-yellow-500 shrink-0" />}
        {/* ⚠️ `type="button"` e `stopPropagation`: a linha inteira é arrastável
            (DnD entre áreas), e sem isso o clique no nome disputa com o arrasto. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onVerDetalhe(); }}
          title={`Ver detalhes de ${sch.volunteer_name}`}
          className={`text-sm truncate text-left hover:underline focus:underline focus:outline-none ${status === 'declined' ? 'line-through text-muted-foreground' : ''}`}
        >
          {sch.volunteer_name}
        </button>
        {conflito.length > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 shrink-0">
            também às {format(new Date(conflito[0].scheduled_at), 'HH:mm')}
          </Badge>
        )}
        {sch.source === 'auto_rotation' && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">auto</Badge>
        )}
      </div>
      <Button
        variant="ghost" size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        onClick={onRemover} title="Tirar da escala"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function EquipeEscalaCard({
  area, conflitoDe, onPreencher, onRemover, onDropTeam, onFixar, onVerDetalhe,
}: {
  area: AreaEscala;
  conflitoDe: (sch: any) => any[];
  onPreencher: (g: GrupoFuncao) => void;
  onRemover: (sch: any) => void;
  onDropTeam: (e: React.DragEvent, teamId: string | null, teamName: string) => void;
  onFixar: (teamId: string | null) => void;
  onVerDetalhe: (sch: { volunteer_id?: string | null; volunteer_name: string }) => void;
}) {
  const [aberto, setAberto] = useState(true);
  const [over, setOver] = useState(false);
  const { stats } = area;
  const faltamTotal = area.grupos.reduce((s, g) => s + g.faltam, 0);

  return (
    <Card
      className={`transition-colors ${over ? 'border-[#00B39D] bg-[#00B39D]/5' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { setOver(false); onDropTeam(e, area.team_id, area.team); }}
    >
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <button className="flex items-center gap-2 min-w-0 text-left" onClick={() => setAberto(!aberto)}>
            {area.cor && <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: area.cor }} />}
            <span className="font-semibold truncate">{area.team}</span>
            {faltamTotal > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0 text-[10px] px-1.5 shrink-0">
                faltam {faltamTotal}
              </Badge>
            )}
          </button>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="flex items-center gap-2 text-xs text-muted-foreground" title="confirmaram · avisaram que não vão · ainda sem resposta (contam como presentes: ninguém precisa confirmar, só avisar se não puder)">
              <span className="flex items-center gap-0.5 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />{stats.confirmados}</span>
              <span className="flex items-center gap-0.5 text-red-500"><XCircle className="h-3.5 w-3.5" />{stats.recusados}</span>
              <span className="flex items-center gap-0.5 text-yellow-600"><HelpCircle className="h-3.5 w-3.5" />{stats.pendentes}</span>
            </span>
            <button
              onClick={() => onFixar(area.team_id)}
              title={area.minha ? 'Tirar das minhas áreas' : 'Fixar em "Minhas áreas"'}
              className="text-muted-foreground/50 hover:text-[#00B39D] transition-colors"
            >
              <Star className={`h-4 w-4 ${area.minha ? 'fill-[#00B39D] text-[#00B39D]' : ''}`} />
            </button>
            <button onClick={() => setAberto(!aberto)} className="text-muted-foreground">
              {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </CardHeader>

      {aberto && (
        <CardContent className="pt-0 px-4 pb-3 space-y-3">
          {area.grupos.map(g => (
            <div key={g.item_id || g.position_id || 'sem-funcao'}>
              {(g.position || g.alvo > 0) && (
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
                  {g.position || 'Equipe toda'}
                  {g.alvo > 0 && <span className="ml-1.5 font-normal normal-case">{g.escalados.length}/{g.alvo}</span>}
                </p>
              )}
              {g.escalados.map(sch => (
                <LinhaEscalado
                  key={sch.id} sch={sch} conflito={conflitoDe(sch)}
                  onRemover={() => onRemover(sch)}
                  onVerDetalhe={() => onVerDetalhe(sch)}
                  onDragStart={e => {
                    e.dataTransfer.setData('application/x-cbrio-sched', JSON.stringify({ id: sch.id, volunteer_name: sch.volunteer_name }));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                />
              ))}
              {/* A VAGA. É esta linha que o card "Cobertura" separado escondia. */}
              {g.faltam > 0 && (
                <button
                  onClick={() => onPreencher(g)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-dashed border-red-300 dark:border-red-900/60 text-left hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="text-sm text-red-600 dark:text-red-400">
                    {g.faltam} vaga{g.faltam > 1 ? 's' : ''} em aberto
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">preencher</span>
                </button>
              )}
            </div>
          ))}

          {/* Escalar alguém a mais numa área que já está completa continua
              possível — só não é o caminho em destaque. */}
          <button
            onClick={() => onPreencher({ item_id: null, position_id: null, position: null, alvo: 0, faltam: 0, escalados: [] })}
            className="text-xs text-muted-foreground hover:text-[#00B39D] transition-colors"
          >
            + adicionar alguém nesta área
          </button>
        </CardContent>
      )}
    </Card>
  );
}
