import { NextRequest, NextResponse } from "next/server";
import { readConfig } from "@/lib/config";
import { getSprintReviewData } from "@/lib/jira";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sprintId = searchParams.get("id");

  if (!sprintId) {
    return NextResponse.json(
      { success: false, error: "Missing sprint id" },
      { status: 400 }
    );
  }

  try {
    const config = readConfig();
    if (!config.jira.baseUrl || !config.jira.apiToken) {
      return NextResponse.json(
        { success: false, error: "Jira not configured. Please check Config page." },
        { status: 400 }
      );
    }

    // Pass "" as projectKeyOverride to fetch ALL tickets from the sprint.
    // Project filtering is handled client-side via the dropdown on the Sprint Review page.
    const data = await getSprintReviewData(config, sprintId, "");
    return NextResponse.json({ success: true, ...data, jiraBaseUrl: config.jira.baseUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status =
      msg.includes("401") ? 401 :
      msg.includes("404") ? 404 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
