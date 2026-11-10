import React from 'react';
import { RainbowWalletProvider } from './components/RainbowWalletProvider';

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => (
  <RainbowWalletProvider>{children}</RainbowWalletProvider>
);
