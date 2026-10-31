# Pose requests (WP-Content → WP-Figure)

Pose ids referenced by `data/exercises.json` → `figure.poses` that do not yet exist in `data/poses.json`.
Conventions per SPEC §6.4: side view faces right (+x); angles in degrees; floor at y = 185.
Prefixes: `stand-`/`sit-`/`lying-`/`prone-` = side view; `front-` = front view; `sidelying-` = side-lying (pick the view that reads best).
Band anchors are given in `figure.band` of the exercise; "door" = anchor at the door (knot behind the door on the hinge side).

Format: `- \`pose-id\` — description _(used by: exercise ids)_`

- `sit-high-hang` — side · sitting on a high edge (table/chair with cushion), thighs horizontal (hip 90°), shins hanging free: knee 90° both, trunk upright, hands on seat beside hips (shoulder ~10°, elbow 0°); feet do not touch floor. _(used by: knee-pendulum)_
- `sit-high-swing` — side · same as sit-high-hang, but left shin swung forward: kneeL ~35°, right knee 90°. _(used by: knee-pendulum)_
- `stand-arms-forward` — side · standing upright, both arms straight forward at shoulder height (shoulder 90°, elbow 0°). _(used by: shoulder-circles)_
- `stand-arms-overhead` — side · standing upright, both arms straight overhead (shoulder ~175°, elbow 0°). _(used by: shoulder-circles)_
- `sit-chair` — side · sitting upright on normal chair, hips 90°, knees 90° (feet flat), arms resting on thighs (shoulder ~20°, elbow ~60°). Prop chair. _(used by: seated-spine-wave, seated-knee-extension)_
- `sit-round-back` — side · seated as sit-chair, back rounded/flexed: trunk ~+25° forward, head down, hands on thighs. _(used by: seated-spine-wave)_
- `sit-chest-open` — side · seated as sit-chair, chest lifted: trunk ~-5° (slightly back), shoulders pulled back (shoulder ~-10°, elbow ~30°). _(used by: seated-spine-wave)_
- `front-sit-arms-crossed` — front · sitting on chair (hips/knees 90° not visible in front view; ground sitting), arms crossed on chest (shoulder ~20°, elbow ~130°). _(used by: seated-thoracic-rotation)_
- `front-sit-rotate` — front · as front-sit-arms-crossed with upper body rotated right (approximate: shoulders asymmetric, e.g. shoulderL 35°, shoulderR 5°, trunk slight lean 5°). _(used by: seated-thoracic-rotation)_
- `stand-tke-bent` — side · standing facing right toward door, left knee flexed ~25° (hipL ~12° forward), right leg straight, arms relaxed. Band from back of left knee to door (anchor at knee height, in front). _(used by: tke)_
- `stand-tke-straight` — side · as stand-tke-bent but left knee fully straight (kneeL 0°, hipL 0°). _(used by: tke)_
- `stand-wall-upright` — side · standing with back against wall (wall on the left/behind), feet ~2 foot-lengths in front of wall (hips/knees ~10° flex), arms hanging. _(used by: wall-sit)_
- `stand-wall-sit` — side · back against wall, slid down to ~40° knee flexion (hip ~40° forward, knee ~40°), trunk upright against wall, arms crossed or hanging. Prop wall behind. _(used by: wall-sit)_
- `sit-chair-high` — side · sitting on raised chair (cushion), knees ~65° flexed, hips ~75°, trunk leaning forward ~30° ready to stand, arms straight forward (shoulder ~80°). _(used by: sit-to-stand)_
- `stand-from-chair-mid` — side · halfway up from chair: hips ~45° flexion, knees ~40°, trunk forward ~35°, arms forward (shoulder ~80°). Chair behind. _(used by: sit-to-stand)_
- `stand-mini-squat` — side · mini squat: hips ~45°, knees ~50°, trunk forward ~25°, arms forward (shoulder 90°). Loop above knees; chair in front as support. _(used by: mini-squat)_
- `stand-step-left-up` — side · facing right, left foot on step in front (hipL ~40° forward, kneeL ~50°), right leg straight on floor behind (hipR ~-10°), trunk forward ~10°. Prop step. _(used by: step-up)_
- `stand-step-top` — side · standing on step on straight left leg, right leg lifted slightly behind/beside (hipR ~5°, kneeR ~30°), trunk upright. Prop step. _(used by: step-up)_
- `sit-knee-ext` — side · seated on chair as sit-chair, left knee extended to ~10° flexion (shin almost horizontal forward), right knee 90°. Band from left ankle to rear chair leg. _(used by: seated-knee-extension)_
- `front-step-single` — front · standing on step on left leg (straight), right leg hanging beside the step (hipR ~5° abduction, kneeR ~10°), arms slightly abducted for balance. Prop step. _(used by: lateral-step-down)_
- `front-step-down` — front · as front-step-single but left knee flexed ~40° so right heel reaches toward floor (right leg straight, hipR ~5°); trunk upright; approximate the flexion in front view (shorten left leg / lower root). _(used by: lateral-step-down)_
- `lying-bridge-down` — side · supine (head left), knees bent ~80°, hips ~135° (feet flat, rather far from buttocks), arms along body. Loop above knees. _(used by: glute-bridge)_
- `lying-bridge-up` — side · bridge top: pelvis lifted so shoulders–hip–knee form a straight line (trunk ~-70°, hip ~110–120°, knee ~80–90°), feet flat, arms on floor. _(used by: glute-bridge)_
- `sidelying-clam-closed` — side-lying on right side (show as front-ish view or side view lying), hips ~45° flexed, knees ~90°, knees together; head on lower arm. Loop above knees. _(used by: clamshell)_
- `sidelying-clam-open` — as sidelying-clam-closed with top (left) knee opened ~35° upward, heels together. _(used by: clamshell)_
- `sidelying-abd-down` — side-lying on right side, lower leg slightly bent, top (left) leg straight in line with body, resting; head on arm. _(used by: side-lying-hip-abduction)_
- `sidelying-abd-up` — as sidelying-abd-down with top (left) leg raised ~30° (abduction), knee straight. _(used by: side-lying-hip-abduction)_
- `front-stand-soft` — front · standing feet hip-width (hips ~6° abduction), knees softly bent ~15°, arms hanging slightly away from body. _(used by: lateral-band-walk, standing-hip-abduction)_
- `front-band-walk-wide` — front · as front-stand-soft but right leg stepped out (hipR ~20° abduction), knees ~15° flexed. Loop above knees. _(used by: lateral-band-walk)_
- `front-hip-abd-right` — front · standing on left leg (soft knee ~5°), right leg straight abducted ~25°, left hand on chair to the side. Band from right ankle to door (low anchor). _(used by: standing-hip-abduction)_
- `stand-hold-chair` — side · standing upright facing right, hands resting on chair back in front (shoulder ~40°, elbow ~30°). Prop chair. _(used by: standing-hip-extension, calf-raise)_
- `stand-hip-ext-right` — side · as stand-hold-chair, right leg straight extended back ~20° (hipR -20°), left knee soft ~5°, trunk slightly forward ~5°. Band from right ankle to door (low, in front). _(used by: standing-hip-extension)_
- `sit-leg-forward` — side · seated on chair, left leg forward almost straight (kneeL ~20°, hipL ~85°), heel near floor, right knee 90°. Band from left heel to door (low, in front). _(used by: seated-hamstring-curl)_
- `sit-knee-60` — side · as sit-leg-forward but left knee flexed ~60°. _(used by: seated-hamstring-curl)_
- `lying-heels-chair-down` — side · supine on mat (head left), heels on chair seat to the right: thighs angled up (hip ~120°), knees ~25° flexed, arms along body. Props mat + chair. _(used by: hamstring-bridge-chair)_
- `lying-heels-chair-up` — side · as lying-heels-chair-down, pelvis lifted so shoulders–hip–heels form a straight line (trunk ~-70°), knees ~20°. _(used by: hamstring-bridge-chair)_
- `stand-calf-raise` — side · as stand-hold-chair but on tiptoes (root raised ~6 px; legs straight). _(used by: calf-raise)_
- `stand-single-left` — side · standing on left leg (kneeL ~5°), right thigh lifted (hipR ~30°, kneeR ~60°), arms slightly forward/out for balance (shoulder ~25°). Chair nearby. _(used by: single-leg-stance)_
- `stand-single-tap` — side · standing on left leg with knee ~15°, right leg reaching straight forward to tap floor (hipR ~30°, kneeR 0°), arms out for balance. _(used by: single-leg-stance)_
- `sit-row-start` — side · seated upright on chair facing right toward door, both arms straight forward at chest height (shoulder ~85°, elbow 0°). Band from hands to door. _(used by: seated-row)_
- `sit-row-end` — side · seated, elbows pulled back beside trunk (shoulder ~-25°, elbow ~100°), chest up. Band to door. _(used by: seated-row)_
- `prone-arms-y` — side · prone on mat (trunk 90°, head right), legs straight, arms reaching overhead in Y and lifted slightly off floor (shoulder ~165°, elbow 0°). _(used by: prone-ytw)_
- `prone-arms-t` — side · prone, arms out to the sides (approximate in side view: shoulder ~90° pointing down/out, slightly lifted), elbows straight. _(used by: prone-ytw)_
- `prone-arms-w` — side · prone, elbows bent ~90° beside body (shoulder ~45°, elbow ~90°), slightly lifted. _(used by: prone-ytw)_
- `stand-wall-slide-low` — side · standing facing wall (wall right, close), forearms on wall: shoulders ~90°, elbows ~90° with forearms vertical. Loop around wrists. _(used by: wall-slide)_
- `stand-wall-slide-high` — side · as stand-wall-slide-low but arms slid up into Y: shoulder ~160°, elbow ~20°. _(used by: wall-slide)_
- `stand-arm-forward-bent` — side · split stance with soft knees (hipL ~10°, hipR ~-10°), right arm forward at shoulder height with elbow ~45° bent (shoulderR 85°), left arm relaxed. Band from right hand to anchor behind (back to door). _(used by: serratus-punch)_
- `stand-arm-forward-reach` — side · as stand-arm-forward-bent with right arm fully extended forward (shoulderR 90°, elbowR 0°), slight forward reach of trunk ~5°. _(used by: serratus-punch)_
- `front-er-neutral` — front · standing, right upper arm at side (shoulderR ~5°), elbow 90° with forearm across the belly (towel between elbow and trunk). Band from right hand to door at elbow height on the figure's left side. _(used by: er-towel)_
- `front-er-out` — front · as front-er-neutral but forearm rotated outward (forearm pointing out to the right side; approximate with elbow 90°, forearm horizontal outward). _(used by: er-towel)_
- `front-er9090-start` — front · right arm abducted 90° (shoulderR 90°), elbow 90° with forearm pointing forward (appears foreshortened / horizontal), left arm relaxed. _(used by: er-90-90)_
- `front-er9090-end` — front · right arm abducted 90°, elbow 90°, forearm vertical pointing up ("goal post"). _(used by: er-90-90)_
- `sidelying-er-down` — side-lying on left side, head supported, top (right) elbow 90° against body with forearm resting across belly; pillow between knees, knees slightly bent. _(used by: sidelying-er)_
- `sidelying-er-up` — as sidelying-er-down, forearm rotated up toward ceiling (~70°), elbow stays at trunk. _(used by: sidelying-er)_
- `stand-facepull-start` — side · standing facing right (door), arms straight forward-up (shoulder ~115°, elbow 0°). Band to door above head height. _(used by: face-pull)_
- `stand-facepull-end` — side · elbows high and back (shoulder ~85°, elbow ~130°), hands beside ears. _(used by: face-pull)_
- `sit-arms-overhead` — side · seated on chair, arms straight overhead slightly forward (shoulder ~165°, elbow ~10°). Band to top of door. _(used by: lat-pulldown)_
- `sit-pulldown-end` — side · seated, elbows pulled down to ribs (shoulder ~25°, elbow ~130°), chest up. _(used by: lat-pulldown)_
- `stand-arms-forward-high` — side · standing upright, knees soft ~10°, arms straight forward-up at eye level (shoulder ~120°, elbow ~5°). Band to top of door. _(used by: straight-arm-pulldown)_
- `stand-arms-down` — side · standing upright, knees soft ~10°, straight arms pulled down beside thighs (shoulder ~-5°, elbow ~5°). _(used by: straight-arm-pulldown)_
- `front-draw-start` — front · archery stance (feet hip-width), left (bow) arm abducted 90° straight; right (draw) hand reaching across chest to the left hand (shoulderR ~90° flexion appearance, elbow ~10°). Band between hands. _(used by: single-arm-high-row, band-draw-hold, mirror-draw, endurance-series)_
- `front-draw-anchor` — front · full draw: left arm abducted 90° straight, right elbow at shoulder height pulled back (shoulderR ~90° abduction, elbow ~150°), hand at jaw/chin. _(used by: single-arm-high-row, band-draw-hold, mirror-draw, expansion-drill, push-pull-iso, endurance-series)_
- `stand-arm-push-wall` — side · standing in front of wall (wall right), right arm straight forward at shoulder height (shoulder 90°, elbow 0°), palm touching wall; other arm relaxed. Use mirror when showing left. _(used by: bow-arm-push)_
- `stand-pallof-in` — side · standing feet hip-width, knees soft ~10°, hands together at sternum (shoulder ~20°, elbow ~110°). Band to door at chest height (sideways). _(used by: pallof-press)_
- `stand-pallof-out` — side · as stand-pallof-in with arms pressed straight forward (shoulder 90°, elbow 0°). _(used by: pallof-press)_
- `lying-deadbug-start` — side · supine (head left, toward door), feet flat (hips ~135°, knees ~90°), both arms straight up toward ceiling. Band from hands to door behind head (low). _(used by: dead-bug)_
- `lying-deadbug-reach` — side · as lying-deadbug-start, left leg slid out straight on floor (hipL 90°, kneeL 0°), arms still up. _(used by: dead-bug)_
- `front-side-plank-wall` — front · leaning sideways onto the right forearm against a wall at shoulder height, body a straight diagonal (~20° lean), feet together one step away from wall, left arm on hip. Prop wall. _(used by: side-plank-elevated)_
- `sit-hands-head` — side · seated upright on chair with low backrest, hands behind head (shoulder ~150°, elbow ~150°), elbows forward. _(used by: thoracic-extension-chair)_
- `sit-thoracic-ext` — side · as sit-hands-head with upper back extended over backrest (trunk ~-20°), gaze up. _(used by: thoracic-extension-chair)_
- `front-draw-expand` — front · as front-draw-anchor with right elbow a little further back/around (elbow ~160°), shoulders slightly more open – the expansion/follow-through. _(used by: expansion-drill)_
- `stand-doorway-stretch` — side · standing in doorway, right upper arm abducted/back at shoulder height with elbow 90° on frame behind (shoulder ~-30°, elbow ~90°), small step forward (hipL ~15°), trunk forward ~5°. Prop door. _(used by: doorway-pec-stretch)_
- `sit-hamstring-stretch` — side · on front edge of chair, left leg straight forward with heel on floor (hipL ~70°, kneeL ~5°), right knee 90°, trunk hinged forward ~30° with straight back, hands on right thigh. _(used by: hamstring-stretch-seated)_
- `stand-calf-stretch` — side · facing wall (wall right), hands on wall at shoulder height, right leg forward with knee ~20°, left leg straight back (hipL ~-20°), trunk leaning forward ~15°. _(used by: calf-stretch-wall)_

Total: 74 missing poses.
