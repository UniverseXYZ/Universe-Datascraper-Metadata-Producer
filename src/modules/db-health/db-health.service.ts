import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class DbHealthService extends HealthIndicator {
  private readonly logger = new Logger(DbHealthService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      const db = this.connection.db;
      const { ok } = await db.command({ ping: 1 });
      if (ok) {
        return this.getStatus(key, true, { message: 'DB is healthy' });
      }
      this.logger.error('DB is not healthy');
      return this.getStatus(key, false, { message: 'DB is not healthy' });
    } catch (error) {
      this.logger.error('DB is not healthy');
      this.logger.error(error.message);
      return this.getStatus(key, false, { message: error.message });
    }
  }
}
