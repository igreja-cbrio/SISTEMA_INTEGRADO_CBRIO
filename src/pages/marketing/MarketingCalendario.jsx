import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { marketing as api } from '../../api';
import MarketingNav from './MarketingNav';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2, Megaphone,
  Kanban, AlertCircle, Clock, Repeat, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function segundaDaSemana(date) {
  const d = new Date(date);
  const day = d.getDay() || 7; // ISO: dom=7
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDias(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtSemana(seg) {
  const dom = addDias(seg, 6);
  const m1 = seg.toLocaleDateString('pt-BR', { month: 'short' });
  const m2 = dom.toLocaleDateString('pt-BR', { month: 'short' });
  if (m1 === m2) return `${seg.getDate()}–${dom.getDate()} ${m2}`;
  return `${seg.getDate()} ${m1} – ${dom.getDate()} ${m2}`;
}

function fmtData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function MarketingCalendario() {
  const navigate = useNavigate();
  const { profile, isAdmin, modulePerms } = useAuth();
  const lvl = useMemo(() => {
    const m = modulePerms?.marketing || modulePerms?.Marketing;
    return Math.max(m?.leitura || 0, m?.escrita || 0);
  }, [modulePerms]);
  const isCoordenador = isAdmin || lvl >= 5;

  const [semana, setSemana]           = useState(segundaDaSemana(new Date()));
  const [capacidade, setCapacidade]   = useState([]);
  const [cards, setCards]             = useState([]);
  const [recorrentes, setRecorrentes] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [detalheCard, setDetalheCard] = useState(null);
  const [detalheMembro, setDetalheMembro] = useState(null);

  // Visão colaborador: filtra capacidade pelo próprio profile_id quando não-coord
  const minhaCapacidade = useMemo(() => {
    if (isCoordenador) return capacidade;
    return capacidade.filter(c => c.profile_id === profile?.id);
  }, [capacidade, isCoordenador, profile?.id]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const semanaIso = semana.toISOString().slice(0, 10);
      const [cap, rec, all] = await Promise.all([
        api.capacidade(semanaIso),
        api.recorrentes(),
        api.cards(),
      ]);
      setCapacidade(Array.isArray(cap) ? cap : []);
      setRecorrentes(rec || []);
      // Filtra cards que tem prazo (confirmado ou preliminar) na semana
      const seg = semana.getTime();
      const dom = addDias(semana, 7).getTime();
      const cardsSemana = (all || []).filter(c => {
        const prazo = c.prazo_confirmado || c.prazo_preliminar;
        if (!prazo) return false;
        const t = new Date(prazo).getTime();
        return t >= seg && t < dom && c.estado !== 'concluido';
      });
      setCards(cardsSemana);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar calendário');
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => { carregar(); }, [carregar]);

  function navegar(dir) {
    setSemana(s => addDias(s, dir * 7));
  }

  function voltarHoje() {
    setSemana(segundaDaSemana(new Date()));
  }

  // Mapa membro_id -> { dia_idx: [cards] }
  const cardsPorMembroDia = useMemo(() => {
    const mapa = {};
    cards.forEach(c => {
      if (!c.atribuido_a) return;
      const prazo = c.prazo_confirmado || c.prazo_preliminar;
      const data = new Date(prazo);
      // ISO: segunda=1, domingo=7 · diaIdx 0=seg, 6=dom
      const isoDay = data.getDay() || 7;
      const diaIdx = isoDay - 1;
      if (!mapa[c.atribuido_a]) mapa[c.atribuido_a] = {};
      if (!mapa[c.atribuido_a][diaIdx]) mapa[c.atribuido_a][diaIdx] = [];
      mapa[c.atribuido_a][diaIdx].push(c);
    });
    return mapa;
  }, [cards]);

  // Mapa membro_id -> { dia_idx: [recorrentes] }
  const recPorMembroDia = useMemo(() => {
    const mapa = {};
    recorrentes.forEach(r => {
      // r.dia_semana: 0=dom, 1=seg, ..., 6=sab
      // diaIdx: 0=seg, ..., 6=dom
      const diaIdx = r.dia_semana === 0 ? 6 : r.dia_semana - 1;
      if (!mapa[r.membro_id]) mapa[r.membro_id] = {};
      if (!mapa[r.membro_id][diaIdx]) mapa[r.membro_id][diaIdx] = [];
      mapa[r.membro_id][diaIdx].push(r);
    });
    return mapa;
  }, [recorrentes]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calendário de capacidade · {isCoordenador ? 'visão coordenador' : 'sua semana'}
          </p>
        </div>
        <div className="shrink-0">
          <MarketingNav />
        </div>
      </div>

      {/* Navegacao da semana */}
      <div className="flex items-center justify-between gap-2 p-3 bg-muted/30 rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navegar(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded border border-border">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{fmtSemana(semana)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navegar(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={voltarHoje}>Hoje</Button>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Repeat className="h-3 w-3" /> Recorrente</span>
          <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-rose-500" /> Urgente</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-amber-500" /> Atrasado</span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : minhaCapacidade.length === 0 ? (
        <Card className="p-8 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {isCoordenador
              ? 'Sem membros ativos na equipe'
              : 'Você não está cadastrado em marketing_membros · fale com o Pedro Paiva ou Marcos'}
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[700px]" style={{ gridTemplateColumns: 'minmax(150px, 180px) repeat(7, minmax(100px, 1fr))' }}>
            {/* Header dos dias */}
            <div className="font-medium text-sm text-muted-foreground p-2"></div>
            {DIAS_SEMANA.map((d, i) => {
              const dia = addDias(semana, i);
              const isHoje = dia.toDateString() === new Date().toDateString();
              return (
                <div key={d} className={`p-2 text-center text-xs font-medium border-b border-border ${isHoje ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                  <div>{d}</div>
                  <div className={`text-base ${isHoje ? 'font-bold' : ''}`}>{dia.getDate()}</div>
                </div>
              );
            })}

            {/* Linhas por membro */}
            {minhaCapacidade.map(c => (
              <MembroLinha
                key={c.membro_id}
                capacidade={c}
                cardsPorDia={cardsPorMembroDia[c.membro_id] || {}}
                recPorDia={recPorMembroDia[c.membro_id] || {}}
                onClickCard={setDetalheCard}
                onClickMembro={() => setDetalheMembro({
                  capacidade: c,
                  cards: Object.values(cardsPorMembroDia[c.membro_id] || {}).flat(),
                  recorrentes: Object.values(recPorMembroDia[c.membro_id] || {}).flat(),
                })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Detalhe card (Drawer simples · link pro /marketing pra editar) */}
      <Sheet open={!!detalheCard} onOpenChange={(o) => { if (!o) setDetalheCard(null); }}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              {detalheCard?.titulo || 'Card'}
            </SheetTitle>
          </SheetHeader>
          {detalheCard && (
            <div className="mt-4 space-y-3 text-sm">
              {detalheCard.descricao && <p className="text-muted-foreground">{detalheCard.descricao}</p>}
              <div className="flex flex-wrap gap-1">
                {detalheCard.etiqueta_tipo && (
                  <Badge style={detalheCard.etiqueta_tipo.cor ? { backgroundColor: `${detalheCard.etiqueta_tipo.cor}25`, color: detalheCard.etiqueta_tipo.cor } : undefined}>
                    {detalheCard.etiqueta_tipo.nome}
                  </Badge>
                )}
                {detalheCard.etiqueta_destino && (
                  <Badge style={detalheCard.etiqueta_destino.cor ? { backgroundColor: `${detalheCard.etiqueta_destino.cor}25`, color: detalheCard.etiqueta_destino.cor } : undefined}>
                    {detalheCard.etiqueta_destino.nome}
                  </Badge>
                )}
                {detalheCard.raia_rapida && <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400">⚡ Urgente</Badge>}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Estado: {detalheCard.estado}</p>
                <p>Prazo: {fmtData(detalheCard.prazo_confirmado || detalheCard.prazo_preliminar)}{!detalheCard.prazo_confirmado && ' (preliminar)'}</p>
                <p>Atribuído: {detalheCard.atribuido?.profile?.name || 'Não atribuído'}</p>
              </div>
              <Button variant="outline" onClick={() => navigate('/marketing')} className="w-full">
                Abrir no Kanban
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Sheet detalhe do membro · clique no nome */}
      <Sheet open={!!detalheMembro} onOpenChange={(o) => { if (!o) setDetalheMembro(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              {detalheMembro?.capacidade.profile?.name || 'Membro'}
            </SheetTitle>
          </SheetHeader>
          {detalheMembro && (
            <MembroDetalhe
              capacidade={detalheMembro.capacidade}
              cards={detalheMembro.cards}
              recorrentes={detalheMembro.recorrentes}
              onClickCard={(c) => { setDetalheMembro(null); setDetalheCard(c); }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MembroDetalhe({ capacidade, cards, recorrentes, onClickCard }) {
  const c = capacidade;
  const sobrecarga = c.horas_livres < 0;
  const utilizacao = c.horas_disponiveis > 0
    ? Math.min(100, Math.round((c.horas_alocadas / c.horas_disponiveis) * 100))
    : 0;

  return (
    <div className="mt-4 space-y-4 text-sm pb-8">
      <p className="text-xs text-muted-foreground">{c.habilidade}</p>

      {/* Stats */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Capacidade</span>
          <span className="font-bold">
            {Number(c.horas_alocadas).toFixed(1)}/{Number(c.horas_disponiveis).toFixed(1)}h
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${sobrecarga ? 'bg-rose-500' : utilizacao > 90 ? 'bg-amber-500' : 'bg-primary'}`}
            style={{ width: `${Math.min(utilizacao, 100)}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground pt-1">
          <div>
            <div className="text-foreground font-medium">{Number(c.horas_recorrentes).toFixed(1)}h</div>
            <div>Recorrentes</div>
          </div>
          <div>
            <div className="text-foreground font-medium">{(Number(c.horas_alocadas) - Number(c.horas_recorrentes)).toFixed(1)}h</div>
            <div>Cards</div>
          </div>
          <div>
            <div className={`font-medium ${sobrecarga ? 'text-rose-600' : 'text-emerald-600'}`}>
              {Number(c.horas_livres).toFixed(1)}h
            </div>
            <div>Livre</div>
          </div>
        </div>
        {c.horas_override != null && (
          <p className="text-[11px] text-amber-600">⚠️ Capacidade ajustada via override ({Number(c.horas_override).toFixed(1)}h disponíveis)</p>
        )}
      </Card>

      {/* Recorrentes */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5" /> Recorrentes ({recorrentes.length})
        </p>
        {recorrentes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sem compromissos recorrentes</p>
        ) : (
          <ul className="space-y-1">
            {recorrentes.map(r => (
              <li key={r.id} className="text-xs bg-muted/30 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                <span className="truncate">{r.descricao}</span>
                <span className="text-muted-foreground shrink-0">{r.duracao_h}h</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Cards da semana */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5" /> Cards atribuídos esta semana ({cards.length})
        </p>
        {cards.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sem cards atribuídos pra esta semana</p>
        ) : (
          <ul className="space-y-1">
            {cards.map(card => (
              <li key={card.id}>
                <button
                  onClick={() => onClickCard(card)}
                  className="w-full text-left text-xs bg-card hover:bg-accent border border-border rounded px-2 py-1.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium truncate flex-1">{card.titulo}</span>
                    {card.raia_rapida && (
                      <Badge className="text-[9px] bg-rose-500/15 text-rose-700 dark:text-rose-400">⚡</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {card.etiqueta_tipo && (
                      <span style={card.etiqueta_tipo.cor ? { color: card.etiqueta_tipo.cor } : undefined}>
                        {card.etiqueta_tipo.nome}{card.etiqueta_tipo.esforco_max_h ? ` · ${card.etiqueta_tipo.esforco_max_h}h` : ''}
                      </span>
                    )}
                    {card.prazo_confirmado && (
                      <span>· {new Date(card.prazo_confirmado).toLocaleDateString('pt-BR')}</span>
                    )}
                    <span>· {card.estado}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Linha do membro · 1 célula por dia
// ═══════════════════════════════════════════════════════════════════════
function MembroLinha({ capacidade, cardsPorDia, recPorDia, onClickCard, onClickMembro }) {
  const c = capacidade;
  const sobrecarga = c.horas_livres < 0;
  const utilizacao = c.horas_disponiveis > 0
    ? Math.min(100, Math.round((c.horas_alocadas / c.horas_disponiveis) * 100))
    : 0;

  return (
    <>
      {/* Nome do membro · clicavel · sticky-left */}
      <button
        onClick={onClickMembro}
        className="p-2 border-b border-border bg-card text-left hover:bg-accent/50 transition-colors cursor-pointer"
      >
        <p className="text-sm font-medium truncate text-primary hover:underline">{c.profile?.name || '(sem nome)'}</p>
        <p className="text-xs text-muted-foreground">{c.habilidade}</p>
        <p className={`text-[10px] mt-1 ${sobrecarga ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
          {Number(c.horas_alocadas).toFixed(1)}/{Number(c.horas_disponiveis).toFixed(1)}h · {utilizacao}%
          {Number(c.horas_recorrentes) > 0 && (
            <span className="ml-1 text-muted-foreground">({Number(c.horas_recorrentes).toFixed(1)}h recorr.)</span>
          )}
        </p>
      </button>

      {/* 7 células · uma por dia */}
      {[0, 1, 2, 3, 4, 5, 6].map(diaIdx => (
        <DiaCelula
          key={diaIdx}
          cards={cardsPorDia[diaIdx] || []}
          recorrentes={recPorDia[diaIdx] || []}
          onClickCard={onClickCard}
        />
      ))}
    </>
  );
}

function DiaCelula({ cards, recorrentes, onClickCard }) {
  const vazio = cards.length === 0 && recorrentes.length === 0;
  return (
    <div className={`p-1.5 border-b border-r border-border min-h-[80px] ${vazio ? 'bg-muted/10' : 'bg-card'}`}>
      {recorrentes.map(r => (
        <div key={r.id} className="mb-1 px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground flex items-center gap-1 truncate">
          <Repeat className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{r.descricao}</span>
        </div>
      ))}
      {cards.map(c => (
        <button
          key={c.id}
          onClick={() => onClickCard(c)}
          className={`block w-full mb-1 px-1.5 py-1 rounded text-[10px] text-left truncate cursor-pointer transition-colors hover:ring-1 hover:ring-primary/40 ${
            c.raia_rapida ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400' : 'bg-primary/10 text-foreground'
          }`}
          style={c.etiqueta_tipo?.cor && !c.raia_rapida ? { backgroundColor: `${c.etiqueta_tipo.cor}20`, color: c.etiqueta_tipo.cor } : undefined}
          title={c.titulo}
        >
          {c.raia_rapida && '⚡ '}
          {c.titulo}
        </button>
      ))}
    </div>
  );
}
