import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

const userSchema = z.object({ name: z.string(), email: z.string().email() });

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ users: [] });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = userSchema.parse(await request.json());
  return NextResponse.json({ user: body });
}
