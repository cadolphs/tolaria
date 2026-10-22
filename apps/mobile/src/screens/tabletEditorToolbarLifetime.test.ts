// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { workspaceScenarioForId } from '../fixtures/workspaceFixtures'
import { TabletEditorPanel } from './TabletEditorPanel'
import type { MobileNote } from '../workspace/mobileWorkspaceModel'
import { createWorkspaceSyncEditors, WorkspaceSnapshotRevisionContext, WorkspaceSyncEditorsContext } from '../workspace/workspaceSyncEditors'

type SurfaceProps = { children?: ReactNode; testID?: string }
function Surface({ children, testID }: SurfaceProps) {
  return createElement('div', { 'data-testid': testID }, children)
}
function Control({ children, testID, onPress }: SurfaceProps & { onPress?: () => void }) {
  return createElement('button', { type: 'button', onClick: onPress, 'data-testid': testID }, children)
}
vi.mock('react-native', () => ({ View: Surface, ScrollView: Surface,
  StyleSheet: { create: (value: object) => value, flatten: (value: object) => value, hairlineWidth: 0.5 } }))
vi.mock('../ui/theme/useMobileTheme', async () => {
  const { mobileMetrics } = await import('../ui/mobileMetrics')
  const { mobilePalettes } = await import('../ui/theme/mobilePalette')
  return { useMobileStyles: (factory: (colors: object, metrics: object) => object) => factory(mobilePalettes.light, mobileMetrics[1.2]),
    useMobileColors: () => mobilePalettes.light, useMobileMetrics: () => mobileMetrics[1.2] }
})
vi.mock('phosphor-react-native', () => ({ Check: () => null, X: () => null, Code: () => null,
  DotsThree: () => null, ListBullets: () => null, Star: () => null }))
vi.mock('../components/ui/button', () => ({ Button: Control }))
vi.mock('../components/ui/text', () => ({ Text: ({ children, accessibilityRole }: {
  children?: ReactNode; accessibilityRole?: string
}) => createElement('span', { role: accessibilityRole }, children) }))
vi.mock('../components/ui/input', () => ({ Input: ({ testID }: SurfaceProps) => createElement('input', { 'data-testid': testID }) }))
vi.mock('../analytics/useMobileAnalytics', () => ({ useMobileAnalytics: () => ({ capture: vi.fn() }) }))
vi.mock('../workspace/useMobileModalDismiss', () => ({ useMobileModalDismiss: () => undefined }))
vi.mock('../components/workspace/MobileWorkspaceIcons', () => ({ MobileNoteIcon: () => null, MobileTypeIcon: () => null }))
vi.mock('../ui/MobilePanel', () => ({ MobilePanel: Surface, MobileToolbar: Surface, MobileToolbarSpacer: () => null,
  MobileToolbarTitle: ({ title, testID }: { title: string; testID?: string }) => createElement('span', { 'data-testid': testID }, title) }))
vi.mock('../ui/MobileIconButton', () => ({ MobileIconButton: Control }))
vi.mock('../ui/MobileChip', () => ({ MobileChip: () => null }))
vi.mock('../qa/mobileLayoutProbe', () => ({ useMobileLayoutProbe: () => ({ probe: () => ({}), metrics: [] }) }))
vi.mock('../workspace/mobileAttachmentImport', () => ({ useMobileAttachmentImporter: () => vi.fn() }))
vi.mock('../workspace/mobileAttachmentOpen', () => ({ useMobileAttachmentLinkOpener: () => vi.fn() }))
vi.mock('../components/workspace/MobileEditorBlocks', () => ({ MobileEditorBlocks: () => null }))
vi.mock('../components/workspace/MobileFilePreview', () => ({ MobileFilePreview: () => null }))
vi.mock('../components/workspace/MobileWysiwygMarkdownEditor', () => ({
  MobileWysiwygMarkdownEditor: ({ note }: { note: MobileNote }) => createElement('div', { 'data-rich-note': note.id }),
}))
vi.mock('../components/workspace/MobileMarkdownSourceEditor', () => ({
  MobileMarkdownSourceEditor: ({ note }: { note: MobileNote }) => createElement('div', { 'data-source-note': note.id }),
}))
vi.mock('./TabletEditorPanelChrome', () => ({ EmptyEditorPanel: () => null, MobileFilePreviewFallback: () => null,
  MobileNoteReadFallback: () => null, MobileSpreadsheetFallback: () => null }))

let root: ReturnType<typeof createRoot> | undefined
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals() })

it('replaces only the rich document on a new revision, retaining the toolbar control', async () => {
  const h = createHarness()
  await h.select(0)
  const document = h.host.querySelector('[data-rich-note]')
  const control = h.button('editor-source-action')
  await h.select(0, 0)
  expect(h.host.querySelector('[data-rich-note]')).toBe(document)
  await h.select(0, 1)
  expect(h.host.querySelector('[data-rich-note]')).not.toBe(document)
  expect(h.button('editor-source-action')).toBe(control)
})

it('replaces a raw document on a new revision without resetting source mode or chrome', async () => {
  const h = createHarness()
  await h.select(0)
  await act(async () => h.button('editor-source-action').click())
  const document = h.host.querySelector('[data-source-note]')
  const control = h.button('editor-source-action')
  await h.select(0, 1)
  expect(h.host.querySelector('[data-source-note]')).not.toBeNull()
  expect(h.host.querySelector('[data-source-note]')).not.toBe(document)
  expect(h.button('editor-source-action')).toBe(control)
})

it('keeps the same raw-mode control through note selection and completes its press on the new note', async () => {
  const harness = createHarness()
  await harness.select(0)
  const original = harness.button('editor-source-action')
  await harness.select(1)
  const current = harness.button('editor-source-action')
  expect(current).toBe(original)
  await act(async () => current.click())
  expect(harness.host.querySelector('[data-source-note]')?.getAttribute('data-source-note')).toBe(harness.notes[1].id)
})

it('closes filename editing on note selection without resuming the abandoned edit when returning', async () => {
  const harness = createHarness()
  await harness.select(0)
  await act(async () => harness.button('editor-filename-action').click())
  expect(harness.host.querySelector('[data-testid="editor-filename-input"]')).not.toBeNull()
  await harness.select(1)
  expect(harness.host.querySelector('[data-testid="editor-filename-input"]')).toBeNull()
  await harness.select(0)
  expect(harness.host.querySelector('[data-testid="editor-filename-input"]')).toBeNull()
  expect(harness.button('editor-source-action')).toBeTruthy()
})

it('cancels filename editing and allows a fresh edit on the same note', async () => {
  const harness = createHarness()
  await harness.select(0)
  await act(async () => harness.button('editor-filename-action').click())
  await act(async () => harness.button('editor-filename-cancel').click())
  expect(harness.host.querySelector('[data-testid="editor-filename-input"]')).toBeNull()
  expect(harness.button('editor-source-action')).toBeTruthy()
  await act(async () => harness.button('editor-filename-action').click())
  expect(harness.host.querySelector('[data-testid="editor-filename-input"]')).not.toBeNull()
})

it('retains the rich editor until its last document read completes', async () => {
  const harness = createHarness()
  const resume = vi.fn()
  let complete = () => {}
  const reading = new Promise<() => void>(resolve => { complete = () => resolve(resume) })
  const prepare = vi.fn(() => reading)
  harness.editors.register(prepare)
  await harness.select(0)
  await act(async () => harness.button('editor-source-action').click())
  expect(prepare).toHaveBeenCalledOnce()
  expect(harness.host.querySelector('[data-source-note]')).toBeNull()
  await act(async () => complete())
  expect(harness.host.querySelector('[data-source-note]')).not.toBeNull()
  expect(resume).toHaveBeenCalledOnce()
})

it('keeps the draft mounted and reports a failed document read instead of switching mode', async () => {
  const harness = createHarness()
  harness.editors.register(() => Promise.reject(new Error('editorNotReady')))
  await harness.select(0)
  await act(async () => harness.button('editor-source-action').click())
  expect(harness.host.querySelector('[data-source-note]')).toBeNull()
  expect(harness.host.querySelector('[role="alert"]')).not.toBeNull()
})

it('does not switch a different note when an older mode request completes', async () => {
  const harness = createHarness()
  const resume = vi.fn()
  let complete = () => {}
  harness.editors.register(() => new Promise<() => void>(resolve => { complete = () => resolve(resume) }))
  await harness.select(0)
  await act(async () => harness.button('editor-source-action').click())
  await harness.select(1)
  await act(async () => complete())
  expect(harness.host.querySelector('[data-source-note]')).toBeNull()
  expect(resume).toHaveBeenCalledOnce()
})

function createHarness() {
  const host = document.createElement('div')
  root = createRoot(host)
  const notes = workspaceScenarioForId('default').notes.slice(0, 2)
  const editors = createWorkspaceSyncEditors()
  return { host, notes, editors,
    button: (testID: string) => {
      const button = host.querySelector<HTMLButtonElement>(`[data-testid="${testID}"]`)
      if (!button) throw new Error(`Missing ${testID}`)
      return button
    },
    select: (index: number, revision = 0) => act(async () => {
      root?.render(createElement(WorkspaceSnapshotRevisionContext.Provider, { value: revision }, createElement(WorkspaceSyncEditorsContext.Provider, { value: editors }, createElement(TabletEditorPanel, { blocks: [], bullets: [], compact: false, notes,
        note: notes[index], onUpdateContent: vi.fn(), onToggleFavorite: vi.fn(), onOpenMoreActions: vi.fn(), onNavigateWikilink: vi.fn(),
        renameFilename: { value: 'renamed.md', notes, onChange: vi.fn(), onSubmit: vi.fn() } }))))
    }),
  }
}
