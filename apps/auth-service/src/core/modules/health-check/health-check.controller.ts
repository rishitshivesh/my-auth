import { Controller, Get, Req, Res } from "@nestjs/common";
import { HealthCheckService } from "./health-check.service";
import { type Response, type Request } from "express";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("Health Check")
@Controller("/")
export class HealthCheckController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get("")
  async welcome(): Promise<Record<string, unknown>> {
    return this.healthCheckService.welcome();
  }

  @Get("/api/health-check")
  async serviceCheck() {
    return {
      message: "Health Check - All Services are up and running!",
      status: 200,
    };
  }

  @ApiOperation({ summary: "Returns Api docs Yaml" })
  @ApiResponse({ status: 200, description: "Returns API Docs Yaml." })
  @Get("api-docs.yaml")
  async getSwaggerYaml(@Req() req: Request, @Res() res: Response) {
    if (req.query["secret"] !== "DhaivatRocks") {
      return res.status(401).send("Unauthorized");
    }

    const data = await this.healthCheckService.getSwaggerYaml();
    res.setHeader("Content-Type", "application/x-yaml");
    res.send(data);
  }
}
