// Firebase for the landing: Firestore only, through the lite (REST) SDK so
// the page stays small. Configured from VITE_FIREBASE_* (see .env.example);
// without a project id the forms report "not configured" instead of failing.
import { initializeApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore/lite";

const env = import.meta.env;

let db: Firestore | null = null;

export function firestore(): Firestore | null {
  if (db) return db;
  const projectId = env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const apiKey = env.VITE_FIREBASE_API_KEY as string | undefined;
  if (!projectId || !apiKey) return null;
  const app = initializeApp({
    apiKey,
    projectId,
    authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ?? `${projectId}.firebaseapp.com`,
    appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  });
  db = getFirestore(app);
  return db;
}
