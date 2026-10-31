import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import { Readable } from 'stream';
import { env } from '../config/env';

@Injectable()
export class StorageService implements OnModuleInit {
  private logger = new Logger('Storage');
  private client = new Client({ endPoint: env.minio.endPoint, port: env.minio.port, useSSL: env.minio.useSSL, accessKey: env.minio.accessKey, secretKey: env.minio.secretKey });
  private ready = false;

  async onModuleInit() { this.ensureBucket().catch((e) => this.logger.warn(`MinIO not ready yet: ${e.message}`)); }

  private async ensureBucket() {
    for (let i = 0; i < 10 && !this.ready; i++) {
      try {
        if (!(await this.client.bucketExists(env.minio.bucket))) await this.client.makeBucket(env.minio.bucket);
        this.ready = true;
      } catch (e) {
        if (i === 9) throw e;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  async put(key: string, data: Buffer, mime: string) {
    if (!this.ready) await this.ensureBucket();
    await this.client.putObject(env.minio.bucket, key, data, data.length, { 'Content-Type': mime });
  }
  async get(key: string): Promise<Readable> { return this.client.getObject(env.minio.bucket, key); }
  async remove(key: string) { await this.client.removeObject(env.minio.bucket, key); }
}
