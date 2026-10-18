import React, { useEffect, useState } from 'react';
import './FirstFlightHint.css';

export default function FirstFlightHint() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = [window.setTimeout(() => setStep(1), 10000), window.setTimeout(() => setStep(2), 22000), window.setTimeout(() => setStep(3), 34000)];
    return () => timers.forEach(window.clearTimeout);
  }, []);
  if (step >= 3) return null;
  return <p className="revamp-first-flight" role="status">{[
    'Drag anywhere to steer · Your ship fires automatically',
    'Your left wing brings fire support · Keep your hull clear',
    'Clear this Mission to unlock your utility wing'
  ][step]}</p>;
}
