import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { MessageCircle, Loader2, Send, Info } from 'lucide-react';
import { toast } from 'sonner';

type Cfg = {
  chave?: string; titulo?: string; descricao?: string;
  ativo: boolean; modo: 'template' | 'texto';
  template_nome?: string | null; idioma?: string; usa_nome?: boolean; mensagem: string;
};

type Api = {
  config: () => Promise<any>;
  saveConfig: (data: any) => Promise<any>;
  testar: (telefone: string, nome?: string) => Promise<any>;
  envios: () => Promise<any[]>;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  enviado: { label: 'enviado', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  erro: { label: 'erro', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  sem_telefone: { label: 'sem telefone', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  desabilitado: { label: 'desligado', cls: 'bg-muted text-muted-foreground' },
};

export default function WhatsappAutoConfig({ api }: { api: Api }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [envios, setEnvios] = useState<any[]>([]);
  const [testTel, setTestTel] = useState('');
  const [testNome, setTestNome] = useState('');
  const [testing, setTesting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([api.config(), api.envios().catch(() => [])]);
      setCfg(c);
      setEnvios(e || []);
    } catch (err: any) {
      toast.error('Erro ao carregar: ' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const upd = (patch: Partial<Cfg>) => setCfg(c => (c ? { ...c, ...patch } : c));

  async function salvar() {
    if (!cfg) return;
    setSaving(true);
    try {
      const saved = await api.saveConfig({
        ativo: cfg.ativo, modo: cfg.modo, template_nome: cfg.template_nome || null,
        idioma: cfg.idioma || 'pt_BR', usa_nome: cfg.usa_nome ?? true, mensagem: cfg.mensagem || '',
      });
      setCfg(saved);
      toast.success('Configuração salva');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function testar() {
    if (!testTel.trim()) { toast.error('Informe um telefone pra testar'); return; }
    setTesting(true);
    try {
      const r = await api.testar(testTel.trim(), testNome.trim() || undefined);
      if (r?.sent) toast.success('Mensagem de teste enviada!');
      else toast.error('Não enviou: ' + (r?.erro || r?.reason || 'verifique a configuração do WhatsApp'));
      api.envios().then(setEnvios).catch(() => {});
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao testar');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <Card><CardContent className="py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>;
  }
  if (!cfg) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[#25D366]" />
          Mensagem automática de WhatsApp
          {cfg.ativo
            ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">ligada</Badge>
            : <Badge variant="outline">desligada</Badge>}
        </CardTitle>
        {cfg.descricao && <p className="text-xs text-muted-foreground">{cfg.descricao}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toggle ligar/desligar */}
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Enviar automaticamente</p>
            <p className="text-xs text-muted-foreground">Quando ligado, a mensagem é enviada assim que a pessoa se inscreve.</p>
          </div>
          <Switch checked={cfg.ativo} onCheckedChange={v => upd({ ativo: v })} />
        </div>

        {/* Mensagem editável */}
        <div>
          <Label className="text-xs">Mensagem (use <code className="px-1 rounded bg-muted">{'{nome}'}</code> para o primeiro nome)</Label>
          <Textarea
            value={cfg.mensagem}
            onChange={e => upd({ mensagem: e.target.value })}
            rows={4}
            className="mt-1"
            placeholder="Olá {nome}! ..."
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Prévia: {cfg.mensagem?.replace(/\{nome\}/gi, 'Maria') || '—'}
          </p>
        </div>

        {/* Modo de envio */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Modo de envio</Label>
            <Select value={cfg.modo} onValueChange={(v: any) => upd({ modo: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="template">Template aprovado (recomendado)</SelectItem>
                <SelectItem value="texto">Texto livre (janela 24h · teste)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {cfg.modo === 'template' && (
            <div>
              <Label className="text-xs">Nome do template (Meta)</Label>
              <Input className="mt-1" value={cfg.template_nome || ''} onChange={e => upd({ template_nome: e.target.value })} placeholder="ex: voluntario_boas_vindas" />
            </div>
          )}
        </div>

        {cfg.modo === 'template' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Idioma do template</Label>
              <Input className="mt-1" value={cfg.idioma || 'pt_BR'} onChange={e => upd({ idioma: e.target.value })} placeholder="pt_BR" />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={cfg.usa_nome ?? true} onCheckedChange={v => upd({ usa_nome: v })} />
              <span className="text-xs text-muted-foreground">Template usa nome em <code className="px-1 rounded bg-muted">{'{{1}}'}</code> e mensagem em <code className="px-1 rounded bg-muted">{'{{2}}'}</code></span>
            </div>
          </div>
        )}

        {cfg.modo === 'template' && (
          <div className="flex gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Pra enviar mensagem proativa o WhatsApp exige um template aprovado na Meta. Aprove um com o corpo
              <em> "Olá {'{{1}}'}! {'{{2}}'}"</em> (nome + mensagem) e coloque o nome dele aqui. A mensagem acima vira o {'{{2}}'}.</span>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
          </Button>
        </div>

        {/* Teste */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-sm font-medium">Enviar um teste</p>
          <div className="flex flex-wrap gap-2">
            <Input className="w-44" placeholder="Telefone (com DDD)" value={testTel} onChange={e => setTestTel(e.target.value)} />
            <Input className="w-40" placeholder="Nome (opcional)" value={testNome} onChange={e => setTestNome(e.target.value)} />
            <Button variant="outline" onClick={testar} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Testar
            </Button>
          </div>
        </div>

        {/* Envios recentes */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Envios recentes</p>
          {envios.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum envio ainda.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {envios.map(e => {
                const s = STATUS_LABEL[e.status] || { label: e.status, cls: 'bg-muted text-muted-foreground' };
                return (
                  <div key={e.id} className="flex items-center justify-between text-xs border-b border-border/60 py-1">
                    <span className="truncate">{e.nome || e.telefone || '—'} <span className="text-muted-foreground">· {e.origem}</span></span>
                    <span className="flex items-center gap-2 shrink-0">
                      {e.erro && <span className="text-red-500 truncate max-w-[140px]" title={e.erro}>{e.erro}</span>}
                      <Badge className={s.cls}>{s.label}</Badge>
                      <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
