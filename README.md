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
- `GET /scoring/list`

Candidate explainability endpoint is available under candidates routes:

- `GET /candidates/:id/explanation`

> Important: if AI enhancement is unavailable, scoring now returns an error (`503`, `code: "ai_unavailable"`) and does not fallback to baseline-only mode.

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

### `GET /scoring/list`

Returns already-calculated scoring results sorted by score (desc), confidence (desc), and scoring time (desc).

Example query:

```http
GET /scoring/list?cohortId=cohort-2026&track=undergraduate&scoringVersion=v1&limit=100
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
			"confidence": 0.71,
			"track": "undergraduate",
			"scoringVersion": "v1",
			"scoredAt": "2026-04-02T12:00:00.000Z"
		}
	],
	"processed": 1,
	"cohortId": "cohort-2026"
}
```

### `GET /candidates/:id/explanation`

Returns explainability data for the latest saved scoring result of a candidate.

Language support:

- Query: `language=ru|eng|kz`
- Default: `ru`

Example query:

```http
GET /candidates/6801d0d8a9b2bde33c8f4562/explanation?language=eng
```

Response:

```json
{
	"candidateId": "6801d0d8a9b2bde33c8f4562",
	"reasons": {
		"factorsPlus": ["..."],
		"factorsMinus": ["..."]
	},
	"subfactorContributions": {
		"motivationPercent": 28.44,
		"leadershipPercent": 26.12,
		"growthPercent": 23.17,
		"readinessPercent": 22.27
	},
	"confidencePercent": 67.5,
	"counterFactuals": ["...", "..."],
	"requiresManualReview": false,
	"modelLimitations": "This is an AI-assisted assessment, not an autonomous decision. Committee review remains mandatory, especially for borderline cases.",
	"metadata": {
		"track": "undergraduate",
		"scoringVersion": "v1",
		"scoredAt": "2026-04-02T12:00:00.000Z",
		"language": "eng"
	}
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