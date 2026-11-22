# Página de invitaciones

Sitio estático en Netlify: **https://clear-accounts-invite.netlify.app** (proyecto `clear-accounts-invite`).

- `/j/<token>` → `join.html`: en Android abre la app con un *intent*
  (`clearaccounts://join/<token>`); si no está instalada, lleva a la descarga del APK.
- No guarda datos. `noindex` y `no-referrer` para que el token no se indexe ni se filtre.
- La versión publicada es pública; las de prueba piden login de Netlify.

Al compilar un APK nuevo, actualizar `DOWNLOAD_URL` en `join.html` y volver a publicar
(los links de descarga de EAS vencen a los 14 días).

La URL base de la app está en `apps/mobile/src/lib/invite.ts`.
