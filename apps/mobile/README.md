# Clear Accounts — app mobile

Expo (SDK 58) + Expo Router + Supabase + React Query. La lógica de repartos y balances viene de `@clear-accounts/core`.

## Puesta en marcha

### 1. Crear el proyecto Supabase (una sola vez)

1. Crear un proyecto gratuito en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pegar el **contenido completo** de cada archivo de `supabase/migrations/` y ejecutarlo, en este orden (una consulta por archivo):
   - `20261121000000_init.sql`
   - `20261121000100_seed_categories.sql`
   - `20261122000000_grants.sql`
   - `20261122000100_members_profile.sql`

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
├── app/                      # rutas (Expo Router)
│   ├── _layout.tsx           # providers + rutas protegidas por sesión
│   ├── login.tsx
│   ├── (tabs)/               # menú inferior, siempre visible
│   │   ├── (home)/           # Inicio → detalle de gasto, "Te deben" / "Debés"
│   │   ├── groups/           # Grupos → detalle de grupo → detalle de gasto
│   │   ├── ledger/           # Mis gastos → detalle de gasto
│   │   └── profile.tsx       # perfil editable
│   ├── expense-form.tsx      # modal: nuevo gasto / editar (?id=)
│   ├── group-form.tsx        # modal: nuevo grupo
│   └── join/[token].tsx      # deep link de invitación: clearaccounts://join/<token>
├── screens/                  # pantallas (las rutas las re-exportan)
├── components/               # UI compartida y tema (claro / oscuro)
├── i18n/                     # textos (es) y mensajes de error
└── lib/                      # Supabase, API, queries, montos, deudas, formulario de gasto
```

## Calidad

```bash
npm run typecheck -w @clear-accounts/mobile
npm test -w @clear-accounts/mobile          # lógica pura: montos y armado de gastos
```
