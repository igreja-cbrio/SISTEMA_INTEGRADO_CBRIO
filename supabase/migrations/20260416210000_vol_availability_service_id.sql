-- Adiciona service_id em vol_availability para disponibilidade por culto especifico
ALTER TABLE vol_availability
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES vol_services(id) ON DELETE CASCADE;

-- Indice unico: um voluntario so pode marcar indisponibilidade uma vez por culto
CREATE UNIQUE INDEX IF NOT EXISTS vol_availability_profile_service_uq
  ON vol_availability(volunteer_profile_id, service_id)
  WHERE service_id IS NOT NULL AND volunteer_profile_id IS NOT NULL;
