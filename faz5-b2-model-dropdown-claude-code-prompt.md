# MaestrOS — Faz 5 / B2: Wire the model dropdown to live Ollama models (Claude Code)

> Frontend task on the existing `frontend/` codebase (Vite + React + TS, wired to the live backend). The backend now exposes `GET /ollama/models` → `{ "provider": "ollama", "models": string[] }` (the real installed Ollama models). Replace the hardcoded Ollama model list in `AgentEditModal` with this live data. **Edit files in place — do NOT regenerate the project.** Keep everything else working.

## Background

The model dropdown in `AgentEditModal.tsx` is currently populated from a hardcoded `MODEL_CATALOG` constant (~line 9). For Ollama this is wrong — it lists 3 hardcoded models while the machine actually has 13. We just added a backend endpoint that returns the real list. This task makes the dropdown use it **for the Ollama provider only**; cloud providers (anthropic, openrouter) keep using `MODEL_CATALOG` for now (their dynamic discovery lands later).

## 1. Data layer — follow the existing pattern in `lib/`

The app fetches data via `lib/api.ts` + `lib/queries.ts` with a `VITE_USE_MOCK` switch and `lib/mock.ts` for standalone mode. Add the model-list fetch the same way (match the existing conventions in each file):

**`lib/api.ts`** — add, using the existing axios `client` / base-URL setup:
```ts
export async function getOllamaModels(): Promise<string[]> {
  const { data } = await client.get("/ollama/models");
  return data.models ?? [];   // backend shape: { provider, models }
}
```

**`lib/mock.ts`** — add a mock returning a small static list (so standalone/mock mode still works):
```ts
export async function getOllamaModels(): Promise<string[]> {
  return ["qwen2.5-coder:14b", "llama3.1:latest", "gemma-msi:latest"];
}
```

**`lib/queries.ts`** — add a hook following the existing USE_MOCK switch pattern:
```ts
export function useOllamaModels(enabled: boolean) {
  return useQuery({
    queryKey: ["ollama-models"],
    queryFn: () => USE_MOCK ? mock.getOllamaModels() : api.getOllamaModels(),
    enabled,              // only fetch when the Ollama provider is selected
    staleTime: 60_000,    // models rarely change — cache for a minute
  });
}
```

## 2. Wire `AgentEditModal.tsx`

- Call `useOllamaModels(provider === "ollama")` so it fetches only when Ollama is the selected provider.
- **Model options by provider:**
  - `provider === "ollama"` → use the fetched list for the model options.
  - other providers → keep using `MODEL_CATALOG` exactly as today.
- **States (the form must never become unusable):**
  - loading → disabled select / "loading models…" indicator
  - has models → render them with the same styling as the current model dropdown/chips
  - empty **or** error → fall back to a **free-text input** so the user can still type a model name manually (this is what saves you when Ollama is down)
- When the provider switches to ollama, the hook re-fetches automatically (its `enabled` flips to true).

## 3. Trim `MODEL_CATALOG`

- Remove the **Ollama** entries from `MODEL_CATALOG` — they're dynamic now. Keep the **cloud** (anthropic / openrouter) entries; those still feed their dropdowns until their own discovery lands.
- If `MODEL_CATALOG` is keyed by provider, drop the `ollama` key. If it's a flat list, remove only the ollama models.

## Don't

- Don't regenerate the file or the project — edit `AgentEditModal.tsx`, `lib/api.ts`, `lib/queries.ts`, `lib/mock.ts` in place.
- Don't remove the cloud entries from `MODEL_CATALOG`.
- Don't break the rest of the modal (Identity / Governance tabs, save, validation).
- Don't add a new library — TanStack Query + the existing stack only.
- No localStorage / sessionStorage.

## Test

1. `npm run dev`, open an agent's edit modal.
2. Select provider **Ollama** → the model dropdown shows the real installed models (13, not 3), fetched from `/ollama/models`.
3. Select **anthropic / openrouter** → dropdown still shows the `MODEL_CATALOG` entries, unchanged.
4. Stop the Ollama service (or point the base URL at a dead address) → the model field degrades to a free-text input instead of breaking the modal.
