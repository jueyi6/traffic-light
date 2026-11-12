import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Group, Light, Status } from '../types'

const PANE = 'traffic-light'
const TITLE_OF_PANE = '도구 신호등'

// Change a tag when the stored fields change: it declines what an earlier
// version stored, which outlives a reload.
const lights = atom({ plugin: 'traffic-light', key: 'lights' } as const, [], {
  shape: 'lights-5',
})
// Which sections are unfolded: a status ('ok') or a type inside one ('ok/skill').
// The live statuses start open, with their types; the rest start folded.
const LIVE = ['run', 'ok', 'err']
const ALL_GROUPS = ['skill', 'plugin', 'mcp', 'agent', 'builtin']
const ALL_KEYS = [
  'run', 'ok', 'err', 'used', 'none',
  ...['run', 'ok', 'err', 'used', 'none'].flatMap(c => ALL_GROUPS.map(g => `${c}/${g}`)),
  ...ALL_GROUPS.map(g => `inv/${g}`),
]
const open = atom(
  { plugin: 'traffic-light', key: 'open' } as const,
  [...LIVE, ...LIVE.flatMap(c => ALL_GROUPS.map(g => `${c}/${g}`))],
  { shape: 'open-3' },
)

const ORDER: Group[] = ['skill', 'plugin', 'mcp', 'agent', 'builtin']
const TAG: Record<Group, string> = {
  skill: '스킬',
  plugin: '플러그인',
  mcp: 'MCP',
  agent: '에이전트',
  builtin: '내장',
}

const TITLE: Record<Group, string> = {
  skill: '스킬',
  plugin: '플러그인',
  mcp: 'MCP 서버',
  agent: '서브에이전트',
  builtin: '내장 도구',
}

// The five sections of the pane, in the order they are drawn: running, used this
// round, failed, pulled out (what holds context), and what holds none.
type Cat = 'run' | 'ok' | 'err' | 'used' | 'none'
const CATS: Cat[] = ['run', 'ok', 'err', 'used', 'none']
const NAME: Record<Cat, string> = {
  run: '실행중',
  ok: '사용함',
  err: '오류',
  used: '꺼냄',
  none: '미사용',
}
const DOT: Record<Cat, string> = { run: '🟡', ok: '🟢', err: '🔴', used: '🔵', none: '⚪' }

// Pulled out = it holds context: its schema is loaded (a callable built-in, a loaded
// MCP tool), or it was invoked and its prompt or call entered the context.
const isPulled = (one: Light, loaded: Set<string>): boolean => one.count > 0 || loaded.has(one.key)

// `loaded`: keys of rows whose schema or prompt already sits in the context.
const catOf = (one: Light, loaded: Set<string>): Cat => {
  const status: Status = one.status
  if (status === 'run') return 'run'
  if (status === 'err') return 'err'
  if (status === 'ok') return 'ok'

  return isPulled(one, loaded) ? 'used' : 'none'
}

// Ids of servers and plugins are compared in the tool-name spelling.
const norm = (s: string): string => s.replace(/[^A-Za-z0-9]/g, '_')

type Touch = {
  group: Group
  id: string
  label: string
  // 'start' = a call began, 'end' = it finished, 'mark' = a one-shot use.
  phase: 'start' | 'end' | 'mark'
  isError?: boolean
  // Estimated tokens a 'mark' put into the context (a skill's expanded prompt).
  body?: number
}

// Rough: about four characters to a token. Free: no model or API is asked.
const estimate = (text: string): number => Math.ceil(text.length / 4)

const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

// "320 · 호출 ≈1.1k": what a row holds just by being loaded, and what its calls added.
const cost = (fixed: number, body: number): string =>
  [fixed > 0 ? fmt(fixed) : '', body > 0 ? `호출 ≈${fmt(body)}` : ''].filter(Boolean).join(' · ')

// Pure: returns the list with one row begun, finished or marked.
const touch = (list: Light[], t: Touch): Light[] => {
  const key = `${t.group}:${t.id}`
  const old = list.find(one => one.key === key)
  const base: Light = old ?? {
    key,
    group: t.group,
    label: t.label,
    status: 'idle',
    count: 0,
    running: 0,
    fixed: 0,
    deferred: 0,
    body: 0,
  }
  let next: Light = { ...base, label: t.label }
  if (t.phase === 'start') {
    next = { ...next, count: next.count + 1, running: next.running + 1, status: 'run' }
  } else if (t.phase === 'end') {
    const running = Math.max(0, next.running - 1)
    next = {
      ...next,
      running,
      status: t.isError ? 'err' : running > 0 ? 'run' : 'ok',
    }
  } else {
    next = {
      ...next,
      count: next.count + 1,
      status: t.isError ? 'err' : 'ok',
      body: next.body + (t.body ?? 0),
    }
  }
  const rest = list.filter(one => one.key !== key)

  return [...rest, next].slice(-120)
}

// What a tool.call is, for the pane: null for calls shown elsewhere.
const classify = (tool: string, input: Record<string, unknown>): Omit<Touch, 'phase'> | null => {
  if (tool === 'Skill') return null // drawn from skill.prompt, which names the skill
  if (tool.startsWith('mcp__')) {
    const server = tool.split('__')[1] ?? 'mcp'
    return { group: 'mcp', id: norm(server), label: server }
  }
  if (tool === 'Agent' || tool === 'Task') {
    const kind = typeof input.subagent_type === 'string' ? input.subagent_type : 'agent'
    return { group: 'agent', id: kind, label: kind }
  }
  return { group: 'builtin', id: tool, label: tool }
}

const tally = (list: Light[]) => ({
  run: list.filter(one => one.status === 'run').length,
  ok: list.filter(one => one.status === 'ok').length,
  err: list.filter(one => one.status === 'err').length,
})

// The one-line summary pinned under the prompt, so a closed pane still shows it.
const statusText = (list: Light[]): string | undefined => {
  const t = tally(list)
  if (t.run + t.ok + t.err === 0) return undefined
  const live = list.filter(one => one.status === 'run').map(one => one.label)

  return `🚦 🟡${t.run} 🟢${t.ok} 🔴${t.err}${live.length > 0 ? ` · ${live.slice(0, 3).join(', ')}` : ''}`
}

// Bookkeeping must never touch the work it watches: a failed write, read or
// status call is dropped, so a tool call, a skill or a prompt always goes on.
const safely = async (fn: () => unknown): Promise<void> => {
  try {
    await fn()
  } catch {
    // the light is wrong for a moment; the work is not
  }
}

// What the session owns, as the context breakdown lists it.
type Owned = { key: string; group: Group; label: string; tokens: number; deferred: number }
const emptyOwned: Owned[] = []

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'traffic',
      description: 'Toggle the traffic-light pane (skills, MCP, plugins in use)',
    })
    void $.ui.open({ id: PANE, title: TITLE_OF_PANE })

    return next(e)
  })

  // /traffic opens the pane, or closes it when it is already open.
  on('command.run', { command: 'traffic' }, async $ => {
    const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isUp) {
      await $.ui.close({ id: PANE })

      return { text: 'Traffic-light pane closed. /traffic opens it again.' }
    }
    await $.ui.open({ id: PANE, title: TITLE_OF_PANE })

    return { text: 'Traffic-light pane opened.' }
  })

  // A new prompt starts a new round: every light goes grey, counts stay.
  on('prompt.submit', async ($, e, next) => {
    await safely(async () => {
      await update($, lights, list =>
        list.map(one => (one.running > 0 ? one : { ...one, status: 'idle' as const })),
      )
      $.ui.status(statusText(await read($, lights)))
    })

    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    const name = e.skill
    const colon = name.indexOf(':')
    const body = estimate(e.text ?? '')
    await safely(async () => {
      await update($, lights, list => {
        let out = touch(list, { group: 'skill', id: name, label: name, phase: 'mark', body })
        if (colon > 0) {
          const plugin = name.slice(0, colon)
          out = touch(out, { group: 'plugin', id: norm(plugin), label: plugin, phase: 'mark', body })
        }

        return out
      })
      $.ui.status(statusText(await read($, lights)))
    })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const what = classify(e.tool, e as unknown as Record<string, unknown>)
    if (what === null) return next(e)

    const finish = (isError: boolean) =>
      safely(async () => {
        await update($, lights, list => touch(list, { ...what, phase: 'end', isError }))
        $.ui.status(statusText(await read($, lights)))
        if (isError) $.ui.toast(`🔴 ${what.label} 오류`)
      })

    await safely(async () => {
      await update($, lights, list => touch(list, { ...what, phase: 'start' }))
      $.ui.status(statusText(await read($, lights)))
    })
    let ran
    try {
      ran = await next(e)
    } catch (err) {
      await finish(true)
      throw err
    }
    await finish(ran.deny !== undefined || ran.isError === true)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const used = await read($, lights)
    const unfolded = await read($, open)

    // Everything the session owns; a failed read leaves only what was used.
    // `loaded` holds the rows already pulled into the context.
    let owned: Owned[] = emptyOwned
    const loaded = new Set<string>()
    try {
      const usage = await $.session.usage({ breakdown: 'summary' })
      const breakdown = usage.context.breakdown
      const next: Owned[] = []
      const perPlugin = new Map<string, number>()
      for (const s of breakdown?.skills?.skillFrontmatter ?? []) {
        next.push({ key: `skill:${s.name}`, group: 'skill', label: s.name, tokens: s.tokens, deferred: 0 })
        if (s.pluginName) {
          perPlugin.set(s.pluginName, (perPlugin.get(s.pluginName) ?? 0) + s.tokens)
        }
      }
      for (const [plugin, tokens] of perPlugin) {
        next.push({ key: `plugin:${norm(plugin)}`, group: 'plugin', label: plugin, tokens, deferred: 0 })
      }
      // A server holds tokens only for the tools whose schema is in the context;
      // the schemas still deferred are counted apart, drawn struck through.
      const perServer = new Map<
        string,
        { total: number; loaded: number; tokens: number; deferred: number }
      >()
      for (const t of breakdown?.mcpTools ?? []) {
        const have = perServer.get(t.serverName) ?? { total: 0, loaded: 0, tokens: 0, deferred: 0 }
        perServer.set(t.serverName, {
          total: have.total + 1,
          loaded: have.loaded + (t.isLoaded ? 1 : 0),
          tokens: have.tokens + (t.isLoaded ? t.tokens : 0),
          deferred: have.deferred + (t.isLoaded ? 0 : t.tokens),
        })
      }
      for (const [server, n] of perServer) {
        const key = `mcp:${norm(server)}`
        const label = n.loaded === n.total ? `${server} (${n.total})` : `${server} (${n.loaded}/${n.total})`
        next.push({ key, group: 'mcp', label, tokens: n.tokens, deferred: n.deferred })
        if (n.loaded > 0) loaded.add(key)
      }
      for (const a of breakdown?.agents ?? []) {
        next.push({ key: `agent:${a.agentType}`, group: 'agent', label: a.agentType, tokens: a.tokens, deferred: 0 })
      }
      // Built-in tools the model can call now; Skill and Agent are drawn as
      // skills and agents, so they are not listed twice.
      for (const t of await $.tool.list()) {
        if (t.mcp || t.name === 'Skill' || t.name === 'Agent' || t.name === 'Task') continue
        // The model can call it now, so its schema is already in the context.
        next.push({ key: `builtin:${t.name}`, group: 'builtin', label: t.name, tokens: 0, deferred: 0 })
        loaded.add(`builtin:${t.name}`)
      }
      owned = next
    } catch {
      owned = emptyOwned
    }

    // Owned rows start as never used; used rows lay their light over them.
    const rows = new Map<string, Light>()
    for (const o of owned) {
      rows.set(o.key, {
        key: o.key,
        group: o.group,
        label: o.label,
        status: 'idle',
        count: 0,
        running: 0,
        fixed: o.tokens,
        deferred: o.deferred,
        body: 0,
      })
    }
    for (const u of used) {
      const have = rows.get(u.key)
      rows.set(u.key, have ? { ...u, label: have.label, fixed: have.fixed, deferred: have.deferred } : u)
    }

    // Tokens a row holds in the context (plain), and tokens it would hold but does not
    // (deferred or not pulled out; struck through). MCP and built-ins know which of
    // their schemas are loaded; the rest count whole, by whether they were pulled out.
    const split = (one: Light) => {
      if (one.group === 'mcp' || one.group === 'builtin') {
        return { eaten: one.fixed, skipped: one.deferred }
      }

      return isPulled(one, loaded)
        ? { eaten: one.fixed, skipped: 0 }
        : { eaten: 0, skipped: one.fixed }
    }

    // The cost text of a row or a type: what it holds, then what is deferred struck through.
    const costOf = (fixed: number, body: number, deferred: number) => {
      const lead = cost(fixed, body)

      return (
        <Text dimColor>
          {lead}
          {lead !== '' && deferred > 0 ? ' ' : ''}
          {deferred > 0 && <Text strikethrough>{fmt(deferred)}</Text>}
        </Text>
      )
    }
    const all = [...rows.values()]
    const inOrder = (list: Light[]) =>
      [...list].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

    const toggle = (key: string) =>
      update($, open, list => (list.includes(key) ? list.filter(one => one !== key) : [...list, key]))

    // What is running or was just used, on top; running first.
    const live = all
      .filter(one => ['run', 'ok', 'err'].includes(catOf(one, loaded)))
      .sort(
        (a, b) =>
          CATS.indexOf(catOf(a, loaded)) - CATS.indexOf(catOf(b, loaded)) ||
          b.count - a.count ||
          a.label.localeCompare(b.label),
      )

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Button key="expand" onPress={() => update($, open, () => [...ALL_KEYS])}>
            펼침
          </Button>
          <Text> </Text>
          <Button key="fold" onPress={() => update($, open, () => [])}>
            접음
          </Button>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold>지금 / 방금</Text>
          {live.map(one => (
            <Box justifyContent="space-between">
              <Text wrap="truncate-middle">
                {DOT[catOf(one, loaded)]} {one.label}
                {one.count > 0 ? ` ×${one.count}` : ''}
              </Text>
              <Text dimColor>{TAG[one.group]}</Text>
            </Box>
          ))}
        </Box>

        {CATS.map(cat => {
          // 꺼냄 holds what sits in the context, also what is running or green now.
          const inCat = all.filter(one =>
            cat === 'used' ? isPulled(one, loaded) : catOf(one, loaded) === cat,
          )
          const isOpen = unfolded.includes(cat) && inCat.length > 0

          return (
            <Box flexDirection="column">
              <Button
                key={`c-${cat}`}
                plain
                dimColor={inCat.length === 0}
                onPress={() => toggle(cat)}
              >
                {isOpen ? '▾' : '▸'} {DOT[cat]} {NAME[cat]} {inCat.length}
              </Button>
              {isOpen &&
                ORDER.map(group => {
                  const items = inOrder(inCat.filter(one => one.group === group))
                  if (items.length === 0) return null
                  const subKey = `${cat}/${group}`
                  const isSubOpen = unfolded.includes(subKey)

                  return (
                    <Box flexDirection="column" marginLeft={2}>
                      <Button key={`s-${subKey}`} plain onPress={() => toggle(subKey)}>
                        {isSubOpen ? '▾' : '▸'} {TAG[group]} {items.length}
                      </Button>
                      {isSubOpen &&
                        items.map(one => (
                          <Box marginLeft={3}>
                            <Text wrap="truncate-middle">
                              {one.label}
                              {one.count > 0 ? ` ×${one.count}` : ''}
                            </Text>
                          </Box>
                        ))}
                    </Box>
                  )
                })}
            </Box>
          )
        })}

        {/* Below the five sections: everything the session owns, by type. */}
        <Box flexDirection="column" marginTop={1}>
          {ORDER.map(group => {
            const items = all
              .filter(one => one.group === group)
              .sort(
                (a, b) =>
                  CATS.indexOf(catOf(a, loaded)) - CATS.indexOf(catOf(b, loaded)) ||
                  b.count - a.count ||
                  a.label.localeCompare(b.label),
              )
            if (items.length === 0) return null
            const key = `inv/${group}`
            const isOpen = unfolded.includes(key)
            const usedCount = items.filter(one => one.count > 0).length
            const n = (cat: Cat) =>
              items.filter(one => (cat === 'used' ? isPulled(one, loaded) : catOf(one, loaded) === cat))
                .length

            return (
              <Box flexDirection="column">
                <Box justifyContent="space-between">
                  <Button key={`i-${group}`} plain onPress={() => toggle(key)}>
                    {isOpen ? '▾' : '▸'} {TITLE[group]}
                  </Button>
                  <Box>
                    <Text>
                      {(['run', 'ok', 'err', 'used'] as Cat[])
                        .filter(c => n(c) > 0)
                        .map(c => `${DOT[c]}${n(c)}`)
                        .join(' ')}
                      {'  '}
                    </Text>
                    {costOf(
                      items.reduce((sum, one) => sum + split(one).eaten, 0),
                      items.reduce((sum, one) => sum + one.body, 0),
                      items.reduce((sum, one) => sum + split(one).skipped, 0),
                    )}
                    <Text>
                      {'  '}
                      {usedCount}/{items.length}
                    </Text>
                  </Box>
                </Box>
                {isOpen &&
                  items.map(one => (
                    <Box marginLeft={2} justifyContent="space-between">
                      <Text wrap="truncate-middle" dimColor={catOf(one, loaded) === 'none'}>
                        {DOT[catOf(one, loaded)]} {one.label}
                        {one.count > 0 ? ` ×${one.count}` : ''}
                      </Text>
                      {costOf(split(one).eaten, one.body, split(one).skipped)}
                    </Box>
                  ))}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
