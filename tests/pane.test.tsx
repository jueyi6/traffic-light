import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'traffic-light',
  component: 'Pane',
  requestId: 'traffic-light',
  props: { title: 't', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const usage = {
  context: {
    breakdown: {
      categories: [{ name: 'System tools', tokens: 5, kind: 'used', color: 'x' }],
      totalTokens: 1,
      rawMaxTokens: 2,
      percentage: 1,
      skills: { skillFrontmatter: [{ name: 'alpha', tokens: 30 }, { name: 'plug:beta', tokens: 20 }] },
      mcpTools: [{ name: 'mcp__srv__t', serverName: 'srv', tokens: 40, isLoaded: true }],
      agents: [],
      memoryFiles: [],
    },
  },
}

test('expand and fold open and shut every header', async ($, on) => {
  on('command.register', () => ({ value: { command: 'traffic' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.panes', () => ({ value: [] }))
  on('session.usage', () => ({ value: usage as never }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 50; i += 1) await Promise.resolve()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const text = async (key: string) => (await ui.find({ key }))?.text ?? ''
  const heads = async () =>
    (await ui.findAll({ type: 'Button' })).map(b => b.text ?? '').filter(t => /^[>∨]/.test(t))
  const shown = async (re: RegExp) => (await ui.find({ type: 'Text', text: re })) !== undefined

  expect(await shown(/지금 \/ 방금/)).toBe(true)
  await ui.press({ key: 'expand' })
  expect(await text('ctx')).toMatch(/∨/)
  expect(await shown(/alpha/)).toBe(true)
  expect(await shown(/srv/)).toBe(true)
  expect(await shown(/^plug$/)).toBe(true)
  expect(await shown(/plug:beta/)).toBe(false)
  expect(await shown(/^t$/)).toBe(false)
  await ui.press({ key: 'detail' })
  expect(await text('detail')).toMatch(/켬/)
  expect(await shown(/^t$/)).toBe(true)
  await ui.press({ key: 'fold' })
  await ui.press({ key: 'expand' })
  expect(await shown(/^t$/)).toBe(true)
  await ui.press({ key: 'detail' })
  expect(await shown(/^t$/)).toBe(false)
  expect((await heads()).filter(t => t.startsWith('>'))).toEqual([])
  await ui.press({ key: 'fold' })
  expect(await text('ctx')).toMatch(/>/)
  expect(await shown(/alpha/)).toBe(false)
  expect((await heads()).filter(t => t.startsWith('∨'))).toEqual([])
  for (const c of ['ok', 'err', 'loaded', 'listed', 'waiting']) expect(await text(`c-${c}`)).toMatch(/>/)
  await ui.unmount()
})

test('a huge session is cut to a budget and its buttons stay alive', async ($, on) => {
  const skills = Array.from({ length: 2000 }, (_, i) => ({ name: `skill-name-${i}`, tokens: 20, pluginName: `plugin-${i % 300}` }))
  const mcp = Array.from({ length: 3000 }, (_, i) => ({ name: `mcp__server${i % 200}__tool_name_${i}`, serverName: `server${i % 200}`, tokens: 30, isLoaded: i % 3 === 0 }))
  const huge = { context: { breakdown: { ...usage.context.breakdown, skills: { skillFrontmatter: skills }, mcpTools: mcp } } }
  on('command.register', () => ({ value: { command: 'traffic' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.panes', () => ({ value: [] }))
  on('session.usage', () => ({ value: huge as never }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 50; i += 1) await Promise.resolve()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'expand' })
  await ui.press({ key: 'detail' })
  expect((await ui.findAll({})).length).toBeLessThan(1100)
  expect(await ui.find({ type: 'Text', text: /생략/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /지금 \/ 방금/ })).toBeDefined()
  await ui.press({ key: 'fold' })
  expect((await ui.findAll({})).length).toBeLessThan(100)
  await ui.unmount()
})

// An expanded pane of a realistic session stays small: the engine drops a tree past its
// bounds (100,000 characters serialized), and the app then keeps the old drawing and its
// dead button numbers.
test('an expanded pane of a big session stays within the tree bounds', async ($, on) => {
  const skills = Array.from({ length: 130 }, (_, i) => ({ name: `skill-name-${i}`, tokens: 20 + i, pluginName: `plugin-${i % 12}` }))
  const mcp = Array.from({ length: 250 }, (_, i) => ({ name: `mcp__server${i % 9}__tool_name_${i}`, serverName: `server${i % 9}`, tokens: 30, isLoaded: i % 3 === 0 }))
  const big = { context: { breakdown: { ...usage.context.breakdown, skills: { skillFrontmatter: skills }, mcpTools: mcp } } }
  on('command.register', () => ({ value: { command: 'traffic' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.panes', () => ({ value: [] }))
  on('session.usage', () => ({ value: big as never }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 50; i += 1) await Promise.resolve()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'expand' })
  expect((await ui.findAll({})).length).toBeLessThan(700)
  // 상세 on adds one Text line per tool and skill. 1642 nodes once broke redraw; stay well below.
  await ui.press({ key: 'detail' })
  expect((await ui.findAll({})).length).toBeLessThan(1100)
  await ui.unmount()
})
