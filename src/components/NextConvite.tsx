// ============================================================================
// Convidar para o NEXT · UI
// ============================================================================
// Lista os convertidos sem NEXT, deixa selecionar (vários ou um a um) e dispara
// o convite por WhatsApp (template da Meta) com o link de inscrição. O modelo de
// mensagem é editável. Enquanto o template da Meta não estiver aprovado, dá pra
// enviar manualmente em 1 toque (wa.me) por pessoa.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { nextConvite as api } from '../api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Send, MessageCircle, CheckSquare, Square, Loader2, Sparkles, ChevronDown, ChevronUp, Save, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type Pendente = { id: string; nome: string; telefone: string | null; area: string | null; data_culto: string | null; tem_telefone: boolean };
const AREA_LABEL: Record<string, string> = { ami: 'AMI', bridge: 'Bridge', online: 'Online', sede: 'Sede' };

export default function NextConvite() {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modelo, setModelo] = useState('');
  const [link, setLink] = useState('');
  const [templateOk, setTemplateOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    Promise.all([api.pendentes(), api.getConfig()])
      .then(([p, c]: any) => {
        setPendentes(p || []);
        setModelo(c?.mensagem_modelo || '');
        setLink(c?.link_inscricao || '');
        setTemplateOk(!!c?.template_configurado);
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const comTelefone = pendentes.filter((p) => p.tem_telefone);

  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTodos() {
    setSel((s) => (s.size >= comTelefone.length ? new Set() : new Set(comTelefone.map((p) => p.id))));
  }
  function mensagemPara(nome: string) {
    const primeiro = (nome || '').trim().split(/\s+/)[0] || '';
    return (modelo || '').replace(/\{nome\}/g, primeiro).replace(/\{link\}/g, link || '');
  }
  function abrirWhatsapp(p: Pendente) {
    const tel = (p.telefone || '').replace(/\D/g, '');
    if (!tel) return;
    const num = tel.startsWith('55') ? tel : `55${tel}`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(mensagemPara(p.nome))}`, '_blank', 'noopener,noreferrer');
  }

  async function salvar() {
    setSalvando(true);
    try { await api.saveConfig({ mensagem_modelo: modelo, link_inscricao: link }); toast.success('Modelo salvo'); setEditando(false); }
    catch (e: any) { toast.error(e.message); } finally { setSalvando(false); }
  }

  async function enviar() {
    const ids = [...sel];
    if (ids.length === 0) { toast.error('Selecione ao menos uma pessoa.'); return; }
    setEnviando(true);
    try {
      const r: any = await api.enviar(ids);
      if (!r.template_configurado) {
        toast.warning('Template do WhatsApp ainda não aprovado na Meta — nada foi enviado em massa. Use o botão de WhatsApp por pessoa, ou aprove o template.');
      } else {
        toast.success(`${r.enviados} convite(s) enviado(s)${r.sem_telefone ? ` · ${r.sem_telefone} sem telefone` : ''}${r.falhas ? ` · ${r.falhas} falha(s)` : ''}`);
        setSel(new Set());
      }
    } catch (e: any) { toast.error(e.message); } finally { setEnviando(false); }
  }

  if (loading) return null;
  if (pendentes.length === 0) return null;

  return (
    <Card className="p-4">
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Convidar para o NEXT</span>
          <Badge variant="secondary">{pendentes.length} sem NEXT</Badge>
        </div>
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {aberto && (
        <div className="space-y-4 mt-3">
          {/* Modelo + link */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Modelo da mensagem · use {'{nome}'} e {'{link}'}</span>
              {!editando
                ? <Button variant="ghost" size="sm" onClick={() => setEditando(true)}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
                : <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" /> Salvar</>}</Button>}
            </div>
            {editando ? (
              <>
                <Textarea rows={4} value={modelo} onChange={(e) => setModelo(e.target.value)} className="text-sm" />
                <div><Label className="text-xs">Link de inscrição do NEXT</Label><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://cbrio.org/next" /></div>
              </>
            ) : (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{mensagemPara('Maria')}</p>
            )}
          </div>

          {!templateOk && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ Envio em massa pela API exige um template aprovado na Meta (env <code>WHATSAPP_TEMPLATE_NEXT_CONVITE</code>). Enquanto isso, use o botão de WhatsApp por pessoa (manual).
            </div>
          )}

          {/* Ações de seleção */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={toggleTodos}>
              {sel.size >= comTelefone.length && comTelefone.length > 0 ? <CheckSquare className="h-4 w-4 mr-1" /> : <Square className="h-4 w-4 mr-1" />}
              {sel.size >= comTelefone.length && comTelefone.length > 0 ? 'Limpar seleção' : `Selecionar todos com telefone (${comTelefone.length})`}
            </Button>
            <Button size="sm" onClick={enviar} disabled={enviando || sel.size === 0}>
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Enviar convite ({sel.size})
            </Button>
          </div>

          {/* Lista */}
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
                    <div className="text-xs text-muted-foreground">
                      {p.area && <Badge variant="outline" className="text-[10px] mr-1">{AREA_LABEL[p.area] || p.area}</Badge>}
                      {p.tem_telefone ? p.telefone : <span className="text-amber-600">sem telefone</span>}
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
        </div>
      )}
    </Card>
  );
}
