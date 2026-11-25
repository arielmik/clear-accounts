# Página de invitaciones

Sitio estático en Netlify: **https://clear-accounts-invite.netlify.app** (proyecto `clear-accounts-invite`).

- `/j/<token>` → `join.html`: en Android abre la app con un *intent*
  (`clearaccounts://join/<token>`); si no está instalada, lleva a la descarga del APK.
- No guarda datos. `noindex` y `no-referrer` para que el token no se indexe ni se filtre.
- La versión publicada es pública; las de prueba piden login de Netlify.

El APK se sirve desde el propio sitio en **`/clear-accounts.apk`** (link fijo que no vence,
a diferencia de los de EAS, que vencen a los 14 días). No se guarda en git (`*.apk` está en
`.gitignore`). Al compilar un APK nuevo:

```bash
curl -L -o web/invite/clear-accounts.apk <link del APK en EAS>
```

y volver a publicar esta carpeta en Netlify (incluyendo el APK).

La URL base de la app está en `apps/mobile/src/lib/invite.ts`.
