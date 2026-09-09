// ============================================================================
// E-Inscrição · régua PURA da importação (2026-09-09 · pedido do Marcos)
//
// O AMI CAMP 2027 tem DUAS portas: Pix no nosso site (espinha `inscricoes`) e
// cartão no E-Inscrição (plataforma de terceiros, com régua de preço própria:
// 850/880/900). Quem paga cartão sai da nossa página ANTES de existir inscrição
// aqui — a equipe do retiro só via essa gente numa planilha exportada de lá.
//
// Este módulo é a régua que traz a planilha pra dentro:
//   · a linha exportada vira uma `inscricoes` com `origem = 'e_inscricao'`;
//   · o valor gravado é o LÍQUIDO (a plataforma retém 5,5% do bruto — é o que
//     de fato chega na conta da igreja);
//   · as respostas do formulário de lá caem nas MESMAS keys opacas das perguntas
//     do nosso evento (`c_retiro_*`), pra lista, impressão e filtros tratarem
//     as duas portas como uma;
//   · o bloco de menor vai pras colunas `responsavel_*` (migration 20260817160000).
//
// ⚠️ PURO de propósito: nada aqui lê banco ou arquivo. Quem conecta é o script
// `backend/scripts/_importar_einscricao_retiro.cjs`; quem testa é
// `src/test/eInscricao.test.ts` (entra no gate).
//
// ⚠️⚠️ A inscrição importada OCUPA POSIÇÃO na régua dos lotes e das vagas
// (`fn_insc_inscrever` conta toda linha viva não-cancelada) — é o efeito
// desejado: 24 vendidas lá + 10 aqui = 34 posições do Lote 1 consumidas, sem
// mexer em `insc_eventos.lotes`. Reduzir `lotes[0].vagas` ALÉM disso contaria
// a mesma pessoa duas vezes.
// ============================================================================

const ORIGEM_E_INSCRICAO = 'e_inscricao';
const PLATAFORMA_E_INSCRICAO = 'E-Inscrição';
/** Taxa retida pela plataforma sobre o bruto (informada pelo Marcos, 09/09/2026). */
const TAXA_E_INSCRICAO_PCT = 5.5;

/** "850.0" · "850,00" · "1.250,50" → centavos inteiros. NaN/vazio → null. */
function reaisParaCentavos(texto) {
  if (texto == null) return null;
  let s = String(texto).trim();
  if (!s) return null;
  // Formato BR com milhar: "1.250,50" → "1250.50". Formato da planilha: "850.0".
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Valor que chega na conta depois da taxa da plataforma. Arredonda ao centavo.
 * 85000 × (1 − 0,055) = 80325 (R$ 803,25) — exato, sem resíduo.
 */
function liquidoCentavos(brutoCentavos, taxaPct = TAXA_E_INSCRICAO_PCT) {
  const b = Number(brutoCentavos);
  const t = Number(taxaPct);
  if (!Number.isFinite(b) || !Number.isFinite(t)) return null;
  return Math.round(b * (1 - t / 100));
}

/** "Sim" → true · "Não"/"Nao" → false · resto → null (nunca inventa resposta). */
function simNao(texto) {
  const s = String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s === 'sim') return true;
  if (s === 'nao') return false;
  return null;
}

/** "Feminino"/"Masculino" (qualquer caixa) → valor do CHECK de `inscricoes.sexo`. */
function sexoCanonico(texto) {
  const s = String(texto ?? '').trim().toLowerCase();
  if (s.startsWith('fem')) return 'feminino';
  if (s.startsWith('mas')) return 'masculino';
  return null;
}

/** 11 dígitos ou null — mesma forma que `mem_membros.cpf` e `inscricoes.cpf`. */
function cpfDigits(texto) {
  const d = String(texto ?? '').replace(/\D/g, '');
  return d.length === 11 ? d : null;
}

/**
 * Telefone digits-only (contrato da espinha). A planilha traz de tudo:
 * "+55 21 99659-7631", "21.96939-4379", "diego 21 96413-4740 Eduarda 21 99…".
 * Pega o PRIMEIRO trecho com 10–11 dígitos (DDD + número); tira o 55 de país
 * quando vem colado (13 dígitos). Menos de 8 dígitos → null.
 */
function telefoneDigits(texto) {
  const s = String(texto ?? '');
  // Trechos numéricos ignorando separadores comuns dentro de um mesmo número.
  const trechos = s.split(/[^\d()+\-.\s]+/).map((t) => t.replace(/\D/g, '')).filter(Boolean);
  for (let d of trechos) {
    if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 12 && d.startsWith('55')) d = d.slice(2);
    if (d.length >= 10 && d.length <= 11) return d;
  }
  // Nenhum trecho com DDD: devolve o maior trecho com pelo menos 8 dígitos.
  const maior = trechos.sort((a, b) => b.length - a.length)[0] || '';
  return maior.length >= 8 && maior.length <= 11 ? maior : null;
}

/**
 * Nascimento como veio da planilha: "25/02/2008", "25-02-2008" ou "12062012"
 * (digitado sem barra). → 'YYYY-MM-DD' ou null. Não valida plausibilidade da
 * idade — isso é trabalho do relatório, não do parser (a data fica como a
 * pessoa digitou; um 2025 aparente vai pro aviso, não vira 2015 em silêncio).
 */
function parseDataBR(texto) {
  const s = String(texto ?? '').trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) {
    const d = s.replace(/\D/g, '');
    if (d.length === 8) m = [d, d.slice(0, 2), d.slice(2, 4), d.slice(4)];
  }
  if (!m) return null;
  const dia = Number(m[1]); const mes = Number(m[2]); const ano = Number(m[3]);
  if (!(ano >= 1900 && ano <= 2100 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return null;
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  if (dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * "31-08-2026 16:43:27" (relógio da plataforma, horário de Brasília) →
 * '2026-08-31T16:43:27-03:00'. Guardar o instante REAL da compra importa: a
 * posição no lote é por `created_at`, e a pessoa comprou naquele momento, não
 * no dia em que rodamos a importação.
 */
function parseDataHoraBRT(texto) {
  const m = String(texto ?? '').trim().match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-03:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * CSV da plataforma: `;` como separador, campos entre aspas, `""` escapa aspa,
 * quebra de linha PODE aparecer dentro de aspas. Devolve array de objetos
 * {cabeçalho → valor} com cabeçalhos aparados (um deles vem com TAB na frente).
 */
function parseCsvEInscricao(texto) {
  const linhas = [];
  let campo = ''; let linha = []; let aspas = false;
  const s = String(texto ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (aspas) {
      if (ch === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ';') { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((c) => c !== '')) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); if (linha.some((c) => c !== '')) linhas.push(linha); }
  if (!linhas.length) return [];
  const cab = linhas[0].map((c) => c.trim());
  return linhas.slice(1).map((l) => {
    const o = {};
    cab.forEach((k, i) => { o[k] = (l[i] ?? '').trim(); });
    return o;
  });
}

// Cabeçalhos da exportação (conferidos na planilha de 08/09/2026). Casamos por
// PREFIXO normalizado porque a plataforma repete o texto da pergunta com
// pontuação/acentos que podem mudar entre exportações.
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
function coluna(rec, ...prefixos) {
  const chaves = Object.keys(rec);
  for (const p of prefixos) {
    const alvo = norm(p);
    const k = chaves.find((c) => norm(c).startsWith(alvo));
    if (k !== undefined) return rec[k] ?? '';
  }
  return '';
}

/** Valor "vazio" da planilha: '', 'X', '-', '—'. */
function vazio(v) {
  const s = String(v ?? '').trim();
  return !s || /^[xX\-—.]+$/.test(s);
}
const ouNull = (v) => (vazio(v) ? null : String(v).trim());

/**
 * Linha da planilha → o que vai pra `inscricoes` (+ o bloco `e_inscricao` que
 * fica em `dados`, pra rastrear código/forma/parcelas/aceites da plataforma).
 *
 * `taxaPct` é parâmetro pra a régua não carregar 5,5% como verdade eterna —
 * quem chama passa a taxa vigente.
 */
function mapearLinhaEInscricao(rec, { taxaPct = TAXA_E_INSCRICAO_PCT, arquivo = null, importadoEm = null } = {}) {
  const avisos = [];
  const nome = String(coluna(rec, 'Nome') || '').replace(/\s+/g, ' ').trim();
  const cpf = cpfDigits(coluna(rec, 'Número do documento', 'Numero do documento'));
  if (!cpf) avisos.push('CPF inválido ou ausente');
  const email = String(coluna(rec, 'Email') || '').trim().toLowerCase() || null;
  const telefone = telefoneDigits(coluna(rec, 'Telefone para Contato'));
  if (!telefone) avisos.push('telefone não reconhecido');
  const nascimento = parseDataBR(coluna(rec, 'Data de Nascimento'));
  if (!nascimento) avisos.push('data de nascimento não reconhecida');
  const sexo = sexoCanonico(coluna(rec, 'Gênero', 'Genero'));
  if (!sexo) avisos.push('gênero não reconhecido');

  const brutoCentavos = reaisParaCentavos(coluna(rec, 'Valor'));
  const liquido = brutoCentavos == null ? null : liquidoCentavos(brutoCentavos, taxaPct);
  if (liquido == null) avisos.push('valor não reconhecido');

  const inscritoEm = parseDataHoraBRT(coluna(rec, 'Data da inscrição', 'Data da inscricao'));
  if (!inscritoEm) avisos.push('data da inscrição não reconhecida');

  const cancelada = simNao(coluna(rec, 'Cancelada')) === true;
  const status = String(coluna(rec, 'Status') || '').trim();

  // Respostas → keys OPACAS do nosso evento (nunca derivar do rótulo).
  const dados = {};
  const put = (k, v) => { if (!vazio(v)) dados[k] = String(v).trim(); };
  // A plataforma pede os 2 contatos num campo só; o nosso separa em 2. O texto
  // inteiro fica no 1º — dividir por vírgula/"e" erraria em metade das linhas.
  put('c_retiro_emerg1', coluna(rec, 'Informe 2 contatos'));
  put('c_retiro_jesus', coluna(rec, 'Já aceitou Jesus', 'Ja aceitou Jesus'));
  put('c_retiro_batizado', coluna(rec, 'Já é batizado', 'Ja e batizado'));
  put('c_retiro_membro', coluna(rec, 'É membro AMI', 'E membro AMI'));
  put('c_retiro_igreja', coluna(rec, 'Caso não seja membro', 'Caso nao seja membro'));
  put('c_retiro_conhece', coluna(rec, 'Caso seja visitante, conhece'));
  put('c_retiro_restricao', coluna(rec, 'Possui alguma restrição alimentar', 'Possui alguma restricao alimentar'));
  put('c_retiro_med_controlado', coluna(rec, 'Faz uso de algum medicamento controlado'));
  put('c_retiro_alergia', coluna(rec, 'Possui alergia medicamentosa'));
  put('c_retiro_qual_med', coluna(rec, 'Qual medicamento'));

  const codigo = String(coluna(rec, 'Código da inscrição', 'Codigo da inscricao') || '').trim() || null;
  if (!codigo) avisos.push('sem código da plataforma');
  const parcelasTxt = String(coluna(rec, 'Quantidade de parcelas') || '').trim();
  dados.e_inscricao = {
    plataforma: PLATAFORMA_E_INSCRICAO,
    codigo,
    status: status || null,
    cancelada,
    inscrito_em: inscritoEm,
    categoria: ouNull(coluna(rec, 'Categoria')),
    cupom: ouNull(coluna(rec, 'Cupom')),
    forma_pagamento: ouNull(coluna(rec, 'Forma de pagamento')),
    parcelas: parcelasTxt ? Number(parcelasTxt) || null : null,
    valor_bruto_centavos: brutoCentavos,
    taxa_pct: taxaPct,
    valor_liquido_centavos: liquido,
    aceites: {
      termo_menor: ouNull(coluna(rec, 'Termos de responsabilidade')),
      info_retiro: ouNull(coluna(rec, 'Informações Sobre o Retiro', 'Informacoes Sobre o Retiro')),
      cancelamento: ouNull(coluna(rec, 'Cancelamento, desistência', 'Cancelamento, desistencia')),
    },
    quem_inscreveu: ouNull(coluna(rec, 'Quem realizou a inscrição', 'Quem realizou a inscricao')),
    email_quem_inscreveu: (ouNull(coluna(rec, 'Email de quem realizou')) || '').toLowerCase() || null,
    checkin_em: ouNull(coluna(rec, 'Check-in em')),
    arquivo: arquivo || null,
    importado_em: importadoEm || null,
  };

  // Bloco do responsável (menor). Só quando há NOME — "X" é placeholder de adulto.
  const respNome = ouNull(coluna(rec, 'Nome Completo do Responsável', 'Nome Completo do Responsavel'));
  const responsavel = respNome ? {
    responsavel_nome: respNome,
    responsavel_cpf: cpfDigits(coluna(rec, 'CPF do Responsável', 'CPF do Responsavel')),
    responsavel_parentesco: ouNull(coluna(rec, 'Grau de Parentesco')),
    responsavel_telefone: telefoneDigits(coluna(rec, 'Celular do Responsável', 'Celular do Responsavel')),
    responsavel_email: (ouNull(coluna(rec, 'Email do Responsável', 'Email do Responsavel')) || '').toLowerCase() || null,
    // TRI-ESTADO (lei do inscricaoMenor): NULL nunca é "autorizado".
    responsavel_autoriza_batismo: simNao(coluna(rec, 'Caso menor de 18 anos pelo qual')),
  } : {
    responsavel_nome: null, responsavel_cpf: null, responsavel_parentesco: null,
    responsavel_telefone: null, responsavel_email: null, responsavel_autoriza_batismo: null,
  };

  return {
    nome_completo: nome,
    cpf,
    email,
    telefone,
    data_nascimento: nascimento,
    sexo,
    endereco: ouNull(coluna(rec, 'Endereço Completo', 'Endereco Completo')),
    dados,
    ...responsavel,
    status: cancelada ? 'cancelada' : 'confirmada',
    origem: ORIGEM_E_INSCRICAO,
    valor_cobrado_centavos: liquido,
    created_at: inscritoEm,
    codigo_plataforma: codigo,
    avisos,
  };
}

/**
 * Placar por plataforma a partir das linhas VIVAS do evento
 * ({origem, status, valor_cobrado_centavos}). Cancelada não conta (mesma régua
 * da vaga). O dinheiro do E-Inscrição é o LÍQUIDO gravado na inscrição; o do
 * sistema vem dos pagamentos pagos e entra por fora (`arrecadadoSistema`).
 */
function resumoPorPlataforma(linhas, arrecadadoSistemaCentavos = null) {
  const externo = { plataforma: PLATAFORMA_E_INSCRICAO, origem: ORIGEM_E_INSCRICAO, inscritos: 0, valor_liquido_centavos: 0 };
  const sistema = { inscritos: 0, arrecadado_centavos: arrecadadoSistemaCentavos };
  for (const l of linhas || []) {
    if (!l || l.status === 'cancelada') continue;
    if (l.origem === ORIGEM_E_INSCRICAO) {
      externo.inscritos += 1;
      externo.valor_liquido_centavos += Number(l.valor_cobrado_centavos) || 0;
    } else sistema.inscritos += 1;
  }
  const total_centavos = arrecadadoSistemaCentavos == null
    ? null
    : externo.valor_liquido_centavos + Number(arrecadadoSistemaCentavos || 0);
  return { externo, sistema, total_inscritos: externo.inscritos + sistema.inscritos, total_centavos };
}

module.exports = {
  ORIGEM_E_INSCRICAO, PLATAFORMA_E_INSCRICAO, TAXA_E_INSCRICAO_PCT,
  reaisParaCentavos, liquidoCentavos, simNao, sexoCanonico, cpfDigits, telefoneDigits,
  parseDataBR, parseDataHoraBRT, parseCsvEInscricao, mapearLinhaEInscricao, resumoPorPlataforma,
};
