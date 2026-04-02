import type { FastifyPluginAsync } from 'fastify';
import {
    ErrorResponseSchema,
    SigninBodySchema,
    SigninResponseSchema,
    SignupBodySchema,
    SignupResponseSchema,
} from '../../schemas/auth.schema.js';
import type { SigninBody, SignupBody } from '../../schemas/auth.schema.js';
import { createAuthService, type AuthUserDocument } from '../../services/auth.service.js';

const authRoutes: FastifyPluginAsync = async (fastify) => {
    const db = fastify.mongo.db;
    if (!db) {
        throw new Error('MongoDB database is not initialized');
    }

    const usersCollection = db.collection<AuthUserDocument>('users');

    await usersCollection.createIndex({ email: 1 }, { unique: true });

    const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '1h';
    const authService = createAuthService(usersCollection, (payload) =>
        fastify.jwt.sign(payload, { expiresIn: jwtExpiresIn }),
    );

    fastify.post<{ Body: SignupBody }>('/signup', {
        schema: {
            body: SignupBodySchema,
            response: {
                201: SignupResponseSchema,
                400: ErrorResponseSchema,
                409: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const result = await authService.signup(request.body);
        return reply.code(201).send(result);
    });

    fastify.post<{ Body: SigninBody }>('/signin', {
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '15 minutes',
            },
        },
        schema: {
            body: SigninBodySchema,
            response: {
                200: SigninResponseSchema,
                400: ErrorResponseSchema,
                401: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async (request) => authService.signin(request.body));
};

export default authRoutes;