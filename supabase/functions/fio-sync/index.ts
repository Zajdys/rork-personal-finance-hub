import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { fio_token, user_id } = await req.json()

  if (!fio_token || !user_id) {
    return new Response(JSON.stringify({ error: 'missing params' }), { status: 400 })
  }

  const dateTo = new Date().toISOString().split('T')[0]
  const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]

  const fioRes = await fetch(
    `https://fioapi.fio.cz/v1/rest/periods/${fio_token}/${dateFrom}/${dateTo}/transactions.json`
  )

  if (!fioRes.ok) {
    return new Response(JSON.stringify({ error: 'Fio API error', status: fioRes.status }), { status: 400 })
  }

  const fioData = await fioRes.json()
  const rawTxs = fioData?.accountStatement?.transactionList?.transaction ?? []

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const batchId = crypto.randomUUID()

  const transactions = rawTxs.map((tx: any) => {
    const amount = tx.column1?.value ?? 0
    const description = tx.column16?.value ?? tx.column25?.value ?? ''
    const date = tx.column0?.value?.split('+')[0]?.split('T')[0] ?? dateTo
    const fioId = String(tx.column22?.value ?? '').trim()
    const external_id = fioId ? `fio:${fioId}` : ''
    const unique_key = fioId
      ? `${user_id}|fio|txid:${fioId}`
      : `${user_id}|fio|${date}|${Math.abs(Number(amount)).toFixed(2)}|${String(description).trim().toLowerCase().replace(/\s+/g, ' ')}`

    return {
      user_id,
      date,
      amount: Math.abs(amount),
      type: amount >= 0 ? 'income' : 'expense',
      category: 'Ostatní',
      description,
      source: 'fio',
      external_id,
      unique_key,
      import_batch_id: batchId,
      category_type: 'personal',
    }
  }).filter((tx: any) => tx.external_id)

  const { data: existing } = await supabase
    .from('transactions')
    .select('external_id, unique_key')
    .eq('user_id', user_id)
    .eq('source', 'fio')
    .not('external_id', 'is', null)

  const existingIds = new Set((existing ?? []).map((r: any) => r.external_id))
  // Zpětná kompatibilita se starými Fio řádky bez prefixu `fio:`
  for (const r of existing ?? []) {
    const ext = String(r.external_id ?? '')
    if (ext.startsWith('fio:')) existingIds.add(ext.slice(4))
    else if (ext) existingIds.add(`fio:${ext}`)
  }
  const newTxs = transactions.filter((tx: any) => {
    const raw = String(tx.external_id).replace(/^fio:/, '')
    return !existingIds.has(tx.external_id) && !existingIds.has(raw)
  })

  if (newTxs.length > 0) {
    await supabase.from('transactions').upsert(newTxs, {
      onConflict: 'user_id,unique_key',
      ignoreDuplicates: true,
    })
  }

  return new Response(JSON.stringify({ imported: newTxs.length, total: transactions.length }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
