import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve(process.cwd(), "../contracts/plutus.json");
const destination = resolve(process.cwd(), "public/contracts/plutus.json");
const blueprint = readFileSync(source);

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);

const digest = createHash("sha256").update(blueprint).digest("hex");
console.log(`Synced ${destination} (${digest})`);
