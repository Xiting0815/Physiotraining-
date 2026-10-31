# Pose requests (WP-Content → WP-Figure)

Pose ids referenced by `data/exercises.json` → `figure.poses` that do not yet exist in `data/poses.json`.
Conventions per SPEC §6.4: side view faces right (+x); angles in degrees; floor at y = 185.
Prefixes: `stand-`/`sit-`/`lying-`/`prone-` = side view; `front-` = front view; `sidelying-` = side-lying (pick the view that reads best).
Band anchors are given in `figure.band` of the exercise; "door" = anchor at the door (knot behind the door on the hinge side).

Format: `- \`pose-id\` — description _(used by: exercise ids)_`

- `stand-arms-overhead` — side · standing upright, both arms straight overhead (shoulder ~175°, elbow 0°). _(used by: shoulder-circles)_
- `sit-round-back` — side · seated as sit-chair, back rounded/flexed: trunk ~+25° forward, head down, hands on thighs. _(used by: seated-spine-wave)_
- `sit-chest-open` — side · seated as sit-chair, chest lifted: trunk ~-5° (slightly back), shoulders pulled back (shoulder ~-10°, elbow ~30°). _(used by: seated-spine-wave)_
- `stand-arm-forward-bent` — side · split stance with soft knees (hipL ~10°, hipR ~-10°), right arm forward at shoulder height with elbow ~45° bent (shoulderR 85°), left arm relaxed. Band from right hand to anchor behind (back to door). _(used by: serratus-punch)_
- `stand-arm-forward-reach` — side · as stand-arm-forward-bent with right arm fully extended forward (shoulderR 90°, elbowR 0°), slight forward reach of trunk ~5°. _(used by: serratus-punch)_
- `sit-arms-overhead` — side · seated on chair, arms straight overhead slightly forward (shoulder ~165°, elbow ~10°). Band to top of door. _(used by: lat-pulldown)_
- `sit-pulldown-end` — side · seated, elbows pulled down to ribs (shoulder ~25°, elbow ~130°), chest up. _(used by: lat-pulldown)_
- `front-draw-expand` — front · as archery-full-draw with right elbow a little further back/around (elbow ~160°), shoulders slightly more open – the expansion/follow-through. _(used by: expansion-drill)_
- `sit-hamstring-stretch` — side · on front edge of chair, left leg straight forward with heel on floor (hipL ~70°, kneeL ~5°), right knee 90°, trunk hinged forward ~30° with straight back, hands on right thigh. _(used by: hamstring-stretch-seated)_
- `stand-calf-stretch` — side · facing wall (wall right), hands on wall at shoulder height, right leg forward with knee ~20°, left leg straight back (hipL ~-20°), trunk leaning forward ~15°. _(used by: calf-stretch-wall)_

Total: 10 missing poses.

## Adjustments requested for existing poses (knee safety rules)

Under load the knee must stay ≤ 60° flexion (later ≤ 90°). These existing poses show more than the exercise allows:

- `wall-sit-high` — knees 55°; wall-sit exercise is 30–45°. Please ~40° (hips ~40°). (`wall-sit` at 90° is not used and should not be.)
- `seated-ham-curl-end` — kneeL 110°; exercise range ends at ~60°. Please kneeL ~60°.
- `bridge-heel-chair-down`/`-up` — knees 71–75°; heel-on-chair bridge is done with knees only ~20–30° flexed (legs nearly straight, heels on the seat).
- `serratus-punch-start`/`-end` are supine (and identical); the exercise is standing with a band anchored behind → uses the new `stand-arm-forward-bent`/`-reach` instead.
- `lat-pulldown-start`/`-end` are standing; the exercise is seated on the chair → uses the new `sit-arms-overhead`/`sit-pulldown-end`.
