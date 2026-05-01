# CV Guidance Roadmap (Implemented Foundation)

## Added in codebase

- `src/ai/cv/types.ts` - normalized frame signal contract
- `src/ai/cv/ruleEngine.ts` - deterministic mapping from CV signals to guidance actions
- `src/ai/cv/provider.ts` - fallback provider interface for current heuristic mode

## What is still required for full positional guidance

1. Native frame source (development build, not Expo Go)
2. Detector outputs per frame:
   - coverage
   - offsetX / offsetY
   - luminance / glare / blur
3. Wire detector output to `mapCvSignalToGuidance(...)`
4. Replace fallback provider in item/vehicle capture flows

## Why this matters

Current fallback lacks geometric position signals, so messages like "move closer" / "step back" cannot be reliably inferred.
With detector signals, guidance and auto-capture trigger become truly positional.
