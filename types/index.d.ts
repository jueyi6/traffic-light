export type Group = 'skill' | 'plugin' | 'mcp' | 'agent' | 'builtin'
export type Status = 'run' | 'ok' | 'err' | 'idle'
export type Light = {
  key: string
  group: Group
  label: string
  status: Status
  count: number
  running: number
}

declare module 'claude-code' {
  interface PluginState {
    'traffic-light': {
      lights: Shaped<Light[]>
      // Groups the person has unfolded.
      open: Shaped<string[]>
      // True: hide everything this session has not used yet.
      onlyUsed: Shaped<boolean>
    }
  }
}
