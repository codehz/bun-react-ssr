import { join, parse } from "node:path";

export function hashremap(input: string, hash: string) {
  const parsed = parse(input);
  return `${join(parsed.dir, parsed.name)}-${hash}${parsed.ext}`;
}

export function generateHashedName(name: string, hash: Record<string, string>) {
  return hash[name] ? hashremap(name, hash[name]) : name;
}
