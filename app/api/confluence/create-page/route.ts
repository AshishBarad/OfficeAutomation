import { NextRequest, NextResponse } from "next/server";
import { readConfig, getConfluenceAuthHeader } from "@/lib/config";
import { getSprintReviewData } from "@/lib/jira";
import { createSprintReviewPage, findExistingPage, updateSprintReviewPage } from "@/lib/confluence";
import axios from "axios";

export async function POST(req: NextRequest) {
  try {
    const { sprintId } = await req.json();
    if (!sprintId) {
      return NextResponse.json({ success: false, error: "Missing sprintId" }, { status: 400 });
    }

    const config = readConfig();
    if (!config.confluence.baseUrl || (!config.confluence.apiToken && !config.confluence.password)) {
      return NextResponse.json(
        { success: false, error: "Confluence not configured. Please check Config page." },
        { status: 400 }
      );
    }

    // Fetch all sprint data (epics, defects, capacity history)
    const { sprint, epics, noEpic, defects, capacityHistory } = await getSprintReviewData(config, sprintId);

    // Build title and check if page already exists
    const d = sprint.endDate ? new Date(sprint.endDate) : new Date();
    const endDate = `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
    const title = `${endDate} -> ${sprint.name} Review`;

    const existingId = await findExistingPage(config, title);
    const totalIssues = epics.reduce((s, e) => s + e.issues.length, 0) + noEpic.length;

    if (existingId) {
      const confClient = axios.create({
        baseURL: config.confluence.baseUrl,
        headers: { Authorization: getConfluenceAuthHeader(config), Accept: "application/json" },
      });
      const { data: pageData } = await confClient.get(`/rest/api/content/${existingId}?expand=version`);
      const result = await updateSprintReviewPage(
        config, existingId, pageData.version.number,
        sprint, epics, noEpic, defects, capacityHistory
      );
      return NextResponse.json({
        success: true, url: result.url, updated: true, title,
        epicCount: epics.length, issueCount: totalIssues,
        defectCount: defects.length, sprintCount: capacityHistory.length,
      });
    }

    const result = await createSprintReviewPage(config, sprint, epics, noEpic, defects, capacityHistory);
    return NextResponse.json({
      success: true, url: result.url, updated: false, title: result.title,
      epicCount: epics.length, issueCount: totalIssues,
      defectCount: defects.length, sprintCount: capacityHistory.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
