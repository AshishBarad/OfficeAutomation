import { NextRequest, NextResponse } from "next/server";
import { readConfig, getConfluenceAuthHeader } from "@/lib/config";
import { getSprintReviewData } from "@/lib/jira";
import { createSprintReviewPage, findExistingPage, updateSprintReviewPage } from "@/lib/confluence";
import { humanizeError } from "@/lib/api-error";
import axios from "axios";

export async function POST(req: NextRequest) {
  try {
    const { sprintId } = await req.json();
    if (!sprintId) {
      return NextResponse.json(
        { success: false, error: "Missing sprint ID. Fetch a sprint first before creating a Confluence page." },
        { status: 400 }
      );
    }

    const config = readConfig();

    if (!config.confluence.baseUrl) {
      return NextResponse.json(
        { success: false, error: "Confluence Base URL is not configured. Go to the Config page and fill in your Confluence settings." },
        { status: 400 }
      );
    }
    if (!config.confluence.spaceKey) {
      return NextResponse.json(
        { success: false, error: "Confluence Space Key is not configured. Go to the Config page and set your space key." },
        { status: 400 }
      );
    }
    const hasCredentials = config.jira.isCloud
      ? config.confluence.apiToken
      : config.jira.serverAuthMode === "pat"
      ? config.confluence.apiToken
      : config.confluence.username && config.confluence.password;
    if (!hasCredentials) {
      return NextResponse.json(
        { success: false, error: "Confluence credentials are not configured. Go to the Config page and fill in your API token or username/password." },
        { status: 400 }
      );
    }

    // Fetch all sprint data (epics, defects, capacity history, discovered field IDs)
    const { sprint, epics, noEpic, defects, capacityHistory, storyPointsFieldId } = await getSprintReviewData(config, sprintId);

    // Build title and check if page already exists
    const d = sprint.endDate ? new Date(sprint.endDate) : new Date();
    const endDate = `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
    const title = `${endDate} -> ${sprint.name} Review`;

    const existingId = await findExistingPage(config, title);
    const totalIssues = epics.reduce((s, e) => s + e.stories.reduce((ss, st) => ss + 1 + st.subIssues.length, 0) + e.orphanIssues.length, 0) + noEpic.length;

    if (existingId) {
      const confClient = axios.create({
        baseURL: config.confluence.baseUrl,
        headers: { Authorization: getConfluenceAuthHeader(config), Accept: "application/json" },
      });
      const { data: pageData } = await confClient.get(`/rest/api/content/${existingId}?expand=version`);
      const result = await updateSprintReviewPage(
        config, existingId, pageData.version.number,
        sprint, epics, noEpic, defects, capacityHistory, storyPointsFieldId
      );
      return NextResponse.json({
        success: true, url: result.url, updated: true, title,
        epicCount: epics.length, issueCount: totalIssues,
        defectCount: defects.length, sprintCount: capacityHistory.length,
      });
    }

    const result = await createSprintReviewPage(config, sprint, epics, noEpic, defects, capacityHistory, storyPointsFieldId);
    return NextResponse.json({
      success: true, url: result.url, updated: false, title: result.title,
      epicCount: epics.length, issueCount: totalIssues,
      defectCount: defects.length, sprintCount: capacityHistory.length,
    });
  } catch (err: unknown) {
    const msg = humanizeError(err, "Confluence");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
