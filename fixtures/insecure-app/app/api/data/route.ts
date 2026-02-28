import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ data: [] });
}

export async function PUT(request: Request) {
  const body = await request.json();
  return NextResponse.json({ updated: true });
}
