import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/globals.css';

const container = document.getElementById('root')!;
try { const p = localStorage.getItem('presetV1') || 'default'; document.documentElement.setAttribute('data-preset', p); } catch {}
const root = createRoot(container);
root.render(<App />);
