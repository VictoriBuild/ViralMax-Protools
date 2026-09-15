import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
import type {
  AppSettingsPatch,
  AudioTranscodeRequest,
  CreateJobInput,
  MediaDownloadRequest,
  SpeechTranscribeRequest,
  VideoSource
} from "@repo/shared"
import { IpcChannels, IpcEvents } from "@repo/shared"
import type { IpcChannel, IpcEvent, IpcEventPayload, IpcRequestOf, IpcResponseOf } from "@repo/shared"

function invoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcRequestOf<C> extends undefined ? [] : [IpcRequestOf<C>]
): Promise<IpcResponseOf<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponseOf<C>>
}

function subscribe<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayload<E>) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: IpcEventPayload<E>): void => listener(payload)
  ipcRenderer.on(event, handler)
  return () => {
    ipcRenderer.removeListener(event, handler)
  }
}

const api = {
  job: {
    create: (input: CreateJobInput) => invoke(IpcChannels.jobCreate, input),
    cancel: (jobId: string) => invoke(IpcChannels.jobCancel, { jobId }),
    status: (jobId: string) => invoke(IpcChannels.jobStatus, { jobId }),
    subscribe: (jobId: string) => invoke(IpcChannels.jobSubscribe, { jobId }),
    unsubscribe: (jobId: string) => invoke(IpcChannels.jobUnsubscribe, { jobId })
  },
  settings: {
    get: () => invoke(IpcChannels.settingsGet),
    set: (patch: AppSettingsPatch) => invoke(IpcChannels.settingsSet, patch)
  },
  workspace: {
    resolve: (relativePath: string) => invoke(IpcChannels.workspaceResolve, { relativePath })
  },
  billing: {
    getBalance: () => invoke(IpcChannels.billingGetBalance),
    getEntitlement: () => invoke(IpcChannels.billingGetEntitlement)
  },
  media: {
    probe: (source: VideoSource) => invoke(IpcChannels.mediaProbe, { source }),
    download: (request: MediaDownloadRequest) => invoke(IpcChannels.mediaDownload, request),
    cancel: (taskId: string) => invoke(IpcChannels.mediaCancel, { taskId })
  },
  audio: {
    transcode: (request: AudioTranscodeRequest) => invoke(IpcChannels.audioTranscode, request)
  },
  speech: {
    transcribe: (request: SpeechTranscribeRequest) => invoke(IpcChannels.speechTranscribe, request)
  },
  keychain: {
    get: (service: string, account: string) => invoke(IpcChannels.keychainGet, { service, account }),
    set: (service: string, account: string, password: string) =>
      invoke(IpcChannels.keychainSet, { service, account, password }),
    delete: (service: string, account: string) => invoke(IpcChannels.keychainDelete, { service, account })
  },
  dialogs: {
    selectMedia: (title?: string) => invoke(IpcChannels.dialogSelectMedia, { title }),
    selectDirectory: (title?: string) => invoke(IpcChannels.dialogSelectDirectory, { title })
  },
  tools: {
    status: () => invoke(IpcChannels.toolsStatus)
  },
  events: {
    onPipelineProgress: (listener: (payload: IpcEventPayload<typeof IpcEvents.pipelineProgress>) => void) =>
      subscribe(IpcEvents.pipelineProgress, listener),
    onPipelineArtifact: (listener: (payload: IpcEventPayload<typeof IpcEvents.pipelineArtifact>) => void) =>
      subscribe(IpcEvents.pipelineArtifact, listener),
    onJobStatusChanged: (listener: (payload: IpcEventPayload<typeof IpcEvents.jobStatusChanged>) => void) =>
      subscribe(IpcEvents.jobStatusChanged, listener),
    onNativeProgress: (listener: (payload: IpcEventPayload<typeof IpcEvents.nativeProgress>) => void) =>
      subscribe(IpcEvents.nativeProgress, listener)
  }
}

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld("api", api)
