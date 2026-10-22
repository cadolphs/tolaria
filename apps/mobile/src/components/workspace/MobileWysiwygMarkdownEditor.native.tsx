import type { MobileMetrics } from '../../ui/mobileMetrics'
import { useMobileStyles } from '../../ui/theme/useMobileTheme'
import type { MobileColors } from '../../ui/theme/mobilePalette'
import { RichText } from '@10play/tentap-editor'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { MobileKeyboardAvoidingView } from '../../ui/MobileKeyboardAvoidingView'
import { probeProps } from '../../qa/mobileLayoutProbe'
import { isMobileImageAttachment } from '../../workspace/mobileAttachments'
import { mobileDocumentBody } from '../../workspace/mobileDocumentContent'
import { useRegisteredMobileEditorCommands } from '../../workspace/mobileEditorCommands'
import type { MobileNote, MobileTypeDefinitions } from '../../workspace/mobileWorkspaceModel'
import { MobileWysiwygFormattingToolbar } from './MobileWysiwygFormattingToolbar.native'
import { MobileWysiwygExternalLinkSheet } from './MobileWysiwygExternalLinkSheet'
import { nativeWysiwygInitialExternalLinkValue } from './MobileWysiwygExternalLinkSheetModel'
import { applyNativeWysiwygFormat, isNativeWysiwygMarkdownBlockAction, type NativeWysiwygCommandBridge, nativeWysiwygFormattingActions } from './MobileWysiwygFormatCommands'
import { MobileWysiwygSlashMenu } from './MobileWysiwygSlashMenu.native'
import { MobileWysiwygFind } from './MobileWysiwygFind.native'
import { useMobileEditorFileSource } from './mobileEditorFileSource.native'
import type { NativeWysiwygInlineAutocomplete, NativeWysiwygPlainTextPayload, NativeWysiwygWikilinkPayload } from './MobileWysiwygWikilinkBridgeModel'
import { MobileWysiwygWikilinkPicker } from './MobileWysiwygWikilinkPicker'
import type { MobileWysiwygMarkdownEditorProps, NativeWysiwygPickerState, NativeWysiwygExternalLinkSheetState, NativeTentapEditorSurfaceProps, NativeTentapEditorSurfaceActionProps, NativeTentapEditorSurfaceActions } from './MobileNativeEditor.types'
import { nativeWysiwygEditorState, nativeWysiwygEditorSelection, applyNativeWysiwygExternalLink, insertImportedAttachment, insertClipboardPlainText } from './mobileNativeEditorOperations'
import { useNativeTentapEditorBridge, initialNativeEditorContent } from './useMobileNativeEditorRuntime'
import { useNativeEditorRecovery, type NativeEditorRecoveryHandlers } from './useNativeEditorRecovery'

type SessionProps = MobileWysiwygMarkdownEditorProps & NativeEditorRecoveryHandlers
type SurfaceProps = NativeTentapEditorSurfaceProps & NativeEditorRecoveryHandlers

export function MobileWysiwygMarkdownEditor(props: MobileWysiwygMarkdownEditorProps) {
  const recovery = useNativeEditorRecovery()
  return <NativeEditorSession key={recovery.generation} {...props} onProcessLoss={recovery.onProcessLoss} />
}

function NativeEditorSession(props: SessionProps) {
  const {
    blocks,
    bullets,
    layoutProbe,
    note,
    notes,
    onImportAttachment,
    onRegisterEditorCommands,
    typeDefinitions,
    vaultRootUri = null,
  } = props
  const [pickerState, setPickerState] = useState<NativeWysiwygPickerState | null>(null)
  const [externalLinkState, setExternalLinkState] = useState<NativeWysiwygExternalLinkSheetState | null>(null)
  const handleInlineAutocomplete = useCallback((match: NativeWysiwygInlineAutocomplete | null) => {
    setPickerState((current) => inlineAutocompletePickerState(current, match))
  }, [])
  const handleOpenToolbarWikilinkPicker = useCallback(() => {
    setPickerState({
      kind: 'wikilink',
      query: '',
      source: 'toolbar',
    })
  }, [])
  const handleCloseWikilinkPicker = useCallback(() => {
    setPickerState(null)
  }, [])
  const bridge = useNativeTentapEditorBridge({
    ...props,
    initialDocumentContent: initialNativeEditorContent(props),
    onInlineAutocomplete: handleInlineAutocomplete,
  })
  const handleOpenExternalLinkSheet = useCallback(() => {
    setExternalLinkState({
      initialUrl: nativeWysiwygInitialExternalLinkValue(nativeWysiwygEditorState(bridge.editor)),
      selection: nativeWysiwygEditorSelection(bridge.editor),
    })
  }, [bridge.editor])
  const handleCloseExternalLinkSheet = useCallback(() => {
    setExternalLinkState(null)
  }, [])

  return (
    <NativeTentapEditorSurface
      {...bridge}
      onProcessLoss={reason => { bridge.retireEditor(); props.onProcessLoss(reason) }}
      vaultRootUri={vaultRootUri}
      previewMarkdown={mobileDocumentBody(initialNativeEditorContent({ blocks, bullets, note }))}
      layoutProbe={layoutProbe}
      notes={notes}
      onImportAttachment={onImportAttachment}
      onRegisterEditorCommands={onRegisterEditorCommands}
      pickerState={pickerState}
      sourceNote={note}
      typeDefinitions={typeDefinitions}
      externalLinkState={externalLinkState}
      onCloseExternalLinkSheet={handleCloseExternalLinkSheet}
      onCloseWikilinkPicker={handleCloseWikilinkPicker}
      onOpenExternalLinkSheet={handleOpenExternalLinkSheet}
      onOpenToolbarWikilinkPicker={handleOpenToolbarWikilinkPicker}
    />
  )
}

function NativeTentapEditorSurface(props: SurfaceProps) {
  const { nativeEditorStyles } = useMobileStyles(createThemeStyles)
  const fileSource = useMobileEditorFileSource(props.vaultRootUri, props.previewMarkdown)
  const {
    activateEditorChanges,
    editor,
    externalLinkState,
    flushEditorDocument,
    injectEditorCss,
    insertAttachment,
    insertMarkdownBlock,
    insertPlainText,
    insertWikilink,
    layoutProbe,
    notes,
    onCloseExternalLinkSheet,
    onCloseWikilinkPicker,
    onImportAttachment,
    onOpenExternalLinkSheet,
    onOpenToolbarWikilinkPicker,
    onRegisterEditorCommands,
    pickerState,
    sourceNote,
    typeDefinitions,
  } = props
  const actions = useNativeTentapEditorSurfaceActions({
    editor,
    externalLinkState,
    flushEditorDocument,
    insertAttachment,
    insertMarkdownBlock,
    insertPlainText,
    insertWikilink,
    onCloseExternalLinkSheet,
    onCloseWikilinkPicker,
    onImportAttachment: async () => {
      const attachment = await onImportAttachment?.()
      if (attachment && isMobileImageAttachment(attachment)) await fileSource.prepareAttachment?.(attachment.path)
      return attachment ?? null
    },
    onOpenExternalLinkSheet,
    onOpenToolbarWikilinkPicker,
    pickerState,
  })
  useRegisteredMobileEditorCommands(onRegisterEditorCommands, {
    blur: () => editor.blur(),
    pastePlainText: actions.handlePastePlainText,
    save: flushEditorDocument,
  })

  return (
    <MobileKeyboardAvoidingView
      {...probeProps(layoutProbe, 'editor.wysiwyg.form')}
      style={nativeEditorStyles.container}
      testID="editor-wysiwyg-form"
      onTouchStart={activateEditorChanges}
    >
      <MobileWysiwygFind editor={editor} register={onRegisterEditorCommands} onBeforeReplace={activateEditorChanges} />
      {fileSource.ready && (
        <RichText
          editor={editor}
          {...fileSource.webViewProps}
          {...probeProps(layoutProbe, 'editor.wysiwyg.richText')}
          style={nativeEditorStyles.richText}
          testID="editor-wysiwyg-input"
          onLoadEnd={injectEditorCss}
          onContentProcessDidTerminate={() => props.onProcessLoss('contentProcessTerminated')}
          onRenderProcessGone={() => props.onProcessLoss('renderProcessGone')}
        />
      )}
      <MobileWysiwygSlashMenu editor={editor} />
      <View
        {...probeProps(layoutProbe, 'editor.wysiwyg.toolbarHost')}
        style={nativeEditorStyles.toolbarHost}
      >
        <MobileWysiwygFormattingToolbar
          editor={editor}
          actions={nativeWysiwygFormattingActions}
          layoutProbe={layoutProbe}
          metricId="editor.wysiwyg.toolbar"
          onFormat={actions.handleFormat}
        />
      </View>
      <NativeWysiwygPickerOverlay
        actions={actions}
        notes={notes}
        pickerState={pickerState}
        sourceNote={sourceNote}
        typeDefinitions={typeDefinitions}
        onClose={onCloseWikilinkPicker}
      />
      <NativeWysiwygExternalLinkOverlay
        actions={actions}
        externalLinkState={externalLinkState}
        onClose={onCloseExternalLinkSheet}
      />
    </MobileKeyboardAvoidingView>
  )
}

function useNativeTentapEditorSurfaceActions(props: NativeTentapEditorSurfaceActionProps): NativeTentapEditorSurfaceActions {
  const {
    editor, externalLinkState, flushEditorDocument, insertAttachment,
    insertMarkdownBlock, insertPlainText, insertWikilink,
    onCloseExternalLinkSheet, onCloseWikilinkPicker, onImportAttachment,
    onOpenExternalLinkSheet, onOpenToolbarWikilinkPicker, pickerState,
  } = props
  const handleFormat = useNativeWysiwygToolbarHandler({
    editor,
    insertAttachment,
    insertMarkdownBlock,
    insertPlainText,
    onImportAttachment,
    onOpenExternalLinkSheet,
    onOpenToolbarWikilinkPicker,
  })
  const handlePastePlainText = useCallback(() => {
    void handleFormat('pastePlainText')
  }, [handleFormat])
  const replacementRange = pickerState?.replacementRange
  const handleInsertWikilink = useCallback(
    (payload: NativeWysiwygWikilinkPayload) => {
      insertWikilink(payload, replacementRange)
      onCloseWikilinkPicker()
    },
    [insertWikilink, onCloseWikilinkPicker, replacementRange],
  )
  const handleInsertEmoji = useCallback(
    (payload: NativeWysiwygPlainTextPayload) => {
      insertPlainText(payload, replacementRange)
      onCloseWikilinkPicker()
    },
    [insertPlainText, onCloseWikilinkPicker, replacementRange],
  )
  const externalLinkSelection = externalLinkState?.selection
  const handleApplyExternalLink = useCallback(
    (url: string) => {
      applyNativeWysiwygExternalLink(editor, url, flushEditorDocument, externalLinkSelection)
      onCloseExternalLinkSheet()
    },
    [editor, externalLinkSelection, flushEditorDocument, onCloseExternalLinkSheet],
  )
  const handleRemoveExternalLink = useCallback(() => {
    applyNativeWysiwygExternalLink(editor, null, flushEditorDocument, externalLinkSelection)
    onCloseExternalLinkSheet()
  }, [editor, externalLinkSelection, flushEditorDocument, onCloseExternalLinkSheet])

  return {
    handleApplyExternalLink,
    handleFormat,
    handleInsertEmoji,
    handleInsertWikilink,
    handlePastePlainText,
    handleRemoveExternalLink,
  }
}

function NativeWysiwygPickerOverlay({
  actions,
  notes,
  pickerState,
  sourceNote,
  typeDefinitions,
  onClose,
}: {
  actions: NativeTentapEditorSurfaceActions
  notes: MobileNote[]
  pickerState: NativeWysiwygPickerState | null
  sourceNote: MobileNote
  typeDefinitions: MobileTypeDefinitions | null | undefined
  onClose: () => void
}) {
  if (!pickerState) return null

  return (
    <MobileWysiwygWikilinkPicker
      initialQuery={pickerState.query}
      key={wikilinkPickerKey(pickerState)}
      kind={pickerState.kind}
      notes={notes}
      sourceNote={sourceNote}
      typeDefinitions={typeDefinitions}
      onClose={onClose}
      onSelect={actions.handleInsertWikilink}
      onSelectEmoji={actions.handleInsertEmoji}
    />
  )
}

function NativeWysiwygExternalLinkOverlay({
  actions,
  externalLinkState,
  onClose,
}: {
  actions: NativeTentapEditorSurfaceActions
  externalLinkState: NativeWysiwygExternalLinkSheetState | null
  onClose: () => void
}) {
  if (!externalLinkState) return null

  return (
    <MobileWysiwygExternalLinkSheet
      initialUrl={externalLinkState.initialUrl}
      onApply={actions.handleApplyExternalLink}
      onClose={onClose}
      onRemove={actions.handleRemoveExternalLink}
    />
  )
}

function useNativeWysiwygToolbarHandler({
  editor,
  insertAttachment,
  insertMarkdownBlock,
  insertPlainText,
  onImportAttachment,
  onOpenExternalLinkSheet,
  onOpenToolbarWikilinkPicker,
}: Pick<
  NativeTentapEditorSurfaceProps,
  | 'editor'
  | 'insertAttachment'
  | 'insertMarkdownBlock'
  | 'insertPlainText'
  | 'onImportAttachment'
  | 'onOpenExternalLinkSheet'
  | 'onOpenToolbarWikilinkPicker'
>) {
  return useCallback(
    async (action: Parameters<typeof applyNativeWysiwygFormat>[1]) => {
      if (action === 'attachment') return insertImportedAttachment(onImportAttachment, insertAttachment)
      if (action === 'link') return onOpenExternalLinkSheet()
      if (action === 'pastePlainText') return insertClipboardPlainText(insertPlainText)
      if (action === 'wikilink') return onOpenToolbarWikilinkPicker()
      if (isNativeWysiwygMarkdownBlockAction(action)) return insertMarkdownBlock({ action })

      applyNativeWysiwygFormat(editor as NativeWysiwygCommandBridge, action)
    },
    [
      editor,
      insertAttachment,
      insertMarkdownBlock,
      insertPlainText,
      onImportAttachment,
      onOpenExternalLinkSheet,
      onOpenToolbarWikilinkPicker,
    ],
  )
}

function inlineAutocompletePickerState(
  current: NativeWysiwygPickerState | null,
  match: NativeWysiwygInlineAutocomplete | null,
): NativeWysiwygPickerState | null {
  if (current?.source === 'toolbar') return current
  if (!match) return current?.source === 'inline' ? null : current

  return {
    kind: match.kind,
    query: match.query,
    replacementRange: match.range,
    source: 'inline',
  }
}

function wikilinkPickerKey(state: NativeWysiwygPickerState): string {
  return [
    state.source,
    state.kind,
    state.query,
    state.replacementRange?.from ?? 'selection',
    state.replacementRange?.to ?? 'selection',
  ].join(':')
}

function createThemeStyles(mobileColors: MobileColors, metrics: MobileMetrics) {
  const { space: mobileSpace } = metrics
  const nativeEditorStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: mobileColors.editor,
    },
    richText: {
      flex: 1,
      backgroundColor: mobileColors.editor,
    },
    toolbarHost: {
      backgroundColor: mobileColors.editor,
      borderTopColor: mobileColors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: mobileSpace.md,
    },
  })
  return { mobileColors, nativeEditorStyles }
}
