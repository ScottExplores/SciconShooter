import React from 'react';
import { PLAY_BUILD } from './services/playBuild';

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  // The Play origin never mounts RainbowKit, wagmi, or WalletConnect.
  if (PLAY_BUILD) return <>{children}</>;
  const RainbowWalletProvider = React.lazy(() =>
    import('./components/RainbowWalletProvider').then((module) => ({
      default: module.RainbowWalletProvider
    }))
  );
  return (
    <React.Suspense fallback={null}>
      <RainbowWalletProvider>{children}</RainbowWalletProvider>
    </React.Suspense>
  );
};
