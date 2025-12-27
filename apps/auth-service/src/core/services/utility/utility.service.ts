import { Injectable } from "@nestjs/common";
import { existsSync, mkdirSync, writeFileSync } from "fs";

@Injectable()
export class UtilityService {}

export function saveApiDoc(
  fileName: string,
  document: any,
  folderName: string,
) {
  const dir = `./api-management/${folderName}`;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(`${dir}/${fileName}.yaml`, JSON.stringify(document, null, 2));
}
