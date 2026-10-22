export type NativeEditorLossReason = 'contentProcessTerminated' | 'renderProcessGone'

type Options = {
  active: boolean
  generation?: number
  isBlocked: () => boolean
  restart: (generation: number, reason: NativeEditorLossReason) => void
}

/** A dead WebView must not serialize or restart across a working-copy replacement. */
export function createNativeEditorRecovery(options: Options) {
  let active = options.active
  let disposed = false
  let generation = options.generation ?? 0
  let pending: NativeEditorLossReason | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => { clearTimeout(timer); timer = undefined }
  const resume = () => {
    cancel()
    if (disposed || !active) return
    if (!pending) return
    if (options.isBlocked()) { timer = setTimeout(resume, 100); return }
    const reason = pending
    pending = null
    options.restart(++generation, reason)
  }
  return {
    lost: (session: number, reason: NativeEditorLossReason) => {
      if (disposed || session !== generation) return
      if (pending) return
      pending = reason
      resume()
    },
    setActive: (value: boolean) => { active = value; resume() },
    dispose: () => { disposed = true; pending = null; cancel() },
  }
}
