import { MiniAppState } from '../types';

const defaultMiniAppState: MiniAppState = {
  isMiniApp: false,
  clientFid: null,
  added: false,
  userFid: null,
  platformType: null
};

export const miniAppService = {
  async getState(): Promise<MiniAppState> {
    return defaultMiniAppState;
  },

  async ready() {
    return;
  },

  async openUrl(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  async getEthereumProvider() {
    return (window as any).ethereum ?? null;
  }
};
