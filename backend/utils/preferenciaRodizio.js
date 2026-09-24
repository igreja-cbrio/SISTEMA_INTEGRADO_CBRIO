/**
 * A ORDEM do seletor "Adicionar voluntário" (24/09/2026 · pedido do Marcos).
 *
 * Cada pessoa pode declarar a semana do mês que prefere servir
 * (`vol_profiles.rodizio_semana`, 1..4). Ao preencher uma vaga num culto da
 * semana N, quem prefere N vem primeiro; depois quem não declarou nada; por
 * último quem prefere OUTRA semana. Dentro de cada grupo, ordem alfabética.
 *
 * ⚠️⚠️ ORDENA, NUNCA FILTRA. Preferência não é indisponibilidade: quem prefere
 * o 1º domingo continua escalável no 3º — só aparece depois. Esconder faria o
 * líder achar que o time "não tem gente" quando tem.
 *
 * ⚠️ Culto sem semana (sem data, ou semana desconhecida) ⇒ ninguém "prefere
 * este": vira ordem alfabética pura, sem marcar `prefere_este_culto` em nada.
 */
function grupo(pessoa, semana) {
  if (semana == null) return 1;
  const pref = pessoa.rodizio_semana;
  if (pref == null) return 1;
  return Number(pref) === Number(semana) ? 0 : 2;
}

function ordenarPorPreferencia(pessoas, semana) {
  const sem = (semana == null || semana === '') ? null : Number(semana);
  return (pessoas || [])
    .map((p) => ({ ...p, prefere_este_culto: grupo(p, sem) === 0 }))
    .sort((a, b) => (
      grupo(a, sem) - grupo(b, sem)
      || String(a.full_name || '').localeCompare(String(b.full_name || ''), 'pt-BR', { sensitivity: 'base' })
    ));
}

module.exports = { ordenarPorPreferencia };
