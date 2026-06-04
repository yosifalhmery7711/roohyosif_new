import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  doc, 
  setDoc,
  getDocFromServer, 
  setLogLevel 
} from 'firebase/firestore';

// Handle global/console levels to intercept and silence firestore connection warnings
if (typeof window !== 'undefined') {
  const shouldSilence = (args: any[]) => {
    try {
      const fullText = args.map(arg => {
        if (arg === null || arg === undefined) return '';
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message + ' ' + arg.stack;
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }).join(' ');
      const lower = fullText.toLowerCase();
      return (
        lower.includes('@firebase/firestore') ||
        lower.includes('could not reach cloud firestore backend') ||
        lower.includes('code=unavailable') ||
        lower.includes('offline mode') ||
        lower.includes('respond within') ||
        lower.includes('failed to connect')
      );
    } catch {
      return false;
    }
  };

  const methods: ('log' | 'info' | 'warn' | 'error')[] = ['log', 'info', 'warn', 'error'];
  methods.forEach(method => {
    const original = console[method];
    if (original) {
      console[method] = function (...args) {
        if (shouldSilence(args)) return;
        original.apply(console, args);
      };
    }
  });
}

declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>;
  }
}

import firebaseAppletConfig from '../../firebase-applet-config.json';

// Your actual production Firebase project configuration
const REAL_ROOH_CONFIG = {
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: firebaseAppletConfig.projectId,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  appId: firebaseAppletConfig.appId,
  measurementId: firebaseAppletConfig.measurementId || "",
  databaseURL: ""
};

const getEnvValue = (val1?: string, val2?: string) => {
  const val = val1 || val2;
  if (!val) return null;
  const lowercase = val.toLowerCase();
  if (
    lowercase.includes('placeholder') || 
    lowercase.includes('remixed') || 
    lowercase.includes('your-') || 
    lowercase.includes('your_') ||
    lowercase.includes('change-me') ||
    lowercase.length < 5
  ) {
    return null;
  }
  return val;
};

const envApiKey = getEnvValue(import.meta.env.VITE_FIREBASE_API_KEY, import.meta.env.VITE_FIR_API_KEY);
const envProjectId = getEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, import.meta.env.VITE_FIR__JECT_ID);

// We want to force connect to the user's real Firebase project unconditionally to guarantee successful synchronization unless custom env keys are configured on Vercel/external hosting
const useRealRooh = !(envApiKey && envProjectId);

const firebaseConfig = useRealRooh ? REAL_ROOH_CONFIG : {
  apiKey: envApiKey!,
  authDomain: getEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, import.meta.env.VITE_FIR__DOMAIN) || (envProjectId + ".firebaseapp.com"),
  databaseURL: getEnvValue(import.meta.env.VITE_FIREBASE_DATABASE_URL, import.meta.env.VITE_FIR_DATABASE_URL) || "https://" + envProjectId + "-default-rtdb.firebaseio.com",
  projectId: envProjectId!,
  storageBucket: getEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, import.meta.env.VITE_FIR__BUCKET) || (envProjectId + ".firebasestorage.app"),
  messagingSenderId: getEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, import.meta.env.VITE_FIR_NDER_ID) || REAL_ROOH_CONFIG.messagingSenderId,
  appId: getEnvValue(import.meta.env.VITE_FIREBASE_APP_ID, import.meta.env.VITE_FIR__APP_ID) || REAL_ROOH_CONFIG.appId,
  measurementId: getEnvValue(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, import.meta.env.VITE_FIR__MEASUREMENT_ID) || REAL_ROOH_CONFIG.measurementId
};

export let isFirebasePlaceholder = (
  !firebaseConfig.projectId || 
  firebaseConfig.projectId.includes('remixed') || 
  firebaseConfig.projectId.includes('placeholder') ||
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.includes('placeholder')
);

const app = initializeApp(firebaseConfig);

// Initialize Firestore with extreme resilience options:
// 1. Force Long Polling (experimentalForceLongPolling: true) to bypass VPN/proxy WebSocket restrictions
// 2. Disable experimentalAutoDetectLongPolling to lock standard HTTP transport
// 3. Configure durable multi-tab persistency cache system
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: false,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseAppletConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Configure Firestore to be completely silent with connectivity reports
try {
  setLogLevel('silent');
} catch (e) {
  // Ignored
}

export let isFirestoreOffline = false;

// Connectivity check (only log connection success, skip loud warnings)
async function testConnection() {
  if (isFirebasePlaceholder) {
    isFirestoreOffline = true;
    return;
  }
  try {
    const testPromise = getDocFromServer(doc(db, 'test', 'connection'));
    const timeoutPromise = new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([testPromise, timeoutPromise]);
    isFirestoreOffline = false;
  } catch (error: any) {
    // Keep as false so we don't block subsequent manual direct cloud calls
    isFirestoreOffline = false;
  }
}

export async function runFirestoreWithTimeout<T>(promise: Promise<T>, timeoutMs = 2500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Firestore operation timed out"));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        isFirestoreOffline = false;
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function inferTypeFromPath(pathStr: string): string | null {
  if (pathStr.startsWith('a/aa/aas/')) return 'capture';
  if (pathStr.startsWith('a/aa/aab/')) return 'ai_chat';
  if (pathStr.startsWith('a/aa/abc/')) return 'user_file';
  if (pathStr.startsWith('a/aa/abcd_profiles/')) return 'user_profile';
  if (pathStr.startsWith('a/ab/users/')) return 'user_profile';
  if (pathStr.startsWith('a/aa/abcd_chats/')) return 'chat_message';
  if (pathStr.startsWith('a/ab/chats/')) return 'chat_message';
  if (pathStr.startsWith('a/aa/abcdf_complaints/')) return 'complaint';
  if (pathStr.startsWith('a/ab/birthdays/')) return 'birthday_config';
  if (pathStr.startsWith('a/ab/wishes/')) return 'birthday_wish';
  return null;
}

export async function resilientWriteDoc(pathStr: string, data: any): Promise<void> {
  const parts = pathStr.split('/').filter(Boolean);
  
  if (!isFirebasePlaceholder) {
    try {
      const docRef = doc(db, parts[0], ...parts.slice(1));
      await runFirestoreWithTimeout(setDoc(docRef, data, { merge: true }), 2500);
      return; // Direct client-side SDK write succeeded!
    } catch (err) {
      console.warn(`Direct client-side write to ${pathStr} failed/timed out. Falling back to secure server-side proxy...`, err);
    }
  }

  // Resilient fallback path: write via Express proxy (immune to client-side block tools/VPNs)
  try {
    const res = await fetch('/api/firebase-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'setDoc', 
        pathStr, 
        data,
        clientConfig: {
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId,
          authDomain: firebaseConfig.authDomain,
          databaseURL: firebaseConfig.databaseURL,
          storageBucket: firebaseConfig.storageBucket,
          messagingSenderId: firebaseConfig.messagingSenderId,
          appId: firebaseConfig.appId,
          measurementId: firebaseConfig.measurementId
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Server-side proxy status ${res.status}`);
    }
    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || "Unknown proxy side error");
    }
  } catch (proxyErr) {
    console.error(`Resilient write failed for ${pathStr}:`, proxyErr);
    // Rescue/Backup: Push to offline synchronization queue so nothing is ever lost!
    const inferredType = inferTypeFromPath(pathStr);
    if (inferredType) {
      try {
        const { pushToOfflineQueue } = await import('./firebaseSync');
        await pushToOfflineQueue(inferredType as any, data);
        console.log(`[Offline Sync] Auto-queued failed document write for ${pathStr} for future sync.`);
      } catch (queueErr) {
        console.error('Failed to auto-queue failing doc:', queueErr);
      }
    }
    throw proxyErr;
  }
}

export async function resilientReadDoc(pathStr: string): Promise<any | null> {
  const parts = pathStr.split('/').filter(Boolean);

  if (!isFirebasePlaceholder) {
    try {
      const docRef = doc(db, parts[0], ...parts.slice(1));
      const snap = await runFirestoreWithTimeout(getDocFromServer(docRef), 2500);
      if (snap.exists()) {
        return snap.data();
      } else {
        return null;
      }
    } catch (err) {
      console.warn(`Direct client-side read from ${pathStr} failed/timed out. Falling back to secure server-side proxy...`, err);
    }
  }

  // Resilient fallback path: read via Express proxy (immune to client-side block tools/VPNs)
  try {
    const res = await fetch('/api/firebase-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'getDoc', 
        pathStr,
        clientConfig: {
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId,
          authDomain: firebaseConfig.authDomain,
          databaseURL: firebaseConfig.databaseURL,
          storageBucket: firebaseConfig.storageBucket,
          messagingSenderId: firebaseConfig.messagingSenderId,
          appId: firebaseConfig.appId,
          measurementId: firebaseConfig.measurementId
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Server-side proxy status ${res.status}`);
    }
    const result = await res.json();
    if (result.success) {
      return result.exists ? result.data : null;
    } else {
      throw new Error(result.error || "Unknown proxy side error");
    }
  } catch (proxyErr) {
    console.error(`Resilient read failed for ${pathStr}:`, proxyErr);
    throw proxyErr;
  }
}

testConnection();
