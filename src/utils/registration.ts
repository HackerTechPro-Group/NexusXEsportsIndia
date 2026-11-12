import type { RegistrationButtonState, TournamentRecord } from '../types/data';
import { validateGoogleFormUrl } from './validation';

/**
 * Single source of truth for resolving Google Form registration CTA state.
 * Never returns an active clickable URL unless registration is open AND the URL
 * passes strict HTTPS Google Forms validation.
 */
export function getRegistrationButtonState(
  tournament: TournamentRecord
): RegistrationButtonState {
  if (tournament.status === 'cancelled') {
    return {
      isEnabled: false,
      label: 'Tournament Cancelled',
      helperText:
        tournament.registration.closingMessage?.trim() ||
        'This event has been cancelled by tournament administration.',
      href: null,
      reason: 'cancelled',
    };
  }

  if (tournament.registration.status === 'full') {
    return {
      isEnabled: false,
      label: 'Registration Full',
      helperText:
        tournament.registration.closingMessage?.trim() ||
        `${tournament.format} slots are completely filled.`,
      href: null,
      reason: 'full',
    };
  }

  if (
    tournament.status === 'archived' ||
    tournament.registration.status === 'closed' ||
    tournament.status === 'registration_closed' ||
    tournament.status === 'completed'
  ) {
    return {
      isEnabled: false,
      label: 'Registration Closed',
      helperText:
        tournament.registration.closingMessage?.trim() ||
        (tournament.status === 'archived'
          ? 'This tournament has been archived.'
          : `${tournament.format} registration is closed.`),
      href: null,
      reason: 'closed',
    };
  }

  const rawUrl = (tournament.registration.formUrl ?? '').trim();
  if (!rawUrl) {
    return {
      isEnabled: false,
      label: 'Registration Opening Soon',
      helperText: 'Official Google Form registration link will be published soon.',
      href: null,
      reason: 'missing_url',
    };
  }

  const urlCheck = validateGoogleFormUrl(rawUrl, false);
  if (!urlCheck.valid) {
    return {
      isEnabled: false,
      label: 'Registration Opening Soon',
      helperText: urlCheck.error || 'Official Google Form registration link will be published soon.',
      href: null,
      reason: 'invalid_url',
    };
  }

  return {
    isEnabled: true,
    label: tournament.registration.buttonText.trim() || 'Register Now',
    helperText: 'Redirects to the official registration Google Form in a new tab.',
    href: urlCheck.normalized,
    reason: 'ready',
  };
}
