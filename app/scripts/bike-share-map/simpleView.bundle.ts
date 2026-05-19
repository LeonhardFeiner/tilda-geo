import * as SimpleView from './simpleView'

;(globalThis as typeof globalThis & { SimpleView: typeof SimpleView }).SimpleView = SimpleView
