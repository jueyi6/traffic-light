# traffic-light (도구 신호등)

A side pane for Claude Code that shows, with traffic lights, which of your skills, plugins, MCP servers, subagents and built-in tools Claude is using right now.

Claude가 작업하는 동안 내가 가진 스킬·플러그인·MCP 서버·서브에이전트·내장 도구가 실제로 쓰이는지 신호등으로 보여 주는 패널입니다.

- 🟢 used · 🟡 running · 🔴 error · ⚪ not used in this round
- A "now / just now" section on top, collapsible groups, hotkeys (`1`-`5` fold a group, `a` expand all, `c` collapse all, `u` only used, `r` reset counts)
- A one-line summary under the prompt, and a toast when a tool fails
- `/traffic` opens the pane, or closes it when it is open
- Display only: it adds nothing to the model's context and makes no network calls. It stores tool names and counts for the session only.

## Install

At the prompt of a terminal session:

```
/plugin install traffic-light --marketplace jueyi6/traffic-light
```

From a shell:

```
claude plugin install traffic-light --marketplace jueyi6/traffic-light
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `jueyi6/traffic-light`, then Add plugin.

The repository is public: anyone can read the code and install the mod.

## License

[MIT-0](LICENSE) (MIT No Attribution): use, copy, modify and distribute freely, no credit required.
