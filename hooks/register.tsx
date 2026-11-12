import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Group, Light, Status } from '../types'

const PANE = 'traffic-light'
const TITLE_OF_PANE = '도구 신호등'

// Change a tag when the stored fields change: it declines what an earlier
// version stored, which outlives a reload.
const lights = atom({ plugin: 'traffic-light', key: 'lights' } as const, [], {
  shape: 'lights-2',
})
const open = atom({ plugin: 'traffic-light', key: 'open' } as const, [], {
  shape: 'open-1',
})
const onlyUsed = atom({ plugin: 'traffic-light', key: 'onlyUsed' } as const, false, {
  shape: 'only-used-1',
})

const ORDER: Group[] = ['skill', 'plugin', 'mcp', 'agent', 'builtin']
const TITLE: Record<Group, string> = {
  skill: '스킬',
  plugin: '플러그인',
  mcp: 'MCP 서버',
  agent: '서브에이전트',
  builtin: '내장 도구',
}
const DOT: Record<Status, string> = { run: '🟡', ok: '🟢', err: '🔴', idle: '⚪' }
const RANK: Record<Status, number> = { run: 0, err: 1, ok: 2, idle: 3 }

// Ids of servers and plugins are compared in the tool-name spelling.
const norm = (s: string): string => s.replace(/[^A-Za-z0-9]/g, '_')

type Touch = {
  group: Group
  id: string
  label: string
  // 'start' = a call began, 'end' = it finished, 'mark' = a one-shot use.
  phase: 'start' | 'end' | 'mark'
  isError?: boolean
}

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
    next = { ...next, count: next.count + 1, status: t.isError ? 'err' : 'ok' }
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
  return { group: 'builtin', id: 'all', label: tool }
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
type Owned = { key: string; group: Group; label: string }
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
    await safely(async () => {
      await update($, lights, list => {
        let out = touch(list, { group: 'skill', id: name, label: name, phase: 'mark' })
        if (colon > 0) {
          const plugin = name.slice(0, colon)
          out = touch(out, { group: 'plugin', id: norm(plugin), label: plugin, phase: 'mark' })
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
    const isOnlyUsed = await read($, onlyUsed)

    // Everything the session owns; a failed read leaves only what was used.
    let owned: Owned[] = emptyOwned
    try {
      const usage = await $.session.usage({ breakdown: 'summary' })
      const breakdown = usage.context.breakdown
      const next: Owned[] = []
      for (const s of breakdown?.skills?.skillFrontmatter ?? []) {
        next.push({ key: `skill:${s.name}`, group: 'skill', label: s.name })
        if (s.pluginName) {
          next.push({ key: `plugin:${norm(s.pluginName)}`, group: 'plugin', label: s.pluginName })
        }
      }
      const perServer = new Map<string, number>()
      for (const t of breakdown?.mcpTools ?? []) {
        perServer.set(t.serverName, (perServer.get(t.serverName) ?? 0) + 1)
      }
      for (const [server, n] of perServer) {
        next.push({ key: `mcp:${norm(server)}`, group: 'mcp', label: `${server} (${n})` })
      }
      for (const a of breakdown?.agents ?? []) {
        next.push({ key: `agent:${a.agentType}`, group: 'agent', label: a.agentType })
      }
      owned = next
    } catch {
      owned = emptyOwned
    }

    // Owned rows start grey; used rows lay their light over them.
    const rows = new Map<string, Light>()
    for (const o of owned) {
      rows.set(o.key, { key: o.key, group: o.group, label: o.label, status: 'idle', count: 0, running: 0 })
    }
    for (const u of used) {
      const have = rows.get(u.key)
      rows.set(u.key, have ? { ...u, label: have.label } : u)
    }
    const all = [...rows.values()]
    const sorted = (list: Light[]) =>
      [...list].sort(
        (a, b) => RANK[a.status] - RANK[b.status] || b.count - a.count || a.label.localeCompare(b.label),
      )

    const t = tally(all)
    const live = sorted(all.filter(one => one.status !== 'idle'))
    const groups = ORDER.filter(group => all.some(one => one.group === group))

    const toggle = (group: string) =>
      update($, open, list => (list.includes(group) ? list.filter(one => one !== group) : [...list, group]))

    return (
      <Box flexDirection="column">
        <Text bold>
          🟡 {t.run} 실행 · 🟢 {t.ok} 사용 · 🔴 {t.err} 오류 · 전체 {all.length}
        </Text>

        <Box marginTop={1}>
          <Button key="only" hotkey="u" onPress={() => update($, onlyUsed, v => !v)}>
            {isOnlyUsed ? '[u] 사용한 것만 ✔' : '[u] 사용한 것만'}
          </Button>
          <Text> </Text>
          <Button key="expand" hotkey="a" onPress={() => update($, open, () => [...ORDER])}>
            [a] 모두 펼침
          </Button>
          <Text> </Text>
          <Button key="fold" hotkey="c" onPress={() => update($, open, () => [])}>
            [c] 모두 접음
          </Button>
          <Text> </Text>
          <Button key="reset" hotkey="r" onPress={() => update($, lights, () => [])}>
            [r] 횟수 초기화
          </Button>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>지금 / 방금</Text>
          {live.length === 0 && <Text dimColor>  이번 질문에서 쓰인 도구가 아직 없습니다.</Text>}
          {live.map(one => (
            <Text>
              {DOT[one.status]} {TITLE[one.group]} · {one.label} ×{one.count}
            </Text>
          ))}
        </Box>

        {all.length === 0 && (
          <Text dimColor>도구 목록을 읽는 중이거나 아직 없습니다.</Text>
        )}

        {groups.map((group, index) => {
          const inGroup = all.filter(one => one.group === group)
          const isOpen = unfolded.includes(group)
          const g = tally(inGroup)
          const usedCount = inGroup.filter(one => one.count > 0).length
          const shown = sorted(isOnlyUsed ? inGroup.filter(one => one.count > 0) : inGroup)

          return (
            <Box flexDirection="column" marginTop={1}>
              <Button
                key={`g-${group}`}
                hotkey={String(index + 1)}
                plain
                onPress={() => toggle(group)}
              >
                {isOpen ? '▾' : '▸'} {TITLE[group]} · 사용 {usedCount}/{inGroup.length}
                {g.run > 0 ? ` 🟡${g.run}` : ''}
                {g.ok > 0 ? ` 🟢${g.ok}` : ''}
                {g.err > 0 ? ` 🔴${g.err}` : ''}
              </Button>
              {isOpen && shown.length === 0 && <Text dimColor>  (사용한 항목 없음)</Text>}
              {isOpen &&
                shown.map(one => (
                  <Text dimColor={one.status === 'idle'}>
                    {'  '}
                    {DOT[one.status]} {one.label}
                    {one.count > 0 ? ` ×${one.count}` : ''}
                  </Text>
                ))}
            </Box>
          )
        })}

        <Box marginTop={1}>
          <Text dimColor>🟢 사용 🟡 실행 중 🔴 오류 ⚪ 이번 질문 미사용 · 숫자키로 그룹 접기/펼치기</Text>
        </Box>
      </Box>
    )
  })
}
