import type { FastifyPluginAsync } from 'fastify';
import {
    BatchScoringBodySchema,
    BatchScoringResponseSchema,
    RunScoringBodySchema,
    RunScoringResponseSchema,
    ScoringErrorSchema,
} from '../../schemas/scoring.schema.js';
import type { BatchScoringBody, RunScoringBody } from '../../schemas/scoring.schema.js';
import {
    createScoringService,
    ScoringServiceError,
    type CohortDocument,
    type IntakeDocument,
    type IntakeVersionDocument,
    type ScoringDocument,
} from '../../services/scoring.service.js';

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }

    return value;
}

function parseUnitFloat(name: string, raw: string | undefined, fallback: number): number {
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`${name} must be a number between 0 and 1`);
    }

    return value;
}

const scoringRoutes: FastifyPluginAsync = async (fastify) => {
    const db = fastify.mongo.db;
    if (!db) {
        throw new Error('MongoDB database is not initialized');
    }

    const intakeCollection = db.collection<IntakeDocument>('candidate_intake');
    const versionsCollection = db.collection<IntakeVersionDocument>('candidate_intake_versions');
    const scoringCollection = db.collection<ScoringDocument>('candidate_scoring');
    const cohortsCollection = db.collection<CohortDocument>('candidate_cohorts');

    await scoringCollection.createIndex({ candidateId: 1, scoringVersion: 1, track: 1 }, { unique: true });
    await scoringCollection.createIndex({ totalScore: -1, confidence: -1, updatedAt: -1 });
    await cohortsCollection.createIndex({ cohortId: 1 }, { unique: true });

    const scoringService = createScoringService(
        intakeCollection,
        versionsCollection,
        scoringCollection,
        cohortsCollection,
        {
            scoringVersion: process.env.SCORING_VERSION ?? 'v1',
            defaultTrack: process.env.SCORING_DEFAULT_TRACK === 'foundation' ? 'foundation' : 'undergraduate',
            model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
            openAiTimeoutMs: parsePositiveInt('OPENAI_TIMEOUT_MS', process.env.OPENAI_TIMEOUT_MS, 8000),
            aiInfluence: parseUnitFloat('SCORING_AI_INFLUENCE', process.env.SCORING_AI_INFLUENCE, 0.3),
            batchConcurrency: parsePositiveInt('SCORING_BATCH_CONCURRENCY', process.env.SCORING_BATCH_CONCURRENCY, 3),
            ...(process.env.OPENAI_API_KEY ? { openAiApiKey: process.env.OPENAI_API_KEY } : {}),
        },
    );

    fastify.addHook('preHandler', fastify.authenticate);

    fastify.post<{ Body: RunScoringBody }>('/run', {
        preHandler: fastify.authorizeRoles(['Admin']),
        schema: {
            body: RunScoringBodySchema,
            response: {
                200: RunScoringResponseSchema,
                400: ScoringErrorSchema,
                401: ScoringErrorSchema,
                403: ScoringErrorSchema,
                404: ScoringErrorSchema,
                422: ScoringErrorSchema,
                500: ScoringErrorSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const input = {
                ...(request.body.candidateId ? { candidateId: request.body.candidateId } : {}),
                ...(request.body.payload ? { payload: request.body.payload } : {}),
                ...(request.body.track ? { track: request.body.track } : {}),
            };

            const result = await scoringService.run(input);

            return reply.code(200).send(result);
        } catch (error) {
            if (error instanceof ScoringServiceError) {
                return reply.code(error.statusCode).send({ message: error.message, code: error.code });
            }

            request.log.error({ error }, 'Scoring run failed');
            return reply.code(500).send({ message: 'Internal server error' });
        }
    });

    fastify.post<{ Body: BatchScoringBody }>('/batch', {
        preHandler: fastify.authorizeRoles(['Admin']),
        schema: {
            body: BatchScoringBodySchema,
            response: {
                200: BatchScoringResponseSchema,
                400: ScoringErrorSchema,
                401: ScoringErrorSchema,
                403: ScoringErrorSchema,
                404: ScoringErrorSchema,
                422: ScoringErrorSchema,
                500: ScoringErrorSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const input = {
                ...(request.body.candidateIds ? { candidateIds: request.body.candidateIds } : {}),
                ...(request.body.cohortId ? { cohortId: request.body.cohortId } : {}),
                ...(request.body.track ? { track: request.body.track } : {}),
            };

            const result = await scoringService.batch(input);

            return reply.code(200).send(result);
        } catch (error) {
            if (error instanceof ScoringServiceError) {
                return reply.code(error.statusCode).send({ message: error.message, code: error.code });
            }

            request.log.error({ error }, 'Scoring batch failed');
            return reply.code(500).send({ message: 'Internal server error' });
        }
    });
};

export default scoringRoutes;
