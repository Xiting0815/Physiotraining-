// JSDoc typedefs – documentation only. Mirrors docs/SPEC.md §6 and §7.
// Import types with: /** @typedef {import('./types.js').Exercise} Exercise */

/** @typedef {'knee'|'archery'|'warmup'|'cooldown'|'cardio'} BlockId */
/** @typedef {'warmup'|'knee'|'archery'|'cooldown'|'cardio'} Section */
/** @typedef {'strength'|'short'|'cardio'|'custom'} WorkoutKind */
/** @typedef {'green'|'yellow'|'red'|'stop'} Light */
/** @typedef {'yellow'|'red'|'green'|'blue'|'loop-orange'|'loop-blue'} BandId */

/**
 * @typedef {Object} Level
 * @property {string} label
 * @property {number} sets
 * @property {number} [reps]
 * @property {number} [hold]     seconds per rep (type "hold")
 * @property {number} [seconds]  continuous seconds (type "timed")
 * @property {string|null} [tempo] "ecc-pause-con", e.g. "3-1-1"
 * @property {BandId|null} [band]
 * @property {number} rest       seconds between sets (rowing intervals: easy rowing when restActive)
 * @property {'easy'|'moderate'|'vigorous'} [intensity]  v2 rowing
 * @property {{inhale: number, hold: number, exhale: number, rounds: number}} [breath] v4 breathing pattern (4-7-8)
 * @property {[number, number]} [targetSpm]  v2 rowing strokes/min range
 * @property {[number, number]} [targetRpe]  v2 rowing RPE range
 * @property {boolean} [restActive]          v2 rowing: rest = easy rowing
 * @property {{label: string, seconds: number, intensity?: string, say?: string}[]} [phases]  v2 rowing technique
 *   drills; v4 also timed flows (Kurztraining mobility/stretch rounds): Σ seconds = `seconds`, `say` = spoken text
 * @property {number} [restBetween]  pause between hold reps (v4: effective = max(restBetween ?? 5, settings.holdRelaxSeconds))
 */

/**
 * v4 spoken words of an exercise (SPEC §15.5). All optional; defaults by cue kind (cues.DEFAULT_CUE_WORDS).
 * `up` = first movement of a rep (figure start → end pose), `hold` = pause / isometric or stretch hold,
 * `down` = return movement, `release` = end of a hold, `switch` = change sides, `work` = start of a timed block.
 * @typedef {{up?: string, hold?: string, down?: string, release?: string, switch?: string, work?: string, inhale?: string, breathHold?: string, exhale?: string}} CueWords
 */

/**
 * v4 one step of a cue plan (cues.exerciseCuePlan). `say` is spoken at the start ('' = silent), then `seconds` pass
 * (0 = marker). `setIndex`/`repIndex` 0-based (null when not applicable), `side` 1|2 for perSide exercises.
 * @typedef {Object} CuePhase
 * @property {'prep'|'work'|'hold'|'relax'|'switch'|'rep-up'|'rep-hold'|'rep-down'|'inhale'|'breath-hold'|'exhale'|'rest'|'set-done'|'exercise-done'} phase
 * @property {number} seconds
 * @property {string} say
 * @property {number|null} setIndex
 * @property {number|null} repIndex
 * @property {1|2|null} side
 * @property {number} [sets]
 * @property {number} [reps]
 * @property {string} [label]       timed flows / rowing drills: display label
 * @property {'easy'|'moderate'|'vigorous'} [intensity]  rowing
 * @property {[number, number]|null} [targetSpm]         rowing
 * @property {[number, number]|null} [targetRpe]         rowing
 */

/**
 * @typedef {Object} FigureSpec
 * @property {string[]} poses
 * @property {Array<'chair'|'wall'|'door'|'mat'|'step'>} props
 * @property {{from: string, to: string|{x:number,y:number}}|null} band
 * @property {boolean} mirror
 */

/**
 * @typedef {Object} Exercise
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {BlockId} block
 * @property {string[]} equipment
 * @property {'reps'|'hold'|'timed'} type
 * @property {'both'|'left'|'right'|'alternate'|'perSide'} side
 * @property {string[]} instructions
 * @property {string[]} cues
 * @property {string[]} mistakes
 * @property {string} kneeNote
 * @property {Level[]} levels
 * @property {string|null} regressTo
 * @property {string|null} progressTo
 * @property {string} phaseMin
 * @property {FigureSpec} figure
 * @property {boolean} [postOpAllowed]  v2: false → hidden in post-op phases unless enabled via state.exerciseToggles
 * @property {string} [postOpNote]      v2: how to do it after surgery
 * @property {string} [description]
 * @property {string[]} [tags]
 * @property {number} [setupSec]         v4: setup seconds for the duration estimate (default 20; flows/stretches 5)
 * @property {CueWords} [cueWords]       v4: spoken words (SPEC §15.5)
 */

/** @typedef {{exerciseId: string, note?: string, maxSets?: number, keepWithRow?: boolean}} WorkoutItem  v4 keepWithRow: warm-up item stays after the rowing warm-up */
/** @typedef {{id: 'knee'|'archery'|'cardio', title: string, items: WorkoutItem[]}} WorkoutBlock */

/**
 * @typedef {Object} Workout
 * @property {string} id
 * @property {string} name
 * @property {string} phaseId
 * @property {number} durationMin   estimate at level 0 (duration.estimateWorkoutMinutes)
 * @property {WorkoutKind} [kind]   v2, default "strength"
 * @property {number} [maxSets]     v2 set cap per item (item.maxSets wins)
 * @property {number} [maxMinutes]  v2 time budget; buildSessionPlan trims sets to fit (not for cardio). v4: strength 32, short 16
 * @property {string} [rowWarmup]   v4 rowing exercise id of the optional rowing warm-up (strength p1–p3: "row-warmup-10")
 * @property {number} [maxMinutesWithRow] v4 budget with the rowing warm-up (42)
 * @property {number} [durationMinWithRow] v4 estimate at level 0 with the rowing warm-up
 * @property {string} [description]
 * @property {WorkoutItem[]} warmup
 * @property {WorkoutBlock[]} blocks
 * @property {WorkoutItem[]} cooldown
 */

/**
 * @typedef {Object} Phase
 * @property {string} id
 * @property {string} name
 * @property {number} order
 * @property {string} description
 * @property {string[]} exitCriteria
 * @property {{A: string, B: string, C: string}} workouts
 * @property {'prehab'|'postop'} [kind]  v2, default "prehab"
 * @property {number} [plannedWeeks]     v2 schedule recommendation
 * @property {string} [short]            v2 Kurztraining workout id
 * @property {string[]} [cardio]         v2 rowing workout ids (empty after surgery); v4 incl. `pN-row-long`
 * @property {string} [rowFinisher]      v4 rowing finisher exercise id (prehab only)
 * @property {string} [clearanceNote]    v2 postop
 * @property {string} [gaitNote]         v2 postop
 * @property {string} [redFlagNote]      v2 postop
 * @property {string} [endNote]          v2 postop
 */

/**
 * @typedef {Object} Pose
 * @property {'side'|'front'} view
 * @property {'standing'|'lying'|'sitting'} ground
 * @property {{x:number, y:number}} root  hip joint in 200×200 viewBox
 * @property {number} trunk
 * @property {number} hipL
 * @property {number} hipR
 * @property {number} kneeL
 * @property {number} kneeR
 * @property {number} shoulderL
 * @property {number} shoulderR
 * @property {number} elbowL
 * @property {number} elbowR
 */

/** @typedef {{version?: number, segments: Record<string, number>, poses: Record<string, Pose>}} PosesFile */

/**
 * @typedef {Object} Badge
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} icon
 * @property {{type: 'sessionsCount'|'weekSessions'|'totalHoldSeconds'|'phaseCompleted'|'greenWeek'|'personalRecord'|'comeback', n?: number}} rule
 */

/**
 * @typedef {Object} Content
 * @property {Exercise[]} exercises
 * @property {Workout[]} workouts
 * @property {Phase[]} phases   sorted by order
 * @property {PosesFile} poses
 * @property {Badge[]} badges
 * @property {any|null} equipment  raw equipment.json or null
 * @property {string[]} quotes      daily quotes from data/quotes.json ([] → built-in QUOTES)
 */

/** @typedef {{id: string, label: string, kind: 'theraband'|'loop', color: string}} Band */

/**
 * @typedef {Object} Settings
 * @property {string|null} surgeryDate  "YYYY-MM-DD"
 * @property {string} prehabStart       "YYYY-MM-DD"
 * @property {number} weeklyGoal
 * @property {{greenMax: number, yellowMax: number, greenStreakToProgress: number}} painThresholds
 * @property {Band[]} bands             weakest → strongest
 * @property {'system'|'light'|'dark'} theme
 * @property {boolean} sound
 * @property {boolean} vibration
 * @property {'left'|'right'} operatedSide
 * @property {number|null} restDefault  rest between sets in seconds; null → level.rest
 * @property {number} fontScale         1 | 1.125 | 1.25 (applied to <html> font-size)
 * @property {string[]} ownedEquipment  equipment ids the user owns (Ausrüstung)
 * @property {string|null} lastBackupAt ISO timestamp of the last JSON export
 * @property {number} cardioGoalPerWeek   v2 separate rowing sessions per week (default 3)
 * @property {number} prepSeconds         v4 „Bereit machen“ seconds before every set (default 5)
 * @property {number} holdRelaxSeconds    v4 minimum „Loslassen“ seconds between hold reps (default 5)
 * @property {boolean} rowWarmupDefault   v4 strength sessions p1–p3 start with 10 min rowing (default true)
 * @property {boolean} rowFinisherDefault v4 add the optional rowing finisher to strength plans (default false)
 * @property {boolean} voiceEnabled       v4 German speech cues (default true; `sound: false` silences all)
 * @property {number} voiceRate           v4 speech rate (default 1.05)
 * @property {number} voiceVolume         v4 speech volume 0–1 (default 1)
 * @property {boolean} beepsWithVoice     v4 soft tick under the voice on phase changes (default true)
 * @property {string} surgeryDateSuggested v2 pre-fill value ("2027-01-05"), never auto-applied
 * @property {Profile} profile            v2; v3.1: only weightKg is used (kcal estimate per session)
 * @property {any} [weightGoal]           legacy (v2/v3 weight goal) – unused since v3.1, kept untouched
 */

/**
 * v3.1 (SPEC §14): `weightKg` feeds the kcal estimate. Legacy keys of v2/v3 (heightCm, birthYear, sex,
 * activityLevel) may still be present in stored data and are ignored.
 * @typedef {{weightKg: number|null}} Profile
 */
/** @typedef {{durationSec?: number, distanceM?: number, avgSpm?: number, avgWatt?: number, kcalDisplay?: number, avgHr?: number, maxHr?: number}} RowingLog */
/**
 * @typedef {Object} CustomWorkout
 * @property {string} id  "cw-…"
 * @property {string} name
 * @property {'custom'} kind
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {WorkoutItem[]} warmup
 * @property {{id: 'knee'|'archery', title: string, items: WorkoutItem[]}[]} blocks
 * @property {WorkoutItem[]} cooldown
 */

/** @typedef {{done: boolean, reps?: number|null, hold?: number|null, seconds?: number|null, band?: string|null, at: string}} SetLog */

/**
 * @typedef {Object} SessionExercise
 * @property {string} exerciseId
 * @property {Section} section
 * @property {number} level
 * @property {number|null} painDuring
 * @property {boolean} sharpPain
 * @property {number|null} rpe
 * @property {boolean} skipped
 * @property {SetLog[]} sets
 * @property {string} [note]
 * @property {number} [plannedSets]
 * @property {boolean} [trimmed]
 * @property {boolean} [finisher]  v4 rowing finisher entry (section "cardio")
 */

/**
 * @typedef {Object} PreCheck
 * @property {number} pain
 * @property {0|1|2} swelling
 * @property {{locking: boolean, givingWay: boolean}} mechanical
 * @property {boolean} nightPain
 * @property {boolean} swellingOver48h
 * @property {boolean} [redness]  v2 post-op red flag (Rötung/Überwärmung)
 * @property {boolean} [fever]    v2 post-op red flag
 */

/** @typedef {{pain: number, swelling: 0|1|2, rpe: number|null, note: string, redness?: boolean, fever?: boolean}} PostCheck */

/**
 * @typedef {Object} NextDay
 * @property {number} pain
 * @property {0|1|2} swelling
 * @property {0|1|2} stiffness
 * @property {boolean} [nightPain]
 * @property {boolean} [locking]
 * @property {boolean} [givingWay]
 * @property {boolean} [redness]  v2 post-op
 * @property {boolean} [fever]    v2 post-op
 * @property {string} [at]
 */

/**
 * @typedef {Object} Recommendation
 * @property {string|null} exerciseId
 * @property {'progress'|'hold'|'regress'|'reduce'|'consult'} action
 * @property {number|null} fromLevel
 * @property {number|null} toLevel
 * @property {string|null} [toExerciseId]
 * @property {string} reason
 * @property {'pending'|'accepted'|'dismissed'} status
 */

/** @typedef {{light: Light|null}} _unused */

/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {string} workoutId
 * @property {string} phaseId
 * @property {'active'|'done'|'aborted'} status
 * @property {string} startedAt
 * @property {string|null} endedAt
 * @property {boolean} taper
 * @property {PreCheck|null} pre
 * @property {SessionExercise[]} exercises
 * @property {PostCheck|null} post
 * @property {NextDay|null} nextDay
 * @property {{provisional: Light|null, final: Light|null, reasons: string[]}} traffic
 * @property {Recommendation[]} recommendations
 * @property {number} [xpEarned]
 * @property {{points: number, max: number}} [score]
 * @property {{index: number, set: number, step: 'pre'|'exercise'|'post'|'summary'}} [cursor]  active only
 * @property {WorkoutKind} [kind]     v2 (missing = strength)
 * @property {RowingLog|null} [rowing] v2 cardio sessions: display values
 * @property {boolean} [postOp]       v2 session in a post-op phase (stricter traffic light)
 * @property {{kcal: number, method: string}} [energy] v2 optional stored estimate
 * @property {boolean} [rowWarmup]    v4 strength/short/custom plans: the plan starts with the rowing warm-up
 * @property {RowingLog|null} [warmupRowing] v4 display values of the rowing warm-up (strength sessions only)
 * @property {boolean} [rowFinisher]  v4 the plan contains the rowing finisher (entry `finisher: true`)
 * @property {RowingLog|null} [finisherRowing] v4 display values of the rowing finisher
 * @property {number} [budgetMin]     v4 time budget the plan was fitted to (32 / 42 with rowing / 16 short / 30 custom)
 */

/**
 * @typedef {Object} State
 * @property {string} phaseId
 * @property {string} nextWorkoutId
 * @property {Record<string, number>} exerciseLevels  0-based
 * @property {Record<string, number[]>} exitCriteriaDone
 * @property {Session|null} activeSession
 * @property {number} xp
 * @property {Record<string, string>} badges  id → ISO earned at
 * @property {{longestHold: any, mostReps: any, strongestBand: any}} records
 * @property {{phaseId: string, startedAt: string}[]} phaseHistory
 * @property {string|null} lastSeenQuoteDay
 * @property {boolean} welcomeDone      first-run welcome card on Heute hidden by the user
 * @property {boolean} bandsConfirmed   band order confirmed in the welcome card
 * @property {CustomWorkout[]} customWorkouts v2
 * @property {any[]} [healthLog]             legacy v2/v3 diary – unused since v3.1, kept untouched (and in backups)
 * @property {Record<string, boolean>} exerciseToggles v2 false = disabled, true = enabled despite postOpAllowed=false
 * @property {{confirmedAt: string, note: string}|null} postOpClearance    v2
 * @property {{confirmedAt: string, note: string}|null} postOpEndClearance v2
 */

/**
 * @typedef {Object} Data
 * @property {number} schemaVersion
 * @property {Settings} settings
 * @property {State} state
 * @property {Session[]} sessions  oldest first
 */

/**
 * @typedef {Object} Route
 * @property {string} pattern
 * @property {string} view
 * @property {string|null} tab
 * @property {string} title
 * @property {boolean} [hideTabs]
 */

/**
 * @typedef {Object} ViewContext
 * @property {Record<string,string>} params
 * @property {Record<string,string>} query
 * @property {typeof import('./store.js')} store
 * @property {Content} content
 * @property {(path: string) => void} navigate
 */

export {};
