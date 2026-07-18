import React from 'react';
import '../styles/funding-vault-unseal.css';

export const FUNDING_VAULT_UNSEAL_DURATION_MS = 2184;

const VAULT_PARTS_ROOT = '/game-art/generated/ui/scicon-ui-system-v2/animations/funding-vault-unseal/parts';

const FundingVaultUnseal: React.FC = () => (
  <div className="sci-funding-vault" role="status" aria-live="polite" aria-label="Opening secure funding vault transmission">
    <div className="sci-funding-vault__stage" aria-hidden="true">
      <img className="sci-funding-vault__glow" src={`${VAULT_PARTS_ROOT}/energy-glow.png`} alt="" />
      <img className="sci-funding-vault__beam" src={`${VAULT_PARTS_ROOT}/energy-beam.png`} alt="" />
      <img className="sci-funding-vault__ring" src={`${VAULT_PARTS_ROOT}/energy-ring.png`} alt="" />
      <img className="sci-funding-vault__core" src={`${VAULT_PARTS_ROOT}/research-core.png`} alt="" />
      <img className="sci-funding-vault__frame" src={`${VAULT_PARTS_ROOT}/vault-frame-body.png`} alt="" />
      <img className="sci-funding-vault__shutter sci-funding-vault__shutter--left" src={`${VAULT_PARTS_ROOT}/shutter-left.png`} alt="" />
      <img className="sci-funding-vault__shutter sci-funding-vault__shutter--right" src={`${VAULT_PARTS_ROOT}/shutter-right.png`} alt="" />
      <img className="sci-funding-vault__seal" src={`${VAULT_PARTS_ROOT}/mechanical-seal.png`} alt="" />
      <div className="sci-funding-vault__scan"></div>
    </div>
    <div className="sci-funding-vault__readout">
      <span>Funding vault</span>
      <strong>Secure channel opening</strong>
    </div>
  </div>
);

export default FundingVaultUnseal;
