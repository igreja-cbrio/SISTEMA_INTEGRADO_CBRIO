// Página PUBLICA standalone (fora do AppShell/ProtectedRoute · sem login).
// Aberta pelo QR que o pastor manda escanear no APELO, e também pelo link
// fixado na descrição/chat da live. Quem decide preenche nome, nascimento,
// telefone e (opcional) CEP · alimenta `cultos_decisoes_pessoas` como pessoa
// NOMINAL e soma no agregado `cultos.decisoes_online` do culto certo.
//
// ⚠️⚠️ POR QUE ESTA PÁGINA PRECISA FUNCIONAR DE VERDADE — medido em 27/08/2026,
// nos últimos 120 dias: das decisões PRESENCIAIS declaradas, 150 de 193 (78%)
// viraram pessoa com nome e contato. Das ONLINE, **1 de 93**. Ou seja, 92
// pessoas decidiram seguir a Jesus assistindo de casa e ninguém sabe quem são
// — com o módulo de Cuidados inteiro existindo para fazer o 1º contato em até
// 3 dias. O formulário já existia e nunca registrou ninguém: o que faltava era
// o CAMINHO até ele, que é o QR do apelo.
//
// ⚠️ LAYOUT: segue o padrão das outras portas públicas (AnimatedBackground +
// publicTheme + card de vidro + campo com label flutuante), a pedido do
// Matheus em 27/08/2026. A versão anterior tinha estilo próprio (fundo teal,
// inputs brancos), e o campo de nascimento — que é o componente padrão da casa
// — aparecia visivelmente fora do conjunto. Uma porta de decisão de fé com
// cara de página estranha não ajuda ninguém a confiar.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { decisaoOnline } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { BirthDatePicker } from '../../components/ui/birth-date-picker';
import { mascaraCep } from '@/lib/cepAutopreenche';

type Culto = { id: string; data: string; nome: string };

/** Campo com label flutuante · o mesmo padrão das outras 10 portas públicas. */
function Field({
  id, label, value, onChange, type = 'text', autoComplete, inputMode, maxLength, ajuda,
}: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; autoComplete?: string;
  inputMode?: 'numeric' | 'tel' | 'text'; maxLength?: number; ajuda?: string;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || String(value || '').length > 0;
  return (
    <div style={{ position: 'relative', marginBottom: ajuda ? 8 : 20 }}>
      <input
        id={id} name={id} type={type} value={value}
        autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display: 'block', width: '100%', padding: '12px 0',
          // ⚠️ 16px e nunca menos: abaixo disso o iOS dá zoom automático ao
          // focar e desloca a tela inteira no meio da digitação.
          fontSize: 16, color: 'var(--cbrio-text)',
          background: 'transparent', border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', transition: 'border-color 0.3s',
          boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />
      <label htmlFor={id} style={{
        position: 'absolute', left: 0,
        top: active ? -14 : 12,
        fontSize: active ? 11 : 16,
        color: focused ? '#00B39D' : 'var(--cbrio-text3)',
        transition: 'all 0.2s', pointerEvents: 'none',
      }}>
        {label}
      </label>
    </div>
  );
}

export default function DecisaoOnline() {
  // ⚠️ Token do QR gravado no vídeo. Quando existe, o culto vem DELE e o
  // servidor não precisa deduzir nada pelo relógio — é o que faz a decisão de
  // quem assiste um replay de anos atrás cair no culto certo.
  const { token } = useParams<{ token?: string }>();
  const { C } = usePublicTheme();
  const [carregando, setCarregando] = useState(true);
  const [aoVivo, setAoVivo] = useState(false);
  const [replay, setReplay] = useState(false);
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
      .ativo(token)
      .then((r: { ativo: boolean; aoVivo?: boolean; replay?: boolean; culto: Culto | null }) => {
        setAoVivo(!!r.aoVivo);
        setReplay(!!r.replay);
        setCulto(r.culto || null);
      })
      // Falha ao consultar o culto NÃO trava o formulário: quem decidiu registra
      // mesmo assim e o servidor resolve a qual culto anexar.
      .catch(() => setCulto(null))
      .finally(() => setCarregando(false));
  }, [token]);

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
        t: token || null,
      });
      setPronto(true);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Não foi possível registrar agora. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  // ⚠️ `padding: 'clamp(...)'` e `maxWidth` são o que fazem a página servir no
  // celular sem media query: quase todo mundo aqui chega escaneando o QR na
  // sala de casa, não no desktop.
  const pagina: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
    padding: '40px 16px', background: C.pageBg,
  };
  const cartao: React.CSSProperties = {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 480,
    background: C.card, backdropFilter: 'blur(24px)',
    border: `1px solid ${C.cardBorder}`, borderRadius: 20,
    padding: 'clamp(28px, 6vw, 40px) clamp(18px, 5vw, 36px)',
  };
  const botao: React.CSSProperties = {
    width: '100%', padding: '15px 16px', fontSize: 17, fontWeight: 700,
    color: '#fff', background: '#00B39D', border: 'none', borderRadius: 12,
    marginTop: 20, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.7 : 1,
  };

  if (carregando) {
    return (
      <div style={pagina}>
        <AnimatedBackground />
        <p style={{ position: 'relative', zIndex: 1, fontSize: 16, color: C.text3 }}>Carregando…</p>
      </div>
    );
  }

  if (pronto) {
    return (
      <div style={pagina}>
        <AnimatedBackground />
        <PublicThemeToggle />
        <div style={{ ...cartao, textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>🙌</div>
          <h1 style={{
            fontSize: 26, margin: '12px 0 8px', fontWeight: 800,
            background: 'linear-gradient(90deg, #00B39D, #00d9bd)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
            Que decisão linda!
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--cbrio-text)' }}>
            O céu está em festa por você — e você não vai seguir sozinho. Uma
            pessoa da nossa equipe vai falar com você nos próximos dias para
            caminhar junto nos primeiros passos com Jesus.
          </p>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 16 }}>
            "Se você confessar com a sua boca que Jesus é Senhor… será salvo." — Rm 10.9
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pagina}>
      <AnimatedBackground />
      <PublicThemeToggle />

      {/* ⚠️ O `BirthDatePicker` é o componente PADRÃO da casa (lei: nunca
          `<input type="date">`), mas o visual dele é o shadcn — caixa com borda
          e fundo. Aqui os campos são linha embaixo, então o CSS local abaixo
          alinha os dois. Escopado nesta página: o componente é usado em ~64
          telas e mexer nele mudaria as outras 63. */}
      <style>{`
        .decisao-nascimento input {
          border: none;
          border-bottom: 2px solid var(--cbrio-border);
          border-radius: 0;
          background: transparent;
          height: 44px;
          padding-left: 0;
          font-size: 16px;
        }
        .decisao-nascimento input:focus-visible {
          box-shadow: none;
          border-bottom-color: #00B39D;
        }
        .decisao-nascimento button { right: -6px; }
      `}</style>

      <div style={cartao}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio"
            style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }} />
          <h1 style={{
            fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5,
            background: 'linear-gradient(90deg, #00B39D, #00d9bd)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
            Eu aceito Jesus
          </h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 8, lineHeight: 1.6 }}>
            Decidiu seguir a Jesus agora? Deixe seu contato — não é cadastro, é
            para <strong style={{ color: '#00B39D' }}>caminharmos junto com você</strong>{' '}
            a partir de hoje. Uma pessoa da nossa equipe vai falar com você nos
            próximos dias.
          </p>
          {/* ⚠️⚠️ O CHIP SÓ APARECE AO VIVO — e isso é conserto de um defeito
              REAL, visto pelo Matheus em 27/08/2026: numa QUINTA às 12h a
              página exibia "Culto · Quarta Com Deus".
              
              Não era dado errado: o culto de quarta (20:00) já tinha saído da
              janela ao vivo (até 00:00) e do grace pós-live (até 08:00), então
              o servidor caiu no REPLAY — o último culto online dos 7 dias, que
              é a rede que impede a decisão de ser descartada. O `culto_id`
              estava CERTO; quem mentia era o rótulo, que anunciava um culto de
              ontem como se fosse o de agora.
              
              Fora do ar, a que culto a decisão será anexada é escrituração
              NOSSA — não é informação que ajuda quem acabou de decidir, e
              exibi-la produz exatamente a dúvida que ele teve ("hoje é
              quinta"). O formulário funciona igual sem o chip. */}
          {culto && aoVivo && (
            <div style={{
              display: 'inline-block', marginTop: 14,
              padding: '8px 16px', borderRadius: 12,
              background: 'rgba(0,179,157,0.12)',
              border: '1px solid rgba(0,179,157,0.3)',
              color: '#00B39D', fontSize: 13, fontWeight: 600,
            }}>
              Ao vivo agora · {culto.nome}
            </div>
          )}
          {/* ⚠️ Só no REPLAY, e citando a DATA. Aqui o culto veio do QR gravado
              no vídeo, então a informação é verdadeira e ajuda a pessoa a
              confirmar que é a mensagem que ela assistiu. É diferente do chip
              antigo, que anunciava um culto deduzido pelo relógio como se fosse
              o do momento. */}
          {culto && replay && (
            <div style={{
              display: 'inline-block', marginTop: 14,
              padding: '8px 16px', borderRadius: 12,
              background: 'rgba(0,179,157,0.10)',
              border: `1px solid ${C.cardBorder}`,
              color: C.text3, fontSize: 12.5, fontWeight: 500,
            }}>
              Você assistiu · {culto.nome} de {culto.data.split('-').reverse().join('/')}
            </div>
          )}
        </div>

        {/* ⚠️ O formulário NUNCA é desabilitado. Antes, fora da janela do culto
            os campos ficavam travados e a página virava um beco sem saída pra
            quem tinha acabado de decidir — o backend ainda devolvia 409 e
            DESCARTAVA a decisão. Hoje o servidor anexa ao culto ao vivo, ao
            culto do dia ou ao último culto recente (replay). */}
        <form onSubmit={enviar}>
          <Field id="nome" label="Seu nome" value={nome}
            onChange={(e) => setNome(e.target.value)} autoComplete="name" />

          <div className="decisao-nascimento" style={{ marginBottom: 20 }}>
            <span style={{ fontSize: 11, color: 'var(--cbrio-text3)' }}>Data de nascimento</span>
            <BirthDatePicker value={nascimento} onChange={setNascimento} />
          </div>

          <Field id="telefone" label="Seu WhatsApp (com DDD)" value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            type="tel" autoComplete="tel" inputMode="numeric" />

          <Field id="cep" label="CEP (opcional)" value={cep}
            onChange={(e) => setCep(mascaraCep(e.target.value))}
            autoComplete="postal-code" inputMode="numeric" maxLength={9}
            ajuda="sim" />
          {/* ⚠️ OPCIONAL, e o rótulo DIZ isso e diz PRA QUÊ. Pedir um dado sem
              explicar o motivo numa página de decisão de fé é o jeito mais
              rápido de a pessoa fechar a aba. */}
          <p style={{ fontSize: 11.5, color: C.text3, margin: '0 0 20px', lineHeight: 1.5 }}>
            Serve só para sabermos de que regiões as pessoas assistem — ajuda a
            igreja a chegar mais perto de você.
          </p>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            fontSize: 12.5, lineHeight: 1.5, color: C.text3,
            textAlign: 'left', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
              style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: '#00B39D' }}
            />
            <span>
              Autorizo a CBRio a guardar meu nome e contato para que a equipe
              pastoral fale comigo sobre esta decisão, conforme a LGPD. Posso
              pedir acesso, correção ou exclusão a qualquer momento.
            </span>
          </label>

          {erro && (
            <p style={{ color: '#ef4444', fontSize: 14, marginTop: 12 }}>{erro}</p>
          )}
          <button style={botao} type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Aceito Jesus em minha vida'}
          </button>
        </form>

        <p style={{ fontSize: 12, color: C.text3, marginTop: 22, textAlign: 'center' }}>
          Comunidade Batista do Rio · cbrio.com.br
        </p>
      </div>
    </div>
  );
}
