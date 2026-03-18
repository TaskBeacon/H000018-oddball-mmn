# H000018 Oddball MMN/P3

HTML/browser preview of the three-stimulus Oddball task built with `psyflow-web`.
The `standard/deviant/target` trial semantics, target-only response rule (`space`), and block-level MMN/P3 metrics are aligned to local `T000018-oddball-mmn`; block count is shortened for preview.

## Layout

- `main.ts`: task orchestration
- `config/config.yaml`: declarative config
- `src/run_trial.ts`: trial logic
- `src/utils.ts`: condition generation and metrics helpers

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000018-oddball-mmn
```
