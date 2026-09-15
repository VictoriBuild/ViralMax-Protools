import type {
  AppSettings,
  AppSettingsPatch,
  AudioTranscodeRequest,
  AudioTranscodeResult,
  BinaryStatus,
  CreateJobInput,
  DialogSelectRequest,
  DialogSelectionResult,
  Job,
  JobIdInput,
  KeychainDeleteRequest,
  KeychainGetRequest,
  KeychainSetRequest,
  MediaCancelRequest,
  MediaDownloadRequest,
  MediaDownloadResult,
  MediaMetadata,
  MediaProbeRequest,
  NativeProgress,
  SpeechTranscribeRequest,
  Transcript
} from "../schemas"
import type { ProgressPayload } from "../types/lifecycle"
import type { StageArtifact } from "../types/pipeline"

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; message: string }

export const IpcChannels = {
  jobCreate: "job:create",
  jobCancel: "job:cancel",
  jobStatus: "job:status",
  jobSubscribe: "job:subscribe",
  jobUnsubscribe: "job:unsubscribe",
  settingsGet: "settings:get",
  settingsSet: "settings:set",
  workspaceResolve: "workspace:resolve",
  billingGetBalance: "billing:get-balance",
  billingGetEntitlement: "billing:get-entitlement",
  mediaProbe: "media:probe",
  mediaDownload: "media:download",
  mediaCancel: "media:cancel",
  audioTranscode: "audio:transcode",
  speechTranscribe: "speech:transcribe",
  keychainGet: "keychain:get",
  keychainSet: "keychain:set",
  keychainDelete: "keychain:delete",
  dialogSelectMedia: "dialog:select-media",
  dialogSelectDirectory: "dialog:select-directory",
  toolsStatus: "tools:status"
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export const IpcEvents = {
  pipelineProgress: "pipeline:progress",
  pipelineArtifact: "pipeline:artifact",
  jobStatusChanged: "job:status-changed",
  nativeProgress: "native:progress"
} as const

export type IpcEvent = (typeof IpcEvents)[keyof typeof IpcEvents]

export interface IpcRequestMap {
  [IpcChannels.jobCreate]: CreateJobInput
  [IpcChannels.jobCancel]: JobIdInput
  [IpcChannels.jobStatus]: JobIdInput
  [IpcChannels.jobSubscribe]: JobIdInput
  [IpcChannels.jobUnsubscribe]: JobIdInput
  [IpcChannels.settingsGet]: undefined
  [IpcChannels.settingsSet]: AppSettingsPatch
  [IpcChannels.workspaceResolve]: { relativePath: string }
  [IpcChannels.billingGetBalance]: undefined
  [IpcChannels.billingGetEntitlement]: undefined
  [IpcChannels.mediaProbe]: MediaProbeRequest
  [IpcChannels.mediaDownload]: MediaDownloadRequest
  [IpcChannels.mediaCancel]: MediaCancelRequest
  [IpcChannels.audioTranscode]: AudioTranscodeRequest
  [IpcChannels.speechTranscribe]: SpeechTranscribeRequest
  [IpcChannels.keychainGet]: KeychainGetRequest
  [IpcChannels.keychainSet]: KeychainSetRequest
  [IpcChannels.keychainDelete]: KeychainDeleteRequest
  [IpcChannels.dialogSelectMedia]: DialogSelectRequest
  [IpcChannels.dialogSelectDirectory]: DialogSelectRequest
  [IpcChannels.toolsStatus]: undefined
}

export interface IpcResponseMap {
  [IpcChannels.jobCreate]: Result<Job>
  [IpcChannels.jobCancel]: Result<undefined>
  [IpcChannels.jobStatus]: Result<Job>
  [IpcChannels.jobSubscribe]: Result<undefined>
  [IpcChannels.jobUnsubscribe]: Result<undefined>
  [IpcChannels.settingsGet]: Result<AppSettings>
  [IpcChannels.settingsSet]: Result<AppSettings>
  [IpcChannels.workspaceResolve]: Result<string>
  [IpcChannels.billingGetBalance]: Result<{ balance: number; currency: string }>
  [IpcChannels.billingGetEntitlement]: Result<{ plan: string; features: string[] }>
  [IpcChannels.mediaProbe]: Result<MediaMetadata>
  [IpcChannels.mediaDownload]: Result<MediaDownloadResult>
  [IpcChannels.mediaCancel]: Result<undefined>
  [IpcChannels.audioTranscode]: Result<AudioTranscodeResult>
  [IpcChannels.speechTranscribe]: Result<Transcript>
  [IpcChannels.keychainGet]: Result<{ password: string | null }>
  [IpcChannels.keychainSet]: Result<undefined>
  [IpcChannels.keychainDelete]: Result<undefined>
  [IpcChannels.dialogSelectMedia]: Result<DialogSelectionResult>
  [IpcChannels.dialogSelectDirectory]: Result<DialogSelectionResult>
  [IpcChannels.toolsStatus]: Result<BinaryStatus>
}

export interface IpcEventPayloadMap {
  [IpcEvents.pipelineProgress]: ProgressPayload
  [IpcEvents.pipelineArtifact]: { jobId: string; stage: string; artifact: StageArtifact }
  [IpcEvents.jobStatusChanged]: { jobId: string; status: Job }
  [IpcEvents.nativeProgress]: NativeProgress
}

export type IpcEventPayload<E extends IpcEvent> = IpcEventPayloadMap[E]

export type IpcRequestOf<C extends IpcChannel> = IpcRequestMap[C]
export type IpcResponseOf<C extends IpcChannel> = IpcResponseMap[C]

export interface IpcInvoker {
  invoke<C extends IpcChannel>(
    channel: C,
    ...payload: IpcRequestOf<C> extends undefined ? [] : [IpcRequestOf<C>]
  ): Promise<IpcResponseOf<C>>
}

export interface IpcSubscriber {
  subscribe<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayload<E>) => void): () => void
}
