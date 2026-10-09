# Tamu Express database setup

The application API uses PostgreSQL through `pg` and is designed for Supabase.
The canonical schema is [`supabase_schema.sql`](./supabase_schema.sql).

For Supabase, open **SQL Editor**, paste the full contents of `supabase_schema.sql`,
and run it using a project owner account. For another PostgreSQL host, run:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/supabase_schema.sql
```

Then set `DATABASE_URL` (or `SUPABASE_DB_URL`) and the required Firebase settings
in the server's private environment. Never put database passwords in frontend
files or commit them to Git.

The schema creates application tables and lookup categories without dropping
existing data or installing a shared default administrator password. Create an
administrator credential privately and store only a supported password hash.

`legacy_mysql_schema.sql` is an archived MySQL reference. It contains a database
drop command and is not compatible with the running PostgreSQL API. Do not run it
against a production database.
