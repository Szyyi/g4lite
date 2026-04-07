/**
 * G4Light — Entry Point
 * =======================
 *
 * Mounts the React application into the DOM.
 * All provider wiring (Theme, Query, Snackbar, Router) lives in App.tsx.
 * This file handles only:
 *  - CSS import (must be first — Tailwind base + font-face + custom properties)
 *  - StrictMode wrapping (development double-render detection)
 *  - Global error handlers (unhandled rejections, uncaught errors)
 *  - Root mount
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// CSS must import before any component renders
// Order matters: Tailwind base → font-face → custom properties → utilities
import './index.css';

// ─────────────────────────────────────────────────────────────────────────────
// Global error handlers
// Catch unhandled promise rejections and uncaught errors that escape React's
// error boundary. In production, these would report to an error tracking
// service. For now, they prevent silent failures.
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  // Suppress ResizeObserver loop errors (benign, caused by rapid layout changes)
  if (
    event.reason instanceof Error &&
    event.reason.message.includes('ResizeObserver')
  ) {
    event.preventDefault();
    return;
  }

  console.error('[G4Light] Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event: ErrorEvent) => {
  // Suppress ResizeObserver loop errors
  if (event.message?.includes('ResizeObserver')) {
    event.preventDefault();
    return;
  }

  console.error('[G4Light] Uncaught error:', event.error);
});

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root element not found. Ensure index.html contains <div id="root"></div>',
  );
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);