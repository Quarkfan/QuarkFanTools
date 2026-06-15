export class TaskLimiter {
  active = 0;
  queued = 0;
  private waiters: Array<(release: () => void) => void> = [];

  async acquire(limit: number): Promise<() => void> {
    const safeLimit = Math.max(1, Math.floor(limit || 1));
    if (this.active < safeLimit) {
      this.active += 1;
      return this.release;
    }
    this.queued += 1;
    return new Promise<() => void>((resolve) => this.waiters.push(resolve)).then((release) => {
      this.queued -= 1;
      return release;
    });
  }

  private release = (): void => {
    const next = this.waiters.shift();
    if (next) {
      next(this.release);
      return;
    }
    this.active = Math.max(0, this.active - 1);
  };
}
