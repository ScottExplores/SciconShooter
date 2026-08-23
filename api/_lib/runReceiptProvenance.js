const CURRENT_RECEIPT_PROVENANCE_VERSION = 1;

const hasTrustedReceiptProvenance = (row) => (
  Number(row?.receipt_provenance_version) === CURRENT_RECEIPT_PROVENANCE_VERSION
);

const requireTrustedReceiptProvenance = (row) => {
  if (hasTrustedReceiptProvenance(row)) return row;
  throw Object.assign(
    new Error('This legacy run predates trusted receipt provenance and cannot authorize a wallet action.'),
    {
      statusCode: 409,
      code: 'RUN_RECEIPT_PROVENANCE_UNTRUSTED'
    }
  );
};

module.exports = {
  CURRENT_RECEIPT_PROVENANCE_VERSION,
  hasTrustedReceiptProvenance,
  requireTrustedReceiptProvenance
};
