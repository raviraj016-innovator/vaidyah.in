/**
 * Apollo Server setup for the Vaidyah API Gateway.
 *
 * Mounts an Apollo Server 4 instance at /graphql on the existing Express app,
 * with WebSocket subscriptions via graphql-ws on the same HTTP server.
 *
 * In production, this local GraphQL layer is replaced by AWS AppSync
 * (see appsync-config.ts), but this implementation provides:
 *   - Feature parity for local/dev/staging environments
 *   - A reference implementation for resolver logic
 *   - WebSocket subscriptions for real-time data sync
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { Express } from 'express';
import http from 'http';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';

// ─── Context ─────────────────────────────────────────────────────────────────

export interface GraphQLContext {
  /** Authenticated user payload from JWT, if present */
  user?: {
    sub: string;
    email: string;
    name: string;
    role: string;
    facilityId?: string;
  };
  /** Unique request identifier for tracing */
  requestId?: string;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

/**
 * Initializes Apollo Server with WebSocket subscriptions and mounts it
 * on the Express application at `/graphql`.
 *
 * Must be called AFTER middleware setup but BEFORE the 404/error handlers
 * and BEFORE `server.listen()`.
 *
 * @param app - The Express application instance
 * @param httpServer - The HTTP server wrapping the Express app
 */
export async function setupGraphQL(
  app: Express,
  httpServer: http.Server,
): Promise<void> {
  // Build executable schema from SDL + resolvers
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // ── WebSocket server for subscriptions ──────────────────────────────────

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx: { connectionParams?: Record<string, unknown> }) => {
        // Extract auth token from connection params for subscription auth
        const connectionParams = ctx.connectionParams;
        const token = connectionParams?.authorization as string | undefined;

        // Require valid authentication for WebSocket subscriptions
        const jwt = await import('jsonwebtoken');
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

        if (!token) {
          throw new Error('Authentication required: provide authorization token in connection params');
        }

        try {
          const decoded = jwt.default.verify(
            token.replace(/^Bearer\s+/i, ''),
            jwtSecret,
          ) as Record<string, unknown>;

          return {
            user: {
              sub: decoded.sub as string,
              email: decoded.email as string,
              name: decoded.name as string,
              role: decoded.role as string,
              facilityId: decoded.facilityId as string | undefined,
            },
          } satisfies GraphQLContext;
        } catch (err) {
          console.warn('[GraphQL-WS] Invalid token in connection params:', (err as Error).message);
          throw new Error('Invalid or expired authentication token');
        }
      },
      onConnect: async (_ctx: unknown) => {
        console.log('[GraphQL-WS] Client connected');
        return true;
      },
      onDisconnect: () => {
        console.log('[GraphQL-WS] Client disconnected');
      },
    },
    wsServer,
  );

  // ── Apollo Server ─────────────────────────────────────────────────────────

  const server = new ApolloServer<GraphQLContext>({
    schema: schema as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- graphql version compat
    plugins: [
      // Graceful shutdown: drain HTTP connections
      ApolloServerPluginDrainHttpServer({ httpServer }),

      // Graceful shutdown: complete in-flight subscriptions
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],

    // Error formatting: redact internal details in production
    formatError: (formattedError, _error) => {
      const isProd = process.env.NODE_ENV === 'production';

      if (isProd) {
        // Never expose stack traces or internal error details
        return {
          message: formattedError.message,
          extensions: {
            code: formattedError.extensions?.code ?? 'INTERNAL_ERROR',
          },
        };
      }

      return formattedError;
    },

    introspection: process.env.NODE_ENV !== 'production',
  });

  await server.start();

  // Mount as Express middleware at /graphql
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Apollo v4 middleware type compatibility
  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Extract user from existing auth middleware (already parsed by upstream middleware)
        const authReq = req as unknown as Record<string, unknown>;
        const user = authReq.user as GraphQLContext['user'] | undefined;
        const requestId = (req.headers['x-request-id'] as string) ?? undefined;

        return { user, requestId } satisfies GraphQLContext;
      },
    }) as any,
  );

  console.log('[GraphQL] Apollo Server mounted at /graphql');
  console.log('[GraphQL] WebSocket subscriptions available at ws://localhost:<port>/graphql');
}
