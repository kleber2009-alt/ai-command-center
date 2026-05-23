export type ModuleStatus = 'production' | 'beta' | 'dev' | 'planned'

export type ModuleEntry = {
  slug: string
  name: string
  tagline: string
  status: ModuleStatus
  baseUrl: string
  packageName?: string
  version?: string
  docsPath?: string
  capabilities?: string[]
  backend?: { label: string; path: string }[]
  sdkMethods?: { name: string; description: string }[]
  ui?: { label: string; path: string }[]
  quickstart?: string
  notes?: string
}
