"use client";

import { get, set } from "idb-keyval";
import { useSyncExternalStore } from "react";

import type {
  CourseRecord,
  MajorRecord,
  SectionRecord,
  TermRecord,
} from "@/lib/etl/parsers";

const CACHE_KEY = "advisorly/catalog-cache/v1";
const OFFLINE_KEY = "advisorly/offline";

const ENV_DEFAULT_OFFLINE =
  (process.env.NEXT_PUBLIC_OFFLINE_MODE ?? process.env.OFFLINE_MODE) === "true";

export interface CatalogCachePayload {
  majors: MajorRecord[];
  courses: CourseRecord[];
  sections: SectionRecord[];
  terms: TermRecord[];
  fetchedAt: number;
}

let offlineMode = ENV_DEFAULT_OFFLINE;
if (typeof window !== "undefined") {
  try {
    const stored = window.localStorage.getItem(OFFLINE_KEY);
    if (stored === "1") {
      offlineMode = true;
    } else if (stored === "0") {
      offlineMode = false;
    }
  } catch (error) {
    console.warn("Failed to access offline preference", error);
  }
}

const offlineListeners = new Set<(value: boolean) => void>();

function emitOfflineChange(value: boolean) {
  offlineListeners.forEach((listener) => listener(value));
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(OFFLINE_KEY, value ? "1" : "0");
    } catch (error) {
      console.warn("Failed to persist offline preference", error);
    }
  }
}

export function setOfflineMode(value: boolean) {
  if (offlineMode === value) return;
  offlineMode = value;
  emitOfflineChange(value);
}

export function getOfflineMode(): boolean {
  return offlineMode;
}

export function subscribeOfflineMode(listener: (value: boolean) => void) {
  offlineListeners.add(listener);
  return () => offlineListeners.delete(listener);
}

export function useOfflineMode(): boolean {
  return useSyncExternalStore(subscribeOfflineMode, getOfflineMode, getOfflineMode);
}

export async function loadCatalogCache(): Promise<CatalogCachePayload | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    return (await get<CatalogCachePayload>(CACHE_KEY)) ?? undefined;
  } catch (error) {
    console.warn("Failed to load catalog cache", error);
    return undefined;
  }
}

export async function saveCatalogCache(payload: CatalogCachePayload) {
  if (typeof window === "undefined") return;
  try {
    await set(CACHE_KEY, payload);
  } catch (error) {
    console.warn("Failed to save catalog cache", error);
  }
}
