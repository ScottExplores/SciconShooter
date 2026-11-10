import React, { useEffect } from 'react';
import '@rainbow-me/rainbowkit/styles.css';
import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';
import { sciconWagmiConfig } from '../services/rainbowWalletConfig';
import '../styles/rainbowkit-scicon.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false
    }
  }
});

const sciconTheme = darkTheme({
  accentColor: '#22d3ee',
  accentColorForeground: '#041018',
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small'
});

const theme = {
  ...sciconTheme,
  colors: {
    ...sciconTheme.colors,
    accentColor: '#22d3ee',
    accentColorForeground: '#041018',
    modalBackground: '#06111f',
    modalBorder: 'rgba(34, 211, 238, 0.38)',
    modalText: '#e7fbff',
    modalTextSecondary: '#facc15',
    modalTextDim: 'rgba(186, 230, 253, 0.72)',
    generalBorder: 'rgba(56, 189, 248, 0.28)',
    generalBorderDim: 'rgba(34, 211, 238, 0.16)',
    menuItemBackground: 'rgba(34, 211, 238, 0.08)',
    profileForeground: '#071421',
    closeButton: '#e7fbff',
    closeButtonBackground: 'rgba(34, 211, 238, 0.12)',
    connectionIndicator: '#22d3ee',
    selectedOptionBorder: '#38bdf8'
  },
  fonts: {
    body: "'Orbitron', 'Inter', ui-sans-serif, system-ui, sans-serif"
  },
  shadows: {
    ...sciconTheme.shadows,
    dialog: '0 22px 70px rgba(0, 0, 0, 0.55), 0 0 36px rgba(34, 211, 238, 0.18)'
  },
  radii: {
    ...sciconTheme.radii,
    modal: '18px',
    modalMobile: '18px'
  }
};

/**
 * The homepage button stays the game's Connect Wallet control. This provider
 * only mounts RainbowKit's modal. Body scrolling stays locked for the game,
 * and is released while the dialog is open so the wallet list can move.
 */
const RainbowModalScroll: React.FC = () => {
  useEffect(() => {
    const previous = document.body.style.touchAction;
    const sync = () => {
      const dialog = document.querySelector('[data-rk] [role="dialog"]');
      document.body.style.touchAction = dialog ? 'pan-y' : 'none';
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.body.style.touchAction = previous;
    };
  }, []);
  return null;
};

export const RainbowWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <WagmiProvider config={sciconWagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider
        initialChain={base}
        modalSize="compact"
        theme={theme}
        appInfo={{
          appName: 'SciCon Shooter',
          learnMoreUrl: 'https://www.sciconshooter.xyz'
        }}
      >
        <RainbowModalScroll />
        {children}
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);
