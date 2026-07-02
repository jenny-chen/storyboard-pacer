// Storyboard Pacer — Tauri desktop frontend.
// Uses the global Tauri API (withGlobalTauri: true) so the frontend needs no
// bundler. Native folder/save dialogs give us real absolute paths, so unlike
// the browser version there is no "paste the folder path" step.
(function () {
  const T = window.__TAURI__
  const invoke = T.core.invoke
  const convertFileSrc = T.core.convertFileSrc
  const dialog = T.dialog

  const state = {
    frames: [], // { name, path, url, duration }
    folder: "",
    fps: 24,
    width: 1920,
    height: 1080,
    recIndex: 0,
    recording: false,
    frameStartTime: 0,
    rafId: null,
  }

  const $ = id => document.getElementById(id)
  const stageLabel = $("stageLabel")

  function naturalCompare(a, b) {
    const ax = []
    const bx = []
    a.replace(/(\d+)|(\D+)/g, (m, $1, $2) => {
      ax.push([$1 || Infinity, $2 || ""])
    })
    b.replace(/(\d+)|(\D+)/g, (m, $1, $2) => {
      bx.push([$1 || Infinity, $2 || ""])
    })
    while (ax.length && bx.length) {
      const an = ax.shift()
      const bn = bx.shift()
      const nn = an[0] - bn[0] || an[1].localeCompare(bn[1])
      if (nn) return nn
    }
    return ax.length - bx.length
  }

  // ---------- STEP 1: LOAD (native folder picker) ----------
  $("dropzone").addEventListener("click", pickFolder)

  async function pickFolder() {
    let dir
    try {
      dir = await dialog.open({
        directory: true,
        multiple: false,
        title: "Choose your storyboard frames folder",
      })
    } catch (e) {
      alert("Could not open the folder picker: " + e)
      return
    }
    if (!dir) return // cancelled

    let files
    try {
      files = await invoke("list_frames", { dir })
    } catch (e) {
      alert("Could not read that folder: " + e)
      return
    }
    if (!files.length) {
      alert("No image files (PNG / JPG / etc.) found in that folder.")
      return
    }

    files.sort((a, b) => naturalCompare(a.name, b.name))
    state.folder = dir
    state.frames = files.map(f => ({
      name: f.name,
      path: f.path,
      url: convertFileSrc(f.path),
      duration: 1.0,
    }))
    $("folderNote").innerHTML =
      "Loaded <b>" + state.frames.length + "</b> frames from " + escHtml(dir)
    renderFilmstrip()
    $("btnGoRecord").disabled = state.frames.length === 0
  }

  function escHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      c =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]
    )
  }

  function renderFilmstrip() {
    const wrap = $("filmstripWrap")
    const strip = $("filmstrip")
    strip.innerHTML = ""
    if (state.frames.length === 0) {
      wrap.classList.add("hidden")
      return
    }
    wrap.classList.remove("hidden")
    state.frames.forEach((fr, i) => {
      const chip = document.createElement("div")
      chip.className = "frame-chip"
      chip.draggable = true
      chip.dataset.idx = i
      chip.innerHTML =
        '<div class="idx">' +
        (i + 1) +
        '</div><img src="' +
        fr.url +
        '"><div class="sprockets">' +
        "<i></i>".repeat(8) +
        '</div><div class="fname">' +
        escHtml(fr.name) +
        "</div>"
      chip.addEventListener("dragstart", e => {
        chip.classList.add("dragging")
        e.dataTransfer.setData("text/plain", i)
      })
      chip.addEventListener("dragend", () => chip.classList.remove("dragging"))
      chip.addEventListener("dragover", e => e.preventDefault())
      chip.addEventListener("drop", e => {
        e.preventDefault()
        const from = parseInt(e.dataTransfer.getData("text/plain"), 10)
        const to = parseInt(chip.dataset.idx, 10)
        if (from === to) return
        const moved = state.frames.splice(from, 1)[0]
        state.frames.splice(to, 0, moved)
        renderFilmstrip()
      })
      strip.appendChild(chip)
    })
  }

  $("btnGoRecord").addEventListener("click", () => {
    state.fps = parseFloat($("fpsInput").value) || 24
    state.width = parseInt($("widthInput").value, 10) || 1920
    state.height = parseInt($("heightInput").value, 10) || 1080
    goToRecord()
  })

  // ---------- STEP 2: RECORD ----------
  const dialFill = $("dialFill")
  const DIAL_CIRC = 238.76
  const PACE_REF_SECONDS = 4

  function goToRecord() {
    show("panelRecord")
    stageLabel.textContent = "02 / RECORD PACING"
    state.recIndex = 0
    state.recording = false
    $("recTotal").textContent = state.frames.length
    $("recBadge").classList.add("hidden")
    $("btnStart").classList.remove("hidden")
    $("btnNext").classList.add("hidden")
    $("btnFinish").classList.add("hidden")
    $("keyHint").innerHTML = "Press <kbd>Space</kbd> or <kbd>→</kbd> to start"
    showRecordFrame(0)
  }

  function showRecordFrame(i) {
    const fr = state.frames[i]
    $("recordImg").src = fr.url
    $("recIdx").textContent = i + 1
    $("recName").textContent = fr.name
    renderQueue()
  }

  // Vertical "up next" queue: current frame at top, then the next few.
  function renderQueue() {
    const q = $("frameQueue")
    q.innerHTML = ""
    const start = state.recIndex
    for (let k = 0; k < 4 && start + k < state.frames.length; k++) {
      const idx = start + k
      const fr = state.frames[idx]
      const item = document.createElement("div")
      item.className = "queue-item" + (k === 0 ? " current" : "")
      item.innerHTML =
        (k === 0 ? '<span class="now-tag">Now</span>' : "") +
        '<img src="' +
        fr.url +
        '"><div class="queue-meta"><span>' +
        (idx + 1) +
        '</span><span class="qn">' +
        escHtml(fr.name) +
        "</span></div>"
      q.appendChild(item)
    }
  }

  function startDialLoop() {
    cancelAnimationFrame(state.rafId)
    function tick() {
      if (!state.recording) return
      const elapsed = (performance.now() - state.frameStartTime) / 1000
      $("dialTime").textContent = elapsed.toFixed(1) + "s"
      const frac = (elapsed % PACE_REF_SECONDS) / PACE_REF_SECONDS
      dialFill.style.strokeDashoffset = DIAL_CIRC * (1 - frac)
      state.rafId = requestAnimationFrame(tick)
    }
    tick()
  }

  $("btnStart").addEventListener("click", () => {
    state.recording = true
    state.frameStartTime = performance.now()
    $("recBadge").classList.remove("hidden")
    $("btnStart").classList.add("hidden")
    $("btnNext").classList.remove("hidden")
    $("keyHint").innerHTML =
      "<kbd>Space</kbd> / <kbd>→</kbd> / <kbd>↓</kbd> next frame · <kbd>Backspace</kbd> / <kbd>←</kbd> / <kbd>↑</kbd> back"
    if (state.frames.length === 1) {
      $("btnNext").classList.add("hidden")
      $("btnFinish").classList.remove("hidden")
    }
    startDialLoop()
  })

  function advanceFrame() {
    if (!state.recording) return
    const now = performance.now()
    const elapsed = Math.max(0.04, (now - state.frameStartTime) / 1000)
    state.frames[state.recIndex].duration = elapsed
    state.recIndex++
    if (state.recIndex >= state.frames.length) {
      finishRecording()
      return
    }
    state.frameStartTime = now
    showRecordFrame(state.recIndex)
    if (state.recIndex === state.frames.length - 1) {
      $("btnNext").classList.add("hidden")
      $("btnFinish").classList.remove("hidden")
    }
  }

  function goBackFrame() {
    if (!state.recording || state.recIndex === 0) return
    state.recIndex--
    state.frameStartTime = performance.now()
    showRecordFrame(state.recIndex)
    $("btnFinish").classList.add("hidden")
    $("btnNext").classList.remove("hidden")
  }

  function finishRecording() {
    const now = performance.now()
    const elapsed = Math.max(0.04, (now - state.frameStartTime) / 1000)
    state.frames[state.frames.length - 1].duration = elapsed
    state.recording = false
    cancelAnimationFrame(state.rafId)
    goToReview()
  }

  $("btnNext").addEventListener("click", advanceFrame)
  $("btnFinish").addEventListener("click", finishRecording)
  $("btnBack").addEventListener("click", goBackFrame)

  document.addEventListener("keydown", e => {
    if ($("panelRecord").classList.contains("hidden")) return
    if (e.code === "Space" || e.code === "ArrowRight" || e.code === "ArrowDown") {
      e.preventDefault()
      if (!state.recording) $("btnStart").click()
      else if (state.recIndex === state.frames.length - 1) finishRecording()
      else advanceFrame()
    } else if (
      e.code === "Backspace" ||
      e.code === "ArrowLeft" ||
      e.code === "ArrowUp"
    ) {
      e.preventDefault()
      goBackFrame()
    }
  })

  // ---------- STEP 3: REVIEW ----------
  function fmtTimecode(totalSeconds) {
    const m = Math.floor(totalSeconds / 60)
    const s = (totalSeconds % 60).toFixed(1)
    return m + ":" + s.padStart(4, "0")
  }

  function goToReview() {
    show("panelReview")
    stageLabel.textContent = "03 / REVIEW & EXPORT"
    renderReview()
  }

  function renderReview() {
    const body = $("reviewBody")
    body.innerHTML = ""
    let runningSeconds = 0
    let totalFrames = 0
    state.frames.forEach((fr, i) => {
      const frameCount = Math.max(1, Math.round(fr.duration * state.fps))
      const tr = document.createElement("tr")
      tr.innerHTML =
        '<td class="thumb"><img src="' +
        fr.url +
        '"></td><td class="name">' +
        (i + 1) +
        '</td><td class="name">' +
        escHtml(fr.name) +
        '</td><td class="dur"><input type="number" step="0.1" min="0.1" value="' +
        fr.duration.toFixed(2) +
        '" data-idx="' +
        i +
        '"></td><td class="frames">' +
        frameCount +
        'f</td><td class="tc">' +
        fmtTimecode(runningSeconds) +
        "</td>"
      body.appendChild(tr)
      runningSeconds += frameCount / state.fps
      totalFrames += frameCount
    })
    $("totRuntime").textContent = fmtTimecode(runningSeconds)
    $("totFrames").textContent = totalFrames
    $("totCount").textContent = state.frames.length

    body.querySelectorAll("input[type=number]").forEach(inp => {
      inp.addEventListener("input", e => {
        const idx = parseInt(e.target.dataset.idx, 10)
        const v = parseFloat(e.target.value)
        if (!isNaN(v) && v > 0) {
          state.frames[idx].duration = v
          renderReview()
        }
      })
    })
  }

  $("btnReRecord").addEventListener("click", goToRecord)

  // ---------- XML EXPORT ----------
  function escXml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  }

  function buildXML() {
    const fps = state.fps
    const timebase = Math.round(fps)
    const ntsc = Math.abs(fps - timebase) > 0.001 ? "TRUE" : "FALSE"

    let clipitems = ""
    let startFrame = 0
    let totalFrames = 0

    state.frames.forEach((fr, i) => {
      const dur = Math.max(1, Math.round(fr.duration * fps))
      const endFrame = startFrame + dur
      // fr.path is a real absolute path from the native picker.
      const pathurl = escXml("file://localhost" + encodeURI(fr.path))
      clipitems +=
        '\n          <clipitem id="clipitem-' +
        (i + 1) +
        '">\n            <name>' +
        escXml(fr.name) +
        "</name>\n            <enabled>TRUE</enabled>\n            <duration>" +
        dur +
        "</duration>\n            <rate><timebase>" +
        timebase +
        "</timebase><ntsc>" +
        ntsc +
        "</ntsc></rate>\n            <start>" +
        startFrame +
        "</start>\n            <end>" +
        endFrame +
        "</end>\n            <in>0</in>\n            <out>" +
        dur +
        '</out>\n            <file id="file-' +
        (i + 1) +
        '">\n              <name>' +
        escXml(fr.name) +
        "</name>\n              <pathurl>" +
        pathurl +
        "</pathurl>\n              <rate><timebase>" +
        timebase +
        "</timebase><ntsc>" +
        ntsc +
        "</ntsc></rate>\n              <duration>" +
        dur +
        "</duration>\n              <media>\n                <video>\n                  <samplecharacteristics>\n                    <width>" +
        state.width +
        "</width>\n                    <height>" +
        state.height +
        "</height>\n                  </samplecharacteristics>\n                </video>\n              </media>\n            </file>\n          </clipitem>"
      startFrame = endFrame
      totalFrames = endFrame
    })

    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5">\n  <sequence>\n    <name>Storyboard Animatic</name>\n    <duration>' +
      totalFrames +
      "</duration>\n    <rate><timebase>" +
      timebase +
      "</timebase><ntsc>" +
      ntsc +
      "</ntsc></rate>\n    <media>\n      <video>\n        <format>\n          <samplecharacteristics>\n            <rate><timebase>" +
      timebase +
      "</timebase><ntsc>" +
      ntsc +
      "</ntsc></rate>\n            <width>" +
      state.width +
      "</width>\n            <height>" +
      state.height +
      "</height>\n          </samplecharacteristics>\n        </format>\n        <track>" +
      clipitems +
      "\n        </track>\n      </video>\n    </media>\n  </sequence>\n</xmeml>"
    )
  }

  function joinPath(dir, name) {
    const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/"
    return dir.endsWith(sep) ? dir + name : dir + sep + name
  }

  $("btnExport").addEventListener("click", async () => {
    const xml = buildXML()
    let target
    try {
      target = await dialog.save({
        title: "Save Premiere XML",
        defaultPath: joinPath(state.folder, "storyboard-animatic.xml"),
        filters: [{ name: "Final Cut XML", extensions: ["xml"] }],
      })
    } catch (e) {
      alert("Could not open the save dialog: " + e)
      return
    }
    if (!target) return // cancelled
    try {
      await invoke("save_file", { path: target, contents: xml })
    } catch (e) {
      alert("Could not save the file: " + e)
      return
    }
    const base = target.split(/[\\/]/).pop()
    $("savedName").textContent = base
    goToDone()
  })

  function goToDone() {
    show("panelDone")
    stageLabel.textContent = "04 / IMPORT IN PREMIERE"
  }
  $("btnBackToReview").addEventListener("click", goToReview)
  $("btnStartOver").addEventListener("click", () => {
    state.frames = []
    state.folder = ""
    $("folderNote").textContent = ""
    renderFilmstrip()
    $("btnGoRecord").disabled = true
    show("panelSetup")
    stageLabel.textContent = "01 / LOAD FRAMES"
  })

  function show(panelId) {
    ;["panelSetup", "panelRecord", "panelReview", "panelDone"].forEach(id => {
      $(id).classList.toggle("hidden", id !== panelId)
    })
  }
})()
