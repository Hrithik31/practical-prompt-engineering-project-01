# Practical Prompt Engineering Project 01

## Prompt metadata

Each saved prompt includes a `metadata` object with its model, ISO 8601 creation
and update timestamps, and a token estimate. The model name is entered when a
prompt is created. Older saved prompts are migrated with the model name
`Unspecified`.

The browser script exposes these plain JavaScript functions:

- `trackModel(modelName, content)` creates metadata with an initial timestamp.
- `updateTimestamps(metadata)` returns updated metadata while preserving its
  creation timestamp.
- `estimateTokens(text, isCode)` returns the lower and upper estimates from the
  word and character counts. Code estimates use a 1.3 multiplier. Confidence
  uses the upper estimate: high below 1,000, medium through 5,000, and low above
  5,000.

Metadata is shown on each prompt card, and cards are ordered by creation time,
newest first.

## Import and export

Use **Export JSON** to download every saved prompt, including its note, rating,
and complete metadata. The version 1 document has this shape:

```json
{
  "format": "prompt-library-export",
  "version": 1,
  "exportedAt": "2026-10-28T12:00:00.000Z",
  "statistics": {
    "totalPrompts": 0,
    "averageRating": null,
    "mostUsedModel": null
  },
  "prompts": []
}
```

Average rating is calculated across rated prompts only. The most-used model is
the model with the most prompts; ties are resolved alphabetically. Empty
collections use `null` for both statistics.

Use **Import JSON** to validate a version 1 export before choosing merge or
replace. Merge adds new IDs and asks whether to keep or replace each matching
prompt. Replace discards the current collection after confirmation in the
import dialog. Before either operation, the prior raw prompt data is saved under
the `prompt-library-import-backup` localStorage key; failed writes are rolled
back automatically when browser storage permits.
