import React from 'react';
import { DivisionTournamentPage } from '../components/tournament/DivisionTournamentPage';

export const SquadTournamentPage: React.FC = () => (
  <DivisionTournamentPage
    division="Squad"
    preferredSlug="squad-tournament"
    alternateLink={{
      to: '/tournaments/solo',
      label: 'View Solo Tournament',
    }}
  />
);

