import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useHomeScreenMeta } from '@/hooks/useHomeScreenMeta';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { voluntariado } from '@/api';
import VolDashboard from './VolDashboard';
import VolCheckin from './VolCheckin';
import VolEscalas from './VolEscalas';
import VolRelatorios from './VolRelatorios';
import VolInscricoes from './VolInscricoes';
import VolEncaminhados from './VolEncaminhados';
import VolFrequencia from './VolFrequencia';
import VolQrCodes from './VolQrCodes';
import VolAdmin from './VolAdmin';
import VolEquipes from './VolEquipes';
import VolTiposCulto from './VolTiposCulto';
import VolScheduleBuilder from './VolScheduleBuilder';
import VolDisponibilidade from './VolDisponibilidade';
import VolMeuPainel from './VolMeuPainel';
import VolMeuPerfil from './VolMeuPerfil';
import VolMeusCheckins from './VolMeusCheckins';
import VolProfileComplete from './VolProfileComplete';
import VolMinhaDisponibilidade from './VolMinhaDisponibilidade';
import VolLista from './VolLista';
import VolAcessos from './VolAcessos';
import VolSupervisores from './VolSupervisores';
import VolEmails from './VolEmails';
import VolScanTotem from './VolScanTotem';
import VolTemplatesEscala from './VolTemplatesEscala';
import VolNavBar from './components/VolNavBar';
// varredura 2026-09: B08 — régua de escrita do módulo (espelha o servidor).
import { useVolPodeEscrever } from './hooks/useVolPodeEscrever';

export default function Voluntariado() {
  const { isAdmin, isColaborador } = useAuth();
  const location = useLocation();
  useHomeScreenMeta('checkin');

  // Se URL começa com /voluntariado/checkin → portal do voluntário SEMPRE,
  // independente do role (VolunteerShell já foi aplicada pelo App.tsx).
  const isVolunteerRoute = location.pathname.startsWith('/voluntariado/checkin');

  // Usuários sem permissões de gestão (nao-admin, nao-colaborador) veem
  // sempre o portal simples, mesmo em /ministerial/voluntariado.
  const shouldShowVolunteerPortal = isVolunteerRoute || (!isAdmin && !isColaborador);

  if (shouldShowVolunteerPortal) {
    return <VolunteerPortal />;
  }

  // Staff see all management screens
  return (
    <div className="p-4 md:p-6">
      <VolNavBar />
      {/* varredura 2026-09: B08 — aviso único de modo leitura. A área continua
          aberta por `leitura >= 1` (VoluntariadoGuard), mas a escrita do módulo
          agora exige `voluntariado escrita >= 3` no servidor: sem o aviso, o
          botão desabilitado parece bug em vez de permissão. */}
      <VolAvisoSomenteLeitura />
      <Routes>
        <Route index element={<VolDashboard />} />
        <Route path="checkin" element={<VolCheckin />} />
        <Route path="escalas" element={<VolEscalas />} />
        <Route path="montar-escala" element={<VolScheduleBuilder />} />
        <Route path="templates-escala" element={<VolTemplatesEscala />} />
        <Route path="equipes" element={<VolEquipes />} />
        <Route path="tipos-culto" element={<VolTiposCulto />} />
        <Route path="disponibilidade" element={<VolDisponibilidade />} />
        <Route path="relatorios" element={<VolRelatorios />} />
        <Route path="inscricoes" element={<VolInscricoes />} />
        <Route path="encaminhados" element={<VolEncaminhados />} />
        <Route path="frequencia" element={<VolFrequencia />} />
        <Route path="qrcodes" element={<VolQrCodes />} />
        <Route path="lista" element={<VolLista />} />
        <Route path="acessos" element={<VolAcessos />} />
        <Route path="supervisores" element={<VolSupervisores />} />
        <Route path="emails" element={<VolEmails />} />
        <Route path="admin" element={<VolAdmin />} />
        <Route path="*" element={<Navigate to="/ministerial/voluntariado" replace />} />
      </Routes>
    </div>
  );
}

// varredura 2026-09: B08 — faixa de "somente leitura" pras telas de gestão.
// Some pra quem escreve (o caso normal); ⚠️ some também enquanto as permissões
// carregam, porque `useVolPodeEscrever` devolve true nesse intervalo.
function VolAvisoSomenteLeitura() {
  const podeEscrever = useVolPodeEscrever();
  if (podeEscrever) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
      <strong>Somente leitura.</strong> Você consulta as telas do voluntariado, mas não pode
      criar, editar nem apagar — isso exige permissão de <em>escrita nível 3</em> no módulo
      Voluntariado. Peça ao seu gestor se precisar operar.
    </div>
  );
}

function VolunteerPortal() {
  const { data: meData, isLoading } = useQuery({
    queryKey: ['vol', 'me'],
    queryFn: () => voluntariado.me.get(),
  });

  const [profileDone, setProfileDone] = useState(false);

  const needsProfileCompletion = !isLoading && (!meData?.profile || !meData.profile.profile_complete);

  useEffect(() => {
    if (meData?.profile?.profile_complete) setProfileDone(true);
  }, [meData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  if (needsProfileCompletion && !profileDone) {
    return (
      <VolProfileComplete
        onComplete={() => setProfileDone(true)}
        initialData={meData?.profile ? {
          full_name: meData.profile.full_name,
          email: meData.profile.email,
          cpf: meData.profile.cpf,
          phone: meData.profile.phone,
        } : null}
      />
    );
  }

  return (
    <div className="p-4 md:p-6">
      <VolNavBar />
      <Routes>
        <Route index element={<Navigate to="painel" replace />} />
        <Route path="painel" element={<VolMeuPainel />} />
        <Route path="checkin" element={<VolScanTotem />} />
        <Route path="disponibilidade" element={<VolMinhaDisponibilidade />} />
        <Route path="historico" element={<VolMeusCheckins />} />
        <Route path="perfil" element={<VolMeuPerfil />} />
        <Route path="*" element={<Navigate to="painel" replace />} />
      </Routes>
    </div>
  );
}
