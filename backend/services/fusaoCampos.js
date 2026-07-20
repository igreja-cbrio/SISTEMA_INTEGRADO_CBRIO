// Fusão "melhor de cada" — helper compartilhado pelas 3 telas de dedup de
// pessoas (Entradas, Membresia, Grupos). O merge_membros mantém um cadastro e
// só preenche os campos VAZIOS a partir do absorvido; quando os cadastros
// DIVERGEM num campo (ex.: um tem o nome completo, o outro o CPF), o operador
// escolhe qual valor vence e manda em `campos`. Aqui montamos o patch que fixa
// esses campos no mantido DEPOIS da fusão (os absorvidos já foram removidos,
// então não há colisão de UNIQUE de CPF com o próprio par). Normaliza no padrão
// da casa (Contrato de porta): cpf/telefone digits-only, e-mail lower/trim.
const CAMPOS_FUSAO_PERMITIDOS = ['nome', 'telefone', 'email', 'cpf', 'data_nascimento', 'genero'];

function montarPatchFusao(campos) {
  const patch = {};
  if (!campos || typeof campos !== 'object') return patch;
  for (const k of CAMPOS_FUSAO_PERMITIDOS) {
    if (!(k in campos)) continue;
    let v = campos[k];
    if (v === null || v === undefined) continue;
    v = String(v).trim();
    if (!v) continue;
    if (k === 'cpf' || k === 'telefone') v = v.replace(/\D/g, '');
    else if (k === 'email') v = v.toLowerCase();
    patch[k] = v;
  }
  return patch;
}

module.exports = { CAMPOS_FUSAO_PERMITIDOS, montarPatchFusao };
