import { useMemo, type ReactNode } from 'react'
import { MobileWorkspaceLoadFailure } from '../components/vaults/MobileWorkspaceLoadFailure'
import { NativeWorkspaceContext } from './NativeWorkspaceContext'
import { MobileVaultControlsContext, MobileVaultPickerContext } from './MobileVaultContext'
import { WorkspaceSnapshotRevisionContext, WorkspaceSyncEditorsContext } from './workspaceSyncEditors'
import { useMobileVaults } from './git/useMobileVaults'
import { WorkspaceLoadBoundary } from './WorkspaceLoadBoundary'
import { MobileSettingsSheet } from '../settings/MobileSettingsSheet'
import { MobileVaultNotice } from '../components/vaults/MobileVaultNotice'
import { MobileWorkspaceStartup } from '../components/workspace/MobileWorkspaceStartup'
import { useMobileSettings } from '../settings/useMobileSettings'

export function MobileVaultProvider({ children }: { children: ReactNode }) {
  const manager = useMobileVaults()
  const preferences = useMobileSettings()
  const { active, open, restorePending, revision, editors } = manager
  const recovery = workspaceRecovery(manager)
  // Sync progress must not make the workspace re-index a large vault.
  const workspace = useMemo(() => ({ selection: active.selection, open, restorePending }), [active.selection, open, restorePending])
  const pending = manager.syncHistory.record.pendingPaths
  const pendingNotePaths = useMemo(() => new Set((pending ?? []).map(change => change.path)), [pending])
  const controls = {
    rootUri: active.selection?.vaultRootUri,
    git: Boolean(active.git),
    linked: manager.linked,
    busy: manager.busy,
    status: manager.status,
    lastSuccessAt: manager.syncHistory.record.lastSuccessAt,
    lastFailureAt: manager.syncHistory.record.lastFailureAt,
    phase: manager.phase,
    pendingNotePaths,
    historyAvailable: manager.syncHistory.ready && !manager.syncHistory.failed,
    open,
    sync: manager.sync,
  }
  const picker = vaultPicker(manager, preferences.open)
  return <MobileVaultPickerContext.Provider value={picker}><WorkspaceSyncEditorsContext.Provider value={editors}>
    <NativeWorkspaceContext.Provider value={workspace}>
      <MobileVaultControlsContext.Provider value={controls}>
        <WorkspaceLoadBoundary resetKey={revision} fallback={<MobileWorkspaceLoadFailure onManage={open} />}>
          <WorkspaceSnapshotRevisionContext.Provider value={revision}>
          {recovery?.reason ? <MobileWorkspaceLoadFailure onManage={open} onRetry={recovery.retry} reason={recovery.reason} /> :
            <MobileWorkspaceStartup preview={manager.catalog.preview} pending={restorePending} hasActiveWorkspace={Boolean(active.selection)}
              onSelectNote={manager.catalog.selectPreviewNote}>
              {children}
            </MobileWorkspaceStartup>}
          </WorkspaceSnapshotRevisionContext.Provider>
        </WorkspaceLoadBoundary>
        <MobileSettingsSheet manager={manager} />
        {!manager.opened && manager.notices.current && <MobileVaultNotice notice={manager.notices.current}
          dismiss={manager.notices.dismiss} onManage={open} />}
      </MobileVaultControlsContext.Provider>
    </NativeWorkspaceContext.Provider>
  </WorkspaceSyncEditorsContext.Provider></MobileVaultPickerContext.Provider>
}

function workspaceRecovery(manager: ReturnType<typeof useMobileVaults>) {
  if (manager.refreshFailed) return { reason: 'selection' as const, retry: manager.retryWorkspace }
  if (!manager.active.selection && !manager.catalog.pending) return { reason: manager.catalog.error, retry: manager.catalog.retry }
}

function vaultPicker(manager: ReturnType<typeof useMobileVaults>, manage: () => void) {
  const { active, restorePending } = manager
  return {
    disabled: manager.busy || restorePending,
    manage,
    choices: [
      ...manager.catalog.localVaults.map(vault => ({ id: vault.id, label: vault.label,
        selected: active.selection?.vaultAlias === vault.id, select: () => manager.selectLocal(vault, false) })),
      ...manager.catalog.vaults.map(vault => ({ id: vault.id, label: vault.label,
        selected: active.git?.id === vault.id, select: () => manager.select(vault, false) })),
    ],
  }
}
