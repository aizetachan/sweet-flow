/** Firebase SDK handles, created once and wired to the emulators when asked. */

import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase, type Database } from "firebase/database";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import type { FirebaseConfig } from "./config";

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  rtdb: Database;
  storage: FirebaseStorage;
  functions: Functions;
}

export function createClient(cfg: FirebaseConfig): FirebaseClient {
  const app = initializeApp(cfg.options);
  const client: FirebaseClient = {
    app,
    auth: getAuth(app),
    // Offline cache in IndexedDB: the app opens and navigates without
    // network, writes are queued (docs/ARCHITECTURE.md §4).
    db: initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
    rtdb: getDatabase(app),
    storage: getStorage(app),
    functions: getFunctions(app, cfg.functionsRegion),
  };

  if (cfg.emulators) {
    // Ports match firebase/firebase.json.
    const { host } = cfg.emulators;
    connectAuthEmulator(client.auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(client.db, host, 8080);
    connectDatabaseEmulator(client.rtdb, host, 9000);
    connectStorageEmulator(client.storage, host, 9199);
    connectFunctionsEmulator(client.functions, host, 5001);
  }
  return client;
}
