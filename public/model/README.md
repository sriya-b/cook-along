# Teachable Machine model goes here

Unzip the **TensorFlow.js** export from teachablemachine.withgoogle.com into
this folder, so it ends up as:

    public/model/model.json
    public/model/metadata.json
    public/model/weights.bin

The cook screen probes for `/model/model.json` when it opens. If the file is
here it classifies camera frames to work out which station you are pointed at;
if it is not, it falls back to the printed markers from `/markers`.

Class names must contain `board`, `bowl` or `pan` to map to a station. Add a
fourth `nothing` class for the empty counter, or the model will be forced to
answer "board, bowl or pan" when pointed at a wall.

See `STATION-DETECTION.md` in the repo root for the full walkthrough.

Delete this folder's model files to fall back to markers.
