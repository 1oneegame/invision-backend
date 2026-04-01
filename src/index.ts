import 'dotenv/config';

import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import mongodbPlugin from './plugins/mongodb.js';
import usersRoutes from './routes/users/users.route.js';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import authRoutes from './routes/auth/auth.route.js';
import { AuthServiceError } from './services/auth.service.js';

const PORT = process.env.PORT || 3000;

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET is required');
}

const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean)
  ?? ['http://localhost:3000'];

type ValidationIssue = {
  instancePath?: string;
  message?: string;
};

function buildFieldErrors(issues: ValidationIssue[] | undefined): Record<string, string[]> | undefined {
  if (!issues || issues.length === 0) {
    return undefined;
  }

  const fieldErrors: Record<string, string[]> = {};

  for (const issue of issues) {
    const path = issue.instancePath?.split('/').filter(Boolean) ?? [];
    const field = path[path.length - 1] ?? 'body';
    const message = issue.message?.trim();

    if (!message) {
      continue;
    }

    if (!fieldErrors[field]) {
      fieldErrors[field] = [];
    }

    fieldErrors[field].push(message);
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

const fastify : FastifyInstance = Fastify({
    logger: true,
});

/* --------------------------------- Plugins -------------------------------- */
fastify.register(mongodbPlugin);
fastify.register(cors, {
  origin: corsOrigin,
  credentials: true,
});
fastify.register(helmet);
fastify.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
});
fastify.register(fastifyJwt, {
  secret: jwtSecret,
});

/* ---------------------------------- Hooks --------------------------------- */
fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (error) {
  reply.code(401).send({ message: 'Unauthorized' });
  }
});

fastify.setErrorHandler((error: FastifyError & { validation?: ValidationIssue[] }, request, reply) => {
  if (error.validation) {
    request.log.warn({ error }, 'Validation failed');
    return reply.code(400).send({
      message: 'Invalid request payload',
      code: 'validation',
      fieldErrors: buildFieldErrors(error.validation),
    });
  }

  if (error instanceof AuthServiceError) {
    return reply.code(error.statusCode).send({ message: error.message, code: error.code });
  }

  const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
  const message = statusCode >= 500 ? 'Internal server error' : error.message;

  request.log.error({ error }, 'Request failed');
  return reply.code(statusCode).send({ message });
});

/* --------------------------------- Routes --------------------------------- */
fastify.register(usersRoutes, { prefix: '/users' });
fastify.register(authRoutes, { prefix: '/auth' });


fastify.get('/', async (request, reply) => {
    return { "message" : "Hello world!" };
});

const start = async () => {
    try {
    await fastify.listen({ port: PORT as number, host: '0.0.0.0' });
    fastify.log.info('Server is running');
    } catch (error) {
        fastify.log.error(error);
        process.exit(1);
    }
};

start();