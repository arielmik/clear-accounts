-- Categorías del sistema. `system_key` es la clave de traducción en la app;
-- `name` es el texto por defecto (es-AR).
insert into categories (system_key, name, icon, sort_order, parent_id) values
  ('food',          'Comida',             'utensils',      10, null),
  ('home',          'Hogar',              'home',          20, null),
  ('transport',     'Transporte',         'car',           30, null),
  ('leisure',       'Ocio',               'party',         40, null),
  ('health',        'Salud',              'heart-pulse',   50, null),
  ('travel',        'Viajes',             'plane',         60, null),
  ('shopping',      'Compras',            'shopping-bag',  70, null),
  ('education',     'Educación',          'book',          80, null),
  ('services',      'Servicios',          'receipt',       90, null),
  ('gifts',         'Regalos',            'gift',         100, null),
  ('other',         'Otros',              'dots',         999, null);

insert into categories (system_key, name, icon, sort_order, parent_id)
select v.key, v.name, v.icon, v.ord, c.id
from (values
  ('food.groceries',     'Supermercado',     'cart',        11, 'food'),
  ('food.restaurants',   'Restaurantes',     'utensils',    12, 'food'),
  ('food.delivery',      'Delivery',         'bike',        13, 'food'),
  ('home.rent',          'Alquiler',         'key',         21, 'home'),
  ('home.utilities',     'Luz, gas y agua',  'bolt',        22, 'home'),
  ('home.internet',      'Internet y TV',    'wifi',        23, 'home'),
  ('home.maintenance',   'Mantenimiento',    'wrench',      24, 'home'),
  ('home.cleaning',      'Limpieza',         'sparkles',    25, 'home'),
  ('transport.fuel',     'Combustible',      'fuel',        31, 'transport'),
  ('transport.public',   'Transporte público','bus',        32, 'transport'),
  ('transport.taxi',     'Taxi / Apps',      'taxi',        33, 'transport'),
  ('transport.parking',  'Estacionamiento',  'parking',     34, 'transport'),
  ('leisure.outings',    'Salidas',          'glass',       41, 'leisure'),
  ('leisure.subscriptions','Suscripciones',  'play',        42, 'leisure'),
  ('leisure.sports',     'Deportes',         'ball',        43, 'leisure'),
  ('health.pharmacy',    'Farmacia',         'pill',        51, 'health'),
  ('health.insurance',   'Prepaga / Obra social','shield',  52, 'health'),
  ('travel.lodging',     'Alojamiento',      'bed',         61, 'travel'),
  ('travel.flights',     'Pasajes',          'plane',       62, 'travel'),
  ('travel.activities',  'Excursiones',      'map',         63, 'travel'),
  ('shopping.clothing',  'Ropa',             'shirt',       71, 'shopping'),
  ('shopping.tech',      'Tecnología',       'laptop',      72, 'shopping')
) as v(key, name, icon, ord, parent_key)
join categories c on c.system_key = v.parent_key;
