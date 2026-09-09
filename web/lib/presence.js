// Worker liveness.
//
// A property of the running harness, not of any project's history, so it lives
// in memory rather than in a project's db.json — the worker polls every
// POLL_MS (2s by default) and persisting that would rewrite the state file
// constantly, leaving a project's .factory/ permanently dirty.
//
// It hangs off globalThis rather than a module-level variable because Next
// compiles each route into its own bundle: /api/jobs/claim and /api/pipeline
// would otherwise each get their own copy of this module, and the reader would
// never see what the writer stamped. A Symbol.for key also survives the module
// re-evaluation that dev-mode hot reload causes.
//
// Resets to "unseen" when the panel restarts, which is correct: it genuinely
// has not heard from a worker yet, and one poll later it has.
const KEY = Symbol.for("wreckworks.workerLastSeen");

export function markWorkerSeen() {
  globalThis[KEY] = Date.now();
}

export function workerLastSeen() {
  return globalThis[KEY] || 0;
}
