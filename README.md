# Invision backend 

Fastify + Mongodb + NextAuth(Frontend)

## Quick start

1) clone repo
2) make '.env'
3) DONT FORGET INCLUDE DB NAME IN MONGODB_URI ("invision_university")
4) run:

```bash
npm install 
npm run dev
```

## Stage 2: AI Scoring Engine

Backend now includes Stage 2 scoring endpoints (Admin only):

- `POST /scoring/run`
- `POST /scoring/batch`

### `POST /scoring/run`

Request body supports either `candidateId` or raw intake `payload`:

```json
{
	"candidateId": "6801d0d8a9b2bde33c8f4561",
	"track": "undergraduate"
}
```

Response:

```json
{
	"candidateId": "6801d0d8a9b2bde33c8f4561",
	"totalScore": 0.74,
	"subscores": {
		"motivation": 0.78,
		"leadership": 0.71,
		"growth": 0.69,
		"readiness": 0.73
	},
	"confidence": 0.67,
	"recommendation": "review required",
	"explanation": {
		"factorsPlus": ["..."],
		"factorsMinus": ["..."],
		"notes": "..."
	},
	"metadata": {
		"track": "undergraduate",
		"scoringVersion": "v1",
		"model": "gpt-4.1-mini",
		"usedAiEnhancement": true,
		"degradedMode": false,
		"scoredAt": "2026-04-02T12:00:00.000Z"
	}
}
```

### `POST /scoring/batch`

```json
{
	"candidateIds": ["6801d0d8a9b2bde33c8f4561", "6801d0d8a9b2bde33c8f4562"],
	"track": "undergraduate"
}
```

Response:

```json
{
	"results": [
		{
			"candidateId": "6801d0d8a9b2bde33c8f4562",
			"score": 0.82,
			"rank": 1,
			"recommendation": "strong shortlist",
			"confidence": 0.71
		}
	],
	"processed": 2
}
```

### Required env vars for scoring

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `OPENAI_TIMEOUT_MS` (default: `8000`)
- `SCORING_VERSION` (default: `v1`)
- `SCORING_DEFAULT_TRACK` (`foundation` or `undergraduate`)
- `SCORING_AI_INFLUENCE` (0..1, default `0.3`)
- `SCORING_BATCH_CONCURRENCY` (default `3`)