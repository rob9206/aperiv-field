const bufferedFiles = new Map();

const textFilePattern =
  /\.(?:c|cc|cpp|h|hpp|m|mm|podspec|rb|swift|json|plist|svg|xml)$/i;

function targetLineEnding(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/");

  if (normalizedPath === "eas.json") {
    return "\n";
  }

  if (
    normalizedPath === ".gitignore" ||
    (normalizedPath.startsWith("assets/expo.icon/") &&
      textFilePattern.test(normalizedPath)) ||
    (normalizedPath.startsWith("modules/") &&
      textFilePattern.test(normalizedPath))
  ) {
    return "\r\n";
  }

  return null;
}

/** @type {import("expo/fingerprint").Config} */
const config = {
  fileHookTransform(source, chunk, isEndOfFile, encoding) {
    if (source.type !== "file") {
      return chunk;
    }

    const lineEnding = targetLineEnding(source.filePath);
    if (lineEnding == null) {
      return chunk;
    }

    const previousChunks = bufferedFiles.get(source.filePath) ?? [];
    if (chunk != null) {
      previousChunks.push(
        typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk,
      );
      bufferedFiles.set(source.filePath, previousChunks);
    }

    if (!isEndOfFile) {
      return null;
    }

    bufferedFiles.delete(source.filePath);

    const normalizedContents = Buffer.concat(previousChunks)
      .toString("utf8")
      .replace(/\r\n?/g, "\n")
      .replace(/\n/g, lineEnding);

    return Buffer.from(normalizedContents, "utf8");
  },
};

module.exports = config;
