import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { RawResponse } from "@/common/decorators/raw-response.decorator";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { HealthCheckService, ReadinessReport } from "./health-check.service";

/**
 * Platform health endpoints. These run WITHOUT tenant resolution
 * (see platformRoutes in GlobalModule) so load balancers and orchestrators
 * can probe them without sending tenant headers.
 *
 *   GET /health        liveness  — process is up; never touches dependencies
 *   GET /health/ready  readiness — Postgres and Redis reachable (503 if not)
 */
@ApiTags("Health")
@RawResponse()
@Controller("health")
export class HealthCheckController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get()
  @ApiOperation({ summary: "Liveness probe" })
  @ApiResponse({ status: 200, description: "Process is running" })
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe (database + Redis)" })
  @ApiResponse({ status: 200, description: "All dependencies reachable" })
  @ApiResponse({ status: 503, description: "One or more dependencies unreachable" })
  async readiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessReport> {
    const report = await this.healthCheckService.readiness();
    if (report.status !== "ok") {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
