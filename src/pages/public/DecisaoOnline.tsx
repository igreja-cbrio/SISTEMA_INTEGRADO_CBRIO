import { useEffect, useState } from 'react';
import { decisaoOnline } from '../../api';
import { BirthDatePicker } from '@/components/ui/birth-date-picker';
import { mascaraCep } from '@/lib/cepAutopreenche';

// Página PUBLICA standalone (fora do AppShell/ProtectedRoute · sem login).
// Aberta pelo QR que o pastor manda escanear no APELO, e também pelo link
// fixado na descrição/chat da live. Quem decide preenche nome, nascimento,
// telefone e (opcional) CEP · alimenta `cultos_decisoes_pessoas` como pessoa
// NOMINAL e soma no agregado `cultos.decisoes_online`.
//
// ⚠️⚠️ POR QUE ESTA PÁGINA PRECISA EXISTIR DE VERDADE — medido em 27/08/2026,
// nos últimos 120 dias: das decisões PRESENCIAIS declaradas, 150 de 193 (78%)
// viraram pessoa com nome e contato. Das ONLINE, **1 de 93**. Ou seja, 92
// pessoas decidiram seguir a Jesus assistindo de casa e ninguém sabe quem são
// — e o módulo de Cuidados inteiro existe para fazer o 1º contato em 3 dias.
// O formulário já existia e nunca registrou ninguém (`fonte='form_publico'` =
// 0): o que faltava era o CAMINHO até ele, que é o QR do apelo.

const PRIMARY = '#00B39D';

type Culto = { id: string; data: string; nome: string };

export default function DecisaoOnline() {
  const [carregando, setCarregando] = useState(true);
  const [aoVivo, setAoVivo] = useState(false);
  const [culto, setCulto] = useState<Culto | null>(null);
  const [nome, setNome] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    document.title = 'Eu aceito Jesus · CBRio';
    decisaoOnline
      .ativo()
      .then((r: { ativo: boolean; aoVivo?: boolean; culto: Culto | null }) => {
        setAoVivo(!!r.aoVivo);
        setCulto(r.culto || null);
      })
      // Falha ao consultar o culto NÃO trava o formulário: quem decidiu registra
      // mesmo assim e o servidor resolve a qual culto anexar.
      .catch(() => setCulto(null))
      .finally(() => setCarregando(false));
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (nome.trim().length < 2) {
      setErro('Por favor, informe seu nome.');
      return;
    }
    // ⚠️ `BirthDatePicker` só emite ISO completo ou '' — data pela metade nunca
    // vira valor. Quem decide "obrigatório" é este formulário, e o servidor
    // revalida com a régua do Contrato de porta.
    if (!nascimento) {
      setErro('Informe sua data de nascimento (dia, mês e ano).');
      return;
    }
    // Telefone é obrigatório: é por ele que a equipe fala com você. Sem contato
    // a decisão vira número no painel e ninguém consegue te alcançar.
    const tel = telefone.replace(/\D/g, '');
    if (tel.length < 10 || tel.length > 11) {
      setErro('Informe seu WhatsApp com DDD (10 ou 11 dígitos).');
      return;
    }
    // ⚠️ CEP é OPCIONAL — e por isso só é recusado quando foi preenchido PELA
    // METADE. Campo em branco passa direto: travar aqui custaria uma decisão
    // por causa de um dado de análise.
    const cepDigitos = cep.replace(/\D/g, '');
    if (cepDigitos.length > 0 && cepDigitos.length !== 8) {
      setErro('O CEP precisa ter 8 dígitos — ou deixe em branco.');
      return;
    }
    if (!aceite) {
      setErro('Para registrar, marque o aceite do tratamento dos seus dados.');
      return;
    }
    setEnviando(true);
    try {
      await decisaoOnline.registrar({
        nome: nome.trim(),
        data_nascimento: nascimento,
        telefone: tel,
        cep: cepDigitos || null,
        aceite_lgpd: true,
      });
      setPronto(true);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível registrar agora. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const wrap: React.CSSProperties = {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: `linear-gradient(160deg, ${PRIMARY} 0%, #007E70 100%)`,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    textAlign: 'center',
  };
  const card: React.CSSProperties = {
    background: '#fff',
    color: '#1a1a1a',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 18px 50px rgba(0,0,0,.25)',
  };
  const input: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    fontSize: 16,
    borderRadius: 12,
    border: '1.5px solid #d9d9d9',
    marginTop: 12,
    boxSizing: 'border-box',
  };
  const btn: React.CSSProperties = {
    width: '100%',
    padding: '15px 16px',
    fontSize: 17,
    fontWeight: 700,
    color: '#fff',
    background: PRIMARY,
    border: 'none',
    borderRadius: 12,
    marginTop: 18,
    cursor: 'pointer',
    opacity: enviando ? 0.7 : 1,
  };

  if (carregando) {
    return (
      <div style={wrap}>
        <p style={{ fontSize: 18, opacity: 0.9 }}>Carregando…</p>
      </div>
    );
  }

  if (pronto) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: 52 }}>🙌</div>
          <h1 style={{ fontSize: 26, margin: '12px 0 8px', color: PRIMARY }}>
            Que decisão linda!
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: '#444' }}>
            O céu está em festa por você — e você não vai seguir sozinho. Uma
            pessoa da nossa equipe vai falar com você nos próximos dias para
            caminhar junto nos primeiros passos com Jesus.
          </p>
          <p style={{ fontSize: 14, color: '#888', marginTop: 16 }}>
            "Se você confessar com a sua boca que Jesus é Senhor… será salvo." — Rm 10.9
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0 }}>Eu aceito Jesus</h1>
        <p style={{ fontSize: 16, opacity: 0.92, marginTop: 8 }}>
          Decidiu seguir a Jesus assistindo online? Deixe seu contato — não é
          cadastro, é para <strong>caminharmos junto com você</strong> a partir
          de agora. Uma pessoa da nossa equipe vai falar com você nos próximos
          dias.
        </p>
      </div>

      <div style={card}>
        {/* ⚠️ O formulário NUNCA é desabilitado. Antes, fora da janela do culto
            os campos ficavam travados e a página virava um beco sem saída pra
            quem tinha acabado de decidir — o backend ainda devolvia 409 e
            DESCARTAVA a decisão. Hoje o servidor anexa ao culto ao vivo, ao
            culto do dia ou ao último culto recente (replay). */}
        {culto && (
          <p style={{ fontSize: 13, color: '#888', margin: '0 0 4px' }}>
            {aoVivo ? `Ao vivo agora · ${culto.nome}` : `Culto · ${culto.nome}`}
          </p>
        )}

        <form onSubmit={enviar}>
          <input
            style={input}
            type="text"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
          />
          {/* ⚠️ `BirthDatePicker` e NUNCA `<input type="date">` — é a lei da casa
              (as 10 portas públicas usam este componente). O nativo tem seletor
              de ano ruim, e aqui quase todo mundo chega pelo celular, vindo do
              QR do apelo. Ele deixa DIGITAR dd/mm/aaaa ou usar o calendário. */}
          <div style={{ marginTop: 12, textAlign: 'left' }}>
            <span style={{ fontSize: 13, color: '#666' }}>Data de nascimento</span>
            <div style={{ marginTop: 6 }}>
              <BirthDatePicker value={nascimento} onChange={setNascimento} />
            </div>
          </div>
          <input
            style={input}
            type="tel"
            placeholder="Seu WhatsApp (com DDD)"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            autoComplete="tel"
            inputMode="numeric"
          />
          {/* ⚠️ OPCIONAL, e o rótulo DIZ isso e diz PRA QUÊ. Pedir um dado sem
              explicar o motivo numa página de decisão de fé é o jeito mais
              rápido de a pessoa fechar a aba. */}
          <input
            style={input}
            type="text"
            placeholder="CEP (opcional)"
            value={cep}
            onChange={(e) => setCep(mascaraCep(e.target.value))}
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={9}
          />
          <p style={{ fontSize: 12, color: '#888', marginTop: 6, textAlign: 'left' }}>
            O CEP é opcional e serve só para sabermos de que regiões as pessoas
            assistem — ajuda a igreja a chegar mais perto de você.
          </p>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginTop: 16,
              fontSize: 13,
              lineHeight: 1.45,
              color: '#555',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
              style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: PRIMARY }}
            />
            <span>
              Autorizo a CBRio a guardar meu nome e contato para que a equipe
              pastoral fale comigo sobre esta decisão, conforme a LGPD. Posso
              pedir acesso, correção ou exclusão a qualquer momento.
            </span>
          </label>
          {erro && (
            <p style={{ color: '#C0392B', fontSize: 14, marginTop: 12 }}>{erro}</p>
          )}
          <button style={btn} type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Aceito Jesus em minha vida'}
          </button>
        </form>
      </div>

      <p style={{ fontSize: 13, opacity: 0.8, marginTop: 20 }}>
        Comunidade Batista do Rio · cbrio.tv
      </p>
    </div>
  );
}
