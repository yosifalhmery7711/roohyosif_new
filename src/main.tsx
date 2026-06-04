import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Bulletproof Global Fetch Interceptor to ensure Vercel deployments bypass routing redirects or proxy latency
try {
  const originalFetch = window.fetch;
  const isWritable = (() => {
    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
      return !desc || desc.writable || !!desc.set || desc.configurable;
    } catch {
      return true;
    }
  })();

  if (isWritable) {
    const patchedFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      let url = "";
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input && typeof input === 'object' && 'url' in input) {
        url = (input as any).url;
      }

      const isRelativeApi = url.startsWith('/api/') || url.startsWith('/aa/');
      if (isRelativeApi) {
        // Detect if we are hosted on an external client runner like Vercel
        const isVercel = window.location.hostname.includes('vercel.app') || 
                         (!window.location.hostname.includes('localhost') && 
                          !window.location.hostname.includes('127.0.0.1') && 
                          !window.location.hostname.includes('.run.app'));

        const backendBase = 'https://ais-pre-5r4ayamisunjlup2gliqyg-342089012915.europe-west2.run.app';
        const absoluteUrl = `${backendBase}${url}`;

        if (isVercel) {
          try {
            let requestToUse: RequestInfo = absoluteUrl;
            if (input instanceof Request) {
              requestToUse = new Request(absoluteUrl, input);
            }
            const response = await originalFetch(requestToUse, init);
            if (response.status !== 404) {
              return response;
            }
          } catch (err) {
            console.warn(`Direct absolute fetch to backend failed on Vercel, trying relative`, err);
          }
        } else {
          // Normal environment or emulator: try relative first, fallback on 404 or network disconnect
          try {
            const response = await originalFetch(input, init);
            if (response.status === 404) {
              let requestToUse: RequestInfo = absoluteUrl;
              if (input instanceof Request) {
                requestToUse = new Request(absoluteUrl, input);
              }
              return await originalFetch(requestToUse, init);
            }
            return response;
          } catch (err) {
            let requestToUse: RequestInfo = absoluteUrl;
            if (input instanceof Request) {
              requestToUse = new Request(absoluteUrl, input);
            }
            return await originalFetch(requestToUse, init);
          }
        }
      }

      return originalFetch(input, init);
    };

    try {
      Object.defineProperty(window, 'fetch', {
        value: patchedFetch,
        writable: true,
        configurable: true
      });
    } catch {
      window.fetch = patchedFetch;
    }
  } else {
    console.warn("window.fetch is read-only on this platform. Bypassing global patch.");
  }
} catch (globalInterceptError) {
  console.warn("Could not patch window.fetch globally due to runtime environment restrictions:", globalInterceptError);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

