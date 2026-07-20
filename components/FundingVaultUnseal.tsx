import React from 'react';
import '../styles/funding-vault-unseal.css';

export const FUNDING_VAULT_UNSEAL_DURATION_MS = 2184;

interface FundingVaultUnsealProps {
  open?: boolean;
  children?: React.ReactNode;
}

const FundingVaultUnseal: React.FC<FundingVaultUnsealProps> = ({ open = false, children }) => (
  <div
    className={`sci-funding-vault sci-funding-vault--portrait ${open ? 'sci-funding-vault--open' : ''}`}
    role={open ? undefined : 'status'}
    aria-live={open ? undefined : 'polite'}
    aria-label={open ? undefined : 'Opening secure funding vault transmission'}
  >
    <div className="sci-funding-vault__stage" aria-hidden="true">
      <div className="sci-funding-vault__aperture">
        <div className="sci-funding-vault__shutter sci-funding-vault__shutter--left" />
        <div className="sci-funding-vault__shutter sci-funding-vault__shutter--right" />
        <div className="sci-funding-vault__scan"></div>
      </div>
    </div>
    {open && children ? <div className="sci-funding-vault__content">{children}</div> : null}
    <div className="sci-funding-vault__readout" aria-hidden={open}>
      <span>Funding vault</span>
      <strong>Secure channel opening</strong>
    </div>
  </div>
);

export default FundingVaultUnseal;
