import * as ViewerUrl from './viewerUrlOptions'

;(globalThis as typeof globalThis & { ViewerUrl: typeof ViewerUrl }).ViewerUrl = ViewerUrl
