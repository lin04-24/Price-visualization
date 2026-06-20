import { NextResponse } from "next/server";

export function jsonResponse<T>(payload: T, status = 200) {
  return NextResponse.json(payload, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("请求体不是有效的 JSON");
  }
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ success: false, message }, status);
}
