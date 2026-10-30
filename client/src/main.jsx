import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './components/ui.jsx';
import ErrorBoundary, { reportError } from './components/ErrorBoundary.jsx';
import './styles.css';

window.addEventListener('error', (e) => reportError('error', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
