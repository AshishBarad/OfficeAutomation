import { SteeringContent, StatusType } from './azure-ai';

function statusMacro(status: StatusType): string {
  const map: Record<StatusType, { color: string; title: string }> = {
    'on-track':      { color: 'Green',  title: 'ON TRACK' },
    'managed-risk':  { color: 'Yellow', title: 'MANAGED RISK' },
    'escalation':    { color: 'Red',    title: 'ESCALATION' },
    'planned':       { color: 'Blue',   title: 'PLANNED' },
  };
  const { color, title } = map[status] || { color: 'Grey', title: status.toUpperCase() };
  return `<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${color}</ac:parameter><ac:parameter ac:name="title">${title}</ac:parameter></ac:structured-macro>`;
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSteeringPageHTML(content: SteeringContent): string {
  // Legend
  const legend = `<p><strong>Legend:</strong><br/>
🟢 On Track<br/>🟡 Attention / Managed Risk<br/>🔴 Escalation Required<br/>🔵 Planned</p>`;

  // 1. Executive Summary
  const summaryRows = content.executiveSummary
    .map(
      (row) =>
        `<tr><td><strong>${esc(row.feature)}</strong>${
          row.description ? ` — ${esc(row.description)}` : ''
        }</td><td>${statusMacro(row.status)}</td></tr>`
    )
    .join('');
  const execSummary = `
<h2>1. Executive Summary</h2>
<p>${esc(content.summaryIntro)}</p>
<table data-layout="default">
  <tbody>
    <tr><th><strong>Feature</strong></th><th><strong>Status</strong></th></tr>
    ${summaryRows}
  </tbody>
</table>`;

  // 2. Epic Deep Dives
  const deepDives = content.epicDeepDives
    .map((dive, i) => {
      const progressRows = dive.sprintProgress
        .map(
          (sp) =>
            `<tr><td><strong>${esc(sp.sprintName)}</strong></td><td>${esc(sp.activities)}</td></tr>`
        )
        .join('');
      const challengeBullets = dive.challenges.map((c) => `<li>${esc(c)}</li>`).join('');
      return `
<h2>${i + 2}. ${esc(dive.epicName)} — Deep Dive</h2>
<p>${esc(dive.intro)}</p>
<h3>Progress by Sprint</h3>
<table data-layout="default">
  <tbody>
    <tr><th><strong>Sprint</strong></th><th><strong>Key Activities</strong></th></tr>
    ${progressRows}
  </tbody>
</table>
${
  challengeBullets
    ? `<p><strong>Observed Challenges / &quot;Hiccups&quot;</strong></p><ul>${challengeBullets}</ul>`
    : ''
}`;
    })
    .join('');

  // 3. Other Major Workstreams
  const workstreamSections = content.otherWorkstreams
    .map((ws, i) => {
      const bullets = ws.bullets.map((b) => `<li>${esc(b)}</li>`).join('');
      return `<h3>${content.epicDeepDives.length + 2}.${i + 1} ${esc(ws.title)}</h3><ul>${bullets}</ul>`;
    })
    .join('');
  const otherWorkstreams = `
<h2>${content.epicDeepDives.length + 2}. Other Major Workstreams</h2>
${workstreamSections}`;

  // 4. Collaboration
  const collabNum = content.epicDeepDives.length + 3;
  const collabBullets = content.collaborationBullets.map((b) => `<li>${esc(b)}</li>`).join('');
  const collaboration = `
<h2>${collabNum}. Collaboration with Stakeholders</h2>
<p>The team maintains the following recurring governance and coordination activities:</p>
<ul>${collabBullets}</ul>`;

  return `${legend}${execSummary}${deepDives}${otherWorkstreams}${collaboration}`;
}
