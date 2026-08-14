// ============================================================================
// MarcadoresJornada · a linha de flags de jornada ao lado do nome
// ============================================================================
// Componente ÚNICO usado pela Membresia (lista + ficha), pela aba Pessoas do
// /grupos e pelo Voluntariado — três telas com a mesma pergunta ("em que etapa
// da jornada esta pessoa está?") não podem responder de jeitos diferentes.
//
// Cor/rótulo vêm de `lib/jornadaMarcadores`; QUEM pode ver cada marcador é
// decidido no servidor (o payload já chega filtrado).
// ============================================================================

import {
  MARCADOR_UI, ORDEM_MARCADORES, TEXTO_SEM_MARCADOR,
  type ChaveMarcador, type Marcadores,
} from '../lib/jornadaMarcadores';

interface Props {
  marcadores?: Marcadores | null;
  /** `lista` = siglas compactas · `ficha` = rótulo por extenso. */
  variante?: 'lista' | 'ficha';
  /** Mostra "—" quando não há nenhum marcador (em lista, evita linha vazia). */
  mostrarVazio?: boolean;
  /** Alguns sinais não puderam ser lidos nesta resposta (ver nota abaixo). */
  indisponiveis?: string[] | null;
}

export default function MarcadoresJornada({
  marcadores, variante = 'lista', mostrarVazio = true, indisponiveis,
}: Props) {
  const chaves = (marcadores?.chaves || []).filter(
    (c): c is ChaveMarcador => !!MARCADOR_UI[c as ChaveMarcador],
  );
  const ordenadas = ORDEM_MARCADORES.filter((c) => chaves.includes(c));
  const detalhes = marcadores?.detalhes || {};
  const ficha = variante === 'ficha';

  // ⚠️ Sinal que FALHOU não pode se disfarçar de "a pessoa não fez". Quando o
  // servidor declara indisponibilidade, a tela diz — ausência silenciosa aqui
  // vira afirmação errada sobre uma pessoa. O backend carimba a lista dentro do
  // próprio payload (endpoints que respondem array cru não têm campo de topo).
  const falhou = (indisponiveis || marcadores?.indisponiveis || []).filter(Boolean);

  if (!ordenadas.length && !falhou.length) {
    if (!mostrarVazio) return null;
    return (
      <span
        title={TEXTO_SEM_MARCADOR}
        style={{ fontSize: ficha ? 12 : 11, color: 'var(--cbrio-text3)' }}
      >
        {ficha ? TEXTO_SEM_MARCADOR : '—'}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {ordenadas.map((c) => {
        const ui = MARCADOR_UI[c];
        const det = detalhes[c];
        return (
          <span
            key={c}
            title={det ? `${ui.ajuda} (${det})` : ui.ajuda}
            style={{
              fontSize: ficha ? 11 : 9,
              padding: ficha ? '3px 8px' : '2px 6px',
              borderRadius: 4,
              background: ui.fundo,
              color: ui.cor,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {ficha ? ui.label : ui.curto}
            {det ? <span style={{ fontWeight: 500, opacity: 0.85 }}> · {det}</span> : null}
          </span>
        );
      })}
      {falhou.length > 0 && (
        <span
          title={
            'Não foi possível carregar parte dos marcadores nesta consulta '
            + `(${falhou.join(', ')}). A ausência de flag aqui NÃO significa que a pessoa não fez.`
          }
          style={{
            fontSize: ficha ? 11 : 9, padding: '2px 6px', borderRadius: 4,
            background: '#fef3c7', color: '#92400e', fontWeight: 700, whiteSpace: 'nowrap',
          }}
        >
          ⚠ incompleto
        </span>
      )}
    </span>
  );
}
