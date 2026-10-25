import "reflect-metadata";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "@repo/database";
(async () => {
  const ds = new DataSource({ ...buildDataSourceOptions(process.env), migrationsRun: false });
  await ds.initialize();
  const ran = await ds.runMigrations({ transaction: "each" });
  process.stdout.write(`migrations run: ${ran.length}\n`);
  await ds.destroy();
})().catch((e) => { process.stderr.write(String(e) + "\n"); process.exit(1); });
