// Página PÚBLICA (sem login) — formulário de dados pessoais do novo colaborador.
// A Juliana (RH) gera o link e envia; o colaborador abre e preenche. Cai direto
// no rh_funcionarios. O RH só cuida de salário/cargo.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { onboardingPublico } from '../../api';

const PRIMARY = '#00B39D';
const BG = '#0B1F26';

type Filho = { nome: string; idade: string };

function soDig(v: string) { return (v || '').replace(/\D/g, ''); }
function mascaraCelular(v: string) {
  const d = soDig(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function mascaraCpf(v: string) {
  const d = soDig(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function mascaraData(v: string) {
  const d = soDig(v).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
function isoParaBr(iso?: string | null) {
  if (!iso) return '';
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function brParaIso(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const dt = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? null : `${yyyy}-${mm}-${dd}`;
}

export default function OnboardingColaborador() {
  const { token = '' } = useParams();
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro' | 'enviado'>('carregando');
  const [erroMsg, setErroMsg] = useState('');
  const [info, setInfo] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);

  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [endereco, setEndereco] = useState('');
  const [filhos, setFilhos] = useState<Filho[]>([]);

  useEffect(() => {
    let alive = true;
    onboardingPublico.get(token)
      .then((d: any) => {
        if (!alive) return;
        setInfo(d);
        setTelefone(mascaraCelular(d.telefone || ''));
        setCpf(mascaraCpf(d.cpf || ''));
        setNascimento(isoParaBr(d.data_nascimento));
        setEndereco(d.endereco || '');
        setFilhos((d.filhos || []).map((f: any) => ({ nome: f?.nome || '', idade: f?.idade != null ? String(f.idade) : '' })));
        setEstado('ok');
      })
      .catch((e: any) => { if (alive) { setErroMsg(e?.message || 'Link inválido'); setEstado('erro'); } });
    return () => { alive = false; };
  }, [token]);

  const styles = useMemo(() => makeStyles(), []);

  function addFilho() { setFilhos((f) => [...f, { nome: '', idade: '' }]); }
  function setFilho(i: number, patch: Partial<Filho>) { setFilhos((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x))); }
  function delFilho(i: number) { setFilhos((f) => f.filter((_, j) => j !== i)); }

  async function enviar() {
    if (nascimento && !brParaIso(nascimento)) { setErroMsg('Data de nascimento inválida (DD/MM/AAAA).'); return; }
    setErroMsg('');
    setSalvando(true);
    try {
      await onboardingPublico.salvar(token, {
        telefone: soDig(telefone) || null,
        cpf: soDig(cpf) || null,
        data_nascimento: nascimento ? brParaIso(nascimento) : null,
        endereco: endereco.trim() || null,
        filhos: filhos.filter((f) => f.nome.trim() || f.idade.trim())
          .map((f) => ({ nome: f.nome.trim() || null, idade: f.idade.trim() ? Number(f.idade) : null })),
      });
      setEstado('enviado');
    } catch (e: any) {
      setErroMsg(e?.message || 'Não foi possível enviar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  if (estado === 'carregando') {
    return <div style={styles.wrap}><div style={styles.card}><p style={{ color: '#9fb4b1' }}>Carregando…</p></div></div>;
  }
  if (estado === 'erro') {
    return (
      <div style={styles.wrap}><div style={styles.card}>
        <h1 style={styles.h1}>Link inválido</h1>
        <p style={{ color: '#9fb4b1' }}>{erroMsg || 'Esse link não é válido ou expirou. Peça um novo pro RH.'}</p>
      </div></div>
    );
  }
  if (estado === 'enviado') {
    return (
      <div style={styles.wrap}><div style={styles.card}>
        <div style={{ fontSize: 44, textAlign: 'center' }}>✅</div>
        <h1 style={{ ...styles.h1, textAlign: 'center' }}>Prontinho, {String(info?.nome || '').split(' ')[0]}!</h1>
        <p style={{ color: '#9fb4b1', textAlign: 'center' }}>Seus dados foram enviados pro RH. Obrigado! 💚</p>
        <button style={{ ...styles.btn, marginTop: 18 }} onClick={() => setEstado('ok')}>Revisar/editar de novo</button>
      </div></div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, letterSpacing: 2, color: PRIMARY }}>CBRIO · RH</span>
        </div>
        <h1 style={styles.h1}>Olá, {String(info?.nome || '').split(' ')[0]} 👋</h1>
        <p style={{ color: '#9fb4b1', marginTop: 4 }}>
          Preencha seus dados pessoais pra completar seu cadastro{info?.cargo ? ` como ${info.cargo}` : ''}. Leva 2 minutos.
        </p>

        {erroMsg && <div style={styles.erro}>{erroMsg}</div>}

        <label style={styles.label}>Celular</label>
        <input style={styles.input} value={telefone} onChange={(e) => setTelefone(mascaraCelular(e.target.value))} placeholder="(21) 99999-9999" inputMode="tel" />

        <label style={styles.label}>CPF</label>
        <input style={styles.input} value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />

        <label style={styles.label}>Data de nascimento</label>
        <input style={styles.input} value={nascimento} onChange={(e) => setNascimento(mascaraData(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />

        <label style={styles.label}>Endereço</label>
        <textarea style={{ ...styles.input, minHeight: 66, resize: 'vertical' }} value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade..." />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
          <label style={{ ...styles.label, marginTop: 0 }}>Filhos ({filhos.length})</label>
          <button type="button" style={styles.linkBtn} onClick={addFilho}>+ Adicionar</button>
        </div>
        {filhos.length === 0 && <p style={{ color: '#7f9591', fontSize: 13, margin: '4px 0 0' }}>Se tiver filhos, toque em “+ Adicionar”.</p>}
        {filhos.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ ...styles.label, fontSize: 11, marginTop: 0 }}>Nome</label>
              <input style={styles.input} value={f.nome} onChange={(e) => setFilho(i, { nome: e.target.value })} placeholder="Nome do filho(a)" />
            </div>
            <div style={{ width: 80 }}>
              <label style={{ ...styles.label, fontSize: 11, marginTop: 0 }}>Idade</label>
              <input style={styles.input} value={f.idade} onChange={(e) => setFilho(i, { idade: soDig(e.target.value).slice(0, 3) })} placeholder="—" inputMode="numeric" />
            </div>
            <button type="button" onClick={() => delFilho(i)} style={styles.del} aria-label="Remover">✕</button>
          </div>
        ))}

        <button style={{ ...styles.btn, marginTop: 22, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={enviar}>
          {salvando ? 'Enviando…' : 'Enviar meus dados'}
        </button>
        <p style={{ color: '#6f8480', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
          Seus dados vão direto pro RH da CBRio. Salário e cargo são cuidados pela equipe.
        </p>
      </div>
    </div>
  );
}

function makeStyles(): Record<string, React.CSSProperties> {
  return {
    wrap: { minHeight: '100vh', background: BG, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', fontFamily: '-apple-system, "Segoe UI", system-ui, Roboto, sans-serif' },
    card: { width: '100%', maxWidth: 460, background: '#0f2a30', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 24, boxShadow: '0 20px 60px -30px rgba(0,0,0,0.6)' },
    h1: { color: '#eaf3f1', fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' },
    label: { display: 'block', color: '#bcd0cd', fontSize: 12.5, fontWeight: 700, marginTop: 16, marginBottom: 6 },
    input: { width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#eaf3f1', fontSize: 15, outline: 'none' },
    btn: { width: '100%', padding: '13px', borderRadius: 13, border: 'none', background: PRIMARY, color: '#04231f', fontSize: 15, fontWeight: 800, cursor: 'pointer' },
    linkBtn: { background: 'none', border: 'none', color: PRIMARY, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
    del: { background: 'none', border: 'none', color: '#e0524d', fontSize: 18, cursor: 'pointer', paddingBottom: 10 },
    erro: { marginTop: 14, background: 'rgba(224,82,77,0.12)', border: '1px solid rgba(224,82,77,0.4)', color: '#f0a9a6', borderRadius: 10, padding: '9px 12px', fontSize: 13 },
  };
}
