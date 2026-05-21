// ============================================================================
// Totem Kids · Decisoes da Sessao
// ============================================================================
// Fluxo (pedido do Marcos 2026-05-21):
//
// Apos o culto, a pastoral leva as criancas que tomaram decisao pra uma sala
// separada pra conversar. Nessa sala, voluntario opera essa tela:
//
//   1. Digita o codigo de seguranca da etiqueta da crianca (4 chars)
//   2. Sistema busca · mostra foto, nome, idade, sala original, responsavel
//      + quantas vezes a crianca ja decidiu antes
//   3. Voluntario pode adicionar observacao pastoral ("entendeu bem", etc)
//   4. Clica "Confirmar decisao" · marca fez_decisao_jesus=true no checkin
//   5. Trigger fn_kids_decisao_para_culto cria registro em
//      cultos_decisoes_pessoas com kids_crianca_id preenchido
//
// Lista lateral mostra todas as criancas que ja tiveram decisao registrada
// nessa sessao · permite remover/editar observacao.
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Baby, ArrowLeft, Loader2, Heart, Trash2, AlertTriangle, Phone, MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatIdade } from './lib/idade';

type CheckinPorCodigo = {
  id: string;
  codigo_seguranca: string;
  checkin_at: string;
  responsavel_checkin_nome: string;
  responsavel_checkin_telefone: string | null;
  responsavel_checkin_parentesco: string | null;
  fez_decisao_jesus: boolean;
  observacoes_no_dia: string | null;
  crianca: { id: string; nome: string; foto_url: string | null; data_nascimento: string | null; observacoes_medicas: string | null };
  sala: { id: string; nome: string; cor: string };
  sessao: { id: string; status: string; culto: { id: string; nome: string; data: string } | null };
  responsaveis: Array<{ id: string; parentesco: string | null; membro: { id: string; nome: string; telefone: string | null } | null }>;
};

type DecisaoNaSessao = {
  id: string;
  codigo_seguranca: string;
  fez_decisao_jesus: boolean;
  observacoes_no_dia: string | null;
  responsavel_checkin_nome: string;
  total_decisoes_historico: number;
  crianca: {
    id: string;
    nome: string;
    foto_url: string | null;
    data_nascimento: string | null;
    observacoes_medicas: string | null;
    idade_label: string;
  };
};

export default function TotemKidsDecisoes() {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<{ id: string; culto?: { id: string; nome: string; data: string } | null } | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Busca por código
  const [codigoInput, setCodigoInput] = useState('');
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [checkinEncontrado, setCheckinEncontrado] = useState<CheckinPorCodigo | null>(null);
  const [decisoesAnteriores, setDecisoesAnteriores] = useState<number>(0);
  const [observacao, setObservacao] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  // Lista de decisões já registradas na sessão
  const [decisoesSessao, setDecisoesSessao] = useState<DecisaoNaSessao[]>([]);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const codigoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (!checkinEncontrado) {
      setTimeout(() => codigoRef.current?.focus(), 100);
    }
  }, [checkinEncontrado]);

  async function carregar() {
    setCarregando(true);
    try {
      const s = await totemKids.sessoes.atual();
      setSessao(s);
      if (s?.id) {
        const presentes = await totemKids.decisoes.presentesNaSessao(s.id);
        setDecisoesSessao(presentes.filter((c: DecisaoNaSessao) => c.fez_decisao_jesus));
      } else {
        setDecisoesSessao([]);
      }
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }

  async function buscarCodigo() {
    const c = codigoInput.toUpperCase().trim();
    if (c.length !== 4) {
      toast.error('Código tem 4 caracteres');
      return;
    }
    setBuscandoCodigo(true);
    try {
      const data = await totemKids.checkin.porCodigo(c);
      setCheckinEncontrado(data);
      // Calcular decisões anteriores (histórico)
      try {
        const hist = await totemKids.decisoes.historicoCrianca(data.crianca.id);
        setDecisoesAnteriores(hist.length);
      } catch {
        setDecisoesAnteriores(0);
      }
      // Pré-preenche observacao se já tem
      setObservacao(data.observacoes_no_dia || '');
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 404) {
        toast.error('Código não encontrado · criança já saiu ou código errado');
      } else {
        toast.error(err?.message || 'Erro');
      }
    } finally {
      setBuscandoCodigo(false);
    }
  }

  async function confirmarDecisao() {
    if (!checkinEncontrado) return;
    setConfirmando(true);
    try {
      // Marca fez_decisao_jesus=true + atualiza observação pastoral
      await totemKids.checkin.atualizar(checkinEncontrado.id, {
        fez_decisao_jesus: true,
        observacoes_no_dia: observacao.trim() || null,
      });

      const sequencia = decisoesAnteriores + (checkinEncontrado.fez_decisao_jesus ? 0 : 1);

      if (checkinEncontrado.fez_decisao_jesus) {
        toast.success(`Observações de ${checkinEncontrado.crianca.nome} atualizadas`);
      } else if (sequencia === 1) {
        toast.success(`${checkinEncontrado.crianca.nome} aceitou Jesus · 1ª decisão registrada 🙏`, { duration: 5000 });
      } else {
        toast.success(
          `${checkinEncontrado.crianca.nome} renovou a decisão · ${sequencia}ª vez (já tinha ${sequencia - 1})`,
          { duration: 5000 }
        );
      }

      // Reset + recarrega
      setCheckinEncontrado(null);
      setCodigoInput('');
      setObservacao('');
      setDecisoesAnteriores(0);
      carregar();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao confirmar');
    } finally {
      setConfirmando(false);
    }
  }

  async function removerDecisao(d: DecisaoNaSessao) {
    if (!confirm(`Remover decisão de ${d.crianca.nome}? Isso desmarca a decisão e remove o registro em cultos_decisoes_pessoas.`)) return;
    setRemovendo(d.id);
    try {
      await totemKids.checkin.atualizar(d.id, { fez_decisao_jesus: false });
      toast.success(`Decisão de ${d.crianca.nome} removida`);
      carregar();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro');
    } finally {
      setRemovendo(null);
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
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Totem Kids · Decisões</h1>
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <Sparkles className="h-12 w-12 text-pink-500 mx-auto mb-3" />
            <p>Nenhuma sessão aberta no momento.</p>
            <Button className="mt-3" onClick={() => navigate('/ministerial/totem-kids/configuracoes?aba=sessoes')}>
              Abrir/criar sessão
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300 flex items-center gap-2">
            <Sparkles className="h-6 w-6" /> Decisões da sessão
          </h1>
          <p className="text-sm text-muted-foreground">
            {sessao.culto?.nome}
            {sessao.culto?.data && ` · ${format(new Date(sessao.culto.data + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Totem
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Coluna esquerda · adicionar nova decisão */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Código da etiqueta da criança
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Pegue a etiqueta de peito da criança que tomou decisão e digite o código de 4 letras/números.
                </p>
                <div className="flex gap-2">
                  <Input
                    ref={codigoRef}
                    placeholder="ABC1"
                    value={codigoInput}
                    onChange={e => setCodigoInput(e.target.value.toUpperCase().slice(0, 4))}
                    onKeyDown={e => { if (e.key === 'Enter') buscarCodigo(); }}
                    className="h-16 text-3xl font-mono tracking-widest text-center"
                    maxLength={4}
                    autoFocus
                    disabled={!!checkinEncontrado}
                  />
                  {!checkinEncontrado && (
                    <Button
                      onClick={buscarCodigo}
                      disabled={buscandoCodigo || codigoInput.length !== 4}
                      size="lg"
                      className="h-16 bg-pink-600 hover:bg-pink-700"
                    >
                      {buscandoCodigo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                    </Button>
                  )}
                </div>
              </div>

              {checkinEncontrado && (
                <div className="space-y-3 pt-3 border-t">
                  <div className="flex items-start gap-3">
                    {checkinEncontrado.crianca.foto_url ? (
                      <img src={checkinEncontrado.crianca.foto_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                        <Baby className="h-8 w-8 text-pink-500" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="text-xl font-bold">{checkinEncontrado.crianca.nome}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatIdade(calcMeses(checkinEncontrado.crianca.data_nascimento))}
                        {' · '}
                        <Badge style={{ background: checkinEncontrado.sala.cor }} className="text-white text-xs">
                          {checkinEncontrado.sala.nome}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {checkinEncontrado.crianca.observacoes_medicas && (
                    <div className="bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-lg p-2 flex gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      <span>{checkinEncontrado.crianca.observacoes_medicas}</span>
                    </div>
                  )}

                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Responsável</div>
                    <div className="font-medium">{checkinEncontrado.responsavel_checkin_nome}</div>
                    {checkinEncontrado.responsavel_checkin_telefone && (
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {checkinEncontrado.responsavel_checkin_telefone}
                      </div>
                    )}
                    {checkinEncontrado.responsavel_checkin_parentesco && (
                      <div className="text-xs text-muted-foreground capitalize">{checkinEncontrado.responsavel_checkin_parentesco}</div>
                    )}
                  </div>

                  <div className={`rounded-lg p-3 ${
                    checkinEncontrado.fez_decisao_jesus
                      ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800'
                      : decisoesAnteriores > 0
                        ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-800'
                        : 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Heart className="h-5 w-5" />
                      <div className="font-medium">
                        {checkinEncontrado.fez_decisao_jesus
                          ? `Decisão já registrada nessa sessão (${decisoesAnteriores}ª) · você pode atualizar a observação`
                          : decisoesAnteriores === 0
                            ? '✨ Primeira decisão dessa criança no Kids!'
                            : `${decisoesAnteriores + 1}ª vez · já decidiu ${decisoesAnteriores} ${decisoesAnteriores === 1 ? 'vez' : 'vezes'} antes`
                        }
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1 flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      Observação pastoral (opcional)
                    </label>
                    <Textarea
                      placeholder="Ex: 'Entendeu bem o evangelho', 'Precisa de acompanhamento', 'Mãe quer conversar'..."
                      value={observacao}
                      onChange={e => setObservacao(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => {
                      setCheckinEncontrado(null);
                      setCodigoInput('');
                      setObservacao('');
                    }}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={confirmarDecisao}
                      disabled={confirmando}
                      className="bg-pink-600 hover:bg-pink-700"
                    >
                      {confirmando ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
                      ) : (
                        <><Heart className="h-4 w-4 mr-2" /> {checkinEncontrado.fez_decisao_jesus ? 'Atualizar' : 'Confirmar decisão'}</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita · lista de decisões já registradas */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Heart className="h-5 w-5 text-pink-500" />
              Decisões nessa sessão · {decisoesSessao.length}
            </h2>
          </div>

          {decisoesSessao.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                Nenhuma decisão registrada ainda.
                <br />
                Quando a primeira criança chegar na sala de decisões, digite o código da etiqueta dela ao lado pra adicionar aqui.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {decisoesSessao.map(d => (
                <Card key={d.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {d.crianca.foto_url ? (
                        <img src={d.crianca.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                          <Baby className="h-5 w-5 text-pink-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{d.crianca.nome}</span>
                          <span className="text-xs text-muted-foreground">
                            {d.crianca.idade_label} · cod {d.codigo_seguranca}
                          </span>
                          {d.total_decisoes_historico > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              {d.total_decisoes_historico}ª decisão
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Resp: {d.responsavel_checkin_nome}
                        </div>
                        {d.observacoes_no_dia && (
                          <div className="text-sm mt-1 p-2 bg-muted/50 rounded">
                            {d.observacoes_no_dia}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removerDecisao(d)}
                        disabled={removendo === d.id}
                        title="Remover decisão"
                      >
                        {removendo === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-600" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function calcMeses(d: string | null): number | null {
  if (!d) return null;
  const nasc = new Date(d);
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let m = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
  if (hoje.getDate() < nasc.getDate()) m -= 1;
  return Math.max(0, m);
}
