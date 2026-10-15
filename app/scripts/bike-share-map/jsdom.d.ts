// jsdom ships no types and `@types/jsdom` is not a dependency; this is just what viewerHarness.ts uses.
declare module 'jsdom' {
  export class VirtualConsole {
    on(event: string, listener: (...args: unknown[]) => void): this
  }
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>)
    readonly window: Window & typeof globalThis
  }
}
