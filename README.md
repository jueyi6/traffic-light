# traffic-light (도구 신호등)

A side pane for Claude Code that shows, with traffic lights, which of your skills, plugins, MCP servers, subagents and built-in tools Claude is using, and what each one costs in context.

Claude가 작업하는 동안 내가 가진 스킬·플러그인·MCP 서버·서브에이전트·내장 도구가 실제로 쓰이는지, 컨텍스트를 얼마나 차지하는지 신호등으로 보여 주는 패널입니다.

## What the pane shows

From the top: `펼침` / `접음` buttons, a **지금 / 방금** list (what is running or was just used), five status sections, then everything you own by type.

| Section | Meaning |
| --- | --- |
| 🟡 실행중 | running now |
| 🟢 사용함 | used in this round (since your last prompt) |
| 🔴 오류 | failed or denied |
| 🔵 꺼냄 | holds context: a callable built-in, an MCP server with loaded schemas, or a skill or agent that was invoked |
| ⚪ 미사용 | holds none: deferred or not pulled out |

- The list by type (skills, plugins, MCP servers, subagents, built-in tools) shows `used/total` and light counts on the right, and unfolds to every item.
- Token figures, on the right of each row: a plain number is what the item holds in the context; a ~~struck-through~~ number is what it would hold but does not (a deferred MCP schema, an item not pulled out). `호출 ≈1.1k` is a rough estimate (four characters to a token) of what an invoked skill's prompt added.
- A one-line summary under the prompt, and a toast when a tool fails.
- `/traffic` opens the pane, or closes it when it is open.

## Privacy and cost

Display only. It adds nothing to the model's context, makes no network calls, and reads no files. It keeps tool names, counts and token estimates for the session only. Token figures come from the context breakdown's local estimate, so they cost no model or API tokens. Running `/traffic` or reloading the mod puts a short notice in the conversation.

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
