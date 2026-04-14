import { Routes, Route, Navigate } from 'react-router-dom';
import VolDashboard from './VolDashboard';
import VolCheckin from './VolCheckin';
import VolEscalas from './VolEscalas';
import VolRelatorios from './VolRelatorios';
import VolQrCodes from './VolQrCodes';
import VolAdmin from './VolAdmin';

export default function Voluntariado() {
  return (
    <Routes>
      <Route index element={<VolDashboard />} />
      <Route path="checkin" element={<VolCheckin />} />
      <Route path="escalas" element={<VolEscalas />} />
      <Route path="relatorios" element={<VolRelatorios />} />
      <Route path="qrcodes" element={<VolQrCodes />} />
      <Route path="admin" element={<VolAdmin />} />
      <Route path="*" element={<Navigate to="/ministerial/voluntariado" replace />} />
    </Routes>
  );
}
