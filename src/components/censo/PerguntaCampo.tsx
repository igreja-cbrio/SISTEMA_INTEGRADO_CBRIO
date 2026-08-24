// Uma pergunta do censo → um campo. Todos os tipos que o motor conhece.
//
// Renderer PRÓPRIO do censo, não o NpsForm: aquele espera
// { pergunta_nps, perguntas_extras } e exige uma pergunta NPS. O censo é um
// array plano de 93 campos. O NPS está em produção e fica intocado.
//
// Estilo inline com a paleta pública (mesmo padrão de NpsForm/CadastroMembresia):
// a página é aberta por gente de fora, no celular, e não carrega o tema do ERP.
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import type { Pergunta } from '@/lib/censoForm';
import { NAO_SE_APLICA, alternarOpcao, ehNeutra } from '@/lib/censoForm';
import { usePublicPalette } from '@/pages/public/publicTheme';
import { mascaraCep } from '@/lib/cepAutopreenche';
import SeletorBairro from '@/components/ui/seletor-bairro';
import { BirthDatePicker } from '@/components/ui/birth-date-picker';
import { DatePicker } from '@/components/ui/date-picker';

type Props = {
  pergunta: Pergunta;
  valor: unknown;
  onChange: (valor: unknown) => void;
  faltando?: boolean;
  /** Busca no catálogo (igrejas do RJ, grupos ativos). Injetada pelo formulário
   *  para o campo não precisar conhecer a API. */
  buscarCatalogo?: (catalogo: string, q: string) => Promise<CatalogoItem[]>;
};

export type CatalogoItem = { valor: string; rotulo: string; detalhe?: string | null };

const TEAL = '#00B39D';

export default function PerguntaCampo({ pergunta: p, valor, onChange, faltando, buscarCatalogo }: Props) {
  const c = usePublicPalette();

  const base: CSSProperties = {
    width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 15,
    border: `1px solid ${faltando ? '#ef4444' : c.inputBorder}`,
    background: c.optionBg, color: c.text, boxSizing: 'border-box', fontFamily: 'inherit',
  };

  const opcaoBtn = (ativo: boolean, neutra = false): CSSProperties => ({
    padding: '11px 14px', borderRadius: 10, fontSize: 15, textAlign: 'left', width: '100%',
    cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color .12s, background .12s',
    border: `1px solid ${ativo ? TEAL : c.inputBorder}`,
    background: ativo ? `color-mix(in srgb, ${TEAL} 14%, ${c.optionBg})` : c.optionBg,
    color: ativo ? c.text : (neutra ? c.text3 : c.text2),
    fontStyle: neutra ? 'italic' : 'normal',
  });

  // ── escalas 1–5 ──
  if (p.tipo === 'escala_5' || p.tipo === 'estrelas_5') {
    const n = typeof valor === 'number' ? valor : null;
    const nsa = valor === NAO_SE_APLICA;
    const estrelas = p.tipo === 'estrelas_5';
    return (
      <div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((v) => {
            const ativo = estrelas ? n !== null && v <= n : n === v;
            return (
              <button
                key={v} type="button" onClick={() => onChange(v)}
                aria-label={estrelas ? `${v} de 5` : String(v)}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 10, fontSize: estrelas ? 20 : 16,
                  cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${ativo ? TEAL : (faltando ? '#ef4444' : c.inputBorder)}`,
                  background: ativo && !estrelas ? `color-mix(in srgb, ${TEAL} 16%, ${c.optionBg})` : c.optionBg,
                  color: ativo ? (estrelas ? '#f59e0b' : c.text) : c.text3,
                }}
              >
                {estrelas ? (ativo ? '★' : '☆') : v}
              </button>
            );
          })}
        </div>
        {(p.rotulos?.min || p.rotulos?.max) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: c.textDim }}>
            <span>{p.rotulos?.min}</span><span>{p.rotulos?.max}</span>
          </div>
        )}
        {/* Saída para quem a pergunta não alcança. Sem ela, quem nunca serviu
            seria obrigado a dar nota em "me sinto valorizado como voluntário" —
            e essa nota entraria na média dos voluntários. */}
        {p.permite_nao_se_aplica && (
          <button type="button" onClick={() => onChange(nsa ? null : NAO_SE_APLICA)}
            style={{ ...opcaoBtn(nsa, true), marginTop: 8 }}>
            {NAO_SE_APLICA}
          </button>
        )}
      </div>
    );
  }

  // ── NPS 0–10 ──
  if (p.tipo === 'nps') {
    const max = p.max ?? 10;
    const n = typeof valor === 'number' ? valor : null;
    const cor = (v: number) => (v <= 6 ? '#ef4444' : v <= 8 ? '#f59e0b' : '#10b981');
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(38px, 1fr))', gap: 6 }}>
        {Array.from({ length: max + 1 }, (_, v) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{
              padding: '12px 0', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${n === v ? cor(v) : (faltando ? '#ef4444' : c.inputBorder)}`,
              background: n === v ? cor(v) : c.optionBg,
              color: n === v ? '#fff' : c.text3, fontWeight: n === v ? 600 : 400,
            }}>
            {v}
          </button>
        ))}
      </div>
    );
  }

  // ── Sim/Não e escolha única ──
  // ⚠️ A marca NÃO é só a cor. O Matheus reportou "os dois ficam marcados"
  // quando um valor da paleta falhou e as duas moldura ficaram parecidas — com a
  // bolinha, marcado e desmarcado são inconfundíveis mesmo se o tema quebrar.
  // Vale também para quem não distingue as cores.
  if (p.tipo === 'sim_nao' || p.tipo === 'opcao_unica') {
    const opcoes = p.tipo === 'sim_nao' ? ['Sim', 'Não'] : (p.opcoes || []);
    const emLinha = p.tipo === 'sim_nao';
    return (
      <div style={{ display: emLinha ? 'flex' : 'grid', gap: 8 }}>
        {opcoes.map((o) => {
          const ativo = valor === o;
          return (
            <button key={o} type="button" onClick={() => onChange(o)}
              role="radio" aria-checked={ativo}
              style={{
                ...opcaoBtn(ativo, ehNeutra(p, o)),
                flex: emLinha ? 1 : undefined,
                display: 'flex', alignItems: 'center', gap: 10,
                justifyContent: emLinha ? 'center' : 'flex-start',
              }}>
              <span aria-hidden style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: `1px solid ${ativo ? TEAL : c.inputBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {ativo && <span style={{ width: 10, height: 10, borderRadius: '50%', background: TEAL }} />}
              </span>
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  // ── múltipla escolha ──
  if (p.tipo === 'multipla') {
    const marcadas = Array.isArray(valor) ? valor.map(String) : [];
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {(p.opcoes || []).map((o) => {
          const ativo = marcadas.includes(o);
          return (
            <button key={o} type="button" onClick={() => onChange(alternarOpcao(p, marcadas, o))}
              style={{ ...opcaoBtn(ativo, ehNeutra(p, o)), display: 'flex', alignItems: 'center', gap: 10 }}>
              <span aria-hidden style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: `1px solid ${ativo ? TEAL : c.inputBorder}`,
                background: ativo ? TEAL : 'transparent', color: '#fff',
                fontSize: 12, lineHeight: '17px', textAlign: 'center',
              }}>{ativo ? '✓' : ''}</span>
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  if (p.tipo === 'busca') {
    return (
      <CampoBusca pergunta={p} valor={valor} onChange={onChange} faltando={faltando}
        buscar={buscarCatalogo} />
    );
  }

  if (p.tipo === 'texto_longo') {
    return (
      <textarea rows={4} style={{ ...base, resize: 'vertical' }}
        value={typeof valor === 'string' ? valor : ''}
        onChange={(e) => onChange(e.target.value)} />
    );
  }

  if (p.tipo === 'data') {
    // ⚠️ NÃO usar <input type="date"> — é convenção do repo (DatePicker /
    // BirthDatePicker), criada depois de o seletor nativo dar problema nas
    // inscrições de grupos. No celular do Matheus ele aparecia como um
    // retângulo cinza sem texto. `preenche_de: 'data_nascimento'` marca a
    // pergunta de nascimento, que ganha o seletor com dropdown de ano.
    const ehNascimento = p.preenche_de === 'data_nascimento' || /nascimento/i.test(p.texto);
    const iso = typeof valor === 'string' ? valor : '';
    return ehNascimento ? (
      <BirthDatePicker value={iso} onChange={onChange}
        placeholder="Selecione a data" aria-invalid={faltando || undefined} />
    ) : (
      <DatePicker value={iso} onChange={onChange} placeholder="Selecione a data" />
    );
  }

  if (p.tipo === 'numero') {
    return (
      <input type="number" inputMode="numeric" style={base}
        min={p.min_num ?? 0} max={p.max_num ?? 99}
        value={valor === null || valor === undefined ? '' : String(valor)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    );
  }

  // ── bairro · lista validada ──
  // ⚠️ Decidido por `preenche_de`, NUNCA pelo enunciado — mesma régua do
  // `ehNascimento` acima. Casar por texto ("a pergunta que fala em bairro?")
  // quebraria assim que alguém reescrevesse a pergunta no construtor.
  // ⚠️ O CEP já preenchia este campo (o `aplicarEndereco` do CensoForm); o que
  // faltava era a lista, e sem ela cada resposta inventava uma grafia.
  if (p.preenche_de === 'bairro') {
    return (
      <SeletorBairro
        value={typeof valor === 'string' ? valor : ''}
        onChange={onChange}
        atalhos={6}
        placeholder="Digite ou escolha"
      />
    );
  }

  // ── texto curto, com máscara por formato ──
  const formato = p.formato || 'texto';
  return (
    <input
      style={base}
      type={formato === 'email' ? 'email' : 'text'}
      inputMode={formato === 'telefone' || formato === 'cep' ? 'numeric' : formato === 'email' ? 'email' : 'text'}
      autoComplete={formato === 'email' ? 'email' : formato === 'telefone' ? 'tel' : formato === 'cep' ? 'postal-code' : 'off'}
      placeholder={formato === 'instagram' ? '@seuperfil'
        : formato === 'telefone' ? '(21) 99999-9999'
        : formato === 'cep' ? '00000-000' : ''}
      value={typeof valor === 'string' ? valor : ''}
      onChange={(e) => {
        let v = e.target.value;
        // Máscara de telefone digitando: o backend normaliza de novo, isto é só
        // para a pessoa conferir o número que digitou.
        if (formato === 'telefone') {
          const d = v.replace(/\D/g, '').slice(0, 11);
          v = d.length <= 2 ? d
            : d.length <= 6 ? `(${d.slice(0, 2)}) ${d.slice(2)}`
            : d.length <= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
            : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
        }
        if (formato === 'instagram') v = v.replace(/\s/g, '');
        // O CEP é o gatilho do preenchimento automático: quem consulta e
        // espalha endereço/bairro/cidade é o CensoForm, que tem a lista de
        // perguntas e o mapa de respostas. Aqui só a máscara.
        if (formato === 'cep') v = mascaraCep(v);
        onChange(v);
      }}
    />
  );
}

/**
 * Lista longa com busca (igrejas do RJ, grupos ativos).
 *
 * Três decisões que vêm do uso real:
 *  · SEMPRE aceita o que a pessoa digitou. A lista de igrejas vem do
 *    OpenStreetMap: é grande (1.911) mas incompleta, e lista incompleta sem
 *    escape faz a pessoa responder qualquer coisa para poder avançar.
 *  · busca no SERVIDOR, com espera de 300ms. Mandar 1.911 igrejas para cada
 *    aparelho no culto seria pior que a busca.
 *  · o valor guardado é o TEXTO, não um id: é o que o gráfico e a exportação
 *    leem, e o catálogo pode mudar sem invalidar resposta já coletada.
 */
function CampoBusca({ pergunta: p, valor, onChange, faltando, buscar }: {
  pergunta: Pergunta; valor: unknown; onChange: (v: unknown) => void;
  faltando?: boolean; buscar?: (catalogo: string, q: string) => Promise<CatalogoItem[]>;
}) {
  const c = usePublicPalette();
  const escolhido = typeof valor === 'string' ? valor : '';
  const [termo, setTermo] = useState('');
  const [itens, setItens] = useState<CatalogoItem[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto || termo.trim().length < 2 || !buscar || !p.catalogo) { setItens([]); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      buscar(p.catalogo!, termo.trim())
        .then((r) => setItens(r || []))
        .catch(() => setItens([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => { clearTimeout(t); setBuscando(false); };
  }, [termo, aberto, p.catalogo, buscar]);

  const inp: CSSProperties = {
    width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 15,
    border: `1px solid ${faltando ? '#ef4444' : c.inputBorder}`,
    background: c.optionBg, color: c.text, boxSizing: 'border-box', fontFamily: 'inherit',
  };

  // Já escolheu: mostra a escolha com um jeito claro de trocar.
  if (escolhido && !aberto) {
    return (
      <div style={{ ...inp, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{escolhido}</span>
        <button type="button" onClick={() => { setAberto(true); setTermo(''); }}
          style={{
            background: 'none', border: 'none', color: TEAL, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', padding: 0, flexShrink: 0,
          }}>
          trocar
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        style={inp}
        value={termo}
        autoComplete="off"
        placeholder={p.catalogo === 'grupos_ativos'
          ? 'Digite o nome do grupo ou do líder' : 'Digite o nome da igreja'}
        onFocus={() => setAberto(true)}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
      />

      {/* ⚠️ A saída tem que estar VISÍVEL antes de digitar. O escape "usar
          <termo>" só existe a partir de 2 caracteres, então quem não lembra o
          nome exato do grupo via um campo de busca sem alternativa nenhuma e
          simplesmente pulava — medido no Censo 2026: das 10 pessoas que disseram
          participar de um Grupo, 3 não disseram qual, e o mesmo em "Qual era a
          igreja?" (3 de 8). É o único atrito real do questionário, e são
          justamente as 2 perguntas opcionais. */}
      {p.permite_outro !== false && termo.trim().length < 2 && (
        <div style={{ marginTop: 6, fontSize: 12, color: c.textDim }}>
          {p.catalogo === 'grupos_ativos'
            ? 'Não achou na lista? Escreva do jeito que vocês chamam o grupo.'
            : 'Não achou na lista? Escreva do jeito que você chama a igreja.'}
        </div>
      )}

      {aberto && termo.trim().length >= 2 && (
        <div style={{
          marginTop: 6, borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${c.inputBorder}`, background: c.optionBg,
        }}>
          {buscando && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: c.textDim }}>Procurando…</div>
          )}
          {!buscando && itens.map((i) => (
            <button key={i.valor} type="button"
              onClick={() => { onChange(i.valor); setAberto(false); setTermo(''); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                background: 'none', border: 'none', borderBottom: `1px solid ${c.inputBorder}`,
                color: c.text, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {i.rotulo}
              {i.detalhe && (
                <span style={{ display: 'block', fontSize: 12, color: c.textDim, marginTop: 2 }}>
                  {i.detalhe}
                </span>
              )}
            </button>
          ))}
          {/* O escape. Sem ele, quem não acha a própria igreja inventa uma. */}
          {!buscando && p.permite_outro !== false && (
            <button type="button"
              onClick={() => { onChange(termo.trim()); setAberto(false); setTermo(''); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                background: 'none', border: 'none', color: c.text2, fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit', fontStyle: 'italic',
              }}>
              {itens.length ? 'Não é nenhuma dessas — usar ' : 'Usar '}
              “{termo.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
