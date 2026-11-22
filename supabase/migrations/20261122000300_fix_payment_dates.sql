-- Los pagos registrados hasta ahora tomaban la fecha del servidor (UTC). En Argentina,
-- un pago hecho después de las 21 hs quedaba fechado al día siguiente. Se corrige con
-- la zona horaria del perfil de quien lo registró. Desde la app v0.3.2 la fecha la
-- envía el dispositivo.
update settlements s
set paid_at = (s.created_at at time zone p.timezone)::date
from profiles p
where p.id = s.created_by
  and s.paid_at = (s.created_at at time zone 'UTC')::date
  and s.paid_at <> (s.created_at at time zone p.timezone)::date;
