// Página do módulo Conversas: inbox (por área) + painel de pendências por área.
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { waInbox } from '../api';
import ConversasInbox from '../components/waInbox/ConversasInbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card } from '../components/ui/card';
import { Loader2, Inbox, LayoutGrid, RefreshCw, Users } from 'lucide-react';

type ResumoArea = { area: string | null; entrada?: boolean; novas: number; ativos: number; pendentes: number };

function PainelAreas() {
  const [rows, setRows] = useState<ResumoArea[] | null>(null);
  const carregar = useCallback(() => {
    waInbox.resumoAreas().then((r: any) => setRows(r?.areas || [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, 20_000); return () => clearInterval(t); }, [carregar]);

  const totais = (rows || []).reduce((a, r) => ({ novas: a.novas + r.novas, ativos: a.ativos + r.ativos, pendentes: a.pendentes + r.pendentes }), { novas: 0, ativos: 0, pendentes: 0 });

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Pendências por área</p>
          <p className="text-[11px] text-muted-foreground">Você vê as áreas sob sua responsabilidade. Novas = não lidas · Ativos = abertas · Pendentes = sem responsável.</p>
        </div>
        <button onClick={carregar} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted" title="Atualizar"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Área</th>
              <th className="px-4 py-2.5 text-center font-medium">Novas mensagens</th>
              <th className="px-4 py-2.5 text-center font-medium">Ativos</th>
              <th className="px-4 py-2.5 text-center font-medium">Pendentes</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={4} className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{r.entrada || !r.area ? 'Entrada (não triada)' : r.area}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center"><Contador n={r.novas} cor="verde" /></td>
                <td className="px-4 py-3 text-center"><Contador n={r.ativos} cor="azul" /></td>
                <td className="px-4 py-3 text-center"><Contador n={r.pendentes} cor="ambar" /></td>
              </tr>
            ))}
          </tbody>
          {rows && rows.length > 0 && (
            <tfoot>
              <tr className="text-[13px] font-semibold">
                <td className="px-4 py-3 text-right text-muted-foreground">Total</td>
                <td className="px-4 py-3 text-center">{totais.novas}</td>
                <td className="px-4 py-3 text-center">{totais.ativos}</td>
                <td className="px-4 py-3 text-center">{totais.pendentes}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

function Contador({ n, cor }: { n: number; cor: 'verde' | 'azul' | 'ambar' }) {
  if (!n) return <span className="text-muted-foreground/50">0</span>;
  const c = cor === 'verde' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : cor === 'azul' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  return <span className={`inline-flex min-w-[28px] items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${c}`}>{n}</span>;
}

export default function Conversas() {
  const { user, userAreas, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Botões de WhatsApp dos módulos chegam com ?telefone=&texto= — captura e limpa a URL.
  const [abrir] = useState(() => ({
    telefone: searchParams.get('telefone') || undefined,
    texto: searchParams.get('texto') || undefined,
  }));
  useEffect(() => {
    if (searchParams.get('telefone') || searchParams.get('texto')) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Inbox de WhatsApp da igreja — receba e responda quem escreve, com triagem por área.
        </p>
      </div>
      <Tabs defaultValue="inbox" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbox"><Inbox className="h-3.5 w-3.5 mr-1.5" />Conversas</TabsTrigger>
          <TabsTrigger value="painel"><LayoutGrid className="h-3.5 w-3.5 mr-1.5" />Painel</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox">
          <ConversasInbox
            currentUserId={user?.id}
            userAreas={userAreas || []}
            isAdmin={isAdmin}
            abrirTelefone={abrir.telefone}
            textoInicial={abrir.texto}
          />
        </TabsContent>
        <TabsContent value="painel">
          <PainelAreas />
        </TabsContent>
      </Tabs>
    </div>
  );
}
