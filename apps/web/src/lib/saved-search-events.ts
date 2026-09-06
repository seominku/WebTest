export const SAVED_SEARCH_NOTIFICATIONS_UPDATED =
  "saved-search-notifications-updated";

export function notifySavedSearchNotificationsUpdated() {
  window.dispatchEvent(new Event(SAVED_SEARCH_NOTIFICATIONS_UPDATED));
}
