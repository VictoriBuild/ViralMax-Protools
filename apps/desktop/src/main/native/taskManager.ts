export class TaskManager {
  private readonly tasks = new Map<string, AbortController>()

  register(taskId?: string): { taskId: string; signal: AbortSignal } {
    const id = taskId && taskId.length > 0 ? taskId : this.nextId()
    if (this.tasks.has(id)) {
      throw new Error(`task already registered: ${id}`)
    }
    const controller = new AbortController()
    controller.signal.addEventListener(
      "abort",
      () => {
        this.tasks.delete(id)
      },
      { once: true }
    )
    this.tasks.set(id, controller)
    return { taskId: id, signal: controller.signal }
  }

  cancel(taskId: string): boolean {
    const controller = this.tasks.get(taskId)
    if (!controller) {
      return false
    }
    controller.abort(new Error(`task cancelled: ${taskId}`))
    return true
  }

  release(taskId: string): void {
    const controller = this.tasks.get(taskId)
    if (controller && !controller.signal.aborted) {
      this.tasks.delete(taskId)
    }
  }

  cancelAll(): void {
    for (const controller of this.tasks.values()) {
      controller.abort()
    }
  }

  private nextId(): string {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = `task-${Math.random().toString(36).slice(2, 10)}`
      if (!this.tasks.has(candidate)) {
        return candidate
      }
    }
    return `task-${Date.now()}`
  }
}
