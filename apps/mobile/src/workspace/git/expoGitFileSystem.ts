import { Buffer } from 'buffer'
import type * as ExpoFileSystem from 'expo-file-system'
import { optionalNativeWorkspaceAccessModule } from '../nativeWorkspaceAccess'
import { gitFileUri, gitFsError } from './gitFileSystemPaths'
import { createGitTaskRunner } from './gitTaskRunner'

type NativeGitFile = Pick<ExpoFileSystem.File, 'bytes' | 'write' | 'delete' | 'info'>
type FileSystemModule = {
  File: new (uri: string) => NativeGitFile
  Directory: new (uri: string) => Pick<ExpoFileSystem.Directory, 'create' | 'delete'>
  Paths: Pick<typeof ExpoFileSystem.Paths, 'info'>
}
type GitPath = string
type FileUri = string
type GitEntryInfo = {
  exists: boolean
  isDirectory?: boolean | null
  size?: number
  modificationTime?: number
  creationTime?: number
}
type ReadEntryInfo = (uri: FileUri) => GitEntryInfo
const cachedHandleLimit = 16_384
declare function require(name: 'expo-file-system'): FileSystemModule
declare function require(name: 'expo-file-system/legacy'): { readDirectoryAsync: (uri: string) => Promise<string[]> }

export function createExpoGitFileSystem(
  rootUri: FileUri,
  module: FileSystemModule = require('expo-file-system'),
  readDirectory = require('expo-file-system/legacy').readDirectoryAsync,
  nativeInfo: ReadEntryInfo | undefined = optionalNativeWorkspaceAccessModule()?.gitEntryInfo,
) {
  const readInfo: ReadEntryInfo = nativeInfo ?? module.Paths.info
  const { run, readNative } = createGitTaskRunner()
  const uri = cachedHandle((path: GitPath) => gitFileUri(rootUri, path))
  const file = cachedHandle((path: GitPath) => new module.File(uri(path)))
  const directory = cachedHandle((path: GitPath) => new module.Directory(uri(path)))
  const stat = (path: GitPath) => run(() => {
    const info = readInfo(uri(path))
    return gitStat(info, () => nativeInfo ? info : file(path).info())
  })
  return {
    promises: {
      readFile: (path: GitPath, options?: string | { encoding?: string }) => readNative(async () => {
        requireEntry(readInfo, uri(path), false)
        const nativeBytes = await file(path).bytes()
        const bytes = Buffer.from(nativeBytes.buffer, nativeBytes.byteOffset, nativeBytes.byteLength)
        return options === 'utf8' || (typeof options === 'object' && options.encoding === 'utf8')
          ? bytes.toString('utf8') : bytes
      }),
      writeFile: (path: GitPath, content: string | Uint8Array) => run(() => {
        requireParent(readInfo, uri(path))
        // Expo needs a plain Uint8Array. Share its bounded buffer instead of copying a whole Git pack.
        file(path).write(typeof content === 'string' ? content
          : new Uint8Array(content.buffer, content.byteOffset, content.byteLength))
      }),
      unlink: (path: GitPath) => run(() => {
        requireEntry(readInfo, uri(path), false)
        file(path).delete()
      }),
      readdir: (path: GitPath) => readNative(() => {
        requireEntry(readInfo, uri(path), true)
        return readDirectory(uri(path))
      }),
      mkdir: (path: GitPath) => run(() => {
        if (readInfo(uri(path)).exists) throw gitFsError('EEXIST')
        requireParent(readInfo, uri(path))
        directory(path).create()
      }),
      rmdir: (path: GitPath) => run(async () => {
        requireEntry(readInfo, uri(path), true)
        if ((await readNative(() => readDirectory(uri(path)))).length) throw gitFsError('ENOTEMPTY')
        await run(() => directory(path).delete())
      }),
      stat,
      lstat: stat,
      readlink: async () => { throw gitFsError('ENOTSUP') },
      symlink: async () => { throw gitFsError('ENOTSUP') },
    },
  }
}

function requireParent(readInfo: ReadEntryInfo, uri: FileUri) {
  const parent = uri.slice(0, uri.replace(/\/$/u, '').lastIndexOf('/'))
  requireEntry(readInfo, parent, true)
}

function requireEntry(readInfo: ReadEntryInfo, uri: FileUri, directory: boolean) {
  const info = readInfo(uri)
  if (!info.exists) throw gitFsError('ENOENT')
  if (info.isDirectory !== directory) throw gitFsError(directory ? 'ENOTDIR' : 'EISDIR')
}

function gitStat(info: GitEntryInfo, readMetadata: () => Omit<GitEntryInfo, 'exists'>) {
  if (!info.exists) throw gitFsError('ENOENT')
  const isDirectory = Boolean(info.isDirectory)
  const metadata = isDirectory ? null : readMetadata()
  return {
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isSymbolicLink: () => false,
    size: metadata?.size ?? 0,
    mode: isDirectory ? 0o40755 : 0o100644,
    mtimeMs: metadata?.modificationTime ?? 0,
    ctimeMs: metadata?.creationTime ?? 0,
    uid: 0,
    gid: 0,
    dev: 0,
    ino: 0,
  }
}

function cachedHandle<T>(create: (path: string) => T) {
  // Cache only path handles, never bytes, existence, or timestamps. Bound memory
  // even when a connection is retained across operations on a very large vault.
  const entries = new Map<string, T>()
  return (path: string): T => {
    const cached = entries.get(path)
    if (cached !== undefined) return cached
    const entry = create(path)
    if (entries.size >= cachedHandleLimit) entries.clear()
    entries.set(path, entry)
    return entry
  }
}
