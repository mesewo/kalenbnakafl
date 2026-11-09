"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = (): HTMLElement | null =>
  typeof document === "undefined" ? null : document.body;
const getServerSnapshot = (): HTMLElement | null => null;

export function usePortalTarget() {
  return useSyncExternalStore<HTMLElement | null>(subscribe, getSnapshot, getServerSnapshot);
}
