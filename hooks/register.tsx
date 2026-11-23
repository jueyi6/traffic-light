import type { EngineInterface, Register, SessionContextBreakdown } from 'claude-code'

const PANE = 'traffic-light'
const TITLE = '도구 신호등'

type Ctx = 'loaded' | 'listed' | 'waiting'
type Cat = 'ok' | 'err' | Ctx
const CATS: Cat[] = ['ok', 'err', 'loaded', 'listed', 'waiting']
const NAME: Record<Cat, string> = { ok: '사용함', err: '오류', loaded: '로드됨', listed: '목록만', waiting: '지연 로드' }
const DOT: Record<Cat, string> = { ok: '🟢', err: '🔴', loaded: '🟡', listed: '🔵', waiting: '⚪' }

type Kid = { label: string; tokens: number; isLoaded: boolean; bare?: true }
type Row = { label: string; group: string; tokens: Record<Ctx, number>; kids?: Kid[] }

type Item = { label: string; group: string; mark: string; right: string; tokens?: number; was?: number; kids?: Kid[] }
// Each light's colour, taken from the emoji dot beside it, so a number matches its light.
const COLOR: Record<Cat, string> = { ok: '#58cf8c', err: '#e54c64', loaded: '#e5bc4e', listed: '#4f8bd1', waiting: '#dcd4e2' }
const GROUPS =['Skills', '플러그인', 'MCP', '에이전트', '시스템', '메모리']
const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)))
// What a row holds now; "start → now" when it held something else at session start.
const sinceStart = (was: number | undefined, now: number): string =>
  was !== undefined && was > 0 && Math.round(was) !== Math.round(now) ? `${fmt(was)} → ${fmt(now)}` : fmt(now)

const parse = (b: SessionContextBreakdown | undefined): Row[] => {
  const rows: Row[] = []
  if (!b) return rows
  const zero = { loaded: 0, listed: 0, waiting: 0 }
  // A plugin's skill belongs to its plugin: by `pluginName`, or by the `plugin:skill` name.
  const plugins = new Map<string, Kid[]>()
  for (const s of b.skills?.skillFrontmatter ?? []) {
    const plugin = s.pluginName ?? (s.name.includes(':') ? s.name.split(':')[0] : undefined)
    if (!plugin) {
      rows.push({ label: s.name, group: 'Skills', tokens: { ...zero, listed: s.tokens } })
      continue
    }
    const kid = { label: s.name.startsWith(`${plugin}:`) ? s.name.slice(plugin.length + 1) : s.name, tokens: s.tokens, isLoaded: true }
    plugins.set(plugin, [...(plugins.get(plugin) ?? []), kid])
  }
  for (const [name, kids] of plugins) {
    rows.push({ label: name, group: '플러그인', tokens: { ...zero, listed: kids.reduce((n, k) => n + k.tokens, 0) }, kids })
  }
  const servers = new Map<string, { tokens: Record<Ctx, number>; kids: Kid[] }>()
  for (const t of b.mcpTools ?? []) {
    const have = servers.get(t.serverName) ?? { tokens: { ...zero }, kids: [] }
    if (t.isLoaded) have.tokens.loaded += t.tokens
    else have.tokens.waiting += t.tokens
    have.kids.push({ label: t.name.replace(`mcp__${t.serverName}__`, ''), tokens: t.tokens, isLoaded: t.isLoaded })
    servers.set(t.serverName, have)
  }
  for (const [name, have] of servers) rows.push({ label: name, group: 'MCP', tokens: have.tokens, kids: have.kids })
  for (const a of b.agents ?? []) {
    rows.push({ label: a.agentType, group: '에이전트', tokens: { ...zero, listed: a.tokens } })
  }
  for (const m of b.memoryFiles ?? []) {
    rows.push({ label: m.path.split(/[\\/]/).pop() ?? m.path, group: '메모리', tokens: { ...zero, loaded: m.tokens } })
  }

  return rows
}

type Cut = { name: string; tokens: number; kind: string }
type Total = { used: number; max: number; percent: number; cuts: Cut[] }
const CAT_NAME: Record<string, string> = {
  'Messages': '메시지',
  'System prompt': '시스템 프롬프트',
  'MCP server instructions': 'MCP 서버 지침',
}
// Categories the lights below already show, so the list leaves them out: the lights and what
// is left here add up to the total.
const IN_LIGHTS = new Set([
  'System tools',
  'System tools (deferred)',
  'MCP tools',
  'MCP tools (deferred)',
  'Skills',
  'Memory files',
  'Custom agents',
])
const totalOf = (b: SessionContextBreakdown | undefined): Total => ({
  used: b?.totalTokens ?? 0,
  max: b?.rawMaxTokens ?? 0,
  percent: b?.percentage ?? 0,
  cuts: (b?.categories ?? [])
    .filter(c => c.kind === 'used' || c.kind === 'deferred')
    .map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
})

let rows: Row[] = []
// What each row and category held at session start: written once, by the first reading.
let start: Map<string, number> | null = null
const sum = (r: Row) => r.tokens.loaded + r.tokens.listed + r.tokens.waiting
let total: Total = { used: 0, max: 0, percent: 0, cuts: [] }
const everyKey = ['ctx', ...CATS, ...CATS.flatMap(c => GROUPS.map(g => `${c}/${g}`))]
let detail = false
// The engine drops a tree past its bounds (100,000 characters serialized), and the app then keeps
// the old drawing. A heavy user's lists can pass that, so a drawing shows at most this many item
// rows and detail lines, and says how many it left out. Headers and buttons are always drawn.
const MAX_ITEMS = 150
const MAX_KIDS = 100
let unfolded = new Set<string>(['ctx', 'ok', 'err', 'loaded', ...['ok', 'err', 'loaded'].flatMap(c => GROUPS.map(g => `${c}/${g}`))])

type Used = { label: string; group: string; count: number; running: number; failed: boolean; flashUntil: number; fresh: boolean; est: number }
const used = new Map<string, Used>()
const SPIN = ['◜', '◝', '◞', '◟']
let frame = 0
let timer: { cancel: () => void } | null = null
let now = 0
const FLASH_MS = 3000
const MAX_LIVE = 50
const markOf = (u: Used): string =>
  u.running > 0 ? `${SPIN[frame % SPIN.length]} ` : u.flashUntil > now ? `${frame % 2 === 1 ? '💥' : '🔴'} ` : ''
const isBusy =() => [...used.values()].some(u => u.running > 0 || u.flashUntil > now)
const spin = ($: EngineInterface) => {
  if (timer || !isBusy()) return
  timer = $.clock.every(500, () => {
    void $.clock.now().then(t => {
      now = t
      frame += 1
      if (!isBusy()) {
        timer?.cancel()
        timer = null
      }
      $.ui.invalidate('ui.render')
    })
  })
}
const touch = (key: string, label: string, group: string, phase: 'start' | 'end' | 'mark', isError = false) => {
  const have = used.get(key) ?? { label, group, count: 0, running: 0, failed: false, flashUntil: 0, fresh: true, est: 0 }
  have.fresh = true
  if (phase === 'start') {
    have.count += 1
    have.running += 1
  } else if (phase === 'end') {
    have.running = Math.max(0, have.running - 1)
    have.failed = isError
  } else {
    have.count += 1
    have.failed = isError
  }
  used.set(key, have)
}
const statusText = (): string | undefined => {
  const list = [...used.values()]
  const failed = list.filter(u => u.failed).length
  const okCount = list.length - failed
  if (okCount + failed === 0) return undefined
  const loaded = rows.filter(r => r.tokens.loaded > 0).length

  return `🟢${okCount} 🔴${failed} 🟡${loaded}`
}
// A rough size of what a call put into the conversation (characters / 4), shown with ≈ in detail.
const sizeOf = (...parts: unknown[]): number => {
  let chars = 0
  for (const part of parts) {
    try {
      chars += part === undefined ? 0 : (typeof part === 'string' ? part : JSON.stringify(part) ?? '').length
    } catch {
      // a value that cannot be written out adds nothing
    }
  }

  return Math.round(chars / 4)
}
const withEst = (u: Used, detail: boolean) => (detail && u.est > 0 ? `  ≈${fmt(u.est)}` : '')
const flash = async ($: EngineInterface, key: string) => {
  now = await $.clock.now()
  const have = used.get(key)
  if (have) have.flashUntil = now + FLASH_MS
  spin($)
}
const classify = (tool: string, input: Record<string, unknown>): { key: string; label: string; group: string } | null => {
  if (tool === 'Skill') return null
  if (tool.startsWith('mcp__')) {
    const server = tool.split('__')[1] ?? 'mcp'
    return { key: `mcp:${server}`, label: server, group: 'MCP' }
  }
  if (tool === 'Agent' || tool === 'Task') {
    const kind = typeof input.subagent_type === 'string' ? input.subagent_type : 'agent'
    return { key: `agent:${kind}`, label: kind, group: '에이전트' }
  }
  return { key: `builtin:${tool}`, label: tool, group: '시스템' }
}

// The transcript announces the tools behind ToolSearch in `deferred_tools_delta` records; the
// engine's breakdown gives system tools only as totals. Read the file as it grows (a read costs
// the model no context) and keep the set of announced names.
const CHUNK = 4 * 1024 * 1024
const announced = { path: '', offset: 0, carry: '', names: new Set<string>() }

const readDeferred = async ($: EngineInterface): Promise<Set<string>> => {
  const { transcriptPath } = await $.session.info()
  if (announced.path !== transcriptPath) Object.assign(announced, { path: transcriptPath, offset: 0, carry: '', names: new Set<string>() })
  const { size } = await $.fs.stat(transcriptPath)
  if (size < announced.offset) Object.assign(announced, { offset: 0, carry: '', names: new Set<string>() })
  while (announced.offset < size) {
    const chunk = await $.fs.read(transcriptPath, { offset: announced.offset, length: CHUNK })
    announced.offset += CHUNK
    const lines = (announced.carry + chunk).split('\n')
    announced.carry = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.includes('"deferred_tools_delta"')) continue
      try {
        const a = (JSON.parse(line) as { attachment?: { type?: string; addedNames?: string[]; removedNames?: string[] } }).attachment
        if (a?.type !== 'deferred_tools_delta') continue
        for (const n of a.addedNames ?? []) announced.names.add(n)
        for (const n of a.removedNames ?? []) announced.names.delete(n)
      } catch {
        // a line cut at a chunk edge is not a record
      }
    }
  }

  return announced.names
}

const refresh = async ($: EngineInterface) => {
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    rows = parse(usage.context.breakdown)
    total = totalOf(usage.context.breakdown)
    if (start === null && (rows.length > 0 || total.cuts.length > 0)) {
      start = new Map([
        ...rows.map(r => [`${r.group}:${r.label}`, sum(r)] as [string, number]),
        ...total.cuts.map(c => [`cat:${c.name}`, c.tokens] as [string, number]),
      ])
    }
    // The engine counts system tools only in total, loaded and deferred apart: each total is one
    // row. Names come from the transcript's deferred announcements and the tool list.
    let names: { loaded: Kid[]; waiting: Kid[] } | undefined
    try {
      const deferred = await readDeferred($)
      const system = (await $.tool.list()).filter(t => !t.mcp).map(t => t.name).sort()
      const bare = (n: string, isLoaded: boolean): Kid => ({ label: n, tokens: 0, isLoaded, bare: true })
      names = {
        loaded: system.filter(n => !deferred.has(n)).map(n => bare(n, true)),
        waiting: system.filter(n => deferred.has(n)).map(n => bare(n, false)),
      }
    } catch {
      // without names the totals stand alone
    }
    for (const [name, label, ctx] of [['System tools', '시스템 도구', 'loaded'], ['System tools (deferred)', '시스템 도구 (지연)', 'waiting']] as const) {
      const cut = total.cuts.find(c => c.name === name)
      if (cut && cut.tokens > 0) rows.push({ label, group: '시스템', tokens: { loaded: 0, listed: 0, waiting: 0, [ctx]: cut.tokens }, kids: names?.[ctx] })
    }
    $.ui.invalidate('ui.render')
  } catch {
    // the pane shows the last rows it had
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'traffic', description: 'Open the traffic-light pane' })
    // A reload leaves the pane drawn by the old module; open it again so this module's buttons are live.
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) await $.ui.open({ id: PANE, title: TITLE })
    void refresh($)

    return next(e)
  })

  on('command.run', { command: 'traffic' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Traffic-light pane opened.' }
  })

  on('skill.prompt', async ($, e, next) => {
    touch(`skill:${e.skill}`, e.skill, 'Skills', 'mark')
    $.ui.status(statusText())
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const what = classify(e.tool, e as unknown as Record<string, unknown>)
    if (what === null) return next(e)
    touch(what.key, what.label, what.group, 'start')
    spin($)
    $.ui.status(statusText())
    $.ui.invalidate('ui.render')
    let ran
    try {
      ran = await next(e)
    } catch (err) {
      touch(what.key, what.label, what.group, 'end', true)
      await flash($, what.key)
      $.ui.invalidate('ui.render')
      throw err
    }
    const failed = ran.deny !== undefined || ran.isError === true
    touch(what.key, what.label, what.group, 'end', failed)
    const have = used.get(what.key)
    if (have) have.est += sizeOf(e, ran.result, ran.text)
    if (failed) await flash($, what.key)
    $.ui.status(statusText())
    $.ui.invalidate('ui.render')

    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    for (const u of used.values()) if (u.running === 0) u.fresh = false
    $.ui.invalidate('ui.render')
    void refresh($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const set = (next: Set<string>) => () => {
      unfolded = next
      $.ui.invalidate('ui.render')
    }
    const toggle = (cat: string) => () => {
      const next = new Set(unfolded)
      if (!next.delete(cat)) next.add(cat)
      unfolded = next
      $.ui.invalidate('ui.render')
    }

    const live = [...used.values()]
      .filter(u => u.running > 0 || u.fresh)
      .sort((a, b) => Number(b.running > 0) - Number(a.running > 0) || b.count - a.count || a.label.localeCompare(b.label))
    let itemsLeft = MAX_ITEMS
    let kidsLeft = MAX_KIDS

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Button key="expand" onPress={set(new Set(everyKey))}>펼침</Button>
          <Text> </Text>
          <Button key="fold" onPress={set(new Set())}>접음</Button>
          <Text> </Text>
          <Button
            key="detail"
            onPress={() => {
              detail = !detail
              $.ui.invalidate('ui.render')
            }}
          >
            상세 {detail ? '켬' : '끔'}
          </Button>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Button key="ctx" plain onPress={toggle('ctx')}>
            {unfolded.has('ctx') ? '∨' : '>'} 컨텍스트 {fmt(total.used)} / {fmt(total.max)} ({Math.round(total.percent)}%)
          </Button>
          {unfolded.has('ctx') &&
            total.cuts
              .filter(c => !IN_LIGHTS.has(c.name))
              .sort((a, b) => b.tokens - a.tokens)
              .map(c => (
                <Box marginLeft={2} justifyContent="space-between">
                  <Text wrap="truncate-middle" dimColor={c.kind === 'deferred'}>{CAT_NAME[c.name] ?? c.name}</Text>
                  <Text color={c.name === 'Messages' ? COLOR.ok : COLOR.loaded} strikethrough={c.kind === 'deferred'}>{sinceStart(start?.get(`cat:${c.name}`), c.tokens)}{c.kind !== 'deferred' && total.max > 0 ? `  ${((c.tokens / total.max) * 100).toFixed(1)}%` : ''}</Text>
                </Box>
              ))}
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>지금 / 방금</Text>
          {live.slice(0, MAX_LIVE).map(u => (
            <Box justifyContent="space-between">
              <Text wrap="truncate-middle">{markOf(u) || `${u.failed ? '🔴' : '🟢'} `}{u.label} ×{u.count}{withEst(u, detail)}</Text>
              <Text dimColor>{u.group}</Text>
            </Box>
          ))}
          {live.length > MAX_LIVE && <Text dimColor>{`… 외 ${live.length - MAX_LIVE}개 생략`}</Text>}
        </Box>
        {CATS.map(cat => {
          const isUse = cat === 'ok' || cat === 'err'
          const items: Item[] = isUse
            ? [...used.values()]
                .filter(u => (cat === 'err' ? u.failed : !u.failed))
                .map(u => ({
                  label: u.label,
                  group: u.group,
                  mark: markOf(u),
                  right: `×${u.count}${withEst(u, detail)}`,
                }))
            : rows
                .filter(r => r.tokens[cat as Ctx] > 0)
                .map(r => ({
                  label: r.label,
                  group: r.group,
                  mark: '',
                  right: '',
                  tokens: r.tokens[cat as Ctx],
                  was: start?.get(`${r.group}:${r.label}`),
                  kids: r.kids,
                }))
          const isOpen = unfolded.has(cat)
          const groups = GROUPS.filter(g => items.some(i => i.group === g))
          const groupTokens = (g: string): number => items.filter(i => i.group === g).reduce((n, i) => n + (i.tokens ?? 0), 0)
          const catTokens = groups.reduce((n, g) => n + groupTokens(g), 0)
          const number = (n: number | undefined) =>
            n === undefined || isUse ? null : (
              <Text color={COLOR[cat]} strikethrough={cat === 'waiting'}>{fmt(n)}</Text>
            )

          return (
            <Box flexDirection="column">
              <Box justifyContent="space-between">
                <Button key={`c-${cat}`} plain onPress={toggle(cat)}>
                  {isOpen ? '∨' : '>'} {DOT[cat]} {NAME[cat]} {items.length}
                </Button>
                {number(catTokens)}
              </Box>
              {isOpen &&
                groups.map(g => {
                  const inGroup = items.filter(i => i.group === g)
                  const isGroupOpen = unfolded.has(`${cat}/${g}`)

                  return (
                    <Box flexDirection="column" marginLeft={2}>
                      <Box justifyContent="space-between">
                        <Button key={`i-${cat}-${g}`} plain onPress={toggle(`${cat}/${g}`)}>
                          {isGroupOpen ? '∨' : '>'} {g} {inGroup.length}
                        </Button>
                        {number(groupTokens(g))}
                      </Box>
                      {isGroupOpen &&
                        inGroup.map(i => {
                          if (itemsLeft <= 0) return null
                          itemsLeft -= 1
                          const shownKids = detail && i.kids ? i.kids.slice(0, Math.max(0, kidsLeft)) : []
                          kidsLeft -= shownKids.length

                          return (
                            <Box flexDirection="column" marginLeft={2}>
                              <Box justifyContent="space-between">
                                <Text wrap="truncate-middle">{i.mark}{i.label}</Text>
                                <Text color={COLOR[cat]} strikethrough={cat === 'waiting'}>{i.tokens !== undefined ? sinceStart(i.was, i.tokens) : i.right}</Text>
                              </Box>
                              {shownKids.map(k => (
                                <Box marginLeft={4} justifyContent="space-between">
                                  <Text wrap="truncate-middle" dimColor>{k.label}</Text>
                                  {!k.bare && <Text dimColor strikethrough={!k.isLoaded}>{fmt(k.tokens)}</Text>}
                                </Box>
                              ))}
                              {detail && i.kids && shownKids.length < i.kids.length && (
                                <Text dimColor>{`    … 외 ${i.kids.length - shownKids.length}줄 생략`}</Text>
                              )}
                            </Box>
                          )
                        })}
                      {isGroupOpen && itemsLeft <= 0 && inGroup.length > 0 && (
                        <Text dimColor>  … 줄 수 한도로 일부 생략 (접어서 줄이세요)</Text>
                      )}
                    </Box>
                  )
                })}
            </Box>
          )
        })}
      </Box>
    )
  })
}
