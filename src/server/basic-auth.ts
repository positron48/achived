export function isBasicAuthAuthorized(
  authHeader: string | null,
  expectedUser: string,
  expectedPassword: string,
): boolean {
  if (!authHeader?.startsWith("Basic ")) {
    return false;
  }

  const encoded = authHeader.slice("Basic ".length);
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex < 0) {
    return false;
  }

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return user === expectedUser && password === expectedPassword;
}
