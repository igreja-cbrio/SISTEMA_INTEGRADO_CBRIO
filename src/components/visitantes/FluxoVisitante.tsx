// FLUXO DA PORTA DO VISITANTE · "o que a igreja deve fazer com quem entrou".
//
// Pedido do Marcos (11/09/2026): mapear o processo de cada porta pública e ter
// onde "avaliar se está sendo seguido".
//
// ⚠️⚠️ A régua mora no SERVIDOR (backend/utils/portaFluxos, no gate de deploy).
// Esta tela NÃO recalcula prazo, atraso nem adesão — ela pinta o que vem
// pronto. Duas réguas divergiriam no primeiro feriado, e a tela é a que a
// equipe acredita.
//
// ⚠️ A lista vem ORDENADA POR URGÊNCIA do servidor (atrasado primeiro, depois o
// que está pendente, depois o encerrado). Não reordenar por data aqui: foi
// assim que o atraso afundou no Cuidados.
import { useCallback, useEffect, useState } from 'react';
import { visitantes } from '../../api';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { AlertCircle, CheckCircle2, Clock, CircleDashed, MinusCircle } from 'lucide-react';

type Etapa = {
  chave: string; label: string; quem: string;
  depende_da_pessoa: boolean; encerra: boolean; prazo_dias: number;
};
type EtapaEstado = {
  chave: string; label: string; quem: string; depende_da_pessoa: boolean;
  encerra: boolean; prazo_em: number | null; feito_em: number | null; situacao: string;
};
type Item = {
  id: string; nome: string; telefone: string; created_at: string;
  culto: { nome: string; data: string } | null;
  pesquisa_nota: number | null; pesquisa_comentario: string | null;
  responsavel_atendimento: string | null;
  fluxo: {
    encerrado: boolean; desfecho: string | null; encaminhamento: string | null;
    etapas: EtapaEstado[]; atual: string | null; atrasadas: string[]; cobradas_pendentes: number;
  } | null;
};
type Dados = {
  janela: { rotulo: string };
  catalogo: {
    label: string; etapas: Etapa[];
    desfechos: { v: string; l: string; exigeEncaminhamento?: boolean }[];
    encaminhamentos: { v: string; l: string }[];
  };
  adesao: {
    pessoas: number; encerrados: number; adesao_pct: number | null; vencidas: number;
    por_etapa: Record<string, { label: string; feito: number; atrasado: number; no_prazo: number; dispensada: number }>;
  } | null;
  itens: Item[];
};

// ⚠️ Vocabulário FECHADO, espelho do servidor. 'aguardando' é o que a PESSOA
// ainda não fez — e nunca é pintado de vermelho: ela não deve nada.
const SIT: Record<string, { l: string; cor: string; Icone: typeof CheckCircle2 }> = {
  feito: { l: 'Feito', cor: 'text-emerald-600', Icone: CheckCircle2 },
  atrasado: { l: 'Atrasado', cor: 'text-red-600', Icone: AlertCircle },
  vence_hoje: { l: 'Vence hoje', cor: 'text-amber-600', Icone: Clock },
  no_prazo: { l: 'No prazo', cor: 'text-muted-foreground', Icone: CircleDashed },
  aguardando: { l: 'Aguardando ela', cor: 'text-muted-foreground', Icone: CircleDashed },
  dispensada: { l: 'Dispensada', cor: 'text-muted-foreground', Icone: MinusCircle },
};

function dia(v: string | number | null) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function FluxoVisitante() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [dias, setDias] = useState('30');
  const [alvo, setAlvo] = useState<Item | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    visitantes.fluxo({ dias })
      .then(setDados)
      .catch((e: any) => toast.error(e?.message || 'Não foi possível carregar o fluxo.'))
      .finally(() => setCarregando(false));
  }, [dias]);
  useEffect(() => { carregar(); }, [carregar]);

  const cat = dados?.catalogo;
  const ad = dados?.adesao;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">O que a igreja deve fazer com quem chegou</CardTitle>
            <Select value={dias} onValueChange={setDias}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="365">Último ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            O café e a pesquisa dependem da pessoa e nunca contam como atraso. A cobrança é só
            do que a equipe deve: falar com ela e encerrar o fluxo.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* O número que responde "está sendo seguido?" */}
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Adesão do que já venceu</p>
              {/* ⚠️ null (nada venceu) NÃO vira 0%: seria acusar a equipe no
                  domingo de manhã, com tudo ainda dentro do prazo. */}
              <p className="text-2xl font-bold">{ad?.adesao_pct == null ? '—' : `${ad.adesao_pct}%`}</p>
              <p className="text-xs text-muted-foreground">
                {ad?.vencidas ? `${ad.vencidas} tarefas já venceram` : 'nada venceu ainda'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pessoas na janela</p>
              <p className="text-2xl font-bold">{ad?.pessoas ?? 0}</p>
              <p className="text-xs text-muted-foreground">{ad?.encerrados ?? 0} com fluxo encerrado</p>
            </div>
            {cat?.etapas.filter((e) => !e.depende_da_pessoa).map((e) => {
              const n = ad?.por_etapa?.[e.chave];
              return (
                <div key={e.chave}>
                  <p className="text-xs text-muted-foreground">{e.label}</p>
                  <p className="text-2xl font-bold">
                    {n?.feito ?? 0}
                    {n?.atrasado ? <span className="text-red-600 text-base font-semibold"> · {n.atrasado} atrasado</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{e.quem} · em {e.prazo_dias} dia(s)</p>
                </div>
              );
            })}
          </div>

          {/* O mapa do fluxo, para quem nunca viu */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {cat?.etapas.map((e, i) => (
              <span key={e.chave} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground">·</span>}
                <span className={`text-xs px-2 py-1 rounded-full border ${e.depende_da_pessoa ? 'text-muted-foreground' : 'font-medium'}`}>
                  {e.label}
                  <span className="text-muted-foreground"> ({e.quem})</span>
                </span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {carregando ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
          {!carregando && !dados?.itens.length ? (
            <p className="text-sm text-muted-foreground">
              Ninguém entrou por esta porta na janela. Quando os cartazes estiverem no ar, a lista
              aparece aqui, com quem está atrasado no topo.
            </p>
          ) : null}
          {dados?.itens.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Chegou</TableHead>
                    {cat?.etapas.map((e) => <TableHead key={e.chave}>{e.label}</TableHead>)}
                    <TableHead>Desfecho</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.itens.map((it) => (
                    <TableRow key={it.id} className={it.fluxo?.atrasadas?.length ? 'bg-red-50/50 dark:bg-red-950/10' : undefined}>
                      <TableCell>
                        <span className="font-medium">{it.nome}</span>
                        {it.responsavel_atendimento ? (
                          <span className="block text-xs text-muted-foreground">com {it.responsavel_atendimento}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{dia(it.created_at)}</TableCell>
                      {/* ⚠️ fallback: sem fluxo a linha ficaria com menos células e a
                          tabela inteira sairia torta. Não deve acontecer (o servidor
                          sempre calcula), mas tabela torta esconde o atraso. */}
                      {(it.fluxo?.etapas || cat?.etapas.map((e) => ({ ...e, situacao: "no_prazo", feito_em: null, prazo_em: null })) || []).map((e: any) => {
                        const s = SIT[e.situacao] || SIT.no_prazo;
                        const Icone = s.Icone;
                        return (
                          <TableCell key={e.chave}>
                            <span className={`flex items-center gap-1 text-xs ${s.cor}`} title={`${s.l}${e.prazo_em ? ` · prazo ${dia(e.prazo_em)}` : ''}`}>
                              <Icone className="h-3.5 w-3.5" />
                              {e.feito_em ? dia(e.feito_em) : s.l}
                            </span>
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        {it.fluxo?.encerrado ? (
                          <Badge variant="outline">
                            {cat?.desfechos.find((d) => d.v === it.fluxo?.desfecho)?.l || it.fluxo?.desfecho}
                            {it.fluxo?.encaminhamento
                              ? ` · ${cat?.encaminhamentos.find((x) => x.v === it.fluxo?.encaminhamento)?.l || it.fluxo?.encaminhamento}`
                              : ''}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">em aberto</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={it.fluxo?.encerrado ? 'ghost' : 'default'} onClick={() => setAlvo(it)}>
                          {it.fluxo?.encerrado ? 'Rever' : 'Encerrar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {alvo && cat ? (
        <DialogDesfecho
          item={alvo}
          catalogo={cat}
          onFechar={() => setAlvo(null)}
          onPronto={() => { setAlvo(null); carregar(); }}
        />
      ) : null}
    </div>
  );
}

function DialogDesfecho({ item, catalogo, onFechar, onPronto }: {
  item: Item;
  catalogo: Dados['catalogo'];
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [resultado, setResultado] = useState(item.fluxo?.desfecho || '');
  const [encaminhamento, setEncaminhamento] = useState(item.fluxo?.encaminhamento || '');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const def = catalogo.desfechos.find((d) => d.v === resultado);
  const exige = !!def?.exigeEncaminhamento;

  async function salvar() {
    setSalvando(true);
    try {
      await visitantes.encerrarFluxo(item.id, { resultado, encaminhamento: exige ? encaminhamento : encaminhamento || undefined, observacao });
      toast.success('Fluxo encerrado.');
      onPronto();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível encerrar.');
    } finally { setSalvando(false); }
  }

  async function reabrir() {
    setSalvando(true);
    try {
      await visitantes.reabrirFluxo(item.id);
      toast.success('Fluxo reaberto.');
      onPronto();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível reabrir.');
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Encerrar o fluxo de {item.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {item.pesquisa_nota ? (
            <p className="text-xs text-muted-foreground">
              Ela respondeu a pesquisa{item.pesquisa_comentario ? `: “${item.pesquisa_comentario}”` : '.'}
            </p>
          ) : null}
          <div>
            <Label>Como terminou?</Label>
            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                {catalogo.desfechos.map((d) => <SelectItem key={d.v} value={d.v}>{d.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {exige ? (
            <div>
              <Label>Para onde você encaminhou?</Label>
              <Select value={encaminhamento} onValueChange={setEncaminhamento}>
                <SelectTrigger><SelectValue placeholder="Escolha o destino" /></SelectTrigger>
                <SelectContent>
                  {catalogo.encaminhamentos.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div>
            <Label>Observação (opcional)</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3}
              placeholder="O que ela contou, o que ficou combinado…" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {item.fluxo?.encerrado ? (
            <Button variant="ghost" onClick={reabrir} disabled={salvando}>Reabrir</Button>
          ) : null}
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          {/* O servidor valida de novo: o freio de verdade é lá. */}
          <Button onClick={salvar} disabled={salvando || !resultado || (exige && !encaminhamento)}>
            {salvando ? 'Salvando…' : 'Encerrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
