import { spawn } from "node:child_process"
import { createInterface } from "node:readline"

export interface RunToolOptions {
  args: readonly string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  timeoutMs?: number
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
}

export interface RunToolResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  aborted: boolean
}

interface StreamSink {
  onLine: ((line: string) => void) | undefined
  append: (line: string) => void
}

function attachCapture(stream: NodeJS.ReadableStream, sink: StreamSink): void {
  stream.setEncoding("utf8")
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  lines.on("line", (line: string) => {
    sink.append(line)
    sink.onLine?.(line)
  })
}

export function runTool(binary: string, options: RunToolOptions): Promise<RunToolResult> {
  return new Promise<RunToolResult>((resolve) => {
    const child = spawn(binary, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    })

    let stdout = ""
    let stderr = ""
    let settled = false
    let timedOut = false
    let aborted = false

    attachCapture(child.stdout, { onLine: options.onStdoutLine, append: (line) => { stdout += `${line}\n` } })
    attachCapture(child.stderr, { onLine: options.onStderrLine, append: (line) => { stderr += `${line}\n` } })

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer)
      }
      options.signal?.removeEventListener("abort", onAbort)
    }

    const finish = (): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve({ code: child.exitCode, stdout, stderr, timedOut, aborted })
    }

    const kill = (): void => {
      if (child.exitCode !== null) {
        return
      }
      child.kill("SIGTERM")
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL")
        }
      }, 1000).unref()
    }

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          kill()
        }, options.timeoutMs)
      : undefined

    const onAbort = (): void => {
      aborted = true
      kill()
    }

    options.signal?.addEventListener("abort", onAbort, { once: true })
    child.on("error", () => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve({ code: null, stdout, stderr, timedOut, aborted })
    })
    child.on("close", () => finish())
  })
}

export type ProgressLineParser = (line: string) => number | null

export function firstMatchParser(
  regex: RegExp,
  transform: (match: RegExpExecArray) => number
): ProgressLineParser {
  return (line: string): number | null => {
    const match = regex.exec(line)
    if (!match) {
      return null
    }
    return transform(match)
  }
}
