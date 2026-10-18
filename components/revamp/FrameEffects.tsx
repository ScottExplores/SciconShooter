// REVAMP(Q): Light follows the existing artwork; no replacement assets or render loop.
import React from 'react';
import './frame-effects.css';

export function FrameEffects({ variant, art }: { variant: 'record' | 'banner' | 'defeat'; art: string }) {
  return <div className={`result-frame-light result-frame-light--${variant}`} aria-hidden="true"
    style={{ '--frame-art': `url("${art}")` } as React.CSSProperties}>
    <div className="result-frame-light__metal"><i /></div>
    <div className="result-frame-light__track result-frame-light__track--left"><i /></div>
    <div className="result-frame-light__track result-frame-light__track--right"><i /></div>
    <i className="result-frame-light__gem result-frame-light__gem--top" />
    <i className="result-frame-light__gem result-frame-light__gem--bottom" />
  </div>;
}
