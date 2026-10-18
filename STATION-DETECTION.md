# Station detection

The cook screen needs to know which station the phone is pointed at —
cutting board, mixing bowl or pan — so it can say so in the feedback window.

There are three ways it can tell, and they are tried in that order.

| | Trained pictures | Printed markers | Colour fallback |
|---|---|---|---|
| Reliability | Good, lighting and clutter matter | Near perfect, any lighting | Rough; one bright lamp can fool it |
| Setup | ~30 min of photos and training | Print and tape | **None** |
| Demo feel | Point at the real pan | Paper squares on the counter | Point at the real pan |
| Status | Add the model to switch on | Print to switch on | **Working now** |

A trained model outranks everything, because it knows this kitchen. A marker
actually in shot comes next. Colour only gets a say when no model is
installed, so it is what runs out of the box with nothing set up.

---

## 1. Printed markers (already working)

Open **/markers** on the deployed site and print it.

- Print at 100% scale, no "fit to page"
- Each marker should measure about 8cm across
- Tape it flat *beside* each station, not on it, so food never covers it
- Keep the white border; the detector finds the marker by its edges

The markers are ArUco codes from the `ARUCO_MIP_36h12` dictionary — the same
family AR.js uses for its barcode markers. Marker 1 is the cutting board,
2 the mixing bowl, 3 the pan.

Full AR.js was deliberately not used: it takes over the DOM and creates its
own video element, which would break the Figma-traced layout. `js-aruco2`
reads the same markers off an offscreen canvas and touches nothing.

---

## 2. Trained pictures (Teachable Machine)

### Capture

Go to **https://teachablemachine.withgoogle.com** → New Project → **Image Project**
→ Standard image model.

Make **four** classes, named exactly:

| Class name | What to photograph |
|---|---|
| `cutting board` | Your board on the counter |
| `mixing bowl` | Your bowl |
| `pan` | Your pan, on and off the hob |
| `nothing` | The empty counter, the floor, the wall, your hands |

That fourth class matters more than it looks. Without it the model has to
answer "board, bowl or pan" even when pointed at a wall, and it will pick one.

For each of the three real classes, hold the phone the way you would while
cooking and capture **about 30–50 images**, varying:

- angle (straight down, from the side, at arm's length)
- distance (close enough to fill the frame, far enough to see the counter)
- lighting (overhead light on, off, daylight)
- what else is on the counter (empty, mid-prep, cluttered)

Shoot in the kitchen you will demo in. A model trained in that kitchen will
beat a general-purpose one every time.

### Train and export

1. Click **Train Model** and leave the tab open while it runs
2. Test it live in the preview panel — point at each station and check it
3. **Export Model** → **TensorFlow.js** → **Download my model**

You get a zip with `model.json`, `metadata.json` and one or more `.bin` files.

### Install

Unzip all of it into `public/model/` so it looks like:

```
public/model/model.json
public/model/metadata.json
public/model/weights.bin
```

Commit, push, and it switches on by itself. The app probes for
`/model/model.json` on load; if it is not there it stays on markers.

---

## How the hybrid decides

Per frame, four times a second:

1. Classify the frame. A class must score **0.85 or higher** to count.
2. It must then win **3 frames in a row** before the app acts on it, so a
   hand sweeping past the pan does not flip the station.
3. If the model is confident, use it.
4. Otherwise fall back to whether the station's marker is visible.
5. A marker stays "seen" for 8 missed frames, so briefly covering it with a
   hand does not drop the station mid-step.

Class names are matched loosely — anything containing "board", "bowl", or
"pan"/"skillet" maps to that station. So `cutting board` and `Cutting Board`
both work, but `chopping surface` would not.

### If it misreads on the day

Delete `public/model/` and redeploy. The markers take over immediately.

---

## 3. Colour fallback (on by default)

With nothing printed and no model trained, the app counts how many pixels in
the middle half of the frame look a certain way. Measured from real frames of
this kitchen:

| Station | yellow fraction | dark fraction | what gives it away |
|---|---|---|---|
| cutting board | 0.00 | 0.06 | pale wood, nothing dark or yellow |
| pan | 0.00 | 0.46 | the dark pan and the black grates |
| mixing bowl | 0.62 | 0.05 | beaten egg fills the middle |

Thresholds live in `lib/stationColour.ts`: `YELLOW_FRACTION = 0.15` and
`DARK_FRACTION = 0.25`, both sitting in the wide gaps above. Four frames have
to agree before the station changes.

### Why fractions and not averages

The first version averaged the colour of the frame and asked whether the mean
was saturated enough. It failed on a real frame that was 64% beaten egg: the
white bowl and the pale counter around it dragged the mean saturation below
the threshold, so the bowl was never recognised. Counting how many pixels are
egg-yellow does not have that problem.

Note the camera frame is wider than what you see. The video is `object-cover`,
so the phone crops the sides away; the sampling window is deliberately the
middle half rather than the whole frame for that reason.

**This is a stopgap, not a classifier.** It keys on how these three things
happen to photograph in this kitchen's light. Demo somewhere much brighter and
the pan can cross the `DARK` threshold and start reading as the board; tune the
two constants if so. Train a model before it matters.
