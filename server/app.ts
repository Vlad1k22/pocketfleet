import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  CommandRequestSchema,
  EnrollmentSchema,
  InventorySchema,
  PolicySchema,
  ResultSchema,
} from '../shared/contracts';
import { DomainError, Store, hash } from './store';

export async function buildApp(store: Store, adminToken: string) {
  if (adminToken.length < 32)
    throw new Error('Administrator token must contain at least 32 characters.');
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  await app.register(cors, {
    origin: /^http:\/\/(localhost|127\.0\.0\.1):(8081|8087|19006)$/,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });
  await app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });
  const bearer = (request: FastifyRequest) =>
    /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.authorization ?? '')?.[1] ?? '';
  const deviceId = (request: FastifyRequest) => {
    const id = store.authenticate(bearer(request));
    if (!id) throw new DomainError(401, 'Device session is invalid or revoked.');
    return id;
  };
  const admin = async (request: FastifyRequest) => {
    const actual = hash(request.headers.authorization ?? '');
    const expected = hash(`Bearer ${adminToken}`);
    if (!timingSafeEqual(Buffer.from(actual), Buffer.from(expected)))
      throw new DomainError(401, 'Administrator authentication required.');
  };
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({ error: 'Request validation failed.' });
    if (error instanceof DomainError)
      return reply.code(error.status).send({ error: error.message });
    const status =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    return reply
      .code(status)
      .send({ error: status < 500 ? 'Request rejected.' : 'Internal server error.' });
  });
  app.get('/health', async () => ({ name: 'PocketFleet lab API', version: '1.0.0' }));
  app.post(
    '/v1/enroll',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const input = EnrollmentSchema.parse(request.body);
      return store.enroll(input.code, input.name, input.inventory);
    },
  );
  app.post('/v1/device/check-in', async (request) =>
    store.checkIn(deviceId(request), InventorySchema.parse(request.body)),
  );
  app.post('/v1/device/commands/:id/result', async (request) => {
    const owner = deviceId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return store.complete(owner, id, ResultSchema.parse(request.body));
  });
  app.delete('/v1/device', async (request) => {
    store.revoke(deviceId(request));
    return { revoked: true };
  });
  app.register(
    async (api) => {
      api.addHook('preHandler', admin);
      api.post('/codes', async () => store.code());
      api.get('/devices', async () => store.devices());
      api.get('/policy', async () => store.policy());
      api.put('/policy', async (request) =>
        store.setPolicy(PolicySchema.omit({ revision: true }).parse(request.body)),
      );
      api.get('/devices/:id/commands', async (request) =>
        store.commands(z.object({ id: z.string().uuid() }).parse(request.params).id),
      );
      api.post('/devices/:id/commands', async (request) =>
        store.enqueue(
          z.object({ id: z.string().uuid() }).parse(request.params).id,
          CommandRequestSchema.parse(request.body),
        ),
      );
      api.delete('/devices/:id', async (request) => {
        store.revoke(z.object({ id: z.string().uuid() }).parse(request.params).id);
        return { revoked: true };
      });
    },
    { prefix: '/v1/admin' },
  );
  return app;
}
