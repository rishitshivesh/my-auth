import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { RedisService } from "@/common/service/redis.service";

export type DependencyStatus = "up" | "down";

export interface ReadinessReport {
  status: "ok" | "degraded";
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
  uptimeSeconds: number;
}

/** Upper bound for a single dependency probe so a hung dependency cannot hang the probe. */
const PROBE_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

@Injectable()
export class HealthCheckService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([
      this.probe(() => this.dataSource.query("SELECT 1")),
      this.probe(() => this.redisService.getClient().ping()),
    ]);

    return {
      status: database === "up" && redis === "up" ? "ok" : "degraded",
      checks: { database, redis },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async probe(fn: () => Promise<unknown>): Promise<DependencyStatus> {
    try {
      await withTimeout(fn(), PROBE_TIMEOUT_MS);
      return "up";
    } catch {
      return "down";
    }
  }
}
