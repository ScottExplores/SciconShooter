const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { hasTrustedReceiptProvenance } = require('./runReceiptProvenance');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const PILOT_TEST_WALLET = String(
  process.env.PILOT_TEST_WALLET || '0x3a8d692aabdd4981080a8f6af8375a21359464bf'
).toLowerCase();

// REVAMP(E): The public weekly board and finalizer use the same durable facts.
// Never allow a development environment flag to weaken prize eligibility.
const eligibleWeeklyScoreRows = async (rows, { start, end }) => {
  const candidates = (Array.isArray(rows) ? rows : []).filter((row) => (
    row?.verified === true
    && /^[0-9a-f-]{36}$/i.test(String(row.run_id || ''))
    && /^[0-9a-f]{64}$/i.test(String(row.receipt_hash || ''))
    && String(row.wallet_address || '').toLowerCase() !== PILOT_TEST_WALLET
    && Number.isSafeInteger(Number(row.score)) && Number(row.score) >= 0
  ));
  if (!candidates.length) return [];
  const runIds = [...new Set(candidates.map((row) => String(row.run_id)))];
  const receipts = await fetchSupabaseJson(
    `${RECEIPTS_TABLE}?select=run_id,score,wave,receipt_hash,integrity_status,receipt_provenance_version,run_mode,test_run,finished_at`
      + `&run_id=in.(${runIds.map(encodeURIComponent).join(',')})&limit=${runIds.length}`,
    { headers: supabaseHeaders() }
  );
  const byRunId = new Map((Array.isArray(receipts) ? receipts : []).map((row) => [String(row.run_id), row]));
  return candidates.filter((row) => {
    const receipt = byRunId.get(String(row.run_id));
    const finishedAt = Date.parse(receipt?.finished_at);
    return hasTrustedReceiptProvenance(receipt)
      && receipt.integrity_status === 'server-verified'
      && receipt.run_mode === 'weekly-streak'
      && receipt.test_run === false
      && Number(receipt.score) === Number(row.score)
      && Number(receipt.wave) === Number(row.wave || 1)
      && String(receipt.receipt_hash || '') === String(row.receipt_hash)
      && finishedAt === Date.parse(row.date)
      && finishedAt >= start.getTime() && finishedAt < end.getTime();
  });
};

module.exports = { eligibleWeeklyScoreRows };
