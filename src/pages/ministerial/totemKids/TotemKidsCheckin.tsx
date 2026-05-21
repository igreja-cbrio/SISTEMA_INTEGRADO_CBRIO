// ============================================================================
// Totem Kids · Tela de Check-in (manned)
// ============================================================================
// Voluntario opera. Busca pelo nome da criança, encontra, confirma com a mãe,
// imprime 2 etiquetas (criança + responsável). Equivalente ao PC Check-Ins.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Baby, Printer, AlertTriangle, Plus, ArrowLeft, Loader2, CheckCircle2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { formatIdade, formatIdadeShort } from './lib/idade';
import { imprimirEtiquetas } from './lib/imprimir';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Crianca = {
  id: string;
  nome: string;
  data_nascimento: string | null;
  foto_url: string | null;
  observacoes_medicas: string | null;
  visitante: boolean;
  idade_meses: number | null;
  idade_label: string;
  familia: { id: string; nome: string } | null;
  responsaveis: Array<{
    membro_id: string;
    parentesco: string | null;
    autorizado_buscar: boolean;
    membro: { id: string; nome: string; telefone: string | null; foto_url: string | null } | null;
  }>;
};

type Sala = { id: string; nome: string; cor: string; capacidade: number; faixa_etaria_min_meses: number; faixa_etaria_max_meses: number };
type Sessao = { id: string; culto: { id: string; nome: string; data: string } | null };

export default function TotemKidsCheckin() {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Busca
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Crianca[]>([]);
  const [buscando, setBuscando] = useState(false);

  // Selecao
  const [crianca, setCrianca] = useState<Crianca | null>(null);
  const [salaSelecionada, setSalaSelecionada] = useState<string>('');
  const [responsavelSelecionado, setResponsavelSelecionado] = useState<string>('');
  const [respManualNome, setRespManualNome] = useState('');
  const [respManualTel, setRespManualTel] = useState('');
  const [usarRespManual, setUsarRespManual] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);

  // Modal de cadastro novo
  const [modalNovo, setModalNovo] = useState(false);

  const buscaRef = useRef<HTMLInputElement>(null);

  // Carrega sessão atual + salas
  useEffect(() => {
    Promise.all([totemKids.sessoes.atual(), totemKids.salas.list()])
      .then(([s, sl]) => {
        setSessao(s);
        setSalas(sl);
      })
      .finally(() => setCarregando(false));
  }, []);

  // Foco no input apos limpar selecao
  useEffect(() => {
    if (!crianca) {
      setTimeout(() => buscaRef.current?.focus(), 50);
    }
  }, [crianca]);

  // Busca debounced
  useEffect(() => {
    if (busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      totemKids.criancas.buscar(busca.trim())
        .then((data) => setResultados(data))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  // Sala sugerida (auto-seleciona com base na idade)
  useEffect(() => {
    if (!crianca?.idade_meses) return;
    const sugerida = salas.find(s =>
      s.faixa_etaria_min_meses <= (crianca.idade_meses || 0) &&
      s.faixa_etaria_max_meses >= (crianca.idade_meses || 0)
    );
    if (sugerida) setSalaSelecionada(sugerida.id);
  }, [crianca, salas]);

  async function abrirSessao() {
    // Atalho · cria sessão pro culto mais próximo (admin pode usar)
    toast.info('Sessão precisa ser criada na admin de Sessões antes do culto', { duration: 5000 });
  }

  async function confirmarCheckin() {
    if (!sessao || !crianca || !salaSelecionada) {
      toast.error('Falta selecionar sala');
      return;
    }
    if (!usarRespManual && !responsavelSelecionado) {
      toast.error('Selecione o responsável que está trazendo');
      return;
    }
    if (usarRespManual && (!respManualNome.trim() || !respManualTel.trim())) {
      toast.error('Preencha nome e telefone do responsável manual');
      return;
    }

    setImprimindo(true);
    try {
      const payload: Record<string, unknown> = {
        sessao_id: sessao.id,
        crianca_id: crianca.id,
        sala_id: salaSelecionada,
      };
      if (usarRespManual) {
        payload.responsavel_nome_manual = respManualNome.trim();
        payload.responsavel_telefone_manual = respManualTel.trim();
        payload.responsavel_parentesco = 'outro';
      } else {
        const resp = crianca.responsaveis.find(r => r.membro_id === responsavelSelecionado);
        payload.responsavel_id = responsavelSelecionado;
        payload.responsavel_parentesco = resp?.parentesco || 'outro';
      }

      const r = await totemKids.checkin.criar(payload);

      // Dispara impressão
      await imprimirEtiquetas({
        checkinId: r.checkin.id,
        crianca: {
          nome: r.crianca.nome,
          idadeLabel: formatIdade(crianca.idade_meses),
          salaNome: r.sala.nome,
          salaCor: r.sala.cor,
          observacoesMedicas: r.crianca.observacoes_medicas,
        },
        responsavel: { nome: r.responsavel.nome },
        codigoSeguranca: r.codigo_seguranca,
        codigoBarras: r.codigo_barras,
        dataHora: format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
        cultoNome: r.sessao.culto?.nome,
      });

      toast.success(`${r.crianca.nome} · check-in OK · código ${r.codigo_seguranca}`, { duration: 4000 });

      // Reset
      setCrianca(null);
      setBusca('');
      setSalaSelecionada('');
      setResponsavelSelecionado('');
      setUsarRespManual(false);
      setRespManualNome('');
      setRespManualTel('');
      setResultados([]);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro no check-in');
    } finally {
      setImprimindo(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (!sessao) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Totem Kids · Check-in</h1>
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <Baby className="h-12 w-12 text-pink-500 mx-auto" />
            <p className="text-lg">Nenhuma sessão aberta no momento</p>
            <p className="text-sm text-muted-foreground">
              Crie uma sessão na administração antes de iniciar o check-in.
            </p>
            <Button onClick={() => navigate('/admin/totem-kids/sessoes')}>
              Gerenciar sessões
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Totem Kids · Check-in</h1>
          <p className="text-sm text-muted-foreground">
            {sessao.culto?.nome} · {sessao.culto?.data && format(new Date(sessao.culto.data + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/painel')}>
            Painel ao vivo
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/teste-etiqueta')}>
            <Printer className="h-4 w-4 mr-1" /> Testar etiqueta
          </Button>
        </div>
      </div>

      {!crianca ? (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={buscaRef}
                  placeholder="Buscar criança por nome ou telefone do responsável..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className="pl-10 h-14 text-lg"
                  autoFocus
                />
              </div>
              <Button
                onClick={() => setModalNovo(true)}
                variant="default"
                size="lg"
                className="h-14 bg-pink-600 hover:bg-pink-700 whitespace-nowrap"
              >
                <Plus className="h-5 w-5 mr-1" /> Nova criança
              </Button>
            </div>

            {buscando && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-pink-500" />
              </div>
            )}

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {resultados.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCrianca(c)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-pink-50 dark:hover:bg-pink-950/30 transition"
                >
                  {c.foto_url ? (
                    <img src={c.foto_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                      <Baby className="h-6 w-6 text-pink-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.nome}</span>
                      {c.visitante && <Badge variant="secondary" className="text-xs">visitante</Badge>}
                      {c.observacoes_medicas && (
                        <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Observação médica" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.idade_label || '?'} · {c.familia?.nome || 'sem família'}
                    </div>
                  </div>
                </button>
              ))}
              {!buscando && busca.trim().length >= 2 && resultados.length === 0 && (
                <div className="text-center py-6 space-y-3 border-2 border-dashed border-pink-200 dark:border-pink-900 rounded-lg">
                  <p className="text-muted-foreground">Nenhuma criança encontrada com "{busca}"</p>
                  <Button onClick={() => setModalNovo(true)} variant="default" className="bg-pink-600 hover:bg-pink-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Cadastrar "{busca}" como criança nova
                  </Button>
                </div>
              )}
              {!buscando && busca.trim().length < 2 && resultados.length === 0 && (
                <p className="text-center py-6 text-sm text-muted-foreground">
                  Digite o nome da criança ou clique em <b>Nova criança</b> pra cadastrar.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <CheckinSelecao
          crianca={crianca}
          salas={salas}
          salaSelecionada={salaSelecionada}
          setSalaSelecionada={setSalaSelecionada}
          responsavelSelecionado={responsavelSelecionado}
          setResponsavelSelecionado={setResponsavelSelecionado}
          usarRespManual={usarRespManual}
          setUsarRespManual={setUsarRespManual}
          respManualNome={respManualNome}
          setRespManualNome={setRespManualNome}
          respManualTel={respManualTel}
          setRespManualTel={setRespManualTel}
          onCancelar={() => setCrianca(null)}
          onConfirmar={confirmarCheckin}
          imprimindo={imprimindo}
        />
      )}

      <ModalNovaCrianca
        open={modalNovo}
        onClose={() => setModalNovo(false)}
        nomeInicial={busca}
        onCadastrado={(criancaCriada) => {
          setModalNovo(false);
          setCrianca(criancaCriada as Crianca);
          setBusca('');
        }}
      />
    </div>
  );
}

// ── Subcomponente: tela de confirmação após selecionar criança ──
function CheckinSelecao(props: {
  crianca: Crianca;
  salas: Sala[];
  salaSelecionada: string;
  setSalaSelecionada: (s: string) => void;
  responsavelSelecionado: string;
  setResponsavelSelecionado: (s: string) => void;
  usarRespManual: boolean;
  setUsarRespManual: (b: boolean) => void;
  respManualNome: string;
  setRespManualNome: (s: string) => void;
  respManualTel: string;
  setRespManualTel: (s: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
  imprimindo: boolean;
}) {
  const { crianca, salas, salaSelecionada, setSalaSelecionada,
    responsavelSelecionado, setResponsavelSelecionado,
    usarRespManual, setUsarRespManual,
    respManualNome, setRespManualNome, respManualTel, setRespManualTel,
    onCancelar, onConfirmar, imprimindo } = props;

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-4">
          {crianca.foto_url ? (
            <img src={crianca.foto_url} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
              <Baby className="h-10 w-10 text-pink-500" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{crianca.nome}</h2>
            <p className="text-muted-foreground">
              {formatIdade(crianca.idade_meses) || 'idade não informada'}
              {crianca.familia?.nome && <> · {crianca.familia.nome}</>}
              {crianca.visitante && <> · <Badge variant="secondary" className="ml-1">visitante</Badge></>}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancelar}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Outra criança
          </Button>
        </div>

        {crianca.observacoes_medicas && (
          <div className="bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <div className="font-semibold">ATENÇÃO MÉDICA</div>
              <div className="text-sm">{crianca.observacoes_medicas}</div>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-2">Sala</label>
          <Select value={salaSelecionada} onValueChange={setSalaSelecionada}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Selecione a sala" />
            </SelectTrigger>
            <SelectContent>
              {salas.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: s.cor }} />
                    {s.nome}
                    <span className="text-muted-foreground text-xs ml-2">
                      ({formatIdadeShort(s.faixa_etaria_min_meses)}–{formatIdadeShort(s.faixa_etaria_max_meses)})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">Quem está trazendo</label>
          {!usarRespManual ? (
            <>
              <div className="space-y-2">
                {crianca.responsaveis.filter(r => r.autorizado_buscar).map(r => (
                  <button
                    key={r.membro_id}
                    onClick={() => setResponsavelSelecionado(r.membro_id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-lg border transition ${
                      responsavelSelecionado === r.membro_id
                        ? 'bg-pink-50 dark:bg-pink-950/30 border-pink-500'
                        : 'bg-card hover:bg-muted'
                    }`}
                  >
                    {r.membro?.foto_url ? (
                      <img src={r.membro.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                        {(r.membro?.nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.membro?.nome}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {r.parentesco && <span>{r.parentesco}</span>}
                        {r.membro?.telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {r.membro.telefone}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                {crianca.responsaveis.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">Sem responsáveis cadastrados</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setUsarRespManual(true)}
              >
                Outro responsável (não está na lista)
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Nome do responsável"
                value={respManualNome}
                onChange={e => setRespManualNome(e.target.value)}
              />
              <Input
                placeholder="Telefone"
                value={respManualTel}
                onChange={e => setRespManualTel(e.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setUsarRespManual(false); setRespManualNome(''); setRespManualTel(''); }}
              >
                Voltar à lista
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            onClick={onConfirmar}
            disabled={imprimindo}
            className="bg-pink-600 hover:bg-pink-700 text-white"
          >
            {imprimindo ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Imprimindo...</>
            ) : (
              <><Printer className="h-5 w-5 mr-2" /> Imprimir & Confirmar</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Modal de cadastro de criança nova (first visit) ──
function ModalNovaCrianca(props: {
  open: boolean;
  onClose: () => void;
  nomeInicial: string;
  onCadastrado: (c: Crianca) => void;
}) {
  const [criancaNome, setCriancaNome] = useState('');
  const [criancaNasc, setCriancaNasc] = useState('');
  const [criancaSexo, setCriancaSexo] = useState('');
  const [criancaObsMed, setCriancaObsMed] = useState('');
  const [respNome, setRespNome] = useState('');
  const [respTel, setRespTel] = useState('');
  const [respCpf, setRespCpf] = useState('');
  const [respParentesco, setRespParentesco] = useState('mae');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (props.open) {
      setCriancaNome(props.nomeInicial);
      setCriancaNasc('');
      setCriancaSexo('');
      setCriancaObsMed('');
      setRespNome('');
      setRespTel('');
      setRespCpf('');
      setRespParentesco('mae');
    }
  }, [props.open, props.nomeInicial]);

  async function salvar() {
    if (!criancaNome.trim() || !respNome.trim() || !respTel.trim()) {
      toast.error('Nome da criança, nome do responsável e telefone são obrigatórios');
      return;
    }
    setSalvando(true);
    try {
      const r = await totemKids.criancas.create({
        crianca: {
          nome: criancaNome.trim(),
          data_nascimento: criancaNasc || null,
          sexo: criancaSexo || null,
          observacoes_medicas: criancaObsMed.trim() || null,
        },
        responsavel: {
          nome: respNome.trim(),
          telefone: respTel.trim(),
          cpf: respCpf.trim() || null,
          parentesco: respParentesco,
        },
      });
      toast.success(`${r.crianca.nome} cadastrada · pronto pra check-in`);

      // Recarrega completo pra entrar no fluxo
      const detalhe = await totemKids.criancas.buscar(criancaNome.trim());
      const found = detalhe.find((c: { id: string }) => c.id === r.crianca.id) || r.crianca;
      props.onCadastrado(found as Crianca);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao cadastrar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar criança nova</DialogTitle>
          <DialogDescription>
            Dados mínimos · LGPD com menores. Sem CPF da criança.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border-b pb-3 space-y-2">
            <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Criança</div>
            <Input placeholder="Nome da criança *" value={criancaNome} onChange={e => setCriancaNome(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" placeholder="Data nasc (opcional)" value={criancaNasc} onChange={e => setCriancaNasc(e.target.value)} />
              <Select value={criancaSexo} onValueChange={setCriancaSexo}>
                <SelectTrigger><SelectValue placeholder="Sexo (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Menino</SelectItem>
                  <SelectItem value="F">Menina</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Alergia / medicação (opcional)" value={criancaObsMed} onChange={e => setCriancaObsMed(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-pink-700 dark:text-pink-300">Responsável</div>
            <Input placeholder="Nome do responsável *" value={respNome} onChange={e => setRespNome(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Telefone *" value={respTel} onChange={e => setRespTel(e.target.value)} />
              <Input placeholder="CPF (opcional)" value={respCpf} onChange={e => setRespCpf(e.target.value)} />
            </div>
            <Select value={respParentesco} onValueChange={setRespParentesco}>
              <SelectTrigger><SelectValue placeholder="Parentesco" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mae">Mãe</SelectItem>
                <SelectItem value="pai">Pai</SelectItem>
                <SelectItem value="padrasto">Padrasto</SelectItem>
                <SelectItem value="madrasta">Madrasta</SelectItem>
                <SelectItem value="avo_a">Avô/Avó</SelectItem>
                <SelectItem value="tio_a">Tio/Tia</SelectItem>
                <SelectItem value="irmao_a">Irmão/Irmã</SelectItem>
                <SelectItem value="tutor">Tutor</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={props.onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando} className="bg-pink-600 hover:bg-pink-700">
              {salvando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Cadastrar</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
