export { captureChange } from "./change-capture.ts";
export type { FileSyncContext } from "./context.ts";
export {
  type ReconcileFatalError,
  type ReconcileStats,
  reconcileStartupEvoluState,
  reconcileStartupFilesystemState,
} from "./startup-reconciliation.ts";
export {
  type StateMaterializationOptions,
  startStateMaterialization,
} from "./state-materialization.ts";
