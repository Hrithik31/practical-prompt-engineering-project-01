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
