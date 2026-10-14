import { NextRequest, NextResponse } from "next/server";
import { readConfig } from "@/lib/config";
import { getSprintReviewData } from "@/lib/jira";
import { humanizeError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sprintId = searchParams.get("id");

  if (!sprintId) {
    return NextResponse.json(
      { success: false, error: "Missing sprint ID. Enter a sprint ID in the input field." },
      { status: 400 }
    );
  }

  const config = readConfig();

  // Pre-flight: check config before making any network calls
  if (!config.jira.baseUrl) {
    return NextResponse.json(
      { success: false, error: "Jira Base URL is not configured. Go to the Config page and fill in your Jira settings." },
      { status: 400 }
    );
  }

  const hasCredentials = config.jira.isCloud
    ? config.jira.apiToken
    : config.jira.serverAuthMode === "pat"
    ? config.jira.apiToken
    : config.jira.username && config.jira.password;

  if (!hasCredentials) {
    return NextResponse.json(
      { success: false, error: "Jira credentials are not configured. Go to the Config page and fill in your API token or username/password." },
      { status: 400 }
    );
  }

  try {
    // Pass "" as projectKeyOverride to fetch ALL tickets from the sprint.
    // Project filtering is handled client-side via the dropdown on the Sprint Review page.
    const data = await getSprintReviewData(config, sprintId, "");
    return NextResponse.json({ success: true, ...data, jiraBaseUrl: config.jira.baseUrl });
  } catch (err: unknown) {
    const msg = humanizeError(err, "Jira");
    const httpStatus = (err as { response?: { status?: number } }).response?.status;
    const status = httpStatus === 401 ? 401 : httpStatus === 404 ? 404 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

