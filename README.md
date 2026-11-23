# traffic-light (도구 신호등)

**English** | [한국어](README.ko.md)

A side pane for Claude Code that shows what sits in your context, in five lights, and what each skill, plugin, MCP server, agent, memory file and subagent costs.

## Install

```
/plugin install traffic-light --marketplace jueyi6/traffic-light
```

Open the pane with `/traffic`.

## The five lights

| Light | Meaning |
| --- | --- |
| 🟢 사용함 (used) | used this session; a running call shows a spinner |
| 🟡 로드됨 (loaded) | its whole definition is in the context |
| 🔴 오류 (error) | failed |
| 🔵 목록만 (listed) | only its name and description are in the context |
| ⚪ 지연 로드 (deferred) | not in the context until pulled out (number struck through) |

Every number wears its light's color. The same three lights (🟢 🟡 🔴) with their counts sit on the status line.

## Reading the pane

- **Context**: total used, with what is left after the lights (messages, system prompt, MCP instructions).
- **Subagents**: they run in contexts of their own, so their tokens are not part of the total above. Each row shows the agent, model and effort, and `시작` (start: what it began with, i.e. system prompt, tools, skills; measured from its first request), `작업` (work: what it used while working), `출력` (output) and `도구` (tool calls). Tool names are listed under it. `상세 켬` adds cost.
- **Just now (지금 / 방금)**: what happened since your last prompt: message growth (`💬 메시지 +1.1k`) and tools used, counted for the last turn only. Running calls spin. Running totals live in the lights below.
- **Lights**: each opens into groups (Skills, Plugins, MCP, Agents, System, Memory) and rows.
- **Changed numbers**: `A → B` means the row held A when the pane first read the session and holds B now (A dim, B in color).
- **System tools**: names are listed, split into loaded and deferred.
- **Memory files**: click one (📂) to open its folder with the file selected.

Buttons: `펼침` (expand) opens every section, `접음` (fold) shuts them, `상세 켬/끔` (detail on/off) shows each server's tools and each plugin's skills, a rough size per tool call (`≈`, characters / 4) and subagent cost.

A heavy session is cut to a row budget (`… 외 n줄 생략`, "n more rows omitted") so the pane always stays drawable.

## Privacy and context

- **It adds nothing to the model's context.** It only reads and draws: no prompt or tool result is changed, no extra model call is made.
- No network calls.
- It reads the local session transcript (and each subagent's transcript) to learn tool names and a subagent's starting size. Nothing is sent anywhere.
- Clicking a memory file runs `explorer.exe` on your machine to show the folder.

## Notes

- Built for the Claude desktop app's plugin pane; the explorer button is Windows only.
- The pane's labels are in Korean.
- Numbers come from the engine's own context breakdown, so they match its total. Subagent `시작`/`작업` and per-call `≈` sizes are measured or estimated as described above.

## License

[MIT-0](LICENSE)
