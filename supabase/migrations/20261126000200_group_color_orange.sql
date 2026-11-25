-- Suma "orange" (naranja) a la paleta: 10 colores, 5 por fila en el selector.

alter table groups drop constraint groups_color_check;
alter table groups add constraint groups_color_check
  check (color in ('coral', 'orange', 'sun', 'lime', 'mint', 'teal', 'sky', 'lilac', 'pink', 'sand'));
