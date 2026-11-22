import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const here = new URL('.', import.meta.url).pathname;
const migrationsDir = join(here, '..', 'migrations');

const ANA = '00000000-0000-0000-0000-00000000000a';
const BETO = '00000000-0000-0000-0000-00000000000b';
const EVA = '00000000-0000-0000-0000-00000000000e'; // no pertenece al grupo

let db: PGlite;

/** Ejecuta `fn` como el usuario dado, con RLS activo, dentro de una transacción. */
async function as<T>(userId: string, fn: (tx: Pick<PGlite, 'query'>) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.query('set local role authenticated');
    return fn(tx);
  });
}

async function memberId(groupId: string, userId: string): Promise<string> {
  const r = await db.query<{ id: string }>('select id from group_members where group_id = $1 and user_id = $2', [groupId, userId]);
  return r.rows[0]!.id;
}

async function personalGroup(userId: string): Promise<string> {
  const r = await db.query<{ id: string }>(`select id from groups where created_by = $1 and kind = 'personal'`, [userId]);
  return r.rows[0]!.id;
}

let tripId: string;
let anaM: string;
let betoM: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(here, 'auth-stub.sql'), 'utf8'));
  for (const f of readdirSync(migrationsDir).sort()) {
    await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  // Sin grants manuales: los permisos tienen que venir de las migraciones.
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
     ($1, 'ana@example.com', '{"display_name":"Ana"}'),
     ($2, 'beto@example.com', '{"display_name":"Beto"}'),
     ($3, 'eva@example.com', '{}')`,
    [ANA, BETO, EVA],
  );

  // Ana crea un grupo de viaje e invita a Beto.
  tripId = await as(ANA, async (tx) => {
    const r = await tx.query<{ id: string }>(`select create_group('Viaje', 'trip', 'ARS') as id`);
    return r.rows[0]!.id;
  });
  const token = await as(ANA, async (tx) => {
    const r = await tx.query<{ token: string }>(
      `insert into group_invites (group_id, created_by) values ($1, $2) returning token`,
      [tripId, ANA],
    );
    return r.rows[0]!.token;
  });
  await as(BETO, (tx) => tx.query('select accept_invite($1)', [token]));
  anaM = await memberId(tripId, ANA);
  betoM = await memberId(tripId, BETO);
});

describe('alta de usuario', () => {
  it('crea perfil y grupo personal', async () => {
    const r = await db.query<{ display_name: string }>('select display_name from profiles where id = $1', [EVA]);
    expect(r.rows[0]!.display_name).toBe('eva');
    expect(await personalGroup(EVA)).toBeTruthy();
  });
});

describe('save_expense', () => {
  it('guarda un gasto consistente', async () => {
    const id = await as(ANA, async (tx) => {
      const r = await tx.query<{ id: string }>('select save_expense($1) as id', [
        {
          group_id: tripId,
          description: 'Cena',
          amount_minor: 3000000,
          currency: 'ARS',
          split_type: 'equal',
          payers: [{ member_id: anaM, amount_minor: 3000000 }],
          shares: [
            { member_id: anaM, amount_minor: 1500000 },
            { member_id: betoM, amount_minor: 1500000 },
          ],
        },
      ]);
      return r.rows[0]!.id;
    });
    expect(id).toBeTruthy();
    const log = await db.query('select * from activity_log where entity_id = $1', [id]);
    expect(log.rows.length).toBe(1);
  });

  it('rechaza partes que no suman el total', async () => {
    await expect(
      as(ANA, (tx) =>
        tx.query('select save_expense($1)', [
          {
            group_id: tripId,
            description: 'Mal',
            amount_minor: 1000,
            currency: 'ARS',
            payers: [{ member_id: anaM, amount_minor: 1000 }],
            shares: [{ member_id: anaM, amount_minor: 900 }],
          },
        ]),
      ),
    ).rejects.toThrow(/SPLIT_MISMATCH/);
  });

  it('rechaza participantes de otro grupo', async () => {
    const anaPersonalM = await memberId(await personalGroup(ANA), ANA);
    await expect(
      as(ANA, (tx) =>
        tx.query('select save_expense($1)', [
          {
            group_id: tripId,
            description: 'Mezcla',
            amount_minor: 1000,
            currency: 'ARS',
            payers: [{ member_id: anaM, amount_minor: 1000 }],
            shares: [{ member_id: anaPersonalM, amount_minor: 1000 }],
          },
        ]),
      ),
    ).rejects.toThrow(/FOREIGN_MEMBER/);
  });

  it('un no-miembro no puede cargar gastos en el grupo', async () => {
    await expect(
      as(EVA, (tx) =>
        tx.query('select save_expense($1)', [
          {
            group_id: tripId,
            description: 'Intruso',
            amount_minor: 1000,
            currency: 'ARS',
            payers: [{ member_id: anaM, amount_minor: 1000 }],
            shares: [{ member_id: anaM, amount_minor: 1000 }],
          },
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('registro personal y privacidad', () => {
  it('my_ledger incluye mi parte del grupo y mis gastos personales', async () => {
    const betoPersonal = await personalGroup(BETO);
    const betoPersonalM = await memberId(betoPersonal, BETO);
    await as(BETO, (tx) =>
      tx.query('select save_expense($1)', [
        {
          group_id: betoPersonal,
          description: 'Café',
          amount_minor: 350000,
          currency: 'ARS',
          payers: [{ member_id: betoPersonalM, amount_minor: 350000 }],
          shares: [{ member_id: betoPersonalM, amount_minor: 350000 }],
        },
      ]),
    );
    const rows = await as(BETO, async (tx) =>
      (await tx.query<{ description: string; consumed_minor: string; paid_minor: string; is_personal: boolean }>(
        'select description, consumed_minor, paid_minor, is_personal from my_ledger order by description',
      )).rows,
    );
    expect(rows.map((r) => [r.description, Number(r.consumed_minor), Number(r.paid_minor), r.is_personal])).toEqual([
      ['Café', 350000, 350000, true],
      ['Cena', 1500000, 0, false],
    ]);
  });

  it('Ana no ve los gastos personales de Beto', async () => {
    const rows = await as(ANA, async (tx) => (await tx.query(`select * from expenses where description = 'Café'`)).rows);
    expect(rows).toEqual([]);
  });

  it('la recategorización es privada', async () => {
    const cena = (await db.query<{ id: string }>(`select id from expenses where description = 'Cena'`)).rows[0]!.id;
    const travel = (await db.query<{ id: string }>(`select id from categories where system_key = 'travel'`)).rows[0]!.id;
    await as(BETO, (tx) =>
      tx.query('insert into share_category_overrides (user_id, expense_id, category_id) values ($1, $2, $3)', [BETO, cena, travel]),
    );
    const betoSees = await as(BETO, async (tx) =>
      (await tx.query<{ category_id: string }>('select category_id from my_ledger where expense_id = $1', [cena])).rows[0]!.category_id,
    );
    expect(betoSees).toBe(travel);
    const anaSees = await as(ANA, async (tx) => (await tx.query('select * from share_category_overrides')).rows);
    expect(anaSees).toEqual([]);
  });
});

describe('balances y liquidaciones', () => {
  it('group_balances refleja gastos y liquidaciones', async () => {
    await as(BETO, (tx) =>
      tx.query(
        `insert into settlements (group_id, from_member_id, to_member_id, amount_minor, currency, created_by)
         values ($1, $2, $3, 500000, 'ARS', $4)`,
        [tripId, betoM, anaM, BETO],
      ),
    );
    const rows = await as(ANA, async (tx) =>
      (await tx.query<{ member_id: string; balance_minor: string }>(
        'select member_id, balance_minor from group_balances where group_id = $1',
        [tripId],
      )).rows,
    );
    const byMember = Object.fromEntries(rows.map((r) => [r.member_id, Number(r.balance_minor)]));
    expect(byMember).toEqual({ [anaM]: 1000000, [betoM]: -1000000 });
  });
});
