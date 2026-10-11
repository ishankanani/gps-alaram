import { navigationRef, whenNavigationReady } from './ref';
import { createRequest } from './results';
import type { ModalSheetParams } from './types';

export type SheetSpec = Omit<ModalSheetParams, 'requestId'>;

/**
 * Opens the ModalSheet route (3.17) with a picker or an action menu and resolves with the id of
 * the tapped option, or null when the sheet was closed without a choice. Single-choice sheets
 * apply on tap and close. A ModalSheet never holds a text input.
 */
export function openSheet(spec: SheetSpec): Promise<string | null> {
  const { requestId, result } = createRequest<string>();
  whenNavigationReady(() => navigationRef.navigate('ModalSheet', { ...spec, requestId }));
  return result;
}
