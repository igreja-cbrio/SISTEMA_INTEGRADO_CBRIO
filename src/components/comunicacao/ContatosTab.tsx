// Aba CONTATOS do módulo Comunicação (decisão do Marcos · 13/08/2026).
// "Quem podemos mandar mensagem, e POR QUÊ": membros com opt-in explícito
// (consentimento das portas de inscrição) + líderes do bot — o papel implica o
// aceite, porque o líder aprova pedidos do grupo por WhatsApp. Cada linha diz
// DE ONDE o contato veio ("virou uma necessidade"). Substitui a antiga aba
// "Líderes" do admin do bot (que era só o recorte do bot, sem o opt-in).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { comunicacao, whatsapp } from '../../api';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Search, BellOff, Bell, UserCheck, Users } from 'lucide-react';

type Contato = {
  telefone: string; nome: string | null; membro_id: string | null;
  papeis: string[]; origem: string; origem_lider?: string; desde?: string | null;
  lider_id?: string; lider_ativo?: boolean; recebe_lembretes?: boolean;
};
type Resposta = { contatos: Contato[]; total: number; resumo: { optin: number; lideres: number }; truncado?: boolean };

function telefoneBonito(t?: string | null) {
  const d = String(t || '').replace(/\D+/g, '');
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return t || '—';
}
function fmtDia(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return '—'; }
}

export default function ContatosTab({ podeGerirLideres }: { podeGerirLideres: boolean }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [papel, setPapel] = useState<'todos' | 'optin' | 'lider'>('todos');

  const carregar = useCallback(() => {
    setErro(false); setDados(null);
    comunicacao.contatos(buscaAplicada).then((r: Resposta) => setDados(r)).catch(() => setErro(true));
  }, [buscaAplicada]);
  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const todos = dados?.contatos || [];
    if (papel === 'todos') return todos;
    return todos.filter((c) => c.papeis.includes(papel));
  }, [dados, papel]);

  async function toggleLembretes(c: Contato) {
    if (!c.lider_id) return;
    try {
      await whatsapp.atualizarLider(c.lider_id, { recebe_lembretes: !c.recebe_lembretes });
      toast.success(c.recebe_lembretes ? 'Lembretes desligados pra este líder.' : 'Lembretes religados.');
      carregar();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao atualizar'); }
  }

  if (erro) {
    return (
      <div style={{ margin: 16, padding: 16, background: '#FCEBEB', border: '1px dashed #F09595', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#501313', marginBottom: 8 }}>Não foi possível carregar os contatos</div>
        <Button variant="outline" size="sm" onClick={carregar}>Tentar de novo</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Quem a igreja <b>pode</b> contatar por WhatsApp, e de onde veio esse aceite: opt-in marcado
        numa inscrição, ou papel de liderança (o líder aprova pedidos do grupo por aqui). Quem não
        está nesta lista só recebe resposta dentro da janela de 24h — nunca mensagem proativa.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 w-64 pl-8" placeholder="Nome ou telefone…" value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setBuscaAplicada(busca); }} />
        </div>
        <Button size="sm" variant="outline" onClick={() => setBuscaAplicada(busca)}>Buscar</Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button size="sm" variant={papel === 'todos' ? 'default' : 'outline'} onClick={() => setPapel('todos')}>
          Todos{dados ? ` (${dados.total})` : ''}
        </Button>
        <Button size="sm" variant={papel === 'optin' ? 'default' : 'outline'} className="gap-1" onClick={() => setPapel('optin')}>
          <UserCheck className="h-3.5 w-3.5" />Opt-in{dados ? ` (${dados.resumo.optin})` : ''}
        </Button>
        <Button size="sm" variant={papel === 'lider' ? 'default' : 'outline'} className="gap-1" onClick={() => setPapel('lider')}>
          <Users className="h-3.5 w-3.5" />Líderes{dados ? ` (${dados.resumo.lideres})` : ''}
        </Button>
        <Button variant="outline" size="sm" onClick={carregar}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {dados?.truncado && (
        <Card className="p-3 text-xs text-amber-600">
          ⚠️ A lista passou do teto de carregamento — use a busca pra achar quem não aparece.
        </Card>
      )}

      {!dados ? <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">Nome</th>
                  <th className="px-3 py-2.5 text-left font-medium">Telefone</th>
                  <th className="px-3 py-2.5 text-left font-medium">Papéis</th>
                  <th className="px-3 py-2.5 text-left font-medium">De onde vem</th>
                  <th className="px-3 py-2.5 text-left font-medium">Desde</th>
                  {podeGerirLideres && <th className="px-3 py-2.5 text-right font-medium"></th>}
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr><td colSpan={podeGerirLideres ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">Nenhum contato neste recorte.</td></tr>
                ) : lista.map((c) => (
                  <tr key={c.lider_id || c.membro_id || c.telefone} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium">{c.nome || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{telefoneBonito(c.telefone)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.papeis.includes('optin') && <Badge variant="secondary">opt-in</Badge>}
                        {c.papeis.includes('lider') && <Badge variant="outline">líder</Badge>}
                        {c.papeis.includes('lider') && c.lider_ativo === false && <Badge variant="destructive">inativo</Badge>}
                        {c.papeis.includes('lider') && c.recebe_lembretes === false && (
                          <Badge variant="secondary" className="gap-1"><BellOff className="h-3 w-3" />sem lembretes</Badge>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[320px] px-3 py-2 text-xs text-muted-foreground">
                      {c.origem}
                      {c.origem_lider && <div>{c.origem_lider}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDia(c.desde)}</td>
                    {podeGerirLideres && (
                      <td className="px-3 py-2 text-right">
                        {c.papeis.includes('lider') && (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => toggleLembretes(c)}
                            title={c.recebe_lembretes ? 'Parar de mandar lembretes automáticos pra este líder' : 'Voltar a mandar lembretes'}>
                            {c.recebe_lembretes ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                            {c.recebe_lembretes ? 'Silenciar' : 'Religar'}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
