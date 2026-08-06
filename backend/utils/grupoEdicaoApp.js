/**
 * Régua PURA da edição de grupo PELO APP (auditoria 06/08/2026 · Onda 1b).
 * Sem banco, sem rede, sem relógio → entra no gate de deploy.
 *
 * ⚠️⚠️ POR QUE UM ENDPOINT NOVO E NÃO O PUT DO WEB.
 * O `PUT /api/grupos/:id` (`routes/grupos.js`) é **update de OBJETO INTEIRO**,
 * não patch: ele escreve ~28 colunas e aplica DEFAULT quando a chave não vem no
 * body — `lider_id: d.lider_id || null`, `ativo: d.ativo ?? true`,
 * `temporada: || null`, `aceitando_inscricoes: d.aceitando_inscricoes !== false`.
 * Chamá-lo com os 9 campos da tela do app **apagaria a liderança, a temporada e
 * o estado de inscrição do grupo**. Por isso o app tem endpoint próprio, com
 * semântica de PATCH e allowlist curta.
 *
 * ⚠️ O que o app NUNCA pode mudar (e não está na allowlist): `lider_id` (é quem
 * recebe o WhatsApp do grupo · lei de 31/07), `supervisor_id`, `ativo` (o
 * interruptor de operação — o DELETE do web é justamente `ativo=false`),
 * `temporada`/`status_temporada`, `aceitando_inscricoes`, `modo_inscricao`,
 * `lat`/`lng`, `foto_url`, `codigo`, `area`, `capacidade`, `idade_min/max`.
 *
 * ⚠️ `categoria` é REGRA DE NEGÓCIO, não rótulo: `publicGrupos.js` usa
 * `categoria` pra a **trava de gênero** (Homens/Mulheres) e pra habilitar a
 * **inscrição de CASAL** (só em 'Casais'), e o filtro público compara valor
 * exato. Na tela do app ela é um `Input` de TEXTO LIVRE — um "casais" minúsculo
 * ou "Casal" desligaria silenciosamente a inscrição de casal do grupo. Aqui a
 * lista é FECHADA e o valor é normalizado pro canônico.
 *
 * ⚠️ `horario` é coluna `time` no banco e a tela manda texto livre ("19:30" é só
 * placeholder). Texto que não é hora vira erro de cast cru do Postgres — que a
 * pessoa lê como "não salvou" sem saber por quê. Aqui normaliza ("1930",
 * "19h30", "9:5" → "19:30"/"09:05") ou recusa com mensagem.
 */

// Espelho de `TIPOS_GRUPO` (src/pages/ministerial/Grupos.jsx). ⚠️ 'Conexao' é
// SEM acento no banco — é valor comparado, não texto exibido. Mudou lá, mude aqui.
const CATEGORIAS_GRUPO = [
  'Conexao', 'Estudo', 'Jornada 180', 'Discipulado',
  'Casais', 'Jovens', 'Mulheres', 'Homens', 'Misto',
];

// Campos que a tela `grupo-editar.tsx` do app grava — e SÓ eles.
const CAMPOS_EDITAVEIS_APP = [
  'nome', 'categoria', 'descricao', 'tema', 'dia_semana', 'horario', 'local', 'endereco', 'bairro',
];

// Mexer nestes muda o pino do mapa, que hoje NÃO é recalculado por nenhum save
// (nem no web). Serve pra avisar a coordenação em vez de deixar o pino errado.
const CAMPOS_DE_ENDERECO = ['endereco', 'bairro'];

function semAcento(v) {
  // \p{Diacritic} em vez de uma classe de caracteres combinantes literal: o
  // literal depende do encoding do arquivo e quebraria em silêncio se alguém
  // salvasse com outro (a comparação de categoria passaria a falhar).
  return String(v == null ? '' : v).normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function texto(v, max = 500) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
}

/** Categoria → valor canônico da lista fechada, ou `null` se não reconhecer. */
function normalizarCategoria(v) {
  const alvo = semAcento(v).trim().toLowerCase();
  if (!alvo) return null;
  return CATEGORIAS_GRUPO.find((c) => semAcento(c).toLowerCase() === alvo) || null;
}

/** "1930" · "19h30" · "19:30:00" · "9:5" → "HH:MM". `null` se não for hora. */
function normalizarHorario(v) {
  const bruto = String(v == null ? '' : v).trim();
  if (!bruto) return null;
  const digitos = bruto.replace(/\D/g, '');
  let h;
  let m;
  if (/^\d{1,2}:\d{1,2}/.test(bruto)) {
    const [hh, mm] = bruto.split(':');
    h = Number(hh); m = Number(mm.slice(0, 2));
  } else if (digitos.length === 4) {
    h = Number(digitos.slice(0, 2)); m = Number(digitos.slice(2));
  } else if (digitos.length === 3) {
    h = Number(digitos.slice(0, 1)); m = Number(digitos.slice(1));
  } else if (digitos.length <= 2 && digitos.length >= 1) {
    h = Number(digitos); m = 0;
  } else {
    return null;
  }
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Valida e normaliza o corpo da edição de grupo vinda do app.
 *
 * Semântica de **PATCH**: só entra no resultado a chave que VEIO no body — o que
 * não veio não é tocado (o oposto do PUT do web, que aplica default).
 *
 * @returns {{ erros: object, valores: object, mudouEndereco: boolean }}
 *   `erros` vazio = ok. `valores` = o que gravar. `mudouEndereco` = pediu pra
 *   mudar endereço/bairro (o chamador decide o que fazer com o pino do mapa).
 */
function validarEdicaoGrupoApp(body = {}) {
  const erros = {};
  const valores = {};
  const b = body || {};

  if ('nome' in b) {
    const nome = texto(b.nome, 200);
    // `mem_grupos.nome` é NOT NULL: string vazia aqui não é "não informado", é
    // erro — e sem esta guarda o UPDATE estouraria com 23502.
    if (!nome) erros.nome = 'O nome do grupo não pode ficar vazio.';
    else valores.nome = nome;
  }

  if ('categoria' in b) {
    const bruta = String(b.categoria == null ? '' : b.categoria).trim();
    if (!bruta) {
      valores.categoria = null; // limpar é edição legítima
    } else {
      const cat = normalizarCategoria(bruta);
      if (!cat) {
        erros.categoria = `Categoria inválida. Use uma destas: ${CATEGORIAS_GRUPO.join(', ')}.`;
      } else {
        valores.categoria = cat;
      }
    }
  }

  if ('dia_semana' in b) {
    const v = b.dia_semana;
    if (v === null || v === '' || v === undefined) {
      valores.dia_semana = null; // grupo diário/sem dia fixo
    } else {
      const n = Number(v);
      // ⚠️ Domingo é 0 e 0 é falsy: testar com `!n` jogaria todo grupo de
      // domingo em "sem dia" (a armadilha do `dia_semana = 0`, já documentada).
      if (!Number.isInteger(n) || n < 0 || n > 6) {
        erros.dia_semana = 'Dia da semana inválido.';
      } else {
        valores.dia_semana = n;
      }
    }
  }

  if ('horario' in b) {
    const bruto = String(b.horario == null ? '' : b.horario).trim();
    if (!bruto) {
      valores.horario = null;
    } else {
      const hora = normalizarHorario(bruto);
      if (!hora) erros.horario = 'Horário inválido. Use o formato 19:30.';
      else valores.horario = hora;
    }
  }

  for (const campo of ['descricao', 'tema', 'local', 'endereco', 'bairro']) {
    if (campo in b) valores[campo] = texto(b[campo], campo === 'descricao' ? 2000 : 500);
  }

  const mudouEndereco = CAMPOS_DE_ENDERECO.some((c) => c in b);
  return { erros, valores, mudouEndereco };
}

module.exports = {
  CATEGORIAS_GRUPO,
  CAMPOS_EDITAVEIS_APP,
  CAMPOS_DE_ENDERECO,
  normalizarCategoria,
  normalizarHorario,
  validarEdicaoGrupoApp,
};
