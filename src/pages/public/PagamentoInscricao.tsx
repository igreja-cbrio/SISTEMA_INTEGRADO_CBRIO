// Página pública de pagamento da inscrição · /pagamento/:token
//
// É AQUI que a pessoa escolhe como pagar, e é aqui que ela volta pra conferir.
//
// ⚠️ Divisão que não deve ser mexida sem entender o motivo: **Pix e boleto são
// nativos** (QR e linha digitável não são dados sensíveis) e **cartão sai pro
// checkout do Asaas**. Número de cartão não entra no nosso domínio, no nosso
// Express nem nos nossos logs (lei nº 5 do núcleo de pagamentos) — coletar PAN
// em formulário nosso ampliaria o escopo PCI-DSS da igreja.
//
// ⚠️ LEI: nenhuma confirmação — texto, confete, "está tudo certo" — sem
// `pago === true` LIDO DO SERVIDOR. Quem decide é `pag_cobrancas.status`, nunca
// o fato de a pessoa ter voltado do checkout (voltar não é pagar).
//
// Acessada pelo `public_token`, nunca pelo uuid da cobrança.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { eventoPublico } from '../../api';
import CartaoBrick from '../../components/pagamento/CartaoBrick';
import BaixarInstrucoes from './BaixarInstrucoes';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';

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
  cartao_na_pagina?: boolean;
  cartao_public_key?: string | null;
  pix_payload: string | null;
  boleto_linha_digitavel: string | null;
  boleto_url: string | null;
  expira_em: string | null;
  pago_em: string | null;
  evento_nome: string | null;
  evento_slug: string | null;
  // Código legível da inscrição (CBR-AAAA-NNNNNN). Opcional porque bundle novo
  // pode falar com backend antigo durante o deploy.
  codigo?: string | null;
  comprovante_token: string | null;
  // Anexo de comprovante (Pix/TED pago fora do provedor). `aceita_comprovante`
  // vem do servidor: só é oferecido enquanto não está pago e em forma que pode
  // ter sido paga por fora.
  aceita_comprovante?: boolean;
  comprovantes?: ComprovanteEnviado[] | null;
  // Instruções gerais do evento (só vem com `pago` — inscrição concluída).
  instrucoes?: { url: string; nome?: string | null } | null;
}

interface ComprovanteEnviado {
  id: string;
  status: 'em_analise' | 'aceito' | 'recusado' | string;
  metodo_declarado: string;
  arquivo_nome: string | null;
  enviado_em: string;
  motivo_recusa: string | null;
}

const brl = (c: number) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Vocabulário do usuário — não expõe o status canônico cru na tela.
const TEXTO: Record<string, { titulo: string; sub: string; cor: string }> = {
  pago: { titulo: 'Pagamento confirmado!', sub: 'Sua inscrição está garantida.', cor: '#10b981' },
  pago_parcial: { titulo: 'Pagamento parcial recebido', sub: 'Recebemos parte do valor. A equipe vai falar com você.', cor: '#f59e0b' },
  criada: { titulo: 'Aguardando pagamento', sub: 'Sua vaga está reservada. Conclua o pagamento para confirmar.', cor: '#f59e0b' },
  aguardando_pagamento: { titulo: 'Aguardando pagamento', sub: 'Sua vaga está reservada. Conclua o pagamento para confirmar.', cor: '#f59e0b' },
  expirada: { titulo: 'O prazo do pagamento venceu', sub: 'A vaga voltou para a fila. Você pode se inscrever de novo se ainda houver vaga.', cor: '#ef4444' },
  cancelada: { titulo: 'Pagamento cancelado', sub: 'Se foi sem querer, faça a inscrição de novo.', cor: '#ef4444' },
  falhou: { titulo: 'O pagamento não foi aprovado', sub: 'Nada foi cobrado. Você pode tentar de novo com outro cartão ou por Pix.', cor: '#ef4444' },
  estornado: { titulo: 'Pagamento estornado', sub: 'O valor foi devolvido. Fale com a equipe se tiver dúvida.', cor: '#ef4444' },
  estornado_parcial: { titulo: 'Estorno parcial', sub: 'Parte do valor foi devolvida. Fale com a equipe.', cor: '#f59e0b' },
  chargeback: { titulo: 'Pagamento contestado', sub: 'A equipe já foi avisada e vai entrar em contato.', cor: '#ef4444' },
};

const ABERTOS = ['criada', 'aguardando_pagamento', 'pago_parcial'];

// Mobile-first de verdade: o inline style não faz media query, e esta é a tela
// que a pessoa abre no celular (com uma mão, na fila, às vezes no 4G). Três
// coisas mudam no telefone: sobra menos margem morta, o cabeçalho reserva o
// canto do botão de tema (que é `position: fixed` e caía em cima do título) e
// todo alvo de toque tem 48px.
const CSS_MOBILE = `
  .pgto-page { padding: 32px 16px; }
  .pgto-card { padding: 28px 22px; }
  /* ⚠️ display+margin, não só o textAlign do pai: o preflight do Tailwind
     (@tailwind base) faz \`img { display: block }\`, então a imagem deixa de ser
     inline e o \`text-align: center\` do container NÃO a centraliza — ela encosta
     na esquerda enquanto o texto ao redor fica centralizado. */
  .pgto-qr { width: 200px; height: 200px; display: block; margin-inline: auto; }
  .pgto-acao { min-height: 48px; }
  @media (max-width: 560px) {
    .pgto-page { padding: 16px 10px; }
    .pgto-card { padding: 20px 14px; border-radius: 14px; }
    /* O toggle de tema é fixed no canto: sem esta reserva ele deita sobre o
       nome do evento e o título quando o cartão ocupa a largura toda. */
    .pgto-head { padding-right: 46px; }
    .pgto-qr { width: min(200px, 62vw); height: auto; aspect-ratio: 1; }
  }

  /* ── Formulário de cartão (Brick do provedor) ──
     ⚠️ O Brick renderiza a árvore dele dentro deste container e alguns campos
     são IFRAMES. Iframe tem largura intrínseca e NÃO encolhe sozinho: sem o
     \`max-width: 100%\` abaixo, num celular estreito o formulário empurra a
     página e cria rolagem horizontal — que é o defeito clássico de checkout no
     celular, e o celular é onde a maioria se inscreve.
     Estilo aqui é só CAIXA (largura/overflow); cor, raio e fonte vão pelas
     \`customVariables\` do SDK, que é o canal suportado. */
  .pgto-cartao { width: 100%; max-width: 100%; }
  .pgto-cartao iframe,
  .pgto-cartao form,
  .pgto-cartao input,
  .pgto-cartao select { max-width: 100%; }
  /* O container não pode CORTAR conteúdo (a lista de parcelas do Brick abre
     pra fora); só impedir que ele empurre a página. */
  .pgto-cartao { overflow-x: clip; }

  /* Alvo de toque de 48px (guia de acessibilidade) nas abas de forma — no
     celular elas são o primeiro controle que a pessoa encosta. */
  .pgto-metodos > button { min-height: 48px; }
  @media (max-width: 380px) {
    /* Com 3 formas em tela de 320px, 15px estoura o botão. */
    .pgto-metodos > button { font-size: 14px; padding-left: 4px; padding-right: 4px; }
  }
`;


const METODO_LABEL: Record<string, string> = { pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' };
// Pix primeiro de propósito: cai na hora e é o que a maioria usa. Boleto por
// último — leva dias úteis pra compensar.
const ORDEM_METODOS = ['pix', 'cartao', 'boleto'];

// QR do comprovante de inscrição (SPEC-06) — mostrado só com `pago` do
// servidor. Codifica /i/c/<token>, a página que a portaria escaneia na entrada.
function ComprovanteCheckin({ token, corTexto }: { token: string; corTexto: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const url = `${window.location.origin}/i/c/${token}`;
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr).catch(() => setQr(null));
  }, [url]);
  if (!qr) return null;
  return (
    <div style={{ marginTop: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: '#00B39D', fontWeight: 700 }}>Seu comprovante de inscrição</div>
      <div style={{ display: 'inline-block', background: '#fff', padding: 10, borderRadius: 12, marginTop: 8 }}>
        <img src={qr} alt="QR do comprovante de inscrição" style={{ width: 168, height: 168, display: 'block' }} />
      </div>
      <p style={{ fontSize: 12, color: corTexto, marginTop: 8, lineHeight: 1.5 }}>
        Apresente este QR na entrada do evento — ou abra <a href={url} style={{ color: '#00B39D', fontWeight: 600 }}>o comprovante</a> quando precisar.
      </p>
    </div>
  );
}

/**
 * Anexar comprovante de Pix/transferência.
 *
 * ⚠️ Enquadramento é deliberado: NÃO é uma forma de pagar. É pra quem pagou e a
 * página não reconheceu (Pix direto na chave da igreja, TED, ou uma entrega de
 * webhook que se perdeu). Convidar todo mundo a "pagar e mandar print" criaria
 * fila humana pra pagamento que o provedor confirmaria sozinho em segundos.
 *
 * E a tela NUNCA diz "pagamento confirmado" aqui: diz "em análise". Só o
 * servidor, com `pago === true`, autoriza aquela frase.
 */
function AnexarComprovante({ token, pag, C, onEnviado }: {
  token: string; pag: Pagamento; C: any; onEnviado: (p: Pagamento) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const enviados = pag.comprovantes || [];
  const emAnalise = enviados.find((c) => c.status === 'em_analise');
  const recusado = !emAnalise && enviados.find((c) => c.status === 'recusado');

  async function enviar() {
    if (!arquivo) { setErro('Escolha o arquivo do comprovante.'); return; }
    setEnviando(true); setErro('');
    try {
      const r = await eventoPublico.enviarComprovante(token, arquivo, {
        metodo_declarado: pag.metodo === 'transferencia' ? 'transferencia' : 'pix',
        observacao,
      });
      setArquivo(null); setObservacao(''); setAberto(false);
      if (r?.pagamento) onEnviado(r.pagamento);
    } catch (e: any) {
      setErro(e?.message || 'Não conseguimos enviar agora. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const caixa: CSSProperties = {
    marginTop: 16, padding: 14, borderRadius: 12,
    border: `1px solid ${C.inputBorder}`, background: 'rgba(245,158,11,0.06)',
  };

  if (emAnalise) {
    return (
      <div style={caixa}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Comprovante em análise</div>
        <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>
          Recebemos seu comprovante em {new Date(emAnalise.enviado_em).toLocaleString('pt-BR')}.
          A equipe vai conferir e confirmar sua inscrição — <b>não precisa pagar de novo</b>.
          Sua vaga segue reservada enquanto isso.
        </p>
      </div>
    );
  }

  return (
    <div style={caixa}>
      {recusado && (
        <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 8px' }}>
          Seu comprovante anterior não pôde ser aceito: {recusado.motivo_recusa}
        </p>
      )}
      {!aberto ? (
        <button className="pgto-acao" onClick={() => setAberto(true)} style={{
          width: '100%', padding: '12px 18px', borderRadius: 999,
          border: `1px solid ${C.inputBorder}`, background: 'transparent',
          color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          {recusado ? 'Enviar outro comprovante' : 'Já paguei e a página não atualizou — enviar comprovante'}
        </button>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Enviar comprovante</div>
          <p style={{ fontSize: 12, color: C.textDim, marginTop: 0, marginBottom: 10 }}>
            Imagem (JPG/PNG) ou PDF, até 10 MB. Uma pessoa da equipe confere e confirma —
            o envio por si não confirma o pagamento.
          </p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(e) => { setArquivo(e.target.files?.[0] || null); setErro(''); }}
            style={{ width: '100%', fontSize: 14, marginBottom: 10, color: C.text }}
          />
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Observação (opcional) — ex.: paguei pela conta do meu pai"
            maxLength={300}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.text,
              // 16px evita o zoom automático do iOS ao focar o campo.
              fontSize: 16, marginBottom: 10,
            }}
          />
          {erro && <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 10px' }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pgto-acao" disabled={enviando} onClick={enviar} style={{
              flex: 1, padding: '12px 18px', borderRadius: 999, border: 'none',
              background: '#00B39D', color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.7 : 1,
            }}>
              {enviando ? 'Enviando…' : 'Enviar comprovante'}
            </button>
            <button className="pgto-acao" onClick={() => { setAberto(false); setErro(''); }} style={{
              padding: '12px 18px', borderRadius: 999, border: `1px solid ${C.inputBorder}`,
              background: 'transparent', color: C.text, fontSize: 14, cursor: 'pointer',
            }}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function PagamentoInscricao() {
  const { token = '' } = useParams();
  const { C, isDark } = usePublicTheme();
  const [pag, setPag] = useState<Pagamento | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  // Guarda O QUE foi copiado (Pix ou boleto), pra dar retorno no botão certo.
  const [copiado, setCopiado] = useState('');
  const [metodoSel, setMetodoSel] = useState<string | null>(null);
  // Parcelas ESCOLHIDAS pela pessoa (1 = à vista). Antes o sistema mandava o
  // TETO do evento como número de parcelas, o que criava um plano parcelado em
  // toda cobrança e confirmava inscrição com 1/N pago.
  const [parcelasSel, setParcelasSel] = useState(1);
  // Formas já PREPARADAS no provedor nesta sessão — pedir a mesma duas vezes é
  // desperdício (o artefato já está na resposta anterior).
  const preparados = useRef<Set<string>>(new Set());
  // Formas que o provedor RECUSOU nesta cobrança (forma → motivo). É ESTADO, não
  // ref: a aba dessas formas deixa de oferecer o caminho de pagamento (QR, linha,
  // botão) e isso tem que re-renderizar. Prometer o que não existe é o que manda
  // a pessoa pra uma fatura dizendo "não há formas de pagamento disponíveis".
  const [falhas, setFalhas] = useState<Record<string, string>>({});
  const [preparando, setPreparando] = useState<string | null>(null);
  const [erroMetodo, setErroMetodo] = useState('');
  // Confete só uma vez, e só quando o SERVIDOR disse pago.
  const festejou = useRef(false);

  // ⚠️ TODO caminho que traz estado novo do servidor passa por aqui — polling,
  // carga inicial e o pagamento com cartão na própria página. Antes o confete
  // vivia só dentro do `carregar()`, e o cartão (que atualiza o estado direto da
  // resposta do POST, sem repassar pelo GET) confirmava a inscrição SEM festejar.
  // ⚠️ A LEI continua intacta: só festeja com `pago === true` LIDO DO SERVIDOR —
  // o gatilho é a resposta, nunca o clique.
  const aplicarPagamento = useCallback((r: Pagamento) => {
    setPag(r);
    if (r?.pago && !festejou.current) {
      festejou.current = true;
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, colors: ['#00B39D', '#00d9bd', '#ffd166', '#ffffff'] });
      // Segunda salva pelos cantos: a inscrição paga é o fim de uma jornada
      // longa (formulário + pagamento) e a tela é a única confirmação imediata.
      setTimeout(() => {
        confetti({ particleCount: 60, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: ['#00B39D', '#00d9bd', '#ffd166'] });
        confetti({ particleCount: 60, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: ['#00B39D', '#00d9bd', '#ffd166'] });
      }, 220);
    }
  }, []);

  const carregar = useCallback(async (primeira = false) => {
    try {
      const r = await eventoPublico.pagamento(token);
      aplicarPagamento(r);
      setErro('');
    } catch (e: any) {
      if (primeira) setErro(e?.message || 'Não encontramos este pagamento.');
    } finally {
      if (primeira) setCarregando(false);
    }
  }, [token, aplicarPagamento]);

  useEffect(() => { carregar(true); }, [carregar]);

  // Polling enquanto está em aberto. Para sozinho quando resolve — e o backend
  // consulta o provedor quando a cobrança está parada há mais de 2 min, então
  // não dependemos do webhook chegar.
  //
  // ⚠️⚠️ O QUE DECIDE O RITMO É "TEM ALGUÉM OLHANDO?", não o tempo decorrido
  // (11/08/2026 · pedido do Matheus: *"na hora que o Pix for feito, a página da
  // pessoa tem que atualizar o mais rápido possível, sem ela ficar
  // recarregando"*). A versão anterior degradava até 60s **mesmo com a pessoa
  // na frente da tela** e continuava consultando **de aba escondida**: era
  // lento justamente pra quem estava esperando e caro justamente pra quem tinha
  // ido embora. Agora:
  //   · aba ESCONDIDA  → polling PARADO (0 requisição). É onde mora a aba
  //     esquecida que motivou o backoff original — e também o minuto em que a
  //     pessoa está DENTRO do app do banco pagando.
  //   · aba VISÍVEL    → 3s no primeiro minuto (a janela em que o Pix cai),
  //     depois 8s, com teto de 20s.
  // No total isso gera MENOS carga que antes (aba escondida era o grosso do
  // volume) e resolve em ~3s pra quem está com o QR na frente.
  //
  // ⚠️ O caminho mais comum no celular nem depende disso: sair pro app do banco
  // esconde a aba, e voltar dispara consulta IMEDIATA no `visibilitychange`. O
  // ritmo de 3s existe pra quem paga em OUTRO aparelho (QR no computador), em
  // que a aba nunca perde o foco e nada avisaria a página.
  const tentativas = useRef(0);
  // ⚠️ Depende do STATUS, não do objeto `pag`: cada poll troca a referência de
  // `pag`, o effect re-rodaria e o ritmo seria zerado a cada volta.
  const statusAberto = pag && ABERTOS.includes(pag.status) ? pag.status : null;
  useEffect(() => {
    if (!statusAberto) return;
    tentativas.current = 0;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const parar = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const proximo = () => {
      parar();
      // ⚠️ Não agenda nada com a aba escondida. Sem isto, uma aba deixada aberta
      // no fim do dia seguiria consultando o provedor a noite inteira.
      if (!vivo || document.visibilityState !== 'visible') return;
      const n = tentativas.current;
      const espera = n < 20 ? 3000 : n < 40 ? 8000 : 20000;
      timer = setTimeout(async () => {
        if (!vivo) return;
        tentativas.current += 1;
        await carregar();
        proximo();
      }, espera);
    };
    proximo();

    // Voltar pra aba dispara uma consulta na hora e RESETA o ritmo — é sinal de
    // que a pessoa está ativa, e é o momento mais provável de ter acabado de
    // pagar. Sair da aba PARA o laço.
    const aoTrocarVisibilidade = () => {
      if (document.visibilityState !== 'visible') { parar(); return; }
      tentativas.current = 0;
      carregar().finally(proximo);
    };
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
    return () => {
      vivo = false;
      parar();
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    };
  }, [statusAberto, carregar]);

  useEffect(() => {
    if (!pag?.pix_payload) { setQr(null); return; }
    QRCode.toDataURL(pag.pix_payload, { width: 640, margin: 1 })
      .then(setQr).catch(() => setQr(null));
  }, [pag?.pix_payload]);

  async function copiar(qual: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(''), 2500);
    } catch {
      // Navegador sem permissão de clipboard: o código segue visível na tela
      // pra copiar à mão. Não vale quebrar a tela por isso.
    }
  }

  const t = pag ? (TEXTO[pag.status] || { titulo: 'Pagamento em análise', sub: 'Estamos conferindo com o provedor.', cor: '#f59e0b' }) : null;
  const emAberto = !!pag && ABERTOS.includes(pag.status);

  /**
   * O que a tela oferece = formas que o EVENTO aceita ∩ formas que sabemos
   * apresentar agora. Cobrança antiga sem `metodos` cai nos três (é o
   * comportamento que existia antes deste seletor).
   *
   * ⚠️ Cada forma tem um caminho nativo e um de reserva pelo checkout: se o
   * provedor não devolveu o artefato (QR do Pix, linha do boleto), a aba não
   * mente nem aparece vazia — ela manda pro ambiente do Asaas, que sempre sabe
   * cobrar. Isso mantém a tela honesta se o Pix vier só depois da escolha.
   */
  const metodos = useMemo(() => {
    if (!pag) return [];
    const base = pag.metodos?.length ? pag.metodos : ORDEM_METODOS;
    return base
      .filter(m => {
        if (m === 'pix') return !!pag.pix_payload || !!pag.checkout_url;
        if (m === 'cartao') return !!pag.checkout_url;
        if (m === 'boleto') return !!pag.boleto_url || !!pag.boleto_linha_digitavel || !!pag.checkout_url;
        return false;
      })
      .sort((a, b) => ORDEM_METODOS.indexOf(a) - ORDEM_METODOS.indexOf(b));
  }, [pag]);

  /**
   * Escolher a forma NÃO é só trocar de aba: o servidor precisa preparar aquele
   * meio no provedor (é o que faz o QR do Pix e a linha do boleto existirem).
   * Sem isso a aba mostrava um caminho que a cobrança não tinha — foi o bug do
   * "só aparece boleto" do 1º teste em sandbox.
   */
  const escolherMetodo = useCallback(async (m: string, parcelas = 1) => {
    setMetodoSel(m);
    setErroMetodo('');
    // Trocar o número de parcelas exige preparar de novo no provedor (é ele que
    // divide o valor), então a chave do cache inclui as parcelas.
    const chave = m === 'cartao' ? `${m}:${parcelas}` : m;
    if (preparados.current.has(chave)) return;
    setPreparando(m);
    try {
      const r = await eventoPublico.pagamentoMetodo(token, m, parcelas);
      preparados.current.add(chave);
      setFalhas(f => { const { [m]: _fora, ...resto } = f; return resto; });
      setPag(r);
    } catch (e: any) {
      // ⚠️ A aba é a INTENÇÃO; o que vale é a forma que o provedor confirmou.
      // Antes a aba ficava em "Cartão" enquanto o campo FORMA seguia "boleto" —
      // duas verdades na mesma tela, e o botão embaixo ainda prometia pagar com
      // cartão numa cobrança que não era cartão.
      const motivo = e?.message || `Não conseguimos preparar ${METODO_LABEL[m] || m} nesta cobrança.`;
      setFalhas(f => ({ ...f, [m]: motivo }));
      if (e?.pagamento) {
        setPag(e.pagamento);
        // Volta pra forma que existe de fato. Só cai em `m` quando o servidor
        // não disse qual é (aí a aba fica na tentativa, com o erro do lado).
        setMetodoSel(e.pagamento.metodo || m);
      }
      setErroMetodo(motivo);
    } finally {
      setPreparando(null);
    }
  }, [token]);

  // Pré-seleciona a forma que o servidor JÁ confirmou; só cai na primeira da lista
  // (Pix) quando a cobrança ainda não tem forma. Uma vez só — se a pessoa trocou de
  // aba, o polling não deve arrastá-la de volta.
  const preSelecionou = useRef(false);
  useEffect(() => {
    if (preSelecionou.current || metodoSel || !metodos.length || !emAberto) return;
    preSelecionou.current = true;

    /**
     * ⚠️ A forma da cobrança muda SÓ quando a pessoa troca — nunca no
     * carregamento. Antes daqui, todo load pré-selecionava `metodos[0]` (Pix) e
     * chamava `escolherMetodo`, que faz `POST /metodo` e REESCREVE a forma no
     * provedor: quem escolhia cartão em 6x, saía pra pagar e voltava pra conferir
     * tinha a cobrança convertida em Pix — e o `installmentCount: null` que
     * Pix/boleto mandam desfazia o parcelamento. Na tela isso aparecia como aba
     * "Pix" com QR sobre um campo FORMA dizendo "cartao": duas verdades juntas.
     */
    const jaEscolhida = pag?.metodo && metodos.includes(pag.metodo) ? pag.metodo : null;
    if (jaEscolhida) {
      const parcelas = jaEscolhida === 'cartao' ? (pag?.parcelas || 1) : 1;
      // Sem isto o seletor exibiria "1x" numa cobrança que está em 6x.
      if (jaEscolhida === 'cartao') setParcelasSel(parcelas);
      // Já está preparada no provedor (o artefato veio no payload), então semear o
      // cache com a MESMA chave do `escolherMetodo` evita um POST redundante.
      preparados.current.add(jaEscolhida === 'cartao' ? `${jaEscolhida}:${parcelas}` : jaEscolhida);
      setMetodoSel(jaEscolhida);
      return;
    }
    escolherMetodo(metodos[0], 1);
  }, [metodos, metodoSel, emAberto, escolherMetodo, pag]);

  return (
    <div className="pgto-page" style={{ minHeight: '100dvh', background: C.pageBg, color: C.text, display: 'flex' }}>
      <style>{CSS_MOBILE}</style>
      <PublicThemeToggle />
      <div className="pgto-card" style={{
        maxWidth: 520, width: '100%', margin: 'auto', background: C.card,
        border: `1px solid ${C.cardBorder}`, borderRadius: 18,
        backdropFilter: 'blur(12px)',
      }}>
        {carregando ? (
          <p style={{ textAlign: 'center', color: C.text3, fontSize: 14 }}>Carregando…</p>
        ) : erro ? (
          <>
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Pagamento não encontrado</h1>
            <p style={{ fontSize: 14, color: C.text3, marginTop: 8 }}>{erro}</p>
            <p style={{ fontSize: 13, color: C.textDim, marginTop: 12 }}>
              Confira o link que você recebeu. Se o problema continuar, fale com a equipe da igreja.
            </p>
          </>
        ) : pag && t ? (
          <>
            <div className="pgto-head">
              {pag.evento_nome && (
                <div style={{ fontSize: 12, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {pag.evento_nome}
                </div>
              )}
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0', color: t.cor }}>{t.titulo}</h1>
              <p style={{ fontSize: 14, color: C.text2, marginTop: 6 }}>{t.sub}</p>
            </div>

            <div style={{
              marginTop: 16, padding: '12px 14px', borderRadius: 12,
              border: `1px solid ${C.cardBorder}`, display: 'flex', flexWrap: 'wrap',
              gap: 12, justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Valor</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{brl(pag.valor_centavos)}</div>
              </div>
              {pag.metodo && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Forma</div>
                  <div style={{ fontSize: 14 }}>
                    {pag.metodo}{pag.parcelas && pag.parcelas > 1 ? ` · ${pag.parcelas}x` : ''}
                  </div>
                </div>
              )}
            </div>

            {/* Código da inscrição — é o que a pessoa cita ao falar com a
                equipe. Fica visível pago ou não; some se o backend for antigo
                (deploy em 2 etapas) em vez de mostrar "null". */}
            {pag.codigo && (
              <p style={{ fontSize: 12.5, color: C.text3, marginTop: 10 }}>
                Código da inscrição: <strong style={{ color: C.text, letterSpacing: 0.3 }}>{pag.codigo}</strong>
              </p>
            )}

            {pag.pago && pag.pago_em && (
              <p style={{ fontSize: 12.5, color: C.text3, marginTop: 6 }}>
                Pago em {new Date(pag.pago_em).toLocaleString('pt-BR')}.
              </p>
            )}

            {/* Informação prévia exigida pelo CDC: fica junto do valor, visível
                antes e depois de pagar. Nova aba pra não interromper o pagamento. */}
            <p style={{ fontSize: 12, color: C.text3, marginTop: 8 }}>
              <a href="/politica-reembolso" target="_blank" rel="noreferrer"
                style={{ color: C.text3, textDecoration: 'underline' }}>
                Política de reembolso e cancelamento
              </a>
            </p>

            {/* Comprovante do check-in (SPEC-06): pagou → o QR da entrada
                aparece AQUI (a tela de sucesso do formulário ficou pra trás
                quando a pessoa foi pro checkout). Sem `pago`, sem QR. */}
            {pag.pago && pag.comprovante_token && (
              <ComprovanteCheckin token={pag.comprovante_token} corTexto={C.text3} />
            )}

            {/* Instruções gerais do evento: a inscrição CONCLUIU aqui (quem
                pagou por Pix nunca volta na tela de sucesso do formulário).
                O servidor só manda `instrucoes` com `pago`. */}
            {pag.pago && <BaixarInstrucoes instrucoes={pag.instrucoes} C={C} />}

            {emAberto && (
              <>
                {pag.expira_em && (
                  <p style={{ fontSize: 12.5, color: '#b45309', marginTop: 10 }}>
                    Sua vaga fica reservada até {new Date(pag.expira_em).toLocaleString('pt-BR')}.
                  </p>
                )}

                {metodos.length > 1 && (
                  <div className="pgto-metodos" style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                    {metodos.map(m => (
                      <button key={m} onClick={() => escolherMetodo(m, m === 'cartao' ? parcelasSel : 1)} disabled={!!preparando}
                        // Forma já recusada fica marcada: sem isso a pessoa tenta
                        // a mesma aba de novo sem saber que ela não funciona aqui.
                        title={falhas[m] || undefined}
                        style={{
                          flex: 1, minHeight: 44, padding: '10px 8px', borderRadius: 10,
                          cursor: preparando ? 'progress' : 'pointer',
                          border: `1px solid ${metodoSel === m ? '#00B39D' : C.inputBorder}`,
                          background: metodoSel === m ? 'rgba(0,179,157,0.12)' : 'transparent',
                          color: falhas[m] ? C.textDim : (metodoSel === m ? '#00B39D' : C.text2),
                          textDecoration: falhas[m] ? 'line-through' : 'none',
                          fontSize: 15, fontWeight: metodoSel === m ? 700 : 500,
                          opacity: preparando && preparando !== m ? 0.55 : (falhas[m] ? 0.7 : 1),
                        }}>
                        {METODO_LABEL[m] || m}
                      </button>
                    ))}
                  </div>
                )}

                {preparando && (
                  <p style={{ fontSize: 13, color: C.text3, marginTop: 12, textAlign: 'center' }}>
                    Preparando {METODO_LABEL[preparando] || preparando}…
                  </p>
                )}
                {/* Erro genérico só quando a forma selecionada NÃO tem bloco
                    próprio de recusa embaixo — senão a tela diz a mesma coisa 2x. */}
                {erroMetodo && !preparando && !(metodoSel && falhas[metodoSel]) && (
                  <p style={{ fontSize: 13, color: '#ef4444', marginTop: 12 }}>
                    {erroMetodo} Você pode escolher outra forma acima
                    {pag.checkout_url ? ' ou concluir na página do provedor abaixo' : ''}.
                  </p>
                )}

                {/* Forma RECUSADA pelo provedor: no lugar do caminho que promete
                    pagar (QR / linha / botão), a tela diz que não dá. Era esse
                    botão que levava à fatura dizendo "não há formas de pagamento
                    disponíveis" — a tela prometia o que a cobrança não tinha. */}
                {metodoSel && falhas[metodoSel] && !preparando && (
                  <div style={{
                    marginTop: 14, padding: 14, borderRadius: 12,
                    border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)',
                  }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: C.text }}>
                      {METODO_LABEL[metodoSel] || metodoSel} não está disponível para esta cobrança.
                    </p>
                    <p style={{ fontSize: 12.5, color: C.text3, margin: '6px 0 0' }}>
                      {falhas[metodoSel]} Escolha outra forma acima
                      {pag.metodo ? ` — esta cobrança está como ${METODO_LABEL[pag.metodo] || pag.metodo}.` : '.'}
                    </p>
                    {pag.checkout_url && (
                      <a href={pag.checkout_url} style={{ textDecoration: 'none' }}>
                        <button className="pgto-acao" style={{
                          width: '100%', marginTop: 12, padding: '12px 18px', borderRadius: 999,
                          border: `1px solid ${C.inputBorder}`, background: 'transparent',
                          color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        }}>
                          Abrir a página do provedor
                        </button>
                      </a>
                    )}
                  </div>
                )}

                {metodoSel === 'pix' && !falhas.pix && (
                  qr ? (
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <img className="pgto-qr" src={qr} alt="QR Code do Pix" style={{ borderRadius: 10, background: '#fff', padding: 8 }} />
                      <p style={{ fontSize: 12.5, color: C.text3, margin: '10px 0 0' }}>
                        Abra o app do seu banco, escolha Pix e leia o código. Cai na hora.
                      </p>
                      <button onClick={() => copiar('pix', pag.pix_payload || '')} style={{
                        display: 'block', margin: '10px auto 0', padding: '12px 18px', borderRadius: 999,
                        border: `1px solid ${C.inputBorder}`, background: 'transparent',
                        color: C.text2, fontSize: 14, cursor: 'pointer', minHeight: 48,
                      }}>
                        {copiado === 'pix' ? 'Código copiado!' : 'Copiar código Pix'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: C.text2, marginTop: 14 }}>
                        Você conclui o Pix no ambiente do provedor de pagamento da igreja.
                      </p>
                      {pag.checkout_url && (
                        <a href={pag.checkout_url} style={{ textDecoration: 'none' }}>
                          <button className="pgto-acao" style={{
                            width: '100%', marginTop: 10, padding: '13px 18px', borderRadius: 999,
                            border: 'none', background: '#00B39D', color: '#fff',
                            fontSize: 15, fontWeight: 700, cursor: 'pointer',
                          }}>
                            Pagar com Pix
                          </button>
                        </a>
                      )}
                    </>
                  )
                )}

                {metodoSel === 'cartao' && !falhas.cartao && (
                  <>
                    {/* Seletor de parcelas: é a PESSOA que escolhe, e o número
                        escolhido é o que vai pro provedor. O teto vem do evento
                        (definido por quando a igreja paga o local). */}
                    {pag.parcelas_max && pag.parcelas_max > 1 && (
                      <div style={{ marginTop: 14 }}>
                        <label htmlFor="pgto-parcelas" style={{ fontSize: 12.5, color: C.text3, display: 'block', marginBottom: 6 }}>
                          Em quantas vezes?
                        </label>
                        <select
                          id="pgto-parcelas"
                          value={parcelasSel}
                          disabled={!!preparando}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setParcelasSel(n);
                            escolherMetodo('cartao', n);
                          }}
                          style={{
                            width: '100%', minHeight: 48, padding: '10px 12px', borderRadius: 10,
                            border: `1px solid ${C.inputBorder}`, background: C.optionBg || 'transparent',
                            color: C.text, fontSize: 16,
                          }}
                        >
                          {Array.from({ length: Math.min(pag.parcelas_max, 12) }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>
                              {n === 1
                                ? `À vista — ${brl(pag.valor_centavos)}`
                                : `${n}x de ${brl(Math.round(pag.valor_centavos / n))}`}
                            </option>
                          ))}
                        </select>
                        {parcelasSel > 1 && (
                          <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>
                            Total {brl(pag.valor_centavos)}. Juros do parcelamento, quando houver,
                            aparecem na tela do provedor antes de você confirmar.
                          </p>
                        )}
                      </div>
                    )}
                    {/* ⚠️ Com o Brick, quem escolhe as parcelas é o próprio
                        formulário do provedor (ele mostra os juros de cada
                        opção). Manter TAMBÉM o nosso seletor daria duas
                        verdades na mesma tela — por isso o bloco acima só
                        aparece quando o Brick NÃO está no ar. */}
                    {pag.cartao_na_pagina && pag.cartao_public_key ? (
                      <CartaoBrick
                        publicKey={pag.cartao_public_key}
                        valorCentavos={pag.valor_centavos}
                        parcelasMax={pag.parcelas_max}
                        checkoutUrl={pag.checkout_url}
                        corTexto={C.text2}
                        corTextoFraco={C.textDim}
                        escuro={isDark}
                        corBorda={C.inputBorder}
                        // ⚠️ Sem isto o Brick pinta o fundo dos campos com o
                        // cinza-azulado do tema escuro DELE, que não é o da
                        // página — era isso que fazia o bloco do formulário
                        // parecer colado de outro site no modo escuro. A prop
                        // existia e nunca tinha sido passada daqui.
                        corFundoInput={C.optionBg}
                        onPagar={async (formData) => {
                          // ⚠️ LANÇAR em erro é contrato do Brick: é o que faz
                          // ele sair do estado "processando" e deixar a pessoa
                          // corrigir. Resolver sem pagar deixaria a tela
                          // parecendo que deu certo.
                          try {
                            const r = await eventoPublico.pagamentoCartao(token!, formData);
                            aplicarPagamento(r);
                            if (!r?.pago) throw new Error('Pagamento não confirmado.');
                          } catch (e: any) {
                            if (e?.pagamento) aplicarPagamento(e.pagamento);
                            throw e;
                          }
                        }}
                      />
                    ) : (
                      <>
                    <p style={{ fontSize: 13, color: C.text2, marginTop: 14 }}>
                      Você digita os dados do cartão no ambiente seguro do provedor de pagamento.
                    </p>
                    <p style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                      A igreja não recebe nem guarda o número do seu cartão.
                    </p>
                    {pag.checkout_url && (
                      <a href={pag.checkout_url} style={{ textDecoration: 'none' }}>
                        <button className="pgto-acao" style={{
                          width: '100%', marginTop: 10, padding: '13px 18px', borderRadius: 999,
                          border: 'none', background: '#00B39D', color: '#fff',
                          fontSize: 15, fontWeight: 700, cursor: 'pointer',
                        }}>
                          Pagar com cartão
                        </button>
                      </a>
                    )}
                      </>
                    )}
                  </>
                )}

                {metodoSel === 'boleto' && !falhas.boleto && (
                  <>
                    <p style={{ fontSize: 12.5, color: '#b45309', marginTop: 14 }}>
                      O boleto leva até 3 dias úteis para compensar. Sua vaga fica reservada
                      nesse tempo, mas se o prazo acima vencer antes, ela volta para a fila.
                    </p>
                    {pag.boleto_linha_digitavel && (
                      <>
                        <div style={{
                          marginTop: 12, padding: '10px 12px', borderRadius: 10,
                          border: `1px solid ${C.inputBorder}`, background: C.optionBg,
                          fontFamily: 'ui-monospace, monospace', fontSize: 13,
                          wordBreak: 'break-all', color: C.text,
                        }}>
                          {pag.boleto_linha_digitavel}
                        </div>
                        <button onClick={() => copiar('boleto', pag.boleto_linha_digitavel || '')} style={{
                          display: 'block', margin: '10px auto 0', padding: '12px 18px', borderRadius: 999,
                          border: `1px solid ${C.inputBorder}`, background: 'transparent',
                          color: C.text2, fontSize: 14, cursor: 'pointer', minHeight: 48,
                        }}>
                          {copiado === 'boleto' ? 'Linha copiada!' : 'Copiar linha digitável'}
                        </button>
                      </>
                    )}
                    {(pag.boleto_url || pag.checkout_url) && (
                      <a href={pag.boleto_url || pag.checkout_url || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        <button className="pgto-acao" style={{
                          width: '100%', marginTop: 10, padding: '13px 18px', borderRadius: 999,
                          border: pag.boleto_linha_digitavel ? `1px solid ${C.inputBorder}` : 'none',
                          background: pag.boleto_linha_digitavel ? 'transparent' : '#00B39D',
                          color: pag.boleto_linha_digitavel ? C.text : '#fff',
                          fontSize: 15, fontWeight: 700, cursor: 'pointer',
                        }}>
                          {pag.boleto_url ? 'Abrir boleto em PDF' : 'Gerar boleto'}
                        </button>
                      </a>
                    )}
                  </>
                )}

                <p style={{ fontSize: 12, color: C.textDim, marginTop: 16, textAlign: 'center' }}>
                  Esta página se atualiza sozinha quando o pagamento cair. Pode deixá-la aberta.
                </p>

                {/* Rede de segurança nº 2: pagou fora do provedor (Pix na chave
                    da igreja, TED) ou a entrega do webhook se perdeu. Vira fila
                    humana — nunca marca pago sozinho. */}
                {pag.aceita_comprovante && token && (
                  <AnexarComprovante token={token} pag={pag} C={C} onEnviado={setPag} />
                )}
              </>
            )}

            {/* Prazo vencido ou pagamento recusado: o caminho de volta é
                inscrever-se de novo — não reaproveitamos cobrança terminal. */}
            {!pag.pago && !emAberto && pag.evento_slug && (
              <Link to={`/evento/${pag.evento_slug}`} style={{ textDecoration: 'none' }}>
                <button className="pgto-acao" style={{
                  width: '100%', marginTop: 16, padding: '12px 18px', borderRadius: 999,
                  border: `1px solid ${C.inputBorder}`, background: 'transparent',
                  color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>
                  Voltar para a inscrição
                </button>
              </Link>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
