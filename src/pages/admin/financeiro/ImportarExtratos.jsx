import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { financeiro, financeiroV2 } from '../../../api';
import { Button } from '../../../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

export default function ImportarExtratos() {
  const [contas, setContas] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [contaOFX, setContaOFX] = useState('');
  const [contaPIX, setContaPIX] = useState('');
  // Estados independentes · permitem importar OFX e PIX em paralelo
  const [procOfx, setProcOfx] = useState(false);
  const [procPix, setProcPix] = useState(false);
  const [procBal, setProcBal] = useState(false);
  const [resultadoOfx, setResultadoOfx] = useState(null);
  const [resultadoPix, setResultadoPix] = useState(null);
  const [resultadoBal, setResultadoBal] = useState(null);

  const loadUploads = useCallback(async () => {
    const u = await financeiroV2.uploads({ limit: 20 });
    setUploads(u);
  }, []);

  useEffect(() => {
    financeiro.contas.list().then(setContas);
    loadUploads();
  }, [loadUploads]);

  const importarOFX = async (file) => {
    if (!contaOFX) { alert('Selecione a conta antes de subir o OFX'); return; }
    setProcOfx(true);
    setResultadoOfx(null);
    try {
      const r = await financeiroV2.importar.ofx(file, contaOFX);
      setResultadoOfx({ tipo: 'ofx', ...r });
      loadUploads();
    } catch (e) {
      setResultadoOfx({ erro: e.message });
    } finally {
      setProcOfx(false);
    }
  };

  const importarPIX = async (file) => {
    setProcPix(true);
    setResultadoPix(null);
    try {
      const r = await financeiroV2.importar.pixExtrato(file, contaPIX || undefined);
      setResultadoPix({ tipo: 'pix', ...r });
      loadUploads();
    } catch (e) {
      setResultadoPix({ erro: e.message });
    } finally {
      setProcPix(false);
    }
  };

  const importarBalanco = async (file) => {
    setProcBal(true);
    setResultadoBal(null);
    try {
      const r = await financeiroV2.importar.balanco(file);
      setResultadoBal({ tipo: 'balanco', ...r });
      loadUploads();
    } catch (e) {
      setResultadoBal({ erro: e.message });
    } finally {
      setProcBal(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* OFX */}
        <UploadCard
          title="Extrato bancário (OFX)"
          subtitle="Importa todas as transacoes do Santander (PIX, TED, boletos, cartao, tarifas...). Sem hora · matching com PIX-Excel preenche hora real."
          accept=".ofx,.OFX"
          icon="📑"
          color={C.blue}
          colorBg={C.blueBg}
          processando={procOfx}
          onUpload={importarOFX}
          children={
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: C.text2, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Conta
              </label>
              <select value={contaOFX} onChange={e => setContaOFX(e.target.value)}
                style={selectSt}>
                <option value="">Selecione a conta bancaria...</option>
                {contas.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` · ${c.banco}` : ''}</option>
                ))}
              </select>
            </div>
          }
        />

        {/* PIX */}
        <UploadCard
          title="Extrato PIX (Excel/CSV)"
          subtitle="Importa o relatório detalhado de PIX recebidos com horario exato (extraido do End-to-End ID). Cruzamento automático com lancamentos OFX."
          accept=".xlsx,.xls,.csv"
          icon="🔄"
          color={C.primary}
          colorBg={C.primaryBg}
          processando={procPix}
          onUpload={importarPIX}
          children={
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: C.text2, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Conta (opcional)
              </label>
              <select value={contaPIX} onChange={e => setContaPIX(e.target.value)} style={selectSt}>
                <option value="">Auto · sem vinculo direto</option>
                {contas.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` · ${c.banco}` : ''}</option>
                ))}
              </select>
            </div>
          }
        />

        {/* BALANÇO · planilha do sistema legado */}
        <UploadCard
          title="Balanço (sistema financeiro)"
          subtitle="Sobe a planilha de Balanço exportada do sistema financeiro (todos os lançamentos · receitas e despesas). Idempotente · pode subir o mesmo arquivo de novo que só entra o que é novo. Plano de contas, centro de custo e conta saem da própria planilha."
          accept=".xlsx,.xls"
          icon="📊"
          color={C.amber}
          colorBg={C.amberBg}
          processando={procBal}
          onUpload={importarBalanco}
        />
      </div>

      {resultadoOfx && <ResultadoCard r={resultadoOfx} />}
      {resultadoPix && <ResultadoCard r={resultadoPix} />}
      {resultadoBal && <ResultadoBalancoCard r={resultadoBal} />}

      {/* Histórico de uploads */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: C.text }}>Histórico de importacoes</h3>
        <div style={{ background: C.card, border: '1px solid var(--hairline)', borderRadius: 16, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--cbrio-table-header)' }}>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Tipo</th>
                <th style={th}>Arquivo</th>
                <th style={th}>Registros</th>
                <th style={th}>Novos</th>
                <th style={th}>Dup.</th>
                <th style={th}>Match PIX</th>
                <th style={th}>Class. auto</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map(u => (
                <tr key={u.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontSize: 12, color: C.text2 }}>
                    {new Date(u.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td style={td}><TipoBadgeUpload tipo={u.tipo} /></td>
                  <td style={{ ...td, fontSize: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.arquivo_nome}
                  </td>
                  <td style={td}>{u.total_registros}</td>
                  <td style={{ ...td, color: C.green, fontWeight: 600 }}>{u.total_novos}</td>
                  <td style={{ ...td, color: C.text3 }}>{u.total_duplicados}</td>
                  <td style={{ ...td, color: C.primary, fontWeight: 600 }}>{u.total_matched_pix || 0}</td>
                  <td style={td}>{u.total_classificados_auto || 0}</td>
                  <td style={td}><StatusBadge status={u.status} /></td>
                </tr>
              ))}
              {uploads.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: C.text3 }}>Nenhuma importação ainda</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UploadCard({ title, subtitle, accept, icon, color, colorBg, processando, onUpload, children }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  // ID estavel pra label htmlFor · evita conflito se houver multiplos UploadCard
  const inputId = useMemo(() => `upload-${Math.random().toString(36).slice(2, 9)}`, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  const onSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    // Reseta value pra permitir reupload do mesmo arquivo
    e.target.value = '';
  };

  return (
    <div style={{
      background: C.card, border: '1px solid var(--hairline)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 28 }}>{icon}</div>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h3>
        </div>
      </div>
      <p style={{ fontSize: 12, color: C.text2, marginBottom: 16, lineHeight: 1.4 }}>{subtitle}</p>
      {children}
      {/* Input file FORA do label · posicionado off-screen (display:none quebra
          em alguns browsers · principalmente Safari/iOS) */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        onChange={onSelect}
        disabled={processando}
        style={{
          position: 'absolute', left: '-9999px', width: 1, height: 1,
          opacity: 0, pointerEvents: 'none',
        }}
      />
      <label
        htmlFor={inputId}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={(e) => {
          // Fallback explicito · alguns browsers não disparam click via htmlFor
          // quando o input esta off-screen. Click direto garante.
          if (!processando && inputRef.current) {
            e.preventDefault();
            inputRef.current.click();
          }
        }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 100, padding: 16, marginTop: 8,
          border: `2px dashed ${drag ? color : C.border}`,
          background: drag ? colorBg : 'transparent',
          borderRadius: 8, cursor: processando ? 'wait' : 'pointer', transition: 'all 0.2s',
        }}>
        <div style={{ fontSize: 13, color: color, fontWeight: 600 }}>
          {processando ? 'Processando...' : 'Arraste o arquivo ou clique pra selecionar'}
        </div>
        <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>
          Aceita: {accept}
        </div>
      </label>
    </div>
  );
}

function ResultadoCard({ r }) {
  if (r.erro) {
    return (
      <div style={{ background: C.redBg, border: `1px solid ${C.red}`, padding: 16, borderRadius: 8, marginBottom: 16 }}>
        <strong style={{ color: C.red }}>Erro:</strong> <span style={{ color: C.text }}>{r.erro}</span>
      </div>
    );
  }
  return (
    <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, padding: 16, borderRadius: 8, marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>
        <strong>✓ Importação concluída</strong>
        {r.periodo && <span style={{ marginLeft: 8, color: C.text2 }}>{r.periodo.inicio} a {r.periodo.fim}</span>}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: C.text2 }}>
        <div><strong style={{ color: C.text }}>{r.total}</strong> registros</div>
        <div><strong style={{ color: C.green }}>{r.inseridos}</strong> novos</div>
        <div><strong style={{ color: C.text3 }}>{r.duplicados}</strong> duplicados</div>
        {r.match_pix && (
          <div><strong style={{ color: C.primary }}>{r.match_pix.matched}</strong> casados com PIX</div>
        )}
        {r.classificacao && (
          <div><strong style={{ color: C.blue }}>{r.classificacao.sugeridos}</strong> classificados automaticamente</div>
        )}
      </div>
    </div>
  );
}

function ResultadoBalancoCard({ r }) {
  if (r.erro) {
    return (
      <div style={{ background: C.redBg, border: `1px solid ${C.red}`, padding: 16, borderRadius: 8, marginBottom: 16 }}>
        <strong style={{ color: C.red }}>Erro:</strong> <span style={{ color: C.text }}>{r.erro}</span>
      </div>
    );
  }
  const temErro = Array.isArray(r.erros) && r.erros.length > 0;
  return (
    <div style={{ background: temErro ? C.amberBg : C.greenBg, border: `1px solid ${temErro ? C.amber : C.green}`, padding: 16, borderRadius: 8, marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>
        <strong>{temErro ? '⚠ Importação parcial do balanço' : '✓ Balanço importado'}</strong>
        {r.periodo && <span style={{ marginLeft: 8, color: C.text2 }}>{r.periodo.inicio} a {r.periodo.fim}</span>}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: C.text2 }}>
        <div><strong style={{ color: C.text }}>{r.lidas}</strong> linhas lidas</div>
        <div><strong style={{ color: C.green }}>{r.inseridas}</strong> novos lançamentos</div>
        <div><strong style={{ color: C.text3 }}>{r.ja_existentes}</strong> já existentes</div>
        {r.invalidas > 0 && <div><strong style={{ color: C.amber }}>{r.invalidas}</strong> ignoradas (sem data/valor)</div>}
      </div>
      {temErro && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.red }}>
          {r.erros.slice(0, 3).join(' · ')}
        </div>
      )}
    </div>
  );
}

function TipoBadgeUpload({ tipo }) {
  const map = {
    ofx:      { c: C.blue, bg: C.blueBg, label: 'OFX' },
    pix_xlsx: { c: C.primary, bg: C.primaryBg, label: 'PIX (Excel)' },
    pix_csv:  { c: C.primary, bg: C.primaryBg, label: 'PIX (CSV)' },
    cartao_csv: { c: C.amber, bg: C.amberBg, label: 'Cartao' },
    balanco:  { c: C.amber, bg: C.amberBg, label: 'Balanço' },
  };
  const s = map[tipo] || { c: C.text3, bg: '#73737318', label: tipo };
  return (
    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.c, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    processando: { c: C.amber, bg: C.amberBg, label: 'Processando' },
    concluido:   { c: C.green, bg: C.greenBg, label: 'Concluido' },
    erro:        { c: C.red, bg: C.redBg, label: 'Erro' },
  };
  const s = map[status] || { c: C.text3, bg: '#73737318', label: status };
  return (
    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.c, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5 };
const td = { padding: '10px 12px', color: C.text };
const selectSt = { width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 13 };
