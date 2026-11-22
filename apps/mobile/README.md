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
   - `20261122000200_images_realtime.sql` (crea el bucket privado `images` y activa el tiempo real)
   - `20261122000300_fix_payment_dates.sql`

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

## Publicar para Android (EAS)

La app se compila en la nube de Expo y se instala como APK. Los cambios de código se
envían después **por el aire** (EAS Update): llegan solos a los celulares, sin reinstalar.

Todos los comandos se ejecutan desde `apps/mobile`.

### Una sola vez

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest update:configure --platform android --environment preview
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxx.supabase.co" --environment preview --environment production --visibility plaintext
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_KEY --value "sb_publishable_xxxx" --environment preview --environment production --visibility plaintext
```

`init` y `update:configure` modifican `app.json`: hay que commitear y pushear ese cambio.

### Compilar el APK (primera vez, o cuando cambian dependencias nativas)

```bash
npm run build:android
```

Al terminar, EAS muestra un link para descargar e instalar el APK en el celular.

### Publicar cambios por el aire (lo habitual)

```bash
npm run publish -- --message "Qué cambió"
```

Los celulares descargan la versión nueva al abrir la app o al volver a ella, y muestran
un aviso para aplicarla. Si un cambio agrega una librería con código nativo, el runtime
(fingerprint) cambia y hace falta un APK nuevo con `npm run build:android`.

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
│   ├── settle-form.tsx       # modal: registrar pago (monto editable)
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
