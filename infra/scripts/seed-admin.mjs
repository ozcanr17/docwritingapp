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
  if (Array.isArray(orgs.body) && orgs.body.length === 0) {
    const org = await call(
      "/organizations",
      { method: "POST", body: JSON.stringify({ name: "DocSys Demo", slug: "docsys-demo" }) },
      cookie,
    );
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

  console.log("");
  console.log("========================================");
  console.log(" DocSys admin account is ready");
  console.log("========================================");
  console.log("  URL:      " + APP);
  console.log("  Email:    " + EMAIL);
  console.log("  Password: " + PASSWORD);
  console.log("========================================");
  console.log("");
}

main().catch((error) => {
  console.error("SEED_FAILED:", error.message);
  process.exit(1);
});
