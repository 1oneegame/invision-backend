import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import {
    UserCreateBodySchema,
    UserDocumentSchema,
    UserListResponseSchema,
    UserMutationResponseSchema,
    UserParamsSchema,
    UserUpdateBodySchema,
} from '../../schemas/user.schema.js';
import type {
    User,
    UserCreateBody,
    UserParams,
    UserRole,
    UserUpdateBody,
} from '../../schemas/user.schema.js';

const AuthErrorSchema = UserMutationResponseSchema;

type UserDocument = User & { _id: ObjectId };

function toResponseUser(user: UserDocument) {
    return {
        ...user,
        _id: user._id.toHexString(),
    };
}

export default async function usersRoutes(fastify: FastifyInstance) {
    const db = fastify.mongo.db;
    if (!db) {
        throw new Error('MongoDB database is not initialized');
    }

    fastify.addHook('preHandler', fastify.authenticate);

    const collection = db.collection<User>('users');

    fastify.get('/', {
        preHandler: fastify.authorizeRoles(['Admin']),
        schema: {
            response: {
                200: UserListResponseSchema,
                401: AuthErrorSchema,
                403: AuthErrorSchema,
            },
        },
    }, async () => {
        const users = await collection.find().toArray();
        return users.map(toResponseUser);
    });

    fastify.post<{ Body: UserCreateBody }>('/', {
        schema: {
            body: UserCreateBodySchema,
            response: {
                201: UserDocumentSchema,
                401: AuthErrorSchema,
                403: AuthErrorSchema,
            },
        },
    }, async (request, reply) => {
        const requesterRole = request.user.role;
        if (requesterRole !== 'Admin' && requesterRole !== 'Applicant') {
            return reply.code(403).send({ message: 'Forbidden' });
        }

        const newUser: User = {
            name: request.body.name.trim(),
            email: request.body.email.trim().toLowerCase(),
            ...(typeof request.body.age !== 'undefined' ? { age: request.body.age } : {}),
            ...(typeof request.body.surname !== 'undefined' ? { surname: request.body.surname.trim() } : {}),
            role: 'Applicant' as UserRole,
        };

        const result = await collection.insertOne(newUser);
        const createdUser = await collection.findOne({ _id: result.insertedId });

        if (!createdUser) {
            return reply.code(500).send({ message: 'Failed to create user' });
        }

        return reply.code(201).send(toResponseUser(createdUser));
    });

    fastify.patch<{ Params: UserParams; Body: UserUpdateBody }>('/:id', {
        preHandler: fastify.authorizeRoles(['Admin']),
        schema: {
            params: UserParamsSchema,
            body: UserUpdateBodySchema,
            response: {
                200: UserDocumentSchema,
                400: UserMutationResponseSchema,
                401: AuthErrorSchema,
                403: AuthErrorSchema,
                404: UserMutationResponseSchema,
            },
        },
    }, async (request, reply) => {
        let objectId: ObjectId;
        try {
            objectId = new ObjectId(request.params.id);
        } catch {
            return reply.code(400).send({ message: 'Invalid user id' });
        }
        const updatePayload: Partial<User> = { ...request.body };
        // Role cannot be changed from API routes.
        delete updatePayload.role;
        if (typeof updatePayload.name === 'string') updatePayload.name = updatePayload.name.trim();
        if (typeof updatePayload.surname === 'string') updatePayload.surname = updatePayload.surname.trim();
        if (typeof updatePayload.email === 'string') updatePayload.email = updatePayload.email.trim().toLowerCase();

        const result = await collection.findOneAndUpdate(
            { _id: objectId },
            { $set: updatePayload },
            { returnDocument: 'after' },
        );

        if (!result) {
            return reply.code(404).send({ message: 'User not found' });
        }

        return toResponseUser(result);
    });

    fastify.delete<{ Params: UserParams }>('/:id', {
        preHandler: fastify.authorizeRoles(['Admin']),
        schema: {
            params: UserParamsSchema,
            response: {
                200: UserMutationResponseSchema,
                400: UserMutationResponseSchema,
                401: AuthErrorSchema,
                403: AuthErrorSchema,
                404: UserMutationResponseSchema,
            },
        },
    }, async (request, reply) => {
        let objectId: ObjectId;
        try {
            objectId = new ObjectId(request.params.id);
        } catch {
            return reply.code(400).send({ message: 'Invalid user id' });
        }

        const result = await collection.deleteOne({ _id: objectId });

        if (result.deletedCount === 0) {
            return reply.code(404).send({ message: 'User not found' });
        }

        return { message: 'User deleted successfully' };
    });
}