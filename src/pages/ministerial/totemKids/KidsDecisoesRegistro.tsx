// ============================================================================
// Kids · Decisões de fé · REGISTRO E CONFERÊNCIA (gerencial · 2026-09-02)
// ============================================================================
// Pedido do Matheus: "preciso de uma tela para gerenciar as decisoes, ve oq
// ficou para aprovacao humana e etc".
//
// ⚠️ NÃO é a tela do totem (`/ministerial/totem-kids/decisoes`). Aquela é a
// operação do dia: exige sessão ABERTA hoje + o código de 4 caracteres da
// etiqueta impressa naquele dia, e é estruturalmente incapaz de registrar
// decisão de culto passado — foi nela que o card "Decisões" do /kids caía,
// mostrando "Nenhuma sessão aberta" para quem queria ver o registro.
//
// ⚠️ Dado sensível de MENOR (LGPD art. 5º II + art. 14 §1º): cada linha aqui é
// convicção religiosa de uma criança. Vincular na criança errada faz a equipe
// conversar com a família ERRADA sobre a decisão espiritual do filho dela —
// por isso nada é decidido automaticamente nesta tela.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Sparkles, AlertTriangle, Check, X, Search,
  CalendarClock, Baby, HelpCircle, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { totemKids } from '@/api';

type Crianca = {
  id: string; nome: string; ativo: boolean;
  data_nascimento: string | null; data_conversao: string | null;
};
type Culto = { id: string; nome: string | null; data: string; hora: string | null; decisoes_kids: number | null };

type LinhaFila = {
  id: string; lote: string; linha: number;
  nome_planilha: string; idade_planilha: number | null; tel_planilha: string | null;
  data_decisao: string; periodo: string | null; culto_txt: string;
  obs_planilha: string | null; faixa: 'A' | 'B'; motivo: string;
  crianca_id: string | null; culto_id: string | null; culto_origem: string | null;
  decisao_id: string | null; status: string;
  decidido_em: string | null; decisao_nota: string | null;
  crianca: Crianca | null; culto: Culto | null;
};

type Nominal = {
  decisao_id: string; crianca_id: string; crianca_nome: string;
  culto_id: string | null; culto_nome: string | null; data_culto: string | null;
  data_decisao: string; sequencia_decisao: number; total_decisoes_crianca: number;
};

type Candidato = Crianca & {
  nome_norm: string; visitante: boolean | null;
  idade_na_data: number | null; tokens_comuns: number;
  idade_veta: boolean; idade_confere: boolean;
};

type Resumo = {
  total: number; aplicada: number; pendente: number; resolvida: number; descartada: number;
  desconhecido: number; sem_culto: number; sem_crianca: number; a_conferir: number; fecha: boolean;
};

// ⚠️ O motivo vem do servidor como slug. Traduzir aqui e NÃO no banco: o slug é
// a trilha auditável; a frase é para humano ler.
const MOTIVO_TEXTO: Record<string, string> = {
  nome_exato: 'nome idêntico na base',
  nome_abreviado: 'a planilha abreviou o nome',
  sem_corroborador: 'nome único, mas sem nenhum segundo sinal (sem idade, sem telefone, sem check-in)',
  tel_contradiz: 'o telefone da planilha não é o do responsável cadastrado',
  nome_colide_2_fichas: 'existem duas fichas com este nome',
  duplicata_2_fichas_inativas: 'duas fichas inativas do mesmo nascimento — provável duplicata a fundir',
  grafia_alburquerque: 'a base tem o nome com outra grafia',
  espaco_de_pado: 'a base tem o nome com espaço no meio',
  grafia_e_ficha_inativa_14anos: 'grafia diferente e a ficha parecida está inativa, com idade fora da faixa Kids',
};

const CULTO_ORIGEM_TEXTO: Record<string, string> = {
  checkin: 'culto confirmado pelo check-in da criança',
  turno_unico: 'o dia tinha só um culto no turno declarado',
  nao_resolvido: 'domingo manhã tem 2 a 3 cultos — o culto não foi resolvido',
};

function dataBR(iso: string | null | undefined) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(iso);
}

export default function KidsDecisoesRegistro() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [fila, setFila] = useState<LinhaFila[]>([]);
  const [nominais, setNominais] = useState<Nominal[]>([]);
  const [janela, setJanela] = useState<{ rotulo?: string } | null>(null);
  const [truncado, setTruncado] = useState(false);
  const [dias, setDias] = useState(365);

  const [alvo, setAlvo] = useState<LinhaFila | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [buscandoCand, setBuscandoCand] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [nota, setNota] = useState('');
  const [modoDescarte, setModoDescarte] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await totemKids.decisoes.registro({ dias });
      setResumo(r.resumo || null);
      setFila(r.fila || []);
      setNominais(r.nominais || []);
      setJanela(r.janela || null);
      setTruncado(!!r.nominais_truncado);
    } catch (e: any) {
      // ⚠️ erro NUNCA vira lista vazia: "não há decisão" e "a consulta falhou"
      // levam a decisões opostas.
      setErro(e?.message || 'Não foi possível carregar as decisões.');
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const aConferir = useMemo(() => fila.filter(f => f.status === 'pendente'), [fila]);
  const aplicadas = useMemo(() => fila.filter(f => f.status === 'aplicada'), [fila]);
  const descartadas = useMemo(() => fila.filter(f => f.status === 'descartada'), [fila]);
  const semCultoAplicadas = useMemo(
    () => aplicadas.filter(f => !f.culto_id).length, [aplicadas],
  );

  async function abrir(l: LinhaFila) {
    setAlvo(l);
    setNota('');
    setModoDescarte(false);
    setCandidatos(null);
    setBuscandoCand(true);
    try {
      const r = await totemKids.decisoes.candidatos(l.id);
      setCandidatos(r.candidatos || []);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível buscar candidatos');
      setCandidatos([]);
    } finally {
      setBuscandoCand(false);
    }
  }

  async function decidir(acao: 'vincular' | 'descartar' | 'reabrir', criancaId?: string) {
    if (!alvo || salvando) return;
    setSalvando(true);
    try {
      await totemKids.decisoes.resolver(alvo.id, {
        acao,
        crianca_id: criancaId,
        culto_id: alvo.culto_id,
        nota: nota.trim() || undefined,
      });
      toast.success(
        acao === 'vincular' ? 'Decisão vinculada à criança'
        : acao === 'descartar' ? 'Linha descartada'
        : 'Linha voltou para a fila',
      );
      setAlvo(null);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível registrar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/kids')} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Decisões de fé · registro e conferência
          </h1>
          <p className="text-sm text-muted-foreground">
            O que já está registrado e o que espera a conferência do Kids.
            {janela?.rotulo ? ` Janela: ${janela.rotulo}.` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Recarregar'}
        </Button>
      </div>

      {/* ⚠️ a tela DIZ que a marcação do dia é noutro lugar — foi essa confusão
          que fez o card do /kids parecer quebrado */}
      <Card className="border-sky-300/50">
        <CardContent className="p-3 text-xs text-muted-foreground flex items-start gap-2">
          <HelpCircle className="h-4 w-4 mt-0.5 shrink-0 text-sky-500" />
          <span>
            Para marcar a decisão <strong>no dia do culto</strong>, use o painel da sala
            (<button className="underline" onClick={() => navigate('/ministerial/totem-kids/painel')}>Painel ao vivo</button>)
            {' '}ou a tela de decisões do totem — as duas precisam de sessão aberta.
            Esta tela é o registro histórico e a fila de conferência.
          </span>
        </CardContent>
      </Card>

      {erro && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div>
              <div className="font-medium text-destructive">Não foi possível carregar</div>
              <div className="text-muted-foreground">{erro}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Registradas</div>
            <div className="text-2xl font-semibold">{resumo.aplicada + resumo.resolvida}</div>
          </CardContent></Card>
          <Card className={resumo.a_conferir > 0 ? 'border-amber-400/60' : undefined}><CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">A conferir</div>
            <div className={`text-2xl font-semibold ${resumo.a_conferir > 0 ? 'text-amber-600' : ''}`}>{resumo.a_conferir}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Descartadas</div>
            <div className="text-2xl font-semibold">{resumo.descartada}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Linhas da planilha</div>
            <div className="text-2xl font-semibold">{resumo.total}</div>
          </CardContent></Card>
        </div>
      )}

      {/* ⚠️ ausência declarada: se as contagens não fecham, a tela DIZ, em vez de
          mostrar um número redondo que ninguém contesta */}
      {resumo && !resumo.fecha && (
        <Card className="border-amber-400/60"><CardContent className="p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          As contagens não fecham com o total de linhas — há linha com estado que esta tela não conhece. Não trate os números acima como completos.
        </CardContent></Card>
      )}

      {semCultoAplicadas > 0 && (
        <Card className="border-amber-400/50"><CardContent className="p-3 text-xs text-muted-foreground flex items-start gap-2">
          <CalendarClock className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <span>
            <strong>{semCultoAplicadas}</strong> decisões estão vinculadas à criança mas <strong>sem culto identificado</strong> —
            são de domingo de manhã, quando o dia tinha 2 a 3 cultos e não dá para saber em qual foi.
            Elas contam no histórico da criança, mas <strong>não entram no número do culto</strong> (nem no KIDS-02) até alguém escolher o culto.
          </span>
        </CardContent></Card>
      )}

      {/* ══════════════════ A CONFERIR ══════════════════ */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Esperando você ({aConferir.length})
        </h2>
        {carregando && !fila.length && (
          <Card><CardContent className="p-6 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </CardContent></Card>
        )}
        {!carregando && !aConferir.length && !erro && (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nada esperando conferência.
          </CardContent></Card>
        )}
        {aConferir.map(l => (
          <Card key={l.id} className="border-amber-400/40">
            <CardContent className="p-3 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  <Baby className="h-4 w-4 text-muted-foreground shrink-0" />
                  {l.nome_planilha}
                  {l.idade_planilha != null && <Badge variant="outline">{l.idade_planilha} anos</Badge>}
                  {l.obs_planilha && <Badge variant="outline" className="border-sky-400/50 text-sky-600">{l.obs_planilha}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {dataBR(l.data_decisao)} · {l.culto_txt}
                  {l.tel_planilha ? ` · tel. do responsável na planilha: ${l.tel_planilha}` : ''}
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  {MOTIVO_TEXTO[l.motivo] || l.motivo}
                </div>
              </div>
              <Button size="sm" onClick={() => abrir(l)} className="shrink-0">
                <Search className="h-4 w-4 mr-1" /> Conferir
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ══════════════════ REGISTRADAS ══════════════════ */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-500" />
          Decisões registradas ({nominais.length})
        </h2>
        <div className="flex gap-2 text-xs">
          {[90, 365, 1095].map(d => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`rounded-full px-3 py-1 border ${dias === d ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
            >
              {d === 90 ? '90 dias' : d === 365 ? '1 ano' : '3 anos'}
            </button>
          ))}
        </div>
        {truncado && (
          <div className="text-xs text-amber-700 dark:text-amber-400">
            ⚠️ A lista foi cortada em 500 linhas — há mais decisões no período do que aparece aqui.
          </div>
        )}
        <Card className="glass-solid">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="p-2">Data</th>
                  <th className="p-2">Criança</th>
                  <th className="p-2">Culto</th>
                  <th className="p-2">Vez</th>
                </tr>
              </thead>
              <tbody>
                {!nominais.length && (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">
                    {carregando ? '…' : 'Nenhuma decisão registrada nesta janela.'}
                  </td></tr>
                )}
                {nominais.map(n => (
                  <tr key={n.decisao_id} className="border-b border-border/50">
                    <td className="p-2 tabular-nums whitespace-nowrap">{dataBR(n.data_decisao)}</td>
                    <td className="p-2">
                      <button className="underline text-left" onClick={() => navigate(`/ministerial/totem-kids/criancas?crianca=${n.crianca_id}`)}>
                        {n.crianca_nome}
                      </button>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {n.culto_nome || <span className="text-amber-600">culto não identificado</span>}
                    </td>
                    <td className="p-2 tabular-nums">
                      {n.sequencia_decisao}{n.total_decisoes_crianca > 1 ? ` de ${n.total_decisoes_crianca}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {descartadas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Descartadas ({descartadas.length})</summary>
          <div className="mt-2 space-y-1">
            {descartadas.map(l => (
              <Card key={l.id}><CardContent className="p-2 flex items-center gap-2 text-xs">
                <span className="flex-1">{l.nome_planilha} · {dataBR(l.data_decisao)} · {l.decisao_nota || 'sem motivo registrado'}</span>
                <Button size="sm" variant="ghost" onClick={() => { setAlvo(l); setNota(''); setModoDescarte(false); setCandidatos([]); }}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Reabrir
                </Button>
              </CardContent></Card>
            ))}
          </div>
        </details>
      )}

      {/* ══════════════════ DIÁLOGO ══════════════════ */}
      <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) setAlvo(null); }}>
        <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{alvo?.nome_planilha}</DialogTitle>
            <DialogDescription>
              {alvo ? `${dataBR(alvo.data_decisao)} · ${alvo.culto_txt}` : ''}
              {alvo?.idade_planilha != null ? ` · ${alvo.idade_planilha} anos na planilha` : ''}
            </DialogDescription>
          </DialogHeader>

          {/* corpo rola; o padrão da casa pra modal alto */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
            {alvo && (
              <div className="text-xs rounded-lg border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 p-2">
                <div className="font-medium text-amber-700 dark:text-amber-400">Por que caiu aqui</div>
                <div className="text-muted-foreground">{MOTIVO_TEXTO[alvo.motivo] || alvo.motivo}</div>
                {alvo.culto_origem && (
                  <div className="text-muted-foreground mt-1">{CULTO_ORIGEM_TEXTO[alvo.culto_origem] || alvo.culto_origem}</div>
                )}
              </div>
            )}

            {alvo?.status === 'descartada' ? (
              <div className="text-sm text-muted-foreground">
                Esta linha foi descartada{alvo.decisao_nota ? `: “${alvo.decisao_nota}”` : ''}. Reabrir devolve ela para a fila.
              </div>
            ) : modoDescarte ? (
              <div className="space-y-2">
                <div className="text-sm">Por que esta decisão não vira registro de ninguém?</div>
                <Textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="ex.: erro de digitação na planilha · criança não existe na nossa base"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  O motivo é obrigatório: sem ele, em um mês ninguém sabe se foi engano de digitação ou criança que não está cadastrada.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-medium">Qual criança é?</div>
                <p className="text-xs text-muted-foreground">
                  Sugestões ordenadas — <strong>o sistema não escolhe</strong>. Idade divergente aparece riscada porque contradiz o casamento.
                </p>
                {buscandoCand && <Loader2 className="h-4 w-4 animate-spin" />}
                {candidatos && !candidatos.length && !buscandoCand && (
                  <div className="text-sm text-muted-foreground">Nenhuma criança parecida na base.</div>
                )}
                {(candidatos || []).map(c => (
                  <div key={c.id} className={`flex items-center gap-2 rounded-lg border p-2 ${c.idade_veta ? 'border-destructive/40 opacity-70' : 'border-border'}`}>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${c.idade_veta ? 'line-through' : ''}`}>{c.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.data_nascimento ? `nasc. ${dataBR(c.data_nascimento)}` : 'sem data de nascimento'}
                        {c.idade_na_data != null ? ` · ${c.idade_na_data} anos na data` : ''}
                        {!c.ativo && ' · ficha INATIVA'}
                        {c.visitante && ' · visitante'}
                        {c.data_conversao && ` · já tem conversão em ${dataBR(c.data_conversao)}`}
                      </div>
                    </div>
                    {c.idade_confere && <Badge variant="outline" className="border-emerald-400/60 text-emerald-600 shrink-0">idade bate</Badge>}
                    <Button size="sm" disabled={salvando} onClick={() => decidir('vincular', c.id)} className="shrink-0">
                      {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'É esta'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            {alvo?.status === 'descartada' ? (
              <Button size="sm" disabled={salvando} onClick={() => decidir('reabrir')}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
              </Button>
            ) : modoDescarte ? (
              <>
                <Button size="sm" variant="destructive" disabled={salvando || nota.trim().length < 3} onClick={() => decidir('descartar')}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4 mr-1" /> Descartar</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setModoDescarte(false)}>Voltar</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="border-dashed" onClick={() => setModoDescarte(true)}>
                Não é decisão de ninguém da base
              </Button>
            )}
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setAlvo(null)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
