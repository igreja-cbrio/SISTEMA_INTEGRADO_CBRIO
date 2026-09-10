// Módulo VISITANTES (/visitantes · 09/09/2026) · quem lê a porta pública /visitante.
//
// Três abas, três públicos:
//   · Resgatar voucher — o balcão da CAFETERIA (nível 2): digita o código, vê
//     quem é, confirma a entrega. UPDATE condicionado no servidor: 2 toques = 1 café.
//   · Visitas — a equipe de Integração: quantos vieram, de onde (cartaz),
//     voucher retirado, nota da pesquisa e comentários.
//   · Cartazes (QR) — o QR de cada local, pronto pra imprimir; o QR dinâmico
//     (repontável sem reimprimir) continua no módulo Links e QR.
//
// A lista de PRÓXIMOS PASSOS (Cuidados) também mostra estas pessoas, com a
// etiqueta "Visitante" — lidas do mesmo endpoint, sem tocar em cui_convertidos.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Coffee, Users, QrCode, Star, MessageSquare, Search, Check, Ticket, MapPin, Copy, ExternalLink } from 'lucide-react';
import { ModuleHeader } from '../components/layout/ModuleHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useAuth } from '../contexts/AuthContext';
import { visitantes as api } from '../api';
import { hrefConversa } from '@/lib/conversas';
import { opcoesAno, ehAno, anoDe } from '../lib/janelaPeriodo';

const ACENTO = '#a855f7';

const LOCAL_LABEL: Record<string, string> = {
  lounge: 'Lounge', banheiro: 'Banheiro', estacionamento: 'Estacionamento', templo: 'Templo', outro: 'Sem local',
};
const VOUCHER_LABEL: Record<string, { l: string; cor: string }> = {
  emitido: { l: 'A retirar', cor: '#f59e0b' },
  resgatado: { l: 'Retirado', cor: '#10b981' },
  repetido: { l: 'Já tinha', cor: '#94a3b8' },
};
const PESQUISA_LABEL: Record<string, string> = {
  pendente: 'Aguardando o fim do culto', enviada: 'Enviada', respondida: 'Respondida',
  expirada: 'Não enviada (fora do prazo)', sem_optin: 'Sem opt-in',
};

function dataBR(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function diaBR(iso?: string | null) {
  return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
}

// ── Resgate ─────────────────────────────────────────────────────────────────
function Resgate({ podeResgatar }: { podeResgatar: boolean }) {
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [visita, setVisita] = useState<any | null>(null);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<any | null>(null);

  const cod = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  async function consultar(e?: React.FormEvent) {
    e?.preventDefault();
    setErro(''); setVisita(null); setFeito(null);
    if (cod.length !== 6) return setErro('O código tem 6 caracteres.');
    setBuscando(true);
    try { setVisita(await api.voucher.consultar(cod)); }
    catch (err: any) { setErro(err?.message || 'Voucher não encontrado.'); }
    finally { setBuscando(false); }
  }

  async function resgatar() {
    if (!visita) return;
    setBuscando(true);
    try {
      const r = await api.voucher.resgatar(cod);
      setFeito(r.visita);
      setVisita(null);
      toast.success(`Voucher de ${r.visita?.nome || 'visitante'} entregue.`);
    } catch (err: any) {
      // 409 = já resgatado: a tela DIZ quando e por quem, em vez de "erro"
      if (err?.codigo === 'ja_resgatado' || err?.visita) {
        setVisita(err.visita);
        setErro(`Este voucher já foi retirado${err.visita?.voucher_resgatado_em ? ` em ${dataBR(err.visita.voucher_resgatado_em)}` : ''}${err.visita?.voucher_resgatado_por_nome ? ` (por ${err.visita.voucher_resgatado_por_nome})` : ''}.`);
      } else {
        setErro(err?.message || 'Não foi possível resgatar.');
      }
    } finally { setBuscando(false); }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <form onSubmit={consultar} className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Ticket className="h-4 w-4" style={{ color: ACENTO }} />
          Peça o código que apareceu no celular da pessoa (6 letras/números).
        </div>
        <div className="flex gap-2">
          <Input
            value={cod} onChange={(e) => setCodigo(e.target.value)}
            placeholder="A B C 2 3 4" autoFocus autoComplete="off" spellCheck={false}
            className="h-14 text-2xl font-mono tracking-[0.35em] text-center uppercase"
            style={{ letterSpacing: '0.35em' }}
          />
          <Button type="submit" disabled={buscando || cod.length !== 6} className="h-14 px-5">
            <Search className="h-4 w-4 mr-1.5" /> Buscar
          </Button>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
      </form>

      {visita && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{visita.nome}</p>
              <p className="text-xs text-muted-foreground">
                {visita.culto_nome ? `${visita.culto_nome} · ` : ''}{diaBR(visita.culto_data || visita.created_at)}
                {visita.local ? ` · cartaz: ${LOCAL_LABEL[visita.local] || visita.local}` : ''}
              </p>
            </div>
            <VoucherBadge status={visita.voucher_status} />
          </div>
          {visita.voucher_status === 'emitido' ? (
            podeResgatar ? (
              <Button onClick={resgatar} disabled={buscando} className="w-full h-12 text-base" style={{ background: ACENTO }}>
                <Coffee className="h-5 w-5 mr-2" /> Entregar o café e marcar como retirado
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Você pode consultar, mas marcar a entrega exige nível 2 no módulo Visitantes.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              {visita.voucher_status === 'resgatado'
                ? `Retirado em ${dataBR(visita.voucher_resgatado_em)}${visita.voucher_resgatado_por_nome ? ` por ${visita.voucher_resgatado_por_nome}` : ''}.`
                : 'Esta visita não tem voucher a retirar.'}
            </p>
          )}
        </div>
      )}

      {feito && (
        <div className="rounded-2xl border p-5 flex items-center gap-3" style={{ borderColor: '#10b98155', background: '#10b98110' }}>
          <Check className="h-6 w-6 text-emerald-600" />
          <div>
            <p className="font-semibold">{feito.nome} · voucher retirado</p>
            <p className="text-xs text-muted-foreground">{dataBR(feito.voucher_resgatado_em)} · código {feito.voucher_codigo}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function VoucherBadge({ status }: { status: string }) {
  const m = VOUCHER_LABEL[status] || { l: status, cor: '#94a3b8' };
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ background: m.cor + '22', color: m.cor, border: `1px solid ${m.cor}55` }}>{m.l}</span>
  );
}

// ── Visitas ─────────────────────────────────────────────────────────────────
function Visitas() {
  const [periodo, setPeriodo] = useState<string>('30');
  const [local, setLocal] = useState<string>('todos');
  const [busca, setBusca] = useState('');
  const [resumo, setResumo] = useState<any | null>(null);
  const [lista, setLista] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const params = useMemo(() => {
    const p: Record<string, string> = ehAno(periodo) ? { ano: String(anoDe(periodo)) } : { dias: periodo };
    return p;
  }, [periodo]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setErro('');
    Promise.all([
      api.resumo(params),
      api.listar({ ...params, ...(local !== 'todos' ? { local } : {}) }),
    ]).then(([r, l]) => { if (!vivo) return; setResumo(r); setLista(l.visitas || []); })
      .catch((e: any) => { if (vivo) setErro(e?.message || 'Não foi possível carregar.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [params, local]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((v) => `${v.nome || ''} ${v.telefone || ''} ${v.voucher_codigo || ''}`.toLowerCase().includes(q));
  }, [lista, busca]);

  const tiles = resumo ? [
    { l: 'Visitas', v: resumo.visitas, s: `${resumo.pessoas_distintas} pessoas`, icon: Users, cor: ACENTO },
    { l: 'Vouchers retirados', v: resumo.voucher?.resgatados ?? 0, s: `${resumo.voucher?.emitidos ?? 0} a retirar · ${resumo.voucher?.repetidos ?? 0} já tinham`, icon: Coffee, cor: '#f59e0b' },
    { l: 'Nota média', v: resumo.pesquisa?.nota_media == null ? '—' : resumo.pesquisa.nota_media.toFixed(1), s: resumo.pesquisa?.respondidas ? `${resumo.pesquisa.respondidas} respostas de ${resumo.pesquisa.enviadas} enviadas` : 'ninguém respondeu ainda', icon: Star, cor: '#10b981' },
    { l: 'Opt-in WhatsApp', v: resumo.whatsapp_optin, s: resumo.visitas ? `${Math.round((resumo.whatsapp_optin / resumo.visitas) * 100)}% das visitas` : '—', icon: MessageSquare, cor: '#3b82f6' },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Último ano</SelectItem>
            {opcoesAno().map((a: any) => <SelectItem key={a.dias} value={String(a.dias)}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={local} onValueChange={setLocal}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os cartazes</SelectItem>
            {Object.entries(LOCAL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, telefone ou código" className="pl-8" />
        </div>
        {resumo?.janela?.rotulo && <span className="text-xs text-muted-foreground ml-auto">{resumo.janela.rotulo}</span>}
      </div>

      {erro && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{erro}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.l} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
            <div className="rounded-lg p-2 shrink-0" style={{ background: t.cor + '18' }}><t.icon className="h-5 w-5" style={{ color: t.cor }} /></div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t.l}</p>
              <span className="text-2xl font-bold text-foreground">{t.v}</span>
              <p className="text-[11px] text-muted-foreground truncate">{t.s}</p>
            </div>
          </div>
        ))}
      </div>

      {resumo && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(resumo.por_local || {}).map(([k, n]: any) => (
            <span key={k} className="px-2 py-1 rounded-full border border-border bg-card">
              <MapPin className="inline h-3 w-3 mr-1 text-muted-foreground" />{LOCAL_LABEL[k] || k}: <strong>{n}</strong>
            </span>
          ))}
          {resumo.pesquisa?.respondidas > 0 && (
            <span className="px-2 py-1 rounded-full border border-border bg-card">
              Notas · {[5, 4, 3, 2, 1].map((n) => `${n}★ ${resumo.pesquisa.distribuicao?.[n] ?? 0}`).join(' · ')}
            </span>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Visitante</TableHead>
              <TableHead>Quando</TableHead>
              <TableHead>Cartaz</TableHead>
              <TableHead>Voucher</TableHead>
              <TableHead>Pesquisa</TableHead>
              <TableHead>1º contato</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
            ) : filtradas.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {erro ? 'Não foi possível carregar a lista.' : lista.length === 0 ? 'Nenhuma visita registrada neste período.' : 'Nenhum resultado na busca.'}
              </TableCell></TableRow>
            ) : filtradas.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <div className="font-medium">{v.nome}</div>
                  <div className="text-xs text-muted-foreground">{v.telefone}{!v.membro_id && <span className="ml-1 text-amber-600" title="A pessoa não foi ligada a um cadastro">· sem cadastro ligado</span>}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {dataBR(v.created_at)}
                  {v.culto_nome && <div className="text-[11px] text-muted-foreground">{v.culto_nome}</div>}
                </TableCell>
                <TableCell className="text-sm">{LOCAL_LABEL[v.local] || v.local}</TableCell>
                <TableCell>
                  <VoucherBadge status={v.voucher_status} />
                  {v.voucher_codigo && <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{v.voucher_codigo}</div>}
                </TableCell>
                <TableCell className="text-sm">
                  {v.pesquisa_nota ? (
                    <div>
                      <span className="font-semibold">{v.pesquisa_nota}</span><span className="text-muted-foreground">/5</span>
                      {v.pesquisa_comentario && <div className="text-xs text-muted-foreground max-w-[260px] whitespace-pre-wrap">“{v.pesquisa_comentario}”</div>}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{PESQUISA_LABEL[v.pesquisa_status] || v.pesquisa_status || '—'}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {v.primeiro_contato_status ? `${v.primeiro_contato_status}${v.responsavel_atendimento ? ` · ${v.responsavel_atendimento}` : ''}` : '—'}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {v.telefone && (
                    <Link to={hrefConversa(`55${String(v.telefone).replace(/\D/g, '')}`, `Olá ${String(v.nome || '').split(/\s+/)[0]}! Aqui é da CBRio 🙏 Que alegria receber você! Como foi sua visita?`)}
                      title="Abrir conversa no WhatsApp" className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        O acompanhamento (1º contato, responsável) é feito em <Link to="/ministerial/cuidados?tab=convertidos" className="underline">Cuidados → Próximos passos</Link>, onde os visitantes aparecem com a etiqueta “Visitante”.
      </p>
    </div>
  );
}

// ── Cartazes ────────────────────────────────────────────────────────────────
function Cartazes() {
  const [locais, setLocais] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  useEffect(() => { api.locais().then(setLocais).catch((e: any) => setErro(e?.message || 'Não foi possível carregar.')); }, []);
  async function copiar(url: string) {
    try { await navigator.clipboard.writeText(url); toast.success('Link copiado'); }
    catch { toast.error('Não foi possível copiar — selecione o link e copie.'); }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Um QR por local: o <code>?local=</code> etiqueta de onde a pessoa escaneou (aparece na lista). Para um QR que
        possa ser <strong>repontado sem reimprimir</strong>, gere o código dinâmico em <Link to="/links" className="underline">Links e QR</Link> — estes destinos já estão no catálogo de lá.
      </p>
      {erro && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{erro}</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {locais.map((l) => (
          <div key={l.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col items-center text-center gap-3">
            <div className="bg-white p-3 rounded-xl"><QRCodeSVG value={l.url} size={168} level="M" /></div>
            <div>
              <p className="font-semibold">{l.nome}</p>
              <p className="text-xs text-muted-foreground mt-1 italic">“{l.chamada}”</p>
            </div>
            <div className="flex items-center gap-1.5 w-full">
              <code className="text-[11px] flex-1 truncate text-muted-foreground text-left">{l.url}</code>
              <Button variant="ghost" size="sm" onClick={() => copiar(l.url)} title="Copiar link"><Copy className="h-3.5 w-3.5" /></Button>
              <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent" title="Abrir"><ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Visitantes() {
  const { isAdmin, getAccessLevel } = useAuth() as any;
  const nivel = getAccessLevel?.(['visitantes']) ?? 0;
  const podeResgatar = !!isAdmin || nivel >= 2;
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'resgate';

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <ModuleHeader
        icon={Coffee}
        title="Visitantes"
        accent={ACENTO}
        subtitle="Porta do visitante: QR nos cartazes, voucher da cafeteria, pesquisa depois do culto e a lista de quem chegou."
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })} className="space-y-4">
        <TabsList>
          <TabsTrigger value="resgate"><Ticket className="h-3.5 w-3.5 mr-1.5" />Resgatar voucher</TabsTrigger>
          <TabsTrigger value="visitas"><Users className="h-3.5 w-3.5 mr-1.5" />Visitas</TabsTrigger>
          <TabsTrigger value="cartazes"><QrCode className="h-3.5 w-3.5 mr-1.5" />Cartazes (QR)</TabsTrigger>
        </TabsList>
        <TabsContent value="resgate"><Resgate podeResgatar={podeResgatar} /></TabsContent>
        <TabsContent value="visitas"><Visitas /></TabsContent>
        <TabsContent value="cartazes"><Cartazes /></TabsContent>
      </Tabs>
    </div>
  );
}
