import { Global, Module } from "@nestjs/common";
import { DomainEventsService } from "./domain-events.service";

/** Global so any module can inject DomainEventsService without importing. */
@Global()
@Module({
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
