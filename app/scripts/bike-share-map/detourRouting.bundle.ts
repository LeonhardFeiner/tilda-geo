import * as DetourRouting from './detourRouting'

;(globalThis as typeof globalThis & { DetourRouting: typeof DetourRouting }).DetourRouting =
  DetourRouting
