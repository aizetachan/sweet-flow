/**
 * Generation / render queue (docs/ARCHITECTURE.md §6). Phase 0 only moves a
 * requested job to "queued"; phase 2 enqueues it in Cloud Tasks for the Cloud
 * Run worker, which calls Magnific with the requester's own account.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import type { JobDoc } from "./api";

export const onJobCreated = onDocumentCreated("productions/{prodId}/jobs/{jobId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const job = snap.data() as JobDoc;
  if (job.status !== "requested") return;

  // TODO(fase 2): check the requester has Magnific connected, estimate
  // credits, create the media document (version allocated in a transaction)
  // and enqueue a Cloud Task per provider/account limits.
  await snap.ref.update({ status: "queued", queuedAt: Date.now() } satisfies Partial<JobDoc>);
  logger.info("job queued", { prodId: event.params.prodId, jobId: event.params.jobId, type: job.type });
});
