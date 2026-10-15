/**
 * Firebase configuration from Vite env vars (`VITE_FIREBASE_*`, see
 * docs/DEVELOPMENT.md). Only read when VITE_DATA_SOURCE=firebase.
 */

import { FUNCTIONS_REGION } from "@sweetflow/functions/api";

export interface FirebaseConfig {
  options: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    databaseURL: string;
    appId: string;
    messagingSenderId?: string;
  };
  functionsRegion: string;
  /** Connect to the local Emulator Suite instead of a real project. */
  emulators: { host: string } | null;
}

const REQUIRED = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_DATABASE_URL",
  "VITE_FIREBASE_APP_ID",
] as const;

export function readFirebaseConfig(env: ImportMetaEnv = import.meta.env): FirebaseConfig {
  const useEmulators = env.VITE_FIREBASE_EMULATORS === "true";
  const get = (k: string): string | undefined => {
    const v = env[k] as string | undefined;
    return v && v.trim() ? v.trim() : undefined;
  };

  // With emulators, any "demo-*" project works without real credentials.
  const projectId = get("VITE_FIREBASE_PROJECT_ID") ?? (useEmulators ? "demo-sweetflow" : undefined);
  if (!useEmulators) {
    const missing = REQUIRED.filter((k) => !get(k));
    if (missing.length) throw new Error(`Faltan variables de entorno de Firebase: ${missing.join(", ")}`);
  }

  return {
    options: {
      apiKey: get("VITE_FIREBASE_API_KEY") ?? "demo-api-key",
      authDomain: get("VITE_FIREBASE_AUTH_DOMAIN") ?? `${projectId}.firebaseapp.com`,
      projectId: projectId!,
      storageBucket: get("VITE_FIREBASE_STORAGE_BUCKET") ?? `${projectId}.appspot.com`,
      databaseURL: get("VITE_FIREBASE_DATABASE_URL") ?? `http://127.0.0.1:9000?ns=${projectId}`,
      appId: get("VITE_FIREBASE_APP_ID") ?? "demo-app",
      messagingSenderId: get("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    },
    functionsRegion: get("VITE_FIREBASE_FUNCTIONS_REGION") ?? FUNCTIONS_REGION,
    emulators: useEmulators ? { host: get("VITE_FIREBASE_EMULATOR_HOST") ?? "127.0.0.1" } : null,
  };
}
