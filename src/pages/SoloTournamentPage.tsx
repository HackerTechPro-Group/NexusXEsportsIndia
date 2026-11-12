import React from 'react';
import { DivisionTournamentPage } from '../components/tournament/DivisionTournamentPage';

export const SoloTournamentPage: React.FC = () => (
  <DivisionTournamentPage
    division="Solo"
    preferredSlug="solo-tournament"
    alternateLink={{
      to: '/tournaments/squad',
      label: 'View Squad Tournament',
    }}
  />
);

