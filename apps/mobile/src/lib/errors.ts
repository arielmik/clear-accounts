import { t } from '../i18n';

/** Traduce los códigos de error de la base (ej. "MEMBER_HAS_BALANCE: ...") a texto para el usuario. */
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  for (const [code, text] of Object.entries(t.errors)) {
    if (message.includes(code)) return text;
  }
  return message;
}
