# MoneyBuddy — Kontomatik bank bridge

Bun služba na VPS (static IP) pro AIS Multiple Access (SignIn REDIRECTION).

## Lokální vývoj

```bash
cd services/kontomatik-bank
cp .env.example .env.local   # doplň KONTOMATIK_API_KEY (nikdy do gitu)
bun install
bun --env-file=.env.local run scripts/selftest-kontomatik.bun.ts
bun --env-file=.env.local run src/index.ts   # potřebuje i Supabase env
```

Selftest bez API klíče spustí fingerprint/dedupe testy; s klíčem navíc live `mock-session` (KontoBank `pl`).

## Endpointy

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | — |
| GET | `/return?redirectionId=` | — (HTTPS → deep link) |
| POST | `/bank/link` | Bearer JWT |
| POST | `/bank/complete` | Bearer JWT |
| POST | `/bank/sync` | Bearer JWT |
| POST | `/bank/disconnect` | Bearer JWT |
| POST | `/bank/dismiss-error` | Bearer JWT |
| POST | `/internal/revoke-all` | `x-internal-secret` |

Poslouchá jen `HOST` (default `127.0.0.1`).

## Deploy (Hetzner)

Služba importuje sdílené `lib/` + `utils/` z kořene monorepa (klasifikace stejná jako PDF/CSV).
Na VPS drž stejnou strukturu cest:

```
/home/deploy/moneybuddy/
  lib/
  utils/
  services/kontomatik-bank/   # WorkingDirectory + .env
```

1. Bun linux-arm64
2. rsync `lib/`, `utils/`, `services/kontomatik-bank/` (bez `.env.local`)
3. `.env` chmod 600 v `services/kontomatik-bank/`
4. `deploy/moneybuddy-bank.service` + sync timer
5. Caddyfile → reverse_proxy `127.0.0.1:8787`, ufw 22+443(+80)
