import fs from "node:fs";
import vm from "node:vm";

export function loadLegacyFunction(filePath, functionName, context = {}) {
  const source = fs.readFileSync(filePath, "utf8");
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not find ${marker} in ${filePath}`);
  }

  const openBrace = source.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        const declaration = source.slice(start, index + 1);
        return vm.runInNewContext(`(${declaration})`, context);
      }
    }
  }

  throw new Error(`Could not extract ${functionName} from ${filePath}`);
}
