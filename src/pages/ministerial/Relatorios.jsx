// Módulo Relatórios (ministerial) · builder: escolhe o relatório, o período e as
// colunas, gera a prévia e baixa em Excel (.xlsx) ou PDF.
import { useState, useEffect, useMemo } from 'react';
import { relatorios as api } from '../../api';
import { exportPDF } from '../../lib/export';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { FileSpreadsheet, FileText, Loader2, BarChart3 } from 'lucide-react';

function isoOffset(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const fmtData = (s) => { try { return new Date(s + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return s; } };

const PREVIEW_MAX = 100;

export default function Relatorios() {
  const [tipos, setTipos] = useState([]);
  const [tipo, setTipo] = useState('');
  const [inicio, setInicio] = useState(isoOffset(-7));
  const [fim, setFim] = useState(isoOffset(0));
  const [colsSel, setColsSel] = useState({});
  const [resultado, setResultado] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    api.tipos()
      .then(r => {
        const ts = r?.tipos || [];
        setTipos(ts);
        if (ts.length) escolher(ts[0]);
      })
      .catch(() => toast.error('Erro ao carregar relatórios'));
  }, []);

  const tipoAtual = useMemo(() => tipos.find(t => t.key === tipo), [tipos, tipo]);

  function escolher(t) {
    setTipo(t.key);
    const all = {};
    (t.colunas || []).forEach(c => { all[c.key] = true; });
    setColsSel(all);
    setResultado(null);
  }

  const colunasSelecionadas = () => (tipoAtual?.colunas || []).filter(c => colsSel[c.key]);

  async function gerar() {
    if (!tipo) return;
    if (inicio > fim) { toast.error('O início não pode ser depois do fim.'); return; }
    if (!colunasSelecionadas().length) { toast.error('Selecione ao menos uma coluna.'); return; }
    setGerando(true);
    try {
      const r = await api.dados({ tipo, inicio, fim });
      setResultado(r);
    } catch (e) { toast.error(e.message || 'Erro ao gerar o relatório'); }
    finally { setGerando(false); }
  }

  async function baixarExcel() {
    if (!colunasSelecionadas().length) { toast.error('Selecione ao menos uma coluna.'); return; }
    setBaixando(true);
    try { await api.baixarXlsx({ tipo, inicio, fim, colunas: colunasSelecionadas().map(c => c.key) }); }
    catch (e) { toast.error(e.message || 'Erro ao baixar a planilha'); }
    finally { setBaixando(false); }
  }

  function baixarPdf() {
    if (!resultado) { toast.error('Gere o relatório primeiro.'); return; }
    const cols = colunasSelecionadas();
    const headers = cols.map(c => c.label);
    const rows = (resultado.rows || []).map(r => cols.map(c => r[c.key] ?? '—'));
    exportPDF(tipoAtual?.label || 'Relatório', headers, rows, {
      subtitle: `Período: ${fmtData(inicio)} a ${fmtData(fim)}`,
    });
  }

  const colsView = colunasSelecionadas();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> Relatórios
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha o relatório, o período e as colunas. Gere a prévia e baixe em Excel ou PDF.
        </p>
      </div>

      {/* Configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurar relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Relatório</Label>
              <Select value={tipo} onValueChange={(v) => { const t = tipos.find(x => x.key === v); if (t) escolher(t); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {tipos.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Início</Label>
              <DatePicker value={inicio} onChange={setInicio} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fim</Label>
              <DatePicker value={fim} onChange={setFim} />
            </div>
          </div>

          {tipoAtual && (
            <p className="text-xs text-muted-foreground">
              {tipoAtual.descricao} <span className="opacity-70">· filtra por {tipoAtual.periodo}.</span>
            </p>
          )}

          {/* Colunas */}
          {tipoAtual && (
            <div className="space-y-2">
              <Label className="text-xs">Colunas</Label>
              <div className="flex flex-wrap gap-2">
                {tipoAtual.colunas.map(c => {
                  const on = !!colsSel[c.key];
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setColsSel(s => ({ ...s, [c.key]: !s[c.key] }))}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-primary/10 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={gerar} disabled={gerando || !tipo}>
              {gerando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-1" />}
              Gerar relatório
            </Button>
            <Button variant="outline" onClick={baixarExcel} disabled={baixando || !tipo}>
              {baixando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
              Baixar Excel
            </Button>
            <Button variant="outline" onClick={baixarPdf} disabled={!resultado}>
              <FileText className="h-4 w-4 mr-1" /> Baixar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Prévia */}
      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {resultado.total} registro{resultado.total !== 1 ? 's' : ''}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {fmtData(inicio)} a {fmtData(fim)}
                {resultado.total > PREVIEW_MAX ? ` · prévia dos primeiros ${PREVIEW_MAX}` : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resultado.total === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum registro no período.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="bg-muted/40">
                      {colsView.map(c => (
                        <th key={c.key} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.rows.slice(0, PREVIEW_MAX).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {colsView.map(c => (
                          <td key={c.key} className="px-3 py-2 whitespace-nowrap">{r[c.key] === '' || r[c.key] == null ? '—' : String(r[c.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
