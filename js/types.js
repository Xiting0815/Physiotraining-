// JSDoc typedefs – documentation only. Mirrors docs/SPEC.md §6 and §7.
// Import types with: /** @typedef {import('./types.js').Exercise} Exercise */

/** @typedef {'knee'|'archery'|'warmup'|'cooldown'} BlockId */
/** @typedef {'warmup'|'knee'|'archery'|'cooldown'} Section */
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
 * @property {number} rest       seconds between sets
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
 */

/** @typedef {{exerciseId: string, note?: string}} WorkoutItem */
/** @typedef {{id: 'knee'|'archery', title: string, items: WorkoutItem[]}} WorkoutBlock */

/**
 * @typedef {Object} Workout
 * @property {string} id
 * @property {string} name
 * @property {string} phaseId
 * @property {number} durationMin
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
 */

/**
 * @typedef {Object} PreCheck
 * @property {number} pain
 * @property {0|1|2} swelling
 * @property {{locking: boolean, givingWay: boolean}} mechanical
 * @property {boolean} nightPain
 * @property {boolean} swellingOver48h
 */

/** @typedef {{pain: number, swelling: 0|1|2, rpe: number|null, note: string}} PostCheck */

/**
 * @typedef {Object} NextDay
 * @property {number} pain
 * @property {0|1|2} swelling
 * @property {0|1|2} stiffness
 * @property {boolean} [nightPain]
 * @property {boolean} [locking]
 * @property {boolean} [givingWay]
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
