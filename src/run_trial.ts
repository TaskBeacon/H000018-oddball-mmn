import {
  set_trial_context,
  type StimBank,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

function classifyOutcome(
  condition: string,
  responseKey: unknown,
  responseKeys: string[]
): {
  response_made: boolean;
  outcome: "hit" | "miss" | "false_alarm" | "correct_rejection";
  accuracy: boolean;
} {
  const responseMade = responseKeys.includes(String(responseKey ?? ""));
  const targetRequired = condition === "target";
  if (targetRequired && responseMade) {
    return { response_made: true, outcome: "hit", accuracy: true };
  }
  if (targetRequired && !responseMade) {
    return { response_made: false, outcome: "miss", accuracy: false };
  }
  if (!targetRequired && responseMade) {
    return { response_made: true, outcome: "false_alarm", accuracy: false };
  }
  return { response_made: false, outcome: "correct_rejection", accuracy: true };
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    block_id: string;
    block_idx: number;
  }
): TrialBuilder {
  const { settings, stimBank, block_id, block_idx } = context;
  const cond = String(condition);
  const keys = ((settings.key_list as string[] | undefined) ?? ["space"]).map(String);
  const expectedResponseRequired = cond === "target";
  const expectedResponseKey = expectedResponseRequired ? keys[0] : null;
  const scoreStep = Number(settings.delta ?? 1);
  const triggerMap = (settings.triggers ?? {}) as Record<string, unknown>;
  const trigger = (name: string): number | null => {
    const value = Number(triggerMap[name]);
    return Number.isFinite(value) ? value : null;
  };

  const fixationDuration = Number(settings.fixation_duration ?? 0.3);
  const stimulusDuration = Number(settings.stimulus_duration ?? 0.5);
  const itiDuration = Number(settings.iti_duration ?? 0.5);

  const fixation = trial.unit("fixation").addStim(stimBank.get("fixation"));
  set_trial_context(fixation, {
    trial_id: trial.trial_id,
    phase: "trial_fixation",
    deadline_s: fixationDuration,
    valid_keys: [],
    block_id,
    condition_id: cond,
    task_factors: {
      condition: cond,
      expected_response: expectedResponseKey,
      stage: "trial_fixation",
      block_idx
    },
    stim_id: "fixation"
  });
  fixation.show({ duration: fixationDuration, onset_trigger: trigger("fixation_onset") }).to_dict();

  const stimulus = trial.unit("stimulus").addStim(stimBank.get(`${cond}_stimulus`));
  set_trial_context(stimulus, {
    trial_id: trial.trial_id,
    phase: "oddball_response_window",
    deadline_s: stimulusDuration,
    valid_keys: [...keys],
    block_id,
    condition_id: cond,
    task_factors: {
      condition: cond,
      expected_response: expectedResponseKey,
      stage: "oddball_response_window",
      block_idx
    },
    stim_id: `${cond}_stimulus`
  });
  stimulus
    .captureResponse({
      keys: [...keys],
      correct_keys: expectedResponseRequired && expectedResponseKey ? [expectedResponseKey] : [],
      duration: stimulusDuration,
      onset_trigger: trigger(`${cond}_stimulus_onset`),
      response_trigger: trigger(`${cond}_key_press`),
      timeout_trigger: trigger(`${cond}_no_response`),
      terminate_on_response: true
    })
    .set_state({
      expected_response: expectedResponseKey,
      expected_response_required: expectedResponseRequired,
      response_made: (snapshot: TrialSnapshot) =>
        classifyOutcome(cond, snapshot.units.stimulus?.response, keys).response_made,
      response_key: stimulus.ref<string | null>("response"),
      outcome: (snapshot: TrialSnapshot) =>
        classifyOutcome(cond, snapshot.units.stimulus?.response, keys).outcome,
      accuracy: (snapshot: TrialSnapshot) =>
        classifyOutcome(cond, snapshot.units.stimulus?.response, keys).accuracy,
      score_delta: (snapshot: TrialSnapshot) =>
        classifyOutcome(cond, snapshot.units.stimulus?.response, keys).accuracy ? scoreStep : 0
    })
    .to_dict();

  const iti = trial.unit("iti").addStim(stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trial.trial_id,
    phase: "inter_trial_interval",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: cond,
    task_factors: {
      condition: cond,
      expected_response: expectedResponseKey,
      stage: "inter_trial_interval",
      block_idx
    },
    stim_id: "fixation"
  });
  iti.show({ duration: itiDuration, onset_trigger: trigger("iti_onset") }).to_dict();

  trial.finalize((snapshot, _runtime, helpers) => {
    helpers.setTrialState("expected_response", expectedResponseKey);
    helpers.setTrialState("response_key", snapshot.units.stimulus?.response_key ?? null);
    helpers.setTrialState("response_made", snapshot.units.stimulus?.response_made ?? false);
    helpers.setTrialState("outcome", snapshot.units.stimulus?.outcome ?? null);
    helpers.setTrialState("accuracy", snapshot.units.stimulus?.accuracy ?? false);
    helpers.setTrialState("score_delta", snapshot.units.stimulus?.score_delta ?? 0);
  });

  return trial;
}
