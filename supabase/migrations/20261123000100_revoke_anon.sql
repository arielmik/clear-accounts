-- En Supabase, las funciones nuevas quedan ejecutables por `anon` aunque se haya
-- cambiado el privilegio por defecto (lo otorga otro rol). Por eso cada migración que
-- cree funciones termina con esta línea, y un test verifica que se cumpla.
revoke execute on all functions in schema public from public, anon;
