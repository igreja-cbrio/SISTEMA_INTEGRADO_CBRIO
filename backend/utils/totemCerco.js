// ============================================================================
// Totem · régua PURA do cerco de rede e do alfabeto do código (2026-08-05)
//
// Vive em `utils/` (e não dentro do serviço) pra entrar no GATE DE DEPLOY —
// mesmo padrão de `censoConvite.js`, `prontidaoCadastro.js` e `campoKey.js`.
// Sem banco, sem rede, sem relógio.
//
// ⚠️ ESTA É A MITIGAÇÃO MAIS FORTE contra credencial de totem copiada: o token
// fica no localStorage de um PC de hall público e é extraível por quem senta na
// frente dele. Com o IP da igreja cercado, o token roubado não funciona de fora.
// Se esta função afrouxar, a proteção deixa de existir em silêncio.
// ============================================================================

// Sem O/0/I/1: o voluntário lê da tela de um admin e digita num monitor touch.
// Cada caractere ambíguo é um chamado de suporte no domingo.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODIGO_LEN = 8;

function ipv4ParaInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const o = Number(m[i]);
    if (o > 255) return null;
    n = (n * 256) + o;
  }
  return n;
}

/**
 * O IP do chamador está dentro do cerco da estação?
 *
 * - Lista vazia/ausente = SEM cerco → passa (é a configuração "funciona de
 *   qualquer rede", que a tela de admin sinaliza em âmbar).
 * - Com cerco configurado, IP que não dá pra comparar (IPv6, lixo, ausente)
 *   é RECUSADO. ⚠️ Fail-closed de propósito: deixar passar "porque não deu pra
 *   comparar" transformaria o cerco num enfeite — bastaria o cliente chegar por
 *   IPv6 pra a proteção desaparecer.
 *
 * Suporta IP puro (`191.0.2.10`) e CIDR (`191.0.2.0/24`).
 */
function ipDentroDoCerco(ip, permitidos) {
  if (!Array.isArray(permitidos) || permitidos.length === 0) return true;

  const alvo = ipv4ParaInt(ip);
  if (alvo === null) return false;

  for (const regra of permitidos) {
    const [rede, bitsRaw] = String(regra).split('/');
    const base = ipv4ParaInt(rede);
    if (base === null) continue;

    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) continue;

    // `1 << 32` estoura em JS (shift é mod 32), então /0 tem caso próprio.
    // `>>> 0` mantém o resultado unsigned.
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (((alvo & mascara) >>> 0) === ((base & mascara) >>> 0)) return true;
  }
  return false;
}

/**
 * Normaliza o que a equipe digitou no campo "IPs permitidos".
 * Aceita separação por espaço, vírgula ou ponto e vírgula.
 *
 * ⚠️ Devolve `null` (= sem cerco) quando NADA da entrada é válido, e é isso que
 * a rota usa pra avisar. O caminho perigoso seria devolver lista vazia `[]`
 * tratada como cerco ativo: aí NENHUM IP passaria e o totem morreria; ou pior,
 * a equipe digitaria errado, veria "salvo" e acreditaria estar protegida.
 */
function sanitizarIps(v) {
  if (v === undefined || v === null || v === '') return { lista: null, descartados: [] };

  const bruto = Array.isArray(v) ? v : String(v).split(/[\s,;]+/);
  const limpos = bruto.map((s) => String(s).trim()).filter(Boolean);
  const validos = [];
  const descartados = [];

  for (const s of limpos) {
    if (/^(\d{1,3}\.){3}\d{1,3}(\/(3[0-2]|[12]?\d))?$/.test(s) && ipv4ParaInt(s.split('/')[0]) !== null) {
      validos.push(s);
    } else {
      descartados.push(s);
    }
  }

  return { lista: validos.length ? validos : null, descartados };
}

module.exports = { ALFABETO, CODIGO_LEN, ipv4ParaInt, ipDentroDoCerco, sanitizarIps };
