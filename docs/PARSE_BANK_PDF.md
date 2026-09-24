# Bank PDF parsing

Production uses Edge Function **`parse-bank-pdf-v2`**.

URL:

`https://<project>.supabase.co/functions/v1/parse-bank-pdf-v2`

The app calls it via `lib/parse-bank-pdf-api.ts` (`parseBankPdfWithPdfCo`).

Legacy `parse-bank-pdf` (v1) was removed (2026-09).
