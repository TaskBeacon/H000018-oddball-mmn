import type { ReducedTrialRow } from "psyflow-web";

export interface ConditionGenerationSettings {
  weights: number[] | null;
  order: "random" | "sequential";
  first_trial_label: string | null;
}

function makeSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeOrder(value: unknown): "random" | "sequential" {
  const order = String(value ?? "random").toLowerCase();
  return order === "sequential" ? "sequential" : "random";
}

function parseWeights(conditionLabels: string[], rawWeights: unknown): number[] | null {
  if (rawWeights == null) {
    return null;
  }
  if (Array.isArray(rawWeights) && rawWeights.length === conditionLabels.length) {
    return rawWeights.map((value) => Number(value));
  }
  if (typeof rawWeights === "object") {
    const map = rawWeights as Record<string, unknown>;
    return conditionLabels.map((label) => Number(map[label] ?? 1));
  }
  return null;
}

export function resolve_generation_settings(
  conditionLabels: string[],
  config: Record<string, unknown> | null | undefined
): ConditionGenerationSettings {
  const cfg = config ?? {};
  return {
    weights: parseWeights(conditionLabels, cfg.weights),
    order: normalizeOrder(cfg.order),
    first_trial_label: cfg.first_trial_label == null ? null : String(cfg.first_trial_label)
  };
}

function sampleCounts(
  nTrials: number,
  labels: string[],
  normalizedWeights: number[],
  rng: () => number
): number[] {
  const totalWeight = normalizedWeights.reduce((sum, value) => sum + value, 0);
  const counts = normalizedWeights.map((weight) => Math.floor((nTrials * weight) / totalWeight));
  let remainder = nTrials - counts.reduce((sum, value) => sum + value, 0);
  while (remainder > 0) {
    const sample = rng() * totalWeight;
    let cumulative = 0;
    let chosenIndex = labels.length - 1;
    for (let index = 0; index < labels.length; index += 1) {
      cumulative += normalizedWeights[index];
      if (sample <= cumulative) {
        chosenIndex = index;
        break;
      }
    }
    counts[chosenIndex] += 1;
    remainder -= 1;
  }
  return counts;
}

function stabilizeFirstTrialLabel(sequence: string[], label: string | null): string[] {
  if (!sequence.length || !label) {
    return sequence;
  }
  const idx = sequence.indexOf(label);
  if (idx > 0) {
    [sequence[0], sequence[idx]] = [sequence[idx], sequence[0]];
  }
  return sequence;
}

export function generate_oddball_conditions(
  n_trials: number,
  condition_labels: string[],
  generation_settings: ConditionGenerationSettings | undefined,
  seed: number
): string[] {
  const labels = condition_labels.length > 0 ? condition_labels.map(String) : ["standard", "deviant", "target"];
  const nTrials = Math.max(0, Math.trunc(n_trials));
  if (nTrials <= 0) {
    return [];
  }
  const settings = generation_settings ?? {
    weights: null,
    order: "random" as const,
    first_trial_label: null
  };
  const rng = makeSeededRandom(Math.trunc(seed));
  const weights = settings.weights ?? new Array(labels.length).fill(1);
  const normalizedWeights = weights.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });
  const counts = sampleCounts(nTrials, labels, normalizedWeights, rng);
  const sequence: string[] = [];
  labels.forEach((label, index) => {
    for (let i = 0; i < counts[index]; i += 1) {
      sequence.push(label);
    }
  });
  if (settings.order === "random") {
    for (let i = sequence.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }
  }
  return stabilizeFirstTrialLabel(sequence, settings.first_trial_label);
}

function computeMetrics(rows: ReducedTrialRow[]): {
  overall_accuracy: number;
  target_hit_rate: number;
  false_alarm_rate: number;
} {
  if (rows.length === 0) {
    return {
      overall_accuracy: 0,
      target_hit_rate: 0,
      false_alarm_rate: 0
    };
  }
  const overallAccuracy =
    rows.filter((row) => row.stimulus_accuracy === true).length / rows.length;
  const targetRows = rows.filter((row) => String(row.condition) === "target");
  const nonTargetRows = rows.filter((row) => String(row.condition) !== "target");
  const targetHitRate =
    targetRows.length === 0
      ? 0
      : targetRows.filter((row) => row.stimulus_outcome === "hit").length / targetRows.length;
  const falseAlarmRate =
    nonTargetRows.length === 0
      ? 0
      : nonTargetRows.filter((row) => row.stimulus_outcome === "false_alarm").length /
        nonTargetRows.length;
  return {
    overall_accuracy: overallAccuracy,
    target_hit_rate: targetHitRate,
    false_alarm_rate: falseAlarmRate
  };
}

export function summarizeBlock(
  rows: ReducedTrialRow[],
  blockId: string
): {
  overall_accuracy: number;
  target_hit_rate: number;
  false_alarm_rate: number;
} {
  return computeMetrics(rows.filter((row) => row.block_id === blockId));
}

export function summarizeOverall(rows: ReducedTrialRow[]): {
  overall_accuracy: number;
  target_hit_rate: number;
  false_alarm_rate: number;
} {
  return computeMetrics(rows);
}
