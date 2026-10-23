import type { QueryExecutor } from './database.service';

export const financeRuntimeRole = 'finance_space_runtime';

export async function applyRowSecurity(database: QueryExecutor) {
  const roles = await database.query(
    'SELECT rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=$1',
    [financeRuntimeRole],
  );
  if (roles.length === 0) {
    await database.query(
      'CREATE ROLE finance_space_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
    );
  } else if (roles[0].rolsuper || roles[0].rolbypassrls || roles[0].rolcanlogin) {
    throw new Error('The finance runtime role must be NOLOGIN, NOSUPERUSER and NOBYPASSRLS.');
  }
  await database.query('GRANT finance_space_runtime TO CURRENT_USER');
  await database.query('GRANT USAGE ON SCHEMA public TO finance_space_runtime');
  const owner = await database.query<{ identifier: string }>(
    'SELECT quote_ident(current_user) AS identifier',
  );
  const tables = ['users', 'sessions', 'password_resets', 'records', 'imports'] as const;
  for (const table of tables) {
    await database.query(`REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM PUBLIC`);
    for (const exposedRole of ['anon', 'authenticated']) {
      const existing = await database.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [
        exposedRole,
      ]);
      if (existing.length > 0) {
        await database.query(`REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM ${exposedRole}`);
      }
    }
    await database.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await database.query(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
    await database.query(
      `CREATE POLICY finance_space_maintenance ON public.${table} TO ${owner[0].identifier} USING (true) WITH CHECK (true)`,
    );
    if (table === 'records' || table === 'imports' || table === 'users') {
      const ownerColumn = table === 'users' ? 'id' : 'user_id';
      const condition = `${ownerColumn} = NULLIF(current_setting('finance_space.user_id', true),'')::uuid`;
      await database.query(
        `CREATE POLICY finance_space_owner ON public.${table} TO finance_space_runtime USING (${condition}) WITH CHECK (${condition})`,
      );
    }
  }
  await database.query(
    'GRANT SELECT,INSERT,UPDATE,DELETE ON public.records,public.imports TO finance_space_runtime',
  );
  await database.query('GRANT SELECT(id),UPDATE(id) ON public.users TO finance_space_runtime');
}
