// ============================================================================
// Convidar para o NEXT · UI
// ============================================================================
// Lista convertidos sem NEXT (com filtro por contato pastoral), deixa escolher
// o tipo de mensagem (Boas-vindas sem link · ou Convite do NEXT), selecionar
// (vários ou um a um) e disparar por WhatsApp (template da Meta) — com botão
// manual (wa.me) por pessoa enquanto o template não estiver aprovado.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { nextConvite as api } from '../api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Send, MessageCircle, CheckSquare, Square, Loader2, Sparkles, ChevronDown, ChevronUp, Save, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type Pendente = { id: string; nome: string; telefone: string | null; area: string | null; data_culto: string | null; tem_telefone: boolean; contatado: boolean; next_convite_em: string | null };
const AREA_LABEL: Record<string, string> = { ami: 'AMI', bridge: 'Bridge', online: 'Online', sede: 'Sede' };
type Tipo = 'next' | 'boas_vindas';
type Contato = 'nao' | 'sim' | 'todos';

export default function NextConvite() {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modelo, setModelo] = useState('');
  const [modeloBV, setModeloBV] = useState('');
  const [link, setLink] = useState('');
  const [templateOk, setTemplateOk] = useState(false);
  const [templateBVOk, setTemplateBVOk] = useState(false);
  const [tipo, setTipo] = useState<Tipo>('next');
  const [contato, setContato] = useState<Contato>('nao');
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregarConfig = useCallback(() => {
    api.getConfig()
      .then((c: any) => {
        setModelo(c?.mensagem_modelo || '');
        setModeloBV(c?.mensagem_boas_vindas || '');
        setLink(c?.link_inscricao || '');
        setTemplateOk(!!c?.template_configurado);
        setTemplateBVOk(!!c?.template_boas_vindas_configurado);
      })
      .catch(() => {});
  }, []);
  const carregarPendentes = useCallback((f: Contato) => {
    setLoading(true);
    api.pendentes(f)
      .then((p: any) => { setPendentes(p || []); setSel(new Set()); })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregarConfig(); }, [carregarConfig]);
  useEffect(() => { carregarPendentes(contato); }, [contato, carregarPendentes]);

  const modeloAtivo = tipo === 'boas_vindas' ? modeloBV : modelo;
  const setModeloAtivo = (v: string) => (tipo === 'boas_vindas' ? setModeloBV(v) : setModelo(v));
  const templateAtivoOk = tipo === 'boas_vindas' ? templateBVOk : templateOk;
  // "já enviado" deste tipo: boas-vindas marca contato; convite marca next_convite_em
  const jaEnviado = (p: Pendente) => (tipo === 'boas_vindas' ? p.contatado : !!p.next_convite_em);
  const elegiveis = pendentes.filter((p) => p.tem_telefone && !jaEnviado(p));

  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTodos() {
    setSel((s) => (s.size >= elegiveis.length && elegiveis.length > 0 ? new Set() : new Set(elegiveis.map((p) => p.id))));
  }
  function mensagemPara(nome: string) {
    const primeiro = (nome || '').trim().split(/\s+/)[0] || '';
    return (modeloAtivo || '').replace(/\{nome\}/g, primeiro).replace(/\{link\}/g, link || '');
  }
  function abrirWhatsapp(p: Pendente) {
    const tel = (p.telefone || '').replace(/\D/g, '');
    if (!tel) return;
    const num = tel.startsWith('55') ? tel : `55${tel}`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(mensagemPara(p.nome))}`, '_blank', 'noopener,noreferrer');
    // marca o status da pessoa (envio manual) e recarrega a lista
    api.marcar([p.id], tipo).then(() => carregarPendentes(contato)).catch(() => {});
  }
  async function salvar() {
    setSalvando(true);
    try { await api.saveConfig({ mensagem_modelo: modelo, mensagem_boas_vindas: modeloBV, link_inscricao: link }); toast.success('Modelo salvo'); setEditando(false); }
    catch (e: any) { toast.error(e.message); } finally { setSalvando(false); }
  }
  async function enviar() {
    const ids = [...sel];
    if (ids.length === 0) { toast.error('Selecione ao menos uma pessoa.'); return; }
    setEnviando(true);
    try {
      const r: any = await api.enviar(ids, tipo);
      if (!r.template_configurado) {
        toast.warning(`Template ${tipo === 'boas_vindas' ? 'de boas-vindas' : 'do convite'} ainda não aprovado na Meta — nada foi enviado em massa. Use o WhatsApp por pessoa, ou aprove o template.`);
      } else {
        toast.success(`${r.enviados} enviado(s)${r.sem_telefone ? ` · ${r.sem_telefone} sem telefone` : ''}${r.falhas ? ` · ${r.falhas} falha(s)` : ''}`);
        setSel(new Set());
        carregarPendentes(contato); // reflete o status atualizado
      }
    } catch (e: any) { toast.error(e.message); } finally { setEnviando(false); }
  }

  return (
    <Card className="p-4">
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Convidar para o NEXT</span>
          <Badge variant="secondary">{loading ? '…' : `${pendentes.length} sem NEXT`}</Badge>
        </div>
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {aberto && (
        <div className="space-y-4 mt-3">
          {/* Tipo de mensagem + filtro de contato */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="boas_vindas">Boas-vindas (sem link)</SelectItem>
                  <SelectItem value="next">Convite do NEXT (com link)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Filtrar por contato</Label>
              <Select value={contato} onValueChange={(v) => setContato(v as Contato)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não contactados</SelectItem>
                  <SelectItem value="sim">Já contactados</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Modelo (do tipo selecionado) */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Modelo · {tipo === 'boas_vindas' ? 'Boas-vindas' : 'Convite NEXT'} · use {'{nome}'}{tipo === 'next' ? ' e {link}' : ''}
              </span>
              {!editando
                ? <Button variant="ghost" size="sm" onClick={() => setEditando(true)}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
                : <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" /> Salvar</>}</Button>}
            </div>
            {editando ? (
              <>
                <Textarea rows={4} value={modeloAtivo} onChange={(e) => setModeloAtivo(e.target.value)} className="text-sm" />
                {tipo === 'next' && (
                  <div><Label className="text-xs">Link de inscrição do NEXT</Label><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://cbrio.org/next" /></div>
                )}
              </>
            ) : (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{mensagemPara('Maria')}</p>
            )}
          </div>

          {!templateAtivoOk && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ Envio em massa pela API exige o template aprovado na Meta (env <code>{tipo === 'boas_vindas' ? 'WHATSAPP_TEMPLATE_BOAS_VINDAS' : 'WHATSAPP_TEMPLATE_NEXT_CONVITE'}</code>). Enquanto isso, use o botão de WhatsApp por pessoa (manual).
            </div>
          )}

          {/* Ações de seleção */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={toggleTodos} disabled={elegiveis.length === 0}>
              {sel.size >= elegiveis.length && elegiveis.length > 0 ? <CheckSquare className="h-4 w-4 mr-1" /> : <Square className="h-4 w-4 mr-1" />}
              {sel.size >= elegiveis.length && elegiveis.length > 0 ? 'Limpar seleção' : `Selecionar não-enviados (${elegiveis.length})`}
            </Button>
            <Button size="sm" onClick={enviar} disabled={enviando || sel.size === 0}>
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Enviar ({sel.size})
            </Button>
          </div>

          {/* Lista */}
          {loading ? (
            <div className="py-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : pendentes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Ninguém neste filtro.</p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {pendentes.map((p) => {
                const marcado = sel.has(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <button onClick={() => p.tem_telefone && toggle(p.id)} disabled={!p.tem_telefone} className="shrink-0 disabled:opacity-30">
                      {marcado ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.nome}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        {p.area && <Badge variant="outline" className="text-[10px]">{AREA_LABEL[p.area] || p.area}</Badge>}
                        {tipo === 'boas_vindas' && p.contatado && <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">contactado ✓</Badge>}
                        {tipo === 'next' && p.next_convite_em && <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">convidado ✓</Badge>}
                        <span>{p.tem_telefone ? p.telefone : <span className="text-amber-600">sem telefone</span>}</span>
                      </div>
                    </div>
                    {p.tem_telefone && (
                      <Button variant="ghost" size="sm" className="text-green-700" onClick={() => abrirWhatsapp(p)} title="Abrir no WhatsApp (manual)">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
