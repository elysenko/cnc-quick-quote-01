import { Injectable, Logger, OnModuleInit, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Connect eagerly so the first real request does not pay the handshake cost,
   * but never let a cold database abort bootstrap. Nest treats a throw here as
   * fatal and the process dies before the HTTP listener binds — which would
   * take down `/api/health` (liveness) too, turning a transient Postgres
   * restart into a crash-loop. PrismaClient reconnects lazily on the next
   * query, so degrading here is safe: liveness stays up and
   * `/api/health/deep` reports the database as unreachable until it returns.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(
        `Database unreachable at startup (${(error as Error).message}). ` +
          'Serving liveness; connections will be retried lazily per query.',
      );
    }
  }

  enableShutdownHooks(app: INestApplication): void {
    this.$on('beforeExit' as never, async () => {
      await app.close();
    });
  }
}
