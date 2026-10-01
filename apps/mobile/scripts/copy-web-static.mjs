import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("public", ".well-known");
const destination = resolve("dist", ".well-known");

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });

console.log("Copied web association files to", destination);
