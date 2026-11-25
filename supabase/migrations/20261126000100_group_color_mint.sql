-- Suma "mint" (verde menta, el color por defecto de Personal) a los colores válidos,
-- para que el grupo personal también pueda elegir su color y volver al de siempre.

alter table groups drop constraint groups_color_check;
alter table groups add constraint groups_color_check
  check (color in ('coral', 'sky', 'sun', 'lilac', 'pink', 'teal', 'lime', 'sand', 'mint'));
