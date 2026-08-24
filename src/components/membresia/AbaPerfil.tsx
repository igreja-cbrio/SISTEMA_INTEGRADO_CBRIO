// Perfil da Membresia · quem é a igreja, a partir do que já está cadastrado.
//
// Pedido do Matheus (23/08): mapa de onde a membresia se concentra (do
// endereço/CEP) + gráficos de faixa etária, sexo e afins, montados com o dado
// de HOJE e desenhados para o censo ir alimentando.
//
// ⚠️⚠️ A LEI DESTA TELA: todo corte mostra a BASE ao lado do número. "65% são
// mulheres" com 28% de cobertura não é um retrato da igreja — é um retrato de
// quem tem o campo preenchido, e as duas frases levam a decisões diferentes.
// Por isso o percentual é sempre sobre `base` (quem respondeu), nunca sobre
// `total` (quem existe), e a base vai escrita no cabeçalho de cada bloco.
//
// ⚠️ Corte com `base === 0` NÃO vira gráfico vazio: some, e o painel de
// cobertura explica o buraco. Barra chapada em zero se lê como "ninguém tem
// ensino superior", que é diferente de "ninguém respondeu".
//
// ⚠️ NENHUM endpoint desta tela devolve nome, CPF, telefone, e-mail ou
// endereço — só contagem. É isso que permite abrir a aba para líder de área
// sem abrir o cadastro de gente junto.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { membresia } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, RefreshCw, AlertTriangle, Users } from 'lucide-react';
import MapaBairros, { type BairroMapa } from './MapaBairros';

type Valor = { valor: string; total: number; norm?: string };
type Corte = { base: number; valores: Valor[] };
type Piramide = { faixa: string; masculino: number; feminino: number; total: number };
type Perfil = {
  total: number;
  filtros: { status: string | null; bairro: string | null; cep_regiao?: string | null; cep_regiao_bloqueado?: boolean };
  cobertura: Record<string, number>;
  cortes: Record<string, Corte>;
  piramide: { base: number; valores: Piramide[] };
  engajamento: {
    total: number; atualizado_em: string | null;
    em_grupo: number; voluntario: number; batizado: number;
    fez_next: number; convertido: number; contribuinte: number;
    valores: Record<string, number>;
  };
  mapa: {
    bairros: BairroMapa[];
    pessoas_no_mapa: number;
    pessoas_fora_do_mapa: number;
    bairros_sem_coordenada: number;
  };
  // Corte por TRECHO DE CEP (os 5 primeiros dígitos) — mais específico que
  // bairro. Opcional porque bundle novo pode rodar contra backend antigo.
  mapa_cep?: {
    minimo: number;
    trechos: TrechoMapa[];
    trechos_conhecidos: number;
    pessoas_no_mapa: number;
    pessoas_sem_massa: number;
    pessoas_fora_do_mapa: number;
    trechos_sem_coordenada: number;
    trechos_sem_massa: number;
  };
};

type TrechoMapa = {
  regiao: string;
  bairro: string | null;
  total: number;
  lat: number;
  lng: number;
};

/** "22640" → "22640-000 a -999". O trecho é uma FAIXA de CEPs, e escrever um
 *  CEP fechado faria parecer endereço exato de alguém. */
const rotuloTrecho = (t: TrechoMapa) =>
  `${t.regiao}-xxx${t.bairro ? ` · ${t.bairro}` : ''}`;

const STATUS = [
  { key: 'membro_ativo', label: 'Membros ativos' },
  { key: 'visitante', label: 'Visitantes' },
  { key: 'contribuinte_avulso', label: 'Contribuintes avulsos' },
  { key: 'inativo', label: 'Inativos' },
  { key: '', label: 'Toda a base' },
];

const ROTULO_CORTE: Record<string, { titulo: string; ajuda?: string }> = {
  faixa_etaria: { titulo: 'Faixa etária', ajuda: 'Régua única da igreja: criança <13 · adolescente 13–17 · jovem 18–25 · adulto 26+' },
  faixa_detalhada: { titulo: 'Idade em detalhe' },
  genero: { titulo: 'Sexo' },
  estado_civil: { titulo: 'Estado civil' },
  escolaridade: { titulo: 'Escolaridade' },
  tempo_de_casa: { titulo: 'Tempo de casa', ajuda: 'A partir da data de membresia — campo que quase ninguém tem preenchido ainda' },
  origem_cadastro: { titulo: 'Como a pessoa entrou' },
  bairro: { titulo: 'Bairros com mais gente' },
};

function pct(n: number, base: number) {
  return base > 0 ? Math.round((n / base) * 100) : 0;
}

/** Barras horizontais. Barra em vez de pizza porque comparar comprimento é
 *  mais fácil que comparar ângulo, e vários cortes têm 6+ valores. */
function Barras({ corte, limite = 12 }: { corte: Corte; limite?: number }) {
  const valores = corte.valores.slice(0, limite);
  const maior = Math.max(1, ...valores.map((v) => v.total));
  const ocultos = corte.valores.length - valores.length;
  return (
    <div className="space-y-1.5">
      {valores.map((v) => (
        <div key={v.valor} className="flex items-center gap-2.5">
          <span className="text-xs w-36 shrink-0 truncate" title={v.valor}>{v.valor}</span>
          <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
            <div className="h-full bg-primary/75" style={{ width: `${(v.total / maior) * 100}%` }} />
          </div>
          <span className="text-xs w-20 text-right tabular-nums text-muted-foreground">
            {v.total} · {pct(v.total, corte.base)}%
          </span>
        </div>
      ))}
      {ocultos > 0 && (
        <p className="text-[11px] text-muted-foreground pt-1">
          + {ocultos} {ocultos === 1 ? 'valor' : 'valores'} com menos gente, fora da lista.
        </p>
      )}
    </div>
  );
}

/** Pirâmide etária: masculino à esquerda, feminino à direita, mesma escala nos
 *  dois lados — escalas independentes fariam 20 homens parecerem 200 mulheres. */
function PiramideEtaria({ dados }: { dados: Piramide[] }) {
  const maior = Math.max(1, ...dados.flatMap((d) => [d.masculino, d.feminino]));
  return (
    <div className="space-y-1">
      {dados.map((d) => (
        <div key={d.faixa} className="flex items-center gap-2 text-xs">
          <span className="w-10 text-right tabular-nums text-muted-foreground">{d.masculino}</span>
          <div className="flex-1 h-4 flex justify-end">
            <div className="h-full rounded-l bg-sky-500/70" style={{ width: `${(d.masculino / maior) * 100}%` }} />
          </div>
          <span className="w-16 text-center shrink-0 text-muted-foreground">{d.faixa}</span>
          <div className="flex-1 h-4">
            <div className="h-full rounded-r bg-pink-500/70" style={{ width: `${(d.feminino / maior) * 100}%` }} />
          </div>
          <span className="w-10 tabular-nums text-muted-foreground">{d.feminino}</span>
        </div>
      ))}
      <div className="flex items-center justify-center gap-4 pt-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500/70" /> masculino</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-pink-500/70" /> feminino</span>
      </div>
    </div>
  );
}

function BlocoCorte({ chave, corte, total }: { chave: string; corte: Corte; total: number }) {
  // base 0 = ninguém respondeu. Gráfico chapado em zero mentiria.
  if (!corte || corte.base === 0 || corte.valores.length === 0) return null;
  const meta = ROTULO_CORTE[chave] || { titulo: chave };
  return (
    <Card className="glass-surface">
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">{meta.titulo}</h3>
          <p className="text-[11px] text-muted-foreground">
            {corte.base} de {total} responderam ({pct(corte.base, total)} % da base)
            {meta.ajuda ? ` · ${meta.ajuda}` : ''}
          </p>
        </div>
        <Barras corte={corte} />
      </CardContent>
    </Card>
  );
}

export default function AbaPerfil() {
  const { canAccessModule } = useAuth();
  const podeGeocodificar = canAccessModule(['membresia'], 'escrita', 3);

  const [status, setStatus] = useState('membro_ativo');
  const [bairro, setBairro] = useState<string | null>(null);
  // Granularidade do mapa. Bairro é o padrão porque é onde há dado hoje; CEP
  // fica mais rico à medida que as pessoas atualizam o cadastro e respondem o
  // censo — e a tela DIZ isso em vez de parecer vazia.
  const [dimensao, setDimensao] = useState<'bairro' | 'cep'>('bairro');
  const [cepRegiao, setCepRegiao] = useState<string | null>(null);
  const [d, setD] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [geo, setGeo] = useState<{ rodando: boolean; msg: string | null }>({ rodando: false, msg: null });

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      setD(await membresia.perfil({ status, bairro, cep_regiao: cepRegiao }));
    } catch (e: unknown) {
      // ⚠️ Erro NUNCA vira tela vazia: "não há ninguém" e "a consulta falhou"
      // levam a decisões opostas.
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o perfil');
      setD(null);
    } finally {
      setCarregando(false);
    }
  }, [status, bairro, cepRegiao]);
  useEffect(() => { carregar(); }, [carregar]);

  // Resolve a coordenada do que está pendente NA DIMENSÃO EM QUE A PESSOA
  // ESTÁ OLHANDO — botão que resolve bairro enquanto a tela mostra CEP faria o
  // mapa continuar vazio depois de "resolvido".
  const resolverCoordenadas = useCallback(async () => {
    setGeo({ rodando: true, msg: null });
    const cep = dimensao === 'cep';
    try {
      const r = cep ? await membresia.perfilCepsGeocode(20) : await membresia.perfilGeocode(20);
      const partes = [`${r.resolvidos} resolvido(s)`];
      if (r.falharam) partes.push(`${r.falharam} sem coordenada`);
      const novos = cep ? r.ceps_novos : r.bairros_novos;
      if (novos) partes.push(`${novos} ${cep ? 'CEP(s)' : 'bairro(s)'} novo(s) na fila`);
      if (r.restam) partes.push(`${r.restam} ainda pendente(s) — rode de novo`);
      setGeo({ rodando: false, msg: partes.join(' · ') });
      await carregar();
    } catch (e: unknown) {
      setGeo({ rodando: false, msg: e instanceof Error ? e.message : 'Erro ao resolver as coordenadas' });
    }
  }, [carregar, dimensao]);

  const nomeBairro = useMemo(
    () => d?.mapa.bairros.find((b) => b.norm === bairro)?.bairro || bairro,
    [d, bairro],
  );

  // ⚠️ Derivados declarados ANTES do JSX que os usa (o array de deps de hook é
  // avaliado NO RENDER — const usada em useMemo tem de existir antes).
  const porCep = dimensao === 'cep';
  const mapaCep = d?.mapa_cep;
  const minimoCep = mapaCep?.minimo ?? 3;

  // O mapa é o MESMO componente nas duas lentes: o trecho entra na forma que
  // ele já entende (`bairro` = o rótulo lido, `norm` = a chave do filtro).
  // Um segundo mapa teria calibração e comportamento próprios e divergiria.
  const pontosCep = useMemo<BairroMapa[]>(
    () => (mapaCep?.trechos || []).map((t) => ({
      bairro: rotuloTrecho(t), norm: t.regiao, total: t.total, lat: t.lat, lng: t.lng,
    })),
    [mapaCep],
  );

  // Os dois filtros são MUTUAMENTE EXCLUSIVOS na tela: bairro e trecho se
  // sobrepõem (o trecho está DENTRO do bairro), e somar os dois daria um
  // recorte que a pessoa não pediu e não consegue enxergar.
  const selecionarBairro = useCallback((norm: string | null) => {
    setBairro(norm); setCepRegiao(null);
  }, []);
  const selecionarCep = useCallback((regiao: string | null) => {
    setCepRegiao(regiao); setBairro(null);
  }, []);

  const rotuloCepAtivo = useMemo(
    () => (mapaCep?.trechos || []).find((t) => t.regiao === cepRegiao),
    [mapaCep, cepRegiao],
  );

  if (erro) {
    return (
      <Card className="glass-surface border-destructive/40">
        <CardContent className="p-5 flex items-start gap-3">
          <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Não deu para carregar o perfil</p>
            <p className="text-xs text-muted-foreground mt-1">{erro}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={carregar}>Tentar de novo</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!d) {
    return (
      <div className="h-64 grid place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const cob = d.cobertura || {};
  const eng = d.engajamento;

  return (
    <div className="space-y-5">
      {/* Recorte */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS.map((s) => (
          <button
            key={s.key || 'todos'}
            onClick={() => { setStatus(s.key); setBairro(null); setCepRegiao(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              status === s.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
        {bairro && (
          <Badge variant="secondary" className="gap-1.5">
            <MapPin className="size-3" />
            {nomeBairro}
            <button className="ml-1 hover:text-foreground" onClick={() => setBairro(null)}>✕</button>
          </Badge>
        )}
        {cepRegiao && (
          <Badge variant="secondary" className="gap-1.5">
            <MapPin className="size-3" />
            CEP {rotuloCepAtivo ? rotuloTrecho(rotuloCepAtivo) : `${cepRegiao}-xxx`}
            <button className="ml-1 hover:text-foreground" onClick={() => setCepRegiao(null)}>✕</button>
          </Badge>
        )}
        {carregando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {/* O número que manda: quantas pessoas estão neste recorte */}
      <Card className="glass-surface">
        <CardContent className="p-4 flex items-center gap-3">
          <Users className="size-5 text-primary shrink-0" />
          <div>
            <p className="text-2xl font-semibold tabular-nums leading-none">{d.total}</p>
            <p className="text-xs text-muted-foreground mt-1">
              pessoas neste recorte{bairro ? ` · bairro ${nomeBairro}` : ''}
              {cepRegiao ? ` · CEP ${cepRegiao}-xxx` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mapa */}
      <Card className="glass-surface">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Onde a membresia mora</h3>
              <p className="text-[11px] text-muted-foreground">
                {porCep
                  ? 'Agregado por trecho de CEP (os 5 primeiros dígitos) — mais específico que bairro. Nenhum endereço de pessoa sai do servidor.'
                  : 'Agregado por bairro — nenhum endereço de pessoa sai do servidor. Clique num círculo para filtrar a tela inteira.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Granularidade. Só troca a LENTE — o recorte de status e o
                  filtro ativo continuam valendo. */}
              <div className="flex rounded-full border border-border p-0.5">
                {([['bairro', 'Bairro'], ['cep', 'CEP']] as const).map(([k, rot]) => (
                  <button
                    key={k}
                    onClick={() => setDimensao(k)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      dimensao === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {rot}
                  </button>
                ))}
              </div>
              {podeGeocodificar && (
                <Button size="sm" variant="outline" onClick={resolverCoordenadas} disabled={geo.rodando}>
                  {geo.rodando ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="size-3.5 mr-1.5" />}
                  {porCep ? 'Resolver CEPs' : 'Resolver bairros'}
                </Button>
              )}
            </div>
          </div>

          {/* ⚠️ Trecho abaixo do piso NÃO é filtrável (o servidor recusa) — e a
              tela DIZ o que aconteceu, em vez de mostrar um recorte errado. */}
          {d.filtros?.cep_regiao_bloqueado && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              Aquele trecho de CEP tem menos de {minimoCep} pessoas e não pode ser
              filtrado — o perfil de um grupo tão pequeno identificaria as pessoas.
            </p>
          )}

          <MapaBairros
            bairros={porCep ? pontosCep : d.mapa.bairros}
            selecionado={porCep ? cepRegiao : bairro}
            onSelecionar={porCep ? selecionarCep : selecionarBairro}
            unidade={porCep ? 'trecho de CEP' : 'bairro'}
            unidadePlural={porCep ? 'trecho(s) de CEP' : 'bairro(s)'}
          />

          {/* ⚠️ O buraco do mapa é DECLARADO, sempre. */}
          {porCep ? (
            <p className="text-[11px] text-muted-foreground">
              {mapaCep
                ? <>
                  {mapaCep.pessoas_no_mapa} de {d.total} pessoas aparecem no mapa, em{' '}
                  {mapaCep.trechos.length} trecho(s) de CEP.
                  {mapaCep.pessoas_fora_do_mapa > 0 && ` ${mapaCep.pessoas_fora_do_mapa} têm CEP mas o trecho ainda não tem coordenada (${mapaCep.trechos_sem_coordenada} trecho(s)) — use "Resolver CEPs".`}
                  {mapaCep.pessoas_sem_massa > 0 && ` ${mapaCep.pessoas_sem_massa} estão em trechos com menos de ${mapaCep.minimo} pessoas e não entram no mapa (evita apontar a rua de uma pessoa só).`}
                  {(cob.cep_regiao ?? cob.cep ?? 0) < d.total && ` ${d.total - (cob.cep_regiao ?? cob.cep ?? 0)} pessoas não têm CEP no cadastro — o mapa fica mais rico à medida que atualizam o cadastro e respondem o censo.`}
                </>
                : 'Este corte precisa de uma versão mais nova do servidor.'}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {d.mapa.pessoas_no_mapa} de {d.total} pessoas aparecem no mapa.
              {d.mapa.pessoas_fora_do_mapa > 0 && ` ${d.mapa.pessoas_fora_do_mapa} têm bairro no cadastro mas o bairro ainda não tem coordenada (${d.mapa.bairros_sem_coordenada} bairro(s)).`}
              {' '}
              {(cob.bairro ?? 0) < d.total && `${d.total - (cob.bairro ?? 0)} pessoas não têm bairro nenhum cadastrado.`}
            </p>
          )}
          {geo.msg && <p className="text-[11px] text-primary">{geo.msg}</p>}
        </CardContent>
      </Card>

      {/* Cobertura: o que sabemos e o que não sabemos */}
      <Card className="glass-surface">
        <CardContent className="p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">O que o cadastro já responde</h3>
            <p className="text-[11px] text-muted-foreground">
              Cada gráfico abaixo é calculado sobre quem tem o campo preenchido. É este painel
              que diz o quanto cada um deles pode ser lido como retrato da igreja.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              ['nascimento', 'Data de nascimento'],
              ['genero', 'Sexo'],
              ['estado_civil', 'Estado civil'],
              ['escolaridade', 'Escolaridade'],
              ['endereco', 'Endereço'],
              ['cep', 'CEP'],
              ['bairro', 'Bairro'],
              ['data_membresia', 'Data de membresia'],
            ].map(([k, label]) => {
              const n = cob[k] ?? 0;
              const p = pct(n, d.total);
              const cor = p >= 70 ? 'text-emerald-500' : p >= 30 ? 'text-amber-500' : 'text-muted-foreground';
              return (
                <div key={k} className="rounded-lg border border-border p-2.5">
                  <p className="text-[11px] text-muted-foreground truncate" title={label}>{label}</p>
                  <p className={`text-sm font-semibold tabular-nums ${cor}`}>{p}%</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{n} de {d.total}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Cortes */}
      <div className="grid md:grid-cols-2 gap-4">
        {['faixa_etaria', 'genero', 'faixa_detalhada', 'estado_civil', 'escolaridade', 'tempo_de_casa', 'bairro', 'origem_cadastro']
          .map((k) => <BlocoCorte key={k} chave={k} corte={d.cortes[k]} total={d.total} />)}
      </div>

      {/* Pirâmide */}
      {d.piramide.base > 0 && (
        <Card className="glass-surface">
          <CardContent className="p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Pirâmide etária</h3>
              <p className="text-[11px] text-muted-foreground">
                {d.piramide.base} pessoas com data de nascimento E sexo preenchidos — só elas
                entram aqui, e é por isso que a base é menor que a dos outros gráficos.
              </p>
            </div>
            <PiramideEtaria dados={d.piramide.valores} />
          </CardContent>
        </Card>
      )}

      {/* Engajamento */}
      {eng && (
        <Card className="glass-surface">
          <CardContent className="p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Engajamento deste recorte</h3>
              <p className="text-[11px] text-muted-foreground">
                Mesma régua do /admin/cruzamentos (vw_pessoas_papeis_mat).
                {eng.atualizado_em && ` Atualizado em ${new Date(eng.atualizado_em).toLocaleString('pt-BR')} — a leitura é materializada e pode ter até 24 h de atraso.`}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                ['Em grupo de conexão', eng.em_grupo],
                ['Serve como voluntário', eng.voluntario],
                ['Batizado', eng.batizado],
                ['Fez o Next', eng.fez_next],
                ['Contribuinte', eng.contribuinte],
                ['Convertido registrado', eng.convertido],
              ].map(([label, n]) => (
                <div key={label as string} className="rounded-lg border border-border p-2.5">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {n as number} <span className="text-muted-foreground font-normal">· {pct(n as number, d.total)}%</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
