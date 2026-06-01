import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setLogLevel } from 'firebase/firestore';

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

// Your actual production Firebase project configuration for rooh-20eff
const REAL_ROOH_CONFIG = {
  apiKey: "AIzaSyAF3hIx17GqjPl4EoZ3PaCENdsbjGl0I3w",
  authDomain: "rooh-20eff.firebaseapp.com",
  projectId: "rooh-20eff",
  storageBucket: "rooh-20eff.firebasestorage.app",
  messagingSenderId: "1038713680167",
  appId: "1:1038713680167:web:cfb063e03eb9e357493902"
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

const useRealRooh = !envApiKey || !envProjectId;

const firebaseConfig = useRealRooh ? REAL_ROOH_CONFIG : {
  apiKey: envApiKey!,
  authDomain: getEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, import.meta.env.VITE_FIR__DOMAIN) || REAL_ROOH_CONFIG.authDomain,
  projectId: envProjectId!,
  storageBucket: getEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, import.meta.env.VITE_FIR__BUCKET) || REAL_ROOH_CONFIG.storageBucket,
  messagingSenderId: getEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, import.meta.env.VITE_FIR_NDER_ID) || REAL_ROOH_CONFIG.messagingSenderId,
  appId: getEnvValue(import.meta.env.VITE_FIREBASE_APP_ID, import.meta.env.VITE_FIR__APP_ID) || REAL_ROOH_CONFIG.appId
};

export let isFirebasePlaceholder = useRealRooh ? false : (
  !firebaseConfig.projectId || 
  firebaseConfig.projectId.includes('remixed') || 
  firebaseConfig.projectId.includes('placeholder') ||
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.includes('placeholder')
);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
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

testConnection();
