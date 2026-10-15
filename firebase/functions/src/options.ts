// Must be evaluated before any Function is defined (first import in index.ts).
import { setGlobalOptions } from "firebase-functions/v2";
import { FUNCTIONS_REGION } from "./api";

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });
