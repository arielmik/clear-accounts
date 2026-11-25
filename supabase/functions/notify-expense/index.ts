// Edge Function: avisa por push a los demás miembros del grupo que se cargó un gasto.
// La app la llama justo después de guardar un gasto nuevo, con { expense_id }.
// Toda la validación (autor, grupo no personal, una sola vez) vive en claim_expense_push.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

interface Target {
  token: string;
  actor_name: string;
  group_id: string;
  group_name: string;
  description: string;
  amount_minor: number;
  currency: string;
}

function formatMoney(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const value = Number(minor) / 10 ** digits;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (!auth.user) return json(401, { error: 'NOT_AUTHENTICATED' });

  const { expense_id } = await req.json().catch(() => ({}));
  if (typeof expense_id !== 'string') return json(400, { error: 'MISSING_EXPENSE_ID' });

  const { data, error } = await admin.rpc('claim_expense_push', { p_expense_id: expense_id, p_actor: auth.user.id });
  if (error) return json(500, { error: error.message });
  const targets = (data ?? []) as Target[];
  if (targets.length === 0) return json(200, { sent: 0 });

  const messages = targets.map((t) => ({
    to: t.token,
    channelId: 'expenses',
    sound: 'default',
    title: t.group_name,
    body: `${t.actor_name} agregó "${t.description}" · ${formatMoney(t.amount_minor, t.currency)}`,
    data: { groupId: t.group_id, expenseId: expense_id },
  }));

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => null);
  if (!res.ok) return json(502, { error: 'EXPO_PUSH_FAILED', detail: result });

  // Tokens de apps desinstaladas o con permisos revocados: se borran para no reintentar.
  const tickets: { status: string; details?: { error?: string } }[] = result?.data ?? [];
  const dead = tickets.flatMap((tk, i) => (tk.details?.error === 'DeviceNotRegistered' ? [messages[i]!.to] : []));
  if (dead.length) await admin.rpc('forget_push_tokens', { p_tokens: dead });

  return json(200, { sent: tickets.filter((tk) => tk.status === 'ok').length, removed: dead.length });
});
