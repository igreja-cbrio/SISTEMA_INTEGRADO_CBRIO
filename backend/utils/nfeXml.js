'use strict';

// Leitor de NF-e (layout 4.00 da SEFAZ) para a fila de notas fiscais.
//
// ⚠️⚠️ POR QUE ESCOPAR ANTES DE EXTRAIR — e não varrer o XML inteiro com regex:
// as MESMAS tags aparecem em lugares diferentes com significados diferentes.
// No XML real de uma compra do ML (19/08/2026):
//
//   <vProd>  aparece em <det><prod>  (valor do ITEM)
//            e em <total><ICMSTot>   (soma dos itens)
//   <CNPJ>   aparece em <emit> (quem vendeu), <dest> (a igreja),
//            <autXML>, <infIntermed> (o Mercado Livre) e <infRespTec>
//   <xNome>  aparece em <emit> e em <dest>
//
// Pegar "o primeiro <CNPJ>" ou "o último <vProd>" acerta por acidente e erra
// quando o fornecedor muda de emissor. Então: recorta o BLOCO primeiro
// (`dentroDe`), depois lê a folha DENTRO dele.
//
// ⚠️ NÃO usa dependência nova: `backend/package.json` entra no bundle da função
// serverless (teto de 250 MB na Vercel) e a NF-e é um layout RÍGIDO, definido
// pela SEFAZ — os caminhos não variam por fornecedor.

/** Conteúdo do primeiro `<tag ...>...</tag>`. Null quando não existe. */
function dentroDe(xml, tag) {
  if (!xml) return null;
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}

/** Todos os blocos `<tag>...</tag>` (para itens repetidos, como <det>). */
function todosOsBlocos(xml, tag) {
  if (!xml) return [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  return [...xml.matchAll(re)].map((m) => m[1]);
}

/** Texto de uma folha, já sem espaços nas pontas. */
function txt(bloco, tag) {
  const v = dentroDe(bloco, tag);
  return v === null ? null : v.trim() || null;
}

/** Número de uma folha. ⚠️ Ausência vira null, NUNCA 0 (`Number(null)` é 0). */
function num(bloco, tag) {
  const v = txt(bloco, tag);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/** A chave de acesso tem 44 dígitos. Qualquer outra coisa não é chave. */
function chaveValida(v) {
  return /^\d{44}$/.test(soDigitos(v));
}

/**
 * Lê o XML e devolve `{ ok, nota, erro }`.
 *
 * ⚠️ `ok:false` é resposta legítima, não exceção: um lote de 1.500 arquivos vai
 * ter XML de outro CNPJ, nota cancelada e arquivo corrompido — e o importador
 * precisa contar cada caso, não morrer no primeiro.
 *
 * @param {string} xml
 * @param {object} opts
 * @param {string} [opts.cnpjDestinatario] se informado, RECUSA nota que não seja
 *   endereçada a este CNPJ — é a guarda contra importar despesa de terceiro.
 */
function lerNfe(xml, { cnpjDestinatario } = {}) {
  if (!xml || typeof xml !== 'string') return { ok: false, erro: 'arquivo_vazio' };

  const infNFe = dentroDe(xml, 'infNFe');
  if (!infNFe) return { ok: false, erro: 'nao_e_nfe' };

  // A chave vem do protocolo (<chNFe>) ou do atributo Id do infNFe ("NFe" + 44).
  const infProt = dentroDe(xml, 'infProt');
  let chave = infProt ? soDigitos(txt(infProt, 'chNFe')) : null;
  if (!chaveValida(chave)) {
    const mId = xml.match(/<infNFe[^>]*\bId=["']?NFe(\d{44})/i);
    chave = mId ? mId[1] : null;
  }
  if (!chaveValida(chave)) return { ok: false, erro: 'sem_chave_de_acesso' };

  // ⚠️ Só nota AUTORIZADA vira despesa. cStat 100 = "Autorizado o uso da NF-e";
  // 101/135 = cancelamento, 110/301/302 = denegada. Importar uma cancelada como
  // gasto é dinheiro que não saiu virando lançamento.
  const cStat = infProt ? txt(infProt, 'cStat') : null;
  if (infProt && cStat !== '100') {
    return { ok: false, erro: 'nao_autorizada', detalhe: `cStat ${cStat}: ${txt(infProt, 'xMotivo') || ''}`.trim() };
  }

  const emit = dentroDe(infNFe, 'emit');
  const dest = dentroDe(infNFe, 'dest');
  const ide = dentroDe(infNFe, 'ide');
  const icmsTot = dentroDe(dentroDe(infNFe, 'total') || '', 'ICMSTot');

  const cnpjDest = soDigitos(txt(dest, 'CNPJ'));
  if (cnpjDestinatario) {
    const esperado = soDigitos(cnpjDestinatario);
    if (esperado && cnpjDest && cnpjDest !== esperado) {
      return { ok: false, erro: 'destinatario_diferente', detalhe: cnpjDest };
    }
  }

  // ⚠️ vNF (total da nota) vem de <ICMSTot>, não de <prod> — ver o comentário
  // do topo. Sem <ICMSTot> não inventamos total somando itens.
  const valor = icmsTot ? num(icmsTot, 'vNF') : null;
  if (valor === null) return { ok: false, erro: 'sem_valor_total' };

  const dhEmi = txt(ide, 'dhEmi') || txt(ide, 'dEmi');
  // ⚠️ Fatia a data do ISO em vez de `new Date(...)`: o offset já vem no XML
  // (-03:00) e converter para Date + getDate() no fuso do servidor (UTC)
  // devolveria o dia anterior para emissão do fim da tarde.
  const dataEmissao = dhEmi ? String(dhEmi).slice(0, 10) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao || '')) {
    return { ok: false, erro: 'sem_data_emissao' };
  }

  const itens = todosOsBlocos(infNFe, 'det').map((det) => {
    const prod = dentroDe(det, 'prod') || '';
    return {
      descricao: txt(prod, 'xProd'),
      codigo: txt(prod, 'cProd'),
      ncm: txt(prod, 'NCM'),
      cfop: txt(prod, 'CFOP'),
      unidade: txt(prod, 'uCom'),
      quantidade: num(prod, 'qCom'),
      valor_unitario: num(prod, 'vUnCom'),
      valor_total: num(prod, 'vProd'), // o do ITEM — está dentro de <prod>
    };
  });

  // O Mercado Livre se identifica como intermediador da transação.
  const intermed = dentroDe(infNFe, 'infIntermed');
  const idIntermediador = intermed ? (txt(intermed, 'idCadIntTran') || '').toLowerCase() : null;

  return {
    ok: true,
    nota: {
      chave_acesso: chave,
      numero: txt(ide, 'nNF'),
      serie: txt(ide, 'serie'),
      data_emissao: dataEmissao,
      valor,
      emitente_cnpj: soDigitos(txt(emit, 'CNPJ')) || null,
      emitente_nome: txt(emit, 'xNome'),
      emitente_fantasia: txt(emit, 'xFant'),
      destinatario_cnpj: cnpjDest || null,
      itens,
      // Descrição curta para a lista: o primeiro produto resume a compra.
      descricao: itens.map((i) => i.descricao).filter(Boolean).join(' · ').slice(0, 500) || null,
      intermediador: idIntermediador || null,
      via_mercadolivre: idIntermediador === 'mercadolivre',
      protocolo: infProt ? txt(infProt, 'nProt') : null,
    },
  };
}

module.exports = { lerNfe, dentroDe, todosOsBlocos, chaveValida };
