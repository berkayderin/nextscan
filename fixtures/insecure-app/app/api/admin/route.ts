import { NextResponse } from "next/server";

const STRIPE_KEY = "sk_live_1234567890abcdefghij";

export async function GET() {
  return NextResponse.json({ users: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ created: true });
}

export async function DELETE() {
  return NextResponse.json({ deleted: true });
}
