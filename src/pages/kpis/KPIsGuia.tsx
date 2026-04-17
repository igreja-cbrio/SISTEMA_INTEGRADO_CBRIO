import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

const C = { primary: '#00B39D', warn: '#F59E0B', info: '#3B82F6', purple: '#8B5CF6', danger: '#EF4444' };

const AREAS = [
  {
    area: 'Cultos & Frequência',
    responsavel: 'Secretaria / Coordenação',
    cor: C.primary,
    frequencia: 'Semanal — até terça-feira seguinte ao culto',
    onde: 'KPIs → aba Cultos → "+ Registrar Culto"',
    campos: [
      { campo: 'Tipo de culto', como: 'Selecionar o tipo (ex: Domingo 10h, AMI, Bridge, Kids)' },
      { campo: 'Data e hora', como: 'Data do culto — auto-preenchida ao selecionar o tipo' },
      { campo: 'Frequência adultos', como: 'Contagem presencial no salão principal (clicker ou folha de contagem)' },
      { campo: 'Frequência Kids', como: 'Contagem presencial na área kids' },
      { campo: 'Decisões presenciais', como: 'N° de cards de decisão recolhidos na saída' },
      { campo: 'Decisões online', como: 'N° de decisões reportadas pelo chat/formulário online' },
      { campo: 'ID do vídeo YouTube', como: 'Últimos 11 caracteres da URL do YouTube (ex: dQw4w9WgXcQ). Colado logo após o livestream.' },
      { campo: 'Pico simultâneo online', como: 'Número máximo de espectadores simultâneos durante o ao vivo (visível no YouTube Studio)' },
    ],
    obs: 'As views D+1 e D+7 são coletadas automaticamente pelo sistema. Apenas o pico simultâneo precisa ser inserido manualmente.',
  },
  {
    area: 'Batismos',
    responsavel: 'Área de Integração / Secretaria',
    cor: '#6366F1',
    frequencia: 'Sob demanda — conforme inscrições chegam',
    onde: 'KPIs → aba Batismos → "+ Inscrever Pessoa" (ou via totem no hall)',
    campos: [
      { campo: 'Nome e sobrenome', como: 'Nome completo do candidato ao batismo' },
      { campo: 'CPF', como: 'Se disponível — vincula automaticamente ao cadastro existente' },
      { campo: 'Data de nascimento', como: 'Se disponível' },
      { campo: 'Telefone / e-mail', como: 'Para contato da equipe de batismo' },
      { campo: 'Observações', como: 'Contexto relevante (ex: já foi batizado em outra denominação, tem urgência médica, etc.)' },
    ],
    obs: 'Após a inscrição, altere o status para "Confirmado" quando houver confirmação do candidato, e para "Realizado" após o batismo.',
  },
  {
    area: 'Voluntariado',
    responsavel: 'Coordenação de Voluntariado (Jessica Salviano)',
    cor: C.primary,
    frequencia: 'Mensal — até dia 5 do mês seguinte',
    onde: 'KPIs → aba Voluntariado (leitura) | Ministerial → Voluntariado (gestão)',
    campos: [
      { campo: 'Voluntários ativos', como: 'Número de pessoas que serviram nos últimos 3 meses (extrair do módulo de voluntariado)' },
      { campo: 'Novos voluntários', como: 'Entrantes no mês — via formulário de interesse ou integração direta' },
      { campo: 'Voluntários no Services', como: 'N° que aparecem escalados no Planning Center Services' },
      { campo: '% desaparecidos', como: 'Voluntários sem escala há mais de 3 meses — identificar e contactar' },
    ],
    obs: 'O número de voluntários ativos é puxado automaticamente do módulo de check-in. Os demais precisam de consolidação manual mensal.',
  },
  {
    area: 'Grupos de Conexão',
    responsavel: 'Coordenação de Grupos (Sebastião Andrade)',
    cor: C.info,
    frequencia: 'Mensal (participantes) / Semestral (total de grupos)',
    onde: 'KPIs → aba Grupos (leitura) | Ministerial → Grupos (gestão)',
    campos: [
      { campo: 'N° de grupos ativos', como: 'Contagem dos grupos com reunião realizada no mês' },
      { campo: 'N° de participantes', como: 'Total de inscritos nos grupos ativos (somar listas dos líderes)' },
      { campo: 'Líderes em treinamento', como: 'N° de líderes em processo de formação' },
      { campo: 'Novos líderes', como: 'Líderes que assumiram grupo novo no período' },
    ],
    obs: 'Solicitar relatório mensal dos supervisores de grupos. Alimentar o módulo de Grupos com os dados consolidados.',
  },
  {
    area: 'CBKids',
    responsavel: 'Liderança CBKids (Mariane Gaia)',
    cor: C.warn,
    frequencia: 'Mensal — até dia 5 do mês seguinte',
    onde: 'KPIs → aba CBKids (leitura) | Registrar via relatório mensal da área',
    campos: [
      { campo: 'Aceitações/mês', como: 'N° de crianças que fizeram oração de aceitação no mês (registrado por servo Kids)' },
      { campo: 'Batismos Kids/mês', como: 'N° de batismos de crianças realizados no mês' },
      { campo: 'Famílias com devocionais', como: 'N° de famílias que confirmaram estar fazendo os devocionais (via WhatsApp ou formulário)' },
      { campo: 'Saída de voluntários', como: 'N° de voluntários que saíram do CBKids no mês sem aviso ou justificativa' },
    ],
    obs: 'Base de referência: 8 aceitações/mês, 3 batismos/mês, 10 famílias com devocionais. Metas: +25%, +67%, +400% (50 famílias).',
  },
  {
    area: 'AMI & Bridge',
    responsavel: 'Liderança AMI (a definir)',
    cor: C.purple,
    frequencia: 'Semanal (frequência) / Mensal (grupos, Next, ED)',
    onde: 'KPIs → aba AMI & Bridge | Cultos: registrar como "AMI" ou "Bridge"',
    campos: [
      { campo: 'Frequência nos cultos', como: 'Registrar cada culto AMI e Bridge separadamente na aba Cultos' },
      { campo: 'Inscritos no Next', como: 'N° acumulado de pessoas inscritas no programa Next' },
      { campo: 'Escola de Discípulos', como: 'N° de presentes em cada encontro semanal da Escola de Discípulos' },
      { campo: 'Batismos', como: 'Registrar na aba Batismos (serão contabilizados automaticamente)' },
    ],
    obs: 'Meta: +15% de frequência em 6 meses, +30% em 12 meses. Next deve dobrar o número de inscritos. Escola deve crescer 50% em 6 meses.',
  },
  {
    area: 'Integração',
    responsavel: 'Coordenação de Integração (Lorena Andrade)',
    cor: C.info,
    frequencia: 'Semanal (visitantes/conversões) / Mensal (treinamentos)',
    onde: 'KPIs → aba Integração (leitura) | Relatório semanal enviado ao coordenador',
    campos: [
      { campo: 'Visitantes por culto', como: 'Contagem de pessoas abordadas pela recepção que são primeira visita (cartão de visitante)' },
      { campo: 'Conversões por culto', como: 'N° de pessoas que fizeram oração de aceitação ou se declararam convertidas' },
      { campo: 'Voluntários na recepção', como: 'N° de voluntários que serviram na recepção no culto' },
      { campo: 'Encontros 1x1 realizados', como: 'N° de encontros individuais entre coord/supervisores e voluntários no mês' },
    ],
    obs: 'Meta: cada voluntário da recepção abordar 5 pessoas por culto. 90% dos voluntários devem participar dos treinamentos mensais.',
  },
  {
    area: 'Cuidados',
    responsavel: 'Coordenação de Cuidados (Wesley Ramos)',
    cor: '#EF4444',
    frequencia: 'Mensal — até dia 5 do mês seguinte',
    onde: 'KPIs → aba Cuidados (leitura) | Relatório mensal consolidado',
    campos: [
      { campo: 'Pessoas acompanhadas', como: 'Total de pessoas em jornada de acompanhamento ativo no mês' },
      { campo: 'Aconselhamentos realizados', como: 'N° de sessões de aconselhamento realizadas no mês' },
      { campo: 'Atendimentos capelania', como: 'N° de visitas a hospitais, sepultamentos e atendimentos a enlutados' },
      { campo: 'Encontros Jornada 180', como: 'N° de encontros/reuniões do programa Jornada 180 realizados no mês' },
    ],
    obs: 'Dados sensíveis — não incluir nomes ou detalhes pessoais no sistema. Apenas contagens agregadas.',
  },
  {
    area: 'CBA',
    responsavel: 'Nélio Paiva / Guilherme Brandão',
    cor: C.primary,
    frequencia: 'Trimestral',
    onde: 'KPIs → aba CBA (leitura) | Relatório trimestral enviado à liderança',
    campos: [
      { campo: 'Conversões', como: 'N° de conversões reportadas pelas igrejas parceiras no trimestre' },
      { campo: 'Reuniões realizadas', como: 'N° de reuniões de pastores/líderes realizadas no trimestre' },
      { campo: 'Participantes nas reuniões', como: 'Total de participantes nas reuniões do trimestre' },
    ],
    obs: 'Dados coletados diretamente dos relatórios das igrejas parceiras. Enviar para o coordenador até o último dia do trimestre.',
  },
];

export default function KPIsGuia() {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <button onClick={() => navigate('/kpis')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar para KPIs
        </button>
        <Button variant="outline" onClick={() => window.print()} className="gap-2 text-sm">
          <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
        </Button>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Guia de Coleta de Dados — KPIs 2026</h1>
        <p className="text-muted-foreground">Como cada área deve registrar seus indicadores no sistema. Atualizado em abril/2026.</p>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm font-semibold text-amber-600 mb-1">Princípio geral</p>
        <p className="text-sm text-muted-foreground">
          Cada área é responsável por alimentar seus próprios dados no sistema. Dados inseridos até o prazo estabelecido
          garantem que os dashboards reflitam a realidade no início de cada semana/mês. Dados incompletos geram cards com
          "—" no painel — não significa erro, significa ausência de registro.
        </p>
      </div>

      {/* Áreas */}
      {AREAS.map(a => (
        <div key={a.area} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 flex items-center gap-3" style={{ borderLeft: `4px solid ${a.cor}` }}>
            <div>
              <h2 className="text-lg font-bold text-foreground">{a.area}</h2>
              <p className="text-sm text-muted-foreground">Responsável: <strong>{a.responsavel}</strong> · {a.frequencia}</p>
            </div>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div className="rounded-xl bg-muted/30 px-4 py-2.5 flex items-start gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0 mt-0.5">Onde registrar</span>
              <span className="text-sm text-foreground font-medium">{a.onde}</span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-1/3">Campo</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Como preencher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {a.campos.map(c => (
                  <tr key={c.campo}>
                    <td className="py-2.5 pr-4 font-semibold text-foreground align-top">{c.campo}</td>
                    <td className="py-2.5 text-muted-foreground">{c.como}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {a.obs && (
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-xs text-muted-foreground"><strong className="text-foreground">Observação:</strong> {a.obs}</p>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div className="rounded-2xl border border-border bg-muted/30 p-5 text-center space-y-1">
        <p className="text-sm font-medium text-foreground">Dúvidas sobre o sistema?</p>
        <p className="text-xs text-muted-foreground">Entre em contato com a equipe de TI ou acesse o painel em <strong>crmcbrio.vercel.app/kpis</strong></p>
      </div>

      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>
    </div>
  );
}
