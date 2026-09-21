// Página PÚBLICA (sem login) — Ficha Cadastral e de Qualificação da CONTRATADA
// (Anexo II). O prestador PJ abre pelo link pessoal e preenche os dados da
// EMPRESA dele. A chave PIX é o ponto do exercício: medido em 21/09/2026, a
// igreja paga 32 PJ por PIX e a chave não está em lugar nenhum do sistema.
//
// ⚠️⚠️ Tela SEPARADA de `OnboardingColaborador` de propósito: lá são 5 campos de
// pessoa física e o público inclui CLT; aqui são ~15 campos de empresa e só PJ
// recebe. Juntar as duas viraria um monstro de estado com metade dos campos
// escondidos por condicional.
//
// ⚠️ Campos CORTADOS do PDF com autorização do dono (21/09): nacionalidade,
// estado civil e profissão do representante (não passam na minimização da LGPD,
// art. 6º III — são cópia do preâmbulo de escritura pública e nada num contrato
// de serviços com PJ depende deles).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fichaContratadaPublica } from '../../api';

const PRIMARY = '#00B39D';
const BG = '#0B1F26';

const REGIMES = [
  { v: 'MEI', label: 'MEI' },
  { v: 'SIMPLES', label: 'Simples Nacional' },
  { v: 'PRESUMIDO', label: 'Lucro Presumido' },
  { v: 'REAL', label: 'Lucro Real' },
];

const TIPOS_PIX = [
  { v: 'cnpj', label: 'CNPJ' },
  { v: 'cpf', label: 'CPF' },
  { v: 'email', label: 'E-mail' },
  { v: 'telefone', label: 'Telefone' },
  { v: 'aleatoria', label: 'Chave aleatória' },
];

// ⚠️ O texto do aceite vai INTEIRO para o servidor e é gravado como SNAPSHOT.
// É ele que dá valor à declaração: guardar só "aceitou: true" prova que a pessoa
// clicou, não o que ela leu.
const TEXTO_ACEITE =
  'Declaro, sob as penas da lei, que as informações prestadas nesta ficha são verdadeiras e '
  + 'completas, e comprometo-me a comunicar por escrito à CONTRATANTE qualquer alteração, '
  + 'especialmente de endereço eletrônico e de dados bancários, na forma prevista no Contrato.';

function soDig(v: string) { return (v || '').replace(/\D/g, ''); }
function mascaraCnpj(v: string) {
  const d = soDig(v).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
function mascaraCpf(v: string) {
  const d = soDig(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function mascaraCelular(v: string) {
  const d = soDig(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

type Estado = 'carregando' | 'form' | 'invalido' | 'pronto';

export default function FichaContratada() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>('carregando');
  const [nome, setNome] = useState('');
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  // Empresa
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [regime, setRegime] = useState('');
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState('');
  const [enderecoSede, setEnderecoSede] = useState('');
  const [telefoneSede, setTelefoneSede] = useState('');
  // Representante legal
  const [repNome, setRepNome] = useState('');
  const [repCpf, setRepCpf] = useState('');
  const [repEndereco, setRepEndereco] = useState('');
  // Comunicações
  const [emailContratual, setEmailContratual] = useState('');
  const [whatsappContratual, setWhatsappContratual] = useState('');
  // Pagamento
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [contaTipo, setContaTipo] = useState('');
  const [pixTipo, setPixTipo] = useState('');
  const [pixChave, setPixChave] = useState('');
  const [contaTitular, setContaTitular] = useState('');
  const [titularConfere, setTitularConfere] = useState<boolean | null>(null);
  const [titularMotivo, setTitularMotivo] = useState('');
  // Aceite
  const [aceite, setAceite] = useState(false);
  const [aceiteNome, setAceiteNome] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r: any = await fichaContratadaPublica.get(token || '');
        if (!vivo) return;
        setNome(r?.nome || '');
        // ⚠️ O servidor NUNCA devolve banco, conta, PIX, CPF do representante
        // nem titular — são write-only pela porta pública. O que volta aqui é
        // só o que não é segredo, para a pessoa conferir o que já mandou.
        const f = r?.ficha || {};
        setRazaoSocial(f.razao_social || '');
        setNomeFantasia(f.nome_fantasia || '');
        setCnpj(f.cnpj ? mascaraCnpj(f.cnpj) : '');
        setRegime(f.regime_tributario || '');
        setInscricaoMunicipal(f.inscricao_municipal || '');
        setEnderecoSede(f.endereco_sede || '');
        setTelefoneSede(f.telefone_sede ? mascaraCelular(f.telefone_sede) : '');
        setRepNome(f.rep_nome || '');
        setRepEndereco(f.rep_endereco || '');
        setEmailContratual(f.email_contratual || '');
        setWhatsappContratual(f.whatsapp_contratual ? mascaraCelular(f.whatsapp_contratual) : '');
        setTitularConfere(typeof f.titular_confere === 'boolean' ? f.titular_confere : null);
        setTitularMotivo(f.titular_motivo || '');
        setEstado('form');
      } catch {
        // ⚠️ Link inválido, expirado ou colaborador que não é PJ caem todos aqui,
        // com a MESMA mensagem: distinguir faria a página virar oráculo de quem
        // é prestador da igreja.
        if (vivo) setEstado('invalido');
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroGeral(null);
    setErros({});
    try {
      await fichaContratadaPublica.salvar(token || '', {
        razao_social: razaoSocial,
        nome_fantasia: nomeFantasia,
        cnpj: soDig(cnpj),
        regime_tributario: regime,
        inscricao_municipal: inscricaoMunicipal,
        endereco_sede: enderecoSede,
        telefone_sede: soDig(telefoneSede),
        email_contratual: emailContratual,
        whatsapp_contratual: soDig(whatsappContratual),
        rep_nome: repNome,
        rep_cpf: soDig(repCpf),
        rep_endereco: repEndereco,
        banco, agencia, conta, conta_tipo: contaTipo,
        pix_tipo: pixTipo,
        pix_chave: pixChave,
        conta_titular: contaTitular,
        titular_confere: titularConfere,
        titular_motivo: titularMotivo,
        aceite,
        // ⚠️ O texto vai junto para ser gravado como snapshot. Sem ele o
        // servidor NÃO registra o aceite — é a lei de não fabricar prova legal.
        aceite_texto: TEXTO_ACEITE,
        aceite_nome: aceiteNome,
      });
      setEstado('pronto');
    } catch (err: any) {
      // ⚠️ O servidor devolve TODOS os erros de uma vez; a tela mostra todos.
      // Apontar um por vez faria a pessoa enviar cinco vezes — e é aí que ela
      // desiste. Adesão é o gargalo medido desta feature.
      const corpo = err?.corpo || {};
      if (corpo.erros) setErros(corpo.erros);
      setErroGeral(corpo.error || err?.message || 'Não consegui salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const st = {
    page: { minHeight: '100vh', background: BG, color: '#E6F2F1', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
    card: { maxWidth: 680, margin: '0 auto', background: '#102B33', borderRadius: 16, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,.35)' },
    h1: { fontSize: 22, margin: '0 0 4px', fontWeight: 700 },
    sub: { fontSize: 14, color: '#9FC2BF', margin: '0 0 20px', lineHeight: 1.5 },
    secao: { fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: .6, color: PRIMARY, fontWeight: 700, margin: '24px 0 10px' },
    label: { display: 'block', fontSize: 13, color: '#B9D6D3', marginBottom: 5 },
    input: { width: '100%', padding: '11px 12px', borderRadius: 9, border: '1px solid #24454E', background: '#0B1F26', color: '#E6F2F1', fontSize: 15, boxSizing: 'border-box' as const },
    erro: { color: '#FF8B8B', fontSize: 12, marginTop: 4 },
    campo: { marginBottom: 14 },
    linha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    botao: { width: '100%', padding: '14px 16px', borderRadius: 10, border: 'none', background: PRIMARY, color: '#04222A', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 20 },
    aviso: { background: 'rgba(255,193,7,.12)', border: '1px solid rgba(255,193,7,.35)', color: '#FFD98A', padding: 12, borderRadius: 9, fontSize: 13, lineHeight: 1.5, margin: '16px 0' },
    declaracao: { background: '#0B1F26', border: '1px solid #24454E', borderRadius: 9, padding: 14, fontSize: 13, lineHeight: 1.6, color: '#C9E0DE' },
  };

  function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
    return (
      <div style={st.campo}>
        <label style={st.label} htmlFor={id}>{label}</label>
        {children}
        {erros[id] && <div style={st.erro}>{erros[id]}</div>}
      </div>
    );
  }

  if (estado === 'carregando') {
    return <div style={st.page}><div style={st.card}>Carregando…</div></div>;
  }

  if (estado === 'invalido') {
    return (
      <div style={st.page}>
        <div style={st.card}>
          <h1 style={st.h1}>Link inválido ou expirado</h1>
          <p style={st.sub}>
            Fale com o RH da CBRio para receber um link novo. Os links da ficha têm validade.
          </p>
        </div>
      </div>
    );
  }

  if (estado === 'pronto') {
    return (
      <div style={st.page}>
        <div style={st.card}>
          <h1 style={st.h1}>Ficha enviada ✅</h1>
          <p style={st.sub}>
            Recebemos os dados da sua empresa. Se precisar corrigir alguma coisa, é só abrir
            este mesmo link de novo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={st.page}>
      <form style={st.card} onSubmit={salvar}>
        <h1 style={st.h1}>Ficha Cadastral da Contratada</h1>
        <p style={st.sub}>
          {nome ? <>Olá, <b>{nome}</b>. </> : null}
          Precisamos dos dados da sua empresa para o contrato de prestação de serviços
          e para o pagamento.
        </p>

        <div style={st.secao}>1. A empresa</div>
        <Campo id="razao_social" label="Razão social *">
          <input id="razao_social" style={st.input} value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
        </Campo>
        <Campo id="nome_fantasia" label="Nome fantasia">
          <input id="nome_fantasia" style={st.input} value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
        </Campo>
        <div style={st.linha}>
          <Campo id="cnpj" label="CNPJ *">
            <input id="cnpj" style={st.input} inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(mascaraCnpj(e.target.value))} />
          </Campo>
          <Campo id="regime_tributario" label="Regime tributário *">
            <select id="regime_tributario" style={st.input} value={regime} onChange={(e) => setRegime(e.target.value)}>
              <option value="">Selecione…</option>
              {REGIMES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
            </select>
          </Campo>
        </div>
        <Campo id="inscricao_municipal" label="Inscrição municipal (se houver)">
          <input id="inscricao_municipal" style={st.input} value={inscricaoMunicipal} onChange={(e) => setInscricaoMunicipal(e.target.value)} />
        </Campo>
        <Campo id="endereco_sede" label="Endereço completo da sede *">
          <input id="endereco_sede" style={st.input} placeholder="Rua, número, complemento, bairro, cidade/UF e CEP" value={enderecoSede} onChange={(e) => setEnderecoSede(e.target.value)} />
        </Campo>
        <Campo id="telefone_sede" label="Telefone da empresa">
          <input id="telefone_sede" style={st.input} inputMode="numeric" value={telefoneSede} onChange={(e) => setTelefoneSede(mascaraCelular(e.target.value))} />
        </Campo>

        <div style={st.secao}>2. Representante legal</div>
        <Campo id="rep_nome" label="Nome completo *">
          <input id="rep_nome" style={st.input} value={repNome} onChange={(e) => setRepNome(e.target.value)} />
        </Campo>
        <Campo id="rep_cpf" label="CPF *">
          <input id="rep_cpf" style={st.input} inputMode="numeric" value={repCpf} onChange={(e) => setRepCpf(mascaraCpf(e.target.value))} />
        </Campo>
        <Campo id="rep_endereco" label="Endereço">
          <input id="rep_endereco" style={st.input} value={repEndereco} onChange={(e) => setRepEndereco(e.target.value)} />
        </Campo>

        <div style={st.secao}>3. Contato para o contrato</div>
        <Campo id="email_contratual" label="E-mail principal *">
          <input id="email_contratual" style={st.input} type="email" value={emailContratual} onChange={(e) => setEmailContratual(e.target.value)} />
        </Campo>
        <Campo id="whatsapp_contratual" label="WhatsApp">
          <input id="whatsapp_contratual" style={st.input} inputMode="numeric" value={whatsappContratual} onChange={(e) => setWhatsappContratual(mascaraCelular(e.target.value))} />
        </Campo>

        <div style={st.secao}>4. Dados para pagamento</div>
        <div style={st.linha}>
          <Campo id="pix_tipo" label="Tipo da chave PIX *">
            <select id="pix_tipo" style={st.input} value={pixTipo} onChange={(e) => setPixTipo(e.target.value)}>
              <option value="">Selecione…</option>
              {TIPOS_PIX.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo id="pix_chave" label="Chave PIX *">
            <input id="pix_chave" style={st.input} value={pixChave} onChange={(e) => setPixChave(e.target.value)} />
          </Campo>
        </div>
        <div style={st.linha}>
          <Campo id="banco" label="Banco">
            <input id="banco" style={st.input} value={banco} onChange={(e) => setBanco(e.target.value)} />
          </Campo>
          <Campo id="conta_tipo" label="Tipo de conta">
            <select id="conta_tipo" style={st.input} value={contaTipo} onChange={(e) => setContaTipo(e.target.value)}>
              <option value="">Selecione…</option>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
            </select>
          </Campo>
        </div>
        <div style={st.linha}>
          <Campo id="agencia" label="Agência">
            <input id="agencia" style={st.input} value={agencia} onChange={(e) => setAgencia(e.target.value)} />
          </Campo>
          <Campo id="conta" label="Conta">
            <input id="conta" style={st.input} value={conta} onChange={(e) => setConta(e.target.value)} />
          </Campo>
        </div>
        <Campo id="conta_titular" label="Titular da conta *">
          <input id="conta_titular" style={st.input} value={contaTitular} onChange={(e) => setContaTitular(e.target.value)} />
        </Campo>
        <Campo id="titular_confere" label="O titular da conta é a própria empresa contratada? *">
          <select
            id="titular_confere"
            style={st.input}
            value={titularConfere === null ? '' : (titularConfere ? 'sim' : 'nao')}
            onChange={(e) => setTitularConfere(e.target.value === '' ? null : e.target.value === 'sim')}
          >
            <option value="">Selecione…</option>
            <option value="sim">Sim, é a mesma</option>
            <option value="nao">Não, é outro titular</option>
          </select>
        </Campo>
        {titularConfere === false && (
          <Campo id="titular_motivo" label="Explique brevemente *">
            <input id="titular_motivo" style={st.input} placeholder="Ex.: MEI recebendo na conta pessoa física" value={titularMotivo} onChange={(e) => setTitularMotivo(e.target.value)} />
          </Campo>
        )}

        <div style={st.secao}>5. Declaração</div>
        <div style={st.declaracao}>{TEXTO_ACEITE}</div>
        <div style={{ ...st.campo, marginTop: 12 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 14, color: '#C9E0DE' }}>Li e concordo com a declaração acima.</span>
          </label>
        </div>
        {aceite && (
          <Campo id="aceite_nome" label="Digite seu nome completo para confirmar">
            <input id="aceite_nome" style={st.input} value={aceiteNome} onChange={(e) => setAceiteNome(e.target.value)} />
          </Campo>
        )}

        {erroGeral && <div style={{ ...st.aviso, background: 'rgba(255,107,107,.12)', borderColor: 'rgba(255,107,107,.35)', color: '#FF9B9B' }}>{erroGeral}</div>}

        <button type="submit" style={{ ...st.botao, opacity: salvando ? .6 : 1 }} disabled={salvando}>
          {salvando ? 'Enviando…' : 'Enviar ficha'}
        </button>
        <p style={{ ...st.sub, marginTop: 14, marginBottom: 0, fontSize: 12 }}>
          Seus dados são usados só para o contrato e o pagamento. Pode abrir este link de novo
          para corrigir o que precisar.
        </p>
      </form>
    </div>
  );
}
