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
    createIntakeService,
    type IntakeAuditDocument,
    type IntakeDocument,
    type IntakeVersionDocument,
} from '../../services/intake.service.js';
import type { UserRole } from '../../schemas/user.schema.js';

const intakeRoutes: FastifyPluginAsync = async (fastify) => {
    const db = fastify.mongo.db;
    if (!db) {
        throw new Error('MongoDB database is not initialized');
    }

    const intakeCollection = db.collection<IntakeDocument>('candidate_intake');
    const versionsCollection = db.collection<IntakeVersionDocument>('candidate_intake_versions');
    const auditCollection = db.collection<IntakeAuditDocument>('candidate_intake_audit');

    await intakeCollection.createIndex({ userId: 1 }, { unique: true });
    await versionsCollection.createIndex({ candidateId: 1, version: -1 });
    await auditCollection.createIndex({ candidateId: 1, createdAt: -1 });

    const intakeService = createIntakeService(intakeCollection, versionsCollection, auditCollection);

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
};

export default intakeRoutes;
