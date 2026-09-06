import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnvironmentFile(path) {
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      }),
  );
}

const workspace = process.cwd();
const fileEnvironment = readEnvironmentFile(resolve(workspace, ".env"));
const environment = { ...fileEnvironment, ...process.env };
const alertmanagerPath = resolve(
  workspace,
  "infrastructure",
  "alertmanager",
  "alertmanager.yml",
);
const alertmanager = readFileSync(alertmanagerPath, "utf8");

const geocodingApproved =
  environment.GEOCODING_DATA_SHARING_APPROVED === "true";
const geocodingUrl = environment.GEOCODING_BASE_URL?.trim();
let geocodingStatus = "disabled_pending_approval";
let geocodingUrlValid = null;

if (geocodingUrl) {
  try {
    new URL(geocodingUrl);
    geocodingUrlValid = true;
  } catch {
    geocodingUrlValid = false;
  }
}

if (geocodingApproved && geocodingUrl && geocodingUrlValid) {
  geocodingStatus = "ready_to_transmit_after_deployment";
} else if (geocodingApproved) {
  geocodingStatus = "approval_set_but_provider_not_ready";
} else if (geocodingUrl) {
  geocodingStatus = "provider_configured_but_blocked_without_approval";
}

const externalReceiverPattern =
  /^\s*(webhook_configs|email_configs|slack_configs|pagerduty_configs|opsgenie_configs|victorops_configs|wechat_configs|sns_configs|telegram_configs|msteams_configs|discord_configs):/m;
const hasExternalAlertReceiver = externalReceiverPattern.test(alertmanager);
const alertDeliveryApproved =
  environment.EXTERNAL_ALERT_DELIVERY_APPROVED === "true";
const alertDeliveryStatus = hasExternalAlertReceiver
  ? alertDeliveryApproved
    ? "external_receiver_configured_and_approved"
    : "external_receiver_present_without_approval"
  : "local_observer_only";

const safe =
  geocodingStatus !== "approval_set_but_provider_not_ready" &&
  alertDeliveryStatus !== "external_receiver_present_without_approval";
const transmissionEnabled =
  geocodingStatus === "ready_to_transmit_after_deployment" ||
  alertDeliveryStatus === "external_receiver_configured_and_approved";

const report = {
  status: safe ? "ok" : "needs_attention",
  externalDataTransmissionEnabled: transmissionEnabled,
  geocoding: {
    status: geocodingStatus,
    approval: geocodingApproved,
    providerConfigured: Boolean(geocodingUrl),
    providerUrlValid: geocodingUrlValid,
    transmittedFieldsWhenEnabled: ["roadAddress", "postalCode"],
  },
  alertDelivery: {
    status: alertDeliveryStatus,
    approval: alertDeliveryApproved,
    externalReceiverConfigured: hasExternalAlertReceiver,
    currentReceiver: hasExternalAlertReceiver ? "external" : "local-observer",
  },
  networkRequestsMadeByThisCheck: 0,
};

console.log(JSON.stringify(report, null, 2));
if (!safe) process.exitCode = 1;
