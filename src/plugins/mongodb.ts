import type { FastifyPluginAsync } from 'fastify';
import mongodb from '@fastify/mongodb';
import fp from 'fastify-plugin';

const mongodbPlugin: FastifyPluginAsync = async (fastify) => {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        throw new Error('MONGODB_URI is required');
    }

    fastify.register(mongodb, {
        url: mongoUri,
        forceClose: true,
    });
};

export default fp(mongodbPlugin);
