/**
 * Keeps the Realtime Database access list in sync with production members.
 * RTDB rules cannot read Firestore, so presence (presence/{prodId}/{uid})
 * is guarded by access/{prodId}/{uid} = role, written only from here.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { rtdb } from "./shared";

export const onProductionMemberWritten = onDocumentWritten("productions/{prodId}/members/{uid}", async (event) => {
  const { prodId, uid } = event.params;
  const ref = rtdb().ref(`access/${prodId}/${uid}`);
  const after = event.data?.after;
  if (after?.exists) await ref.set(after.get("role") ?? "viewer");
  else await ref.remove();
});

// TODO(fase 1): onWorkspaceMemberWritten — materialize workspace roles into
// productions/{prodId}/members (the default role per production, §8), and
// acceptInvite (callable) creating the workspace member from an invite.
