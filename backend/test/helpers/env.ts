// Imported first by tests that load modules reading `config` at import time.
process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:1/unused";
