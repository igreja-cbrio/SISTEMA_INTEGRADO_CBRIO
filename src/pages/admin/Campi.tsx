import { useEffect, useRef, useState, type FormEvent } from 'react';
import { campus } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';

type Usuario = { id: string; name: string; email: string };
type Unidade = { id: string; nome: string; slug: string; tipo: string; ativa: boolean };
type Cobertura = { frente: string; api_validada: boolean; rls_validada: boolean; produtores_validados: boolean; regressao_validada: boolean; evidencia: string | null };
type Estado = { config: { estado: string; campus_legado_id: string | null; ja_ativado: boolean }; campi: Unidade[]; cobertura: Cobertura[] };
const nomesEstados: Record<string, string> = { preparacao: 'Preparação', ensaio: 'Ensaio', ativo: 'Ativo' };
const mensagem = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
const igual = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

export default function Campi() {
  const { isSuperAdmin } = useAuth();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [loading, setLoading] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [vinculosLoading, setVinculosLoading] = useState(false);
  const [vinculosValidos, setVinculosValidos] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [originais, setOriginais] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const life = useRef(0);
  const searchRun = useRef(0);
  const memberRun = useRef(0);

  useEffect(() => {
    const run = ++life.current;
    if (!isSuperAdmin) { setLoading(false); return; }
    setLoading(true);
    campus.admin.estado().then((data: Estado) => {
      if (run === life.current) { setEstado(data); setError(null); }
    }).catch((cause: unknown) => { if (run === life.current) setError(mensagem(cause)); })
      .finally(() => { if (run === life.current) setLoading(false); });
    return () => { ++life.current; ++searchRun.current; ++memberRun.current; };
  }, [isSuperAdmin, tentativa]);

  async function buscar(event: FormEvent) {
    event.preventDefault();
    const texto = busca.trim();
    if (texto.length < 3 || salvando) return;
    const run = ++searchRun.current;
    setBuscando(true); setUsuarios([]); setError(null); setBuscou(false);
    try {
      const data = await campus.admin.usuarios(texto);
      if (run === searchRun.current) { setUsuarios(data); setBuscou(true); }
    } catch (cause) { if (run === searchRun.current) setError(mensagem(cause)); }
    finally { if (run === searchRun.current) setBuscando(false); }
  }

  async function escolher(item: Usuario) {
    if (salvando) return;
    const run = ++memberRun.current;
    setUsuario(item); setVinculosLoading(true); setVinculosValidos(false);
    setSelecionados([]); setOriginais([]); setAviso(null); setError(null);
    try {
      const data = await campus.admin.vinculos(item.id);
      if (run !== memberRun.current) return;
      const ids = [...new Set<string>(data.map((vinculo: { igreja_id: string }) => vinculo.igreja_id))];
      setSelecionados(ids); setOriginais(ids); setVinculosValidos(true);
    } catch (cause) { if (run === memberRun.current) setError(mensagem(cause)); }
    finally { if (run === memberRun.current) setVinculosLoading(false); }
  }

  async function salvar() {
    if (!usuario || !vinculosValidos || salvando || igual(selecionados, originais)) return;
    const run = memberRun.current;
    const ids = [...selecionados];
    setSalvando(true); setError(null); setAviso(null);
    try {
      await campus.admin.salvarVinculos({ usuario_id: usuario.id, igreja_ids: ids });
      if (run !== memberRun.current) return;
      setOriginais(ids);
      setAviso('Vínculos salvos. O usuário deve recarregar o sistema para atualizar o contexto de campus.');
    } catch (cause) { if (run === memberRun.current) setError(mensagem(cause)); }
    finally { if (run === memberRun.current) setSalvando(false); }
  }

  if (!isSuperAdmin) return <p role="alert" className="p-6">A administração de campi é restrita aos superadministradores.</p>;
  if (loading) return <p role="status" className="p-6">Carregando a configuração dos campi…</p>;
  const legado = estado?.campi.find(item => item.id === estado.config.campus_legado_id)?.nome || 'campus legado configurado';
  const ausentes = selecionados.filter(id => !estado?.campi.some(item => item.id === id));
  const unidades = [...(estado?.campi || []), ...ausentes.map(id => ({ id, nome: `Unidade indisponível (${id})`, slug: '', tipo: '', ativa: false }))];
  return <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
    <header><h1 className="text-2xl font-semibold">Campi</h1><p className="mt-1 text-sm text-muted-foreground">Acessos por unidade e acompanhamento da preparação do sistema.</p></header>
    {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {!estado && <Button variant="outline" onClick={() => setTentativa(value => value + 1)}>Tentar carregar a configuração novamente</Button>}
    {estado && <>
      <Card><CardHeader><CardTitle>Estado da operação: {nomesEstados[estado.config.estado] || estado.config.estado}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{estado.config.estado === 'preparacao'
            ? `A operação atual continua em ${legado}. Os vínculos abaixo preparam os acessos futuros e não ativam outro campus.`
            : 'Os vínculos definem as unidades permitidas; as permissões de cada módulo continuam sendo exigidas.'}</p>
          <ul className="flex flex-wrap gap-3">{estado.campi.map(item => <li key={item.id} className="rounded-md border px-3 py-2">{item.nome}{item.ativa === false ? ' · Inativo' : ''}</li>)}</ul>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Acessos por usuário</CardTitle></CardHeader><CardContent className="space-y-4">
        <form onSubmit={buscar} className="flex flex-wrap items-end gap-2">
          <label className="min-w-60 flex-1 space-y-1 text-sm">Nome ou e-mail<Input value={busca} disabled={salvando} onChange={event => {
            setBusca(event.target.value); ++searchRun.current; setUsuarios([]); setBuscou(false); setBuscando(false);
          }} placeholder="Digite pelo menos 3 caracteres" /></label>
          <Button type="submit" disabled={busca.trim().length < 3 || buscando || salvando}>{buscando ? 'Buscando…' : 'Buscar usuário'}</Button>
        </form>
        {buscou && usuarios.length === 0 && <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>}
        <ul className="space-y-2">{usuarios.map(item => <li key={item.id}><Button className="h-auto w-full justify-start whitespace-normal py-2 text-left" variant={usuario?.id === item.id ? 'secondary' : 'outline'} disabled={salvando} onClick={() => void escolher(item)}><span>{item.name || 'Usuário sem nome'}<span className="block text-xs text-muted-foreground">{item.email}</span></span></Button></li>)}</ul>
        {usuario && <section aria-label={`Vínculos de ${usuario.name}`} className="space-y-4 border-t pt-4">
          <h2 className="font-medium">Campi permitidos para {usuario.name}</h2>
          {vinculosLoading ? <p role="status" className="text-sm">Carregando vínculos…</p> : <>
            {!vinculosValidos && <Button variant="outline" onClick={() => void escolher(usuario)}>Tentar carregar os vínculos novamente</Button>}
            <div className="space-y-3">{unidades.map(item => <label key={item.id} className="flex items-center gap-3 text-sm">
              <Checkbox aria-label={`Permitir ${item.nome}`} checked={selecionados.includes(item.id)} disabled={salvando || !vinculosValidos || (item.ativa === false && !selecionados.includes(item.id))} onCheckedChange={checked => {
                setAviso(null); setSelecionados(ids => checked === true ? [...new Set([...ids, item.id])] : ids.filter(id => id !== item.id));
              }} />{item.nome}{item.ativa === false ? ' · Inativo' : ''}
            </label>)}</div>
            {vinculosValidos && selecionados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum vínculo explícito. Na operação com isolamento ativo, este usuário ficará sem acesso aos módulos isolados por campus.</p>}
            <Button onClick={() => void salvar()} disabled={salvando || !vinculosValidos || igual(selecionados, originais)}>{salvando ? 'Salvando…' : 'Salvar vínculos'}</Button>
          </>}
          {aviso && <p role="status" className="text-sm">{aviso}</p>}
        </section>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Validação por frente</CardTitle></CardHeader><CardContent>
        <p className="mb-4 text-sm text-muted-foreground">As evidências abaixo acompanham a revisão técnica necessária antes da ativação de outra unidade.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Frente', 'API', 'Acesso direto ao banco', 'Entradas e automações', 'Regressão', 'Evidência'].map(label => <th key={label} className="border-b p-2 font-medium">{label}</th>)}</tr></thead>
          <tbody>{estado.cobertura.map(item => <tr key={item.frente}><td className="border-b p-2">{item.frente}</td>{[item.api_validada, item.rls_validada, item.produtores_validados, item.regressao_validada].map((validada, index) => <td key={index} className="border-b p-2">{validada ? 'Validado' : 'Pendente'}</td>)}<td className="max-w-sm break-words border-b p-2">{item.evidencia || 'Sem evidência registrada'}</td></tr>)}</tbody>
        </table></div>
        {estado.cobertura.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nenhuma frente validada foi registrada.</p>}
      </CardContent></Card>
    </>}
  </main>;
}
