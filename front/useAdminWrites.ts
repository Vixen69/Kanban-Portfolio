// The admin panel's server-side writes beyond the config (ADR 038/042):
// the year switch and the snapshots. Each POSTs, then refetches the runtime
// config (its year or its override may have changed) and the board (its
// cards and events did) — the same rule as the config writes. Each
// resolves null on success or the French failure message, which the panel
// shows inline and stays open. A restore that set the applied config
// aside or removed a capacity says so through the notify channel (the
// board's banner): the panel closes on success (ADR 058).

import { useCallback } from "react";
import type { BoardConfig } from "../core/types.ts";
import { fetchConfig, messageOf, postExerciseSwitch } from "./api.ts";
import { postRestore, postSnapshot, restoreNotice } from "./apiSnapshots.ts";

type SetConfig = (config: BoardConfig) => void;
type Reload = () => Promise<void>;
type Notify = (message: string) => void;

/**
 * The year switch (ADR 035/038).
 * Inputs: the config setter, the board reload. Output: switchExercise(year).
 * Failure modes: none — a refused switch resolves to its message.
 */
export function useExerciseSwitch(setConfig: SetConfig, reload: Reload): (year: number) => Promise<string | null> {
  return useCallback(async (year: number): Promise<string | null> => {
    try {
      await postExerciseSwitch(year);
      setConfig(await fetchConfig());
      await reload();
      return null;
    } catch (cause) {
      const message = messageOf(cause);
      console.error("bascule refusée :", message);
      return message;
    }
  }, [setConfig, reload]);
}

/**
 * The snapshot writes (ADR 042): a take changes nothing on the board; a
 * restore changes everything, so it refetches config and board, then
 * notifies what the admin must know (config set aside, capacity removed —
 * restoreNotice) once the reload is done.
 * Inputs: the config setter, the board reload, the notify channel
 * (optional: without it the notice is only logged, as counts).
 * Output: { takeSnapshot(label), restoreSnapshot(id) }.
 * Failure modes: none — a refused write resolves to its message.
 */
export function useSnapshotWrites(setConfig: SetConfig, reload: Reload, notify?: Notify): {
  takeSnapshot: (label: string) => Promise<string | null>;
  restoreSnapshot: (id: string) => Promise<string | null>;
} {
  const takeSnapshot = useCallback(async (label: string): Promise<string | null> => {
    try {
      await postSnapshot(label);
      return null;
    } catch (cause) {
      const message = messageOf(cause);
      console.error("instantané refusé :", message);
      return message;
    }
  }, []);
  const restoreSnapshot = useCallback(async (id: string): Promise<string | null> => {
    try {
      const result = await postRestore(id);
      setConfig(await fetchConfig());
      await reload();
      const notice = restoreNotice(result);
      if (notice !== null) {
        console.log(`instantané ${id} restauré : configuration écartée ${result.configSetAside === true ? "oui" : "non"}, capacité retirée : ${result.capacityCleared?.length ?? 0} exercice(s)`);
        notify?.(notice);
      }
      return null;
    } catch (cause) {
      const message = messageOf(cause);
      console.error("restauration refusée :", message);
      return message;
    }
  }, [setConfig, reload, notify]);
  return { takeSnapshot, restoreSnapshot };
}
