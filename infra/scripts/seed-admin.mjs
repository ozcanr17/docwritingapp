const API = process.env.API_URL ?? "http://localhost:3001";
const APP = process.env.APP_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@docsys.local";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin1234!";
const NAME = process.env.ADMIN_NAME ?? "DocSys Admin";

async function call(path, options = {}, cookie) {
  const res = await fetch(API + path, {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...options,
  });
  const text = await res.text();
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: setCookie };
}

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(API + "/health/live");
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("API did not become ready at " + API);
}

async function requiredCall(path, options, cookie) {
  const response = await call(path, options, cookie);
  if (response.status < 200 || response.status >= 300) throw new Error("request failed: " + path + " " + response.status + " " + JSON.stringify(response.body));
  return response.body;
}

async function ensureDocument(cookie, workspaceId, documents, title, documentType) {
  const existing = documents.find((document) => document.title === title && document.documentType === documentType);
  if (existing) return existing;
  return requiredCall("/workspaces/" + workspaceId + "/documents", { method: "POST", body: JSON.stringify({ title, documentType, folderId: null }) }, cookie);
}

async function createRow(cookie, documentId, payload) {
  return requiredCall("/documents/" + documentId + "/rows", { method: "POST", body: JSON.stringify(payload) }, cookie);
}

async function updateTestStep(cookie, step, action, expectedResult) {
  return requiredCall("/rows/" + step.id, { method: "PATCH", body: JSON.stringify({ expectedVersion: step.version, testStepDetail: { action, expectedResult } }) }, cookie);
}

async function ensureDemoDataset(cookie, organizationId) {
  const workspaces = await requiredCall("/organizations/" + organizationId + "/workspaces", {}, cookie);
  const workspace = workspaces[0];
  if (!workspace) throw new Error("demo workspace not found");
  const tree = await requiredCall("/workspaces/" + workspace.id + "/tree", {}, cookie);
  const requirementDocument = await ensureDocument(cookie, workspace.id, tree.documents, "DocSys Demo - System Requirements", "requirement");
  const testDocument = await ensureDocument(cookie, workspace.id, tree.documents, "DocSys Demo - Verification Tests", "test");
  let requirementDocumentState = await requiredCall("/documents/" + requirementDocument.id, {}, cookie);
  if (requirementDocumentState.requirementPrefix !== "GER") {
    requirementDocumentState = await requiredCall("/documents/" + requirementDocument.id, { method: "PATCH", body: JSON.stringify({ expectedVersion: requirementDocumentState.version, requirementPrefix: "GER" }) }, cookie);
  }
  let requirementRows = await requiredCall("/documents/" + requirementDocument.id + "/outline", {}, cookie);
  let requirementHeading = requirementRows.find((row) => row.rowType === "heading" && row.title === "System Requirements");
  if (!requirementHeading) requirementHeading = await createRow(cookie, requirementDocument.id, { rowType: "heading", title: "System Requirements", parentId: null });
  const requirementStatements = [
    "The system shall authenticate authorized users before granting access.",
    "The system shall lock an account after five failed login attempts.",
    "The system shall record every successful and failed login attempt.",
    "The system shall terminate an inactive session after fifteen minutes.",
    "The system shall preserve requirement identifiers across hierarchy moves.",
    "The system shall prevent duplicate requirement identifiers in one document.",
    "The system shall retain requirement history after an approved change.",
    "The system shall show linked tests from the requirement detail view.",
    "The system shall create a baseline with a semantic version.",
    "The system shall identify rows changed after the latest baseline.",
    "The system shall allow more than one document to remain open.",
    "The system shall support side-by-side and stacked split views.",
    "The system shall preserve the focused document in split view.",
    "The system shall allow documents to move between folders.",
    "The system shall export a requirement document as DOCX.",
    "The system shall export traceability data as XLSX.",
    "The system shall import requirements from ReqIF.",
    "The system shall display suspect links after linked content changes.",
    "The system shall report requirements without a verification test.",
    "The system shall permit an authorized reviewer to record a decision."
  ];
  const existingRequirementTitles = new Set(requirementRows.filter((row) => row.rowType === "requirement").map((row) => row.title));
  for (const title of requirementStatements) {
    if (!existingRequirementTitles.has(title)) await createRow(cookie, requirementDocument.id, { rowType: "requirement", title, description: title, parentId: requirementHeading.id });
  }
  requirementRows = await requiredCall("/documents/" + requirementDocument.id + "/outline", {}, cookie);
  const requirements = requirementStatements.map((title) => requirementRows.find((row) => row.rowType === "requirement" && row.title === title));
  if (requirements.some((row) => !row)) throw new Error("demo requirements are incomplete");
  const tests = [
    { name: "Authentication and session verification", actions: ["Open the login page.", "Enter a valid user name and password.", "Submit five invalid passwords.", "Inspect the audit history.", "Leave the valid session idle for fifteen minutes."] },
    { name: "Requirement governance verification", actions: ["Move a requirement below another heading.", "Attempt to reuse an existing requirement number.", "Edit a requirement and save it.", "Open the linked tests from requirement detail.", "Create a new document baseline."] },
    { name: "Workspace authoring verification", actions: ["Open two documents from Explorer.", "Enable side-by-side split view.", "Change focus between both panes.", "Move a document into another folder.", "Export the requirement document as DOCX."] },
    { name: "Interoperability and traceability verification", actions: ["Export traceability data as XLSX.", "Import a valid ReqIF sample.", "Edit a requirement connected to a test.", "Open the coverage report.", "Open a review and record an approval."] }
  ];
  let testRows = await requiredCall("/documents/" + testDocument.id + "/outline", {}, cookie);
  for (let testIndex = 0; testIndex < tests.length; testIndex += 1) {
    const test = tests[testIndex];
    let root = testRows.find((row) => row.rowType === "heading" && row.title === test.name);
    if (!root) {
      const template = await requiredCall("/documents/" + testDocument.id + "/test-templates", { method: "POST", body: JSON.stringify({ name: test.name, parentId: null, sectionTitles: ["Preconditions", "Test Inputs", "Assumptions and Constraints", "Test Steps"], defaultContent: "None." }) }, cookie);
      root = template.root;
      testRows = await requiredCall("/documents/" + testDocument.id + "/outline", {}, cookie);
    }
    const stepSection = testRows.find((row) => row.parentId === root.id && row.rowType === "heading" && row.title === "Test Steps");
    if (!stepSection) throw new Error("demo test step section is missing");
    let steps = testRows.filter((row) => row.parentId === stepSection.id && row.rowType === "test_step");
    while (steps.length < 5) {
      const created = await createRow(cookie, testDocument.id, { rowType: "test_step", title: "", parentId: stepSection.id });
      steps.push(created);
    }
    for (let stepIndex = 0; stepIndex < 5; stepIndex += 1) {
      const step = steps[stepIndex];
      const action = test.actions[stepIndex];
      const expectedResult = "The behavior defined by " + requirements[testIndex * 5 + stepIndex].requirementNo + " is verified.";
      if (step.action !== action || step.expectedResult !== expectedResult) {
        const updated = await updateTestStep(cookie, step, action, expectedResult);
        steps[stepIndex] = { ...step, ...updated, action, expectedResult };
      }
      const detail = await requiredCall("/rows/" + step.id, {}, cookie);
      const linked = [...detail.outgoingLinks, ...detail.incomingLinks].some((link) => link.sourceRowId === requirements[testIndex * 5 + stepIndex].id || link.targetRowId === requirements[testIndex * 5 + stepIndex].id);
      if (!linked) await requiredCall("/rows/" + step.id + "/links", { method: "POST", body: JSON.stringify({ targetRowId: requirements[testIndex * 5 + stepIndex].id, linkType: "verifies" }) }, cookie);
    }
    testRows = await requiredCall("/documents/" + testDocument.id + "/outline", {}, cookie);
  }
}

async function main() {
  await waitForApi();

  let auth = await call("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, displayName: NAME, password: PASSWORD }),
  });
  if (auth.status === 409) {
    auth = await call("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
  }
  if (auth.status !== 201 || !auth.cookie) {
    throw new Error("auth failed: " + auth.status + " " + JSON.stringify(auth.body));
  }
  const cookie = auth.cookie.split(";")[0];

  const orgs = await call("/organizations", {}, cookie);
  let organizationId = Array.isArray(orgs.body) ? orgs.body[0]?.id : null;
  if (!organizationId) {
    const org = await call(
      "/organizations",
      { method: "POST", body: JSON.stringify({ name: "DocSys Demo", slug: "docsys-demo" }) },
      cookie,
    );
    organizationId = org.body.id;
    const workspace = await call(
      "/organizations/" + org.body.id + "/workspaces",
      { method: "POST", body: JSON.stringify({ name: "Ana Alan", slug: "main" }) },
      cookie,
    );
    await call(
      "/workspaces/" + workspace.body.id + "/documents",
      {
        method: "POST",
        body: JSON.stringify({ title: "Ornek Gereksinim Belgesi", documentType: "requirement", folderId: null }),
      },
      cookie,
    );
  }

  const demoUsers = [
    { email: "editor@docsys.local", displayName: "Cem Kaya", firstName: "Cem", lastName: "Kaya", jobTitle: "Requirements Engineer", department: "Systems Engineering", phone: "+90 555 100 00 01", roleKey: "editor" },
    { email: "reviewer@docsys.local", displayName: "Selin Demir", firstName: "Selin", lastName: "Demir", jobTitle: "Test Lead", department: "Verification and Validation", phone: "+90 555 100 00 02", roleKey: "reviewer" },
    { email: "viewer@docsys.local", displayName: "Mert Yilmaz", firstName: "Mert", lastName: "Yilmaz", jobTitle: "Project Observer", department: "Program Management", phone: "+90 555 100 00 03", roleKey: "viewer" },
  ];
  const demoPassword = process.env.DEMO_PASSWORD ?? "Test1234!";
  for (const demo of demoUsers) {
    let demoAuth = await call("/auth/register", { method: "POST", body: JSON.stringify({ email: demo.email, displayName: demo.displayName, password: demoPassword }) });
    if (demoAuth.status === 409) demoAuth = await call("/auth/login", { method: "POST", body: JSON.stringify({ identifier: demo.email, password: demoPassword }) });
    if (demoAuth.status !== 201 || !demoAuth.cookie) throw new Error("demo auth failed for " + demo.email);
    const demoCookie = demoAuth.cookie.split(";")[0];
    await call("/organizations/" + organizationId + "/members", { method: "POST", body: JSON.stringify({ userId: demoAuth.body.user.id, roleKey: demo.roleKey }) }, cookie);
    await call("/auth/me", { method: "PATCH", body: JSON.stringify({ email: demo.email, displayName: demo.displayName, firstName: demo.firstName, lastName: demo.lastName, jobTitle: demo.jobTitle, department: demo.department, phone: demo.phone, bio: "DocSys test account" }) }, demoCookie);
  }

  await ensureDemoDataset(cookie, organizationId);

  console.log("");
  console.log("========================================");
  console.log(" DocSys admin account is ready");
  console.log("========================================");
  console.log("  URL:      " + APP);
  console.log("  Email:    " + EMAIL);
  console.log("  Password: " + PASSWORD);
  console.log("  Demo users: editor, reviewer, viewer");
  console.log("  Demo password: " + demoPassword);
  console.log("========================================");
  console.log("");
}

main().catch((error) => {
  console.error("SEED_FAILED:", error.message);
  process.exit(1);
});
