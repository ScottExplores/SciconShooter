
import React from 'react';
import { ASSETS } from '../constants';

interface TutorialProps {
  onReady: () => void;
}

const Tutorial: React.FC<TutorialProps> = ({ onReady }) => {
  return (
    <div className="absolute inset-0 z-40 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-white" onClick={onReady}>
      <h2 className="text-3xl font-black arcade-font text-indigo-400 mb-8 tracking-widest">HOW TO PLAY</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl w-full">
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-lg border border-gray-500 flex items-center justify-center bg-gray-800">
              <span className="text-2xl">👆</span>
            </div>
            <div>
              <h3 className="font-bold text-lg">MOVE & SHOOT</h3>
              <p className="text-gray-400 text-sm">Drag or use WASD/Arrows to fly. <br/>Firing is automatic.</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full border border-yellow-500 flex items-center justify-center bg-yellow-900/30 overflow-hidden">
              <img src={ASSETS.RSC_TOKEN} alt="RSC" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-yellow-400">COLLECT COINS</h3>
              <p className="text-gray-400 text-sm">Gather RSC to fund upgrades in the Lab.</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full border border-blue-500 flex items-center justify-center bg-blue-900/30 overflow-hidden">
               <img src={ASSETS.REAL_RSC_ICON} alt="Crypto" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-blue-400">CRYPTO FUNDING</h3>
              <p className="text-gray-400 text-sm">Connect wallet to fund mission credits with RSC.</p>
              <p className="text-red-400 text-[10px] font-bold italic mt-1 leading-tight">
                Your In-game balance will not roll over to your next match if you die.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
           <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full border border-purple-500 flex items-center justify-center bg-purple-900/30 overflow-hidden">
               <img src={ASSETS.FOUNDER_BRIAN} alt="Founder" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-purple-400">FIND FOUNDERS</h3>
              <p className="text-gray-400 text-sm">Collect Founder icons for powerful weapons & shields.</p>
            </div>
          </div>
          
           <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-lg border border-red-500 flex items-center justify-center bg-red-900/30">
              <span className="text-2xl">🔒</span>
            </div>
            <div>
              <h3 className="font-bold text-lg text-red-400">AVOID BARRIERS</h3>
              <p className="text-gray-400 text-sm">Don't hit Journals, Paywalls, or Locks.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12 animate-pulse text-center cursor-pointer">
        <div className="text-2xl font-bold mb-2">TAP TO START</div>
        <div className="text-xs text-gray-500 uppercase tracking-widest">Good luck with your submission</div>
      </div>
    </div>
  );
};

export default Tutorial;
