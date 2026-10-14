import { NextRequest, NextResponse } from "next/server";
import { readConfig, writeConfig, AlertRule } from "@/lib/config";
import { randomUUID } from "crypto";

// GET all alert rules
export async function GET() {
  const config = readConfig();
  return NextResponse.json({ success: true, rules: config.alerts.rules });
}

// POST to create a new rule
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config = readConfig();

    const newRule: AlertRule = {
      id: randomUUID(),
      name: body.name || "New Rule",
      issueTypes: body.issueTypes || [],
      assignees: body.assignees || [],
      teamsWebhookUrl: body.teamsWebhookUrl || "",
      enabled: body.enabled ?? true,
    };

    config.alerts.rules.push(newRule);
    writeConfig(config);

    return NextResponse.json({ success: true, rule: newRule });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to save alert rule: ${msg}` },
      { status: 500 }
    );
  }
}

// PUT to update an existing rule
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const config = readConfig();

    const idx = config.alerts.rules.findIndex((r) => r.id === body.id);
    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: `Alert rule not found (id: ${body.id}). It may have been deleted — refresh the page.` },
        { status: 404 }
      );
    }

    config.alerts.rules[idx] = { ...config.alerts.rules[idx], ...body };
    writeConfig(config);

    return NextResponse.json({
      success: true,
      rule: config.alerts.rules[idx],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to update alert rule: ${msg}` },
      { status: 500 }
    );
  }
}

// DELETE a rule
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing rule id — cannot delete." },
        { status: 400 }
      );
    }
    const config = readConfig();

    config.alerts.rules = config.alerts.rules.filter((r) => r.id !== id);
    writeConfig(config);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to delete alert rule: ${msg}` },
      { status: 500 }
    );
  }
}
