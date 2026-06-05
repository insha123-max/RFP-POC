"use strict";

/* ── State ──────────────────────────────────────────────────────────────── */
let currentReport = null;
let pendingOverrides = [];   // [{category, criterion, new_marks, reason}]

/* ── Element refs ───────────────────────────────────────────────────────── */
const rfpInput    = document.getElementById("rfp-input");
const bidInput    = document.getElementById("bid-input");
const rfpZone     = document.getElementById("rfp-zone");
const bidZone     = document.getElementById("bid-zone");
const rfpName     = document.getElementById("rfp-name");
const bidName     = document.getElementById("bid-name");
const evaluateBtn = document.getElementById("evaluate-btn");

/* ── File handling ──────────────────────────────────────────────────────── */
function attachFileInput(input, zone, nameEl) {
  input.addEventListener("change", () => {
    if (input.files[0]) setFileSelected(zone, nameEl, input.files[0].name);
  });

  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    setFileSelected(zone, nameEl, file.name);
  });

  zone.addEventListener("click", e => {
    if (!e.target.classList.contains("upload-btn")) input.click();
  });
}

function setFileSelected(zone, nameEl, name) {
  zone.classList.add("has-file");
  nameEl.textContent = "✓ " + name;
  checkReady();
}

function checkReady() {
  evaluateBtn.disabled = !(rfpInput.files[0] && bidInput.files[0]);
}

attachFileInput(rfpInput, rfpZone, rfpName);
attachFileInput(bidInput, bidZone, bidName);

/* ── Pipeline step helpers ──────────────────────────────────────────────── */
function setStep(n, state) {
  const el  = document.getElementById("step-" + n);
  if (!el) return;
  el.classList.remove("active", "done");
  if (state !== "pending") el.classList.add(state);

  const badge = el.querySelector(".pipe-badge");
  badge.className = "pipe-badge " + state;
  badge.textContent = state === "active" ? "Running…" : state === "done" ? "✓ Done" : "Pending";
}

function allStepsDone() {
  for (let i = 1; i <= 6; i++) setStep(i, "done");
}

/* ── Evaluation ─────────────────────────────────────────────────────────── */
evaluateBtn.addEventListener("click", runEvaluation);

async function runEvaluation() {
  const rfpFile = rfpInput.files[0];
  const bidFile = bidInput.files[0];
  if (!rfpFile || !bidFile) return;

  // Show progress, hide results
  show("progress-section");
  hide("results-section");
  evaluateBtn.disabled = true;

  // Approximate step timing (each Claude call takes ~5–15 s)
  const timers = [
    setTimeout(() => setStep(1, "active"), 0),
    setTimeout(() => setStep(1, "done"),   900),
    setTimeout(() => setStep(2, "active"), 1000),
    setTimeout(() => setStep(2, "done"),   12000),
    setTimeout(() => setStep(3, "active"), 12500),
    setTimeout(() => setStep(3, "done"),   30000),
    setTimeout(() => setStep(4, "active"), 30500),
    setTimeout(() => setStep(4, "done"),   38000),
    setTimeout(() => setStep(5, "active"), 38500),
    setTimeout(() => setStep(5, "done"),   50000),
    setTimeout(() => setStep(6, "active"), 50500),
  ];

  const formData = new FormData();
  formData.append("rfp_file", rfpFile);
  formData.append("bid_file",  bidFile);

  try {
    const res = await fetch("/api/evaluate", { method: "POST", body: formData });

    timers.forEach(clearTimeout);
    allStepsDone();

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const msg = err.detail || "Evaluation failed.";
      if (msg.startsWith("NO_RULES_FOUND")) {
        alert(
          "No scoring rules were found in the RFP document.\n\n" +
          "Please upload an RFP that contains an explicit evaluation criteria table " +
          "or scoring matrix (e.g., “Technical Score: 70 marks”)."
        );
      } else {
        alert("Error: " + msg);
      }
      resetUI();
      return;
    }

    currentReport = await res.json();

    await pause(400);   // let "Done" badges render
    hide("progress-section");
    renderReport(currentReport);
    show("results-section");
    document.getElementById("results-section").scrollIntoView({ behavior: "smooth" });

  } catch (e) {
    timers.forEach(clearTimeout);
    alert("Network error: " + e.message);
    resetUI();
  }
}

function resetUI() {
  evaluateBtn.disabled = false;
  hide("progress-section");
  for (let i = 1; i <= 6; i++) setStep(i, "pending");
}

/* ── Report rendering ───────────────────────────────────────────────────── */
function renderReport(report) {
  renderVerdict(report);
  renderSummary(report);
  renderDisqualification(report);
  renderCategories(report);
  renderDisqualifierChecks(report);
  renderCriteriaAccordion(report);
  renderRisks(report);
  populateOverrideDropdowns(report);
}

/* Verdict banner */
function renderVerdict(r) {
  const banner = document.getElementById("verdict-banner");
  if (!banner) return;
  banner.className = "verdict-banner " + (r.passed ? "passed" : "failed");

  const pct = r.max_score ? Math.round((r.total_score / r.max_score) * 100) : 0;

  animateCount("v-score", 0, r.total_score, 1200);
  setText("v-max-ring",  " / " + r.max_score);
  setText("v-label",     r.passed ? "✓ PASSED" : "✗ FAILED");
  setText("v-threshold", "Threshold: " + r.threshold + " / " + r.max_score);

  // Score ring animation
  const circumference = 327;
  const fill = document.getElementById("ring-fill");
  if (fill) {
    setTimeout(() => {
      fill.style.strokeDashoffset = circumference - (pct / 100) * circumference;
    }, 200);
  }

  // Verdict meta tags
  const meta = el("verdict-meta");
  if (meta) {
    const tags = [
      r.disqualified ? "Disqualified" : null,
      r.max_score ? pct + "% achieved" : null,
      r.category_results.length + " categories evaluated",
    ].filter(Boolean);
    meta.innerHTML = tags.map(t => `<span class="verdict-tag">${esc(t)}</span>`).join("");
  }
}

function animateCount(id, from, to, duration) {
  const el2 = el(id);
  if (!el2) return;
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el2.textContent = (from + (to - from) * ease).toFixed(1);
    if (progress < 1) requestAnimationFrame(update);
    else el2.textContent = to;
  };
  requestAnimationFrame(update);
}

/* Executive summary */
function renderSummary(r) {
  setText("exec-summary", r.executive_summary || "");
}

/* Disqualification alert */
function renderDisqualification(r) {
  const card = document.getElementById("disq-alert");
  if (!card) return;
  if (r.disqualified && r.disqualification_reason) {
    setText("disq-reason", "This bid was automatically disqualified because: " + r.disqualification_reason);
    card.classList.remove("hidden");
  } else {
    card.classList.add("hidden");
  }
}

/* Score cards */
function renderScoreCards(r) {
  const container = el("score-cards");
  if (!container) return;
  const overallPct = r.max_score ? ((r.total_score / r.max_score) * 100).toFixed(1) : "0.0";
  const passedCats = r.category_results.filter(c => c.passed).length;
  const cards = [
    { label: "Total Score", value: r.total_score + " / " + r.max_score, sub: overallPct + "% achieved", pct: parseFloat(overallPct) },
    { label: "Threshold", value: r.threshold + " / " + r.max_score, sub: "Minimum required", pct: r.max_score ? (r.threshold / r.max_score * 100) : 0 },
    { label: "Categories Passed", value: passedCats + " / " + r.category_results.length, sub: "Scoring categories", pct: r.category_results.length ? passedCats / r.category_results.length * 100 : 0 },
    { label: "Eligibility Checks", value: r.disqualifier_checks.filter(d => d.met).length + " / " + r.disqualifier_checks.length, sub: "Requirements met", pct: r.disqualifier_checks.length ? r.disqualifier_checks.filter(d => d.met).length / r.disqualifier_checks.length * 100 : 100 },
  ];
  container.innerHTML = cards.map(c => `
    <div class="score-card">
      <div class="score-card-label">${esc(c.label)}</div>
      <div class="score-card-value">${esc(c.value)}</div>
      <div class="score-card-sub">${esc(c.sub)}</div>
      <div class="score-card-bar"><div class="score-card-bar-fill" style="width:0%" data-pct="${c.pct}"></div></div>
    </div>`).join("");
  setTimeout(() => {
    container.querySelectorAll(".score-card-bar-fill").forEach(b => {
      b.style.width = Math.min(parseFloat(b.dataset.pct), 100) + "%";
    });
  }, 300);
}

/* Category breakdown */
function renderCategories(r) {
  const tbody = el("cat-tbody");
  const tfoot = el("cat-tfoot");
  tbody.innerHTML = "";
  renderScoreCards(r);

  r.category_results.forEach(cat => {
    const minTxt = cat.minimum_required != null ? cat.minimum_required + "%" : badge("nomin", "No Min");
    const pct = cat.percent_achieved || 0;
    const barClass = pct >= 70 ? "success" : pct >= 40 ? "warning" : "danger";
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td><strong>${esc(cat.category)}</strong></td>
        <td><strong>${cat.marks_awarded.toFixed(1)}</strong> <span style="color:var(--muted);font-size:.8rem">/ ${cat.max_marks}</span></td>
        <td>
          <div class="score-bar-wrap">
            <div class="score-bar"><div class="score-bar-fill ${barClass}" style="width:${pct}%"></div></div>
            <span class="score-bar-pct">${pct}%</span>
          </div>
        </td>
        <td>${cat.max_marks}</td>
        <td>${minTxt}</td>
        <td>${badge(cat.passed ? "pass" : "fail", cat.passed ? "✓ Pass" : "✗ Fail")}</td>
      </tr>`);
  });

  const overallPct = r.max_score ? ((r.total_score / r.max_score) * 100).toFixed(1) : "0.0";
  const totalBarClass = parseFloat(overallPct) >= 70 ? "success" : parseFloat(overallPct) >= 40 ? "warning" : "danger";
  tfoot.innerHTML = `
    <tr>
      <td><strong>Total (Weighted)</strong></td>
      <td><strong>${r.total_score}</strong> <span style="color:var(--muted);font-size:.8rem">/ ${r.max_score}</span></td>
      <td>
        <div class="score-bar-wrap">
          <div class="score-bar"><div class="score-bar-fill ${totalBarClass}" style="width:${overallPct}%"></div></div>
          <span class="score-bar-pct">${overallPct}%</span>
        </div>
      </td>
      <td>${r.max_score}</td>
      <td>&ge; ${r.threshold}</td>
      <td>${badge(r.passed ? "pass" : "fail", r.passed ? "✓ PASSED" : "✗ FAILED")}</td>
    </tr>`;
}

/* Mandatory checks */
function renderDisqualifierChecks(r) {
  const card  = document.getElementById("disq-checks-card");
  const tbody = el("disq-tbody");
  tbody.innerHTML = "";

  if (!r.disqualifier_checks || r.disqualifier_checks.length === 0) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  r.disqualifier_checks.forEach(d => {
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${esc(d.condition)}</td>
        <td>${badge(d.met ? "met" : "fail", d.met ? "✓ Met" : "✗ Not Met")}</td>
        <td style="font-size:.82rem">${esc(d.note)}</td>
      </tr>`);
  });
}

/* Criteria accordion (grouped by category) */
function renderCriteriaAccordion(r) {
  const acc = el("criteria-accordion");
  acc.innerHTML = "";

  r.category_results.forEach((cat, ci) => {
    const rowsHtml = cat.criteria.map(c => `
      <tr>
        <td>
          ${esc(c.criterion)}
          ${c.is_mandatory ? badge("mand", "Mandatory") : ""}
        </td>
        <td>${c.max_marks}</td>
        <td>${c.marks_awarded.toFixed(1)}</td>
        <td>${badge(statusClass(c.compliance_status), c.compliance_status)}</td>
        <td style="font-size:.8rem;max-width:260px">${esc(c.vendor_claim)}</td>
        <td style="font-size:.8rem">${esc(c.source_reference)}</td>
        <td>${badge(confClass(c.confidence), c.confidence)}</td>
      </tr>`).join("");

    acc.insertAdjacentHTML("beforeend", `
      <div class="acc-item">
        <div class="acc-header" onclick="toggleAcc(this)">
          <div class="acc-title">
            ${esc(cat.category)}
            ${badge(cat.passed ? "pass" : "fail", cat.marks_awarded.toFixed(1) + " / " + cat.max_marks)}
          </div>
          <span class="acc-arrow" id="arrow-${ci}">▼</span>
        </div>
        <div class="acc-body" id="body-${ci}">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Criterion</th><th>Max</th><th>Awarded</th>
                  <th>Status</th><th>Vendor Evidence</th>
                  <th>Source</th><th>Confidence</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>`);
  });
}

function toggleAcc(header) {
  const body  = header.nextElementSibling;
  const arrow = header.querySelector(".acc-arrow");
  body.classList.toggle("open");
  arrow.classList.toggle("open");
}

/* Gap / risk analysis */
function renderRisks(r) {
  const container = el("risk-list");
  if (!container) return;
  container.innerHTML = "";

  if (!r.risk_items || r.risk_items.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--muted);padding:2rem;font-size:.9rem">No significant risks identified.</div>`;
    return;
  }
  r.risk_items.forEach(risk => {
    const sev = (risk.severity || "low").toLowerCase();
    container.insertAdjacentHTML("beforeend", `
      <div class="risk-item ${sev}">
        <div class="risk-dot"></div>
        <div class="risk-content">
          <div class="risk-title">
            ${esc(risk.risk_area)}
            ${badge(sev, risk.severity)}
          </div>
          <div class="risk-desc">${esc(risk.description)}</div>
        </div>
      </div>`);
  });
}

/* Override dropdowns */
function populateOverrideDropdowns(r) {
  const catSel = el("ov-category");
  catSel.innerHTML = '<option value="">— Select Category —</option>';
  r.category_results.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.category;
    opt.textContent = cat.category;
    catSel.appendChild(opt);
  });
  el("ov-criterion").innerHTML = '<option value="">— Select Criterion —</option>';
}

el("ov-category").addEventListener("change", () => {
  const catName = el("ov-category").value;
  const critSel = el("ov-criterion");
  critSel.innerHTML = '<option value="">— Select Criterion —</option>';
  if (!catName || !currentReport) return;
  const cat = currentReport.category_results.find(c => c.category === catName);
  if (!cat) return;
  cat.criteria.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.criterion;
    opt.dataset.max = c.max_marks;
    opt.textContent = c.criterion + " (max: " + c.max_marks + ")";
    critSel.appendChild(opt);
  });
});

el("ov-add-btn").addEventListener("click", () => {
  const category  = el("ov-category").value;
  const criterion = el("ov-criterion").value;
  const marks     = parseFloat(el("ov-marks").value);
  const reason    = el("ov-reason").value.trim();

  if (!category || !criterion || isNaN(marks) || marks < 0) {
    alert("Please select a category, criterion, and enter a valid mark value.");
    return;
  }

  const opt = el("ov-criterion").querySelector(`option[value="${criterion}"]`);
  const maxMarks = opt ? parseFloat(opt.dataset.max) : Infinity;
  if (marks > maxMarks) {
    alert("New marks (" + marks + ") exceed maximum (" + maxMarks + ") for this criterion.");
    return;
  }

  const idx = pendingOverrides.length;
  pendingOverrides.push({ category, criterion, new_marks: marks, reason });

  el("ov-tags").insertAdjacentHTML("beforeend", `
    <span class="ov-tag" data-idx="${idx}">
      ${esc(criterion)}: ${marks} marks
      <span class="rm" onclick="removeOverride(${idx})">&times;</span>
    </span>`);

  el("ov-marks").value  = "";
  el("ov-reason").value = "";
});

window.removeOverride = function(idx) {
  pendingOverrides[idx] = null;
  document.querySelectorAll(`.ov-tag[data-idx="${idx}"]`).forEach(t => t.remove());
};

el("ov-apply-btn").addEventListener("click", async () => {
  const active = pendingOverrides.filter(Boolean);
  if (!active.length) { alert("No overrides to apply."); return; }

  try {
    const res = await fetch("/api/override", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ report: currentReport, overrides: active }),
    });
    if (!res.ok) throw new Error(await res.text());
    currentReport = await res.json();
    pendingOverrides = [];
    el("ov-tags").innerHTML = "";
    renderReport(currentReport);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    alert("Override failed: " + e.message);
  }
});

/* New evaluation */
el("new-eval-btn").addEventListener("click", () => {
  currentReport    = null;
  pendingOverrides = [];

  rfpInput.value = "";
  bidInput.value = "";
  rfpName.textContent = "";
  bidName.textContent = "";
  rfpZone.classList.remove("has-file");
  bidZone.classList.remove("has-file");
  evaluateBtn.disabled = true;

  for (let i = 1; i <= 6; i++) setStep(i, "pending");
  hide("results-section");
  hide("progress-section");
  document.getElementById("upload-section").scrollIntoView({ behavior: "smooth" });
});

/* ── Helpers ────────────────────────────────────────────────────────────── */
function el(id)             { return document.getElementById(id); }
function show(id)           { const e = el(id); if (e) e.classList.remove("hidden"); }
function hide(id)           { const e = el(id); if (e) e.classList.add("hidden"); }
function setText(id, val)   { const e = el(id); if (e) e.textContent = val; }
function pause(ms)          { return new Promise(r => setTimeout(r, ms)); }
function esc(s)             { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function badge(cls, label)  { return `<span class="badge badge-${cls}">${esc(label)}</span>`; }

function statusClass(s) {
  if (s === "Met")     return "met";
  if (s === "Partial") return "partial";
  return "notmet";
}
function confClass(c) {
  if (c === "High")   return "pass";
  if (c === "Medium") return "medium";
  return "fail";
}

window.toggleAcc = toggleAcc;
