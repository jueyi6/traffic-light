# traffic-light (도구 신호등)

A side pane for Claude Code that shows what sits in the context, in five lights, and what each skill, plugin, MCP server, agent and memory file costs.

컨텍스트에 뭐가 얼마나 들어 있는지 신호등 5색으로 보여 주는 패널입니다.

| Light | Meaning |
| --- | --- |
| 🟢 사용함 | used this session; a running call shows a spinner |
| 🔴 오류 | failed |
| 🟡 로드됨 | its whole definition is in the context |
| 🔵 목록만 | only its name and description are in the context |
| ⚪ 지연 로드 | not in the context until pulled out (numbers struck through) |

- `펼침` / `접음` open or shut every section. `상세 켬/끔` shows each server's tools and each plugin's skills.
- Numbers wear their light's color. `A → B` means the row held A at session start and holds B now.
- A heavy session is cut to a row budget (`… 외 n줄 생략`) so the pane always stays drawable.
- `/traffic` opens the pane.

Display only: it adds nothing to the model's context, makes no network calls and reads no files.

## Install

```
/plugin install traffic-light --marketplace jueyi6/traffic-light
```

## License

[MIT-0](LICENSE)
