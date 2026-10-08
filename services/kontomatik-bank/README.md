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

1. Bun linux-arm64, zkopíruj službu do `/home/deploy/moneybuddy-bank`
2. `.env` chmod 600 (ne `.env.local` v gitu)
3. `deploy/moneybuddy-bank.service` + sync timer
4. Až DNS: Caddyfile → reverse_proxy `127.0.0.1:8787`, ufw 22+443(+80)
