import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { IntakeBodySchema } from './intake.schema.js';

export const TrackSchema = Type.Union([
    Type.Literal('foundation'),
    Type.Literal('undergraduate'),
]);

export const RecommendationSchema = Type.Union([
    Type.Literal('strong shortlist'),
    Type.Literal('review required'),
    Type.Literal('hold'),
]);

export const ScoringErrorSchema = Type.Object({
    message: Type.String(),
    code: Type.Optional(Type.String()),
});

export const SubscoresSchema = Type.Object({
    motivation: Type.Number({ minimum: 0, maximum: 1 }),
    leadership: Type.Number({ minimum: 0, maximum: 1 }),
    growth: Type.Number({ minimum: 0, maximum: 1 }),
    readiness: Type.Number({ minimum: 0, maximum: 1 }),
});

export const ExplanationSchema = Type.Object({
    factorsPlus: Type.Array(Type.String()),
    factorsMinus: Type.Array(Type.String()),
    notes: Type.String(),
});

export const ScoringMetadataSchema = Type.Object({
    track: TrackSchema,
    scoringVersion: Type.String({ minLength: 1 }),
    model: Type.String({ minLength: 1 }),
    usedAiEnhancement: Type.Boolean(),
    degradedMode: Type.Boolean(),
    scoredAt: Type.String({ format: 'date-time' }),
});

export const RunScoringBodySchema = Type.Object({
    candidateId: Type.Optional(Type.String({ minLength: 1 })),
    payload: Type.Optional(IntakeBodySchema),
    track: Type.Optional(TrackSchema),
});

export const RunScoringResponseSchema = Type.Object({
    candidateId: Type.String({ minLength: 1 }),
    totalScore: Type.Number({ minimum: 0, maximum: 1 }),
    subscores: SubscoresSchema,
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    recommendation: RecommendationSchema,
    explanation: ExplanationSchema,
    metadata: ScoringMetadataSchema,
});

export const BatchScoringBodySchema = Type.Object({
    candidateIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 200 })),
    cohortId: Type.Optional(Type.String({ minLength: 1 })),
    track: Type.Optional(TrackSchema),
});

export const BatchScoringItemSchema = Type.Object({
    candidateId: Type.String({ minLength: 1 }),
    score: Type.Number({ minimum: 0, maximum: 1 }),
    rank: Type.Number({ minimum: 1 }),
    recommendation: RecommendationSchema,
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
});

export const BatchScoringResponseSchema = Type.Object({
    results: Type.Array(BatchScoringItemSchema),
    processed: Type.Number({ minimum: 0 }),
    failures: Type.Optional(Type.Array(Type.Object({
        candidateId: Type.String({ minLength: 1 }),
        message: Type.String(),
        code: Type.String(),
    }))),
    cohortId: Type.Optional(Type.String({ minLength: 1 })),
});

export const ListScoringQuerySchema = Type.Object({
    cohortId: Type.Optional(Type.String({ minLength: 1 })),
    track: Type.Optional(TrackSchema),
    scoringVersion: Type.Optional(Type.String({ minLength: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
});

export const ListScoringItemSchema = Type.Object({
    candidateId: Type.String({ minLength: 1 }),
    score: Type.Number({ minimum: 0, maximum: 1 }),
    rank: Type.Number({ minimum: 1 }),
    recommendation: RecommendationSchema,
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    track: TrackSchema,
    scoringVersion: Type.String({ minLength: 1 }),
    scoredAt: Type.String({ format: 'date-time' }),
});

export const ListScoringResponseSchema = Type.Object({
    results: Type.Array(ListScoringItemSchema),
    processed: Type.Number({ minimum: 0 }),
    cohortId: Type.Optional(Type.String({ minLength: 1 })),
});

export type Track = Static<typeof TrackSchema>;
export type Recommendation = Static<typeof RecommendationSchema>;
export type RunScoringBody = Static<typeof RunScoringBodySchema>;
export type RunScoringResponse = Static<typeof RunScoringResponseSchema>;
export type BatchScoringBody = Static<typeof BatchScoringBodySchema>;
export type BatchScoringResponse = Static<typeof BatchScoringResponseSchema>;
export type ListScoringQuery = Static<typeof ListScoringQuerySchema>;
export type ListScoringResponse = Static<typeof ListScoringResponseSchema>;
