import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { voluntariado } from '@/api';
import VolDashboard from './VolDashboard';
import VolCheckin from './VolCheckin';
import VolEscalas from './VolEscalas';
import VolRelatorios from './VolRelatorios';
import VolQrCodes from './VolQrCodes';
import VolAdmin from './VolAdmin';
import VolEquipes from './VolEquipes';
import VolTiposCulto from './VolTiposCulto';
import VolScheduleBuilder from './VolScheduleBuilder';
import VolDisponibilidade from './VolDisponibilidade';
import VolMeuPainel from './VolMeuPainel';
import VolProfileComplete from './VolProfileComplete';
import VolLista from './VolLista';
import VolNavBar from './components/VolNavBar';

export default function Voluntariado() {
  const { isVoluntario } = useAuth();

  // Volunteers see their portal (check-in + my schedules + availability)
  if (isVoluntario) {
    return <VolunteerPortal />;
  }

  // Staff see all management screens
  return (
    <div className="p-4 md:p-6">
      <VolNavBar />
      <Routes>
        <Route index element={<VolDashboard />} />
        <Route path="checkin" element={<VolCheckin />} />
        <Route path="escalas" element={<VolEscalas />} />
        <Route path="montar-escala" element={<VolScheduleBuilder />} />
        <Route path="equipes" element={<VolEquipes />} />
        <Route path="tipos-culto" element={<VolTiposCulto />} />
        <Route path="disponibilidade" element={<VolDisponibilidade />} />
        <Route path="relatorios" element={<VolRelatorios />} />
        <Route path="qrcodes" element={<VolQrCodes />} />
        <Route path="lista" element={<VolLista />} />
        <Route path="admin" element={<VolAdmin />} />
        <Route path="*" element={<Navigate to="/ministerial/voluntariado" replace />} />
      </Routes>
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
        <Route path="checkin" element={<VolCheckin />} />
        <Route path="*" element={<Navigate to="painel" replace />} />
      </Routes>
    </div>
  );
}
