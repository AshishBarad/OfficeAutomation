import { NextRequest, NextResponse } from "next/server";
import { readConfig } from "@/lib/config";
import { getSprintReviewData } from "@/lib/jira";
import {
  createSprintReviewPage,
  findExistingPage,
  updateSprintReviewPage,
} from "@/lib/confluence";
import axios from "axios";

export async function POST(req: NextRequest) {
  try {
    const { sprintId } = await req.json();

    if (!sprintId) {
      return NextResponse.json(
        { success: false, error: "Missing sprintId" },
        { status: 400 }
      );
    }

    const config = readConfig();

    if (!config.confluence.baseUrl || !config.confluence.apiToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Confluence not configured. Please check Config page.",
        },
        { status: 400 }
      );
    }

    // 1. Fetch sprint data from Jira
    const { sprint, epics, noEpic } = await getSprintReviewData(
      config,
      sprintId
    );

    // 2. Build page title and check if it already exists
    const endDate = sprint.endDate
      ? new Date(sprint.endDate)
          .toLocaleDateString("en-GB")
          .split("/")
          .reverse()
          .join("-")
      : "";
    const title = `${endDate} -> ${sprint.name} Review`;
    const existingId = await findExistingPage(config, title);

    if (existingId) {
      // Fetch current version
      const confClient = axios.create({
        baseURL: config.confluence.baseUrl,
        headers: {
          Authorization:
            config.jira.isCloud
              ? `Basic ${Buffer.from(
                  `${config.confluence.email}:${config.confluence.apiToken}`
                ).toString("base64")}`
              : `Bearer ${config.confluence.apiToken}`,
          Accept: "application/json",
        },
      });
      const { data: pageData } = await confClient.get(
        `/rest/api/content/${existingId}?expand=version`
      );
      const result = await updateSprintReviewPage(
        config,
        existingId,
        pageData.version.number,
        sprint,
        epics,
        noEpic
      );
      return NextResponse.json({
        success: true,
        url: result.url,
        updated: true,
        title,
        epicCount: epics.length,
        issueCount: epics.reduce((s, e) => s + e.issues.length, 0) + noEpic.length,
      });
    }

    // 3. Create new page
    const result = await createSprintReviewPage(config, sprint, epics, noEpic);

    return NextResponse.json({
      success: true,
      url: result.url,
      updated: false,
      title: result.title,
      epicCount: epics.length,
      issueCount: epics.reduce((s, e) => s + e.issues.length, 0) + noEpic.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
