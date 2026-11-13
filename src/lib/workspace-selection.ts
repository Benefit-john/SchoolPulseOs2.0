export const ACTIVE_WORKSPACE_CHANGED = "schoolpulse:active-workspace-changed";

export const ACTIVE_WORKSPACE_KEY = "schoolpulse:active-workspace";

export function getActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
}

export function rememberActiveWorkspace(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
}

export function selectActiveWorkspace(id: string): void {
  rememberActiveWorkspace(id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACTIVE_WORKSPACE_CHANGED));
  }
}
