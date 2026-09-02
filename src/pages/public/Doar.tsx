// Página pública de DOAÇÃO (Generosidade) · /doar e /doar/:token
//
// ⚠️ POR QUE ESTA PÁGINA EXISTE, E POR QUE ELA É WEB: a guideline 3.2.2(iv) da
// App Store proíbe coletar fundos para caridade DENTRO do app de quem não é
// nonprofit aprovado pela Apple — e a nossa aprovação depende da validação da
// Benevity, em andamento. A MESMA guideline permite arrecadar **fora** do app,
// "such as via Safari". Então o app abre esta página no NAVEGADOR EXTERNO.
// ⚠️ NÃO embutir em WebView e NÃO copiar este fluxo pra dentro do app: WebView é
// "coletar dentro do app" e é exatamente o que derrubaria o app da loja.
//
// ⚠️ Divisão de responsabilidade que não deve ser mexida (lei nº 5 do núcleo de
// pagamentos): **Pix é nativo** (QR não é dado sensível) e **cartão sai pro
// checkout do Asaas**. Número de cartão não entra no nosso domínio, no nosso
// Express nem nos nossos logs — coletar PAN aqui ampliaria o escopo PCI-DSS da
// igreja. O Asaas não oferece tokenização client-side, então não há meio-caminho.
//
// ⚠️ LEI: nenhuma confirmação — texto, confete, "recebemos" — sem `pago === true`
// LIDO DO SERVIDOR. Voltar do checkout não é pagar.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { generosidadePublica } from '../../api';
// ⚠️ DV do CPF vem da régua da casa, NUNCA de uma 4ª cópia do algoritmo nesta
// tela (é a lei do Contrato de Inscrição: cópia local de CPF/máscara divergia).
import { cpfValido } from '../../lib/inscricao';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { tirarCodigoPais } from '@/lib/inscricao';

interface Config {
  ativo: boolean;
  aviso: string | null;
  metodos: string[];
  categorias: string[];
  valores_sugeridos: number[];
  min_centavos: number;
  max_centavos: number;
  parcelas_max: number;
  // Campanhas ATIVAS que aceitam doação online (o servidor decide).
  campanhas?: CampanhaOfertavel[];
}

interface Pagamento {
  status: string;
  pago: boolean;
  valor_centavos: number;
  valor_pago_centavos: number;
  metodo: string | null;
  parcelas: number | null;
  metodos: string[] | null;
  parcelas_max: number | null;
  checkout_url: string | null;
  pix_payload: string | null;
  boleto_linha_digitavel: string | null;
  boleto_url: string | null;
  expira_em: string | null;
  pago_em: string | null;
  categoria?: string | null;
  campanha?: string | null;
}

interface CampanhaOfertavel { id: string; nome: string; descricao_curta?: string | null }

// ⚠️ O CPF chega MASCARADO de propósito. O valor real fica no servidor e é
// resolvido pelo token no POST — a página é pública e a URL vive no histórico.
interface Prefill {
  nome: string | null;
  email: string | null;
  cpf_mascarado: string | null;
  telefone_mascarado: string | null;
  tem_cpf: boolean;
  tem_telefone: boolean;
}

const brl = (c: number) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Vocabulário do usuário — o status canônico cru nunca aparece na tela.
const TEXTO: Record<string, { titulo: string; sub: string; cor: string }> = {
  pago: { titulo: 'Recebemos sua doação!', sub: 'Que Deus multiplique. Obrigado por semear com a gente.', cor: '#10b981' },
  pago_parcial: { titulo: 'Recebemos parte do valor', sub: 'A equipe vai conferir e falar com você.', cor: '#f59e0b' },
  criada: { titulo: 'Falta só concluir', sub: 'Escolha como quer doar e finalize o pagamento.', cor: '#f59e0b' },
  aguardando_pagamento: { titulo: 'Aguardando o pagamento', sub: 'Assim que cair, esta página atualiza sozinha.', cor: '#f59e0b' },
  expirada: { titulo: 'O prazo desta doação venceu', sub: 'Nada foi cobrado. Você pode começar de novo quando quiser.', cor: '#ef4444' },
  cancelada: { titulo: 'Doação cancelada', sub: 'Nada foi cobrado.', cor: '#ef4444' },
  falhou: { titulo: 'O pagamento não foi aprovado', sub: 'Nada foi cobrado. Você pode tentar por Pix ou com outro cartão.', cor: '#ef4444' },
  estornado: { titulo: 'Doação estornada', sub: 'O valor foi devolvido. Fale com a igreja se tiver dúvida.', cor: '#ef4444' },
  estornado_parcial: { titulo: 'Estorno parcial', sub: 'Parte do valor foi devolvida. Fale com a igreja.', cor: '#f59e0b' },
  chargeback: { titulo: 'Pagamento contestado', sub: 'A equipe já foi avisada e vai entrar em contato.', cor: '#ef4444' },
};

const ABERTOS = ['criada', 'aguardando_pagamento', 'pago_parcial'];

const CATEGORIA_LABEL: Record<string, { nome: string; desc: string }> = {
  dizimo: { nome: 'Dízimo', desc: 'A décima parte, com fidelidade' },
  oferta: { nome: 'Oferta', desc: 'Doação livre, do coração' },
  campanha: { nome: 'Campanha', desc: 'Uma causa específica' },
};

const METODO_LABEL: Record<string, string> = { pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' };
// Pix primeiro: cai na hora e é o que a maioria usa.
const ORDEM_METODOS = ['pix', 'cartao', 'boleto'];

// Mobile-first de verdade: inline style não faz media query, e esta é a tela que
// a pessoa abre no celular durante o culto. O toggle de tema é `position: fixed`
// no canto e deitava sobre o título — daí a reserva no cabeçalho.
const CSS = `
  .doar-page { padding: 32px 16px; }
  .doar-card { padding: 28px 24px; }
  /* ⚠️ display+margin, não só o textAlign do pai: o preflight do Tailwind faz
     \`img { display: block }\`, então text-align NÃO centraliza o QR. */
  .doar-qr { width: 210px; height: 210px; display: block; margin-inline: auto; }
  .doar-acao { min-height: 48px; }
  .doar-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
  @media (max-width: 560px) {
    .doar-page { padding: 14px 10px; }
    .doar-card { padding: 20px 14px; border-radius: 14px; }
    .doar-head { padding-right: 46px; }
    .doar-qr { width: min(210px, 64vw); height: auto; aspect-ratio: 1; }
  }
`;

/** Centavos a partir do que a pessoa digitou ("1.234,56" · "50" · "50,5"). */
function centavosDoTexto(txt: string): number {
  const limpo = String(txt || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

const soDigitos = (s: string) => String(s || '').replace(/\D/g, '');

function mascaraTelefone(v: string) {
  // ⚠️⚠️ `tirarCodigoPais` ANTES do slice: truncar primeiro transforma
  // "+55 21 99999-8888" em `55219999988` e COME os 2 últimos dígitos —
  // irrecuperáveis. Medido em 02/09/2026: 21 cadastros assim, o mais
  // recente do dia anterior. Ver a lei de 31/07 no CLAUDE.md.
  const d = tirarCodigoPais(soDigitos(v)).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/[-\s()]+$/, '');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/[-\s()]+$/, '');
}

function mascaraCpf(v: string) {
  const d = soDigitos(v).slice(0, 11);
  return d.replace(/(\d{3})(\d{0,3})(\d{0,3})(\d{0,2})/, (_m, a, b, c, e) =>
    [a, b, c].filter(Boolean).join('.') + (e ? `-${e}` : ''));
}

export default function DoarPage() {
  const { token: tokenUrl } = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const { C } = usePublicTheme();

  const [cfg, setCfg] = useState<Config | null>(null);
  const [carregandoCfg, setCarregandoCfg] = useState(true);

  const [pag, setPag] = useState<Pagamento | null>(null);
  const [carregandoPag, setCarregandoPag] = useState(!!tokenUrl);
  const [erroPag, setErroPag] = useState<string | null>(null);

  // ── Formulário ──
  const [categoria, setCategoria] = useState('dizimo');
  // ⚠️ Agora guarda o ID da campanha, não o texto: é `campanha_id` que a
  // barrinha casa (`vw_camp_arrecadacao`). Texto livre nunca alimentava nada.
  const [campanhaId, setCampanhaId] = useState('');
  // Dados do cadastro, quando a pessoa vem do app (`?t=` na URL).
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [valorSel, setValorSel] = useState<number | null>(null);
  const [valorTxt, setValorTxt] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [campoErro, setCampoErro] = useState<string | null>(null);

  // ⚠️ Id da TENTATIVA, gerado UMA vez por visita. É ele que faz duplo clique e
  // retentativa devolverem a MESMA cobrança em vez de criarem duas. Não pode ser
  // por pessoa (ela doa de novo mês que vem e reaproveitaria a cobrança velha).
  // ⚠️ O `?t=` é lido UMA vez, no mount: `useRef` e não estado, porque ele não
  // muda durante a visita e não deve disparar re-render.
  const tokenPrefill = useRef<string>(
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('t') || '')
      : '',
  ).current;

  const tentativa = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
  );

  // Prefill do cadastro quando a pessoa vem do app.
  //
  // ⚠️ Best-effort: token vencido/ausente devolve `{prefill: null}` e a tela fica
  // como sempre foi (formulário em branco). Erro aqui NÃO pode impedir alguém de
  // doar digitando.
  //
  // ⚠️ SÓ-ONDE-VAZIO: não sobrescreve o que a pessoa já digitou. Sem isso, uma
  // resposta lenta chegaria por cima do que ela está escrevendo — a lição do
  // formulário do censo, que ficava escondido até o prefill chegar.
  useEffect(() => {
    if (!tokenPrefill) return;
    let vivo = true;
    generosidadePublica.prefill(tokenPrefill)
      .then((r: any) => {
        if (!vivo || !r?.prefill) return;
        setPrefill(r.prefill);
        setNome((v) => v || r.prefill.nome || '');
        setEmail((v) => v || r.prefill.email || '');
      })
      .catch(() => { /* silencioso: a tela segue funcionando digitando */ });
    return () => { vivo = false; };
  }, [tokenPrefill]);

  const valorCentavos = valorSel ?? centavosDoTexto(valorTxt);

  useEffect(() => {
    generosidadePublica.config()
      .then((c: Config) => setCfg(c))
      .catch(() => setCfg({
        ativo: false, aviso: 'Não conseguimos carregar a página de doação agora. Tente de novo em alguns minutos.',
        metodos: [], categorias: ['dizimo', 'oferta', 'campanha'], valores_sugeridos: [],
        min_centavos: 500, max_centavos: 5000000, parcelas_max: 1,
      }))
      .finally(() => setCarregandoCfg(false));
  }, []);

  const buscarPagamento = useCallback(async (tk: string) => {
    const p = await generosidadePublica.status(tk);
    setPag(p);
    return p as Pagamento;
  }, []);

  useEffect(() => {
    if (!tokenUrl) { setPag(null); setCarregandoPag(false); return; }
    setCarregandoPag(true);
    buscarPagamento(tokenUrl)
      .catch((e: Error) => setErroPag(e.message || 'Doação não encontrada'))
      .finally(() => setCarregandoPag(false));
  }, [tokenUrl, buscarPagamento]);

  // ── Polling com backoff ──
  // ⚠️ Depende de `statusAberto`, NÃO de `pag`: dependência no objeto (que muda a
  // cada poll) reiniciaria o backoff pra sempre e manteria 6s eternos — foi o bug
  // que rendeu ~1.000 req/min no provedor durante o lançamento.
  const statusAberto = pag ? ABERTOS.includes(pag.status) : false;
  useEffect(() => {
    if (!tokenUrl || !statusAberto) return;
    let ciclos = 0;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    const intervalo = () => (ciclos < 10 ? 6000 : ciclos < 20 ? 15000 : ciclos < 40 ? 30000 : 60000);
    const tick = async () => {
      if (!vivo) return;
      ciclos += 1;
      try { await buscarPagamento(tokenUrl); } catch { /* rede: tenta no próximo */ }
      if (vivo) timer = setTimeout(tick, intervalo());
    };
    timer = setTimeout(tick, intervalo());
    // Voltar do checkout do provedor não é pagar, mas é o melhor momento pra
    // conferir sem esperar o próximo ciclo.
    const aoVoltar = () => { if (document.visibilityState === 'visible') buscarPagamento(tokenUrl).catch(() => {}); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { vivo = false; clearTimeout(timer); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [tokenUrl, statusAberto, buscarPagamento]);

  // Confete SÓ com `pago` do servidor.
  const festejou = useRef(false);
  useEffect(() => {
    if (pag?.pago && !festejou.current) {
      festejou.current = true;
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 } });
    }
  }, [pag?.pago]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErroForm(null); setCampoErro(null);
    if (!valorCentavos) { setCampoErro('valor'); setErroForm('Escolha ou digite quanto você quer doar.'); return; }
    // ⚠️⚠️ CAMPANHA: sem escolher, não envia. O servidor também recusa, mas errar
    // aqui é pior — a pessoa acharia que doou pra campanha e cairia em oferta.
    if (categoria === 'campanha' && (cfg?.campanhas || []).length > 0 && !campanhaId) {
      setCampoErro('campanha');
      setErroForm('Escolha a campanha.');
      return;
    }
    // ⚠️ CPF obrigatório (27/08/2026). A tela evita a ida ao servidor, mas quem
    // DECIDE é o backend — este bloco é conveniência, não a trava.
    //
    // ⚠️⚠️ COM PREFILL O CAMPO NÃO EXISTE, e exigir aqui deixaria o formulário
    // INSUBMISSÍVEL: erro pedindo um CPF que a tela não mostra. Quando o cadastro
    // tem CPF, quem o resolve é o servidor pelo token. É a mesma armadilha que
    // mordeu ao tirar as perguntas do Next.
    if (!prefill?.tem_cpf) {
      if (!soDigitos(cpf)) {
        setCampoErro('cpf');
        setErroForm('Informe seu CPF — é o que liga a doação ao seu cadastro e ao comprovante anual.');
        return;
      }
      if (!cpfValido(soDigitos(cpf))) {
        setCampoErro('cpf');
        setErroForm('Esse CPF não parece válido. Confira os números.');
        return;
      }
    }
    setEnviando(true);
    try {
      const r = await generosidadePublica.doar({
        valor_centavos: valorCentavos,
        categoria,
        campanha_id: categoria === 'campanha' ? campanhaId : undefined,
        // ⚠️ O token vai junto: é ele que faz o servidor resolver o cadastro (e
        // o CPF real) em vez de confiar no que foi digitado.
        t: tokenPrefill || undefined,
        nome, email,
        telefone: soDigitos(telefone) || undefined,
        cpf: soDigitos(cpf),
        tentativa: tentativa.current,
        canal: 'web',
        website: honeypot,
      });
      if (!r?.token) { setErroForm('Não conseguimos iniciar a doação. Tente novamente.'); return; }
      setPag(r.pagamento || null);
      // `replace` de propósito: o "voltar" do celular deve sair da doação, não
      // reenviar o formulário.
      navigate(`/doar/${r.token}`, { replace: true });
    } catch (err) {
      const e2 = err as Error & { campo?: string };
      setErroForm(e2.message || 'Não conseguimos iniciar a doação agora.');
      if (e2.campo) setCampoErro(e2.campo);
    } finally {
      setEnviando(false);
    }
  }

  if (carregandoCfg || carregandoPag) {
    return (
      <Shell C={C}>
        <p style={{ textAlign: 'center', color: C.text3, fontSize: 14 }}>Carregando…</p>
      </Shell>
    );
  }

  if (tokenUrl && erroPag) {
    return (
      <Shell C={C}>
        <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Doação não encontrada</h1>
        <p style={{ fontSize: 14, color: C.text3, marginTop: 8 }}>{erroPag}</p>
        <button className="doar-acao" onClick={() => navigate('/doar', { replace: true })} style={btn(C, true)}>
          Começar de novo
        </button>
      </Shell>
    );
  }

  if (tokenUrl && pag) {
    return <TelaPagamento token={tokenUrl} pag={pag} setPag={setPag} C={C} onNovaDoacao={() => navigate('/doar')} />;
  }

  const inativo = cfg && !cfg.ativo;

  return (
    <Shell C={C}>
      <div className="doar-head">
        <div style={{ fontSize: 12, color: '#00B39D', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
          Generosidade
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '6px 0 0' }}>Contribuir com a CBRio</h1>
        <p style={{ fontSize: 14, color: C.text2, marginTop: 8, lineHeight: 1.5 }}>
          Sua contribuição sustenta o cuidado com as pessoas, as crianças, os grupos e a missão da igreja.
        </p>
      </div>

      {inativo ? (
        <div style={{
          marginTop: 18, padding: '14px 16px', borderRadius: 12,
          border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)',
          fontSize: 14, color: C.text2, lineHeight: 1.5,
        }}>
          {cfg?.aviso}
          <div style={{ marginTop: 8, fontSize: 13, color: C.text3 }}>
            Você pode contribuir presencialmente no culto ou falar com a secretaria da igreja.
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} style={{ marginTop: 20 }}>
          {/* Honeypot: invisível pra gente, atraente pra bot. */}
          <input
            type="text" name="website" value={honeypot} onChange={(ev) => setHoneypot(ev.target.value)}
            tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />

          <Rotulo C={C}>O que você está doando</Rotulo>
          <div className="doar-grid" style={{ marginTop: 8 }}>
            {(cfg?.categorias || []).map((cat) => {
              const l = CATEGORIA_LABEL[cat] || { nome: cat, desc: '' };
              const on = categoria === cat;
              return (
                <button
                  key={cat} type="button" onClick={() => setCategoria(cat)}
                  style={{
                    ...opcao(C, on), display: 'block', textAlign: 'left', padding: '10px 12px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{l.nome}</div>
                  {l.desc && <div style={{ fontSize: 11, color: on ? 'rgba(255,255,255,0.85)' : C.text3, marginTop: 2 }}>{l.desc}</div>}
                </button>
              );
            })}
          </div>

          {/* ⚠️⚠️ LISTA das campanhas ATIVAS, não texto livre. Antes a pessoa
              digitava o nome e a doação não se ligava a nada — a barrinha da
              campanha nunca somava. A lista vem do SERVIDOR (só campanha ativa,
              na janela, com `aceita_online`). */}
          {categoria === 'campanha' && (
            <div style={{ marginTop: 12 }}>
              <Rotulo C={C}>Qual campanha?</Rotulo>
              {(cfg?.campanhas || []).length === 0 ? (
                /* ⚠️ Sem campanha ativa a tela DIZ isso e manda pra oferta, em
                   vez de mostrar um seletor vazio (que se lê como tela quebrada). */
                <p style={{ margin: '6px 0 0', fontSize: 13, color: C.text3 }}>
                  Não há campanha ativa agora. Você pode contribuir como{' '}
                  <button
                    type="button" onClick={() => setCategoria('oferta')}
                    style={{ background: 'none', border: 0, padding: 0, color: '#00B39D', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
                  >oferta</button>.
                </p>
              ) : (
                <>
                  <select
                    value={campanhaId}
                    onChange={(ev) => setCampanhaId(ev.target.value)}
                    style={input(C, campoErro === 'campanha')}
                  >
                    <option value="">Escolha a campanha</option>
                    {(cfg?.campanhas || []).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  {(() => {
                    const sel = (cfg?.campanhas || []).find((c) => c.id === campanhaId);
                    return sel?.descricao_curta ? (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text3 }}>{sel.descricao_curta}</p>
                    ) : null;
                  })()}
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <Rotulo C={C}>Quanto você quer doar</Rotulo>
            <div className="doar-grid" style={{ marginTop: 8 }}>
              {(cfg?.valores_sugeridos || []).map((v) => (
                <button
                  key={v} type="button"
                  onClick={() => { setValorSel(v); setValorTxt(''); }}
                  style={{ ...opcao(C, valorSel === v), fontWeight: 700, fontSize: 14 }}
                >
                  {brl(v)}
                </button>
              ))}
            </div>
            <input
              value={valorTxt}
              onChange={(ev) => { setValorTxt(ev.target.value); setValorSel(null); }}
              inputMode="decimal" placeholder="Ou digite outro valor (R$)"
              style={{ ...input(C, campoErro === 'valor'), marginTop: 8 }}
            />
            {!!valorCentavos && (
              <div style={{ fontSize: 13, color: C.text3, marginTop: 6 }}>
                Você vai doar <strong style={{ color: C.text }}>{brl(valorCentavos)}</strong>
              </div>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <Rotulo C={C}>Seu nome completo</Rotulo>
            <input
              value={nome} onChange={(ev) => setNome(ev.target.value)} autoComplete="name"
              placeholder="Como está no seu documento" style={input(C, campoErro === 'nome')}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <Rotulo C={C}>E-mail</Rotulo>
            <input
              value={email} onChange={(ev) => setEmail(ev.target.value)} type="email" autoComplete="email"
              inputMode="email" placeholder="para onde vai o recibo" style={input(C, campoErro === 'email')}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <Rotulo C={C}>Celular <span style={{ color: C.textDim, fontWeight: 400 }}>(opcional)</span></Rotulo>
            <input
              value={telefone} onChange={(ev) => setTelefone(mascaraTelefone(ev.target.value))}
              inputMode="tel" autoComplete="tel"
              placeholder={prefill?.telefone_mascarado || '(21) 99999-9999'}
              style={input(C, false)}
            />
            {/* ⚠️ O telefone do cadastro aparece MASCARADO como placeholder: a
                pessoa reconhece que já temos e não precisa redigitar, e o número
                completo não trafega pra uma página pública. */}
            {prefill?.tem_telefone && !telefone && (
              <div style={{ fontSize: 12, color: C.text3, marginTop: 6 }}>
                Vamos usar o celular do seu cadastro. Preencha só se quiser trocar.
              </div>
            )}
          </div>

          {/* ⚠️⚠️ COM PREFILL O CPF NÃO É PEDIDO. Quem resolve o CPF é o SERVIDOR,
              pelo token — então ele nunca chega ao navegador e a pessoa não pode
              doar sob o CPF de outra pessoa da família por engano. */}
          {prefill?.tem_cpf ? (
            <div style={{ marginTop: 12 }}>
              <Rotulo C={C}>CPF</Rotulo>
              <div style={{ ...input(C, false), display: 'flex', alignItems: 'center', color: C.text3 }}>
                {prefill.cpf_mascarado}
              </div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 6, lineHeight: 1.45 }}>
                É o CPF do seu cadastro — a doação já entra no seu comprovante anual.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <Rotulo C={C}>CPF</Rotulo>
              <input
                value={cpf} onChange={(ev) => setCpf(mascaraCpf(ev.target.value))}
                inputMode="numeric" placeholder="000.000.000-00" style={input(C, campoErro === 'cpf')}
              />
              <div style={{ fontSize: 12, color: C.text3, marginTop: 6, lineHeight: 1.45 }}>
                {/* ⚠️ Prefill SEM CPF no cadastro é um terceiro estado, e a frase
                    muda: a pessoa veio identificada mas o cadastro está incompleto. */}
                {prefill
                  ? 'Seu cadastro ainda não tem CPF — informe para a doação entrar no seu comprovante anual.'
                  : 'O CPF liga a doação ao seu cadastro — é o que faz ela aparecer no seu comprovante anual de contribuições.'}
              </div>
            </div>
          )}

          {erroForm && (
            <div style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 10,
              border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)',
              fontSize: 13, color: C.text,
            }}>
              {erroForm}
            </div>
          )}

          <button type="submit" className="doar-acao" disabled={enviando} style={btn(C, true, enviando)}>
            {enviando ? 'Preparando…' : 'Continuar para o pagamento'}
          </button>

          <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 12, lineHeight: 1.5 }}>
            Seus dados são usados para registrar a doação e emitir o recibo, conforme a LGPD.
            O pagamento é processado por um provedor certificado — dados do seu cartão não passam
            pelos nossos servidores.
          </p>

          {/* Direito de arrependimento de 7 dias (CDC art. 49) vale pra doação feita
              pela internet — o link tem que estar visível ANTES de pagar, não só
              depois. O item 10 da política é o que trata de doação. */}
          <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Mudou de ideia? Você tem 7 dias para pedir a devolução —{' '}
            <a
              href="/politica-reembolso"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#00B39D', textDecoration: 'underline' }}
            >
              política de reembolso
            </a>
            .
          </p>
        </form>
      )}
    </Shell>
  );
}

// ── Tela do pagamento ──────────────────────────────────────────────────────

function TelaPagamento({ token, pag, setPag, C, onNovaDoacao }: {
  token: string;
  pag: Pagamento;
  setPag: (p: Pagamento) => void;
  C: ReturnType<typeof usePublicTheme>['C'];
  onNovaDoacao: () => void;
}) {
  const t = TEXTO[pag.status] || TEXTO.criada;
  const emAberto = ABERTOS.includes(pag.status);

  const metodos = useMemo(() => {
    const lista = (pag.metodos && pag.metodos.length ? pag.metodos : ['pix']);
    return [...lista].sort((a, b) => ORDEM_METODOS.indexOf(a) - ORDEM_METODOS.indexOf(b));
  }, [pag.metodos]);

  const [metodoSel, setMetodoSel] = useState<string | null>(null);
  const [parcelasSel, setParcelasSel] = useState(1);
  const [preparando, setPreparando] = useState<string | null>(null);
  // ⚠️ ESTADO, não ref: a tela precisa re-renderizar pra riscar a aba recusada.
  const [falhas, setFalhas] = useState<Record<string, string>>({});
  const preparados = useRef<Set<string>>(new Set());
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const chave = (m: string, p: number) => (m === 'cartao' ? `${m}:${p}` : m);

  const escolher = useCallback(async (metodo: string, parcelas: number) => {
    setMetodoSel(metodo);
    setParcelasSel(parcelas);
    if (preparados.current.has(chave(metodo, parcelas))) return;
    setPreparando(metodo);
    try {
      const p = await generosidadePublica.metodo(token, metodo, parcelas);
      preparados.current.add(chave(metodo, parcelas));
      setFalhas((f) => { const n = { ...f }; delete n[metodo]; return n; });
      setPag(p);
    } catch (err) {
      const e = err as Error & { pagamento?: Pagamento };
      setFalhas((f) => ({ ...f, [metodo]: e.message || 'Esta forma não está disponível agora.' }));
      // ⚠️ Volta a aba pra forma que o SERVIDOR confirmou: deixar a aba na forma
      // recusada mostraria duas verdades (aba "Cartão" sobre cobrança Pix) e um
      // botão que promete pagar de um jeito que não existe.
      if (e.pagamento) {
        setPag(e.pagamento);
        if (e.pagamento.metodo) setMetodoSel(e.pagamento.metodo);
      }
    } finally {
      setPreparando(null);
    }
  }, [token, setPag]);

  // Pré-seleção. ⚠️ Usa a forma que o SERVIDOR já gravou; só cai em metodos[0]
  // quando a cobrança ainda não tem forma. Pré-selecionar sempre a primeira
  // REESCREVIA a forma da cobrança a cada carregamento — quem escolheu cartão
  // em 6x e voltava pra conferir tinha a cobrança convertida em Pix.
  useEffect(() => {
    if (metodoSel || !emAberto || !metodos.length) return;
    const jaEscolhida = pag.metodo && metodos.includes(pag.metodo) ? pag.metodo : null;
    if (jaEscolhida) {
      const p = pag.parcelas && pag.parcelas > 1 ? pag.parcelas : 1;
      preparados.current.add(chave(jaEscolhida, p));
      setMetodoSel(jaEscolhida);
      setParcelasSel(p);
      return;
    }
    escolher(metodos[0], 1);
  }, [metodos, metodoSel, emAberto, escolher, pag]);

  useEffect(() => {
    if (!pag.pix_payload) { setQr(null); return; }
    QRCode.toDataURL(pag.pix_payload, { width: 520, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr).catch(() => setQr(null));
  }, [pag.pix_payload]);

  const tetoParcelas = Math.max(1, Math.min(pag.parcelas_max || 1, 12));

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } catch { /* sem clipboard: a pessoa seleciona à mão */ }
  }

  return (
    <Shell C={C}>
      <div className="doar-head">
        <div style={{ fontSize: 12, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {pag.categoria === 'campanha' && pag.campanha ? `Campanha · ${pag.campanha}`
            : pag.categoria === 'dizimo' ? 'Dízimo' : 'Oferta'}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0', color: t.cor }}>{t.titulo}</h1>
        <p style={{ fontSize: 14, color: C.text2, marginTop: 6 }}>{t.sub}</p>
      </div>

      <div style={{
        marginTop: 16, padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.cardBorder}`,
        display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Valor</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{brl(pag.valor_centavos)}</div>
        </div>
        {pag.metodo && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Forma</div>
            <div style={{ fontSize: 14 }}>
              {METODO_LABEL[pag.metodo] || pag.metodo}
              {pag.parcelas && pag.parcelas > 1 ? ` · ${pag.parcelas}x` : ''}
            </div>
          </div>
        )}
      </div>

      {emAberto && (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            {metodos.map((m) => {
              const recusada = !!falhas[m];
              return (
                <button
                  key={m} type="button" className="doar-acao"
                  onClick={() => escolher(m, m === 'cartao' ? parcelasSel : 1)}
                  title={recusada ? falhas[m] : undefined}
                  style={{
                    ...opcao(C, metodoSel === m), flex: 1, minWidth: 92, fontWeight: 700, fontSize: 14,
                    textDecoration: recusada ? 'line-through' : 'none',
                    opacity: recusada ? 0.55 : 1,
                  }}
                >
                  {METODO_LABEL[m] || m}
                </button>
              );
            })}
          </div>

          {preparando && (
            <p style={{ fontSize: 13, color: C.text3, marginTop: 12 }}>Preparando {METODO_LABEL[preparando] || preparando}…</p>
          )}

          {!preparando && metodoSel && falhas[metodoSel] && (
            <div style={{
              marginTop: 14, padding: '12px 14px', borderRadius: 12,
              border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)',
              fontSize: 13.5, color: C.text, lineHeight: 1.5,
            }}>
              <strong>{METODO_LABEL[metodoSel] || metodoSel} não está disponível agora.</strong>
              <div style={{ marginTop: 4, color: C.text2 }}>{falhas[metodoSel]}</div>
              {pag.checkout_url && (
                <a href={pag.checkout_url} target="_blank" rel="noreferrer"
                  className="doar-acao" style={{ ...btn(C, false), display: 'block', textAlign: 'center', marginTop: 10 }}>
                  Abrir a página de pagamento
                </a>
              )}
            </div>
          )}

          {!preparando && metodoSel === 'pix' && !falhas.pix && (
            <div style={{ marginTop: 16 }}>
              {qr ? <img src={qr} alt="QR Code do Pix" className="doar-qr" />
                : <p style={{ fontSize: 13, color: C.text3, textAlign: 'center' }}>Gerando o QR do Pix…</p>}
              {pag.pix_payload ? (
                <>
                  <button type="button" className="doar-acao" onClick={() => copiar(pag.pix_payload!)} style={btn(C, true)}>
                    {copiado ? 'Código copiado!' : 'Copiar código Pix'}
                  </button>
                  <p style={{ fontSize: 12.5, color: C.text3, marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
                    Abra o app do seu banco, escolha Pix → Pagar com QR Code ou Copia e Cola.
                    Esta página confirma sozinha quando o pagamento cair.
                  </p>
                </>
              ) : pag.checkout_url ? (
                <a href={pag.checkout_url} target="_blank" rel="noreferrer"
                  className="doar-acao" style={{ ...btn(C, true), display: 'block', textAlign: 'center' }}>
                  Abrir o Pix
                </a>
              ) : null}
            </div>
          )}

          {!preparando && metodoSel === 'cartao' && !falhas.cartao && (
            <div style={{ marginTop: 16 }}>
              {tetoParcelas > 1 && (
                <>
                  <Rotulo C={C}>Parcelas</Rotulo>
                  <select
                    value={parcelasSel}
                    onChange={(ev) => escolher('cartao', Number(ev.target.value))}
                    style={{ ...input(C, false), marginTop: 6 }}
                  >
                    {Array.from({ length: tetoParcelas }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? 'À vista' : `${n}x de ${brl(Math.round(pag.valor_centavos / n))}`}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {pag.checkout_url ? (
                <a href={pag.checkout_url} target="_blank" rel="noreferrer"
                  className="doar-acao" style={{ ...btn(C, true), display: 'block', textAlign: 'center', marginTop: 12 }}>
                  Pagar com cartão
                </a>
              ) : (
                <p style={{ fontSize: 13, color: C.text3, marginTop: 10 }}>Preparando o pagamento com cartão…</p>
              )}
              <p style={{ fontSize: 12, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>
                O pagamento com cartão abre na página segura do nosso provedor. Os dados do seu
                cartão não passam pelos servidores da igreja.
              </p>
            </div>
          )}

          {!preparando && metodoSel === 'boleto' && !falhas.boleto && (
            <div style={{ marginTop: 16 }}>
              {pag.boleto_linha_digitavel ? (
                <>
                  <div style={{
                    fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all',
                    padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.cardBorder}`,
                  }}>
                    {pag.boleto_linha_digitavel}
                  </div>
                  <button type="button" className="doar-acao" onClick={() => copiar(pag.boleto_linha_digitavel!)} style={btn(C, true)}>
                    {copiado ? 'Copiado!' : 'Copiar linha digitável'}
                  </button>
                </>
              ) : null}
              {pag.boleto_url && (
                <a href={pag.boleto_url} target="_blank" rel="noreferrer"
                  className="doar-acao" style={{ ...btn(C, false), display: 'block', textAlign: 'center', marginTop: 8 }}>
                  Abrir o boleto
                </a>
              )}
            </div>
          )}
        </>
      )}

      {pag.pago && (
        <div style={{ marginTop: 18 }}>
          <p style={{ fontSize: 13.5, color: C.text2, lineHeight: 1.55 }}>
            O recibo vai para o e-mail que você informou.
            {' '}Se você informou o CPF, a doação também entra no seu comprovante anual de contribuições.
          </p>
          <button type="button" className="doar-acao" onClick={onNovaDoacao} style={btn(C, false)}>
            Fazer outra doação
          </button>
        </div>
      )}

      {!emAberto && !pag.pago && (
        <button type="button" className="doar-acao" onClick={onNovaDoacao} style={btn(C, true)}>
          Começar de novo
        </button>
      )}

      <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 16, lineHeight: 1.5 }}>
        Guarde este link se quiser voltar e conferir depois. Dúvida sobre a sua doação?
        Fale com a secretaria da igreja.
      </p>
    </Shell>
  );
}

// ── Casca e estilos ────────────────────────────────────────────────────────

function Shell({ C, children }: { C: ReturnType<typeof usePublicTheme>['C']; children: React.ReactNode }) {
  return (
    <div className="doar-page" style={{ minHeight: '100dvh', background: C.pageBg, color: C.text, display: 'flex' }}>
      <style>{CSS}</style>
      <PublicThemeToggle />
      <div className="doar-card" style={{
        maxWidth: 520, width: '100%', margin: 'auto', background: C.card,
        border: `1px solid ${C.cardBorder}`, borderRadius: 18, backdropFilter: 'blur(12px)',
      }}>
        {children}
      </div>
    </div>
  );
}

function Rotulo({ C, children }: { C: ReturnType<typeof usePublicTheme>['C']; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.text2, letterSpacing: 0.2 }}>
      {children}
    </label>
  );
}

function input(C: ReturnType<typeof usePublicTheme>['C'], erro: boolean): CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box', marginTop: 6,
    padding: '11px 12px', borderRadius: 10,
    border: `1px solid ${erro ? 'rgba(239,68,68,0.7)' : C.inputBorder}`,
    background: C.optionBg, color: C.text,
    // 16px é anti-zoom no iOS (abaixo disso o Safari dá zoom ao focar o campo).
    fontSize: 16, outline: 'none',
  };
}

function opcao(C: ReturnType<typeof usePublicTheme>['C'], on: boolean): CSSProperties {
  return {
    padding: '11px 10px', borderRadius: 10, cursor: 'pointer',
    border: `1px solid ${on ? '#00B39D' : C.inputBorder}`,
    background: on ? '#00B39D' : C.optionBg,
    color: on ? '#ffffff' : C.text,
    minHeight: 44,
  };
}

function btn(C: ReturnType<typeof usePublicTheme>['C'], primario: boolean, ocupado = false): CSSProperties {
  return {
    width: '100%', marginTop: 12, padding: '13px 16px', borderRadius: 12,
    border: primario ? 'none' : `1px solid ${C.inputBorder}`,
    background: primario ? '#00B39D' : 'transparent',
    color: primario ? '#ffffff' : C.text,
    fontSize: 15, fontWeight: 700, cursor: ocupado ? 'progress' : 'pointer',
    opacity: ocupado ? 0.7 : 1, textDecoration: 'none',
  };
}
