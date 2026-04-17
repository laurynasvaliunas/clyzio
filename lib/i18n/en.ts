/**
 * English catalog. Keys are the source of truth; every other locale must use
 * the same set (enforced by the `StringKey` type in `./index.ts`).
 */
export const en = {
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.confirm': 'Confirm',
  'common.back': 'Back',
  'common.done': 'Done',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.error': 'Something went wrong',

  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.appearance.light': 'Light',
  'settings.appearance.system': 'System',
  'settings.appearance.dark': 'Dark',
  'settings.notifications': 'Notifications',
  'settings.notifications.matches': 'Carpool match alerts',
  'settings.notifications.chat': 'Chat messages',
  'settings.notifications.weekly': 'Weekly sustainability digest',
  'settings.notifications.marketing': 'Tips & announcements',
  'settings.dangerZone': 'Danger Zone',
  'settings.deleteAccount': 'Delete Account',

  'rating.title': 'Rate your ride',
  'rating.subtitle': 'How was your experience with {name}?',
  'rating.tag.punctual': 'Punctual',
  'rating.tag.friendly': 'Friendly',
  'rating.tag.clean': 'Clean car',
  'rating.tag.safe': 'Safe driver',
  'rating.tag.smooth': 'Smooth ride',
  'rating.tag.chatty': 'Great conversation',
  'rating.comment.placeholder': 'Add a comment (optional)',
  'rating.submit': 'Submit rating',

  'sos.title': 'Emergency',
  'sos.subtitle': 'Tap Call to reach emergency services.',
  'sos.call': 'Call {number}',
  'sos.share': 'Share my live location',
  'sos.cancel': 'Cancel',
} as const;
