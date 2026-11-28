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

describe('edición de miembros', () => {
  it('no se puede dar de baja a alguien con saldo pendiente', async () => {
    await expect(
      as(ANA, (tx) => tx.query('update group_members set left_at = now() where id = $1', [betoM])),
    ).rejects.toThrow(/MEMBER_HAS_BALANCE/);
  });

  it('un invitado sin movimientos se puede renombrar y dar de baja', async () => {
    const caro = await as(ANA, async (tx) =>
      (await tx.query<{ id: string }>(
        `insert into group_members (group_id, display_name) values ($1, 'Caro') returning id`,
        [tripId],
      )).rows[0]!.id,
    );
    await as(ANA, (tx) => tx.query(`update group_members set display_name = 'Carolina' where id = $1`, [caro]));
    await as(ANA, (tx) => tx.query('update group_members set left_at = now() where id = $1', [caro]));
    const r = await db.query<{ display_name: string; left_at: string | null }>(
      'select display_name, left_at from group_members where id = $1',
      [caro],
    );
    expect(r.rows[0]!.display_name).toBe('Carolina');
    expect(r.rows[0]!.left_at).not.toBeNull();
  });

  it('nadie renombra a otro usuario registrado', async () => {
    await expect(
      as(ANA, (tx) => tx.query(`update group_members set display_name = 'Betito' where id = $1`, [betoM])),
    ).rejects.toThrow(/CANNOT_RENAME_REGISTERED/);
  });

  it('no se puede cambiar el rol ni el usuario de un miembro', async () => {
    await expect(
      as(BETO, (tx) => tx.query(`update group_members set role = 'owner' where id = $1`, [betoM])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(BETO, (tx) => tx.query(`update group_members set user_id = $2 where id = $1`, [anaM, BETO])),
    ).rejects.toThrow(/permission denied/);
  });

  it('update_my_profile cambia el nombre en el perfil y en todos los grupos', async () => {
    await as(BETO, (tx) => tx.query(`select update_my_profile('Roberto')`));
    const names = await db.query<{ display_name: string }>(
      'select display_name from group_members where user_id = $1',
      [BETO],
    );
    expect(names.rows.every((r) => r.display_name === 'Roberto')).toBe(true);
    const p = await db.query<{ display_name: string }>('select display_name from profiles where id = $1', [BETO]);
    expect(p.rows[0]!.display_name).toBe('Roberto');
  });
});

describe('borrado de gastos y baja con saldo en cero', () => {
  it('un gasto borrado sale del registro personal y de los balances', async () => {
    const cena = (await db.query<{ id: string }>(`select id from expenses where description = 'Cena'`)).rows[0]!.id;
    await as(ANA, (tx) => tx.query('update expenses set deleted_at = now() where id = $1', [cena]));

    const ledger = await as(BETO, async (tx) => (await tx.query(`select * from my_ledger where expense_id = $1`, [cena])).rows);
    expect(ledger).toEqual([]);

    // Queda solo la liquidación de 5.000: Beto +5.000, Ana -5.000.
    const rows = await as(ANA, async (tx) =>
      (await tx.query<{ member_id: string; balance_minor: string }>(
        'select member_id, balance_minor from group_balances where group_id = $1',
        [tripId],
      )).rows,
    );
    expect(Object.fromEntries(rows.map((r) => [r.member_id, Number(r.balance_minor)]))).toEqual({
      [anaM]: -500000,
      [betoM]: 500000,
    });
  });

  it('con las cuentas saldadas, el miembro se puede dar de baja', async () => {
    await as(ANA, (tx) =>
      tx.query(
        `insert into settlements (group_id, from_member_id, to_member_id, amount_minor, currency, created_by)
         values ($1, $2, $3, 500000, 'ARS', $4)`,
        [tripId, anaM, betoM, ANA],
      ),
    );
    await as(ANA, (tx) => tx.query('update group_members set left_at = now() where id = $1', [betoM]));
    // Beto ya no ve el grupo.
    const visible = await as(BETO, async (tx) => (await tx.query('select id from groups where id = $1', [tripId])).rows);
    expect(visible).toEqual([]);
  });

  it('my_ledger expone created_at para ordenar', async () => {
    const cols = await as(BETO, async (tx) => (await tx.query('select created_at from my_ledger limit 1')).rows);
    expect(cols[0]).toHaveProperty('created_at');
  });
});

describe('imágenes', () => {
  const upload = (tx: Pick<PGlite, 'query'>, name: string) =>
    tx.query(`insert into storage.objects (bucket_id, name) values ('images', $1)`, [name]);

  it('ticket: lo asigna un miembro, lo ven solo los miembros y no toca el gasto ni el historial', async () => {
    const expenseId = await as(ANA, async (tx) => {
      const r = await tx.query<{ id: string }>('select save_expense($1) as id', [
        {
          group_id: tripId, description: 'Súper', amount_minor: 100000, currency: 'ARS', split_type: 'equal',
          payers: [{ member_id: anaM, amount_minor: 100000 }],
          shares: [{ member_id: anaM, amount_minor: 100000 }],
        },
      ]);
      return r.rows[0]!.id;
    });
    const logBefore = await db.query('select * from activity_log where entity_id = $1', [expenseId]);
    const first = `groups/${tripId}/ticket1.jpg`;
    const second = `groups/${tripId}/ticket2.jpg`;

    const old1 = await as(ANA, async (tx) => {
      await upload(tx, first);
      const r = await tx.query<{ old: string | null }>('select set_expense_receipt($1, $2) as old', [expenseId, first]);
      return r.rows[0]!.old;
    });
    expect(old1).toBeNull();
    const old2 = await as(ANA, async (tx) => {
      const r = await tx.query<{ old: string | null }>('select set_expense_receipt($1, $2) as old', [expenseId, second]);
      return r.rows[0]!.old;
    });
    expect(old2).toBe(first);

    const seen = await as(ANA, (tx) => tx.query<{ path: string }>('select path from expense_receipts where expense_id = $1', [expenseId]));
    expect(seen.rows[0]!.path).toBe(second);
    const hidden = await as(EVA, (tx) => tx.query('select path from expense_receipts where expense_id = $1', [expenseId]));
    expect(hidden.rows).toHaveLength(0);

    await expect(
      as(EVA, (tx) => tx.query('select set_expense_receipt($1, $2)', [expenseId, null])),
    ).rejects.toThrow(/NOT_A_MEMBER/);
    const other = await personalGroup(ANA);
    await expect(
      as(ANA, (tx) => tx.query('select set_expense_receipt($1, $2)', [expenseId, `groups/${other}/x.jpg`])),
    ).rejects.toThrow(/INVALID_IMAGE_PATH/);

    await as(ANA, (tx) => tx.query('select set_expense_receipt($1, null)', [expenseId]));
    const gone = await db.query('select * from expense_receipts where expense_id = $1', [expenseId]);
    expect(gone.rows).toHaveLength(0);
    const logAfter = await db.query('select * from activity_log where entity_id = $1', [expenseId]);
    expect(logAfter.rows.length).toBe(logBefore.rows.length);
  });

  it('un miembro sube y asigna la imagen del grupo', async () => {
    const path = `groups/${tripId}/foto.jpg`;
    await as(ANA, async (tx) => {
      await upload(tx, path);
      await tx.query('select set_group_image($1, $2)', [tripId, path]);
    });
    const r = await db.query<{ image_path: string }>('select image_path from groups where id = $1', [tripId]);
    expect(r.rows[0]!.image_path).toBe(path);
  });

  it('un no-miembro no puede subir ni asignar imágenes del grupo', async () => {
    await expect(as(EVA, (tx) => upload(tx, `groups/${tripId}/intruso.jpg`))).rejects.toThrow(/row-level security/);
    await expect(
      as(EVA, (tx) => tx.query('select set_group_image($1, $2)', [tripId, `groups/${tripId}/x.jpg`])),
    ).rejects.toThrow(/NOT_A_MEMBER/);
  });

  it('color del grupo: lo cambia un miembro, solo con valores de la paleta', async () => {
    await as(ANA, (tx) => tx.query('select set_group_color($1, $2)', [tripId, 'lilac']));
    const r = await db.query<{ color: string }>('select color from groups where id = $1', [tripId]);
    expect(r.rows[0]!.color).toBe('lilac');
    // El grupo personal también elige color (incluido el menta por defecto).
    const personal = await personalGroup(ANA);
    await as(ANA, (tx) => tx.query('select set_group_color($1, $2)', [personal, 'mint']));
    await as(ANA, (tx) => tx.query("select set_group_color($1, $2)", [tripId, "orange"]));
    await expect(
      as(ANA, (tx) => tx.query('select set_group_color($1, $2)', [tripId, '#ff0000'])),
    ).rejects.toThrow(/check constraint/);
    await expect(
      as(EVA, (tx) => tx.query('select set_group_color($1, $2)', [tripId, 'sun'])),
    ).rejects.toThrow(/NOT_A_MEMBER/);
  });

  it('la ruta de la imagen tiene que ser del mismo grupo', async () => {
    const other = await personalGroup(ANA);
    await expect(
      as(ANA, (tx) => tx.query('select set_group_image($1, $2)', [tripId, `groups/${other}/x.jpg`])),
    ).rejects.toThrow(/INVALID_IMAGE_PATH/);
  });

  it('avatar: solo el dueño lo sube; lo ve quien comparte grupo, no un extraño', async () => {
    const path = `users/${ANA}/avatar.jpg`;
    await as(ANA, async (tx) => {
      await upload(tx, path);
      await tx.query('select set_my_avatar($1)', [path]);
    });
    await expect(as(BETO, (tx) => upload(tx, `users/${ANA}/falso.jpg`))).rejects.toThrow(/row-level security/);
    await expect(as(BETO, (tx) => tx.query('select set_my_avatar($1)', [path]))).rejects.toThrow(/INVALID_IMAGE_PATH/);

    const seenBy = async (user: string) =>
      as(user, async (tx) => (await tx.query(`select name from storage.objects where name = $1`, [path])).rows.length);
    expect(await seenBy(ANA)).toBe(1);
    expect(await seenBy(EVA)).toBe(0);
  });

  it('las tablas clave están publicadas para tiempo real', async () => {
    const r = await db.query<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`,
    );
    expect(r.rows.map((x) => x.tablename)).toEqual(['expenses', 'group_members', 'groups', 'profiles', 'settlements']);
  });
});

describe('corrección de fechas de pagos', () => {
  it('un pago de las 23 hs de Argentina queda con la fecha local', async () => {
    const id = (
      await db.query<{ id: string }>(
        `insert into settlements (group_id, from_member_id, to_member_id, amount_minor, currency, paid_at, created_by, created_at)
         values ($1, $2, $3, 100, 'ARS', '2026-11-23', $4, '2026-11-23T02:00:00Z') returning id`,
        [tripId, anaM, betoM, ANA],
      )
    ).rows[0]!.id;
    const dir = join(migrationsDir, '20261122000300_fix_payment_dates.sql');
    await db.exec(readFileSync(dir, 'utf8'));
    const r = await db.query<{ paid_at: string }>(`select paid_at::text from settlements where id = $1`, [id]);
    expect(r.rows[0]!.paid_at).toBe('2026-11-22');
  });
});

describe('endurecimiento', () => {
  it('sin sesión (anon) no se puede ejecutar ninguna función', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('set local role anon');
        await tx.query('select is_group_member($1)', [tripId]);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it('con sesión, las RPC de la app siguen funcionando', async () => {
    const id = await as(ANA, async (tx) =>
      (await tx.query<{ id: string }>(`select create_group('Post hardening', 'other', 'ARS') as id`)).rows[0]!.id,
    );
    expect(id).toBeTruthy();
    const cats = await as(ANA, async (tx) => (await tx.query('select count(*)::int as n from categories')).rows[0]);
    expect(cats).toEqual({ n: 33 });
  });
});

describe('categorías propias', () => {
  it('cada uno crea las suyas y no ve las de otros', async () => {
    const food = (await db.query<{ id: string }>(`select id from categories where system_key = 'food'`)).rows[0]!.id;
    const mine = await as(ANA, async (tx) =>
      (await tx.query<{ id: string }>(
        `insert into categories (owner_id, name, icon, parent_id) values ($1, 'Café de especialidad', '☕', $2) returning id`,
        [ANA, food],
      )).rows[0]!.id,
    );
    const seen = await as(BETO, async (tx) => (await tx.query('select id from categories where id = $1', [mine])).rows);
    expect(seen).toEqual([]);
    // Beto no puede colgar una categoría de la de Ana.
    await expect(
      as(BETO, (tx) => tx.query(`insert into categories (owner_id, name, parent_id) values ($1, 'X', $2)`, [BETO, mine])),
    ).rejects.toThrow(/row-level security/);
    // Ni crear categorías a nombre de otro.
    await expect(
      as(BETO, (tx) => tx.query(`insert into categories (owner_id, name) values ($1, 'X')`, [ANA])),
    ).rejects.toThrow(/row-level security/);
  });

  it('no se puede recategorizar con una categoría ajena', async () => {
    const anaCat = (await db.query<{ id: string }>(`select id from categories where owner_id = $1 limit 1`, [ANA])).rows[0]!.id;
    const exp = (await db.query<{ id: string }>(`select id from expenses where description = 'Café'`)).rows[0]!.id;
    await expect(
      as(BETO, (tx) =>
        tx.query('insert into share_category_overrides (user_id, expense_id, category_id) values ($1, $2, $3)', [BETO, exp, anaCat]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('eliminar grupo', () => {
  let groupId: string;
  let a: string;
  let e: string;

  beforeAll(async () => {
    groupId = await as(ANA, async (tx) =>
      (await tx.query<{ id: string }>(`select create_group('Para borrar', 'other', 'ARS') as id`)).rows[0]!.id,
    );
    a = await memberId(groupId, ANA);
    e = (
      await as(ANA, async (tx) =>
        (await tx.query<{ id: string }>(`insert into group_members (group_id, display_name) values ($1, 'Invitada') returning id`, [groupId])).rows[0]!.id,
      )
    );
    await as(ANA, (tx) =>
      tx.query('select save_expense($1)', [
        {
          group_id: groupId, description: 'Regalo', amount_minor: 1000, currency: 'ARS',
          payers: [{ member_id: a, amount_minor: 1000 }],
          shares: [{ member_id: a, amount_minor: 500 }, { member_id: e, amount_minor: 500 }],
        },
      ]),
    );
  });

  it('con saldos pendientes no se puede eliminar', async () => {
    await expect(as(ANA, (tx) => tx.query('select delete_group($1)', [groupId]))).rejects.toThrow(/GROUP_NOT_SETTLED/);
  });

  it('un no-miembro no puede eliminarlo', async () => {
    await expect(as(EVA, (tx) => tx.query('select delete_group($1)', [groupId]))).rejects.toThrow(/NOT_A_MEMBER/);
  });

  it('saldado, se elimina; sus gastos siguen en el registro personal y no se cargan nuevos', async () => {
    await as(ANA, (tx) =>
      tx.query(
        `insert into settlements (group_id, from_member_id, to_member_id, amount_minor, currency, created_by) values ($1, $2, $3, 500, 'ARS', $4)`,
        [groupId, e, a, ANA],
      ),
    );
    await as(ANA, (tx) => tx.query('select delete_group($1)', [groupId]));
    const deleted = await db.query<{ deleted_at: string | null }>('select deleted_at from groups where id = $1', [groupId]);
    expect(deleted.rows[0]!.deleted_at).not.toBeNull();

    const ledger = await as(ANA, async (tx) =>
      (await tx.query(`select description from my_ledger where group_id = $1`, [groupId])).rows,
    );
    expect(ledger).toEqual([{ description: 'Regalo' }]);

    await expect(
      as(ANA, (tx) =>
        tx.query('select save_expense($1)', [
          {
            group_id: groupId, description: 'Tarde', amount_minor: 100, currency: 'ARS',
            payers: [{ member_id: a, amount_minor: 100 }], shares: [{ member_id: a, amount_minor: 100 }],
          },
        ]),
      ),
    ).rejects.toThrow(/GROUP_DELETED/);
  });

  it('el grupo personal no se puede eliminar', async () => {
    const personal = await personalGroup(ANA);
    await expect(as(ANA, (tx) => tx.query('select delete_group($1)', [personal]))).rejects.toThrow(/CANNOT_DELETE_PERSONAL/);
  });
});

describe('convención de seguridad', () => {
  it('ninguna función pública es ejecutable sin sesión (anon)', async () => {
    const r = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(r.rows.map((x) => x.proname)).toEqual([]);
  });
});

describe('notificaciones push', () => {
  const ANA_TOKEN = 'ExponentPushToken[ana]';
  const BETO_TOKEN = 'ExponentPushToken[beto]';

  async function newExpense(userId: string, groupId: string, memberIdForAll: string): Promise<string> {
    return as(userId, async (tx) => {
      const r = await tx.query<{ id: string }>('select save_expense($1) as id', [
        {
          group_id: groupId,
          description: 'Nafta',
          amount_minor: 100000,
          currency: 'ARS',
          split_type: 'equal',
          payers: [{ member_id: memberIdForAll, amount_minor: 100000 }],
          shares: [{ member_id: memberIdForAll, amount_minor: 100000 }],
        },
      ]);
      return r.rows[0]!.id;
    });
  }

  let casaId: string;
  let anaCasa: string;

  beforeAll(async () => {
    casaId = await as(ANA, async (tx) => {
      const r = await tx.query<{ id: string }>(`select create_group('Casa', 'home', 'ARS') as id`);
      return r.rows[0]!.id;
    });
    const invite = await as(ANA, async (tx) => {
      const r = await tx.query<{ token: string }>(
        `insert into group_invites (group_id, created_by) values ($1, $2) returning token`,
        [casaId, ANA],
      );
      return r.rows[0]!.token;
    });
    await as(BETO, (tx) => tx.query('select accept_invite($1)', [invite]));
    anaCasa = await memberId(casaId, ANA);
    await as(ANA, (tx) => tx.query(`select register_push_token($1, 'android')`, [ANA_TOKEN]));
    await as(BETO, (tx) => tx.query(`select register_push_token($1, 'android')`, [BETO_TOKEN]));
  });

  it('avisa a los demás miembros, no al autor, y una sola vez', async () => {
    const id = await newExpense(ANA, casaId, anaCasa);
    const r = await db.query<{ token: string; actor_name: string; group_name: string }>(
      'select * from claim_expense_push($1, $2)',
      [id, ANA],
    );
    expect(r.rows.map((x) => x.token)).toEqual([BETO_TOKEN]);
    expect(r.rows[0]).toMatchObject({ actor_name: 'Ana', group_name: 'Casa' });
    const again = await db.query('select * from claim_expense_push($1, $2)', [id, ANA]);
    expect(again.rows).toEqual([]);
  });

  it('no avisa si quien lo pide no es el autor', async () => {
    const id = await newExpense(ANA, casaId, anaCasa);
    const r = await db.query('select * from claim_expense_push($1, $2)', [id, BETO]);
    expect(r.rows).toEqual([]);
  });

  it('los gastos personales no notifican', async () => {
    const personal = await personalGroup(ANA);
    const id = await newExpense(ANA, personal, await memberId(personal, ANA));
    const r = await db.query('select * from claim_expense_push($1, $2)', [id, ANA]);
    expect(r.rows).toEqual([]);
  });

  it('si otra persona entra en el mismo celular, el token pasa a ella', async () => {
    await as(EVA, (tx) => tx.query(`select register_push_token($1, 'android')`, [BETO_TOKEN]));
    const owner = await db.query<{ user_id: string }>('select user_id from push_tokens where token = $1', [BETO_TOKEN]);
    expect(owner.rows[0]!.user_id).toBe(EVA);
    // Beto no puede darlo de baja (ya no es suyo); Eva sí.
    await as(BETO, (tx) => tx.query('select unregister_push_token($1)', [BETO_TOKEN]));
    expect((await db.query('select 1 from push_tokens where token = $1', [BETO_TOKEN])).rows.length).toBe(1);
    await as(EVA, (tx) => tx.query('select unregister_push_token($1)', [BETO_TOKEN]));
    expect((await db.query('select 1 from push_tokens where token = $1', [BETO_TOKEN])).rows.length).toBe(0);
  });

  it('la Edge Function (service_role) reclama el aviso y la transacción confirma', async () => {
    await as(BETO, (tx) => tx.query(`select register_push_token($1, 'android')`, [BETO_TOKEN]));
    const id = await newExpense(ANA, casaId, anaCasa);
    // Como en producción: rol service_role y COMMIT real (los triggers diferidos de expenses corren al confirmar).
    const r = await db.transaction(async (tx) => {
      await tx.query('set local role service_role');
      return tx.query<{ token: string }>('select token from claim_expense_push($1, $2)', [id, ANA]);
    });
    expect(r.rows.map((x) => x.token)).toEqual([BETO_TOKEN]);
    // No deja una "edición" falsa en el historial del gasto.
    const log = await db.query(`select action from activity_log where entity_id = $1`, [id]);
    expect(log.rows).toEqual([{ action: 'insert' }]);
  });

  it('la app no puede leer tokens ni pedir los destinatarios', async () => {
    await expect(as(ANA, (tx) => tx.query('select * from push_tokens'))).rejects.toThrow(/permission denied/);
    await expect(
      as(ANA, (tx) => tx.query('select * from claim_expense_push($1, $2)', [tripId, ANA])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('medios de pago', () => {
  let groupId: string;
  let anaG: string;
  let betoG: string;

  beforeAll(async () => {
    groupId = await as(ANA, async (tx) =>
      (await tx.query<{ id: string }>(`select create_group('Medios de pago', 'other', 'ARS') as id`)).rows[0]!.id,
    );
    const token = await as(ANA, async (tx) =>
      (await tx.query<{ token: string }>(`insert into group_invites (group_id, created_by) values ($1, $2) returning token`, [groupId, ANA]))
        .rows[0]!.token,
    );
    await as(BETO, (tx) => tx.query('select accept_invite($1)', [token]));
    anaG = await memberId(groupId, ANA);
    betoG = await memberId(groupId, BETO);
  });

  const cenaCon = (pm: string | null | undefined, id?: string) => ({
    ...(id ? { id } : {}),
    group_id: groupId,
    description: 'Cena con medio de pago',
    amount_minor: 2000,
    currency: 'ARS',
    split_type: 'equal',
    payers: [{ member_id: anaG, amount_minor: 2000 }],
    shares: [
      { member_id: anaG, amount_minor: 1000 },
      { member_id: betoG, amount_minor: 1000 },
    ],
    ...(pm !== undefined ? { payment_method_id: pm } : {}),
  });
  const systemMethod = async (key: string) =>
    (await db.query<{ id: string }>('select id from payment_methods where system_key = $1', [key])).rows[0]!.id;
  const ledgerMethod = async (user: string, expenseId: string) =>
    as(user, async (tx) =>
      (await tx.query<{ payment_method_id: string | null }>('select payment_method_id from my_ledger where expense_id = $1', [expenseId]))
        .rows[0]!.payment_method_id,
    );

  it('es opcional, privado de quien lo carga y se ve en su registro personal', async () => {
    const credit = await systemMethod('credit');
    // Sin medio de pago: el gasto se guarda igual.
    const sin = await as(ANA, async (tx) => (await tx.query<{ id: string }>('select save_expense($1) as id', [cenaCon(undefined)])).rows[0]!.id);
    expect(await ledgerMethod(ANA, sin)).toBeNull();

    const id = await as(ANA, async (tx) => (await tx.query<{ id: string }>('select save_expense($1) as id', [cenaCon(credit)])).rows[0]!.id);
    expect(await ledgerMethod(ANA, id)).toBe(credit);
    // Beto comparte el gasto pero no ve con qué pagó Ana.
    expect(await ledgerMethod(BETO, id)).toBeNull();
    expect(await as(BETO, async (tx) => (await tx.query('select * from expense_payment_methods')).rows)).toEqual([]);

    // Editar sin mandar el campo no lo toca; con null, lo quita.
    await as(ANA, (tx) => tx.query('select save_expense($1)', [cenaCon(undefined, id)]));
    expect(await ledgerMethod(ANA, id)).toBe(credit);
    await as(ANA, (tx) => tx.query('select save_expense($1)', [cenaCon(null, id)]));
    expect(await ledgerMethod(ANA, id)).toBeNull();
  });

  it('cada uno crea los suyos, no ve los de otros y no puede usar uno ajeno', async () => {
    const mine = await as(ANA, async (tx) =>
      (await tx.query<{ id: string }>(`insert into payment_methods (owner_id, name, icon) values ($1, 'Visa del banco', '💳') returning id`, [ANA]))
        .rows[0]!.id,
    );
    expect(await as(BETO, async (tx) => (await tx.query('select id from payment_methods where id = $1', [mine])).rows)).toEqual([]);
    await expect(
      as(BETO, (tx) => tx.query(`insert into payment_methods (owner_id, name) values ($1, 'X')`, [ANA])),
    ).rejects.toThrow(/row-level security/);

    const id = await as(ANA, async (tx) => (await tx.query<{ id: string }>('select save_expense($1) as id', [cenaCon(mine)])).rows[0]!.id);
    expect(await ledgerMethod(ANA, id)).toBe(mine);
    // Beto no puede usar el medio de Ana en su parte (y el gasto no se guarda a medias).
    await expect(as(BETO, (tx) => tx.query('select save_expense($1)', [cenaCon(mine, id)]))).rejects.toThrow(/row-level security/);
  });
});
