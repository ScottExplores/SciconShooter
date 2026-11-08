import React, { useEffect, useId, useState } from 'react';
import type { WalletChoice } from '../services/evmWalletDiscovery';

interface WalletChooserProps {
  choices: WalletChoice[];
  busyId?: string | null;
  error?: string;
  walletConnectUri?: string;
  onSelect: (choice: WalletChoice) => void;
  onCancel: () => void;
}

export const WalletChooser: React.FC<WalletChooserProps> = ({
  choices,
  busyId,
  error,
  walletConnectUri,
  onSelect,
  onCancel
}) => {
  const titleId = useId();
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    if (!walletConnectUri) {
      setQrUrl('');
      return undefined;
    }
    let cancelled = false;
    void import('qrcode').then(async (qrcode) => {
      const url = await qrcode.toDataURL(walletConnectUri, {
        margin: 1,
        width: 220,
        color: { dark: '#d8fbff', light: '#06111f' }
      });
      if (!cancelled) setQrUrl(url);
    }).catch(() => {
      if (!cancelled) setQrUrl('');
    });
    return () => {
      cancelled = true;
    };
  }, [walletConnectUri]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 font-mono text-cyan-50"
      style={{ background: 'rgba(2, 6, 23, 0.92)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="wallet-chooser"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-[24px] border border-cyan-200/30 text-cyan-50 backdrop-blur-xl"
        style={{
          background: 'rgba(6, 17, 31, 0.98)',
          boxShadow: '0 22px 70px rgba(0,0,0,0.55), 0 0 36px rgba(34,211,238,0.16)'
        }}
      >
        <div className="flex items-center gap-3 border-b border-cyan-200/14 px-4 py-3">
          <img
            src="/game-art/generated/ui/scicon-ui-system-v2/base/records-wallet/wallet-connected-plaque.png"
            alt=""
            className="h-11 w-11 object-contain"
          />
          <div>
            <h2 id={titleId} className="text-sm font-black uppercase tracking-[0.16em] text-white">Connect Wallet</h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">Base</p>
          </div>
        </div>
        <div className="max-h-[62svh] overflow-y-auto">
          {choices.map((choice) => {
            const busy = busyId === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => onSelect(choice)}
                data-testid={`wallet-choice-${choice.id}`}
                className="flex w-full items-center gap-3 border-t border-cyan-200/10 px-4 py-3 text-left transition hover:bg-cyan-300/10 disabled:opacity-70"
              >
                {choice.icon ? (
                  <img src={choice.icon} alt="" className="h-8 w-8 rounded-lg bg-black/40 object-contain" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-[10px] font-black text-cyan-100">
                    {choice.title.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-white">{choice.title}</span>
                  <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-cyan-200/65">
                    {busy ? 'Waiting' : choice.detail}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {qrUrl ? (
          <div className="flex flex-col items-center gap-2 border-t border-cyan-200/12 px-4 py-3">
            <img src={qrUrl} alt="WalletConnect QR code" className="h-40 w-40 rounded-xl" />
            <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">Scan with your wallet</p>
          </div>
        ) : null}
        {error ? (
          <p role="status" className="border-t border-red-300/20 px-4 py-3 text-[11px] leading-relaxed text-red-100">{error}</p>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          data-testid="wallet-chooser-cancel"
          className="block w-full border-t border-cyan-200/12 px-4 py-3 text-left text-sm font-black text-red-200 transition hover:bg-red-500/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
