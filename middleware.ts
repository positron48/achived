import { NextResponse, type NextRequest } from "next/server";

import { isBasicAuthAuthorized } from "@/server/basic-auth";

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/api/health" ||
    request.nextUrl.pathname.startsWith("/api/auth") ||
    request.nextUrl.pathname.startsWith("/share/")
  ) {
    return NextResponse.next();
  }

  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  // Auth is optional for local development unless credentials are configured.
  if (!user || !password) {
    return NextResponse.next();
  }

  const authorized = isBasicAuthAuthorized(
    request.headers.get("authorization"),
    user,
    password,
  );

  if (authorized) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="GoalGraph", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png).*)",
  ],
};
