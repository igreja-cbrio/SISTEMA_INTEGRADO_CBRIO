// CEP que preenche endereço, bairro e cidade — a régua PURA.
//
// Motivo (Matheus · 10/08/2026): no culto o preenchimento é em pé, no celular,
// com fila atrás. Digitar 8 dígitos e receber três campos prontos é a diferença
// entre a pessoa terminar e desistir no meio.
//
// ⚠️ Quem decide QUAIS perguntas recebem o dado é o `preenche_de` do construtor,
// não uma lista de nomes de pergunta aqui. Casar por texto ("é a pergunta que
// tem 'bairro' no título?") quebraria assim que alguém reescrevesse o enunciado.

/** Campos do cadastro que o CEP sabe preencher, na ordem em que aparecem. */
export const CAMPOS_DO_CEP = ['endereco', 'bairro', 'cidade', 'uf'] as const;
export type CampoDoCep = (typeof CAMPOS_DO_CEP)[number];

export type EnderecoCep = Partial<Record<CampoDoCep, string>>;

/** 00000-000 enquanto digita. Corta em 8 dígitos — CEP não tem mais que isso. */
export function mascaraCep(valor: string): string {
  const d = String(valor || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function cepCompleto(valor: string): boolean {
  return String(valor || '').replace(/\D/g, '').length === 8;
}

/**
 * Traduz a resposta do ViaCEP para os nossos campos.
 *
 * ⚠️ `erro: true` é como o ViaCEP diz "não existe" — e ele responde isso com
 * **HTTP 200**. Quem confiar só no status trata CEP inexistente como sucesso e
 * apaga o endereço que a pessoa tinha digitado.
 * ⚠️ CEP de cidade inteira (interior) vem com `logradouro` e `bairro` VAZIOS.
 * Devolver string vazia ali seria pior que não mexer: apagaria o que a pessoa
 * escreveu. Por isso campo vazio é OMITIDO do resultado.
 */
export function mapearViaCep(json: unknown): EnderecoCep | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (j.erro === true || j.erro === 'true') return null;

  const texto = (v: unknown) => String(v ?? '').trim();
  const out: EnderecoCep = {};
  const logradouro = texto(j.logradouro);
  const bairro = texto(j.bairro);
  const cidade = texto(j.localidade);
  const uf = texto(j.uf);
  if (logradouro) out.endereco = logradouro;
  if (bairro) out.bairro = bairro;
  if (cidade) out.cidade = cidade;
  if (uf) out.uf = uf;

  // Sem cidade não é um CEP útil — cidade é o único campo que o ViaCEP sempre
  // traz quando o CEP existe.
  return out.cidade ? out : null;
}

type PerguntaMin = { id: string; preenche_de?: string };

/**
 * Aplica o endereço nas respostas, devolvendo o mapa novo e quais perguntas
 * foram tocadas.
 *
 * ⚠️ NÃO sobrescreve o que a pessoa digitou à mão. Só substitui valor que veio
 * de um CEP anterior (`jaDoCep`) — foi ela quem corrigiu o CEP, então o endereço
 * antigo do CEP tem que sair. Sem essa distinção, corrigir o CEP deixaria a rua
 * errada na tela, ou apagaria o número que a pessoa acabou de escrever.
 */
export function aplicarEndereco(
  perguntas: PerguntaMin[],
  respostas: Record<string, unknown>,
  dados: EnderecoCep,
  jaDoCep: Set<string> = new Set(),
): { respostas: Record<string, unknown>; preenchidas: string[] } {
  const proximas = { ...respostas };
  const preenchidas: string[] = [];

  for (const p of perguntas) {
    const campo = p.preenche_de as CampoDoCep | undefined;
    if (!campo || !CAMPOS_DO_CEP.includes(campo)) continue;
    const novo = dados[campo];
    if (!novo) continue;

    const atual = proximas[p.id];
    const vazio = atual === undefined || atual === null || String(atual).trim() === '';
    if (!vazio && !jaDoCep.has(p.id)) continue;   // digitado à mão: não toca

    if (String(atual ?? '') !== novo) proximas[p.id] = novo;
    preenchidas.push(p.id);
  }
  return { respostas: proximas, preenchidas };
}

/**
 * Consulta o ViaCEP. Devolve null em qualquer problema — CEP é atalho, e atalho
 * que falha não pode travar o formulário: a pessoa continua digitando à mão.
 *
 * ⚠️ Tem timeout próprio: no wi-fi do templo uma requisição pendurada deixaria o
 * campo "buscando…" para sempre.
 */
export async function buscarCep(cep: string, timeoutMs = 6000): Promise<EnderecoCep | null> {
  const d = String(cep || '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: ctrl.signal });
    if (!r.ok) return null;
    return mapearViaCep(await r.json());
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
