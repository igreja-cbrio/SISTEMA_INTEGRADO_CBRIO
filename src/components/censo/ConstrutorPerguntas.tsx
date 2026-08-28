// Construtor de perguntas do censo.
//
// ⚠️ A REGRA QUE MANDA AQUI: o `id` de uma pergunta é IMUTÁVEL. Ele é a coluna
// da resposta no banco (`cen_resposta_item.pergunta_id`) e a chave do gráfico.
// Se o id mudar, as respostas já coletadas viram órfãs e aquele gráfico zera —
// sem erro na tela, só um número que some. Por isso o id NUNCA é derivado do
// texto depois da primeira gravação: editar o texto de uma pergunta é seguro,
// e é o servidor que preserva o id que chega.
//
// A segunda regra: pergunta condicional só pode depender de uma pergunta
// ANTERIOR. O seletor abaixo só oferece as anteriores, e o servidor recusa o
// resto — condicional que aponta para frente é campo que nunca aparece.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, Save, Loader2,
  Heading, Copy, AlertTriangle, Lock, GripVertical,
} from 'lucide-react';
import type { Pergunta } from '@/lib/censoConstrutor';
import {
  trocarTipoPergunta, renomearOpcao, moverPergunta, indiceApos,
  removerPerguntas, selecionadasComResposta, moverOpcao,
} from '@/lib/censoConstrutor';
import { velocidadeAutoScroll, containerDeScroll, podeRolar } from '@/lib/autoScrollArrasto';
import { DESTINO_CADASTRO_LABEL, DESTINO_NENHUM } from '@/lib/censoDestinos';

export type { Pergunta };

const TIPO_LABEL: Record<string, string> = {
  secao: 'Seção (cabeçalho)',
  texto_curto: 'Texto curto',
  texto_longo: 'Texto longo',
  data: 'Data',
  numero: 'Número',
  escala_5: 'Escala 1–5 (concordância)',
  estrelas_5: 'Estrelas 1–5 (nota)',
  nps: 'NPS 0–10',
  sim_nao: 'Sim / Não',
  opcao_unica: 'Escolha única',
  multipla: 'Escolha múltipla',
};
const COM_OPCOES = ['opcao_unica', 'multipla'];
const ESCALAS = ['escala_5', 'estrelas_5'];
const CUIDADO_LABEL: Record<string, string> = {
  familiar: 'Acompanhamento familiar',
  aconselhamento: 'Aconselhamento',
  oracao: 'Contato para oração',
  conversa: 'Conversar com alguém',
};
const FORMATO_LABEL: Record<string, string> = {
  texto: 'Texto comum', telefone: 'Telefone (com máscara)',
  email: 'E-mail (validado)', instagram: 'Instagram (@)',
  // Preenche endereço, bairro e cidade das perguntas com `preenche_de`.
  cep: 'CEP (preenche o endereço)',
};

type Props = {
  perguntas: Pergunta[];
  /** Quantas respostas a pesquisa já tem — muda o que é seguro editar. */
  respostas: number;
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (perguntas: Pergunta[]) => void;
};

export default function ConstrutorPerguntas({ perguntas, respostas, podeEditar, salvando, onSalvar }: Props) {
  const [lista, setLista] = useState<Pergunta[]>(perguntas);
  const [aberta, setAberta] = useState<number | null>(null);

  const sujo = useMemo(() => JSON.stringify(lista) !== JSON.stringify(perguntas), [lista, perguntas]);
  const respondiveis = lista.filter((p) => p.tipo !== 'secao').length;

  function mudar(i: number, patch: Partial<Pergunta>) {
    setLista((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  function trocarTipo(i: number, tipo: string) {
    setLista((l) => l.map((q, j) => (j === i ? trocarTipoPergunta(q, tipo) : q)));
  }

  // Caminho ÚNICO de reordenação: os botões subir/descer e o arrastar chamam
  // daqui. Duas cópias da regra divergiriam, e é ela que protege a condicional.
  function reordenar(de: number, para: number) {
    const r = moverPergunta(lista, de, para);
    if (r.erro) { alert(r.erro); return; }
    if (r.lista === lista) return;
    setLista(r.lista);
    setAberta(indiceApos(aberta, de, Math.max(0, Math.min(lista.length - 1, para))));
    // ⚠️ A seleção é por ÍNDICE: depois de reordenar ela apontaria para outras
    // perguntas, e o "apagar selecionadas" apagaria as erradas.
    setSelecao([]);
  }

  function mover(i: number, dir: -1 | 1) {
    reordenar(i, i + dir);
  }

  // ── arrastar (HTML5 · sem dependência nova, como o Planner do Marketing) ──
  // ⚠️ O arrastar NÃO substitui subir/descer: drag do HTML5 não funciona no
  // TOQUE (celular/tablet) e não é alcançável por teclado. Os botões continuam
  // sendo o caminho acessível; a alça é conveniência para quem usa mouse.
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const refLista = useRef<HTMLDivElement | null>(null);

  function aoSoltar(i: number) {
    if (arrastando !== null && arrastando !== i) reordenar(arrastando, i);
    setArrastando(null);
    setAlvo(null);
  }

  // ── rolagem automática ao arrastar para as bordas ─────────────────────────
  // Com muitas perguntas, o destino fica fora da tela e o arrasto do HTML5 não
  // rola nada sozinho — sem isto não há como levar a primeira pergunta para o
  // fim de uma lista longa.
  //
  // ⚠️ O `dragover` é ouvido no DOCUMENTO, não nas linhas: junto à borda da
  // janela o ponteiro pode estar sobre área sem linha nenhuma, e aí o evento da
  // linha nunca chega. No documento ele chega sempre (o evento borbulha de
  // qualquer elemento sob o ponteiro).
  useEffect(() => {
    if (arrastando === null) return;

    let frame = 0;
    let y = 0;
    const alvoScroll = containerDeScroll(refLista.current);

    const aoMover = (e: DragEvent) => { y = e.clientY; };
    // `passive: true` de propósito: aqui só LEMOS a posição. Quem chama
    // preventDefault (necessário para permitir o drop) é o handler da linha —
    // fazer isso no documento marcaria a página inteira como área de soltura.
    document.addEventListener('dragover', aoMover, { passive: true, capture: true });

    const passo = () => {
      const delta = velocidadeAutoScroll(y, window.innerHeight);
      if (podeRolar(alvoScroll, delta)) {
        if (alvoScroll) alvoScroll.scrollTop += delta;
        else window.scrollBy(0, delta);
      }
      frame = requestAnimationFrame(passo);
    };
    frame = requestAnimationFrame(passo);

    // ⚠️ Limpeza obrigatória: um rAF vazado continuaria rolando a página depois
    // do arrasto, e o efeito também roda no desmonte da tela (trocar de aba no
    // meio de um arrasto).
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('dragover', aoMover, { capture: true });
    };
  }, [arrastando]);

  function adicionar(tipo: string) {
    setLista((l) => [...l, tipo === 'secao'
      ? { tipo: 'secao', texto: 'Novo bloco' }
      : { tipo, texto: '', obrigatoria: true, ...(COM_OPCOES.includes(tipo) ? { opcoes: ['Opção 1', 'Opção 2'] } : {}) }]);
    setAberta(lista.length);
  }

  function remover(i: number) {
    const p = lista[i];
    const dependentes = lista.filter((q) => q.mostrar_se?.pergunta && q.mostrar_se.pergunta === p.id);
    if (dependentes.length) {
      alert(`Não é possível remover: ${dependentes.length} pergunta(s) dependem desta (${dependentes.map((d) => d.texto).join(', ')}). Remova a condicional delas primeiro.`);
      return;
    }
    if (p.id && respostas > 0 && !confirm('Esta pesquisa já tem respostas. Remover a pergunta esconde as respostas dela dos gráficos. Continuar?')) return;
    setLista((l) => l.filter((_, j) => j !== i));
    setAberta(null);
    setSelecao([]);   // os índices seguintes deslizaram
  }

  // ── seleção múltipla ──────────────────────────────────────────────────────
  // Guarda os ÍNDICES, e por isso é limpa a cada mudança de ordem ou remoção:
  // índice guardado depois de reordenar aponta para outra pergunta, e aí o
  // "apagar selecionadas" apagaria as erradas. Chave por id não serve — pergunta
  // nova ainda não tem id (o servidor gera).
  const [selecao, setSelecao] = useState<number[]>([]);
  const selecionadas = new Set(selecao);

  function alternar(i: number) {
    setSelecao((s) => (s.includes(i) ? s.filter((j) => j !== i) : [...s, i]));
  }

  function apagarSelecionadas() {
    const r = removerPerguntas(lista, selecao);
    if (r.erro) { alert(r.erro); return; }
    if (r.lista === lista) return;

    // ⚠️ UMA confirmação com o total, não uma por pergunta — lição do lote de
    // aprovação da membresia: N diálogos iguais viram cliques automáticos.
    const gravadas = selecionadasComResposta(lista, selecao);
    if (gravadas > 0 && respostas > 0 && !confirm(
      `Esta pesquisa já tem ${respostas} resposta(s). Apagar ${gravadas} pergunta(s) já gravada(s) esconde as respostas delas dos gráficos. Continuar?`,
    )) return;

    setLista(r.lista);
    setSelecao([]);
    setAberta(null);
  }

  function duplicar(i: number) {
    const p = lista[i];
    // Sem `id`: a cópia PRECISA de id novo, senão as duas disputariam a mesma
    // coluna de resposta.
    const copia: Pergunta = { ...p, id: undefined, texto: `${p.texto} (cópia)` };
    setLista((l) => [...l.slice(0, i + 1), copia, ...l.slice(i + 1)]);
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold">Perguntas</h3>
            <p className="text-sm text-muted-foreground">
              {respondiveis} pergunta(s) · {lista.filter((p) => p.tipo === 'secao').length} bloco(s)
            </p>
          </div>
          {podeEditar && sujo && (
            <Button onClick={() => onSalvar(lista)} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar perguntas
            </Button>
          )}
        </div>

        {respostas > 0 && (
          <p className="text-xs text-amber-600 flex items-start gap-1.5">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            Esta pesquisa já tem {respostas} resposta(s). Editar o texto é seguro; trocar o
            tipo ou remover perguntas afeta o que já foi respondido.
          </p>
        )}

        {lista.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma pergunta ainda. Comece por um bloco e depois adicione as perguntas dele.
          </p>
        )}

        {podeEditar && selecao.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
            <span className="text-sm font-medium">
              {selecao.length} pergunta(s) selecionada(s)
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelecao([])}>
                Limpar seleção
              </Button>
              <Button variant="destructive" size="sm" onClick={apagarSelecionadas}>
                <Trash2 className="h-4 w-4 mr-1" />
                Apagar selecionadas
              </Button>
            </div>
          </div>
        )}

        <div ref={refLista} className="space-y-2">
          {lista.map((p, i) => {
            const anteriores = lista.slice(0, i).filter((q) => q.tipo !== 'secao' && q.id);
            const dep = p.mostrar_se?.pergunta
              ? lista.find((q) => q.id === p.mostrar_se?.pergunta) : null;
            const expandida = aberta === i;

            return (
              <div key={p.id || `novo-${i}`}
                onDragOver={podeEditar ? (e) => { e.preventDefault(); setAlvo(i); } : undefined}
                onDragLeave={podeEditar ? () => setAlvo((a) => (a === i ? null : a)) : undefined}
                onDrop={podeEditar ? (e) => { e.preventDefault(); aoSoltar(i); } : undefined}
                className={`rounded-lg border transition-colors ${
                  p.tipo === 'secao' ? 'border-primary/30 bg-primary/5' : 'border-border'
                } ${arrastando === i ? 'opacity-40' : ''} ${
                  alvo === i && arrastando !== null && arrastando !== i ? 'ring-2 ring-primary' : ''
                }`}>
                {/* cabeçalho da linha */}
                <div className="flex items-center gap-2 p-3">
                  {podeEditar && (
                    <input
                      type="checkbox"
                      checked={selecionadas.has(i)}
                      onChange={() => alternar(i)}
                      title="Selecionar para apagar em lote"
                      aria-label={`Selecionar “${p.texto || 'sem texto'}”`}
                      className="shrink-0 size-4 accent-primary cursor-pointer"
                    />
                  )}
                  {podeEditar && (
                    /* A alça é o que arrasta — não a linha inteira. A linha tem um
                       botão que expande a edição, e deixar os dois no mesmo gesto
                       fazia o clique virar arrasto por acidente. */
                    <span
                      draggable
                      onDragStart={(e) => { setArrastando(i); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                      title="Arraste para reordenar"
                      aria-hidden="true"
                      className="shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground/60 hover:text-foreground"
                    >
                      <GripVertical className="size-4" />
                    </span>
                  )}
                  <button type="button" onClick={() => setAberta(expandida ? null : i)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0">
                    {expandida ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                    {p.tipo === 'secao' && <Heading className="size-3.5 shrink-0 text-primary" />}
                    <span className={`truncate ${p.tipo === 'secao' ? 'font-semibold' : ''}`}>
                      {p.texto || <span className="text-muted-foreground italic">sem texto</span>}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0 hidden sm:inline">
                      {p.tipo}
                    </span>
                    {p.sensivel && <Badge variant="secondary" className="bg-rose-500/15 text-rose-600 shrink-0">sensível</Badge>}
                    {p.acao === 'cuidado' && <Badge variant="secondary" className="bg-sky-500/15 text-sky-600 shrink-0">cuidado</Badge>}
                    {dep && <Badge variant="secondary" className="shrink-0 hidden md:inline-flex">se “{dep.texto}”</Badge>}
                  </button>
                  {podeEditar && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Subir">
                        <ChevronUp className="size-4" />
                      </button>
                      <button type="button" onClick={() => mover(i, 1)} disabled={i === lista.length - 1}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Descer">
                        <ChevronDown className="size-4" />
                      </button>
                      <button type="button" onClick={() => duplicar(i)}
                        className="p-1 text-muted-foreground hover:text-foreground" title="Duplicar">
                        <Copy className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => remover(i)}
                        className="p-1 text-muted-foreground hover:text-red-600" title="Remover">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* edição */}
                {expandida && (
                  <div className="border-t border-border p-4 space-y-3">
                    {p.id && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Lock className="size-3" />
                        id <code className="font-mono">{p.id}</code> — não muda, é a coluna da resposta no banco
                      </p>
                    )}

                    <Campo label={p.tipo === 'secao' ? 'Título do bloco' : 'Pergunta'}>
                      <Textarea rows={2} value={p.texto} disabled={!podeEditar}
                        onChange={(e) => mudar(i, { texto: e.target.value })} />
                    </Campo>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo label="Tipo">
                        <Select value={p.tipo} disabled={!podeEditar} onValueChange={(v) => trocarTipo(i, v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(TIPO_LABEL).map(([v, l]) => (
                              <SelectItem key={v} value={v}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Campo>

                      {p.tipo !== 'secao' && (
                        <Campo label="Preenchimento">
                          <Select value={p.obrigatoria ? 'sim' : 'nao'} disabled={!podeEditar}
                            onValueChange={(v) => mudar(i, { obrigatoria: v === 'sim' })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sim">Obrigatória</SelectItem>
                              <SelectItem value="nao">Opcional</SelectItem>
                            </SelectContent>
                          </Select>
                        </Campo>
                      )}
                    </div>

                    <Campo label="Texto de apoio" ajuda="Opcional. Aparece em cinza abaixo da pergunta.">
                      <Input value={p.descricao || ''} disabled={!podeEditar}
                        onChange={(e) => mudar(i, { descricao: e.target.value || undefined })} />
                    </Campo>

                    {/* opções */}
                    {COM_OPCOES.includes(p.tipo) && (
                      <Opcoes pergunta={p} podeEditar={podeEditar} onMudar={(patch) => mudar(i, patch)} />
                    )}

                    {/* escalas */}
                    {ESCALAS.includes(p.tipo) && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Campo label="Rótulo do 1">
                            <Input value={p.rotulos?.min || ''} disabled={!podeEditar}
                              placeholder={p.tipo === 'estrelas_5' ? 'Muito ruim' : 'Discordo totalmente'}
                              onChange={(e) => mudar(i, { rotulos: { ...p.rotulos, min: e.target.value } })} />
                          </Campo>
                          <Campo label="Rótulo do 5">
                            <Input value={p.rotulos?.max || ''} disabled={!podeEditar}
                              placeholder={p.tipo === 'estrelas_5' ? 'Excelente' : 'Concordo totalmente'}
                              onChange={(e) => mudar(i, { rotulos: { ...p.rotulos, max: e.target.value } })} />
                          </Campo>
                        </div>
                        <Marcar label='Oferecer "Não se aplica"'
                          ajuda="Para quem a pergunta não alcança. Fica fora das médias, em vez de virar nota inventada."
                          valor={p.permite_nao_se_aplica === true} disabled={!podeEditar}
                          onMudar={(v) => mudar(i, { permite_nao_se_aplica: v || undefined })} />
                      </>
                    )}

                    {p.tipo === 'numero' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Campo label="Mínimo">
                          <Input type="number" value={p.min_num ?? 0} disabled={!podeEditar}
                            onChange={(e) => mudar(i, { min_num: Number(e.target.value) })} />
                        </Campo>
                        <Campo label="Máximo">
                          <Input type="number" value={p.max_num ?? 99} disabled={!podeEditar}
                            onChange={(e) => mudar(i, { max_num: Number(e.target.value) })} />
                        </Campo>
                      </div>
                    )}

                    {p.tipo === 'texto_curto' && (
                      <Campo label="Formato" ajuda="Aplica máscara e validação no formulário.">
                        <Select value={p.formato || 'texto'} disabled={!podeEditar}
                          onValueChange={(v) => mudar(i, { formato: v === 'texto' ? undefined : v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(FORMATO_LABEL).map(([v, l]) => (
                              <SelectItem key={v} value={v}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Campo>
                    )}

                    {/* condicional */}
                    {p.tipo !== 'secao' && (
                      <Condicional pergunta={p} anteriores={anteriores} podeEditar={podeEditar}
                        onMudar={(patch) => mudar(i, patch)} />
                    )}

                    {/* ⚠️ Destino no cadastro. Sem isto configurado a resposta
                        vive SÓ no censo: aparece no gráfico e não chega na ficha
                        da pessoa. Foi assim que Escolaridade e CEP ficaram
                        semanas sendo coletados e descartados em silêncio. */}
                    {p.tipo !== 'secao' && (
                      <Campo
                        label="Guardar no cadastro da pessoa"
                        ajuda="Preenche o campo na ficha da Membresia quando ele estiver VAZIO. Valor diferente do que já existe nunca é sobrescrito — vira conflito para a equipe decidir."
                      >
                        <Select
                          value={p.preenche_de || DESTINO_NENHUM}
                          disabled={!podeEditar}
                          onValueChange={(v) => mudar(i, { preenche_de: v === DESTINO_NENHUM ? undefined : v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={DESTINO_NENHUM}>Não guardar (só no censo)</SelectItem>
                            {Object.entries(DESTINO_CADASTRO_LABEL).map(([v, l]) => (
                              <SelectItem key={v} value={v}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Campo>
                    )}

                    {/* marcas especiais */}
                    {p.tipo !== 'secao' && (
                      <div className="space-y-2 pt-1">
                        <Marcar label="Dado sensível"
                          ajuda="Saúde emocional, casamento e afins. O agregado fica visível para todos, mas a resposta com NOME só para a equipe de cuidado."
                          valor={p.sensivel === true} disabled={!podeEditar}
                          onMudar={(v) => mudar(i, { sensivel: v || undefined })} />

                        {p.tipo === 'sim_nao' && (
                          <Marcar label="É um pedido de ajuda (gatilho de cuidado)"
                            ajuda="Não vira gráfico: vira linha na fila de Cuidado, com responsável e status."
                            valor={p.acao === 'cuidado'} disabled={!podeEditar}
                            onMudar={(v) => mudar(i, {
                              acao: v ? 'cuidado' : undefined,
                              cuidado_tipo: v ? (p.cuidado_tipo || 'oracao') : undefined,
                            })} />
                        )}
                        {p.acao === 'cuidado' && (
                          <Campo label="Tipo do pedido">
                            <Select value={p.cuidado_tipo || 'oracao'} disabled={!podeEditar}
                              onValueChange={(v) => mudar(i, { cuidado_tipo: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(CUIDADO_LABEL).map(([v, l]) => (
                                  <SelectItem key={v} value={v}>{l}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Campo>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {podeEditar && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => adicionar('secao')}>
              <Heading className="h-4 w-4 mr-1" /> Novo bloco
            </Button>
            {['texto_curto', 'texto_longo', 'opcao_unica', 'multipla', 'sim_nao', 'escala_5', 'estrelas_5', 'nps', 'data', 'numero'].map((t) => (
              <Button key={t} variant="ghost" size="sm" onClick={() => adicionar(t)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> {TIPO_LABEL[t]}
              </Button>
            ))}
          </div>
        )}

        {podeEditar && sujo && (
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={() => onSalvar(lista)} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar perguntas
            </Button>
            <Button variant="ghost" onClick={() => { setLista(perguntas); setAberta(null); }} disabled={salvando}>
              Descartar mudanças
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Campo({ label, ajuda, children }: { label: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
      {ajuda && <p className="text-[11px] text-muted-foreground mt-1">{ajuda}</p>}
    </div>
  );
}

function Marcar({ label, ajuda, valor, disabled, onMudar }:
{ label: string; ajuda?: string; valor: boolean; disabled?: boolean; onMudar: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" checked={valor} disabled={disabled} className="mt-0.5 size-4 accent-primary"
        onChange={(e) => onMudar(e.target.checked)} />
      <span className="text-xs">
        <span className="font-medium">{label}</span>
        {ajuda && <span className="block text-muted-foreground mt-0.5">{ajuda}</span>}
      </span>
    </label>
  );
}

function Opcoes({ pergunta: p, podeEditar, onMudar }:
{ pergunta: Pergunta; podeEditar: boolean; onMudar: (patch: Partial<Pergunta>) => void }) {
  const opcoes = p.opcoes || [];
  const neutras = p.opcoes_neutras || [];

  const setOpcao = (i: number, v: string) => onMudar(renomearOpcao(p, i, v));

  // Arrastar para reordenar as opções — mesmo gesto das perguntas.
  // ⚠️ Reordenar opção NÃO mexe em resposta coletada: a resposta é gravada pelo
  // TEXTO da opção, não pela posição (conferido em cen_resposta_item).
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvoSolta, setAlvoSolta] = useState<number | null>(null);

  function soltarEm(i: number) {
    if (arrastando !== null && arrastando !== i) {
      const patch = moverOpcao(p, arrastando, i);
      if (patch.opcoes) onMudar(patch);
    }
    setArrastando(null);
    setAlvoSolta(null);
  }

  return (
    <Campo label="Opções" ajuda='Marque "não conta" nas opções que não são resposta (ex.: "Prefiro não dizer"). Elas ficam fora de médias e percentuais, e numa múltipla limpam as outras marcações.'>
      <div className="space-y-1.5">
        {opcoes.map((o, i) => (
          <div key={i}
            onDragOver={podeEditar ? (e) => { e.preventDefault(); setAlvoSolta(i); } : undefined}
            onDragLeave={podeEditar ? () => setAlvoSolta((a) => (a === i ? null : a)) : undefined}
            onDrop={podeEditar ? (e) => { e.preventDefault(); soltarEm(i); } : undefined}
            className={`flex items-center gap-2 rounded-md ${arrastando === i ? 'opacity-40' : ''} ${
              alvoSolta === i && arrastando !== null && arrastando !== i ? 'ring-2 ring-primary' : ''
            }`}>
            {podeEditar && (
              <span
                draggable
                onDragStart={(e) => { setArrastando(i); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { setArrastando(null); setAlvoSolta(null); }}
                title="Arraste para reordenar"
                aria-hidden="true"
                className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground"
              >
                <GripVertical className="size-3.5" />
              </span>
            )}
            <Input value={o} disabled={!podeEditar} onChange={(e) => setOpcao(i, e.target.value)} />
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 cursor-pointer">
              <input type="checkbox" checked={neutras.includes(o)} disabled={!podeEditar} className="size-3.5 accent-primary"
                onChange={(e) => onMudar({
                  opcoes_neutras: e.target.checked ? [...neutras, o] : neutras.filter((n) => n !== o),
                })} />
              não conta
            </label>
            {podeEditar && (
              <button type="button" title="Remover opção"
                className="p-1 text-muted-foreground hover:text-red-600 shrink-0"
                onClick={() => onMudar({
                  opcoes: opcoes.filter((_, j) => j !== i),
                  opcoes_neutras: neutras.filter((n) => n !== o),
                })}>
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {podeEditar && (
          <Button variant="ghost" size="sm" onClick={() => onMudar({ opcoes: [...opcoes, ''] })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Opção
          </Button>
        )}
      </div>
    </Campo>
  );
}

function Condicional({ pergunta: p, anteriores, podeEditar, onMudar }:
{ pergunta: Pergunta; anteriores: Pergunta[]; podeEditar: boolean; onMudar: (patch: Partial<Pergunta>) => void }) {
  const dep = anteriores.find((q) => q.id === p.mostrar_se?.pergunta);
  const valoresPossiveis = dep
    ? (dep.tipo === 'sim_nao' ? ['Sim', 'Não'] : dep.opcoes || [])
    : [];
  const marcados = p.mostrar_se?.valores || [];

  return (
    <Campo label="Aparece só se…"
      ajuda="Deixe em branco para a pergunta aparecer sempre. Só perguntas ANTERIORES podem ser usadas.">
      <div className="space-y-2">
        <Select
          value={p.mostrar_se?.pergunta || '__sempre'}
          disabled={!podeEditar || anteriores.length === 0}
          onValueChange={(v) => onMudar({
            mostrar_se: v === '__sempre' ? undefined : { pergunta: v, valores: [] },
          })}
        >
          <SelectTrigger><SelectValue placeholder="Aparece sempre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__sempre">Aparece sempre</SelectItem>
            {anteriores.filter((q) => q.tipo === 'sim_nao' || (q.opcoes || []).length > 0).map((q) => (
              <SelectItem key={q.id} value={q.id!}>{q.texto || q.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {dep && (
          <div className="flex flex-wrap gap-1.5">
            {valoresPossiveis.map((v) => {
              const ativo = marcados.includes(v);
              return (
                <button key={v} type="button" disabled={!podeEditar}
                  onClick={() => onMudar({
                    mostrar_se: {
                      pergunta: dep.id!,
                      valores: ativo ? marcados.filter((m) => m !== v) : [...marcados, v],
                    },
                  })}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    ativo ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'
                  }`}>
                  {v}
                </button>
              );
            })}
            {marcados.length === 0 && (
              <span className="text-[11px] text-amber-600 flex items-center gap-1">
                <AlertTriangle className="size-3" /> escolha ao menos uma resposta que faça a pergunta aparecer
              </span>
            )}
          </div>
        )}
      </div>
    </Campo>
  );
}
