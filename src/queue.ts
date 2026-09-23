// One active conversion and at most two waiting requests for this small deployment.
export class ConversionQueue {
  private active = false;
  private waiting: (() => void)[] = [];
  async acquire(): Promise<() => void> {
    if (this.active) {
      if (this.waiting.length >= 2) throw Object.assign(new Error('Fila cheia.'), { statusCode: 429 });
      await new Promise<void>(resolve => this.waiting.push(resolve));
    } else this.active = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next();
      else this.active = false;
    };
  }
}
