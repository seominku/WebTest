export const INQUIRY_NOTIFICATIONS_UPDATED =
  "real-estate:inquiry-notifications-updated";

export function notifyInquiryNotificationsUpdated() {
  window.dispatchEvent(new Event(INQUIRY_NOTIFICATIONS_UPDATED));
}
