import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const baseUrl = process.env.RESPONSIVE_BASE_URL ?? "http://localhost:3000";
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDirectory = resolve(".artifacts", "responsive");
const profileDirectory = await mkdtemp(
  join(tmpdir(), "real-estate-responsive-"),
);

const cases = [
  { name: "list-mobile", path: "/listings", width: 390, height: 2000 },
  {
    name: "detail-mobile",
    path: "/listings/60000000-0000-4000-8000-000000000001",
    width: 390,
    height: 2200,
  },
  { name: "list-tablet", path: "/listings", width: 768, height: 1800 },
  {
    name: "detail-tablet",
    path: "/listings/60000000-0000-4000-8000-000000000001",
    width: 768,
    height: 1800,
  },
  { name: "list-desktop", path: "/listings", width: 1440, height: 1400 },
  {
    name: "detail-desktop",
    path: "/listings/60000000-0000-4000-8000-000000000001",
    width: 1440,
    height: 1400,
  },
];

await mkdir(outputDirectory, { recursive: true });

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);
const chromeExited = new Promise((resolveExit) =>
  chrome.once("exit", resolveExit),
);

try {
  const port = await readDebuggingPort(profileDirectory);
  const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("Chrome page debugging target was not available");
  }

  const client = await createCdpClient(target.webSocketDebuggerUrl);
  try {
    await client.call("Page.enable");
    await client.call("Runtime.enable");

    const reports = [];
    for (const testCase of cases) {
      await client.call("Emulation.setDeviceMetricsOverride", {
        width: testCase.width,
        height: testCase.height,
        deviceScaleFactor: 1,
        mobile: testCase.width < 1024,
        screenWidth: testCase.width,
        screenHeight: testCase.height,
      });
      await client.call("Emulation.setTouchEmulationEnabled", {
        enabled: testCase.width < 1024,
        maxTouchPoints: 5,
      });
      await client.call("Page.navigate", {
        url: new URL(testCase.path, baseUrl).toString(),
      });
      await delay(3500);

      const audit = await client.call("Runtime.evaluate", {
        expression: `(() => {
          const viewportWidth = document.documentElement.clientWidth;
          const offenders = [...document.querySelectorAll("body *")]
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return {
                element,
                rect,
                visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0,
              };
            })
            .filter(
              ({ element, rect, visible }) =>
                visible &&
                !element.closest(".leaflet-tile-pane") &&
                (rect.left < -1 || rect.right > viewportWidth + 1),
            )
            .slice(0, 20)
            .map(({ element, rect }) => ({
              selector: element.id
                ? "#" + element.id
                : element.tagName.toLowerCase() +
                  (typeof element.className === "string" && element.className
                    ? "." + element.className.trim().split(/\\s+/).slice(0, 3).join(".")
                    : ""),
              left: Math.round(rect.left * 10) / 10,
              right: Math.round(rect.right * 10) / 10,
              width: Math.round(rect.width * 10) / 10,
            }));

          return {
            innerWidth: window.innerWidth,
            viewportWidth,
            bodyScrollWidth: document.body.scrollWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            horizontalOverflow:
              document.documentElement.scrollWidth > viewportWidth || document.body.scrollWidth > viewportWidth,
            offenders,
          };
        })()`,
        returnByValue: true,
      });
      const screenshot = await client.call("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
      });
      await writeFile(
        join(outputDirectory, `${testCase.name}.png`),
        Buffer.from(screenshot.data, "base64"),
      );

      reports.push({
        name: testCase.name,
        requestedViewport: `${testCase.width}x${testCase.height}`,
        ...audit.result.value,
      });
    }

    await writeFile(
      join(outputDirectory, "report.json"),
      `${JSON.stringify(reports, null, 2)}\n`,
      "utf8",
    );
    console.log(JSON.stringify(reports, null, 2));
  } finally {
    client.close();
  }
} finally {
  if (chrome.exitCode === null) chrome.kill();
  await Promise.race([chromeExited, delay(3000)]);
  await removeDirectoryWithRetry(profileDirectory);
}

async function readDebuggingPort(profilePath) {
  const filePath = join(profilePath, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = (await readFile(filePath, "utf8")).split(/\r?\n/);
      if (port) return Number(port);
    } catch {
      // Chrome creates the file shortly after the process starts.
    }
    await delay(50);
  }
  throw new Error("Chrome DevTools port was not created");
}

async function waitForJson(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // The debugging server may need another event-loop turn.
    }
    await delay(50);
  }
  throw new Error("Chrome DevTools target list was not available");
}

async function createCdpClient(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  return {
    call(method, params = {}) {
      const id = (nextId += 1);
      return new Promise((resolveCall, rejectCall) => {
        pending.set(id, { resolve: resolveCall, reject: rejectCall });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function removeDirectoryWithRetry(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error?.code !== "EBUSY" || attempt === 19) throw error;
      await delay(100);
    }
  }
}
