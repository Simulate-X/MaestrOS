# MaestrOS — Faz 5 / B2.1: Searchable model combobox (Claude Code)

> Follow-up to B2, on the existing `frontend/` codebase. B2 made the Ollama model list dynamic, rendered as a **chip grid**. With 50+ installed models the chip grid is cluttered. Replace it with a **searchable combobox**. **Edit `AgentEditModal.tsx` in place — do NOT regenerate the project.** No new libraries.

## Goal

Replace the model **chip grid** in `AgentEditModal.tsx` with a **searchable combobox** that scales from 13 to 500+ models. It must work for both the Ollama provider (dynamic list from `useOllamaModels`) and cloud providers (still `MODEL_CATALOG`) — one unified picker, fed by whichever source applies to the selected provider.

## Behavior

A single text input + a filtered, scrollable list:

- The input is both the **filter** and the **selected value** field.
- As the user types, show a dropdown list **below** the input with models whose name contains the typed text (case-insensitive substring match). Cap the visible list height and make it scrollable (e.g. max-height with `overflow-y: auto`), so 500 matches don't blow up the layout.
- Click a model in the list → it fills the input, sets the selected value, and closes the list.
- **Custom / manual value:** if the user types a name that isn't in the list, that typed value *is* the selected model (this preserves the manual-entry fallback for when Ollama is down or the user wants a model not yet listed). Don't force a selection from the list.
- The currently selected model stays shown in the input.
- Open the list on focus/typing; close it on selection or on click-outside / blur.

## States (keep the form usable)

- **loading** (Ollama fetch in flight) → input placeholder like "loading models…", still typeable.
- **has models** → filtered list as above.
- **empty / error** → no list, but the input still works as free text (manual entry). The form must never be blocked.

## Source by provider

- `provider === "ollama"` → the list comes from the `useOllamaModels(...)` hook (added in B2).
- other providers → the list comes from `MODEL_CATALOG` (unchanged).
- Same combobox component for both — just swap which array feeds the filter.

## Implementation notes

- **No new library.** Build it with plain React state: the input string, an `open` boolean, and the selected value. Filter the source array with `.filter(m => m.toLowerCase().includes(query.toLowerCase()))`.
- Match the existing neon-green aesthetic and the modal's input styling.
- Click-outside-to-close: a small `useEffect` with a document click listener, or a focus/blur approach — keep it simple.
- Keyboard niceties (arrow up/down, Enter to select, Esc to close) are a nice-to-have, not required — add only if clean.

## Don't

- Don't regenerate files — edit `AgentEditModal.tsx` (and only touch the model-field section).
- Don't add a new dependency.
- Don't change the data layer (`useOllamaModels`, `api`, `mock`, `MODEL_CATALOG`) — only how the model field is rendered/selected.
- Don't break the rest of the modal. No localStorage.

## Test

1. `npm run dev`, open the Hire/Edit agent modal, provider = Ollama (50+ models installed).
2. Type `qwen` → only qwen models show; type `gemma` → only gemma; clearing shows all (scrollable).
3. Click one → it's selected and shown in the input.
4. Type a model name that isn't installed → it's accepted as a custom value.
5. Switch to anthropic / openrouter → the same combobox filters the `MODEL_CATALOG` list.
6. Stop Ollama → the input still works as free text (no crash).
