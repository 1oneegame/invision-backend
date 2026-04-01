import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '../schemas/user.schema.js';

type AuthUser = {
    sub: string;
    email: string;
    role: UserRole;
};

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        authorizeRoles: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: AuthUser;
        user: AuthUser;
    }
}