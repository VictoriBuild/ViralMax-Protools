import type { StageId } from "@repo/shared"
import type { PipelineStage } from "../contract/stage"

type AnyStage = PipelineStage<any>

export class StageRegistry {
  private readonly stages = new Map<StageId, AnyStage>()

  register<ID extends StageId>(stage: PipelineStage<ID>): this {
    if (this.stages.has(stage.id)) {
      throw new Error(`stage already registered: ${stage.id}`)
    }
    this.stages.set(stage.id, stage as AnyStage)
    return this
  }

  resolve<ID extends StageId>(id: ID): PipelineStage<ID> {
    const stage = this.stages.get(id)
    if (!stage) {
      throw new Error(`unknown stage: ${id}`)
    }
    return stage as PipelineStage<ID>
  }

  has(id: StageId): boolean {
    return this.stages.has(id)
  }

  list(): AnyStage[] {
    return [...this.stages.values()]
  }
}
