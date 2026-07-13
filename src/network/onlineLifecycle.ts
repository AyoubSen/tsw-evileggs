export type OnlineLifecycleCancellationCode =
  'intentional-leave' | 'navigation-cancelled' | 'stale-session' | 'aborted-startup'

export class OnlineLifecycleCancellation extends Error {
  constructor(readonly code: OnlineLifecycleCancellationCode) {
    super(code)
    this.name = 'OnlineLifecycleCancellation'
  }
}

export function isOnlineLifecycleCancellation(
  value: unknown,
): value is OnlineLifecycleCancellation {
  return value instanceof OnlineLifecycleCancellation
}

export class OnlineSessionGenerationGuard {
  private generation = 0

  begin(): number {
    return ++this.generation
  }

  invalidate(): void {
    this.generation += 1
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation
  }
}

export function throwIfOnlineStartupAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new OnlineLifecycleCancellation('aborted-startup')
}
