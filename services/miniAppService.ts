import { MiniAppState } from '../types';

const defaultMiniAppState: MiniAppState = {
  isMiniApp: false,
  clientFid: null,
  added: false,
  userFid: null,
  platformType: null
};

type MiniAppSdk = typeof import('@farcaster/miniapp-sdk')['sdk'];

let sdkPromise: Promise<MiniAppSdk> | null = null;
let isMiniAppPromise: Promise<boolean> | null = null;

const getMiniAppSdk = async () => {
  sdkPromise ??= import('@farcaster/miniapp-sdk').then(module => module.sdk);
  return sdkPromise;
};

const isRunningInMiniApp = async () => {
  isMiniAppPromise ??= getMiniAppSdk()
    .then(sdk => sdk.isInMiniApp())
    .catch(() => false);

  return isMiniAppPromise;
};

export const miniAppService = {
  async getState(): Promise<MiniAppState> {
    try {
      if (!(await isRunningInMiniApp())) {
        return defaultMiniAppState;
      }

      const sdk = await getMiniAppSdk();
      const context = await sdk.context;

      return {
        isMiniApp: true,
        clientFid: context.client.clientFid,
        added: context.client.added,
        userFid: context.user.fid,
        platformType: context.client.platformType ?? null
      };
    } catch (error) {
      console.warn('Mini app context unavailable', error);
      return defaultMiniAppState;
    }
  },

  async ready() {
    if (!(await isRunningInMiniApp())) {
      return;
    }

    const sdk = await getMiniAppSdk();
    await sdk.actions.ready();
  },

  async openUrl(url: string) {
    try {
      if (await isRunningInMiniApp()) {
        const sdk = await getMiniAppSdk();
        await sdk.actions.openUrl(url);
        return;
      }
    } catch (error) {
      console.warn('Mini app openUrl unavailable', error);
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  },

  async getEthereumProvider() {
    try {
      if (await isRunningInMiniApp()) {
        const sdk = await getMiniAppSdk();
        return await sdk.wallet.getEthereumProvider();
      }
    } catch (error) {
      console.warn('Mini app wallet provider unavailable', error);
    }

    return (window as any).ethereum ?? null;
  }
};
