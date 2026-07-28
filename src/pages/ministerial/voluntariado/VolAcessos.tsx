// ════════════════════════════════════════════════════════════════════════════
// Acessos · controle de login dos voluntários
// Quem tem login + acesso (cargo/responsabilidades) + cruzamento com a
// Membresia (info completa). Criar login com senha temporária (troca no 1º
// acesso). Apenas admin/diretor (o backend também valida).
// ════════════════════════════════════════════════════════════════════════════
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { voluntariado } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Paginacao from '@/components/Paginacao';
import { KeyRound, Search, ShieldCheck, ShieldOff, UserCheck, Link2, RefreshCw, Loader2 } from 'lucide-react';

type Membresia = {
  id: string; nome: string; cpf: string | null; telefone: string | null; email: string | null;
  status: string | null; data_nascimento: string | null; frequenta_area: string | null; via: string;
};
type Acesso = {
  vol_profile_id: string; nome: string; email: string | null; cpf: string | null; telefone: string | null;
  perfil_completo: boolean; tem_login: boolean;
  acesso: { id: string; role: string; ativo: boolean } | null;
  cargo: { id: number; nome: string; slug: string } | null;
  membresia: Membresia | null;
};
type Lista = { rows: Acesso[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 25;

function senhaTemporaria(): string {
  // senha provisória legível (o usuário troca no 1º acesso)
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Cbrio@${n}`;
}

export default function VolAcessos() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const [criar, setCriar] = useState<Acesso | 'novo' | null>(null);

  const { data, isLoading } = useQuery<Lista>({
    queryKey: ['vol', 'acessos', busca, page],
    queryFn: () => voluntariado.acessos.list({ q: busca, page, pageSize: PAGE_SIZE }),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Apenas administradores podem ver o controle de acessos.
        </CardContent>
      </Card>
    );
  }

  const rows = data?.rows || [];
  const comLogin = rows.filter(r => r.tem_login).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Acessos de voluntários
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Quem tem login no sistema, qual o acesso/responsabilidade e o cruzamento com a Membresia.
          </p>
        </div>
        <Button onClick={() => setCriar('novo')} className="gap-1.5">
          <UserCheck className="h-4 w-4" /> Dar acesso
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">
              Voluntários
              {data?.total != null && <span className="text-muted-foreground text-sm font-normal"> ({data.total})</span>}
              {!!rows.length && <span className="text-muted-foreground text-sm font-normal"> · {comLogin} com login nesta página</span>}
            </CardTitle>
            <form
              onSubmit={(e) => { e.preventDefault(); setBusca(buscaInput); setPage(1); }}
              className="flex gap-1"
            >
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={buscaInput}
                  onChange={(e) => setBuscaInput(e.target.value)}
                  placeholder="Buscar por nome ou e-mail…"
                  className="pl-8 w-56"
                />
              </div>
              <Button type="submit" variant="outline" size="sm">Buscar</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Voluntário</th>
                  <th className="px-4 py-2.5 font-medium">Login</th>
                  <th className="px-4 py-2.5 font-medium">Acesso / responsabilidade</th>
                  <th className="px-4 py-2.5 font-medium">Membresia</th>
                  <th className="px-4 py-2.5 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhum voluntário encontrado.</td></tr>
                )}
                {!isLoading && rows.map(r => (
                  <tr key={r.vol_profile_id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.nome}</div>
                      <div className="text-xs text-muted-foreground">{r.email || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.tem_login ? (
                        <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="h-3 w-3" /> Tem login
                          {r.acesso && r.acesso.ativo === false && ' (inativo)'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          <ShieldOff className="h-3 w-3" /> Sem login
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.cargo ? (
                        <span>{r.cargo.nome}</span>
                      ) : r.acesso ? (
                        <span className="text-muted-foreground">Acesso base ({r.acesso.role})</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.membresia ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Link2 className="h-3.5 w-3.5 text-primary" />
                          <span>{r.membresia.status || 'membro'}</span>
                          {r.membresia.via === 'cpf' && <span className="text-[11px] text-muted-foreground">(por CPF)</span>}
                        </span>
                      ) : <span className="text-muted-foreground">não cruzado</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant={r.tem_login ? 'ghost' : 'outline'}
                        onClick={() => setCriar(r)}
                        className="gap-1"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        {r.tem_login ? 'Gerir' : 'Dar acesso'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-3">
            <Paginacao page={page} pageSize={PAGE_SIZE} total={data?.total || 0} onPageChange={setPage} itemLabel="voluntários" />
          </div>
        </CardContent>
      </Card>

      {criar && (
        <CriarLoginDialog
          alvo={criar === 'novo' ? null : criar}
          onClose={() => setCriar(null)}
          onDone={() => { setCriar(null); qc.invalidateQueries({ queryKey: ['vol', 'acessos'] }); }}
        />
      )}
    </div>
  );
}

function CriarLoginDialog({ alvo, onClose, onDone }: { alvo: Acesso | null; onClose: () => void; onDone: () => void }) {
  const [nome, setNome] = useState(alvo?.nome || '');
  const [email, setEmail] = useState(alvo?.email || '');
  const [cpf, setCpf] = useState(alvo?.cpf || '');
  const [celular, setCelular] = useState(alvo?.telefone || '');
  const [dataNascimento, setDataNascimento] = useState(alvo?.data_nascimento || '');
  const [cargoSlug, setCargoSlug] = useState<string>('');
  const [senha, setSenha] = useState(senhaTemporaria());

  const { data: cargos } = useQuery<{ id: number; slug: string; nome: string; categoria: string | null }[]>({
    queryKey: ['vol', 'acessos', 'cargos'],
    queryFn: () => voluntariado.acessos.cargos(),
  });

  const mut = useMutation({
    mutationFn: () => voluntariado.acessos.criarLogin({
      vol_profile_id: alvo?.vol_profile_id, nome, email, cpf,
      telefone: celular, data_nascimento: dataNascimento || undefined,
      cargo_slug: cargoSlug || undefined, senha,
    }),
    onSuccess: (r: any) => {
      toast.success(r?.ja_existia ? 'Login atualizado.' : 'Login criado.', {
        description: 'Repasse a senha temporária; ele troca no 1º acesso.',
      });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao criar login.'),
  });

  const cargosOrd = useMemo(() => {
    const list = cargos || [];
    // joga o cargo de batismo pro topo (uso mais comum aqui)
    return [...list].sort((a, b) =>
      (a.slug === 'responsavel-batismo' ? -1 : b.slug === 'responsavel-batismo' ? 1 : a.nome.localeCompare(b.nome)));
  }, [cargos]);

  const cpfDigits = cpf.replace(/\D/g, '');
  const telDigits = celular.replace(/\D/g, '');
  const podeSalvar = nome.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && senha.length >= 8
    && cpfDigits.length === 11 && telDigits.length >= 10 && telDigits.length <= 11 && !!dataNascimento;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{alvo?.tem_login ? 'Gerir acesso' : 'Dar acesso ao voluntário'}</DialogTitle>
          <DialogDescription>
            Cria/garante o login e define a senha temporária. O acesso fica restrito ao que o cargo libera.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto min-h-0 flex-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome</label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">E-mail (login)</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" type="email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">CPF *</label>
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="Só números" inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Data de nascimento *</label>
              <Input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Celular *</label>
            <Input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="DDD + número" inputMode="tel" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cargo (responsabilidade / acesso)</label>
            <Select value={cargoSlug} onValueChange={setCargoSlug}>
              <SelectTrigger><SelectValue placeholder="Escolha o cargo…" /></SelectTrigger>
              <SelectContent>
                {cargosOrd.map(c => (
                  <SelectItem key={c.id} value={c.slug}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Para "só batismo", escolha <strong>Responsável de Batismo</strong> — ele verá apenas a aba Batismo.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Senha temporária</label>
            <div className="flex gap-2">
              <Input value={senha} onChange={(e) => setSenha(e.target.value)} />
              <Button type="button" variant="outline" size="icon" onClick={() => setSenha(senhaTemporaria())} title="Gerar nova">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">O voluntário troca no 1º acesso. Repasse essa senha por canal seguro.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!podeSalvar || mut.isPending} className="gap-1.5">
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {alvo?.tem_login ? 'Atualizar acesso' : 'Criar login'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
