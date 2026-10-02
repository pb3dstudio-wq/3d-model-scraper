# 3D Model Grabber

Paste a web page URL and get the 3D model files (GLB, glTF, FBX, OBJ, STL, USDZ, PLY …) its viewers load, as a zip.
The scanning runs on GitHub Actions in a real headless Chrome, so nothing needs installing or running on your PC.

## One-time setup (≈5 min)
1. Create a new repository on GitHub (Private is fine), e.g. `model-grabber`.
2. Upload everything in this folder (keep the `.github/workflows` and `scripts` folders), commit to **main**.
3. **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)` → Save.
   Your page will be at `https://<username>.github.io/model-grabber/`.
   (Private repos need a paid plan for Pages. If unavailable, just use Option B below.)
4. Create a token: **Profile → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate**
   - Repository access: *Only select repositories* → this repo
   - Permissions → Repository → **Actions: Read and write**
   - Expiry: your choice (shorter is safer)

## Option A – use the web page
1. Open your Pages URL, expand **GitHub settings**, enter `username/model-grabber` + the token, **Save**.
2. Paste a product URL → **Run on GitHub**.
3. After ~1–2 minutes you get a **Download models.zip** link and a link to the list of files found.

## Option B – straight from GitHub (no token needed)
**Actions → Grab 3D models → Run workflow** → paste the URL → Run.
When it finishes, open the run: the summary lists the models, and the **models** artifact at the bottom is the zip.

## Notes
- Zips are kept for 7 days. `models.txt` inside lists every URL found and where it came from.
- If a viewer only loads after a click, raise *wait_seconds* or use the in-page "Grab 3D models" bookmark.
- Only download models you're entitled to use.
