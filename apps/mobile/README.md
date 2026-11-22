# Clear Accounts — app mobile

Expo (SDK 58) + Expo Router + Supabase + React Query. La lógica de repartos y balances viene de `@clear-accounts/core`.

## Puesta en marcha

### 1. Crear el proyecto Supabase (una sola vez)

1. Crear un proyecto gratuito en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pegar el **contenido completo** de cada archivo de `supabase/migrations/` y ejecutarlo, en este orden (una consulta por archivo):
   - `20261121000000_init.sql`
   - `20261121000100_seed_categories.sql`
   - `20261122000000_grants.sql`

   Ojo: hay que pegar el SQL de adentro del archivo, no la ruta: el editor no lee archivos del repo.
3. En **Authentication → Sign In / Providers → Email**, desactivar **Confirm email** (para el MVP de familia y amigos; se reactiva antes del lanzamiento público).
4. Botón **Connect** → **Expo React Native**: copiar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_KEY` (la clave `sb_publishable_…`, nunca la secret).

### 2. Configurar y correr la app

```bash
cp apps/mobile/.env.example apps/mobile/.env   # y completar los dos valores (NO subirlo a git)
npm install
npm run start -w @clear-accounts/mobile   # debe mostrar "env: load .env"
```

Escanear el QR con **Expo Go** (iOS / Android). También corre en el navegador con la tecla `w`.

## Estructura

```
src/
├── app/                 # rutas (Expo Router)
│   ├── _layout.tsx      # providers + rutas protegidas por sesión
│   ├── login.tsx
│   ├── (tabs)/          # Inicio, Grupos, Mis gastos, Perfil (+ botón flotante "Nuevo gasto")
│   ├── group/[id].tsx   # gastos, balances (cómo saldar) y miembros/invitaciones
│   ├── group/new.tsx
│   ├── expense/new.tsx  # carga rápida de gastos
│   └── join/[token].tsx # deep link de invitación: clearaccounts://join/<token>
├── components/          # UI compartida y tema (claro / oscuro)
├── i18n/                # textos (es); preparado para sumar idiomas
└── lib/                 # cliente Supabase, API, queries, montos, formulario de gasto
```

## Calidad

```bash
npm run typecheck -w @clear-accounts/mobile
npm test -w @clear-accounts/mobile          # lógica pura: montos y armado de gastos
```
