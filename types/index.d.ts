export type Group = 'skill' | 'plugin' | 'mcp' | 'agent' | 'builtin'
export type Status = 'run' | 'ok' | 'err' | 'idle'
export type Light = {
  key: string
  group: Group
  label: string
  status: Status
  count: number
  running: number
  // Tokens the item holds in the context just by being loaded (an estimate).
  fixed: number
  // Tokens of its schemas that are deferred, so not in the context (drawn struck through).
  deferred: number
  // Tokens its prompt added when it was invoked, summed (estimated from its text).
  body: number
}

declare module 'claude-code' {
  interface PluginState {
    'traffic-light': {
      lights: Shaped<Light[]>
      // Status sections the person has unfolded.
      open: Shaped<string[]>
    }
  }
}
