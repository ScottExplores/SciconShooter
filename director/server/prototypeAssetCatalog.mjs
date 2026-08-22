import { resolveWithin } from './security.mjs';

const asset = ({
  prototypeId,
  variant,
  fileName,
  sha256,
  width,
  height,
  label
}) => Object.freeze({
  prototypeId,
  variant,
  fileName,
  sha256,
  width,
  height,
  label,
  maxBytes: 2_500_000,
  route: `/api/v1/prototype-assets/${prototypeId}/${sha256}/${variant}.png`
});

export const PROTOTYPE_ASSET_DEFINITIONS = Object.freeze([
  asset({
    prototypeId: 'abyssal-octarch',
    variant: 'assembled',
    fileName: 'abyssal-octarch/assembled.png',
    sha256: 'a9fc10f01d3d6abcb51ff00b8be1a2b6ead7c02b10e7ee697369b2c1c1b7854d',
    width: 720,
    height: 480,
    label: 'Abyssal Octarch assembled modular preview'
  }),
  asset({
    prototypeId: 'abyssal-octarch',
    variant: 'sheet',
    fileName: 'abyssal-octarch/sheet.png',
    sha256: 'dae4d697b30ee0a7f6509022fc4273907452b7a71a02377bfe885a3523f4cf30',
    width: 2048,
    height: 512,
    label: 'Abyssal Octarch modular and attack animation atlas'
  }),
  asset({
    prototypeId: 'abyssal-octarch',
    variant: 'reference',
    fileName: 'abyssal-octarch/abyssal-octarch-reference-runtime.png',
    sha256: '32e3b0b8989342a8fcf1c1df3e41894b714a0e896621ebb5218a8c9f1e685831',
    width: 720,
    height: 480,
    label: 'Abyssal Octarch canonical alignment reference'
  }),
  asset({
    prototypeId: 'meridian-harrower',
    variant: 'assembled',
    fileName: 'meridian-harrower-assembled.png',
    sha256: '1f55d59ef09ade50b9ec35465208b687c8fb8830047592bfae3daec67bfd28c5',
    width: 606,
    height: 606,
    label: 'Meridian Harrower assembled preview'
  }),
  asset({
    prototypeId: 'meridian-harrower',
    variant: 'sheet',
    fileName: 'meridian-harrower-modular-sheet.png',
    sha256: '640d5fb62390fa8cb5c0644f780cf87c341b7c253564a5af710b7b3dffc569f4',
    width: 1254,
    height: 1254,
    label: 'Meridian Harrower modular sheet'
  }),
  asset({
    prototypeId: 'helios-clawcarrier',
    variant: 'assembled',
    fileName: 'helios-clawcarrier-v2/helios-clawcarrier-v2-neutral.png',
    sha256: '08fcc15404f57aecb70b35d9498b267bd4c2f313e84dc142becf190d7a9f7f57',
    width: 460,
    height: 330,
    label: 'Helios Clawcarrier V2 modular neutral preview'
  }),
  asset({
    prototypeId: 'helios-clawcarrier',
    variant: 'sheet',
    fileName: 'helios-clawcarrier-v2/helios-clawcarrier-v2-atlas.png',
    sha256: 'a686d39293f096e21adee7e7c85b78d1e2f3eb10d644f47b16235362eb7e9c11',
    width: 2048,
    height: 1024,
    label: 'Helios Clawcarrier V2 modular and projectile atlas'
  }),
  asset({
    prototypeId: 'helios-clawcarrier',
    variant: 'reference',
    fileName: 'helios-clawcarrier-v2/helios-clawcarrier-v2-canonical-reference.png',
    sha256: '8d6ce675283e1bb3dfd684247c13efaf80f1230400b529032dea3467f9177cb4',
    width: 394,
    height: 271,
    label: 'Helios Clawcarrier V2 canonical neutral comparison reference'
  }),
  asset({
    prototypeId: 'frontier-crownclaw',
    variant: 'assembled',
    fileName: 'frontier-crownclaw/frontier-crownclaw-neutral.png',
    sha256: '3fe62b12ade41026f74c334e3272f28261a60c8a0935b003e536bcff9d33e342',
    width: 260,
    height: 210,
    label: 'Frontier Crownclaw modular neutral preview'
  }),
  asset({
    prototypeId: 'frontier-crownclaw',
    variant: 'sheet',
    fileName: 'frontier-crownclaw/frontier-crownclaw-atlas.png',
    sha256: '8da50a881b5ad2425c294e7b9f382172c7fadbff70b8b52f4d2206d793e980fb',
    width: 2048,
    height: 256,
    label: 'Frontier Crownclaw modular and attack animation atlas'
  }),
  asset({
    prototypeId: 'frontier-crownclaw',
    variant: 'reference',
    fileName: 'frontier-crownclaw/source/frontier-crownclaw-canonical-reference.png',
    sha256: 'a3c2e6853d192b45d996ee50b3432fd61d20513a2ea468695670d8df5957f4a5',
    width: 640,
    height: 512,
    label: 'Frontier Crownclaw locked canonical neutral comparison reference'
  }),
  asset({
    prototypeId: 'prism-moth-broodkeeper',
    variant: 'assembled',
    fileName: 'prism-moth-broodkeeper/prism-moth-broodkeeper-neutral.png',
    sha256: 'cd0381398cbfb5003822f126192dc0d18af3fe874eff11defec9d57202109f39',
    width: 512,
    height: 512,
    label: 'Prism Moth Broodkeeper modular neutral preview'
  }),
  asset({
    prototypeId: 'prism-moth-broodkeeper',
    variant: 'sheet',
    fileName: 'prism-moth-broodkeeper/prism-moth-broodkeeper-atlas.png',
    sha256: '5ef8ca7e395c94b3777d4f85808b5701f8bc952d96a335438e8353dcc82b6292',
    width: 2048,
    height: 2048,
    label: 'Prism Moth Broodkeeper modular and brood lifecycle atlas'
  }),
  asset({
    prototypeId: 'prism-moth-broodkeeper',
    variant: 'reference',
    fileName: 'prism-moth-broodkeeper/source/prism-moth-canonical-reference.png',
    sha256: 'b006c73ab1b027d5dce5ac2dc5cf841a2b2e30a202da264b91c00f8f93b77ade',
    width: 384,
    height: 384,
    label: 'Prism Moth Broodkeeper canonical neutral comparison reference'
  }),
  asset({
    prototypeId: 'aurora-storm-engine',
    variant: 'assembled',
    fileName: 'aurora-storm-engine-assembled.png',
    sha256: '4b0db8c860f6813b60375241c4cbca710633bf1ea98677f3ab2d66d7b04925e3',
    width: 662,
    height: 503,
    label: 'Aurora Storm Engine assembled preview'
  }),
  asset({
    prototypeId: 'aurora-storm-engine',
    variant: 'sheet',
    fileName: 'aurora-storm-engine-modular-sheet.png',
    sha256: 'e2132ed3b90a78a64bea25350ed19477aa3a94a312beaffa258f1ba691351f5e',
    width: 1254,
    height: 1254,
    label: 'Aurora Storm Engine modular sheet'
  }),
  asset({
    prototypeId: 'umbra-needlewing',
    variant: 'assembled',
    fileName: 'umbra-needlewing/umbra-needlewing-neutral.png',
    sha256: 'a1635e616add1b99336c366bc51499311f130ce62fbecd8d4a8956e1c9b2aba2',
    width: 512,
    height: 320,
    label: 'Umbra Needlewing modular neutral preview'
  }),
  asset({
    prototypeId: 'umbra-needlewing',
    variant: 'sheet',
    fileName: 'umbra-needlewing/umbra-needlewing-atlas.png',
    sha256: 'c98290efd065277225b9d64bbcf06f23e5013cd29ca9ae501f404c18750321d1',
    width: 2048,
    height: 1024,
    label: 'Umbra Needlewing modular and lifecycle atlas'
  }),
  asset({
    prototypeId: 'umbra-needlewing',
    variant: 'reference',
    fileName: 'umbra-needlewing/umbra-needlewing-reference.png',
    sha256: '2db71f4a183415e9851be2363b2224b8d7912e272922b55c7cfb8c1043e0ac21',
    width: 1511,
    height: 1041,
    label: 'Umbra Needlewing locked canonical neutral comparison reference'
  }),
  asset({
    prototypeId: 'cinderjaw-siege-beetle',
    variant: 'assembled',
    fileName: 'cinderjaw-siege-beetle-assembled.png',
    sha256: '133b11009ad6ccb6f1b31252d10ee90554a31aaa56f0a6769e51f47f31744611',
    width: 351,
    height: 256,
    label: 'Cinderjaw Siege Beetle assembled preview'
  }),
  asset({
    prototypeId: 'cinderjaw-siege-beetle',
    variant: 'sheet',
    fileName: 'cinderjaw-siege-beetle-modular-sheet.png',
    sha256: '62900c5d0aaa386b6c8c9b5ab84d0c91d22a55d3dcc99d0a3f4ea4ea2b142055',
    width: 1254,
    height: 1254,
    label: 'Cinderjaw Siege Beetle modular sheet'
  }),
  asset({
    prototypeId: 'vesperglass-mothmother',
    variant: 'assembled',
    fileName: 'vesperglass-mothmother-assembled.png',
    sha256: '66ceb0d68b16951b054cb28dcc11d585f01813d6b8d63e94ec3ba8a94d6ab5ee',
    width: 376,
    height: 306,
    label: 'Vesperglass Mothmother assembled preview'
  }),
  asset({
    prototypeId: 'vesperglass-mothmother',
    variant: 'sheet',
    fileName: 'vesperglass-mothmother-modular-sheet.png',
    sha256: '6e425e4faf5c1daefc7a8c16a7052e6dee407f02225b6ddf7c206fdf46398a67',
    width: 1536,
    height: 1024,
    label: 'Vesperglass Mothmother modular sheet'
  }),
  asset({
    prototypeId: 'twin-halo-wardens',
    variant: 'assembled',
    fileName: 'twin-halo-wardens-assembled.png',
    sha256: '9982182d70ef8e8fe1e9c852377d5f1251719573211b49c172ec78d9ff90e170',
    width: 322,
    height: 219,
    label: 'Twin Halo Wardens assembled preview'
  }),
  asset({
    prototypeId: 'twin-halo-wardens',
    variant: 'sheet',
    fileName: 'twin-halo-wardens-modular-sheet.png',
    sha256: 'e386d8f70308b7f648b8f7480185913675fd9b1b1564ff9f9d66278d617b1030',
    width: 1254,
    height: 1254,
    label: 'Twin Halo Wardens modular sheet'
  }),
  asset({
    prototypeId: 'riftcoil-wyrm',
    variant: 'assembled',
    fileName: 'riftcoil-wyrm-assembled.png',
    sha256: '8656a9ae41084c118ceffbe192b7ff0d9c4bd7d3eb3ad4e63de64e4fc8f12cf2',
    width: 287,
    height: 370,
    label: 'Riftcoil Wyrm assembled preview'
  }),
  asset({
    prototypeId: 'riftcoil-wyrm',
    variant: 'sheet',
    fileName: 'riftcoil-wyrm-modular-sheet.png',
    sha256: '75f380b04706bf46fbaeb2b428c409549da55321359a36e7692aa7a6842f455e',
    width: 1183,
    height: 1329,
    label: 'Riftcoil Wyrm modular sheet'
  }),
  asset({
    prototypeId: 'nullwake-revenant',
    variant: 'assembled',
    fileName: 'nullwake-revenant-assembled.png',
    sha256: '5ee76a64cc5207e85be611744ada5784dd5c95776cc0e3262d3fbf888d3f5407',
    width: 370,
    height: 311,
    label: 'Nullwake Revenant assembled preview'
  }),
  asset({
    prototypeId: 'nullwake-revenant',
    variant: 'sheet',
    fileName: 'nullwake-revenant-modular-sheet.png',
    sha256: '4b6fd55cac26b66b3c3705789e1e6ee6a91d87258d19aaff97f284457ba5a53f',
    width: 1254,
    height: 1254,
    label: 'Nullwake Revenant modular sheet'
  }),
  asset({
    prototypeId: 'nullwake-revenant',
    variant: 'factory-atlas-v3',
    fileName: 'nullwake-revenant-factory-atlas-v3.png',
    sha256: 'a0d29566c3e925c764267f48202ce1a18247f28007b43ad7fdcba7c8573da2cd',
    width: 1536,
    height: 1024,
    label: 'Nullwake Revenant 32-color factory animation atlas V3'
  }),
  asset({
    prototypeId: 'gloamforge-mantis',
    variant: 'assembled',
    fileName: 'gloamforge-mantis/gloamforge-mantis-neutral.png',
    sha256: '1f120a336cbd05bce0955b657964e35fb724ed59664b2301540a39b7c2c9bca8',
    width: 720,
    height: 620,
    label: 'Gloamforge Mantis neutral preview'
  }),
  asset({
    prototypeId: 'gloamforge-mantis',
    variant: 'sheet',
    fileName: 'gloamforge-mantis/gloamforge-mantis-atlas.png',
    sha256: 'eb08e5b68bdbc6cc999f8d1e45d293628248308d338004d86be6d4f2e6857f60',
    width: 2048,
    height: 2048,
    label: 'Gloamforge Mantis modular atlas'
  }),
  asset({
    prototypeId: 'sandbox-boss-vfx',
    variant: 'sheet',
    fileName: 'aurora-boss-vfx-sheet-v1.png',
    sha256: '09bcf6e00e0a3d6d96b4a64f73f09a3b7a59b890219169bcf433ebfea2b7e8b1',
    width: 1254,
    height: 1254,
    label: 'Sandbox boss pixel projectile and laser effects'
  })
]);

export const createLocalPrototypeAssetCatalog = (dataRoot) => (
  PROTOTYPE_ASSET_DEFINITIONS.map((definition) => Object.freeze({
    ...definition,
    filePath: resolveWithin(dataRoot, 'prototype-assets', definition.fileName)
  }))
);
