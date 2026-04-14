import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import VolDashboard from './VolDashboard';
import VolCheckin from './VolCheckin';
import VolEscalas from './VolEscalas';
import VolRelatorios from './VolRelatorios';
import VolQrCodes from './VolQrCodes';
import VolAdmin from './VolAdmin';
import VolNavBar from './components/VolNavBar';

export default function Voluntariado() {
  const { isVoluntario } = useAuth();

  // Volunteers can only access check-in
  if (isVoluntario) {
    return (
      <div className="p-4 md:p-6">
        <VolNavBar />
        <Routes>
          <Route index element={<Navigate to="checkin" replace />} />
          <Route path="checkin" element={<VolCheckin />} />
          <Route path="*" element={<Navigate to="checkin" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <VolNavBar />
      <Routes>
        <Route index element={<VolDashboard />} />
        <Route path="checkin" element={<VolCheckin />} />
        <Route path="escalas" element={<VolEscalas />} />
        <Route path="relatorios" element={<VolRelatorios />} />
        <Route path="qrcodes" element={<VolQrCodes />} />
        <Route path="admin" element={<VolAdmin />} />
        <Route path="*" element={<Navigate to="/ministerial/voluntariado" replace />} />
      </Routes>
    </div>
  );
}
