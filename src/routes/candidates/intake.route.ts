import type { FastifyPluginAsync } from 'fastify';
import {
    CandidateParamsSchema,
    IntakeBodySchema,
    IntakeErrorSchema,
    IntakeResponseSchema,
    IntakeStatusResponseSchema,
} from '../../schemas/intake.schema.js';
import type { CandidateParams, IntakeBody } from '../../schemas/intake.schema.js';
import {
    CandidateExplanationQuerySchema,
    CandidateExplanationResponseSchema,
    ScoringErrorSchema,
} from '../../schemas/scoring.schema.js';
import type { CandidateExplanationQuery } from '../../schemas/scoring.schema.js';
import {
    createIntakeService,
    type IntakeAuditDocument,
    type IntakeDocument,
    type IntakeVersionDocument,
} from '../../services/intake.service.js';
import {
    createScoringService,
    ScoringServiceError,
    type CohortDocument,
    type ScoringDocument,
} from '../../services/scoring.service.js';
import type { UserRole } from '../../schemas/user.schema.js';

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

const intakeRoutes: FastifyPluginAsync = async (fastify) => {
    const db = fastify.mongo.db;
    if (!db) {
        throw new Error('MongoDB database is not initialized');
    }

    const intakeCollection = db.collection<IntakeDocument>('candidate_intake');
    const versionsCollection = db.collection<IntakeVersionDocument>('candidate_intake_versions');
    const auditCollection = db.collection<IntakeAuditDocument>('candidate_intake_audit');
    const scoringCollection = db.collection<ScoringDocument>('candidate_scoring');
    const cohortsCollection = db.collection<CohortDocument>('candidate_cohorts');

    await intakeCollection.createIndex({ userId: 1 }, { unique: true });
    await versionsCollection.createIndex({ candidateId: 1, version: -1 });
    await auditCollection.createIndex({ candidateId: 1, createdAt: -1 });

    const intakeService = createIntakeService(intakeCollection, versionsCollection, auditCollection);
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

    fastify.post<{ Body: IntakeBody }>('/intake', {
        schema: {
            body: IntakeBodySchema,
            response: {
                200: IntakeResponseSchema,
                400: IntakeErrorSchema,
                401: IntakeErrorSchema,
                403: IntakeErrorSchema,
                500: IntakeErrorSchema,
            },
        },
    }, async (request, reply) => {
        const role = request.user.role as UserRole;
        if (role !== 'Admin' && role !== 'Applicant') {
            return reply.code(403).send({ message: 'Forbidden' });
        }

        const result = await intakeService.upsertIntake(request.user.sub, request.body);
        return reply.code(200).send(result);
    });

    fastify.get<{ Params: CandidateParams }>('/:id/intake-status', {
        schema: {
            params: CandidateParamsSchema,
            response: {
                200: IntakeStatusResponseSchema,
                400: IntakeErrorSchema,
                401: IntakeErrorSchema,
                403: IntakeErrorSchema,
                404: IntakeErrorSchema,
                500: IntakeErrorSchema,
            },
        },
    }, async (request, reply) => {
        const isAdmin = request.user.role === 'Admin';

        try {
            const result = await intakeService.getStatus(request.params.id, request.user.sub, isAdmin);
            return reply.code(200).send(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Internal server error';
            if (message === 'Invalid candidate id') {
                return reply.code(400).send({ message });
            }
            if (message === 'Candidate not found') {
                return reply.code(404).send({ message });
            }
            if (message === 'Forbidden') {
                return reply.code(403).send({ message });
            }
            request.log.error({ error }, 'Failed to fetch intake status');
            return reply.code(500).send({ message: 'Internal server error' });
        }
    });

    fastify.get<{ Params: CandidateParams; Querystring: CandidateExplanationQuery }>('/:id/explanation', {
        schema: {
            params: CandidateParamsSchema,
            querystring: CandidateExplanationQuerySchema,
            response: {
                200: CandidateExplanationResponseSchema,
                400: ScoringErrorSchema,
                401: ScoringErrorSchema,
                403: ScoringErrorSchema,
                404: ScoringErrorSchema,
                500: ScoringErrorSchema,
            },
        },
    }, async (request, reply) => {
        const role = request.user.role as UserRole;
        if (role !== 'Admin' && role !== 'Applicant') {
            return reply.code(403).send({ message: 'Forbidden', code: 'forbidden' });
        }

        try {
            const result = await scoringService.getExplanation(
                request.params.id,
                request.user.sub,
                request.user.role === 'Admin',
                request.query.language,
            );

            return reply.code(200).send(result);
        } catch (error) {
            if (error instanceof ScoringServiceError) {
                return reply.code(error.statusCode).send({ message: error.message, code: error.code });
            }

            request.log.error({ error }, 'Failed to fetch candidate explanation');
            return reply.code(500).send({ message: 'Internal server error' });
        }
    });
};

export default intakeRoutes;
