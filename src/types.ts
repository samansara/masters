export interface Env {
  DB: D1Database;
  LIVE_UPDATES: DurableObjectNamespace;
  PAYOUT_QUEUE: Queue;
  GOLF_DATA_SOURCE: string;
}

export interface Tournament {
  id: number;
  year: number;
  name: string;
  total_pot: number;
  cut_line: number;
  status: 'upcoming' | 'active' | 'completed';
  current_round: number | null;
  round_state: string | null;       // 'pre' | 'in' | 'post'
  round_detail: string | null;      // e.g. "Round 2 - In Progress"
  espn_cut_score: number | null;
  espn_cut_count: number | null;
  created_at: string;
}

export interface AuctionPurchase {
  id: number;
  tournament_id: number;
  participant_name: string;
  golfer_name: string;
  purchase_price: number;
}

export interface GolferScore {
  id: number;
  tournament_id: number;
  player_id: string | null;
  name: string;
  is_amateur: number;
  r1_score: number | null;
  r2_score: number | null;
  r3_score: number | null;
  r4_score: number | null;
  total_score: number | null;
  to_par: number | null;
  position: string | null;
  made_cut: number | null;
  projected_cut: number | null;
  thru: string | null;
  status: string;
  updated_at: string;
}

export interface GolferStats {
  id: number;
  tournament_id: number;
  golfer_score_id: number;
  putting_avg: number | null;
  driving_distance: number | null;
  driving_accuracy: number | null;
  putts_per_round: number | null;
  gir_pct: number | null;
  updated_at: string;
}

export interface Payout {
  id: number;
  tournament_id: number;
  participant_name: string;
  payout_type: string;
  amount: number;
  golfer_name: string | null;
  description: string | null;
  is_final: number;
  updated_at: string;
}

export interface ParticipantSummary {
  name: string;
  total_spent: number;
  total_winnings: number;
  net: number;
  golfers: {
    name: string;
    price: number;
    position: string | null;
    to_par: number | null;
    made_cut: number | null;
    thru: string | null;
  }[];
  payouts: {
    type: string;
    amount: number;
    golfer: string | null;
    description: string | null;
  }[];
}

export interface LeaderboardEntry {
  position: string;
  name: string;
  to_par: number | null;
  thru: string | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  r4: number | null;
  total: number | null;
  is_amateur: boolean;
  made_cut: boolean | null;
  status: string;
  owner: string | null;
}

export interface PayoutQueueMessage {
  type: 'RECALCULATE_PAYOUTS';
  tournament_id: number;
}

export interface ESPNGolfResponse {
  events: {
    id: string;
    competitions: {
      competitors: ESPNCompetitor[];
    }[];
  }[];
}

export interface ESPNCompetitor {
  id: string;
  athlete: {
    displayName: string;
    amateur: boolean;
  };
  status: {
    position: { displayName: string };
    thru: number;
    displayValue: string;
  };
  score: { displayValue: string };
  linescores?: { value: number }[];
  statistics?: { name: string; displayValue: string }[];
}

export const SATURDAY_PAYOUTS = [0.05, 0.03, 0.02, 0.02, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01];
export const SUNDAY_PAYOUTS = [0.15, 0.075, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02, 0.01, 0.01];

export const PAYOUT_PERCENTAGES = {
  MAKING_CUT: 0.25,
  LOW_AM: 0.012,
  PRE_CUT_HIGH: 0.016,
  POST_CUT_RD_HIGH: 0.016,
  STAT_PUTTING: 0.012,
  STAT_DRIVING: 0.012,
  STAT_GIR: 0.012,
};
