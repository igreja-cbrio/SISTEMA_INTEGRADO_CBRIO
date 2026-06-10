// Política de Privacidade, Termos de Serviço e Exclusão de Dados · página
// PÚBLICA (fora do AppShell/ProtectedRoute) e autocontida. Atende às
// exigências da Meta (app CBRio Bot · WhatsApp Business Platform):
//   Política de Privacidade  → /privacidade
//   Termos de Serviço        → /privacidade#termos
//   Exclusão de dados        → /privacidade#exclusao-de-dados
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

const TEAL = '#00839D';
const ATUALIZACAO = '10 de junho de 2026';
const EMAIL = 'infra@cbrio.com.br';
const ENDERECO = 'Av. das Américas, 7907 — Open Mall (subsolo), Barra da Tijuca, Rio de Janeiro/RJ, CEP 22793-081';

function Secao({ id, titulo, children }: { id?: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 96 }} className="mt-10">
      <h2 className="text-xl font-bold mb-3" style={{ color: TEAL }}>{titulo}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export default function Privacidade() {
  const location = useLocation();

  useEffect(() => {
    document.title = 'Política de Privacidade · CBRio';
  }, []);

  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 50);
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <a href="/privacidade" className="text-2xl font-extrabold tracking-tight" style={{ color: TEAL }}>cbrio</a>
          <nav className="flex gap-4 text-sm font-medium text-gray-600">
            <a href="#politica" className="hover:underline">Privacidade</a>
            <a href="#termos" className="hover:underline">Termos</a>
            <a href="#exclusao-de-dados" className="hover:underline">Exclusão de dados</a>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 pb-20">
        <div id="politica" style={{ scrollMarginTop: 96 }} className="pt-10">
          <h1 className="text-3xl font-extrabold text-gray-900">Política de Privacidade</h1>
          <p className="mt-2 text-sm text-gray-500">Última atualização: {ATUALIZACAO}</p>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-700">
            A <strong>Igreja Comunidade Batista do Rio de Janeiro (CBRio)</strong> respeita a sua
            privacidade e trata dados pessoais em conformidade com a Lei Geral de Proteção de
            Dados (Lei nº 13.709/2018 — LGPD). Esta política explica quais dados coletamos, por que
            coletamos e como você pode exercer os seus direitos. Ela vale para o nosso site, para os
            formulários digitais da igreja e para os nossos canais de atendimento e comunicação no
            WhatsApp, incluindo o assistente automatizado da CBRio (WhatsApp Business Platform).
          </p>
        </div>

        <Secao titulo="Quem é o controlador dos dados">
          <p>
            Igreja Comunidade Batista do Rio de Janeiro (CBRio), com sede em {ENDERECO}.
            Canal de contato para assuntos de privacidade: <a href={`mailto:${EMAIL}`} className="underline" style={{ color: TEAL }}>{EMAIL}</a>.
          </p>
        </Secao>

        <Secao titulo="Quais dados coletamos">
          <p><strong>Nos canais de WhatsApp (incluindo o assistente automatizado):</strong></p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Número de telefone e nome do perfil do WhatsApp;</li>
            <li>Conteúdo das mensagens enviadas aos nossos números oficiais;</li>
            <li>
              No caso de líderes e voluntários cadastrados, informações ministeriais reportadas
              voluntariamente (por exemplo, frequência de cultos e encontros e número de decisões);
            </li>
            <li>
              Dados de pessoas acompanhadas pastoralmente (nome, telefone e, opcionalmente, CPF),
              informados pela própria pessoa ou pela equipe da igreja com a finalidade de
              acompanhamento pastoral.
            </li>
          </ul>
          <p><strong>No site e nos formulários digitais:</strong></p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              Dados de cadastro fornecidos voluntariamente em inscrições (membresia, batismo,
              grupos, eventos e voluntariado), como nome, contato e data de nascimento;
            </li>
            <li>Registros técnicos básicos de acesso, necessários à segurança do serviço.</li>
          </ul>
          <p>
            <strong>Crianças e adolescentes:</strong> dados de menores são tratados sempre em nome do
            responsável legal e com o seu consentimento, no melhor interesse da criança (art. 14 da LGPD).
          </p>
        </Secao>

        <Secao titulo="Para que usamos os dados">
          <ul className="list-disc pl-6 space-y-1">
            <li>Comunicação institucional e resposta a dúvidas (horários, endereço, programação);</li>
            <li>Acompanhamento pastoral e organização das atividades da igreja;</li>
            <li>Gestão de inscrições em cultos, eventos, grupos e voluntariado;</li>
            <li>Estatísticas internas agregadas (sem identificação individual) para gestão ministerial;</li>
            <li>Cumprimento de obrigações legais.</li>
          </ul>
          <p>
            As bases legais utilizadas são o consentimento do titular e o legítimo interesse no
            contexto das atividades religiosas e associativas da igreja (art. 7º da LGPD).
          </p>
        </Secao>

        <Secao titulo="Compartilhamento de dados">
          <p>
            A CBRio <strong>não vende nem comercializa dados pessoais</strong>. Os dados podem ser
            tratados por operadores estritamente necessários à prestação do serviço, como a Meta
            Platforms (WhatsApp Business Platform), provedores de hospedagem em nuvem e serviços de
            e-mail e armazenamento, sempre limitados às finalidades desta política.
          </p>
        </Secao>

        <Secao titulo="Segurança e retenção">
          <p>
            Os dados são armazenados em ambientes com acesso restrito por perfil, criptografia em
            trânsito e registro de auditoria. Mantemos os dados apenas pelo tempo necessário às
            finalidades desta política ou pelo prazo exigido por lei, e depois os eliminamos ou
            anonimizamos.
          </p>
        </Secao>

        <Secao titulo="Seus direitos (art. 18 da LGPD)">
          <p>Você pode solicitar, a qualquer momento:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Confirmação da existência de tratamento e acesso aos seus dados;</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
            <li>Portabilidade e informação sobre compartilhamentos;</li>
            <li>Revogação do consentimento e eliminação dos dados tratados com base nele.</li>
          </ul>
          <p>
            Para exercer qualquer direito, escreva para{' '}
            <a href={`mailto:${EMAIL}`} className="underline" style={{ color: TEAL }}>{EMAIL}</a>.
          </p>
        </Secao>

        <Secao id="exclusao-de-dados" titulo="Exclusão de dados — como solicitar">
          <div className="rounded-xl border p-5" style={{ borderColor: TEAL, backgroundColor: '#F0FAFB' }}>
            <p>
              Para solicitar a <strong>exclusão dos seus dados pessoais</strong> (incluindo os dados
              tratados a partir do WhatsApp e do assistente automatizado da CBRio), siga um destes caminhos:
            </p>
            <ol className="list-decimal pl-6 space-y-2 mt-3">
              <li>
                Envie um e-mail para{' '}
                <a href={`mailto:${EMAIL}?subject=Exclus%C3%A3o%20de%20dados%20pessoais`} className="underline font-medium" style={{ color: TEAL }}>{EMAIL}</a>{' '}
                com o assunto <strong>“Exclusão de dados pessoais”</strong>, informando o seu nome
                completo e o número de telefone utilizado no WhatsApp; ou
              </li>
              <li>
                Faça a solicitação presencialmente na secretaria da igreja ({ENDERECO}).
              </li>
            </ol>
            <p className="mt-3">
              Confirmaremos a identidade do solicitante e concluiremos a exclusão em até{' '}
              <strong>15 dias úteis</strong>, com resposta de confirmação pelo mesmo canal do pedido.
              Poderão ser mantidos apenas os registros cuja guarda seja exigida por lei (por exemplo,
              registros fiscais e contábeis), pelo prazo legal correspondente.
            </p>
          </div>
        </Secao>

        <Secao id="termos" titulo="Termos de Serviço">
          <p>
            Ao utilizar o site, os formulários digitais e os canais de WhatsApp da CBRio (incluindo o
            assistente automatizado), você concorda com estes termos:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              Os canais digitais da CBRio destinam-se à comunicação institucional, ao acompanhamento
              pastoral e à organização das atividades da igreja, sem qualquer custo para o usuário;
            </li>
            <li>
              O assistente automatizado de WhatsApp fornece informações institucionais e apoia o
              registro de informações ministeriais por líderes cadastrados. As respostas têm caráter
              informativo e não substituem o atendimento pastoral pessoal;
            </li>
            <li>
              É vedado o uso dos canais para envio de conteúdo ilícito, ofensivo ou não relacionado às
              atividades da igreja. O uso indevido pode resultar em bloqueio do contato;
            </li>
            <li>
              O conteúdo do site (textos, marcas e imagens) pertence à CBRio e não pode ser
              reproduzido para fins comerciais sem autorização;
            </li>
            <li>
              Estes termos e a política de privacidade podem ser atualizados a qualquer momento, com a
              data de revisão indicada nesta página. O uso continuado dos canais após a atualização
              representa concordância com a nova versão;
            </li>
            <li>
              Fica eleito o foro da Comarca da Capital do Estado do Rio de Janeiro para dirimir
              quaisquer controvérsias decorrentes destes termos.
            </li>
          </ul>
        </Secao>

        <Secao titulo="Contato e encarregado pelo tratamento de dados">
          <p>
            Encarregado (DPO): Igreja CBRio — {' '}
            <a href={`mailto:${EMAIL}`} className="underline" style={{ color: TEAL }}>{EMAIL}</a>.
            Responderemos às solicitações no menor prazo possível, observados os prazos da LGPD.
          </p>
        </Secao>
      </main>

      <footer className="border-t bg-gray-50">
        <div className="max-w-3xl mx-auto px-5 py-8 text-sm text-gray-500 space-y-1">
          <p className="font-semibold text-gray-700">Igreja Comunidade Batista do Rio de Janeiro (CBRio)</p>
          <p>{ENDERECO}</p>
          <p>
            Contato: <a href={`mailto:${EMAIL}`} className="underline" style={{ color: TEAL }}>{EMAIL}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
