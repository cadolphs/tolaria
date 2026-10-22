import { useMobileStyles, useMobileColors, useMobileMetrics } from '../ui/theme/useMobileTheme'
import { Code, DotsThree, ListBullets, Star } from 'phosphor-react-native'
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { WorkspaceSnapshotRevisionContext } from '../workspace/workspaceSyncEditors'
import { MobileEditorBlocks } from '../components/workspace/MobileEditorBlocks'
import { MobileFilePreview } from '../components/workspace/MobileFilePreview'
import { MobileMarkdownSourceEditor } from '../components/workspace/MobileMarkdownSourceEditor'
import { MobileEditorFileIdentity } from '../components/workspace/MobileEditorFileIdentity'
import { MobileWysiwygMarkdownEditor } from '../components/workspace/MobileWysiwygMarkdownEditor'
import { mobileText } from '../i18n/mobileText'
import { MobileChip } from '../ui/MobileChip'
import { MobileIconButton } from '../ui/MobileIconButton'
import { MobilePanel, MobileToolbar, MobileToolbarSpacer } from '../ui/MobilePanel'

import { MobileLayoutProbeReadout } from '../qa/MobileLayoutProbeReadout'
import { useMobileLayoutProbe } from '../qa/mobileLayoutProbe'
import type { MobileEditorBlock, MobileNote } from '../workspace/mobileWorkspaceModel'
import type { MobileTableOfContentsTarget } from '../workspace/mobileTableOfContents'
import { nativeTableOfContentsScrollProof, type NativeTableOfContentsProof } from '../qa/nativeTableOfContentsProbe'
import { useMobileAttachmentImporter } from '../workspace/mobileAttachmentImport'
import { useMobileAttachmentLinkOpener } from '../workspace/mobileAttachmentOpen'
import { useRegisteredMobileEditorCommands } from '../workspace/mobileEditorCommands'
import { mobileNoteActionMode } from '../workspace/mobileNoteActionMode'
import { mobileSpreadsheetNeedsFallback } from '../workspace/mobileSpreadsheetFormat'
import { Text } from '../components/ui/text'
import { useEditorModeSwitch } from './useEditorModeSwitch'
import { EmptyEditorPanel, MobileFilePreviewFallback, MobileNoteReadFallback, MobileSpreadsheetFallback } from './TabletEditorPanelChrome'
import { createEditorPanelStyles } from './TabletEditorPanelStyles'
import type {
  EditorContentProps,
  EditorEditingMode,
  EditorFileMode,
  EditorPanelBodyProps,
  EditorToolbarProps,
  TableOfContentsScroll,
  TabletEditorPanelProps,
} from './TabletEditorPanel.types'

export type { EditorEditingMode } from './TabletEditorPanel.types'

export function TabletEditorPanel(props: TabletEditorPanelProps) {
  const themeStyles = useMobileStyles(createEditorPanelStyles)
  const { panelStyles } = themeStyles
  const {
    blocks,
    bullets,
    compact,
    initialEditing = true,
    initialEditingMode = 'wysiwyg',
    layoutProbe: layoutProbeEnabled = false,
    leading,
    trailing,
    note,
    noteRead,
    notes,
    onNavigateWikilink,
    onOpenMoreActions,
    onOpenTableOfContents,
    onRegisterEditorCommands,
    onTableOfContentsScrollProof,
    onToggleFavorite,
    onUpdateContent,
    sourceIdleSave = true,
    sourceSelectionProbe = false,
    tableOfContentsTarget = null,
    typeDefinitions,
    vaultRootUri = null,
  } = props
  const [editingMode, setEditingMode] = useState<EditorEditingMode>(initialEditingMode)
  const { onScroll, onTargetLayout, setScrollViewNode } = useTableOfContentsScroll(
    tableOfContentsTarget,
    onTableOfContentsScrollProof,
  )
  const importAttachment = useMobileAttachmentImporter(vaultRootUri)
  const openLink = useMobileAttachmentLinkOpener(vaultRootUri)
  const layoutProbe = useMobileLayoutProbe(layoutProbeEnabled)
  const changeEditingMode = useCallback(() => {
    setEditingMode((current) => (current === 'source' ? 'wysiwyg' : 'source'))
  }, [])
  const { toggle: toggleSourceMode, failed: modeSwitchFailed } = useEditorModeSwitch(note?.id, changeEditingMode)
  useRegisteredMobileEditorCommands(onRegisterEditorCommands, {
    toggleRawEditor: note && editorFileMode(note) === 'markdown' ? toggleSourceMode : undefined,
  })

  if (!note) {
    return <EmptyEditorPanel />
  }

  const fileMode = editorFileMode(note)
  const plainText = fileMode === 'text'
  const effectiveEditing = fileMode !== 'binary' && initialEditing
  const effectiveEditingMode = plainText ? 'source' : editingMode
  const contentProps: EditorContentProps = {
    blocks,
    bullets,
    compact,
    editing: effectiveEditing,
    editingMode: effectiveEditingMode,
    layoutProbe: layoutProbe.probe,
    note,
    notes,
    onImportAttachment: importAttachment,
    onNavigateWikilink,
    onOpenLink: openLink,
    onRegisterEditorCommands,
    onTableOfContentsScrollProof,
    onTableOfContentsTargetLayout: onTargetLayout,
    onUpdateContent,
    plainText,
    sourceIdleSave,
    sourceSelectionProbe,
    tableOfContentsTarget,
    typeDefinitions,
    vaultRootUri,
    wysiwygAutocompleteProbe: props.wysiwygAutocompleteProbe ?? false,
    wysiwygExternalLinkProbe: props.wysiwygExternalLinkProbe ?? false,
    wysiwygFormatCommandProbe: props.wysiwygFormatCommandProbe ?? false,
    wysiwygInputTransformProbe: props.wysiwygInputTransformProbe ?? false,
    wysiwygMarkdownBlockProbe: props.wysiwygMarkdownBlockProbe ?? false,
    wysiwygMathEditProbe: props.wysiwygMathEditProbe ?? false,
    wysiwygTableCommandMutationProbe: props.wysiwygTableCommandMutationProbe ?? false,
    wysiwygMutationProbe: props.wysiwygMutationProbe ?? false,
    wysiwygWikilinkInsertProbe: props.wysiwygWikilinkInsertProbe ?? false,
  }

  return (
    <MobilePanel {...layoutProbe.probe('editor.panel')} style={panelStyles.panel} testID="editor-panel">
      <EditorToolbar
        editingMode={effectiveEditingMode}
        editing={effectiveEditing}
        fileMode={fileMode}
        leading={leading}
        trailing={trailing}
        note={note}
        renameFilename={props.renameFilename}
        onOpenMoreActions={onOpenMoreActions}
        onOpenTableOfContents={onOpenTableOfContents}
        onToggleSourceMode={toggleSourceMode}
        onToggleFavorite={onToggleFavorite}
        typeDefinitions={typeDefinitions}
      />
      <EditorModeFailure failed={modeSwitchFailed} />
      <EditorPanelBody
        compact={compact}
        contentProps={contentProps}
        fileMode={fileMode}
        note={note}
        noteRead={noteRead}
        onScroll={onScroll}
        onScrollViewRef={setScrollViewNode}
      />
      {layoutProbeEnabled ? (
        <MobileLayoutProbeReadout metrics={layoutProbe.metrics} testID="editor-layout-metrics" />
      ) : null}
    </MobilePanel>
  )
}

function EditorModeFailure({ failed }: { failed: boolean }) {
  const colors = useMobileColors()
  const metrics = useMobileMetrics()
  return failed ? <Text accessibilityRole="alert" style={{ color: colors.danger,
    fontSize: metrics.type.body, padding: metrics.space.md }}>{mobileText('mobile.editor.readFailed')}</Text> : null
}

function EditorPanelBody({ compact, contentProps, fileMode, note, noteRead, onScroll, onScrollViewRef }: EditorPanelBodyProps) {
  const themeStyles = useMobileStyles(createEditorPanelStyles)
  const { panelStyles } = themeStyles
  if (noteRead && noteRead.status !== 'ready') return <MobileNoteReadFallback state={noteRead} />
  if (fileMode === 'binary') {
    return (
      <MobileFilePreview note={note} vaultRootUri={contentProps.vaultRootUri} fallback={
        <ScrollView contentContainerStyle={panelStyles.filePreviewContent} testID="editor-scroll">
          <MobileFilePreviewFallback note={note} typeDefinitions={contentProps.typeDefinitions} />
        </ScrollView>
      } />
    )
  }

  if (mobileSpreadsheetNeedsFallback(note, contentProps.editingMode)) {
    return <MobileSpreadsheetFallback />
  }

  if (contentProps.editing) {
    return (
      <View style={panelStyles.editorHost} testID="editor-scroll">
        <EditorContent {...contentProps} />
      </View>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={readModeContentStyle(themeStyles, note, compact)}
      onScroll={onScroll}
      ref={onScrollViewRef}
      scrollEventThrottle={16}
      style={panelStyles.editorHost}
      testID="editor-scroll"
    >
      <EditorContent {...contentProps} />
    </ScrollView>
  )
}

function useTableOfContentsScroll(
  target: MobileTableOfContentsTarget | null,
  onProof?: (proof: NativeTableOfContentsProof) => void,
): TableOfContentsScroll {
  const metrics = useMobileMetrics()
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [scrollViewVersion, setScrollViewVersion] = useState(0)
  const scrollViewRef = useRef<ScrollView | null>(null)
  const scrollYRef = useRef(0)
  const targetOffsetsRef = useRef<Record<string, number>>({})
  const setScrollViewNode = useCallback((node: ScrollView | null) => {
    scrollViewRef.current = node
    setScrollViewVersion((current) => current + 1)
  }, [])
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y
  }, [])
  const onTargetLayout = useCallback((targetId: string, event: LayoutChangeEvent) => {
    targetOffsetsRef.current[targetId] = event.nativeEvent.layout.y
    setLayoutVersion((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!target) return

    const y = targetOffsetsRef.current[target.id]
    if (typeof y !== 'number') return
    const scrollView = scrollViewRef.current
    if (!scrollView) return

    const beforeY = scrollYRef.current
    const expectedY = Math.max(0, y - metrics.editor.contentPaddingVertical)
    scrollView.scrollTo({
      animated: true,
      y: expectedY,
    })

    if (!onProof) return

    const proofTimeout = setTimeout(() => {
      onProof(
        nativeTableOfContentsScrollProof({
          afterY: scrollYRef.current,
          beforeY,
          expectedY,
          targetId: target.id,
        }),
      )
    }, 900)

    return () => clearTimeout(proofTimeout)
  }, [layoutVersion, onProof, scrollViewVersion, target, metrics])

  return { onScroll, onTargetLayout, setScrollViewNode }
}

function EditorToolbar(props: EditorToolbarProps) {
  const chipLabel = editorToolbarChipLabel(props.fileMode)

  return (
    <MobileToolbar testID="editor-toolbar">
      {props.leading}
      <MobileEditorFileIdentity note={props.note} rename={props.renameFilename} typeDefinitions={props.typeDefinitions}>
        {chipLabel ? <MobileChip label={chipLabel} tone="gray" /> : null}
        <MobileToolbarSpacer />
        <EditorToolbarActions {...props} />
        {props.trailing}
      </MobileEditorFileIdentity>
    </MobileToolbar>
  )
}

function EditorToolbarActions(props: EditorToolbarProps) {
  if (props.fileMode !== 'markdown') return <FileToolbarActions {...props} />
  return <MarkdownToolbarActions {...props} />
}

function FileToolbarActions(props: EditorToolbarProps) {
  const mobileColors = useMobileColors()
  const desktopToolbarActionParity = useMobileMetrics().toolbarAction
  return (
    <MobileIconButton
      accessibilityLabel={mobileText('editor.toolbar.moreActions')}
      testID="editor-more-action"
      onPress={props.onOpenMoreActions}
    >
      <DotsThree color={mobileColors.textMuted} size={desktopToolbarActionParity.iconSize} weight="bold" />
    </MobileIconButton>
  )
}

function MarkdownToolbarActions({
  editingMode,
  note,
  onOpenMoreActions,
  onOpenTableOfContents,
  onToggleFavorite,
  onToggleSourceMode,
}: EditorToolbarProps) {
  const mobileColors = useMobileColors()
  const sourceModeActive = editingMode === 'source'
  const desktopToolbarActionParity = useMobileMetrics().toolbarAction

  return (
    <>
      <MobileIconButton
        accessibilityLabel={mobileText(note.favorite ? 'command.note.removeFavorite' : 'command.note.addFavorite')}
        testID="editor-favorite-action"
        onPress={onToggleFavorite}
      >
        <Star
          color={note.favorite ? mobileColors.primary : mobileColors.textMuted}
          size={desktopToolbarActionParity.iconSize}
          weight={note.favorite ? 'fill' : 'regular'}
        />
      </MobileIconButton>
      <MobileIconButton
        accessibilityLabel={mobileText(sourceModeActive ? 'editor.toolbar.rawReturn' : 'editor.toolbar.rawOpen')}
        selected={sourceModeActive}
        testID="editor-source-action"
        onPress={onToggleSourceMode}
      >
        <Code
          color={sourceModeActive ? mobileColors.primary : mobileColors.textMuted}
          size={desktopToolbarActionParity.iconSize}
        />
      </MobileIconButton>
      {onOpenTableOfContents ? <MobileIconButton
        accessibilityLabel={mobileText('editor.toolbar.openTableOfContents')}
        testID="editor-table-of-contents-action"
        onPress={onOpenTableOfContents}
      >
        <ListBullets color={mobileColors.textMuted} size={desktopToolbarActionParity.iconSize} />
      </MobileIconButton> : null}
      <MobileIconButton
        accessibilityLabel={mobileText('editor.toolbar.moreActions')}
        testID="editor-more-action"
        onPress={onOpenMoreActions}
      >
        <DotsThree color={mobileColors.textMuted} size={desktopToolbarActionParity.iconSize} weight="bold" />
      </MobileIconButton>
    </>
  )
}

function EditorContent({
  blocks,
  bullets,
  compact,
  editing,
  editingMode,
  layoutProbe,
  note,
  notes,
  plainText,
  onImportAttachment,
  onNavigateWikilink,
  onOpenLink,
  onRegisterEditorCommands,
  onTableOfContentsScrollProof,
  onTableOfContentsTargetLayout,
  onUpdateContent,
  sourceIdleSave,
  sourceSelectionProbe = false,
  tableOfContentsTarget = null,
  typeDefinitions,
  vaultRootUri = null,
  wysiwygAutocompleteProbe = false,
  wysiwygExternalLinkProbe = false,
  wysiwygFormatCommandProbe = false,
  wysiwygInputTransformProbe = false,
  wysiwygMarkdownBlockProbe = false,
  wysiwygMathEditProbe = false,
  wysiwygTableCommandMutationProbe = false,
  wysiwygWikilinkInsertProbe = false,
  wysiwygMutationProbe = false,
}: EditorContentProps) {
  const revision = useContext(WorkspaceSnapshotRevisionContext)
  if (editing) {
    if (plainText || editingMode === 'source') {
      return (
        <MobileMarkdownSourceEditor
          key={`${revision}:${note.id}:${plainText ? 'text' : 'source'}`}
          blocks={blocks}
          bullets={bullets}
          compact={compact}
          note={note}
          notes={notes}
          onImportAttachment={onImportAttachment}
          onRegisterEditorCommands={onRegisterEditorCommands}
          onUpdateContent={onUpdateContent}
          idleSave={sourceIdleSave}
          plainText={plainText}
          sourceSelectionProbe={sourceSelectionProbe}
        />
      )
    }

    return (
      <MobileWysiwygMarkdownEditor
        key={`${revision}:${note.id}:wysiwyg`}
        blocks={blocks}
        bullets={bullets}
        compact={compact}
        layoutProbe={layoutProbe}
        note={note}
        notes={notes}
        onImportAttachment={onImportAttachment}
        onRegisterEditorCommands={onRegisterEditorCommands}
        onTableOfContentsScrollProof={onTableOfContentsScrollProof}
        onUpdateContent={onUpdateContent}
        tableOfContentsTarget={tableOfContentsTarget}
        typeDefinitions={typeDefinitions}
        vaultRootUri={vaultRootUri}
        wysiwygAutocompleteProbe={wysiwygAutocompleteProbe}
        wysiwygExternalLinkProbe={wysiwygExternalLinkProbe}
        wysiwygFormatCommandProbe={wysiwygFormatCommandProbe}
        wysiwygInputTransformProbe={wysiwygInputTransformProbe}
        wysiwygMarkdownBlockProbe={wysiwygMarkdownBlockProbe}
        wysiwygMathEditProbe={wysiwygMathEditProbe}
        wysiwygTableCommandMutationProbe={wysiwygTableCommandMutationProbe}
        wysiwygWikilinkInsertProbe={wysiwygWikilinkInsertProbe}
        wysiwygMutationProbe={wysiwygMutationProbe}
      />
    )
  }

  const readBlocks = note.editorBlocks ?? blocks
  const readBullets = note.editorBullets ?? bullets

  return (
    <MobileEditorBlocks
      blocks={readBlocks}
      fallbackBullets={readBullets}
      renderTitleBlock={shouldRenderReadTitleBlock(note, readBlocks)}
      tableOfContentsTitle={note.title}
      onTableOfContentsTargetLayout={onTableOfContentsTargetLayout}
      onOpenLink={onOpenLink}
      onNavigateWikilink={onNavigateWikilink}
    />
  )
}

function shouldRenderReadTitleBlock(note: MobileNote, blocks: MobileEditorBlock[]) {
  if (blocks.length === 0) return false
  if (generatedUntitledTitlePattern.test(note.title)) return false
  return note.title.trim().length > 0
}

const generatedUntitledTitlePattern = /^Untitled\s+\S+\s+\d+$/u

function editorFileMode(note: MobileNote): EditorFileMode {
  const actionMode = mobileNoteActionMode(note)
  if (actionMode === 'binary-file') return 'binary'
  return actionMode === 'text-file' ? 'text' : 'markdown'
}

function editorToolbarChipLabel(fileMode: EditorFileMode): string | null {
  if (fileMode === 'text') return mobileText('filePreview.textFile')
  if (fileMode === 'binary') return mobileText('filePreview.file')
  return null
}

function readModeContentStyle(themeStyles: ReturnType<typeof createEditorPanelStyles>, note: MobileNote, compact: boolean) {
  const { panelStyles } = themeStyles
  return [
    panelStyles.content,
    note.noteWidth === 'wide' ? panelStyles.contentWide : null,
    compact ? panelStyles.contentCompact : null,
  ]
}
