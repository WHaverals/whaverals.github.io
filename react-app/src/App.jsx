import { useState } from 'react';
import Lanyard from './Lanyard';

export default function App({ userName = "Wouter Haverals" }) {
  return (
    <div className="app-container">
      <Lanyard name={userName} position={[0, 0, 20]} gravity={[0, -40, 0]} />
    </div>
  );
}