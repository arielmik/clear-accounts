# Clear Accounts

App mobile para compartir gastos entre grupos de personas **y** llevar un registro de gastos personales, en un solo lugar.

- Los participantes de un grupo cargan gastos y la app reparte las deudas.
- Cada usuario tiene además su libro de gastos personales.
- Todo gasto de grupo impacta automáticamente en el registro personal de cada participante (por su parte), para poder analizar el consumo por categoría.

Documento de diseño: [docs/DESIGN.md](docs/DESIGN.md)

## Estructura

| Carpeta | Contenido |
|---|---|
| `packages/core` | Lógica de dominio en TypeScript: repartos, redondeos, balances, simplificación de deudas y registro personal. |
| `supabase/migrations` | Esquema de Postgres, seguridad por fila (RLS), funciones RPC, vistas y categorías. |
| `supabase/tests` | Tests de la base de datos con PGlite (Postgres en WebAssembly, sin Docker). |

## Desarrollo

Requiere Node 22.

```bash
npm install
npm test        # tests de dominio + base de datos
npm run typecheck
```
