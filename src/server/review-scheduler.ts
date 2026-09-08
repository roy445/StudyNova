import { fsrs, Rating, State, type Card } from "ts-fsrs";

export type ReviewRating = "again" | "hard" | "good" | "easy";

export type ReviewState = {
  state: string;
  dueAt: Date;
  lastReviewedAt: Date | null;
  stability: number;
  difficulty: number;
  retrievability: number;
  reps: number;
  lapses: number;
  lastRating: string;
};

const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: false,
  enable_short_term: true,
});

const ratingMap: Record<ReviewRating, Rating> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const stateMap: Record<string, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

function cardFromItem(item: ReviewState, now: Date): Card {
  return {
    due: item.dueAt,
    stability: Math.max(0, item.stability),
    difficulty: Math.max(0, item.difficulty),
    elapsed_days: item.lastReviewedAt ? Math.max(0, (now.getTime() - item.lastReviewedAt.getTime()) / 86_400_000) : 0,
    scheduled_days: item.lastReviewedAt ? Math.max(0, (item.dueAt.getTime() - item.lastReviewedAt.getTime()) / 86_400_000) : 0,
    learning_steps: 0,
    reps: Math.max(0, item.reps),
    lapses: Math.max(0, item.lapses),
    state: stateMap[item.state] ?? State.New,
    last_review: item.lastReviewedAt ?? undefined,
  };
}

export function scheduleReview(item: ReviewState, ratingName: ReviewRating, now = new Date()): ReviewState {
  const card = cardFromItem(item, now);
  const result = scheduler.next(card, now, ratingMap[ratingName] as 1 | 2 | 3 | 4);
  const next = result.card;
  return {
    state: State[next.state].toLowerCase(),
    dueAt: next.due,
    lastReviewedAt: now,
    stability: next.stability,
    difficulty: next.difficulty,
    retrievability: scheduler.get_retrievability(next, now, false),
    reps: next.reps,
    lapses: next.lapses,
    lastRating: ratingName,
  };
}

export function initialReviewState(now = new Date()): ReviewState {
  return {
    state: "new",
    dueAt: now,
    lastReviewedAt: null,
    stability: 0,
    difficulty: 0,
    retrievability: 0,
    reps: 0,
    lapses: 0,
    lastRating: "",
  };
}

export function ratingFromCorrect(correct: boolean, confidence?: number): ReviewRating {
  if (!correct) return "again";
  if (confidence !== undefined && confidence >= 90) return "easy";
  if (confidence !== undefined && confidence <= 50) return "hard";
  return "good";
}
