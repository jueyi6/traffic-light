# traffic-light (도구 신호등)

A side pane for Claude Code that shows what sits in your context, in five lights, and what each skill, plugin, MCP server, agent, memory file and subagent costs.

컨텍스트에 뭐가 얼마나 들어 있는지 신호등 5색으로 보여 주는 패널입니다. 서브에이전트가 쓴 토큰도 따로 보여 줍니다.

![demo](docs/demo.gif)

> The demo is a real screen recording of the pane (cursor and captions added), sped up while the subagent runs.
> 데모는 실제 패널 화면을 녹화한 것이며 커서와 자막만 덧입혔습니다. 서브에이전트가 도는 구간은 빨리감기입니다.

## Install

```
/plugin install traffic-light --marketplace jueyi6/traffic-light
```

Open the pane with `/traffic`.

## The five lights

| Light | Meaning |
| --- | --- |
| 🟢 사용함 | used this session; a running call shows a spinner |
| 🟡 로드됨 | its whole definition is in the context |
| 🔴 오류 | failed |
| 🔵 목록만 | only its name and description are in the context |
| ⚪ 지연 로드 | not in the context until pulled out (number struck through) |

Every number wears its light's color. The same three lights (🟢 🟡 🔴) with their counts sit on the status line.

## Reading the pane

- **컨텍스트 / Context**: total used, with what is left after the lights (messages, system prompt, MCP instructions).
- **서브에이전트 / Subagents**: they run in contexts of their own, so their tokens are not part of the total above. Each row shows the agent, model and effort, and `시작` (what it started with: system prompt, tools, skills; measured from its first request), `작업` (what it used while working), `출력` (output) and `도구` (tool calls). Tool names are listed under it. `상세 켬` adds cost.
- **지금 / 방금 / Just now**: what happened since your last prompt: message growth (`💬 메시지 +1.1k`) and tools used, counted for the last turn only. Running calls spin. Running totals live in the lights below.
- **Lights**: each opens into groups (Skills, Plugins, MCP, Agents, System, Memory) and rows.
- **Changed numbers**: `A → B` means the row held A when the pane first read the session and holds B now (A dim, B in color).
- **시스템 도구 / System tools**: names are listed, split into loaded and deferred.
- **Memory files**: click one (📂) to open its folder with the file selected.

Buttons: `펼침` opens every section, `접음` shuts them, `상세 켬/끔` shows each server's tools and each plugin's skills, a rough size per tool call (`≈`, characters / 4) and subagent cost.

A heavy session is cut to a row budget (`… 외 n줄 생략`) so the pane always stays drawable.

## Privacy and context

- **It adds nothing to the model's context.** It only reads and draws: no prompt or tool result is changed, no extra model call is made.
- No network calls.
- It reads the local session transcript (and each subagent's transcript) to learn tool names and a subagent's starting size. Nothing is sent anywhere.
- Clicking a memory file runs `explorer.exe` on your machine to show the folder.

## Notes

- Built for the Claude desktop app's plugin pane; the explorer button is Windows only.
- Numbers come from the engine's own context breakdown, so they match its total. Subagent `시작`/`작업` and per-call `≈` sizes are measured or estimated as described above.

## License

[MIT-0](LICENSE)
