/**
 * Los links de invitación son https (WhatsApp y otras apps solo vuelven cliqueables
 * los links web). La página abre la app con el esquema propio y, si no está
 * instalada, ofrece descargarla. Ver web/invite/ en la raíz del repositorio.
 */
export const INVITE_BASE_URL = 'https://clear-accounts-invite.netlify.app';

export function inviteLink(token: string, base: string = INVITE_BASE_URL): string {
  return `${base.replace(/\/+$/, '')}/j/${encodeURIComponent(token)}`;
}

/** Extrae el token de un link de invitación (https o clearaccounts://). */
export function tokenFromInviteLink(url: string): string | null {
  const match = /\/(?:j|join)\/([A-Za-z0-9_-]{8,})\/?(?:[?#].*)?$/.exec(url);
  return match?.[1] ?? null;
}
